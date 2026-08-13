#!/usr/bin/env python3
"""Ask each registry which paper its record belongs to. Opt-in, manual, networked.

The deposit/reuse split in `extract_accessions.py` guesses from the sentence
around an accession, and leaves most of them unresolved. This resolves them from
the registry instead: a record carries the identity of the paper that produced
it, so an accession whose record names THIS paper is a deposit, and one whose
record names a different paper is data the authors reused.

Measured before building: 5 of 5 sampled GEO records carried a linked PMID, and
the titles discriminated correctly -- ref 5's declared `GSE118480` belongs to a
retina cell-atlas paper, so it is reuse, which is exactly what the sentence-level
heuristic could not tell.

This is the only networked script in the extraction chain, and like
`fetch:citations` and `fetch:awesome-lists` it is never run by a build. It writes
a cache that `extract_accessions.py` then reads offline.

    export NCBI_API_KEY=...        # or it runs unauthenticated at 3 req/s
    python3 .claude/skills/matrix-classification-audit/fetch_accession_citations.py

Resumable: a (ref, accession) pair already carrying a settled verdict is skipped,
so an interrupted run is restarted with the same command. `--refresh` re-asks.

## What each registry can and cannot settle

| registry | endpoint | the fact it yields |
|---|---|---|
| GEO / SRA / BioProject / BioSample | NCBI E-utilities | the record's linked PMID |
| ArrayExpress (`E-…`) | EBI BioStudies | a `Publication` subsection: PMID, DOI, title |
| Zenodo | `zenodo.org/api/records` | `related_identifiers`, resource type, title |
| Figshare | `api.figshare.com/v2/articles` | `resource_doi`, title |
| dbGaP (`phs…`) | none | **unresolved** -- E-utilities answers `Invalid db name specified: gap`, so there is no id-level lookup to make. Verified, not assumed. |
| Dryad, PRIDE, MassIVE, Metabolights, EGA, PDB | none | unresolved. No accession in the corpus exercises them, and network-parsing code no run has ever executed is a liability rather than coverage. |

## Why the key is (ref, accession) and not the accession

"Is this a deposit" is a property of the *pair*, not of the accession. Five
accessions in this corpus are declared by two papers each: `GSE118480` is ref
115's deposit and ref 5's reuse. A cache keyed by accession alone stores one
verdict and hands it to both papers, so one of them carries registry evidence
that was never gathered about it. The output is `schema: 2` for that reason, and
`extract_accessions.py` refuses a schema it does not recognise rather than
silently finding no evidence.

## Zenodo DOIs are usually code

Most Zenodo DOIs in an availability statement are GitHub release archives minted
by the GitHub-Zenodo integration, not datasets: `isSupplementTo` a repository
URL, titled `owner/repo: tag`. That is resolvable without guessing, because
`extract_accessions.py` already reads the paper's declared GitHub repos out of
the same statement -- a record supplementing a repo the paper declares is
provably that paper's own deposit. It is also a *different curation question*
(`> **Code**:` beside the reference, not an entry in `Datasets/`), so the verdict
carries `content: software` and the report keeps the two apart.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "zotero-collection-scope"))

import extract_matrix_corpus as ex  # noqa: E402

SCHEMA = 2

E = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
ZENODO = "https://zenodo.org/api/records"
FIGSHARE = "https://api.figshare.com/v2/articles"
BIOSTUDIES = "https://www.ebi.ac.uk/biostudies/api/v1/studies"

# Which NCBI database serves each registry.
DB_FOR = {
    "GEO": "gds", "GEO sample": "gds",
    "SRA": "sra", "BioProject": "bioproject", "BioSample": "biosample",
}

ZENODO_RE = re.compile(r"zenodo\.(\d+)$", re.IGNORECASE)
FIGSHARE_RE = re.compile(r"figshare\.(\d+)$", re.IGNORECASE)
ARRAYEXPRESS_RE = re.compile(r"^E-[A-Z]{4}-\d+$")
GITHUB_RE = re.compile(r"github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)", re.IGNORECASE)

# Verdicts. The consumer overrides its sentence guess on `deposit`/`reuse` only;
# everything else says why the registry could not settle it, which is a different
# statement from "the sentence was right".
SETTLED = ("deposit", "reuse", "no-linked-citation", "not-found", "not-covered")


# ---------------------------------------------------------------------------
# Title joining
# ---------------------------------------------------------------------------

# Hyphens are DELETED rather than split on, so "Pre-training" and "Pretraining"
# normalise together. Ref 91's figshare record is titled "Data Archiving and
# Access for NaFM: Pre-training a Foundation Model for Small-Molecule Natural
# Products" against a paper titled "Pretraining a foundation model for
# small-molecule natural products"; splitting on the hyphen loses that join.
STOPWORDS = {"the", "a", "an", "of", "and", "for", "in", "on", "with", "to",
             "from", "using", "by", "at", "is", "are", "as", "its", "their",
             "data", "dataset", "datasets"}

TITLE_MIN_TOKENS = 4
TITLE_THRESHOLD = 0.8


def title_tokens(s):
    s = (s or "").lower().replace("-", "").replace("‐", "").replace("–", "")
    words = re.split(r"[^a-z0-9]+", s)
    return {w for w in words if len(w) > 1 and w not in STOPWORDS}


def titles_match(a, b):
    """Does the smaller title sit inside the larger one?

    Containment rather than equality, because a repository record routinely
    wraps the paper's title in boilerplate. Deliberately weaker evidence than a
    PMID match and recorded as such: two single-cell papers can share most of
    their content words, so this is used only where no PMID exists on one side.
    """
    ta, tb = title_tokens(a), title_tokens(b)
    if min(len(ta), len(tb)) < TITLE_MIN_TOKENS:
        return False
    return len(ta & tb) / min(len(ta), len(tb)) >= TITLE_THRESHOLD


def norm_doi(d):
    return (d or "").strip().lower().replace("https://doi.org/", "").rstrip(".")


# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------

def read_api_key():
    """The NCBI key, from the environment or the macOS Keychain.

    Read in-process rather than exported on a command line: a key interpolated
    into a shell command lands in the shell history and in any transcript of the
    session, and a leaked key has to be rotated. Absence is fine -- NCBI's
    documented unauthenticated limit is 3 req/s, which is the rate used anyway.
    """
    key = os.environ.get("NCBI_API_KEY", "").strip()
    if key:
        return key
    try:
        r = subprocess.run(["keychain-secret", "get", "NCBI_API_KEY"],
                           capture_output=True, text=True, timeout=15)
        return r.stdout.strip() if r.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


class Throttle:
    """One rate per host, because they are not one service.

    NCBI documents 3 requests/second unauthenticated and 10 with a key; stay at
    3 either way, since the extra headroom buys nothing on a job this size.

    The others get one request every 5 seconds by default. Zenodo documents 60
    per minute for guests (developers.zenodo.org, read 2026-08-12), so that is
    five times under its own ceiling; EBI and figshare publish no guest rate, and
    the corpus asks each of them for fewer than ten records. A lookup measured in
    minutes is worth nobody's outage.
    """

    def __init__(self, per_second):
        self.gap = 1.0 / per_second
        self.last = 0.0

    def wait(self):
        delta = time.time() - self.last
        if delta < self.gap:
            time.sleep(self.gap - delta)
        self.last = time.time()


class Net:
    def __init__(self, ncbi_per_second, other_gap_seconds):
        self.key = read_api_key()
        self.throttles = {
            "eutils.ncbi.nlm.nih.gov": Throttle(ncbi_per_second),
            "*": Throttle(1.0 / other_gap_seconds),
        }

    def _throttle(self, url):
        host = urllib.parse.urlparse(url).netloc
        return self.throttles.get(host, self.throttles["*"])

    def get(self, url, retries=3, allow_404=False):
        """Text of `url`, or None on a 404 when the caller expects one.

        A 404 is an answer here -- the registry has no such record -- so it is
        returned as data rather than raised, but only where the caller asked;
        anywhere else it is still a bug worth surfacing.
        """
        if "ncbi.nlm.nih.gov" in url and self.key:
            url += ("&" if "?" in url else "?") + "api_key=" + urllib.parse.quote(self.key)
        for attempt in range(retries):
            self._throttle(url).wait()
            try:
                req = urllib.request.Request(
                    url, headers={"User-Agent":
                                  "CAAIL accession-provenance (CAAIL-259)"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    return r.read().decode("utf-8", "replace")
            except urllib.error.HTTPError as exc:
                if exc.code in (404, 410) and allow_404:
                    return None
                # 429/503 mean back off, not retry harder.
                if exc.code in (429, 503) and attempt < retries - 1:
                    time.sleep(10 * (attempt + 1))
                    continue
                raise
            except urllib.error.URLError:
                if attempt < retries - 1:
                    time.sleep(5)
                    continue
                raise
        return None

    def get_json(self, url, allow_404=False):
        s = self.get(url, allow_404=allow_404)
        if s is None:
            return None
        try:
            return json.loads(s)
        except ValueError:
            return None


# ---------------------------------------------------------------------------
# Per-registry resolution. Each returns (verdict, evidence, extra_fields).
# ---------------------------------------------------------------------------

def ncbi_record_pmids(acc, registry, net):
    """(record_exists, [pmids]) for an NCBI accession.

    The two are separate answers and were previously the same one. An esearch
    that matches nothing means the registry has no such record -- ref 5 declares
    `GSE727857`, which does not exist (the paper means Paul et al.'s `GSE72857`;
    a digit is duplicated). Reporting that as "the record links no paper" files
    an extraction defect under honest registry silence.
    """
    db = DB_FOR[registry]
    term = urllib.parse.quote(f"{acc}[ACCN]" if db == "gds" else acc)
    s = net.get_json(f"{E}/esearch.fcgi?db={db}&term={term}&retmode=json")
    ids = (s or {}).get("esearchresult", {}).get("idlist", [])
    if not ids:
        return False, []
    summ = net.get_json(f"{E}/esummary.fcgi?db={db}&id={ids[0]}&retmode=json")
    rec = (summ or {}).get("result", {}).get(ids[0], {})
    out = rec.get("pubmedids") or []
    # SRA and BioProject bury the id in different fields; take whatever is there.
    if not out:
        for k in ("pubmed", "publications"):
            v = rec.get(k)
            if isinstance(v, list):
                out = [str(x.get("id", x)) if isinstance(x, dict) else str(x)
                       for x in v]
                break
    return True, [str(p) for p in out]


def pubmed_titles(pmids, net, cache):
    """{pmid: title}, so a record can be joined to a paper that has no PMID."""
    want = [p for p in pmids if p not in cache]
    if want:
        summ = net.get_json(f"{E}/esummary.fcgi?db=pubmed&"
                            f"id={','.join(want)}&retmode=json")
        result = (summ or {}).get("result", {})
        for p in want:
            cache[p] = (result.get(p) or {}).get("title", "")
    return {p: cache.get(p, "") for p in pmids}


def resolve_ncbi(acc, registry, paper, net, title_cache):
    exists, pmids = ncbi_record_pmids(acc, registry, net)
    if not exists:
        return "not-found", "none", {}
    if not pmids:
        return "no-linked-citation", "none", {"record_pmids": []}
    extra = {"record_pmids": pmids}
    if paper["pmid"]:
        if paper["pmid"] in pmids:
            return "deposit", "pmid-match", extra
        return "reuse", "pmid-other", extra
    # The paper is not in PubMed at all -- Nature Machine Intelligence is not
    # indexed in MEDLINE, and neither are arXiv/bioRxiv preprints -- so the two
    # sides cannot be joined on an id. Join on the linked paper's title instead
    # and record that it was weaker evidence.
    titles = pubmed_titles(pmids, net, title_cache)
    extra["record_titles"] = titles
    for t in titles.values():
        if titles_match(paper["title"], t):
            return "deposit", "title-match", extra
    if any(titles.values()):
        return "reuse", "title-other", extra
    return "no-linked-citation", "none", extra


def resolve_zenodo(acc, paper, net):
    m = ZENODO_RE.search(acc)
    if not m:
        return "not-covered", "none", {}
    rec = net.get_json(f"{ZENODO}/{m.group(1)}", allow_404=True)
    if rec is None:
        return "not-found", "none", {}
    md = rec.get("metadata") or {}
    rels = md.get("related_identifiers") or []
    rtype = ((md.get("resource_type") or {}).get("type") or "").lower()
    extra = {"record_title": md.get("title", ""),
             "content": "software" if rtype == "software" else "data",
             "related": [r.get("identifier", "") for r in rels]}

    paper_doi = norm_doi(paper["doi"])
    for r in rels:
        if paper_doi and paper_doi in norm_doi(r.get("identifier", "")):
            return "deposit", "doi-link", extra
    # A GitHub release archive: provably this paper's deposit when the repo it
    # supplements is one the paper's own availability statement names.
    # removesuffix, not rstrip: rstrip takes a character SET, so `.rstrip(".git")`
    # would eat the tail of any repo ending in those letters.
    gh = {g.group(1).lower().removesuffix(".git")
          for r in rels for g in [GITHUB_RE.search(r.get("identifier", "") or "")] if g}
    mine = {r.lower() for r in paper["code_repos"]}
    if gh & mine:
        extra["repo"] = sorted(gh & mine)[0]
        return "deposit", "code-archive", extra
    if titles_match(paper["title"], md.get("title", "")):
        return "deposit", "title-match", extra
    others = [norm_doi(r.get("identifier", "")) for r in rels
              if (r.get("scheme") or "").lower() == "doi"]
    others = [d for d in others if d and not d.startswith("10.5281/zenodo.")]
    if others:
        extra["other_doi"] = others[0]
        return "reuse", "doi-link-other", extra
    if gh:
        # It supplements a repository, but not one this paper claims. Common for
        # a tool the authors used; not evidence either way.
        extra["repo"] = sorted(gh)[0]
        return "no-linked-citation", "code-archive-unmatched", extra
    return "no-linked-citation", "none", extra


def resolve_figshare(acc, paper, net):
    m = FIGSHARE_RE.search(acc)
    if not m:
        return "not-covered", "none", {}
    rec = net.get_json(f"{FIGSHARE}/{m.group(1)}", allow_404=True)
    if rec is None:
        return "not-found", "none", {}
    extra = {"record_title": rec.get("title", ""), "content": "data"}
    linked = norm_doi(rec.get("resource_doi") or "")
    paper_doi = norm_doi(paper["doi"])
    if linked:
        extra["other_doi"] = linked
        if paper_doi and linked == paper_doi:
            return "deposit", "doi-link", extra
        return "reuse", "doi-link-other", extra
    if titles_match(paper["title"], rec.get("title", "")):
        return "deposit", "title-match", extra
    return "no-linked-citation", "none", extra


def resolve_biostudies(acc, paper, net):
    rec = net.get_json(f"{BIOSTUDIES}/{urllib.parse.quote(acc)}", allow_404=True)
    if rec is None:
        # NOT `not-found`. A 404 here does not distinguish "no such study" from
        # "this accession series is not served by this endpoint": `E-MTAB-…`
        # resolves, and every `E-HCAD-…` 404s, including E-HCAD-1. Calling that
        # a non-existent accession would file a coverage gap as a typo in the
        # paper -- the same conflation the NCBI path exists to avoid.
        return "not-covered", "endpoint-404", {}
    pubs = [s for s in ((rec.get("section") or {}).get("subsections") or [])
            if isinstance(s, dict) and s.get("type") == "Publication"]
    if not pubs:
        return "no-linked-citation", "none", {}
    pub = pubs[0]
    attrs = {a.get("name"): a.get("value")
             for a in (pub.get("attributes") or []) if isinstance(a, dict)}
    extra = {"record_title": attrs.get("Title", ""),
             "record_pmids": [pub.get("accno")] if pub.get("accno") else [],
             "content": "data"}
    linked = norm_doi(attrs.get("DOI", ""))
    if linked:
        extra["other_doi"] = linked
    paper_doi = norm_doi(paper["doi"])
    if linked and paper_doi and linked == paper_doi:
        return "deposit", "doi-link", extra
    if paper["pmid"] and str(pub.get("accno")) == paper["pmid"]:
        return "deposit", "pmid-match", extra
    if titles_match(paper["title"], attrs.get("Title", "")):
        return "deposit", "title-match", extra
    if linked or pub.get("accno"):
        return "reuse", "doi-link-other" if linked else "pmid-other", extra
    return "no-linked-citation", "none", extra


def resolve(acc, registry, paper, net, title_cache):
    if registry in DB_FOR:
        return resolve_ncbi(acc, registry, paper, net, title_cache)
    if registry == "Zenodo DOI":
        return resolve_zenodo(acc, paper, net)
    if registry == "Figshare DOI":
        return resolve_figshare(acc, paper, net)
    if registry == "ArrayExpress" and ARRAYEXPRESS_RE.match(acc):
        return resolve_biostudies(acc, paper, net)
    return "not-covered", "none", {}


# ---------------------------------------------------------------------------

def paper_pmid(paper, net, cache):
    """PubMed id for a paper, by DOI and then by title.

    The title attempt matters: a DOI search failing is not proof the paper is
    absent from PubMed, and the two cases carry different weight. Where the
    title finds it, the strong id-level join applies after all.
    """
    doi, title = paper["doi"], paper["title"]
    key = doi or title
    if not key:
        return None
    if key in cache:
        return cache[key]
    pm = None
    if doi:
        s = net.get_json(f"{E}/esearch.fcgi?db=pubmed&term="
                         f"{urllib.parse.quote(doi)}[DOI]&retmode=json")
        ids = (s or {}).get("esearchresult", {}).get("idlist", [])
        pm = ids[0] if ids else None
    if not pm and title:
        s = net.get_json(f"{E}/esearch.fcgi?db=pubmed&term="
                         f'{urllib.parse.quote(chr(34) + title + chr(34))}[Title]'
                         "&retmode=json")
        ids = (s or {}).get("esearchresult", {}).get("idlist", [])
        pm = ids[0] if len(ids) == 1 else None
    cache[key] = pm
    return pm


def load_previous(path):
    if not path.is_file():
        return {}
    try:
        blob = json.loads(path.read_text())
    except ValueError:
        return {}
    if isinstance(blob, dict) and blob.get("schema") == SCHEMA:
        return blob.get("verdicts", {})
    # A schema-1 file was keyed by accession alone, which cannot be migrated:
    # its verdicts do not say which paper they were gathered about.
    print("existing cache is not schema 2; re-resolving from scratch")
    return {}


def save(path, verdicts):
    path.write_text(json.dumps({"schema": SCHEMA, "verdicts": verdicts}, indent=2))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--accessions", default=str(REPO / "docling-corpus/accessions.json"),
                    help="output of extract_accessions.py --json")
    ap.add_argument("--out", default=str(REPO / "docling-corpus/accession-citations.json"))
    ap.add_argument("--papers", default=str(REPO / "Papers.md"))
    ap.add_argument("--per-second", type=float, default=3.0,
                    help="NCBI rate; its documented unauthenticated limit")
    ap.add_argument("--other-gap", type=float, default=5.0,
                    help="seconds between requests to every other registry")
    ap.add_argument("--refresh", action="store_true",
                    help="re-ask about pairs that already carry a verdict")
    ap.add_argument("--only", default="",
                    help="restrict to one registry, e.g. --only 'Zenodo DOI'")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    src = Path(args.accessions)
    if not src.is_file():
        sys.exit(f"{src} not found; run extract_accessions.py --json {src} first")

    refs = ex.parse_references(Path(args.papers).read_text(encoding="utf-8"))
    rows = json.loads(src.read_text())
    out_path = Path(args.out)
    # `--refresh` re-asks about the pairs IN SCOPE; it does not discard the file.
    # Discarding it meant `--refresh --only 'Zenodo DOI'` wrote back a cache
    # holding nothing but Zenodo, silently destroying 117 other verdicts.
    out = load_previous(out_path)
    net = Net(args.per_second, args.other_gap)
    print(f"NCBI key: {'present' if net.key else 'absent (3 req/s is the documented limit)'}")
    print(f"other registries: one request every {args.other_gap:g}s")
    if out:
        print(f"resuming: {len(out)} pairs already resolved")

    doi_cache, title_cache, n = {}, {}, 0
    for r in rows:
        rid = r["id"]
        ref = refs.get(rid, {})
        paper = {"doi": ref.get("doi", ""), "title": ref.get("title", ""),
                 "code_repos": r.get("code_repos", []), "pmid": None}
        for acc, meta in sorted(r["accessions"].items()):
            registry = meta["registry"]
            if args.only and registry != args.only:
                continue
            key = f"{rid}:{acc}"
            if (not args.refresh and key in out
                    and out[key].get("verdict") in SETTLED):
                continue
            if args.limit and n >= args.limit:
                break
            if registry not in DB_FOR and registry not in (
                    "Zenodo DOI", "Figshare DOI", "ArrayExpress"):
                out[key] = {"ref": rid, "accession": acc, "registry": registry,
                            "verdict": "not-covered", "evidence": "none"}
                continue
            # Deferred until a covered accession is actually reached, so a paper
            # whose every accession is uncovered costs no PubMed lookup.
            if paper["pmid"] is None:
                paper["pmid"] = paper_pmid(paper, net, doi_cache)
            n += 1
            try:
                verdict, evidence, extra = resolve(acc, registry, paper, net,
                                                   title_cache)
            except Exception as exc:  # noqa: BLE001 - one bad accession must not end the run
                out[key] = {"ref": rid, "accession": acc, "registry": registry,
                            "verdict": "error", "evidence": "none",
                            "error": f"{type(exc).__name__}: {exc}"}
                print(f"  ref {rid} {acc}: ERROR {type(exc).__name__}: {exc}",
                      flush=True)
                save(out_path, out)
                continue
            row = {"ref": rid, "accession": acc, "registry": registry,
                   "verdict": verdict, "evidence": evidence,
                   "paper_pmid": paper["pmid"]}
            row.update(extra)
            out[key] = row
            note = ""
            if evidence in ("title-match", "title-other"):
                note = f'  [record: {(row.get("record_title") or "")[:70]!r}]'
                if row.get("record_titles"):
                    note = ("  [record: "
                            f'{sorted(row["record_titles"].values())[0][:70]!r}]')
            print(f'  ref {rid:>4} {acc:<30} {registry:<14} {verdict:<19} '
                  f'{evidence}{note}', flush=True)
            save(out_path, out)

    save(out_path, out)
    print(f"\nresolved {len(out)} (ref, accession) pairs")
    for k, v in Counter(v["verdict"] for v in out.values()).most_common():
        print(f"  {v:>4}  {k}")
    print("\nhow each was decided:")
    for k, v in Counter(v.get("evidence", "none") for v in out.values()).most_common():
        print(f"  {v:>4}  {k}")
    soft = sum(1 for v in out.values()
               if v.get("evidence") in ("title-match", "title-other"))
    if soft:
        print(f"\n{soft} verdict(s) rest on a title join rather than an id. Those are")
        print("the ones to read before acting on them; the record title is stored.")
    nf = [v for v in out.values() if v["verdict"] == "not-found"]
    if nf:
        print(f"\n{len(nf)} accession(s) do not exist in their registry. That is an")
        print("extraction or typesetting defect, not a curation gap:")
        for v in sorted(nf, key=lambda x: x["ref"]):
            print(f'  ref {v["ref"]:>4}  {v["accession"]}  ({v["registry"]})')
    print(f"\nwrote {out_path}")


if __name__ == "__main__":
    main()
