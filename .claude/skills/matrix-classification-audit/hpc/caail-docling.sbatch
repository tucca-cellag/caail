#!/bin/bash
# Convert one staged PDF per array task into a DoclingDocument JSON.
#
# Each task reads one PDF and writes one file named after its own ref id, so no
# two tasks ever touch the same path. The array finishes the backlog in the wall
# time of the slowest paper rather than the sum of all of them.
#
#   N=$(wc -l < "$CAAIL_PDF_DIR/refs.txt")
#   sbatch --array=1-"$N"%20 caail-docling.sbatch
#
# Paths come from the environment (see README.md). Nothing here is site-specific,
# so overriding partition and log destination is done on the command line:
#   sbatch --partition=<p> --output=<dir>/%A_%a.out --array=... caail-docling.sbatch
#
#SBATCH --job-name=caail-docling
#SBATCH --partition=batch
#SBATCH --cpus-per-task=4
# Measured, not guessed: a comparable array on this pipeline peaked at 3.3G RSS
# with a median near 2G, so 6G sits a little under 2x the worst case seen. Do NOT
# raise this reflexively -- SLURM charges fairshare on requested x elapsed rather
# than on used, so an over-request quietly costs future scheduling priority and
# buys nothing.
#SBATCH --mem=6G
# Generous against a 1m50s median; the slowest paper observed was 7m57s. The long
# tail is real, so do not trim this toward the median.
#SBATCH --time=00:45:00

set -euo pipefail

# Required, and deliberately fatal when unset: a job that guesses its paths
# writes somewhere plausible and wrong, which is worse than not starting.
: "${CAAIL_ENV_DIR:?set CAAIL_ENV_DIR to the conda env holding docling}"
: "${CAAIL_MODELS:?set CAAIL_MODELS to the pre-downloaded Docling weights}"
: "${CAAIL_PDF_DIR:?set CAAIL_PDF_DIR to the staged PDFs + refs.txt}"
: "${CAAIL_OUT_DIR:?set CAAIL_OUT_DIR to the ingest output directory}"
: "${CAAIL_HPC_DIR:?set CAAIL_HPC_DIR to this directory on the cluster}"
# convert_one.py builds its converter from docling_ingest.build_converter()
# rather than keeping a second copy of those options, so it needs the skill on
# sys.path. Its relative fallback is only correct in a checkout where hpc/ still
# sits inside the skill directory, which is not the shipped layout.
: "${CAAIL_SKILL_DIR:?set CAAIL_SKILL_DIR to the skill scripts on the cluster}"

REF=$(sed -n "${SLURM_ARRAY_TASK_ID}p" "$CAAIL_PDF_DIR/refs.txt")
if [ -z "$REF" ]; then
  echo "No ref at line $SLURM_ARRAY_TASK_ID of $CAAIL_PDF_DIR/refs.txt" >&2
  exit 1
fi

echo "task $SLURM_ARRAY_TASK_ID  ref $REF"

module load miniforge
# Activate a custom-location env by FULL PATH. The bare name works interactively
# and fails in batch with EnvironmentNameNotFound, because the custom envs
# directory is not on conda's search path in a non-interactive shell.
source activate "$CAAIL_ENV_DIR"

# Give each task its own scratch, and keep it off node-local /tmp.
#
# Torch's inductor backend JIT-compiles kernels and writes them under TMPDIR.
# Node-local /tmp is small and shared with every other job on the box, so a
# long document can exhaust it mid-conversion. The failure is worth describing
# because it does not look like a disk problem: docling reports
# `ConversionError`, and the actual cause -- `fatal error: ... header.i: No
# space left on device` -- sits under roughly two thousand lines of dynamo
# traceback. One 39-page document failed this way after seven minutes while
# every shorter document on the same array succeeded, which reads as "that PDF
# is broken" rather than "that node was full".
TASK_SCRATCH="$CAAIL_OUT_DIR/tmp/${SLURM_ARRAY_JOB_ID:-$SLURM_JOB_ID}_${SLURM_ARRAY_TASK_ID:-0}"
mkdir -p "$TASK_SCRATCH"
export TMPDIR="$TASK_SCRATCH"
export TORCHINDUCTOR_CACHE_DIR="$TASK_SCRATCH/inductor"
# Self-cleaning: the compiled kernels are worthless once the task ends, and a
# per-task directory left behind on a shared volume is the same problem moved.
#
# TERM and INT as well as EXIT, because a non-interactive bash dies on SIGTERM
# without running its EXIT trap -- and SIGTERM is how Slurm ends a job that hits
# the walltime or the memory limit. Those are precisely the long-tail and
# large-document tasks, so an EXIT-only trap would leave behind the caches of
# exactly the runs most likely to fail, while claiming to be self-cleaning.
trap 'rm -rf "$TASK_SCRATCH"' EXIT TERM INT

# Since Slurm 22.05 `srun` no longer inherits --cpus-per-task from the batch
# allocation, so without this the step gets ONE cpu while docling is told to use
# $SLURM_CPUS_PER_TASK threads. Under cgroup enforcement those threads contend
# for a single core: conversions run several times slower than the median the
# --time above is sized against, which pushes the long-tail papers toward the
# walltime. The symptom is a timeout, so it reads as "this PDF is too big".
export SRUN_CPUS_PER_TASK="$SLURM_CPUS_PER_TASK"

srun python "$CAAIL_HPC_DIR/convert_one.py" \
  --pdf "$CAAIL_PDF_DIR/ref-${REF}.pdf" \
  --ref "$REF" \
  --out "$CAAIL_OUT_DIR" \
  --artifacts-path "$CAAIL_MODELS" \
  --threads "$SLURM_CPUS_PER_TASK"
