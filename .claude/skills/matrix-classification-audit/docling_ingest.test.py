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
    # others must be refused here, before a converter is ever built or called.
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
for label, argv, needle in (
    ("--ref without --file does not start the Zotero batch",
     ["--ref", "5"], "--only"),
    ("--file without --ref names the missing id",
     ["--file", "x.nxml"], "--file needs --ref"),
):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "corpus")
        run = subprocess.run([sys.executable, script, *argv, "--out", out,
                              "--api", "http://127.0.0.1:9/api"],
                             capture_output=True, text=True, timeout=60)
        # Refused, with a message saying why, and before the output tree exists.
        check(label, run.returncode != 0 and needle in run.stderr
              and not os.path.exists(out))


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
