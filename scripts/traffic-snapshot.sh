#!/usr/bin/env bash
#
# traffic-snapshot.sh — append one day's GitHub traffic figures to a local NDJSON.
#
# WHY THIS EXISTS
#   GitHub's traffic API retains 14 days and offers no archival endpoint. Data older
#   than that is gone, not merely harder to get. This turns a rolling window into an
#   indefinite series, at the cost of remembering to run it.
#
# WHY IT IS LOCAL AND NOT A GITHUB ACTION
#   The output holds CAAIL's own traffic figures, which CAAIL-264 and CAAIL-320 label
#   disclosure-private. A workflow in a public repo can only commit to that public repo,
#   so an Action would publish them permanently — GHArchive captures public events and
#   pull requests cannot be deleted. So this is deliberately a local script writing to a
#   gitignored path. The trade is real: if nobody runs it, there is no history.
#
# WHY IT RECORDS WORKFLOW RUNS ALONGSIDE
#   ~94% of this repo's clone count is its own CI (CAAIL-320: Pearson r = 0.9917 against
#   workflow-run volume, ~4.00 clones per run). A clone figure without that day's run
#   count is uncorrectable, and it cannot be reconstructed later once the 14-day window
#   passes. So the divisor travels with the figure — the correction is only possible if
#   both were captured at the same time.
#
# USAGE
#   scripts/traffic-snapshot.sh                 # append today's snapshot
#   scripts/traffic-snapshot.sh --dry-run       # print, write nothing
#   OUT=<path> scripts/traffic-snapshot.sh      # override the output file
#
#   Needs `gh` authenticated with a token carrying repo/Administration:read.
#   Suggested cadence: daily. Weekly still works — the API returns 14 days per call,
#   so a weekly run loses nothing as long as the gap stays under 14 days.
#
set -euo pipefail

REPO="${REPO:-tucca-cellag/caail}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

# CHOOSING THE DEFAULT OUTPUT PATH
#
# The repo is mid-restructure: docs/research/ is being replaced by internal-docs/,
# and at the time of writing the new rule exists in a working tree but not on
# origin/main. Hardcoding either path gives a script that is inert on one side of
# that merge and unsafe-looking on the other.
#
# So rather than assume which convention is live, ask git. Take the first candidate
# whose destination is actually gitignored. That keeps working whichever order the
# restructure lands in, and needs no update when it does.
DEFAULT_CANDIDATES=(
  "internal-docs/metrics/traffic.ndjson"
  "docs/research/metrics/traffic.ndjson"
)
if [[ -z "${OUT:-}" ]]; then
  for cand in "${DEFAULT_CANDIDATES[@]}"; do
    if git -C "$ROOT" check-ignore -q "$cand" 2>/dev/null; then
      OUT="${ROOT}/${cand}"
      break
    fi
  done
  # None ignored: leave OUT at the first candidate so the guard below reports a
  # concrete path rather than an empty one, and refuses.
  OUT="${OUT:-${ROOT}/${DEFAULT_CANDIDATES[0]}}"
fi

command -v gh >/dev/null || { echo "traffic-snapshot: gh not found" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "traffic-snapshot: gh not authenticated" >&2; exit 1; }

# REFUSE TO WRITE PRIVATE DATA TO A COMMITTABLE PATH.
#
# The output holds this project's own traffic figures. Its only protection is that the
# destination is gitignored (CAAIL-331), and nothing else in the repo verifies that.
# So verify it here, at the one moment it can be checked cheaply and acted on.
#
# This is not hypothetical: the first run of this script was attempted from a worktree
# created before internal-docs/ existed, where the path resolves but is NOT ignored.
# The write would have succeeded and left private figures one `git add -A` from a public
# repo. Nothing else would have objected.
#
# Note what is asserted: not "is this data private" — a script cannot know that — but the
# structural precondition, "is the destination ignored". Completeness is checkable where
# correctness is not.
if [[ "$DRY_RUN" != "1" ]]; then
  if ! git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    echo "traffic-snapshot: ${ROOT} is not a git repo; cannot verify the output path is ignored" >&2
    exit 1
  fi
  rel="${OUT#"${ROOT}"/}"
  if ! git -C "$ROOT" check-ignore -q "$rel" 2>/dev/null; then
    cat >&2 <<EOF
traffic-snapshot: REFUSING TO WRITE.

  ${rel}
  is NOT gitignored in ${ROOT}

This file holds CAAIL's own traffic figures (disclosure-private per CAAIL-264 and
CAAIL-320), and tucca-cellag/caail is public. Writing here would leave them one
'git add -A' from publication, and pull requests cannot be deleted.

Fix one of:
  * run from a checkout whose .gitignore covers the destination, or
  * set OUT=<a gitignored path> explicitly, or
  * add the destination to .gitignore first.
EOF
    exit 1
  fi
fi

api() { gh api "/repos/${REPO}$1"; }

views=$(api /traffic/views)
clones=$(api /traffic/clones)
paths=$(api /traffic/popular/paths)
referrers=$(api /traffic/popular/referrers)

# Workflow runs for the same window, bucketed by day. This is the CI divisor above.
since=$(date -u -v-14d +%Y-%m-%d 2>/dev/null || date -u -d '14 days ago' +%Y-%m-%d)
runs=$(gh api --paginate "/repos/${REPO}/actions/runs?created=>=${since}&per_page=100" \
        --jq '[.workflow_runs[] | .created_at[0:10]]' | python3 -c '
import json, sys, collections
days = collections.Counter()
for chunk in sys.stdin.read().split("\n"):
    if chunk.strip():
        for d in json.loads(chunk):
            days[d] += 1
print(json.dumps(days))')

python3 - "$views" "$clones" "$paths" "$referrers" "$runs" "$OUT" "$DRY_RUN" <<'PY'
import json, os, sys, datetime

views, clones, paths, referrers, runs, out, dry = sys.argv[1:8]
record = {
    "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "repo": os.environ.get("REPO", "tucca-cellag/caail"),
    "views": json.loads(views),
    "clones": json.loads(clones),
    "popular_paths": json.loads(paths),
    "popular_referrers": json.loads(referrers),
    # The divisor. Clones on a day are ~4x this; see CAAIL-320.
    "workflow_runs_by_day": json.loads(runs),
    "note": ("clones are ~94% CI: correct with workflow_runs_by_day before quoting. "
             "GitHub does not document how 'uniques' is computed - do not call it people."),
}
line = json.dumps(record, sort_keys=True)

if dry == "1":
    print(line)
    sys.exit(0)

os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "a", encoding="utf-8") as fh:
    fh.write(line + "\n")

v, c = record["views"], record["clones"]
n = sum(1 for _ in open(out, encoding="utf-8"))
ci = sum(record["workflow_runs_by_day"].values())
print(f"appended to {out} ({n} snapshot{'s' if n != 1 else ''})")
print(f"  14d views  : {v['count']:>6}  ({v['uniques']} uniques)")
print(f"  14d clones : {c['count']:>6}  ({c['uniques']} uniques)  <- {ci} CI runs in window")
est = ci * 4.0
if c["count"]:
    print(f"  est. CI-attributable clones: {est:.0f} of {c['count']} "
          f"({100*min(est,c['count'])/c['count']:.0f}%)")
PY
