#!/usr/bin/env python3
"""Batch-convert the CAAIL corpus PDFs to DoclingDocument JSON. Opt-in, manual.

This is a batch job in the same family as `fetch:citations` and
`fetch:awesome-lists`: it is never run by a build, it is run by hand when the
corpus changes, and it writes a gitignored artifact that everything downstream
reads offline. Nothing in `pnpm parse` or `pnpm build` touches it.

    python3 .claude/skills/matrix-classification-audit/docling_ingest.py

Requires docling, which is deliberately NOT a repo dependency -- run it in a
throwaway environment so nothing lands in the base interpreter:

    uv run --python 3.12 --with docling \\
        python .claude/skills/matrix-classification-audit/docling_ingest.py

Outputs, all under `docling-corpus/` (gitignored):

    docs/ref-<id>.json       the full DoclingDocument
    sections/ref-<id>.json   headings + the located methods span + its text
    ingest-log.json          per-ref status, timing, and failures

`sections/` is what `extract_matrix_corpus.py` reads. It is small (headings and
one section, not the whole paper), so the expensive conversion happens once and
every later curation pass is instant.

Licensing note: this artifact contains full text of works CAAIL may read but may
not redistribute, so it is gitignored and stays local. Per CAAIL-169 the shipped
tier -- anything reaching the agent API, the chat widget or a public index --
must filter on `licenseTier` in {permissive, copyleft}, never on `is_oa`. This
script produces the LOCAL CURATION TIER only and publishes nothing.

Resumable: a ref whose outputs already exist is skipped, so an interrupted run
is restarted by re-running the same command.
"""
import argparse
import json
import os
import sys
import time
import traceback
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "zotero-collection-scope"))

import extract_matrix_corpus as ex  # noqa: E402
import scope  # noqa: E402
from docling_sections import find_methods_span  # noqa: E402


def build_converter():
    """Docling converter tuned for born-digital publisher PDFs.

    OCR is off: these PDFs carry a real text layer, and OCR nearly tripled the
    per-document time in the CAAIL-206 smoke test (119s -> 43s with it off) for
    no gain. Table structure stays on -- it is what makes data-availability and
    accession extraction possible, which is half the point of the ingest.
    """
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    opts = PdfPipelineOptions()
    opts.do_ocr = False
    opts.do_table_structure = True
    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)})


def collect_headings(doc):
    """Ordered section headings with page numbers, for find_methods_span."""
    from docling_core.types.doc import DocItemLabel

    out = []
    for item, _ in doc.iterate_items():
        if getattr(item, "label", None) != DocItemLabel.SECTION_HEADER:
            continue
        prov = getattr(item, "prov", None) or []
        out.append({
            "text": (getattr(item, "text", "") or "").strip(),
            "level": getattr(item, "level", None),
            "page": prov[0].page_no if prov else None,
        })
    return out


def section_text(doc, span):
    """Text of the methods span, resolved against document reading order.

    The span indexes the HEADING list, so walk the full item list and collect
    everything from the start heading up to (not including) the end heading.
    """
    from docling_core.types.doc import DocItemLabel

    items = [it for it, _ in doc.iterate_items()]
    headers = [i for i, it in enumerate(items)
               if getattr(it, "label", None) == DocItemLabel.SECTION_HEADER]
    if span["start"] is None or span["start"] >= len(headers):
        return "", None, None, 0

    start_item = headers[span["start"]]
    end_item = headers[span["end"]] if (
        span["end"] is not None and span["end"] < len(headers)) else len(items)

    parts, pages, n_tables = [], [], 0
    for it in items[start_item:end_item]:
        if getattr(it, "label", None) == DocItemLabel.TABLE:
            n_tables += 1
        text = (getattr(it, "text", "") or "").strip()
        if text:
            parts.append(text)
        prov = getattr(it, "prov", None) or []
        if prov:
            pages.append(prov[0].page_no)
    return ("\n".join(parts),
            min(pages) if pages else None,
            max(pages) if pages else None,
            n_tables)


