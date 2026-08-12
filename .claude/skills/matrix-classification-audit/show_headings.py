#!/usr/bin/env python3
"""Print the section headings Docling found for a ref, and the located span.

The curator-facing view of the ingest. When a matrix placement looks wrong, or
a methods section looks short, this shows what the extractor was actually
reading -- which heading it started at, which one it stopped at, and what pages
the section spans -- without opening the PDF.

    python3 .claude/skills/matrix-classification-audit/show_headings.py 51

Reads the gitignored `docling-corpus/` artifact, so run `docling_ingest.py`
first. Imports no docling: it reads the exported JSON.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))

from docling_sections import find_methods_span  # noqa: E402


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    rid = sys.argv[1]
    corpus = REPO / "docling-corpus"
    doc_path = corpus / "docs" / f"ref-{rid}.json"
    if not doc_path.is_file():
        sys.exit(f"no ingest output at {doc_path}\n"
                 f"run: docling_ingest.py --only {rid}")

    d = json.loads(doc_path.read_text())
    heads = []
    for it in d.get("texts", []):
        if it.get("label") != "section_header":
            continue
        prov = it.get("prov") or []
        heads.append({"text": it.get("text", ""), "level": it.get("level"),
                      "page": prov[0].get("page_no") if prov else None})

    span = find_methods_span(heads)
    print(f"--- ref {rid}: {len(heads)} section headings ---")
    for i, h in enumerate(heads):
        mark = "  "
        if span["found"] and i == span["start"]:
            mark = ">>"
        elif span["end"] is not None and i == span["end"]:
            mark = "<<"
        page = f'p{h["page"]}' if h["page"] else ""
        print(f'{mark} L{h["level"]} {page:>5}  {h["text"][:90]}')

    print(f'\nstrategy : {span["strategy"]}')
    print(f'start    : {span["heading"]!r}')
    print(f'end      : {span["end_heading"]!r}'
          + ("" if span["end"] is not None else "  (runs to end of document)"))

    sec_path = corpus / "sections" / f"ref-{rid}.json"
    if sec_path.is_file():
        sec = json.loads(sec_path.read_text())
        print(f'pages    : {sec.get("page_start")}-{sec.get("page_end")} '
              f'of {sec.get("n_pages")}')
        print(f'chars    : {len(sec.get("methods_text", "")):,}'
              f'   tables in section: {sec.get("n_tables", 0)}')


if __name__ == "__main__":
    main()
