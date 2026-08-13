#!/usr/bin/env python3
"""Ask each registry which paper its record belongs to. Opt-in, manual, networked.

The deposit/reuse split in `extract_accessions.py` guesses from the sentence
around an accession, and leaves most of them unresolved. This resolves them from
the registry instead: an NCBI record carries the PubMed id of the paper that
produced it, so an accession whose record cites THIS paper is a deposit, and one
whose record cites a different paper is data the authors reused.

Measured before building: 5 of 5 sampled GEO records carried a linked PMID, and
the titles discriminated correctly -- ref 5's declared `GSE118480` belongs to a
retina cell-atlas paper, so it is reuse, which is exactly what the sentence-level
heuristic could not tell.

This is the only networked script in the extraction chain, and like
`fetch:citations` and `fetch:awesome-lists` it is never run by a build. It writes
a cache that `extract_accessions.py` then reads offline.

    export NCBI_API_KEY=...        # or it runs unauthenticated at 3 req/s
    python3 .claude/skills/matrix-classification-audit/fetch_accession_citations.py

Covers the NCBI registries (GEO, SRA, BioProject, BioSample), which is 109 of the
145 accessions in the corpus. Zenodo, Figshare, Dryad and ArrayExpress are left
unresolved and reported as such rather than guessed at.
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "zotero-collection-scope"))

import extract_matrix_corpus as ex  # noqa: E402

E = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

# Which NCBI database serves each registry.
DB_FOR = {
    "GEO": "gds", "GEO sample": "gds",
    "SRA": "sra", "BioProject": "bioproject", "BioSample": "biosample",
}


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
    """NCBI documents 3 requests/second unauthenticated and 10 with a key. Stay
    at 3 either way: the extra headroom buys nothing for a 290-request job, and
    this is shared research infrastructure with no autoscaling."""

    def __init__(self, per_second=3.0):
        self.gap = 1.0 / per_second
        self.last = 0.0

    def wait(self):
        delta = time.time() - self.last
        if delta < self.gap:
            time.sleep(self.gap - delta)
        self.last = time.time()


def fetch(url, throttle, key, retries=3):
    if key:
        url += ("&" if "?" in url else "?") + "api_key=" + urllib.parse.quote(key)
    for attempt in range(retries):
        throttle.wait()
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "CAAIL accession-provenance (CAAIL-259)"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
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
    return ""


def pmids_for(acc, registry, throttle, key):
    """PubMed ids the registry associates with this accession, or []."""
    db = DB_FOR.get(registry)
    if not db:
        return None                      # registry not covered; not the same as []
    term = urllib.parse.quote(f"{acc}[ACCN]" if db == "gds" else acc)
    s = fetch(f"{E}/esearch.fcgi?db={db}&term={term}&retmode=json", throttle, key)
    ids = json.loads(s)["esearchresult"].get("idlist", [])
    if not ids:
        return []
    summ = fetch(f"{E}/esummary.fcgi?db={db}&id={ids[0]}&retmode=json", throttle, key)
    rec = json.loads(summ).get("result", {}).get(ids[0], {})
    out = rec.get("pubmedids") or []
    # SRA and BioProject bury the id in different fields; take whatever is there.
    if not out:
        for k in ("pubmed", "publications"):
            v = rec.get(k)
            if isinstance(v, list):
                out = [str(x.get("id", x)) if isinstance(x, dict) else str(x) for x in v]
                break
    return [str(p) for p in out]


def paper_pmid(doi, throttle, key, cache):
    """PubMed id for a DOI, so the two sides can be compared."""
    if not doi:
        return None
    if doi in cache:
        return cache[doi]
    s = fetch(f"{E}/esearch.fcgi?db=pubmed&term="
              f"{urllib.parse.quote(doi)}[DOI]&retmode=json", throttle, key)
    ids = json.loads(s)["esearchresult"].get("idlist", [])
    cache[doi] = ids[0] if ids else None
    return cache[doi]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--accessions", default=str(REPO / "docling-corpus/accessions.json"),
                    help="output of extract_accessions.py --json")
    ap.add_argument("--out", default=str(REPO / "docling-corpus/accession-citations.json"))
    ap.add_argument("--papers", default=str(REPO / "Papers.md"))
    ap.add_argument("--per-second", type=float, default=3.0)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    src = Path(args.accessions)
    if not src.is_file():
        sys.exit(f"{src} not found; run extract_accessions.py --json {src} first")

    refs = ex.parse_references(Path(args.papers).read_text(encoding="utf-8"))
    rows = json.loads(src.read_text())
    key = read_api_key()
    throttle = Throttle(args.per_second)
    print(f"NCBI key: {'present' if key else 'absent (3 req/s is the documented limit)'}")

    out, doi_cache, n = {}, {}, 0
    for r in rows:
        rid = r["id"]
        mine = paper_pmid(refs.get(rid, {}).get("doi", ""), throttle, key, doi_cache)
        for acc, meta in sorted(r["accessions"].items()):
            if args.limit and n >= args.limit:
                break
            registry = meta["registry"]
            if registry not in DB_FOR:
                out[acc] = {"ref": rid, "registry": registry, "verdict": "not-covered"}
                continue
            n += 1
            try:
                pm = pmids_for(acc, registry, throttle, key)
            except Exception as exc:  # noqa: BLE001 - one bad accession must not end the run
                out[acc] = {"ref": rid, "registry": registry, "verdict": "error",
                            "error": f"{type(exc).__name__}: {exc}"}
                print(f"  {acc}: ERROR {type(exc).__name__}", flush=True)
                continue
            if pm is None or not pm:
                verdict = "no-linked-citation"
            elif mine and mine in pm:
                verdict = "deposit"
            elif mine:
                verdict = "reuse"
            else:
                verdict = "paper-pmid-unknown"
            out[acc] = {"ref": rid, "registry": registry, "record_pmids": pm,
                        "paper_pmid": mine, "verdict": verdict}
            print(f'  {acc:<22} {registry:<12} {verdict}', flush=True)
        Path(args.out).write_text(json.dumps(out, indent=2))

    Path(args.out).write_text(json.dumps(out, indent=2))
    tally = {}
    for v in out.values():
        tally[v["verdict"]] = tally.get(v["verdict"], 0) + 1
    print(f"\nresolved {len(out)} accessions")
    for k, v in sorted(tally.items(), key=lambda kv: -kv[1]):
        print(f"  {v:>4}  {k}")
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
