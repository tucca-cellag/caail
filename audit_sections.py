#!/usr/bin/env python3
"""Report the quality distribution of the sections written so far.

Surfaces the two things worth acting on: refs where no section was located at
all, and refs whose section is short enough to be a boundary bug rather than a
short methods section.
"""
import json
from collections import Counter
from pathlib import Path

SEC = Path("docling-corpus/sections")
rows = []
for p in sorted(SEC.glob("ref-*.json"), key=lambda x: int(x.stem.split("-")[1])):
    d = json.loads(p.read_text())
    rows.append({
        "id": d["id"],
        "strategy": d.get("strategy", "?"),
        "chars": len(d.get("methods_text", "")),
        "heading": d.get("heading", ""),
        "end": d.get("end_heading", ""),
        "pages": (d.get("page_start"), d.get("page_end")),
        "n_pages": d.get("n_pages"),
        "n_headings": len(d.get("headings", [])),
    })

print(f"sections written: {len(rows)}")
print("strategies:", dict(Counter(r["strategy"] for r in rows)))
print()

none = [r for r in rows if r["strategy"] == "none"]
print(f"--- located NOTHING: {len(none)} ---")
for r in none:
    print(f'  ref {r["id"]:>4}  {r["n_headings"]:>3} headings, {r["n_pages"]} pages')

short = [r for r in rows if r["strategy"] != "none" and r["chars"] < 400]
print(f"\n--- located but under 400 chars (boundary suspect): {len(short)} ---")
for r in short:
    print(f'  ref {r["id"]:>4}  {r["chars"]:>6} chars  {r["heading"]!r} -> {r["end"]!r}')

ok = [r for r in rows if r["chars"] >= 400]
if ok:
    sizes = sorted(r["chars"] for r in ok)
    print(f"\n--- usable: {len(ok)} ---")
    print(f'  median {sizes[len(sizes)//2]:,}  min {sizes[0]:,}  max {sizes[-1]:,}')
    print(f'  larger than the old 12,000 window: {sum(1 for s in sizes if s > 12000)}')
