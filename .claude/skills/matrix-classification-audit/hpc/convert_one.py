"""Convert ONE staged PDF to a DoclingDocument JSON. One array task per ref.

Deliberately does the expensive half only. `docs/ref-<id>.json` is the durable
artifact; `sections/` is derived from it by `docling_ingest.py --respan`, which
needs no PDF and no conversion. Keeping the split means the section rule stays
in the committed `docling_sections.py` and is never reimplemented here — a
second copy of that rule is exactly the drift this repo keeps paying for.

The converter comes from `docling_ingest.build_converter()` rather than being
rebuilt here. Those options (OCR off, table structure on) decide what a converted
document *contains*, so a second copy would let cluster- and locally-converted
docs diverge with nothing failing — the same argument that keeps the section rule
in one place, one layer down.

Requires the skill directory on `sys.path`; the sbatch passes `CAAIL_SKILL_DIR`.
"""
import argparse
import json
import os
import sys
from pathlib import Path

# The sibling skill scripts, shipped to the cluster alongside this file. The
# sbatch sets CAAIL_SKILL_DIR; the relative fallback keeps this runnable from a
# checkout where hpc/ still sits inside the skill directory.
_SKILL = os.environ.get('CAAIL_SKILL_DIR') or str(Path(__file__).resolve().parent.parent)
sys.path.insert(0, _SKILL)
sys.path.insert(0, str(Path(_SKILL).parent / 'zotero-collection-scope'))

import docling_ingest  # noqa: E402


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

    conv = docling_ingest.build_converter(
        artifacts_path=args.artifacts_path or None, threads=args.threads)
    doc = conv.convert(args.pdf).document

    # Write via a temp file then rename. A task killed mid-write would otherwise
    # leave a truncated JSON that the resume check above treats as done.
    #
    # The encoding is explicit because ensure_ascii=False deliberately emits
    # non-ASCII. Without it the write takes the locale default, and a cluster
    # environment with a non-UTF-8 locale -- or PYTHONCOERCECLOCALE=0, which
    # disables the PEP 538 coercion that usually hides this -- raises
    # UnicodeEncodeError on essentially every paper rather than on an unlucky one.
    tmp = dest.with_suffix('.json.partial')
    tmp.write_text(json.dumps(doc.export_to_dict(), ensure_ascii=False),
                   encoding='utf-8')
    tmp.rename(dest)

    print(f'ref {args.ref}: ok, {doc.num_pages()} pages, {dest.stat().st_size} bytes')


if __name__ == '__main__':
    main()
