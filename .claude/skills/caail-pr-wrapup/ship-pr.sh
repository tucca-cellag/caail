#!/usr/bin/env bash
#
# ship-pr.sh — deterministic gh/git/curl orchestration for the caail-pr-wrapup skill.
#
# This is the brittle, repeatable machinery of shipping a CAAIL branch: pushing,
# opening the PR, watching checks, merging (with the known worktree gotcha
# handled), watching the GitHub Pages deploy, and verifying the live site. It is
# intentionally NOT the whole skill — the operating manual (SKILL.md) keeps the
# judgment calls with Claude: the local test gate, composing the PR body, the
# confirm-before-merge pause, and worktree cleanup (ExitWorktree only works in
# the main session). Run one phase at a time so Claude can pause between them.
#
# Usage:
#   ship-pr.sh preflight                 # read-only: branch/tree/auth + CI prediction + route hints
#   ship-pr.sh push                      # push the current branch to origin
#   ship-pr.sh open-pr <title> <body-file>
#   ship-pr.sh watch-checks <pr>         # blocks on PR checks; 0 if none/clean, non-zero if a check fails
#   ship-pr.sh merge <pr>               # merge + delete remote branch, with the gotcha fallback; prints SHA
#   ship-pr.sh watch-deploy <merge-sha> # finds + watches the docs.yml run for that SHA; 0 if no deploy fires
#   ship-pr.sh verify-live <route>...   # curls https://<pages>/caail/<route>/; non-zero if any != 200
#
# Everything is read-only except `push`, `open-pr`, and `merge`.

set -euo pipefail

# --- repo facts (derived, not hardcoded, so a fork still works) ---------------
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"          # e.g. tucca-cellag/caail
DEFAULT_BRANCH="$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)"  # e.g. main
PAGES_BASE="https://tucca-cellag.github.io/caail"                       # CAAIL GitHub Pages root
DEPLOY_WORKFLOW="docs.yml"                                              # the Pages deploy workflow

die() { printf 'ship-pr: %s\n' "$*" >&2; exit 1; }
note() { printf '  %s\n' "$*"; }

current_branch() { git rev-parse --abbrev-ref HEAD; }

# Changed paths on this branch vs the default branch (merge-base diff).
changed_paths() {
  git fetch -q origin "$DEFAULT_BRANCH"
  git diff --name-only "origin/${DEFAULT_BRANCH}...HEAD"
}

# A path matches one of the CI globs? (POSIX case globbing, not regex.)
# lint-papers.yml PR/push paths:
matches_lint() {
  case "$1" in
    Papers.md|Software.md|Databases.md|OtherResources.md) return 0 ;;
    Datasets/*|site/scripts/parser/*) return 0 ;;
    *) return 1 ;;
  esac
}
# docs.yml deploy paths (note: '*.md' is ROOT-ONLY in GitHub Actions — nested
# dirs like Primers/ are NOT covered and so do NOT trigger a deploy):
matches_deploy() {
  case "$1" in
    site/*|ResearchAreas/*|Datasets/*) return 0 ;;
    *.md) [ "$1" = "${1##*/}" ] && return 0 || return 1 ;;  # root-level *.md only
    *) return 1 ;;
  esac
}

# Best-effort: map a changed canonical file to the site route to spot-check.
route_for() {
  case "$1" in
    Papers.md) echo "papers/explorer" ;;
    Software.md) echo "software" ;;
    Databases.md) echo "databases" ;;
    AwesomeLists.md) echo "awesome-lists" ;;
    OtherResources.md) echo "other-resources" ;;
    Funding.md) echo "funding" ;;
    ReferenceWorks.md) echo "reference-works" ;;
    Taxonomy.md) echo "taxonomy" ;;
    AIAgentsFoundationModels.md) echo "ai-agents-foundation-models" ;;
    CONTRIBUTING.md) echo "contributing" ;;
    Talks.md) echo "talks" ;;
    README.md) echo "" ;;  # homepage
    Primers/CellAg.md) echo "primers/cell-ag" ;;
    Primers/AI.md) echo "primers/ai" ;;
    ResearchAreas/*.md) f="${1##*/}"; echo "research-areas/$(echo "${f%.md}" | tr '[:upper:]' '[:lower:]')" ;;
    Datasets/*.md) f="${1##*/}"; echo "datasets/$(echo "${f%.md}" | tr '[:upper:]' '[:lower:]')" ;;
    *) return 1 ;;
  esac
}

cmd_preflight() {
  local br; br="$(current_branch)"
  printf 'Branch: %s   Repo: %s   Default: %s\n' "$br" "$REPO" "$DEFAULT_BRANCH"
  [ "$br" != "$DEFAULT_BRANCH" ] || die "on the default branch ($DEFAULT_BRANCH) — ship from a feature branch."
  if [ -n "$(git status --porcelain)" ]; then
    die "working tree is dirty — commit or stash before shipping."
  fi
  note "working tree clean ✓"
  if gh auth status >/dev/null 2>&1; then note "gh authenticated ✓"; else die "gh not authenticated (run: gh auth login)."; fi

  local paths lint=no deploy=no; local routes=()
  paths="$(changed_paths)"
  [ -n "$paths" ] || die "no changes vs origin/$DEFAULT_BRANCH — nothing to ship."
  printf '\nChanged paths (%s):\n' "$(echo "$paths" | wc -l | tr -d ' ')"
  while IFS= read -r p; do
    note "$p"
    matches_lint "$p" && lint=yes
    matches_deploy "$p" && deploy=yes
    if r="$(route_for "$p" 2>/dev/null)"; then routes+=("$r"); fi
  done <<< "$paths"

  printf '\nCI prediction:\n'
  note "lint-papers will run on the PR:   $lint"
  note "docs.yml will deploy on merge:    $deploy   (if no, there is no deploy to watch)"
  # de-dup route hints (array → unique, blanks dropped)
  local uniq=""
  [ "${#routes[@]}" -gt 0 ] && uniq="$(printf '%s\n' "${routes[@]}" | awk 'NF' | sort -u | tr '\n' ' ')"
  printf '\nSuggested routes to verify live: %s\n' "${uniq:-(none derived — spot-check the homepage)}"
}

