#!/bin/bash
# Derive sections/ from docs/ using the committed section rule. One short job.
#
# This runs the REAL `docling_ingest.py --respan`, not a reimplementation, and
# that is the whole reason the array writes only docs/. `docs/` is the durable
# artifact; `sections/` is derived from it with no PDF and no conversion. So the
# heading rule lives in exactly one place (`docling_sections.py`) and cannot
# drift between the local path and the cluster path.
#
# It prints every ref whose strategy changed, which makes a rule change
# reviewable rather than taken on faith.
#
#   sbatch caail-docling-respan.sbatch
#
#SBATCH --job-name=caail-docling-respan
#SBATCH --partition=batch
#SBATCH --cpus-per-task=2
#SBATCH --mem=8G
#SBATCH --time=00:30:00

set -euo pipefail

: "${CAAIL_ENV_DIR:?set CAAIL_ENV_DIR to the conda env holding docling}"
: "${CAAIL_OUT_DIR:?set CAAIL_OUT_DIR to the ingest output directory}"
# docling_ingest.py imports `scope` from a sibling zotero-collection-scope
# directory at module scope, so ship the skill tree rather than the one file.
: "${CAAIL_SKILL_DIR:?set CAAIL_SKILL_DIR to the skill scripts on the cluster}"

module load miniforge
source activate "$CAAIL_ENV_DIR"

echo "docs to respan: $(ls -1 "$CAAIL_OUT_DIR/docs" | wc -l)"

# See the note in caail-docling.sbatch: srun stops inheriting --cpus-per-task at
# Slurm 22.05. Respan is short and not thread-bound, so the cost here is a
# warning rather than a slowdown, but the two should not disagree.
export SRUN_CPUS_PER_TASK="$SLURM_CPUS_PER_TASK"

srun python "$CAAIL_SKILL_DIR/docling_ingest.py" --respan --out "$CAAIL_OUT_DIR"

echo
echo "sections written: $(ls -1 "$CAAIL_OUT_DIR/sections" | wc -l)"
