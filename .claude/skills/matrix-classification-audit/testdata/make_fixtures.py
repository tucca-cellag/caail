#!/usr/bin/env python3
"""Regenerate headings.json, the fixtures docling_sections.test.py runs against.

Derived, never hand-typed: every heading is read out of the DoclingDocument
JSON that `docling_ingest.py` produced, so a fixture cannot claim a structure
Docling did not find. `regex_found_methods` is likewise computed by running the
OLD `METHODS_HEAD_RE` over the paper's ft-cache, not recorded by hand -- it is
the flag the test's third block relies on to know which refs the previous
extractor failed.

Only heading text, level and page number are kept. No body text, so the
committed fixture carries nothing redistributable from the papers.

    python3 .claude/skills/matrix-classification-audit/testdata/make_fixtures.py

Run it after re-running the ingest, or when adding a ref to REFS below because
a new failure mode turned up and deserves a test.
"""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
REPO = SKILL.parents[2]
sys.path.insert(0, str(SKILL))
sys.path.insert(0, str(SKILL.parent / "zotero-collection-scope"))

import extract_matrix_corpus as ex  # noqa: E402
import scope  # noqa: E402

# The refs the test covers. Each earns its place by exhibiting a distinct
# failure of the flat-text extractor; see docling_sections.test.py for which.
REFS = [24, 34, 43, 51, 93, 98, 104, 162, 220, 333]

API = "http://localhost:23119/api"
STORAGE = os.path.expanduser("~/Zotero/storage")
SECTIONS = REPO / "docling-corpus" / "sections"


def old_regex_found(rid, doi_index, url_index, refs):
    """Did the OLD flat-text regex find a methods heading for this ref?"""
    ref = refs.get(rid, {})
    hit = (doi_index.get(ref.get("doi", "").lower()) if ref.get("doi") else None) \
        or (url_index.get(ex._norm_url(ref.get("url", ""))) if ref.get("url") else None)
    if not hit:
        return None
    group, item = hit
    ft = ex.read_ftcache(STORAGE, scope.find_pdf_attachment_key(API, group, item.get("key")))
    if not ft:
        return None
    floor = len(ft) // 20
    return any(m.start() >= floor for m in ex.METHODS_HEAD_RE.finditer(ft))


def main():
    md = (REPO / "Papers.md").read_text(encoding="utf-8")
    refs = ex.parse_references(md)
    doi_index, url_index = ex.build_indexes(API, ["6549203", "5178481"])

    missing = [r for r in REFS if not (SECTIONS / f"ref-{r}.json").is_file()]
    if missing:
        sys.exit(f"ERROR: no ingest output for refs {missing}.\n"
                 f"Run docling_ingest.py (--only {' --only '.join(map(str, missing))}) first.")

    fixtures = {}
    for rid in REFS:
        # Take the heading list the ingest recorded, not one re-derived from the
        # exported document's flat `texts` array. The ingest walks the body tree
        # in reading order; re-deriving would write a fixture that
        # find_methods_span is never handed in production, which is precisely
        # what this file's docstring promises cannot happen.
        heads = json.loads((SECTIONS / f"ref-{rid}.json").read_text())["headings"]
        fixtures[str(rid)] = {
            "title": (refs.get(rid, {}).get("title") or ""),
            "regex_found_methods": old_regex_found(rid, doi_index, url_index, refs),
            "headings": heads,
        }

    out = HERE / "headings.json"
    out.write_text(json.dumps(fixtures, indent=2, ensure_ascii=False))
    print(f"wrote {out} with {len(fixtures)} refs")
    for k, v in sorted(fixtures.items(), key=lambda kv: int(kv[0])):
        print(f"  ref {k:>4}: {len(v['headings']):>3} headings  "
              f"old_regex_found={v['regex_found_methods']}")


if __name__ == "__main__":
    main()
