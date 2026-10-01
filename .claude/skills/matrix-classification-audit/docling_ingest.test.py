#!/usr/bin/env python3
"""Guard docling_ingest.py's single-file entry point without running Docling.

The shared intake hands this converter one file at a time (`--file PATH --ref N`,
a PDF or Europe PMC JATS). Docling is deliberately not a repo dependency, so CI
cannot convert anything; what it can check is everything decided before the
converter is called: which suffixes reach it, which argument combinations are
refused, and the provenance each section records.

Run:  python3 .claude/skills/matrix-classification-audit/docling_ingest.test.py

Stdlib only, no Docling, no Zotero and no network.
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import docling_ingest as di  # noqa: E402

fails = 0


def check(label, ok):
    global fails
    if not ok:
        fails += 1
    print(f'  [{"PASS" if ok else "FAIL"}] {label}')


def check_call(label, fn):
    """check(), but for an assertion whose evaluation may itself raise.

    An unexpected exception is a FAILURE of this check, not the end of the
    suite. Watched mattering: reintroducing the missing-path defect made
    `file_binary_hash(None)` raise, which aborted the run and silently took
    every later check with it, so two other defects went undemonstrated.
    A suite that crashes reports less than one that fails.
    """
    global fails
    try:
        ok = bool(fn())
    except Exception as exc:                      # noqa: BLE001 - that is the point
        fails += 1
        print(f'  [FAIL] {label} (raised {type(exc).__name__}: {exc})')
        return
    check(label, ok)


class Reached(Exception):
    """Raised by the stub converter: proof the file got past the suffix gate."""


class StubConverter:
    def convert(self, path):
        raise Reached(path)


print("=== which files reach the converter ===")
with tempfile.TemporaryDirectory() as tmp:
    out = Path(tmp)
    for name in ("paper.pdf", "PMC4674093.nxml", "paper.xml", "PAPER.PDF"):
        try:
            di.convert_file(StubConverter(), out / name, 1, out)
            reached = False
        except Reached:
            reached = True
        check(f"{name} is handed to the converter", reached)
    # EPUB is the case CAAIL-436 measured failing inside Docling; it and the
    # others are refused before the converter is called (and, from the command
    # line, before it is built: see the next block).
    for name in ("paper.epub", "paper.html", "paper.docx", "paper"):
        try:
            di.convert_file(StubConverter(), out / name, 1, out)
            refused = False
        except ValueError:
            refused = True
        except Reached:
            refused = False
        check(f"{name} is refused before conversion", refused)


print("\n=== argument combinations refused before any work ===")
script = os.path.join(HERE, "docling_ingest.py")
papers = Path(HERE).parents[2] / "Papers.md"
REF = str(min(di.ex.parse_references(papers.read_text(encoding="utf-8"))))
for label, argv, needle, existing in (
    ("--ref without --file does not start the Zotero batch",
     ["--ref", REF], "--only", False),
    ("--file without --ref names the missing id",
     ["--file", "x.nxml"], "--file needs --ref", False),
    # Refused before Docling is imported: CI has no Docling, so reaching the
    # converter here would fail with an ImportError instead of this message.
    ("an unsupported file is refused before the converter is built",
     ["--file", "x.epub", "--ref", REF], "unsupported input", False),
    ("batch flags beside --file are refused, not ignored",
     ["--file", "x.nxml", "--ref", REF, "--respan"], "--respan would be ignored", False),
    ("an id that is not a Papers.md reference is refused",
     ["--file", "x.nxml", "--ref", "-1"], "is not a reference", False),
    ("a ref's existing output is not replaced without --overwrite",
     ["--file", "x.nxml", "--ref", REF], "--overwrite", True),
    ("--overwrite without --file is refused",
     ["--overwrite"], "only applies to --file", False),
    # The commonest typo. It must fail in a sentence, not after a model load.
    ("a --file path that does not exist is refused",
     ["--file", "MISSING.nxml", "--ref", REF], "no such file", False),
):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "corpus")
        if existing:
            os.makedirs(os.path.join(out, "sections"))
            Path(out, "sections", f"ref-{REF}.json").write_text("{}")
        # A real file, so a case testing a LATER gate is not short-circuited by
        # the existence check. The named-missing case passes its own path.
        real = Path(tmp) / "x.nxml"
        real.write_text("<article/>")
        argv = [str(real) if a == "x.nxml" else a for a in argv]
        run = subprocess.run([sys.executable, script, *argv, "--out", out,
                              "--api", "http://127.0.0.1:9/api"],
                             capture_output=True, text=True, timeout=60)
        # Refused, with a message saying why, and before the output tree is
        # created (or, where it already existed, before anything in it changed).
        untouched = (Path(out, "sections", f"ref-{REF}.json").read_text() == "{}"
                     and not Path(out, "docs").exists()) if existing \
            else not os.path.exists(out)
        check(label, run.returncode != 0 and needle in run.stderr and untouched)
        if run.returncode == 0 or needle not in run.stderr:
            print(f"         exit {run.returncode}: {run.stderr.strip()[-200:]}")


print("\n=== a stored section is checked against the file now selected ===")
# The rule lives in extract_matrix_corpus so the batch that writes sections and
# the script that serves them cannot drift; this exercises it through both.
prov = di.ex.section_provenance
# Content decides it wherever both sides have a hash: a name survives nothing.
check("the same content is a match whatever the file is called",
      prov({"filename": "ref-1.pdf", "binary_hash": 42},
           "/store/KEY/Smith - 2024 - Title.pdf", 42) == "match")
# The CAAIL-436 defect in the existing corpus: the section was built from the
# supplement because Zotero listed it first.
check("different content is a mismatch even under the same name",
      prov({"filename": "paper.pdf", "binary_hash": 42},
           "/store/KEY/paper.pdf", 99) == "mismatch")
# The September corpus records every filename as "ref-<id>.pdf", so a
# name-based check would call all 324 sections wrong. Unprovable is not wrong.
check("a recorded name the old pipeline minted is not called a mismatch",
      prov({"filename": "ref-1.pdf"}, "/store/KEY/Smith - 2024 - Title.pdf")
      == "unrecorded")
check("a hash on one side only cannot decide it",
      prov({"filename": "ref-1.pdf", "binary_hash": 42},
           "/store/KEY/paper.pdf", None) == "unrecorded")
# A name is believed only on a record this code wrote, which storage_dir marks.
check("a name and storage key this code wrote are trusted",
      prov({"filename": "paper.pdf", "storage_dir": "MAINKEY1"},
           "/store/MAINKEY1/paper.pdf") == "match")
check("the same name in another storage directory is a mismatch",
      prov({"filename": "paper.pdf", "storage_dir": "SUPPKEY9"},
           "/store/MAINKEY1/paper.pdf") == "mismatch")
# Anything the curator supplied with --file was deliberate, PDF or not.
# Judging it by suffix protected JATS and would have destroyed a publisher PDF.
check("a JATS section supplied with --file is left alone",
      prov({"filename": "PMC1234567.nxml", "via": "file"},
           "/store/KEY/paper.pdf", 7) == "external-source")
# convert_file's `via` defaults to "batch", and the shared intake calls it
# directly, so a JATS section can arrive without the flag. The suffix has to
# settle it BEFORE the hash compare, or that record is rebuilt from the Zotero
# PDF and the curator's JATS section is destroyed.
check("a JATS section is left alone even if nothing recorded how it was made",
      prov({"filename": "PMC1234567.nxml", "binary_hash": 55, "via": "batch"},
           "/store/KEY/paper.pdf", 99) == "external-source")
check("a PDF supplied with --file is left alone too",
      prov({"filename": "downloaded.pdf", "via": "file", "binary_hash": 42},
           "/store/KEY/paper.pdf", 99) == "external-source")
check("a section predating the source field is unrecorded",
      prov(None, "/store/KEY/paper.pdf") == "unrecorded")
check("a ref with no resolved PDF cannot be verified either way",
      prov({"filename": "paper.pdf", "storage_dir": "K"}, None) == "unrecorded")

# The hash must be the one DOCLING records, so this compares against a captured
# real origin rather than recomputing the formula under test. Recomputing it
# would pass even if the formula were wrong, and a wrong formula makes every
# stored section read "mismatch", discarding the whole corpus silently.
fixture = json.loads((Path(HERE) / "testdata" / "origin-fixture.json").read_text())
fixture_file = Path(HERE) / "testdata" / fixture["file"]
check(f'the file hash matches what Docling {fixture["docling_version"]} recorded',
      di.ex.file_binary_hash(fixture_file) == fixture["origin"]["binary_hash"])
check("a different file does not collide with it",
      di.ex.file_binary_hash(Path(__file__)) != fixture["origin"]["binary_hash"])
with tempfile.TemporaryDirectory() as tmp:
    check("an unreadable file has no hash",
          di.ex.file_binary_hash(Path(tmp) / "nope.bin") is None)
# No file at all is the ORDINARY case, not an exceptional one: every refusal
# from select_main_pdf leaves the caller without a path. Raising here aborted
# the whole extraction run on the first ambiguous ref, and six of the live
# refs are ambiguous today.
check_call("no path at all yields no hash rather than raising",
           lambda: di.ex.file_binary_hash(None) is None)
check_call("main_pdf_path yields nothing when no attachment was selected",
           lambda: di.ex.main_pdf_path("/anywhere", None) is None)

# Reading a PDF costs the whole file in memory, so it is only done when the
# comparison would actually use it.
check("a source with a hash needs the file read",
      di.ex.needs_file_hash({"filename": "a.pdf", "binary_hash": 1}) is True)
check("a source with no hash does not",
      di.ex.needs_file_hash({"filename": "a.pdf"}) is False)
check("a curator-supplied section does not",
      di.ex.needs_file_hash({"filename": "a.pdf", "binary_hash": 1,
                             "via": "file"}) is False)
check("no source does not",
      di.ex.needs_file_hash(None) is False)

print("\n=== a refused section stops being served, and says what it was ===")
# The path the whole branch exists to handle, and it had no test: reading the
# cleared field back raised AttributeError on the first refused ref and killed
# the run, which writes its output only after the loop.
# The fields a real record carries at the moment it is refused, including the
# verdict that put it there: a fixture missing one turns a failing check into a
# KeyError, which is how the clearing guard first read as a crash rather than
# as a failure.
rec = {"methods_input": {"filename": "supp.pdf"}, "methods_text": "x",
       "methods_source": "docling", "has_fulltext": True, "methods_strategy": "explicit",
       "methods_heading": "Methods", "methods_end_heading": "Results",
       "methods_pages": [1, 2], "methods_provenance": "mismatch"}
rejected = di.ex.refuse_section(rec)
check("the rejected file is returned for the message",
      rejected.get("filename") == "supp.pdf")
check("it is also kept on the record",
      rec["rejected_methods_input"] == {"filename": "supp.pdf"})
check("nothing still describes the refused section",
      not rec["methods_text"] and not rec["methods_source"]
      and rec["has_fulltext"] is False and rec["methods_input"] is None
      and rec["methods_pages"] is None and not rec["methods_heading"])
check_call("a record with no recorded input refuses without raising",
           lambda: di.ex.refuse_section({"methods_input": None}) == {})
# The verdict goes too: a consumer told to weigh evidence by it, and filtering
# out "mismatch", would otherwise discard the sound ft-cache text this record
# goes on to serve. rejected_methods_input is what records the refusal.
check_call("the refused verdict does not stay on a record that serves other text",
           lambda: rec.get("methods_provenance") == ""
           and rec["rejected_methods_input"] is not None)

with tempfile.TemporaryDirectory() as tmp:
    sec = Path(tmp) / "ref-1.json"
    sec.write_text(json.dumps({"source": {"filename": "paper.pdf"}}))
    check("the stored source is read back off disk",
          di.read_section_source(sec) == {"filename": "paper.pdf"})
    sec.write_text("{not json")
    check_call("an unreadable section proves nothing, so it records no source",
               lambda: di.read_section_source(sec) is None)
    check_call("an absent section records no source",
               lambda: di.read_section_source(Path(tmp) / "nope.json") is None)
    # Valid JSON that is not an object. This is read OUTSIDE the per-ref try
    # that keeps one bad PDF from ending the batch, so raising here aborts the
    # whole run and the log is only fully written afterwards.
    for bad in ("[]", "null", '"a string"', "3"):
        sec.write_text(bad)
        check_call(f"a section file holding {bad} records no source",
                   lambda: di.read_section_source(sec) is None)


print("\n=== each section records what it was converted from ===")
# The origin Docling 2.121.0 recorded for PMC4674093.nxml through the real --file
# path. A PDF's names the PDF type, so the two are told apart.
jats = SimpleNamespace(origin=SimpleNamespace(
    filename="PMC4674093.nxml", mimetype="application/xml", binary_hash=1234))
check("the origin's name, type and content hash are kept",
      di.document_source(jats) == {"filename": "PMC4674093.nxml",
                                   "mimetype": "application/xml",
                                   "binary_hash": 1234})
check("a document with no origin records none",
      di.document_source(SimpleNamespace(origin=None)) is None)
check("the containing directory is recorded, which for Zotero is the storage key",
      di.document_source(jats, "/store/ABCD1234/PMC4674093.nxml").get("storage_dir")
      == "ABCD1234")
check("how the section was made is recorded, not inferred from the suffix",
      di.document_source(jats, "/x/y.nxml", None, "file").get("via") == "file")
# --respan has no path, and dropping either field would quietly turn a verified
# section into an unverifiable one, or a protected one into a rebuildable one.
check("a respan carries the recorded storage key forward",
      di.document_source(jats, None, {"storage_dir": "ABCD1234"}).get("storage_dir")
      == "ABCD1234")
check("a respan carries the recorded origin forward",
      di.document_source(jats, None, {"via": "file"}).get("via") == "file")


print(f"\n{'OK' if not fails else 'FAILED'}: {fails} failure(s)")
sys.exit(1 if fails else 0)