cmd_push() {
  local br; br="$(current_branch)"
  git push -u origin "$br"
}

cmd_open_pr() {
  local title="$1" body_file="$2" br; br="$(current_branch)"
  [ -f "$body_file" ] || die "body file not found: $body_file"
  gh pr create --base "$DEFAULT_BRANCH" --head "$br" --title "$title" --body-file "$body_file"
}

cmd_watch_checks() {
  local pr="$1"
  # `gh pr checks` exits non-zero when there are no checks at all — that's fine
  # for site-config / .claude PRs (lint-papers only runs on content/parser paths).
  if ! gh pr checks "$pr" >/dev/null 2>&1; then
    if gh pr checks "$pr" 2>&1 | grep -qi 'no checks reported'; then
      note "no checks reported on this PR — proceeding."
      gh pr view "$pr" --json mergeStateStatus -q '"  mergeStateStatus: " + .mergeStateStatus'
      return 0
    fi
  fi
  # Checks exist → block on them; non-zero propagates a failure to the caller.
  gh pr checks "$pr" --watch --interval 10
}

cmd_merge() {
  local pr="$1" br; br="$(current_branch)"
  # The merge itself: gh's POST-merge LOCAL step (`git branch -d`/switch) fails
  # with "fatal: '<default>' is already checked out" when run from a linked
  # worktree while the primary checkout holds the default branch. That is
  # BENIGN — the remote merge has already happened — so we don't trust gh's exit
  # code here; we verify state directly.
  gh pr merge "$pr" --merge --delete-branch >/dev/null 2>&1 || true

  local state sha
  state="$(gh pr view "$pr" --json state -q .state)"
  [ "$state" = "MERGED" ] || die "PR #$pr did not merge (state=$state) — investigate, do not retry blindly."
  sha="$(gh pr view "$pr" --json mergeCommit -q .mergeCommit.oid)"

  # --delete-branch may not have completed (same local-step failure). Ensure the
  # remote branch is gone via the API.
  if git ls-remote --heads origin "$br" | grep -q "$br"; then
    gh api -X DELETE "repos/${REPO}/git/refs/heads/${br}" >/dev/null 2>&1 || true
  fi
  if git ls-remote --heads origin "$br" | grep -q "$br"; then
    note "warning: remote branch '$br' still present — delete it manually."
  else
    note "remote branch '$br' deleted ✓"
  fi

  printf 'MERGED  pr=#%s  merge_commit=%s\n' "$pr" "$sha"
}

cmd_watch_deploy() {
  local sha="$1" id=""
  # The deploy run can take a few seconds to register after the push to default.
  for _ in $(seq 1 12); do
    id="$(gh run list --workflow="$DEPLOY_WORKFLOW" --branch "$DEFAULT_BRANCH" --limit 5 \
            --json databaseId,headSha -q ".[] | select(.headSha==\"$sha\") | .databaseId" | head -1)"
    [ -n "$id" ] && break
    sleep 5
  done
  if [ -z "$id" ]; then
    note "no $DEPLOY_WORKFLOW run found for $sha — the merge likely touched no deploy paths (nothing to watch)."
    return 0
  fi
  note "watching deploy run $id …"
  # --exit-status makes a failed run (e.g. the Lighthouse gate) propagate non-zero.
  gh run watch "$id" --interval 15 --exit-status
}

cmd_verify_live() {
  [ "$#" -ge 1 ] || die "verify-live needs at least one route (use '' for the homepage)."
  local rc=0 route url code
  # Give the CDN a moment to pick up the fresh deploy.
  sleep 15
  for route in "$@"; do
    url="${PAGES_BASE}/${route:+$route/}"
    code="$(curl -s -o /dev/null -w '%{http_code}' "$url")"
    if [ "$code" = "200" ]; then note "200  $url"; else note "$code  $url   <-- FAILED"; rc=1; fi
  done
  return "$rc"
}

# --- dispatch -----------------------------------------------------------------
sub="${1:-}"; shift || true
case "$sub" in
  preflight)     cmd_preflight "$@" ;;
  push)          cmd_push "$@" ;;
  open-pr)       cmd_open_pr "$@" ;;
  watch-checks)  cmd_watch_checks "$@" ;;
  merge)         cmd_merge "$@" ;;
  watch-deploy)  cmd_watch_deploy "$@" ;;
  verify-live)   cmd_verify_live "$@" ;;
  ""|-h|--help)
    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) die "unknown subcommand: $sub (try --help)" ;;
esac
