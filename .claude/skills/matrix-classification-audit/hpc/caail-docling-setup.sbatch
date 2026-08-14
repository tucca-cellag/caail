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
# The smoke test builds its converter from docling_ingest.build_converter()
# rather than keeping a second copy of the options, so it needs the skill.
: "${CAAIL_SKILL_DIR:?set CAAIL_SKILL_DIR to the skill scripts on the cluster}"

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
# The converter comes from docling_ingest.build_converter(), not from a copy of
# its options here. A second copy would let this job verify a pipeline the array
# does not build: enable OCR or a formula model upstream and the smoke test would
# download and check the wrong weights, report success, and leave every array
# task to fail on a model it never fetched -- which is the failure this job
# exists to prevent, reintroduced by the check itself.
python - <<'PY'
import os
import sys

sys.path.insert(0, os.environ["CAAIL_SKILL_DIR"])
sys.path.insert(0, os.path.join(os.path.dirname(os.environ["CAAIL_SKILL_DIR"]),
                                "zotero-collection-scope"))
import docling_ingest
from docling.datamodel.base_models import InputFormat

# threads is passed because the array passes it, and it selects a branch of
# build_converter that is deliberately wrapped in a swallow-everything try/except
# so a docling upgrade cannot fail 224 tasks. That safety is exactly what makes
# the branch invisible: without exercising it here, an upgrade that moved the
# accelerator options would degrade silently across the whole array instead of
# printing once, in this job, where someone is reading.
conv = docling_ingest.build_converter(
    artifacts_path=os.environ["CAAIL_MODELS"],
    threads=int(os.environ.get("SLURM_CPUS_PER_TASK", "4")))
conv.initialize_pipeline(InputFormat.PDF)
print("pipeline initialized OK from artifacts_path, using the array's own options")
PY
