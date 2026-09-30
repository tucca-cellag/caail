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
):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "corpus")
        if existing:
            os.makedirs(os.path.join(out, "sections"))
            Path(out, "sections", f"ref-{REF}.json").write_text("{}")
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


print("\n=== each section records what it was converted from ===")
# The origin Docling 2.121.0 recorded for PMC4674093.nxml through the real --file
# path. A PDF's names the PDF type, so the two are told apart.
jats = SimpleNamespace(origin=SimpleNamespace(
    filename="PMC4674093.nxml", mimetype="application/xml"))
check("the origin's file name and type are kept",
      di.document_source(jats) == {"filename": "PMC4674093.nxml",
                                   "mimetype": "application/xml"})
check("a document with no origin records none",
      di.document_source(SimpleNamespace(origin=None)) is None)


print(f"\n{'OK' if not fails else 'FAILED'}: {fails} failure(s)")
sys.exit(1 if fails else 0)
