#!/usr/bin/env python3
"""Exercise find_methods_span against real heading lists from the corpus.

Every case is a paper in the CAAIL matrix, and every expectation was read off
the paper's actual structure. The fixtures in testdata/headings.json are
generated from the DoclingDocument JSON (see make_fixtures.py), so they cannot
drift from what Docling produced.

Run:  python3 .claude/skills/matrix-classification-audit/docling_sections.test.py

The second block is the part that matters for CAAIL-221: it shows the OLD
`METHODS_HEAD_RE` failing on the same headings the new code handles. A guard
nobody has watched fail on the defect it guards is not evidence of anything.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "zotero-collection-scope"))

from docling_sections import find_methods_span  # noqa: E402
import extract_matrix_corpus as ex  # noqa: E402

FIXTURES = json.load(open(os.path.join(HERE, "testdata", "headings.json")))

# (ref, expected start heading, expected end heading, expected strategy)
# "" as an end heading means the section runs to the end of the document.
CASES = [
    # Straightforward: numbered Methods followed by numbered Results. The one
    # ref in the sample the old extractor did NOT truncate -- and it still
    # over-collected, running past Results to the end of the document.
    ("43",  "2. MATERIALS AND METHODS", "3. RESULTS",   "explicit"),

    # Back-matter methods. `Online Methods` sits on page 22 of 34, AFTER
    # Discussion. The old extractor's positional fallback starts 10% into the
    # document and captures none of it.
    ("51",  "Online Methods",           "References",   "explicit"),

    # Non-standard section name: the methods section is called "Implementation".
    ("220", "2 Implementation",         "4 Conclusion", "explicit"),

    # Non-standard section name: "Experiment", which the old regex missed
    # because it required the adjective "experimental".
    ("333", "Experiment",               "Results",      "explicit"),

    # Roman-numbered sections, and the methods section is named after the
    # method itself. The old regex missed it on both counts: it matched only
    # arabic numbering, and its vocabulary had no entry for a section named
    # after an algorithm.
    ("34",  "II. GENETIC ALGORITHM",    "III. RESULTS", "explicit"),

    # A systems paper with no methods section of any name. Nothing matches the
    # methods vocabulary, so the positional strategy takes the body between the
    # introduction and the conclusion. Deliberately over-inclusive: it collects
    # sections 2 through 6 rather than pretending to a precision the document
    # does not support. The consumer is classification grounding, which wants
    # the substantive body; a 12,000-char slice from 10% in gave it far less.
    ("162", "2. SciAtlas",              "7. Conclusion", "positional"),
]

# Refs where the OLD flat-text regex found no methods heading at all and fell
# back to slicing from 10% into the document.
OLD_REGEX_FAILURES = [k for k, v in FIXTURES.items() if not v["regex_found_methods"]]

fails = 0

print("=== find_methods_span locates the real section ===")
for ref, want_start, want_end, want_strategy in CASES:
    heads = FIXTURES[ref]["headings"]
    got = find_methods_span(heads)
    start = got["heading"]
    end = got["end_heading"]
    ok = (start == want_start and end == want_end
          and got["strategy"] == want_strategy)
    if not ok:
        fails += 1
    print(f'  [{"PASS" if ok else "FAIL"}] ref {ref:>4} '
          f'{got["strategy"]:>10}  {start!r} -> {end!r}')
    if not ok:
        print(f'         want {want_strategy:>10}  {want_start!r} -> {want_end!r}')

print("\n=== every sampled ref now resolves to a section ===")
for ref in sorted(FIXTURES, key=int):
    got = find_methods_span(FIXTURES[ref]["headings"])
    ok = got["found"]
    if not ok:
        fails += 1
    print(f'  [{"PASS" if ok else "FAIL"}] ref {ref:>4} '
          f'{got["strategy"]:>10}  {got["heading"]!r}')

print("\n=== the defect this guards: the OLD regex fails these headings ===")
print("    (each of these is a ref where extract_methods fell back to a")
print("     positional slice; the new code resolves all of them)")
for ref in sorted(OLD_REGEX_FAILURES, key=int):
    heads = FIXTURES[ref]["headings"]
    # Does ANY heading match the old vocabulary? This is the old regex given
    # the best possible input -- a clean heading list rather than raw text --
    # and it still misses, which is why the fix is not "run the old regex on
    # better text".
    old_hit = next((h["text"] for h in heads
                    if ex.METHODS_HEAD_RE.match(h["text"].strip())), None)
    new = find_methods_span(heads)
    # The guard is meaningful only if old misses AND new finds.
    ok = old_hit is None and new["found"]
    if not ok and old_hit is not None:
        # Not a failure of the new code; the old regex happened to match a
        # heading even though it missed in flat text. Report, don't fail.
        print(f'  [note] ref {ref:>4} old regex matched {old_hit!r} on the '
              f'heading list (it missed in flat text)')
        continue
    if not ok:
        fails += 1
    print(f'  [{"PASS" if ok else "FAIL"}] ref {ref:>4} '
          f'old=MISS  new={new["strategy"]} {new["heading"]!r}')


# ---------------------------------------------------------------------------
# Synthetic structures. Real papers cover the conventions we have met; these
# cover the ones that broke the first implementation, each reduced to the
# smallest heading list that reproduces it.
# ---------------------------------------------------------------------------

def h(*names):
    return [{"text": n, "level": 1, "page": i + 1} for i, n in enumerate(names)]


# (name, headings, expected start heading, expected end heading)
SYNTHETIC = [
    # A methods section routinely contains an "Ethics statement" or a "Data
    # availability" subsection. When those ended a section unconditionally, the
    # span collapsed to the methods heading alone -- and because
    # read_docling_section only rejected an EMPTY section, that ~22-char
    # fragment beat the ft-cache and was labelled the better evidence.
    ("ethics subsection does not end methods",
     h("A Paper Title", "Abstract", "Introduction", "Materials and Methods",
       "Ethics statement", "Cell culture", "Statistical analysis",
       "Results", "Discussion", "References"),
     "Materials and Methods", "Results"),
    ("data availability subsection does not end methods",
     h("A Paper Title", "Introduction", "Methods", "Data availability",
       "Cell lines", "Results", "References"),
     "Methods", "Results"),

    # ...but the same heading legitimately ends a BACK-MATTER methods section,
    # where no strong heading follows. Both behaviours come from one rule:
    # strong wins wherever it appears, weak only when no strong one follows.
    ("data availability does end a back-matter methods section",
     h("A Paper Title", "Introduction", "Results", "Discussion",
       "Online Methods", "Cell lines", "Data availability"),
     "Online Methods", "Data availability"),

    # A contents block lists section names before the introduction. Taking the
    # first vocabulary match picked the table-of-contents entry over the real
    # section further down.
    ("a contents entry does not beat the real section",
     h("A Paper Title", "Contents", "Methods", "Results", "Introduction",
       "Materials and Methods", "Cell culture", "Results", "Discussion"),
     "Materials and Methods", "Results"),

    # Heading 0 is usually the title, but not always: skipping it by index threw
    # away the only evidence on a PDF whose first section_header is the methods
    # heading. Three of the ten committed fixtures start with journal furniture
    # ("RESEARCH", "OPENACCESS", "Databases and ontologies"), not a title.
    ("a methods heading at index 0 is not discarded",
     h("Materials and Methods", "Cell culture", "Results", "Discussion"),
     "Materials and Methods", "Results"),
]

print("\n=== synthetic structures that broke the first implementation ===")
for name, heads, want_start, want_end in SYNTHETIC:
    got = find_methods_span(heads)
    ok = got["heading"] == want_start and got["end_heading"] == want_end
    if not ok:
        fails += 1
    print(f'  [{"PASS" if ok else "FAIL"}] {name}')
    print(f'         {got["heading"]!r} -> {got["end_heading"]!r}')
    if not ok:
        print(f'    want {want_start!r} -> {want_end!r}')

print(f'\n{"FAILED" if fails else "OK"}: {fails} failure(s)')
sys.exit(1 if fails else 0)
