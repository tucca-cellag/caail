#!/usr/bin/env python3
"""Guard the main-PDF rule: which Zotero attachment is a paper's own text.

Every curation script that reads a paper's text (the Docling ingest, the flat
full-text extractor, the dataset audit) resolves it through
scope.select_main_pdf. Before CAAIL-436 each took the first PDF attachment
Zotero listed, so attaching a supplement could silently swap it in for the
paper. Supplements are now marked with the Zotero tag 'supplement', and an item
with two untagged PDFs is refused rather than guessed.

Run:  python3 .claude/skills/zotero-collection-scope/scope.test.py

Stdlib only, no Zotero and no network, so CI runs it. The second block runs
the old first-listed rule on the same inputs: a guard nobody has watched fail
on the defect it guards is not evidence of anything.
"""
import os
import sys
import tokenize

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import scope  # noqa: E402

fails = 0


def child(key, content_type="application/pdf", tags=(), title="",
          link_mode="imported_file"):
    """A Zotero child item in the local API's JSON shape."""
    return {"key": key, "data": {
        "key": key, "itemType": "attachment", "contentType": content_type,
        "linkMode": link_mode, "title": title,
        "tags": [{"tag": t} for t in tags]}}


NOTE = {"key": "N1", "data": {"key": "N1", "itemType": "note", "tags": []}}
MAIN = child("MAIN")
SUPP = child("SUPP", tags=("supplement",), title="Supplementary: Data S1")

CASES = [
    ("one untagged PDF is the main text", [MAIN], ("MAIN", "")),
    ("no children", [], (None, "no-pdf-attachment")),
    ("a note is not a PDF", [NOTE], (None, "no-pdf-attachment")),
    # The CAAIL-436 defect: Zotero lists the supplement first.
    ("a tagged supplement listed first is skipped", [SUPP, MAIN], ("MAIN", "")),
    ("a tagged supplement listed second is skipped", [MAIN, SUPP], ("MAIN", "")),
    ("two untagged PDFs are refused, not guessed",
     [MAIN, child("OTHER")], (None, "ambiguous-main-pdf")),
    ("only supplements means no main text",
     [SUPP, child("SUPP2", tags=("supplement",))], (None, "only-supplement-pdfs")),
    ("the tag match ignores case and surrounding space",
     [child("S", tags=(" Supplement ",)), MAIN], ("MAIN", "")),
    # A near-miss tag is NOT a supplement, so the item becomes ambiguous and is
    # refused: a typo fails closed instead of choosing a file.
    ("a near-miss tag is not the supplement tag",
     [child("S", tags=("supplementary",)), MAIN], (None, "ambiguous-main-pdf")),
    # The title is for people; the code reads only the tag.
    ("a supplement title without the tag is not read",
     [child("S", title="Supplementary: Table S2"), MAIN], (None, "ambiguous-main-pdf")),
    ("an EPUB beside the PDF is not a PDF",
     [child("E", content_type="application/epub+zip"), MAIN], ("MAIN", "")),
    # No script can read a link to a URL, so it cannot be the main text.
    ("a PDF linked by URL is not a candidate",
     [child("L", link_mode="linked_url"), MAIN], ("MAIN", "")),
]

print("=== select_main_pdf ===")
for name, children, want in CASES:
    got = scope.select_main_pdf(children)
    ok = got == want
    if not ok:
        fails += 1
    print(f'  [{"PASS" if ok else "FAIL"}] {name}')
    if not ok:
        print(f"         got {got!r}, want {want!r}")

# Every refusal is reported to a curator through PDF_REASON_TEXT, so a new
# reason without wording would print as a bare code.
reasons = {want[1] for _, _, want in CASES if want[1]}
unworded = sorted(reasons - set(scope.PDF_REASON_TEXT))
if unworded:
    fails += 1
print(f'  [{"PASS" if not unworded else "FAIL"}] every refusal reason has '
      f'curator text{"" if not unworded else f" (missing {unworded})"}')


def old_first_listed(children):
    """The rule this replaced: the first PDF attachment, whatever it is."""
    for c in children:
        if c.get("data", {}).get("contentType") == "application/pdf":
            return c.get("data", {}).get("key")
    return None


print("\n=== the old first-listed rule, on the same defect ===")
old = old_first_listed([SUPP, MAIN])
ok = old == "SUPP"
if not ok:
    fails += 1
print(f'  [{"PASS" if ok else "FAIL"}] the old rule converts the supplement '
      f'as the paper (got {old!r})')

# One rule, one place. A script that picks attachments by content type on its
# own is how the ingest and the audit could read different files for one ref.
print("\n=== no second copy of the rule ===")
skills = os.path.dirname(HERE)
exempt = {os.path.abspath(scope.__file__), os.path.abspath(__file__)}


def names_pdf_type(path):
    """True when a string literal in the file spells the PDF content type.

    Any string, not only `contentType == "application/pdf"`: a reversed
    comparison, a module constant or a membership test is the same copy.
    Comments are not code, so they are not read.
    """
    with open(path, encoding="utf-8") as fh:
        tokens = tokenize.generate_tokens(fh.readline)
        return any(t.type == tokenize.STRING and scope.PDF_CONTENT_TYPE in t.string
                   for t in tokens)


copies = 0
for root, _, files in os.walk(skills):
    for f in files:
        path = os.path.abspath(os.path.join(root, f))
        if not f.endswith(".py") or path in exempt:
            continue
        if names_pdf_type(path):
            copies += 1
            print(f"  [FAIL] {os.path.relpath(path, skills)} spells the PDF content "
                  "type itself; to pick an attachment call scope.select_main_pdf, "
                  "and for anything else use scope.PDF_CONTENT_TYPE")
fails += copies
if not copies:
    print("  [PASS] no skill script but scope.py spells the PDF content type")

print(f'\n{"FAILED" if fails else "OK"}: {fails} failure(s)')
sys.exit(1 if fails else 0)
