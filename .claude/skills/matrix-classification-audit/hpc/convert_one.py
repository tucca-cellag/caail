"""Convert ONE staged PDF to a DoclingDocument JSON. One array task per ref.

Deliberately does the expensive half only. `docs/ref-<id>.json` is the durable
artifact; `sections/` is derived from it by `docling_ingest.py --respan`, which
needs no PDF and no conversion. Keeping the split means the section rule stays
in the committed `docling_sections.py` and is never reimplemented here — a
second copy of that rule is exactly the drift this repo keeps paying for.

Pipeline options mirror `docling_ingest.build_converter()` verbatim:
OCR off (these are born-digital publisher PDFs with a real text layer, and OCR
nearly tripled per-document time for no gain), table structure ON (it is what
makes the data-availability and accession extraction possible).
"""
import argparse
import json
from pathlib import Path


def build_converter(artifacts_path, threads):
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    opts = PdfPipelineOptions()
    opts.do_ocr = False
    opts.do_table_structure = True
    if artifacts_path:
        # Pre-staged weights. Without this every array task races the same
        # HuggingFace cache, which is how you get half-written model files.
        opts.artifacts_path = artifacts_path

    # Thread pinning is best-effort: the accelerator options moved between
    # docling versions, and a stale signature must not fail the whole array.
    try:
        from docling.datamodel.pipeline_options import (AcceleratorDevice,
                                                        AcceleratorOptions)
        opts.accelerator_options = AcceleratorOptions(
            num_threads=threads, device=AcceleratorDevice.CPU)
    except Exception as exc:  # noqa: BLE001
        print(f'accelerator options unavailable ({exc}); using defaults')

    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)})


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--pdf', required=True)
    ap.add_argument('--ref', required=True, type=int)
    ap.add_argument('--out', required=True)
    ap.add_argument('--artifacts-path', default='')
    ap.add_argument('--threads', type=int, default=4)
    args = ap.parse_args()

    out = Path(args.out)
    (out / 'docs').mkdir(parents=True, exist_ok=True)
    dest = out / 'docs' / f'ref-{args.ref}.json'

    # Resumable: a re-submitted array must not redo finished work.
    if dest.exists() and dest.stat().st_size > 0:
        print(f'ref {args.ref}: docs already present, skipping')
        return

    conv = build_converter(args.artifacts_path or None, args.threads)
    doc = conv.convert(args.pdf).document

    # Write via a temp file then rename. A task killed mid-write would otherwise
    # leave a truncated JSON that the resume check above treats as done.
    tmp = dest.with_suffix('.json.partial')
    tmp.write_text(json.dumps(doc.export_to_dict(), ensure_ascii=False))
    tmp.rename(dest)

    print(f'ref {args.ref}: ok, {doc.num_pages()} pages, {dest.stat().st_size} bytes')


if __name__ == '__main__':
    main()
