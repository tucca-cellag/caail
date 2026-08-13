#!/bin/bash
# Download the Docling weights this ingest needs, ONCE, and prove they work.
#
# Two reasons this is its own job rather than something the array does lazily.
#
# It must not be left to the array: N tasks starting together would race on the
# same cache directory, and the usual outcome is half-written weights that fail
# every task after the first.
#
# And the obvious weights are the wrong ones. A pipeline that disables table
# structure reasonably downloads LAYOUT ONLY -- but `build_converter()` in
# docling_ingest.py sets `do_table_structure = True` deliberately, because table
# content is what makes the data-availability and accession extraction possible.
# So layout alone is insufficient here, and the failure would otherwise surface
# once per array task instead of once.
#
#   sbatch caail-docling-setup.sbatch
#
#SBATCH --job-name=caail-docling-setup
#SBATCH --partition=batch
#SBATCH --cpus-per-task=4
#SBATCH --mem=8G
#SBATCH --time=01:00:00

set -euo pipefail

: "${CAAIL_ENV_DIR:?set CAAIL_ENV_DIR to the conda env holding docling}"
: "${CAAIL_MODELS:?set CAAIL_MODELS to the weights destination}"

module load miniforge
source activate "$CAAIL_ENV_DIR"

echo "=== docling version ==="
python -c "import docling; print(docling.__version__)"

echo
echo "=== weights present before ==="
ls -1 "$CAAIL_MODELS" || echo "(none yet)"

echo
echo "=== downloading layout + tableformer ==="
mkdir -p "$CAAIL_MODELS"
# The download is idempotent, so naming both keeps this a complete statement of
# what the pipeline needs rather than a diff against whatever is already there.
docling-tools models download layout tableformer -o "$CAAIL_MODELS"

echo
echo "=== weights present after ==="
ls -1 "$CAAIL_MODELS"

echo
echo "=== converter smoke test ==="
# Build the converter with the SAME options the array uses, then force the
# pipeline to initialize. Constructing the converter is not enough: docling
# builds pipelines lazily on the first convert() and caches them per
# (pipeline class, options hash), so a constructor-only check never reads
# artifacts_path at all. It would print "converter built OK" against a partial
# or version-mismatched tableformer download and then fail once per array task
# -- exactly the outcome this job exists to prevent. initialize_pipeline is the
# eager path, and it is what raises on missing local model files.
CAAIL_MODELS="$CAAIL_MODELS" python - <<'PY'
import os
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

opts = PdfPipelineOptions()
opts.do_ocr = False
opts.do_table_structure = True
opts.artifacts_path = os.environ["CAAIL_MODELS"]
conv = DocumentConverter(
    format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)})
conv.initialize_pipeline(InputFormat.PDF)
print("pipeline initialized OK from artifacts_path, table structure enabled")
PY
