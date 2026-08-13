#!/usr/bin/env python3
"""Stage each ref's PDFs as one `ref-<id>.pdf` for the cluster array, plus refs.txt.

Runs on the machine that has Zotero, since the cluster cannot reach the local
Zotero API. It resolves refs the same way `docling_ingest.py` does, so what gets
staged is what the extractor will later look for.

## Why this merges rather than picking one file

`scope.find_pdf_attachment_key` returns a SINGLE pdf per item, which is wrong for
any paper whose methods were published separately. Three refs in this corpus are
exactly that shape: two *Science* papers and a preprint whose main text carries
the model description and results while the methods live in a supplementary PDF.
Converting either file alone loses half the evidence, and letting the resolver
pick whichever it finds first makes the choice silently and differently per ref.

So every PDF attached to the item is merged into one document, main text first
and supplements after. Docling then sees a single paper, `find_methods_span`
locates the methods wherever they actually are, and page numbers stay continuous
and meaningful.

## Ordering

Supplements go last because the section rule reads in document order, and a
methods heading in the supplement should not be preceded by the supplement's own
front matter appearing before the main text's introduction. The heuristic is the
filename, which is what publishers actually encode: PMC author-manuscript
supplements carry `-supplement-`, and publisher media files are `media-<n>.pdf`.
Anything unrecognised is treated as main text and keeps its relative order, so a
new naming convention degrades to "ordered as Zotero returned it" rather than to
a wrong answer.

Usage:
    python3 stage_pdfs.py --out <dir> [--only N ...] [--matrix-only]
"""
import argparse
import json
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
sys.path.insert(0, str(SKILL))
sys.path.insert(0, str(SKILL.parent / "zotero-collection-scope"))

import extract_matrix_corpus as ex  # noqa: E402
import scope  # noqa: E402

# Publisher conventions for "this file is the supplement, not the article".
SUPPLEMENT_RE = re.compile(r"-supplement-|supplementary|^media-\d+\.pdf$", re.I)


def pdf_attachments(api, group, item_key):
    """Every PDF child of an item, not just the first one.

    `scope.find_pdf_attachment_key` deliberately returns only the first; this is
    the same walk without that truncation. Keys come from `data.key` to match
    how the rest of the toolchain addresses attachment storage directories.
    """
    out = []
    for c in scope.fetch_item_children(api, group, item_key) or []:
        d = c.get("data", {})
        if d.get("contentType") == "application/pdf":
            out.append((d.get("key"), d.get("filename") or ""))
    return out


def order_main_text_first(attachments):
    """Main text first, supplements after, each group keeping Zotero's order."""
    main = [a for a in attachments if not SUPPLEMENT_RE.search(a[1])]
    supp = [a for a in attachments if SUPPLEMENT_RE.search(a[1])]
    return main + supp


def merge(paths, dest):
    """Concatenate PDFs into one file. Milliseconds; no rendering, no ML.

    `pypdfium2` is the one non-stdlib import in this skill, and it is deferred
    to here on purpose: every other path through this script -- and every other
    script in the directory -- stays stdlib-only, so a ref with a single PDF
    never needs it installed. It ships as a docling dependency, so any machine
    that can run the ingest already has it.
    """
    import pypdfium2 as pdfium

    out = pdfium.PdfDocument.new()
    for p in paths:
        src = pdfium.PdfDocument(str(p))
        out.import_pages(src)
    out.save(str(dest))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--papers", default=str(SKILL.parents[2] / "Papers.md"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--api", default="http://localhost:23119/api")
    ap.add_argument("--zotero-storage", default=str(Path("~/Zotero/storage").expanduser()))
    ap.add_argument("--group", action="append", default=[])
    ap.add_argument("--only", type=int, action="append", default=[])
    ap.add_argument("--matrix-only", action="store_true")
    args = ap.parse_args()

    groups = args.group or ["6549203", "5178481"]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    storage = Path(args.zotero_storage)

    md = Path(args.papers).read_text(encoding="utf-8")
    _, cell_map = ex.parse_matrix(md)
    refs = ex.parse_references(md)
    matrix_ids = set(cell_map)

    doi_index, url_index = ex.build_indexes(args.api, groups)

    # --only and --matrix-only COMPOSE, matching docling_ingest.py's ordering.
    # Making --only override would let `--only 900 --matrix-only` stage a
    # non-matrix ref without complaint, and leave the two tools disagreeing
    # about the same pair of flags.
    wanted = sorted(set(args.only)) if args.only else sorted(refs)
    if args.matrix_only:
        wanted = [r for r in wanted if r in matrix_ids]

    staged, skipped, merged, partial = [], [], [], []

    def write_manifest():
        """Written after every ref, not once at the end.

        An exception mid-loop -- a malformed PDF, or the deferred pypdfium2
        import failing -- would otherwise leave N staged files on disk and no
        refs.txt at all, so the directory looks staged while the documented
        next step (`wc -l < refs.txt`) fails on it.
        """
        (out / "refs.txt").write_text("\n".join(str(r) for r in staged) + "\n")
        json.dump({"staged": staged, "skipped": skipped,
                   "merged": {str(r): names for r, names in merged},
                   "partial": {str(r): n for r, n in partial}},
                  open(out / "stage-manifest.json", "w"), indent=2)

    for rid in wanted:
        try:
            ref = refs.get(rid)
            if not ref:
                skipped.append((rid, "no-reference"))
                continue
            hit = (doi_index.get(ref["doi"].lower()) if ref["doi"] else None) \
                or (url_index.get(ex._norm_url(ref["url"])) if ref["url"] else None)
            if not hit:
                skipped.append((rid, "not-in-zotero"))
                continue

            group, item = hit
            atts = order_main_text_first(pdf_attachments(args.api, group, item.get("key")))
            paths = []
            for key, _fname in atts:
                d = storage / key
                found = sorted(d.glob("*.pdf")) if d.is_dir() else []
                if found:
                    paths.append(found[0])
            if not paths:
                skipped.append((rid, "no-pdf-attachment"))
                continue

            # An attachment Zotero knows about but has not downloaded (or a
            # linked file with no storage directory) is a silent half-merge:
            # `paths` comes back length 1, the merge branch never runs, and the
            # manifest is indistinguishable from a genuinely single-PDF ref.
            # That is the "converting either file alone loses half the evidence"
            # failure this script exists to prevent, so it is recorded loudly
            # rather than inferred from a page count later.
            if len(paths) != len(atts):
                partial.append((rid, f"{len(paths)} of {len(atts)} attachments on disk"))

            dest = out / f"ref-{rid}.pdf"
            if len(paths) == 1:
                shutil.copy2(paths[0], dest)
            else:
                merge(paths, dest)
                merged.append((rid, [p.name for p in paths]))
            staged.append(rid)
        except Exception as exc:  # noqa: BLE001 - one bad ref must not strand the rest
            skipped.append((rid, f"{type(exc).__name__}: {exc}"))
        finally:
            write_manifest()

    print(f"staged {len(staged)} refs -> {out}")
    if merged:
        print(f"merged multi-PDF refs ({len(merged)}):")
        for rid, names in merged:
            print(f"  ref {rid}:")
            for n in names:
                print(f"      {n}")
    if partial:
        print(f"INCOMPLETE -- some attachments were not on disk ({len(partial)}):")
        for rid, why in partial:
            print(f"  ref {rid}: {why}  (sync Zotero, then re-stage this ref)")
    if skipped:
        print(f"skipped {len(skipped)}:")
        for rid, why in skipped:
            print(f"  ref {rid}: {why}")


if __name__ == "__main__":
    main()
