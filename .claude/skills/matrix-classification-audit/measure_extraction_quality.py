#!/usr/bin/env python3
"""Measure how good the corpus' methods extraction actually is. Zero model calls.

Prints the numbers that justify the Docling ingest, and prints them from the
code being measured rather than from a comment. CLAUDE.md's most expensive
recurring bug is a hand-typed fact sitting next to a machine-derived one, and
this ticket has already produced two of them:

* An early CAAIL-206 revision reported the heading-fallback rate as 29%. The
  measurement regex had omitted the optional `s` in `methods?`, so singular
  "Method" headings were miscounted.
* The same ticket reported truncation as 159 refs (72%). That counts refs whose
  `methods_text` is exactly `METHODS_WINDOW` chars -- but `extract_methods`
  `.strip()`s its result, so a cut landing next to whitespace yields 11,99x and
  is missed. The real figure is 213 (96%).

So this script imports `extract_matrix_corpus` and calls its own functions. It
does not restate the heading regex, the window size, or the fallback rule.

    python3 .claude/skills/matrix-classification-audit/measure_extraction_quality.py

Requires the Zotero local API (Zotero running, "Allow other applications" on).
"""
import argparse
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "zotero-collection-scope"))

import extract_matrix_corpus as ex  # noqa: E402
import scope  # noqa: E402


def measure(api, groups, storage, papers_md, docling_corpus):
    md = Path(papers_md).read_text(encoding="utf-8")
    _, cell_map = ex.parse_matrix(md)
    refs = ex.parse_references(md)
    matrix_ids = sorted(cell_map)

    doi_index, url_index = ex.build_indexes(api, groups)

    rows = []
    for rid in matrix_ids:
        ref = refs.get(rid, {})
        hit = (doi_index.get(ref.get("doi", "").lower()) if ref.get("doi") else None) \
            or (url_index.get(ex._norm_url(ref.get("url", ""))) if ref.get("url") else None)
        row = {"id": rid, "has_fulltext": False, "heading_found": None,
               "truncated": None, "dropped": 0, "docling": None}
        if hit:
            group, item = hit
            pdf_key = scope.find_pdf_attachment_key(api, group, item.get("key"))
            ft = ex.read_ftcache(storage, pdf_key)
            if ft:
                row["has_fulltext"] = True
                # Ask the extractor where it starts. Do not restate the rule:
                # this script's whole claim is that it reports what the code
                # does, so a private copy here would produce a measured-looking
                # wrong number, which is the exact failure the docstring's two
                # cautionary examples describe.
                start, matched = ex.methods_start(ft)
                tail = len(ft) - start
                row.update(heading_found=matched,
                           truncated=tail > ex.METHODS_WINDOW,
                           dropped=max(0, tail - ex.METHODS_WINDOW),
                           emitted=len(ex.extract_methods(ft)))
        sec = ex.read_docling_section(docling_corpus, rid)
        if sec:
            row["docling"] = {
                "strategy": sec.get("strategy"),
                "chars": len(sec.get("methods_text", "")),
                "heading": sec.get("heading", ""),
                "pages": [sec.get("page_start"), sec.get("page_end")],
            }
        rows.append(row)
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--papers", default=str(REPO / "Papers.md"))
    ap.add_argument("--api", default="http://localhost:23119/api")
    ap.add_argument("--zotero-storage", default=os.path.expanduser("~/Zotero/storage"))
    ap.add_argument("--docling-corpus", default=str(REPO / "docling-corpus"))
    ap.add_argument("--group", action="append", default=[])
    ap.add_argument("--json", default="", help="also write the per-ref rows here")
    args = ap.parse_args()

    rows = measure(args.api, args.group or ["6549203", "5178481"],
                   args.zotero_storage, args.papers, args.docling_corpus)

    ft = [r for r in rows if r["has_fulltext"]]
    n = len(ft)
    trunc = [r for r in ft if r["truncated"]]
    fallback = [r for r in ft if not r["heading_found"]]
    doc = [r for r in rows if r["docling"]]

    def pct(k):
        """k as a share of n. n is 0 when nothing resolved -- a mistyped
        --group, or a Zotero that answered but matched nothing -- and this tool
        reporting that plainly is worth more than a traceback."""
        return f"({k / n:.0%})" if n else "(n/a)"

    print(f"matrix refs                    : {len(rows)}")
    print(f"  with ft-cache full text      : {n}")
    if not n:
        print("\n  No ref resolved to ft-cache text. Check that Zotero is running with")
        print("  'Allow other applications' enabled, and that --group is right.")
    print()
    print("--- the ft-cache extractor (extract_methods) ---")
    print(f"window                         : {ex.METHODS_WINDOW:,} chars")
    print(f"heading found                  : {n - len(fallback):>4} {pct(n - len(fallback))}")
    print(f"positional fallback            : {len(fallback):>4} {pct(len(fallback))}")
    print(f"TRUNCATED at the window        : {len(trunc):>4} {pct(len(trunc))}")
    exact = sum(1 for r in ft if r.get("emitted") == ex.METHODS_WINDOW)
    print(f"  ...of which land at exactly {ex.METHODS_WINDOW:,}: {exact}")
    print(f"  the {len(trunc) - exact} refs between the two counts are the ones a")
    print(f"  `len(methods_text) == {ex.METHODS_WINDOW}` test misses, because")
    print("  extract_methods strips its return value.")
    print(f"chars beyond reach of the window: {sum(r['dropped'] for r in trunc):,}")
    print()
    print("--- the Docling ingest (docling_ingest.py) ---")
    if not doc:
        print("no docling-corpus sections found; run docling_ingest.py")
    else:
        strat = {}
        for r in doc:
            k = r["docling"]["strategy"]
            strat[k] = strat.get(k, 0) + 1
        print(f"refs with a located section    : {len(doc):>4} ({len(doc) / len(rows):.0%} of matrix)")
        for k, v in sorted(strat.items()):
            print(f"  strategy {k:<20} : {v:>4}")
        # The refs that mattered most: those the ft-cache path could not resolve.
        rescued = [r for r in doc if r["has_fulltext"] and not r["heading_found"]]
        print(f"refs rescued from the positional fallback: {len(rescued)}"
              f" of {len(fallback)}")
        sizes = sorted(r["docling"]["chars"] for r in doc)
        print(f"methods section chars          : median {sizes[len(sizes) // 2]:,}"
              f"  max {sizes[-1]:,}")
        over = [r for r in doc if r["docling"]["chars"] > ex.METHODS_WINDOW]
        print(f"sections LARGER than the old window: {len(over)}"
              f" -- these were being cut off")

    if args.json:
        Path(args.json).write_text(json.dumps(rows, indent=2))
        print(f"\nwrote {args.json}")


if __name__ == "__main__":
    main()
