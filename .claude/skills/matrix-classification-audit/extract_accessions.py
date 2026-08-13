#!/usr/bin/env python3
"""Extract deposit accessions from each paper's availability statement (CAAIL-259).

`papers-dataset-audit` finds accessions by grepping the flat full-text cache for
accession-shaped patterns. That cannot tell a deposit from a citation: `GSE173199`
matches identically whether the paper deposited it or analysed someone else's copy
of it, and those have opposite consequences for the inventory.

The ingest makes the distinction structural. An accession inside a bounded
data-availability statement is one the paper is announcing. One that appears only
in the introduction or the reference list is one it is citing. This reports both,
labelled, and never merges them.

    python3 .claude/skills/matrix-classification-audit/extract_accessions.py
    python3 .claude/skills/matrix-classification-audit/extract_accessions.py --orphans
    python3 .claude/skills/matrix-classification-audit/extract_accessions.py --json out.json

`--orphans` additionally greps the repo for each declared accession and reports
the ones CAAIL does not hold anywhere. That is the input to a curation decision,
not the decision: this cannot say whether an accession belongs in the inventory,
only that the paper names it and the repo does not mention it.

Two things decide whether an accession is a deposit or reused data, and the tool
says which one decided each. `fetch_accession_citations.py` asks the registry
whether the record cites this paper, which is a fact about the record. Where the
registry is silent or does not cover it, a heuristic reads the sentence around
the accession, which is a guess. Registry evidence always wins.

Half the corpus turns out to be reused data (73 of 145 measured on 2026-08-12),
which is why the distinction is load-bearing rather than pedantic: an early
version of this reported every absent accession as a gap in CAAIL's inventory,
and most of that number was papers' bibliographies.

Stdlib only. Reads the gitignored docling-corpus/ written by docling_ingest.py.
"""
import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]

# Registry patterns. Each is anchored on a word boundary and requires the
# registry's own prefix, so a bare number never matches.
REGISTRIES = [
    ("GEO",            re.compile(r"\bGSE\d{3,}\b")),
    ("GEO sample",     re.compile(r"\bGSM\d{3,}\b")),
    ("BioProject",     re.compile(r"\bPRJ(?:NA|EB|DB)\d{3,}\b")),
    ("SRA",            re.compile(r"\bSR[PRXS]\d{4,}\b")),
    ("ENA",            re.compile(r"\bERP\d{4,}\b")),
    ("ArrayExpress",   re.compile(r"\bE-[A-Z]{4}-\d+\b")),
    ("PRIDE",          re.compile(r"\bPXD\d{4,}\b")),
    ("MassIVE",        re.compile(r"\bMSV\d{6,}\b")),
    ("Metabolights",   re.compile(r"\bMTBLS\d+\b")),
    ("dbGaP",          re.compile(r"\bphs\d{6}(?:\.v\d+\.p\d+)?\b")),
    ("BioSample",      re.compile(r"\bSAM[END][AG]?\d+\b")),
    ("EGA",            re.compile(r"\bEGA[SD]\d{5,}\b")),
    ("PDB",            re.compile(r"\bPDB[:\s]+[0-9][A-Za-z0-9]{3}\b")),
    ("Zenodo DOI",     re.compile(r"\b10\.5281/zenodo\.\d+\b", re.IGNORECASE)),
    ("Figshare DOI",   re.compile(r"\b10\.6084/m9\.figshare\.\d+\b", re.IGNORECASE)),
    ("Dryad DOI",      re.compile(r"\b10\.5061/dryad\.[a-z0-9]+\b", re.IGNORECASE)),
]

GITHUB_RE = re.compile(r"\bgithub\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)")

# Being inside a data-availability statement is NOT enough to call an accession a
# deposit. Availability statements routinely announce reused data: "single-cell
# datasets were obtained from GSE81076, GSE85241 and E-MTAB-5061". Ref 54 lists
# 23 GEO accessions in a table of data sources, none of them its own. Treating
# those as deposits would report a paper's bibliography as missing inventory.
#
# So classify by the language around the accession. This is a heuristic and is
# reported as one: the categories are deposit, reuse and unclear, and unclear is
# not folded into either.
DEPOSIT_CUES = re.compile(
    r"deposit|submitted\s+to|generated\s+(?:in|for|during)\s+this|"
    r"reported\s+in\s+this|produced\s+in\s+this|"
    r"data\s+generated|newly\s+generated|"
    r"have\s+been\s+made\s+available|we\s+have\s+deposited|"
    r"accession\s+(?:code|number)s?\s+(?:is|are)", re.IGNORECASE)