def resolve_pdfs(api, groups, storage, papers_md):
    """Every Papers.md ref -> its PDF path, matrix-participating refs first.

    Matrix refs are ordered first so an interrupted run still delivers the
    population that `extract_matrix_corpus.py` actually reads.
    """
    md = Path(papers_md).read_text(encoding="utf-8")
    _, cell_map = ex.parse_matrix(md)
    refs = ex.parse_references(md)
    matrix_ids = set(cell_map)

    doi_index, url_index = ex.build_indexes(api, groups)
    ordered = sorted(refs, key=lambda r: (r not in matrix_ids, r))

    out = []
    for rid in ordered:
        ref = refs[rid]
        hit = (doi_index.get(ref["doi"].lower()) if ref["doi"] else None) \
            or (url_index.get(ex._norm_url(ref["url"])) if ref["url"] else None)
        if not hit:
            out.append({"id": rid, "pdf": "", "why": "not-in-zotero",
                        "in_matrix": rid in matrix_ids})
            continue
        group, item = hit
        pdf_key = scope.find_pdf_attachment_key(api, group, item.get("key"))
        d = Path(storage) / pdf_key if pdf_key else None
        pdfs = sorted(d.glob("*.pdf")) if d and d.is_dir() else []
        out.append({
            "id": rid,
            "pdf": str(pdfs[0]) if pdfs else "",
            "why": "" if pdfs else "no-pdf-attachment",
            "in_matrix": rid in matrix_ids,
        })
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--papers", default=str(REPO / "Papers.md"))
    ap.add_argument("--out", default=str(REPO / "docling-corpus"))
    ap.add_argument("--api", default="http://localhost:23119/api")
    ap.add_argument("--zotero-storage", default=os.path.expanduser("~/Zotero/storage"))
    ap.add_argument("--group", action="append", default=[])
    ap.add_argument("--limit", type=int, default=0,
                    help="stop after N conversions (0 = no limit)")
    ap.add_argument("--only", type=int, action="append", default=[],
                    help="convert only these ref ids (repeatable)")
    ap.add_argument("--matrix-only", action="store_true",
                    help="skip refs that participate in no matrix cell")
    args = ap.parse_args()

    groups = args.group or ["6549203", "5178481"]
    out = Path(args.out)
    (out / "docs").mkdir(parents=True, exist_ok=True)
    (out / "sections").mkdir(parents=True, exist_ok=True)

    targets = resolve_pdfs(args.api, groups, args.zotero_storage, args.papers)
    if args.only:
        targets = [t for t in targets if t["id"] in set(args.only)]
    if args.matrix_only:
        targets = [t for t in targets if t["in_matrix"]]

    have_pdf = [t for t in targets if t["pdf"]]
    print(f"refs: {len(targets)}   with PDF: {len(have_pdf)}   "
          f"without: {len(targets) - len(have_pdf)}", flush=True)

    log, converted, failed, skipped = [], 0, 0, 0
    converter = None
    t_start = time.time()

    for t in targets:
        rid = t["id"]
        sec_path = out / "sections" / f"ref-{rid}.json"
        rec = {"id": rid, "in_matrix": t["in_matrix"], "pdf": t["pdf"],
               "ok": False, "skipped": False, "error": t["why"], "seconds": 0.0}

        if not t["pdf"]:
            log.append(rec)
            continue
        if sec_path.exists():
            rec.update(ok=True, skipped=True, error="")
            skipped += 1
            log.append(rec)
            continue

        if converter is None:          # defer model load until real work exists
            converter = build_converter()

        t0 = time.time()
        try:
            doc = converter.convert(t["pdf"]).document
            (out / "docs" / f"ref-{rid}.json").write_text(
                json.dumps(doc.export_to_dict(), ensure_ascii=False))
            headings = collect_headings(doc)
            span = find_methods_span(headings)
            text, p0, p1, n_tables = section_text(doc, span) if span["found"] else ("", None, None, 0)
            sec_path.write_text(json.dumps({
                "id": rid,
                "n_pages": doc.num_pages(),
                "headings": headings,
                "strategy": span["strategy"],
                "heading": span["heading"],
                "end_heading": span["end_heading"],
                "page_start": p0,
                "page_end": p1,
                "n_tables": n_tables,
                "methods_text": text,
            }, ensure_ascii=False, indent=2))
            rec.update(ok=True, error="", strategy=span["strategy"],
                       chars=len(text), n_pages=doc.num_pages())
            converted += 1
        except Exception as exc:  # noqa: BLE001 - one bad PDF must not end the batch
            rec["error"] = f"{type(exc).__name__}: {exc}"
            failed += 1
            traceback.print_exc()
        rec["seconds"] = round(time.time() - t0, 1)
        log.append(rec)

        done = converted + failed
        rate = (time.time() - t_start) / done if done else 0
        remaining = len([x for x in have_pdf
                         if not (out / "sections" / f"ref-{x['id']}.json").exists()])
        print(f'[{rid}] ok={rec["ok"]} {rec["seconds"]}s '
              f'{rec.get("strategy", "-")} chars={rec.get("chars", 0)} '
              f'| done={done} skip={skipped} fail={failed} '
              f'eta={remaining * rate / 60:.0f}min', flush=True)
        (out / "ingest-log.json").write_text(json.dumps(log, indent=2))

        if args.limit and converted >= args.limit:
            print(f"reached --limit {args.limit}", flush=True)
            break

    (out / "ingest-log.json").write_text(json.dumps(log, indent=2))
    print(f"\nconverted={converted} skipped={skipped} failed={failed} "
          f"elapsed={(time.time() - t_start) / 60:.1f}min")
    strategies = {}
    for r in log:
        if r.get("ok") and not r.get("skipped"):
            strategies[r.get("strategy", "?")] = strategies.get(r.get("strategy", "?"), 0) + 1
    print("strategies:", json.dumps(strategies))


if __name__ == "__main__":
    main()
