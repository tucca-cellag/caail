#!/usr/bin/env python3
"""Rank matrix refs by how much the evidence a curator reads has changed.

The Docling ingest replaced a blind 12,000-character window with a bounded
methods section. For most refs that is an improvement nobody needs to look at.
For some it means the text a placement was justified against was mostly not the
methods section at all -- and those are where a re-audit (CAAIL-203) should
start, because that is where the classification rested on something else.

Three numbers per ref:

  coverage       share of the REAL methods section that the old window contained,
                 over 5-word shingles. Low coverage means the curator never saw
                 most of the methods.
  contamination  share of the OLD window that is not in the methods section.
                 High contamination means most of what they read was Results,
                 Discussion or references presented as methods.
  vocab          share of the methods section's VOCABULARY present in the old
                 window, over single words.

The third exists to keep the first two honest. The ft-cache and Docling disagree
about reading order on multi-column layouts -- Zotero interleaves columns,
Docling reconstructs them -- so a low shingle score could in principle mean "same
content, different word order" rather than "different content". When vocab is
high and coverage is near zero, the two texts share only domain vocabulary, which
is what genuinely different sections of the same paper look like. Measured on the
corpus, the low-coverage refs sit at 18-41% vocab and 1-5% 3-gram overlap, so the
divergence is real rather than an artifact of the comparison.

None of this is a verdict. A placement can be correct on partial evidence, and
most are. These rank where to look; they do not say what is wrong.

    python3 .claude/skills/matrix-classification-audit/compare_extraction.py
    python3 .claude/skills/matrix-classification-audit/compare_extraction.py --json out.json

Requires the Zotero local API (for the ft-cache) and a populated
docling-corpus/ (for the sections).
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "zotero-collection-scope"))

import extract_matrix_corpus as ex  # noqa: E402
import scope  # noqa: E402

# 5 words: long enough to identify a passage rather than a phrase, short enough
# to survive the line-break and hyphenation differences between the two
# extractors. At 8 the low-coverage refs all read 0%, which is true but tells
# you less than 5 does.
SHINGLE = 5


def shingles(text, n=SHINGLE):
    """Set of n-word shingles over lowercased alphanumeric tokens.

    Normalizing to word tokens is the point: the ft-cache and Docling disagree
    about line breaks, hyphenation and column order constantly, and comparing
    raw strings would report those as content changes.
    """
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    if len(words) < n:
        return {" ".join(words)} if words else set()
    return {" ".join(words[i:i + n]) for i in range(len(words) - n + 1)}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--papers", default=str(REPO / "Papers.md"))
    ap.add_argument("--api", default="http://localhost:23119/api")
    ap.add_argument("--zotero-storage", default=os.path.expanduser("~/Zotero/storage"))
    ap.add_argument("--docling-corpus", default=str(REPO / "docling-corpus"))
    ap.add_argument("--group", action="append", default=[])
    ap.add_argument("--json", default="")
    ap.add_argument("--top", type=int, default=25,
                    help="how many refs to print in each ranking")
    args = ap.parse_args()

    md = Path(args.papers).read_text(encoding="utf-8")
    _, cell_map = ex.parse_matrix(md)
    refs = ex.parse_references(md)
    doi_index, url_index = ex.build_indexes(
        args.api, args.group or ["6549203", "5178481"])

    rows = []
    for rid in sorted(cell_map):
        sec = ex.read_docling_section(args.docling_corpus, rid)
        if not sec:
            continue
        ref = refs.get(rid, {})
        hit = (doi_index.get(ref.get("doi", "").lower()) if ref.get("doi") else None) \
            or (url_index.get(ex._norm_url(ref.get("url", ""))) if ref.get("url") else None)
        if not hit:
            continue
        group, item = hit
        ft = ex.read_ftcache(args.zotero_storage,
                             scope.find_pdf_attachment_key(args.api, group, item.get("key")))
        if not ft:
            continue

        old = ex.extract_methods(ft)
        new = sec["methods_text"]
        s_old, s_new = shingles(old), shingles(new)
        if not s_old or not s_new:
            continue
        inter = s_old & s_new
        w_old, w_new = shingles(old, 1), shingles(new, 1)
        rows.append({
            "id": rid,
            "title": (ref.get("title") or "")[:70],
            "cells": [f'{m} x {a}' for (m, a) in sorted(cell_map[rid])],
            "old_chars": len(old),
            "new_chars": len(new),
            "heading": sec.get("heading", ""),
            "pages": [sec.get("page_start"), sec.get("page_end")],
            "coverage": len(inter) / len(s_new),
            "contamination": 1 - (len(inter) / len(s_old)),
            "vocab": len(w_old & w_new) / len(w_new) if w_new else 0.0,
        })

    if not rows:
        sys.exit("no ref had both a docling section and ft-cache text")

    print(f"compared {len(rows)} matrix refs "
          f"(both a located section and ft-cache text)\n")

    def band(lo, hi):
        return [r for r in rows if lo <= r["coverage"] < hi]

    print("coverage -- share of the real methods section the old window contained")
    for lo, hi, label in [(0, .25, "under 25%"), (.25, .5, "25-50%"),
                          (.5, .75, "50-75%"), (.75, 1.01, "75%+")]:
        print(f"  {label:>10}: {len(band(lo, hi)):>4}")

    worst = sorted(rows, key=lambda r: r["coverage"])[:args.top]
    print(f"\n--- lowest coverage: the old window missed most of the methods ---")
    print("    vocab stays moderate while coverage is near zero, which is what")
    print("    two different sections of one paper look like.\n")
    print(f'{"ref":>5} {"cov":>5} {"cont":>6} {"vocab":>6} {"old":>7} {"new":>7}  heading')
    for r in worst:
        print(f'{r["id"]:>5} {r["coverage"]:>5.0%} {r["contamination"]:>6.0%} '
              f'{r["vocab"]:>6.0%} {r["old_chars"]:>7} {r["new_chars"]:>7}  '
              f'{r["heading"][:36]}')
        print(f'{"":>32}  {", ".join(r["cells"])[:86]}')

    if args.json:
        Path(args.json).write_text(json.dumps(
            sorted(rows, key=lambda r: r["coverage"]), indent=2))
        print(f"\nwrote {args.json}")


if __name__ == "__main__":
    main()
