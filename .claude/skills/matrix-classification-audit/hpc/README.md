# Running the Docling ingest on a SLURM cluster

`docling_ingest.py` converts one PDF at a time in a single process. That is fine for a
handful of refs and wrong for the corpus: conversion measured a **median of 1m50s per
paper**, so 224 refs is about seven hours serially. The work is embarrassingly parallel —
each ref reads one PDF and writes one file named after its own id, and no two refs ever
touch the same path — so an array finishes the backlog in the wall time of the slowest
paper plus queueing. The same 224 refs took **about 20 minutes at 20-way concurrency**.

## The split, and why it is worth keeping

The array does **only** the expensive half: PDF → `docs/ref-<id>.json`. Sections are
derived afterwards by a single short job running the real `docling_ingest.py --respan`.

That is deliberate. `docs/` is the durable artifact and `sections/` is derived from it
with no PDF and no conversion, so the heading rule stays in exactly one place
(`docling_sections.py`). A cluster-side reimplementation of that rule would be a second
copy free to drift from the first, which is the failure this repo keeps paying for. It
also means improving the rule costs a 40-second respan rather than another full pass.

## Site configuration

These scripts hardcode no paths. Every location is a required environment variable, so a
missing one fails loudly at submit time rather than silently writing somewhere wrong.
Set them in your shell, or in a small uncommitted wrapper:

| Variable | What it points at |
| --- | --- |
| `CAAIL_ENV_DIR` | conda env with `docling` installed |
| `CAAIL_MODELS` | pre-downloaded Docling weights (see setup below) |
| `CAAIL_PDF_DIR` | staged PDFs, named `ref-<id>.pdf`, plus `refs.txt` |
| `CAAIL_OUT_DIR` | where `docs/` and `sections/` are written |
| `CAAIL_HPC_DIR` | this directory, on the cluster |
| `CAAIL_SKILL_DIR` | the skill scripts on the cluster (needs `docling_ingest.py`, `docling_sections.py`, and a sibling `zotero-collection-scope/scope.py`, which `docling_ingest` imports at module scope) |

`#SBATCH` directives cannot expand variables, so partition, memory and log paths are set
to portable defaults and overridden on the command line:
`sbatch --partition=<p> --output=<path> …`. Logs default to `slurm-%A_%a.out` in the
submit directory.

## Sizing

`--mem=6G` is measured, not guessed: a comparable array on the same pipeline and the same
class of publisher PDF peaked at 3.3G RSS with a median near 2G. **Do not raise it
reflexively.** SLURM charges fairshare on requested × elapsed rather than on used, so an
over-request quietly costs future scheduling priority and buys nothing.

`--time=00:45:00` is generous against a 1m50s median; the slowest paper observed was
7m57s. The long tail is real, so do not trim this to the median.

## Sequence

```bash
# 1. Stage on the machine that has Zotero (the cluster cannot reach the local
#    Zotero API), then ship the result along with this directory and the skill.
python3 stage_pdfs.py --out <stage> --matrix-only

# 2. Download the weights ONCE. Not left to the array: N tasks starting together race
#    on one cache directory, and the usual outcome is half-written model files.
sbatch caail-docling-setup.sbatch

# 3. Size the array to the file and submit.
N=$(wc -l < "$CAAIL_PDF_DIR/refs.txt")
sbatch --array=1-"$N"%20 caail-docling.sbatch

# 4. Derive sections/ from docs/ with the committed rule.
sbatch caail-docling-respan.sbatch

# 5. Pull docs/ and sections/ back, then re-run the extract against them:
#    extract_matrix_corpus.py --docling-corpus <dir>
```

## Staging merges a paper's PDFs rather than picking one

`scope.find_pdf_attachment_key` returns a **single** PDF per item, which is the
wrong answer for any paper whose methods were published separately. Three refs in
this corpus are exactly that: two *Science* papers and a preprint whose main text
carries the model description and results while the methods sit in a
supplementary PDF. Converting either file alone loses half the evidence, and
letting the resolver take whichever it finds first makes that choice silently,
and differently per ref.

So `stage_pdfs.py` merges every PDF attached to the item into one document, main
text first and supplements after, and Docling then sees a single paper in which
`find_methods_span` can locate the methods wherever they actually are. Merging is
a page-level concatenation with `pypdfium2` — milliseconds, no rendering, no ML —
so it belongs on the staging machine rather than in the array.

Supplements go last because the section rule reads in document order, and the
supplement's own front matter should not precede the main text's introduction.
The test is the filename, which is what publishers encode: PMC author-manuscript
supplements carry `-supplement-`, publisher media files are `media-<n>.pdf`.
Anything unrecognised is treated as main text and keeps Zotero's ordering, so a
new naming convention degrades to "ordered as found" rather than to a wrong
answer. The manifest records which refs were merged and from what, so the choice
is auditable after the fact instead of implicit in a page count.

## Two things that will bite

**The weights the figure pipelines download are not the weights this needs.** A
layout-only download is a reasonable default for a pipeline that disables table
structure. `docling_ingest.build_converter()` sets `do_table_structure = True` on
purpose, because table content is what makes the data-availability and accession
extraction possible. The setup job therefore downloads **layout *and* tableformer**, and
ends by building a converter with the real options — so a version or weights mismatch
fails once, in one job, with a readable log, instead of N times in parallel.

**Mixed extractor versions inside one corpus is a variable you will have to explain.**
If some refs were converted locally and some on the cluster, either re-convert the local
ones (cheap) or be ready to say why the corpus is heterogeneous. Converting a handful of
extra PDFs costs less than the paragraph explaining it.

## Licensing

The staged PDFs and everything under `docs/` are full text of works that may be readable
but not redistributable. Wherever they are staged is subject to the same handling as the
local `docling-corpus/`: it stays out of version control, and anything that **publishes**
text must filter on the license tier rather than on open-access status. Choose a staging
location whose access controls you have actually checked.
