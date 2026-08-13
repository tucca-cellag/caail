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
    sec_path = corpus / "sections" / f"ref-{rid}.json"
    if not sec_path.is_file():
        sys.exit(f"no ingest output at {sec_path}\n"
                 f"run: docling_ingest.py --only {rid}")

    # Read the heading list the ingest recorded rather than re-deriving one from
    # the exported document. The ingest walks the body tree in reading order via
    # iterate_items(); the flat `texts` array is insertion-ordered and includes
    # items not attached to the body, so re-deriving here would show a span
    # computed from one ordering above page and character counts computed from
    # the other, and the two would silently disagree.
    sec = json.loads(sec_path.read_text())
    heads = sec.get("headings", [])

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
    print(f'pages    : {sec.get("page_start")}-{sec.get("page_end")} '
          f'of {sec.get("n_pages")}')
    print(f'chars    : {len(sec.get("methods_text", "")):,}'
          f'   tables in section: {sec.get("n_tables", 0)}')

    # The span above is recomputed live from the recorded headings, so it shows
    # what the CURRENT rule would do. The stored one is what the last ingest
    # wrote. They differ exactly when the rule has changed since -- which is the
    # moment to re-span, so say so rather than showing two numbers side by side.
    # Compare the END too, not just the strategy and start. Ref 334 is exactly
    # why: its stored section has the right strategy and the right start heading
    # and stops after 24 characters, because the old rule let "2.1. Ethics
    # Statement" terminate it. Checking only the start reports that as current.
    if (sec.get("strategy") != span["strategy"]
            or sec.get("heading") != span["heading"]
            or sec.get("end_heading") != span["end_heading"]):
        print(f'\nNOTE: stored section says {sec.get("strategy")} '
              f'{sec.get("heading")!r} -> {sec.get("end_heading")!r},\n'
              f'      but the current rule says {span["strategy"]} '
              f'{span["heading"]!r} -> {span["end_heading"]!r}.\n'
              f'      Run docling_ingest.py --respan to bring sections/ up to date.')


if __name__ == "__main__":
    main()
