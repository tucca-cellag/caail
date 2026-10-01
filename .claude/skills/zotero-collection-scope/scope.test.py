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
import tempfile
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

# `contentType` is the signature, not the literal. Selecting an attachment by
# type means reading that key, whatever the comparison looks like, so this
# catches the forms a literal search cannot: an f-string (which on Python 3.12+
# is not a STRING token at all, so the earlier literal-only check passed it),
# a membership test, and a comparison against scope.PDF_CONTENT_TYPE, the
# constant scope.py's own comment tells other code to import. The literal is
# still checked, in both token shapes, because a module-level constant spelling
# it is a copy of the rule's input even before anything compares against it.
ATTACHMENT_KEY = "contentType"
STRING_TOKENS = {tokenize.STRING,
                 getattr(tokenize, "FSTRING_MIDDLE", tokenize.STRING)}


def rule_copy_reason(path):
    """Why this file looks like a second copy of the main-PDF rule, or ''.

    Reads tokens rather than raw text, so a comment explaining the rule is not
    mistaken for implementing it.
    """
    with open(path, encoding="utf-8") as fh:
        tokens = list(tokenize.generate_tokens(fh.readline))
    for t in tokens:
        if t.type == tokenize.NAME and t.string == ATTACHMENT_KEY:
            return f"reads the {ATTACHMENT_KEY} attribute"
        if t.type in STRING_TOKENS and ATTACHMENT_KEY in t.string:
            return f"names {ATTACHMENT_KEY!r}"
        if t.type in STRING_TOKENS and scope.PDF_CONTENT_TYPE in t.string:
            return f"spells {scope.PDF_CONTENT_TYPE!r}"
    return ""


copies = 0
for root, _, files in os.walk(skills):
    for f in files:
        path = os.path.abspath(os.path.join(root, f))
        if not f.endswith(".py") or path in exempt:
            continue
        reason = rule_copy_reason(path)
        if reason:
            copies += 1
            print(f"  [FAIL] {os.path.relpath(path, skills)} {reason}; to pick a "
                  "paper's PDF call scope.select_main_pdf or "
                  "scope.resolve_main_pdf, which is the only place that rule lives")
fails += copies
if not copies:
    print("  [PASS] no skill script but scope.py selects an attachment by type")

# The guard above is only as good as the token shapes it knows, and the shape
# of an f-string changed under it once already. So prove it on each form rather
# than trusting the token table.
print("\n=== the copy guard catches every form of the rule ===")
probe = os.path.join(tempfile.mkdtemp(), "probe.py")
FORMS = [
    ('a plain-string comparison', 'if c["data"]["contentType"] == "application/pdf": pass\n'),
    ('an f-string literal', 'T = f"application/pdf"\n'),
    ('a reversed comparison', 'if "application/pdf" == ct: pass\n'),
    ('a membership test', 'PDF_TYPES = {"application/pdf"}\n'),
    ('the shared constant, used to select', 'if c["data"]["contentType"] == scope.PDF_CONTENT_TYPE: pass\n'),
    ('a bare attribute read', 'ct = c.get("data", {}).get("contentType")\n'),
]
for label, src in FORMS:
    with open(probe, "w", encoding="utf-8") as fh:
        fh.write(src)
    caught = bool(rule_copy_reason(probe))
    if not caught:
        fails += 1
    print(f'  [{"PASS" if caught else "FAIL"}] {label}')

with open(probe, "w", encoding="utf-8") as fh:
    fh.write('# a comment about contentType and application/pdf\n"""and a docstring"""\n')
clean = not rule_copy_reason(probe)
if not clean:
    fails += 1
print(f'  [{"PASS" if clean else "FAIL"}] a comment about the rule is not a copy of it')

print(f'\n{"FAILED" if fails else "OK"}: {fails} failure(s)')
sys.exit(1 if fails else 0)