REUSE_CUES = re.compile(
    r"obtained\s+from|downloaded\s+from|retrieved\s+from|"
    r"were\s+(?:taken|sourced)\s+from|publicly\s+available|previously\s+published|"
    r"from\s+the\s+(?:GEO|SRA|ENA|ArrayExpress)|"
    r"we\s+(?:used|analy[sz]ed|collected)|"
    r"third[\s-]party|external\s+dataset", re.IGNORECASE)


def _context(text, start, end, width=260):
    """The sentence-ish window around a match, for cue classification."""
    lo = text.rfind(".", 0, max(0, start - 1))
    lo = 0 if lo < 0 or start - lo > width else lo + 1
    hi = text.find(".", end)
    hi = len(text) if hi < 0 or hi - end > width else hi
    return text[lo:hi]


def classify(context):
    """deposit | reuse | unclear, from the language around an accession."""
    dep, reuse = DEPOSIT_CUES.search(context), REUSE_CUES.search(context)
    if dep and not reuse:
        return "deposit"
    if reuse and not dep:
        return "reuse"
    return "unclear"


def find_accessions(text):
    """{accession: (registry, kind)} for every accession-shaped token in `text`."""
    found = {}
    for registry, pat in REGISTRIES:
        for m in pat.finditer(text or ""):
            tok = m.group(0).strip()
            if tok not in found:
                found[tok] = (registry, classify(_context(text, m.start(), m.end())))
    return found


