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


def extract_methods(fulltext):
    """Pull a methods-region excerpt from raw ft-cache text.

    Strategy: find the earliest methods-like heading past the first 5% of the
    document (skips a "Methods" word in the abstract/TOC) and take a window from
    there. If none is found, fall back to a slice from ~10% in (past the
    abstract/intro) so the agent still gets substantive body text rather than
    front matter.
    """
    if not fulltext:
        return ""
    floor = len(fulltext) // 20  # ignore matches in the first 5%
    match = next((m for m in METHODS_HEAD_RE.finditer(fulltext)
                  if m.start() >= floor), None)
    if match:
        start = match.start()
    else:
        start = len(fulltext) // 10
    return fulltext[start:start + METHODS_WINDOW].strip()


# ---------------------------------------------------------------------------
# Zotero DOI index (across the requested groups)
# ---------------------------------------------------------------------------

def _norm_url(url):
    """Normalize a URL for fuzzy join: lowercase, drop scheme + trailing slash."""
    u = (url or "").strip().lower()
    u = re.sub(r"^https?://", "", u)
    return u.rstrip("/")


def build_indexes(api, groups):
    """Paginate every group's top-level items → DOI and URL indexes.

    Returns (doi_index, url_index), each {key: (group, item)}. Earlier groups
    win, so list caail (6549203) first to prefer its copies.
    """
    doi_index, url_index = {}, {}
    for group in groups:
        items = scope._paginate(f"{api}/groups/{group}/items/top?format=json")
        for it in items:
            data = it.get("data", {})
            if data.get("itemType") in ("attachment", "note"):
                continue
            doi = (data.get("DOI") or "").strip().lower()
            if doi and doi not in doi_index:
                doi_index[doi] = (group, it)
            url = _norm_url(data.get("url"))
            if url and url not in url_index:
                url_index[url] = (group, it)
    return doi_index, url_index


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

    corpus, n_ft, n_noft, n_nozot = [], 0, 0, 0
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
            "fulltext_chars": 0,
            "has_fulltext": False,
            "zotero_group": None,
        }
        hit = (doi_index.get(doi.lower()) if doi else None) \
            or (url_index.get(_norm_url(url)) if url else None)
        if not hit:
            n_nozot += 1
            corpus.append(rec)
            continue
        group, item = hit
        rec["zotero_group"] = group
        rec["abstract"] = (item.get("data", {}).get("abstractNote") or "").strip()
        pdf_key = scope.find_pdf_attachment_key(args.api, group, item.get("key"))
        fulltext = read_ftcache(args.zotero_storage, pdf_key)
        rec["fulltext_chars"] = len(fulltext)
        if fulltext:
            rec["methods_text"] = extract_methods(fulltext)
            rec["has_fulltext"] = True
            n_ft += 1
        else:
            n_noft += 1
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
    print(f"  full text: {n_ft}   PDF-but-no-ftcache: {n_noft}   "
          f"not-in-Zotero: {n_nozot}", file=sys.stderr)


if __name__ == "__main__":
    main()
