#!/usr/bin/env python3
"""Quality report over the located methods sections, and what still fails.

Answers the two questions worth asking after an ingest: how good is the corpus,
and what is left to fix. Spans are recomputed with the CURRENT rule rather than
read from the stored `strategy`, so a vocabulary change shows up here without a
`--respan` first -- which is how you tell whether a rule change is worth one.

    python3 .claude/skills/matrix-classification-audit/audit_sections.py
    python3 .claude/skills/matrix-classification-audit/audit_sections.py --misses

`--misses` prints the full heading list of every ref that still resolves to
nothing, which is the input to deciding whether a miss is a naming convention
worth adding or a paper whose methods are simply not in the PDF. Both exist:
Science research articles put methods in a supplementary file the library does
not hold, and no vocabulary rule can recover a section that is not there.
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))

from docling_sections import find_methods_span  # noqa: E402

# Matches read_docling_section's floor in extract_matrix_corpus: below this a
# "section" is a boundary bug, and preferring it would be worse than the
# ft-cache fallback it displaces.
MIN_SECTION_CHARS = 400


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--corpus", default=str(REPO / "docling-corpus"))
    ap.add_argument("--misses", action="store_true",
                    help="print the heading list of every unresolved ref")
    args = ap.parse_args()

    sec_dir = Path(args.corpus) / "sections"
    paths = sorted(sec_dir.glob("ref-*.json"),
                   key=lambda x: int(x.stem.split("-")[1]))
    if not paths:
        sys.exit(f"no sections in {sec_dir}; run docling_ingest.py first")

    rows, misses = [], []
    for p in paths:
        d = json.loads(p.read_text())
        span = find_methods_span(d.get("headings", []))
        rows.append({
            "id": d["id"],
            "strategy": span["strategy"] if span["found"] else "none",
            "stored": d.get("strategy", "?"),
            # The END is part of staleness, not just the strategy and start.
            # Ref 334 stored the right strategy and the right start heading and
            # a 24-char section, because the old rule let "2.1. Ethics
            # Statement" terminate it. Comparing strategies alone calls that
            # current.
            "end": span["end_heading"],
            "stored_end": d.get("end_heading", ""),
            "chars": len(d.get("methods_text", "")),
            "n_pages": d.get("n_pages"),
            "n_headings": len(d.get("headings", [])),
        })
        if not span["found"]:
            misses.append(d)

    print(f"sections: {len(rows)}")
    print("strategies (current rule):", dict(Counter(r["strategy"] for r in rows)))

    stale = [r for r in rows
             if r["strategy"] != r["stored"] or r["end"] != r["stored_end"]]
    if stale:
        print(f"\n{len(stale)} section(s) were written under a different rule than the")
        print("current one. Run docling_ingest.py --respan to bring them up to date:")
        for r in stale[:15]:
            print(f'  ref {r["id"]:>4}  stored={r["stored"]:<11}-> {r["stored_end"]!r:<28} '
                  f'current={r["strategy"]} -> {r["end"]!r}')
        if len(stale) > 15:
            print(f"  ... and {len(stale) - 15} more")

    usable = [r for r in rows if r["chars"] >= MIN_SECTION_CHARS]
    short = [r for r in rows if r["stored"] != "none" and r["chars"] < MIN_SECTION_CHARS]
    if usable:
        sizes = sorted(r["chars"] for r in usable)
        print(f"\nusable sections (>= {MIN_SECTION_CHARS} chars): {len(usable)}")
        print(f'  median {sizes[len(sizes) // 2]:,}   min {sizes[0]:,}   max {sizes[-1]:,}')
        print(f"  larger than the old 12,000-char window: "
              f"{sum(1 for s in sizes if s > 12000)}")
    if short:
        print(f"\nlocated but under {MIN_SECTION_CHARS} chars (boundary suspects): {len(short)}")
        for r in short:
            print(f'  ref {r["id"]:>4}  {r["chars"]:>6} chars')

    print(f"\nunresolved: {len(misses)}")
    for d in misses:
        print(f'  ref {d["id"]:>4}  {len(d.get("headings", [])):>3} headings, '
              f'{d.get("n_pages")} pages')

    if args.misses:
        for d in misses:
            print(f'\n=== ref {d["id"]} ===')
            for h in d.get("headings", []):
                page = f'p{h.get("page")}' if h.get("page") else ""
                print(f'   {page:>5}  {(h.get("text") or "")[:88]}')


if __name__ == "__main__":
    main()