def repo_mentions(token):
    """Does the repo mention this token anywhere? Uses git grep, so it is fast
    and respects .gitignore -- the point is what CAAIL PUBLISHES, not what
    happens to sit in a local artifact directory."""
    r = subprocess.run(["git", "grep", "-qiF", "--", token],
                       cwd=REPO, capture_output=True, text=True)
    return r.returncode == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--corpus", default=str(REPO / "docling-corpus"))
    ap.add_argument("--orphans", action="store_true",
                    help="also check each declared accession against the repo")
    ap.add_argument("--json", default="")
    ap.add_argument("--citations",
                    default=str(REPO / "docling-corpus/accession-citations.json"),
                    help="fetch_accession_citations.py output. When present its "
                         "verdicts override the sentence heuristic, because the "
                         "registry knows and the sentence only hints.")
    args = ap.parse_args()

    # Registry evidence, if it has been fetched. An accession whose GEO/SRA
    # record cites this paper is a deposit; one whose record cites a different
    # paper is data the authors reused. That is a fact about the record rather
    # than a reading of a sentence, so it wins wherever it exists.
    cites = {}
    cp = Path(args.citations)
    if cp.is_file():
        try:
            cites = json.loads(cp.read_text())
        except ValueError:
            cites = {}

    sec_dir = Path(args.corpus) / "sections"
    paths = sorted(sec_dir.glob("ref-*.json"), key=lambda x: int(x.stem.split("-")[1]))
    if not paths:
        sys.exit(f"no sections in {sec_dir}; run docling_ingest.py first")

    rows = []
    for p in paths:
        d = json.loads(p.read_text())
        declared = {}
        for a in d.get("availability", []):
            for tok, (reg, kind) in find_accessions(a["text"]).items():
                declared.setdefault(tok, {"registry": reg, "kind": kind,
                                          "where": a["heading"],
                                          "page": a["page_start"]})
        # Tables carry deposits too (a KEY RESOURCES TABLE lists them as rows),
        # but a table of data SOURCES looks identical, and a table row carries no
        # sentence to classify. So table hits are never called deposits.
        for t in d.get("tables", []):
            for tok, (reg, _kind) in find_accessions(t.get("markdown", "")).items():
                declared.setdefault(tok, {"registry": reg, "kind": "unclear",
                                          "where": "table", "page": t.get("page")})
        repos = sorted({m.group(1).rstrip(".,);")
                        for a in d.get("availability", [])
                        for m in GITHUB_RE.finditer(a["text"])})
        for tok, meta in declared.items():
            v = cites.get(tok, {})
            meta["source_of_kind"] = "sentence"
            if v.get("verdict") in ("deposit", "reuse"):
                meta["kind"] = v["verdict"]
                meta["source_of_kind"] = "registry"
            elif v.get("verdict") == "no-linked-citation":
                meta["source_of_kind"] = "registry-silent"

        if declared or repos:
            rows.append({
                "id": d["id"],
                "n_availability_sections": len(d.get("availability", [])),
                "accessions": declared,
                "code_repos": repos,
            })

    n_acc = sum(len(r["accessions"]) for r in rows)
    print(f"refs with a declared accession or code repo: {len(rows)}")
    print(f"accessions declared                        : {n_acc}")
    print(f"code repositories declared                 : "
          f"{sum(len(r['code_repos']) for r in rows)}")
    by_reg = Counter(v["registry"] for r in rows for v in r["accessions"].values())
    print("\nby registry:")
    for reg, k in by_reg.most_common():
        print(f"  {k:>4}  {reg}")
    # Where it came from is a fact; what it means is a guess. Print the fact
    # first and give it the emphasis.
    by_src = Counter("table" if v["where"] == "table" else "availability statement"
                     for r in rows for v in r["accessions"].values())
    print("\nby source (factual):")
    for src, k in by_src.most_common():
        print(f"  {k:>4}  {src}")
    print("  A table hit carries no sentence to interpret, and a table of data")
    print("  SOURCES looks exactly like a table of deposits, so these are never")
    print("  called deposits.")

    by_kind = Counter(v["kind"] for r in rows for v in r["accessions"].values())
    by_evi = Counter(v.get("source_of_kind", "sentence")
                     for r in rows for v in r["accessions"].values())
    print("\nby kind:")
    for kind in ("deposit", "reuse", "unclear"):
        print(f"  {by_kind.get(kind, 0):>4}  {kind}")
    print("\nwhat decided the kind:")
    for src, k in by_evi.most_common():
        print(f"  {k:>4}  {src}")
    if not cites:
        print("  No registry evidence loaded. Run fetch_accession_citations.py to")
        print("  replace the sentence guess with what the record actually says.")
    else:
        print("  'registry' means the record's own citation settled it. 'sentence'")
        print("  means it did not, and the reading of the surrounding text stands.")
        print("  'registry-silent' means the record links no paper at all, which is")
        print("  common for recent deposits and is not evidence either way.")

    if args.orphans:
        print("\n--- DEPOSITS the paper announces that the repo does not mention ---")
        print("    A curation input, not a verdict: CAAIL may hold the parent")
        print("     accession, or may have judged the deposit out of scope.\n")
        n_orphan = n_dep_orphan = 0
        for r in rows:
            missing = {t: v for t, v in r["accessions"].items()
                       if not repo_mentions(t)}
            if not missing:
                continue
            n_orphan += len(missing)
            deposits = {t: v for t, v in missing.items() if v["kind"] == "deposit"}
            n_dep_orphan += len(deposits)
            if deposits:
                print(f'  ref {r["id"]}:')
                for tok, v in sorted(deposits.items()):
                    print(f'    {tok:<26} {v["registry"]:<14} '
                          f'p{v["page"]} {v["where"][:32]}')
            r["orphans"] = sorted(missing)
            r["deposit_orphans"] = sorted(deposits)
        print(f"\n{n_dep_orphan} accessions classified as DEPOSITS are absent from the repo.")
        print(f"{n_orphan} of {n_acc} declared accessions are absent overall, but most of")
        print("that number is reused public data the paper cites, which CAAIL has no")
        print("obligation to inventory. Read the deposit figure, not the total.")

    if args.json:
        Path(args.json).write_text(json.dumps(rows, indent=2))
        print(f"\nwrote {args.json}")


if __name__ == "__main__":
    main()
