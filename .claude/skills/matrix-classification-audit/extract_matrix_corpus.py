#!/usr/bin/env python3
"""Extract the matrix-classification audit corpus from Papers.md + Zotero.

Phase 4 of the Zotero⇄CAAIL lifecycle (after scope → sync → dataset-audit).
This script does the *mechanical* half of a matrix re-audit: it parses every
matrix-participating reference out of `Papers.md` (its id, DOI, title, and the
`(method, area)` cells it currently sits in), finds the paper in the caail /
Benji Zotero group libraries by DOI, and pulls the methods-section text from the
PDF's local full-text cache. It emits `matrix-corpus.json` — one record per
matrix reference — which the adversarial classification Workflow then reasons
over (proposer reads the methods text; skeptics try to refute each placement).

Pre-extracting the full text up front (rather than having each Workflow agent
hit the local API mid-fan-out) keeps the Workflow deterministic and resumable.

Reuses the proven Zotero local-API + ft-cache helpers from the sibling
`zotero-collection-scope/scope.py` — no duplicated API plumbing.

Usage:
    extract_matrix_corpus.py [--papers <PATH>] [--out <PATH>]
                             [--group <ID> ...] [--api <URL>]
                             [--zotero-storage <PATH>]

Defaults:
    --papers          = <repo-root>/Papers.md
    --out             = <repo-root>/matrix-corpus.json
    --group           = 6549203 (caail) then 5178481 (Benji) if none given
    --api             = http://localhost:23119/api
    --zotero-storage  = ~/Zotero/storage

Stdlib-only Python 3 — no pip install, no virtual env.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

# Reuse scope.py's Zotero helpers (same .claude/skills/ parent).
_SCOPE_DIR = Path(__file__).resolve().parents[1] / "zotero-collection-scope"
sys.path.insert(0, str(_SCOPE_DIR))
import scope  # noqa: E402  (_get, _paginate, find_pdf_attachment_key, normalize_item)


# ---------------------------------------------------------------------------
# Papers.md parsing
# ---------------------------------------------------------------------------

# Match a markdown link, allowing one level of nested parens in the URL so
# Wikipedia targets like `..._(machine_learning)` don't truncate the label.
LINK_RE = re.compile(r"\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)")
ANCHOR_REF_RE = re.compile(r"\(#(\d+)\)")
REF_ID_RE = re.compile(r'<a id="(\d+)">\1</a>\s*(.*)')
DOI_RE = re.compile(r"https?://doi\.org/(10\.\S+?)(?:\s|$)", re.IGNORECASE)
# Fallback identifier for DOI-less entries (theses, OpenReview posters, etc.).
URL_RE = re.compile(r"(https?://(?!doi\.org/)\S+)")


def strip_md_links(text):
    """`[GAN](u) / [VAE](v)` -> `GAN / VAE`; `[Media Opt](./x)` -> `Media Opt`."""
    return LINK_RE.sub(r"\1", text).strip()


def parse_matrix(md):
    """Parse the matrix table → (area_labels, {refId: [(method, area), ...]}).

    The matrix is the GFM table between the `# Paper matrix` heading and the
    `## References` heading: a header row of area columns, a separator row, then
    one body row per AI/ML method.
    """
    lines = md.splitlines()
    # Bound the table to before "## References".
    end = next((i for i, ln in enumerate(lines)
                if ln.strip().startswith("## References")), len(lines))
    table = [ln for ln in lines[:end]
             if ln.lstrip().startswith("|") and ln.rstrip().endswith("|")]
    if len(table) < 3:
        sys.exit("ERROR: could not locate the matrix table in Papers.md")

    def cells(row):
        # Drop the leading/trailing empty splits from the bounding pipes.
        return [c.strip() for c in row.strip().strip("|").split("|")]

    header = cells(table[0])
    # header[0] is the empty corner cell; the rest are area columns.
    area_labels = [strip_md_links(c) for c in header[1:]]

    cell_map = {}  # refId -> set of (method, area)
    for row in table[2:]:  # skip header + separator
        cols = cells(row)
        if not cols:
            continue
        method = strip_md_links(cols[0])
        if not method:
            continue
        for ci, cell in enumerate(cols[1:]):
            if ci >= len(area_labels):
                break
            area = area_labels[ci]
            for m in ANCHOR_REF_RE.finditer(cell):
                rid = int(m.group(1))
                cell_map.setdefault(rid, set()).add((method, area))
    return area_labels, cell_map


def parse_references(md):
    """Parse `<a id="N">` reference entries → {id: {doi, title, section}}.

    `section` is the nearest preceding `## ` heading ("References" or
    "Reviews & Perspectives"), so the Workflow can tell primary research from
    review/perspective entries.
    """
    refs = {}
    section = None
    for ln in md.splitlines():
        h = re.match(r"##\s+(.*)", ln)
        if h:
            section = h.group(1).strip()
            continue
        m = REF_ID_RE.search(ln)
        if not m:
            continue
        rid = int(m.group(1))
        rest = m.group(2)
        doi_m = DOI_RE.search(ln)
        doi = doi_m.group(1).rstrip(".") if doi_m else ""
        # DOI-less entries (theses, OpenReview/eScholarship posters) carry a
        # plain URL we can fall back to for the Zotero join.
        url = ""
        if not doi:
            url_m = URL_RE.search(ln)
            url = url_m.group(1).rstrip(".") if url_m else ""
        # Title heuristic: APA citation is "Authors (YEAR). Title. *Journal*…".
        # Grab the span between the first "). " and the next ". " — good enough
        # for a human-readable label; the DOI/URL is the real join key.
        title = ""
        tm = re.search(r"\)\.\s+(.*?)\.\s", rest)
        if tm:
            # Trim italic markers and a trailing "* arXiv"/"[annotation]" tail.
            title = tm.group(1).split("* ")[0].strip().strip("*").strip()
            title = re.split(r"\s+\[", title)[0].strip()
        refs[rid] = {"doi": doi, "url": url, "title": title,
                     "citation": rest.strip(), "section": section}
    return refs


# ---------------------------------------------------------------------------
# Methods-section extraction from the ft-cache
# ---------------------------------------------------------------------------

# Headings that mark the start of a methods/approach section, across the
# journal + CS-paper conventions in this corpus.
METHODS_HEAD_RE = re.compile(
    r"(?m)^\s*(?:\d+\.?\s*)?"
    r"(materials\s+and\s+methods|methods?|methodology|experimental(?:\s+"
    r"procedures?| section)?|model\s+architecture|approach|"
    r"the\s+\w+\s+(?:model|framework|architecture)|our\s+(?:method|approach))"
    r"\b",
    re.IGNORECASE)

METHODS_WINDOW = 12000  # chars of methods-region text to carry inline


def read_docling_section(docling_corpus, rid):
    """Return the Docling-derived methods section for a ref, or None.

    `docling_ingest.py` writes one of these per ref after locating the methods
    section against the paper's real heading structure. Preferred over the
    ft-cache path below whenever it exists, because it has both boundaries: the
    flat-text extractor has only a start and a fixed 12,000-char window, which
    truncates 96% of the refs that have full text and silently absorbs Results
    and Discussion on the rest.

    Absent for any ref the ingest has not reached (it is an opt-in batch job and
    resumable), so callers must handle None -- that is the fallback path, not an
    error.
    """
    if not docling_corpus:
        return None
    path = os.path.join(docling_corpus, "sections", f"ref-{rid}.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            sec = json.load(fh)
    except (OSError, ValueError):
        return None
    text = (sec.get("methods_text") or "").strip()
    # A section barely longer than its own heading is a boundary bug, not a
    # methods section, and preferring it would be strictly worse than the
    # fallback it displaces -- while ALSO labelling it the better evidence.
    # This happened: a weak end heading ("Ethics statement") sitting inside the
    # methods section truncated the span to the heading alone. That rule is
    # fixed in docling_sections, but the check stays, because the failure is
    # silent and the next unanticipated heading convention costs nothing to
    # survive. MIN is deliberately low: it rejects fragments, not short papers.
    MIN_SECTION_CHARS = 400
    if len(text) < MIN_SECTION_CHARS:
        return None
    return sec


def read_ftcache(zotero_storage, pdf_key):
    """Return the full ft-cache text for a PDF attachment key, or ''."""
    if not pdf_key:
        return ""
    path = os.path.join(zotero_storage, pdf_key, ".zotero-ft-cache")
    if not os.path.isfile(path):
        return ""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def methods_start(fulltext):
    """Where the ft-cache methods window begins → (start, matched_a_heading).

    The single definition of the fallback path's start rule. It exists because
    the rule had been copied to three places -- here, the record builder that
    reports `methods_truncated`, and `measure_extraction_quality.py`, whose
    docstring promised it restated nothing. All three were byte-identical, so
    one edit to the floor or the fallback fraction would have left the other two
    describing a rule nothing used, with nothing failing. That is the defect
    CLAUDE.md names as this repo's most expensive recurring bug.

    Returns `(None, False)` for empty text.
    """
    if not fulltext:
        return None, False
    floor = len(fulltext) // 20  # ignore matches in the first 5%
    match = next((m for m in METHODS_HEAD_RE.finditer(fulltext)
                  if m.start() >= floor), None)
    if match:
        return match.start(), True
    # No heading: start ~10% in, past the abstract and intro, so the caller gets
    # substantive body text rather than front matter.
    return len(fulltext) // 10, False


def extract_methods(fulltext):
    """Pull a methods-region excerpt from raw ft-cache text. FALLBACK PATH.

    Used only where `docling-corpus/sections/ref-<id>.json` is absent. Prefer
    `read_docling_section`: this function is structurally unable to do the job
    well, and its limits are measured rather than suspected.

    Strategy: find the earliest methods-like heading past the first 5% of the
    document (skips a "Methods" word in the abstract/TOC) and take a window from
    there. If none is found, fall back to a slice from ~10% in (past the
    abstract/intro) so the agent still gets substantive body text rather than
    front matter.

    Three defects, each measured over the 222 matrix refs that have full text
    (`measure_extraction_quality.py` prints these):

    * **No end boundary.** The window is a fixed character count, so a short
      methods section silently absorbs Results, Discussion and References.
    * **Truncation.** 213 refs (96%) reach the 12,000-char cap and are cut
      mid-section. Note the count that matters is 213, not the 159 that sit at
      exactly 12,000: this function `.strip()`s its return value, so a ref whose
      cut lands next to whitespace ends up at 11,990-11,999 and an `== 12000`
      test misses it.
    * **Start detection fails on back-matter methods.** A paper that puts
      `Online Methods` after Discussion (ref 51 is on page 22 of 34) gets a
      window from 10% in that contains none of the methods at all.
    """
    start, _ = methods_start(fulltext)
    if start is None:
        return ""
    return fulltext[start:start + METHODS_WINDOW].strip()


# ---------------------------------------------------------------------------
# Zotero DOI index (across the requested groups)
# ---------------------------------------------------------------------------

def _norm_url(url):
    """Normalize a URL for fuzzy join: lowercase, drop scheme, fragment, trailing slash.

    The fragment goes because it addresses a position *within* a resource rather
    than a different resource. Zotero records the URL as captured, so saving an
    OpenReview page from a comment anchor stores `…forum?id=X#discussion` while
    `Papers.md` cites `…forum?id=X`, and the join then sees two different items.

    That is not hypothetical: it hid ref 52 for as long as anyone had looked. The
    paper was in the library with a PDF attached and 63,880 characters indexed,
    and every report said it was missing, because `has_fulltext` answers "can the
    matcher reach it" and gets read as "does it exist".
    """
    return _keep_fragment(url).split("#", 1)[0].rstrip("/")


def check_url_join(rid, ref_url, item):
    """Warn when a ref matched an item on a fragment that was carrying identity.

    The dangerous join involves ONE item, so `build_indexes` cannot see it: a ref
    citing `https://site.org` matches an item captured as
    `https://site.org/#/paper/123` and inherits that item's abstract, PDF and
    methods text under a `has_fulltext: true` nobody has reason to doubt.

    But most dropped fragments are ordinary anchors into the same page — Zotero
    captured `…?id=X#discussion` for a paper cited as `…?id=X` — and warning on
    those means warning on every run about the corpus's one confirmed-good pair.
    A warning that is usually noise is a warning nobody reads, which is the same
    reason `_keep_fragment` exists at all; a guard that cries wolf on its own
    motivating example has failed twice over.

    So the test is whether the fragment could be carrying identity:

    - it contains `/`, i.e. it is a hash route rather than an anchor, or
    - stripping it leaves no path at all, so the entire identity was in it.
    """
    item_url = (item.get("data", {}).get("url") or "").strip()
    if not ref_url or not item_url:
        return
    if _keep_fragment(ref_url) == _keep_fragment(item_url):
        return  # differ by scheme/case/slash only: the fragment played no part

    dropped = [u.split("#", 1)[1] for u in (ref_url, item_url) if "#" in u]
    routed = any("/" in frag for frag in dropped)
    pathless = "/" not in _norm_url(item_url)
    if not (routed or pathless):
        return  # a plain anchor into the same page

    print(f"WARNING: ref {rid} joined to a Zotero item only after dropping a URL "
          f"fragment that may carry the paper's identity — confirm it is the same "
          f"paper:\n"
          f"    Papers.md: {ref_url}\n"
          f"    Zotero:    {item_url}", file=sys.stderr)
    # Returned as well as printed so a caller can keep it. On a several-hundred-ref
    # run a printed line scrolls past, and this is the one anomaly the toolchain
    # calls the expensive invisible error -- it should not be the only one with no
    # durable record.
    return f"{ref_url} -> {item_url}"


def _keep_fragment(url):
    """Everything `_norm_url` does EXCEPT dropping the fragment.

    Exists so a key collision can be attributed. Scheme, case and trailing-slash
    merges predate the fragment rule and are intended; a collision that survives
    this normalization is one the fragment rule caused, and only those are worth
    warning about. Without the distinction the warning fires on every `http://`
    vs `https://` pair of the same paper -- three of them in this library today --
    and a warning that is usually noise is a warning nobody reads.
    """
    u = (url or "").strip().lower()
    u = re.sub(r"^https?://", "", u)
    return u.rstrip("/")


def build_indexes(api, groups):
    """Paginate every group's top-level items → DOI and URL indexes.

    Returns (doi_index, url_index), each {key: (group, item)}. Earlier groups
    win, so list caail (6549203) first to prefer its copies.

    Reports when two *Zotero items* collide on one URL key because of the fragment
    rule, since first-wins then silently picks one of them.

    This is only half the exposure and the smaller half. The other half is a
    *reference* joining to an item whose raw URL differs from the one cited: one
    item, no collision, nothing to detect here. `check_url_join` covers that side
    and is called from the resolution loop, where both URLs are in hand.

    Both exist because that direction of error is the expensive one. A missed join
    reports `has_fulltext: false`, someone goes looking for a paper we already
    have, and the waste is visible. A wrong join reports `has_fulltext: true`, a
    placement gets audited against a different paper's methods section, and
    nothing looks broken.
    """
    doi_index, url_index = {}, {}
    url_sources = {}
    collisions = []
    for group in groups:
        items = scope._paginate(f"{api}/groups/{group}/items/top?format=json")
        for it in items:
            data = it.get("data", {})
            if data.get("itemType") in ("attachment", "note"):
                continue
            doi = (data.get("DOI") or "").strip().lower()
            if doi and doi not in doi_index:
                doi_index[doi] = (group, it)
            raw = (data.get("url") or "").strip()
            url = _norm_url(raw)
            if not url:
                continue
            if url not in url_index:
                url_index[url] = (group, it)
                url_sources[url] = raw
            elif _keep_fragment(raw) != _keep_fragment(url_sources[url]):
                # Same key, and they differ by more than scheme, case or a
                # trailing slash -- so it is the FRAGMENT that merged them.
                collisions.append((url, url_sources[url], raw))

    if collisions:
        print(f"WARNING: {len(collisions)} URL key collision(s) caused by fragment "
              f"stripping — a ref joining on one of these may resolve to the wrong "
              f"item:", file=sys.stderr)
        for key, first, other in collisions:
            print(f"  {key}\n    kept: {first}\n    also: {other}", file=sys.stderr)

    return doi_index, url_index


# ---------------------------------------------------------------------------
# The corpus is grounded solely in each paper's own text (title, abstract,
# methods). It carries NO signal derived from the ResearchAreas pages: those are
# AI-assisted and stale, so a "cited in the area page" hit is untrustworthy. The
# audit trusts the paper, not the area page, and Taxonomy.md is the canonical
# definition of what each row/column means.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(
        description="Extract the matrix-classification audit corpus.")
    repo_default = Path(__file__).resolve().parents[3]
    ap.add_argument("--papers", default=str(repo_default / "Papers.md"))
    ap.add_argument("--out", default=str(repo_default / "matrix-corpus.json"))
    ap.add_argument("--group", action="append", default=[],
                    help="Zotero group id (repeatable; default 6549203 then 5178481)")
    ap.add_argument("--api", default="http://localhost:23119/api")
    ap.add_argument("--zotero-storage",
                    default=os.path.expanduser("~/Zotero/storage"))
    ap.add_argument("--docling-corpus", default=str(repo_default / "docling-corpus"),
                    help="docling_ingest.py output; sections/ are preferred over "
                         "the ft-cache. Pass '' to force the ft-cache path.")
    args = ap.parse_args()

    groups = args.group or ["6549203", "5178481"]

    md = Path(args.papers).read_text(encoding="utf-8")
    area_labels, cell_map = parse_matrix(md)
    refs = parse_references(md)

    # Matrix-participating refs = those cited in ≥1 cell.
    matrix_ids = sorted(cell_map)
    print(f"Areas: {area_labels}", file=sys.stderr)
    print(f"Matrix-participating refs: {len(matrix_ids)} "
          f"(of {len(refs)} total references)", file=sys.stderr)

    doi_index, url_index = build_indexes(args.api, groups)
    print(f"Zotero index: {len(doi_index)} by DOI / {len(url_index)} by URL "
          f"across groups {groups}", file=sys.stderr)

    # Only the Zotero miss is counted here; everything else in the summary is
    # derived from the records at the end, so it cannot drift from them.
    corpus, n_nozot = [], 0
    for rid in matrix_ids:
        ref = refs.get(rid, {})
        doi = ref.get("doi", "")
        url = ref.get("url", "")
        current_cells = [{"method": m, "area": a}
                         for (m, a) in sorted(cell_map[rid])]
        rec = {
            "id": rid,
            "doi": doi,
            "url": url,
            "title": ref.get("title", ""),
            "citation": ref.get("citation", ""),
            "section": ref.get("section", ""),
            "current_cells": current_cells,
            "abstract": "",
            "methods_text": "",
            # ft-cache length specifically, so the two sources stay separable
            # even though has_fulltext now covers both.
            "fulltext_chars": 0,
            # "usable full-text evidence exists for this ref", from EITHER source.
            # It was ft-cache availability alone, but a Docling section comes from
            # the PDF and so exists for a ref whose ft-cache is missing: leaving
            # this False there would hide a complete methods section from every
            # consumer that filters on it, which is all of them.
            "has_fulltext": False,
            "zotero_group": None,
            # Provenance for methods_text. Consumers that weigh evidence should
            # read these: a "ftcache" section may be truncated and may run past
            # the end of the real methods section, a "docling" one does neither.
            "methods_source": "",       # "docling" | "ftcache" | ""
            "methods_strategy": "",     # docling: "explicit" | "positional"
            "methods_heading": "",
            "methods_end_heading": "",
            "methods_pages": None,      # [first, last] for docling sections
            "methods_truncated": False,
            # Non-empty when this ref matched its Zotero item only after a URL
            # fragment was dropped, i.e. the join may have found another paper.
            "suspect_join": "",
        }
        # A Docling section stands on its own: it comes from the PDF, not the
        # ft-cache, so it is available even for a ref whose ft-cache is missing.
        section = read_docling_section(args.docling_corpus, rid)
        if section:
            rec["methods_text"] = section["methods_text"]
            rec["methods_source"] = "docling"
            rec["has_fulltext"] = True
            rec["methods_strategy"] = section.get("strategy", "")
            rec["methods_heading"] = section.get("heading", "")
            rec["methods_end_heading"] = section.get("end_heading", "")
            if section.get("page_start") is not None:
                rec["methods_pages"] = [section.get("page_start"),
                                        section.get("page_end")]

        by_doi = doi_index.get(doi.lower()) if doi else None
        hit = by_doi or (url_index.get(_norm_url(url)) if url else None)
        if not hit:
            n_nozot += 1
            corpus.append(rec)
            continue
        group, item = hit
        # Only the URL path can be wrong this way; a DOI match is exact. Kept on
        # the record, not just printed: on a 345-ref run the warning scrolls past,
        # and this is the one anomaly worth finding again later.
        if not by_doi:
            rec["suspect_join"] = check_url_join(rid, url, item) or ""
        rec["zotero_group"] = group
        rec["abstract"] = (item.get("data", {}).get("abstractNote") or "").strip()
        pdf_key = scope.find_pdf_attachment_key(args.api, group, item.get("key"))
        fulltext = read_ftcache(args.zotero_storage, pdf_key)
        rec["fulltext_chars"] = len(fulltext)
        if fulltext:
            rec["has_fulltext"] = True
            if not section:
                rec["methods_text"] = extract_methods(fulltext)
                rec["methods_source"] = "ftcache"
                # Ask the extractor where it started rather than re-deriving it.
                # Truncation is measured against the pre-strip length, because
                # extract_methods strips: a cut landing next to whitespace lands
                # at 11,99x and an `== METHODS_WINDOW` test misses it.
                start, matched = methods_start(fulltext)
                rec["methods_strategy"] = "heading" if matched else "positional"
                rec["methods_truncated"] = (len(fulltext) - start) > METHODS_WINDOW
        corpus.append(rec)

    Path(args.out).write_text(
        json.dumps({"areas": area_labels, "refs": corpus},
                   indent=2, ensure_ascii=False),
        encoding="utf-8")
    # Also split into per-ref files so each Workflow agent reads only its own
    # paper's record (the Workflow sandbox can't read the combined file).
    per_ref_dir = Path(args.out).with_suffix("")  # matrix-corpus.json → matrix-corpus/
    per_ref_dir.mkdir(exist_ok=True)
    for rec in corpus:
        (per_ref_dir / f"ref-{rec['id']}.json").write_text(
            json.dumps(rec, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {len(corpus)} records → {args.out}", file=sys.stderr)
    print(f"  per-ref files → {per_ref_dir}/ref-<id>.json", file=sys.stderr)
    # Derive the summary from the records rather than from parallel counters, so
    # a printed figure cannot drift from the file it claims to describe.
    def n(pred):
        return sum(1 for r in corpus if pred(r))

    n_docling = n(lambda r: r["methods_source"] == "docling")
    n_ftcache = n(lambda r: r["methods_source"] == "ftcache")
    print(f"  usable full text: {n(lambda r: r['has_fulltext'])}   "
          f"ft-cache present: {n(lambda r: r['fulltext_chars'] > 0)}   "
          f"not-in-Zotero: {n_nozot}", file=sys.stderr)
    print(f"  methods from docling: {n_docling}   from ft-cache: {n_ftcache} "
          f"(of which truncated: {n(lambda r: r['methods_truncated'])})   "
          f"no evidence: {n(lambda r: not r['methods_text'].strip())}",
          file=sys.stderr)
    # Every other figure here is derived from `corpus` so a printed number cannot
    # drift from the file. This one belongs for the same reason and was missing:
    # `check_url_join`'s docstring calls it the one anomaly worth finding again
    # later, and it was the only field written to every record and counted by
    # nothing.
    n_suspect = n(lambda r: r.get("suspect_join"))
    if n_suspect:
        print(f"  SUSPECT JOINS: {n_suspect} ref(s) matched a Zotero item only "
              f"after dropping a URL fragment — see `suspect_join` on each record",
              file=sys.stderr)
    if n_ftcache:
        print(f"  NOTE: {n_ftcache} refs still read the ft-cache path; "
              f"run docling_ingest.py to cover them.", file=sys.stderr)


if __name__ == "__main__":
    main()
