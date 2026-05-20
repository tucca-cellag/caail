#!/usr/bin/env python3
"""Diff the caail Zotero group library against the CAAIL repo.

Pulls every top-level item from the local Zotero API (paginated — the library
exceeds one API page), deduplicates within Zotero by DOI/URL, and reports which
distinct works are NOT yet present in the repo.

Usage:
    python3 zotero_diff.py [REPO_ROOT] [--json]

REPO_ROOT defaults to the CAAIL repo root inferred from this script's location.
--json emits a machine-readable report instead of the human-readable one.

This script handles the MECHANICAL steps (pagination, dedup, presence check).
Classification, citation, and matrix edits are judgment calls — see SKILL.md.
"""
import json
import sys
import urllib.request
import urllib.error
from urllib.parse import urlparse
from pathlib import Path

GROUP = "6549203"
API = f"http://localhost:23119/api/groups/{GROUP}/items/top"
PAGE = 100
REPO_FILES = ["Papers.md", "Software.md", "Datasets.md", "Databases.md",
              "OtherResources.md", "README.md"]

# Canonical-type priority for intra-Zotero dedup (lower rank = preferred).
# A work stashed as both a preprint and a journalArticle keeps the journalArticle;
# a work stashed as preprint + computerProgram keeps the preprint.
TYPE_RANK = {"journalArticle": 0, "conferencePaper": 1, "preprint": 2,
             "bookSection": 3, "book": 3, "report": 4, "computerProgram": 5,
             "webpage": 6, "blogPost": 7, "videoRecording": 8}


def fetch_all():
    """Page through items/top until a short page signals the end."""
    items, start = [], 0
    while True:
        url = f"{API}?start={start}&limit={PAGE}&format=json"
        try:
            with urllib.request.urlopen(url, timeout=20) as resp:
                batch = json.load(resp)
        except urllib.error.URLError as exc:
            sys.exit(f"ERROR: cannot reach the Zotero local API ({exc}).\n"
                     "Open Zotero, enable Preferences > Advanced > "
                     "'Allow other applications on this computer to "
                     "communicate with Zotero', and sync the caail group.")
        items.extend(batch)
        if len(batch) < PAGE:          # last (short) page reached
            return items
        start += PAGE


def norm_doi(doi):
    return (doi or "").strip().lower().replace("https://doi.org/", "")


def main():
    args = [a for a in sys.argv[1:] if a != "--json"]
    as_json = "--json" in sys.argv
    repo = Path(args[0]) if args else Path(__file__).resolve().parents[3]

    blob = ""
    for name in REPO_FILES:
        path = repo / name
        if path.exists():
            blob += path.read_text(encoding="utf-8").lower()
    ra = repo / "ResearchAreas"
    if ra.is_dir():
        for path in ra.glob("*.md"):
            blob += path.read_text(encoding="utf-8").lower()

    items = fetch_all()

    # Dedup within Zotero: collapse multiple records of one work to the
    # canonical type. Key on normalized DOI, else URL, else the Zotero key.
    works = {}
    for it in items:
        data = it["data"]
        itype = data.get("itemType", "")
        if itype in ("attachment", "note"):
            continue
        doi = norm_doi(data.get("DOI"))
        key = doi or (data.get("url", "") or "").strip().lower() or it["key"]
        rank = TYPE_RANK.get(itype, 9)
        if key not in works or rank < works[key][0]:
            works[key] = (rank, it)

    # Triage each distinct work into three buckets:
    #   present  - DOI or exact URL already in the repo
    #   review   - identifier not found, but the URL's domain IS in the repo
    #              (almost always the same resource catalogued under a
    #              different link/DOI — e.g. a tool's homepage vs its paper)
    #   missing  - neither the identifier nor the domain appears: a real gap
    missing, review, present = [], [], 0
    for _, it in works.values():
        data = it["data"]
        doi = norm_doi(data.get("DOI"))
        url = (data.get("url", "") or "").strip().lower()
        found = bool((doi and doi in blob) or (url and url in blob))
        if not found and doi.startswith("10.48550/arxiv."):
            found = doi.split("arxiv.")[-1] in blob   # bare arXiv-id fallback
        if found:
            present += 1
            continue
        domain = urlparse(url).netloc.removeprefix("www.")
        (review if domain and domain in blob else missing).append(it)

    if as_json:
        print(json.dumps({
            "missing": [_brief(it) for it in missing],
            "review": [_brief(it) for it in review],
        }, indent=2, ensure_ascii=False))
        return

    print(f"Zotero top-level items: {len(items)}  |  distinct works: "
          f"{len(works)}  |  in repo: {present}  |  MISSING: {len(missing)}"
          f"  |  REVIEW: {len(review)}\n")
    print("== MISSING (genuine gaps — identifier and domain both absent) ==\n")
    _dump(missing)
    print("\n== REVIEW (domain already in repo — likely present under a "
          "different link/DOI; confirm by name before adding) ==\n")
    _dump(review)


def _brief(it):
    d = it["data"]
    return {"key": it["key"], "itemType": d.get("itemType"),
            "title": d.get("title"), "DOI": d.get("DOI"),
            "url": d.get("url"), "date": d.get("date")}


def _dump(bucket):
    for it in sorted(bucket, key=lambda x: x["data"].get("itemType", "")):
        data = it["data"]
        print(f"  [{data.get('itemType', '?'):16}] {data.get('title', '(no title)')}")
        print(f"  {'':18} DOI={data.get('DOI') or '-'}  url={data.get('url') or '-'}")


if __name__ == "__main__":
    main()
