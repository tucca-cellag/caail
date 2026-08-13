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

# --- CI path filters -------------------------------------------------------
#
# Each list below mirrors one workflow's `paths:` filter, written in GitHub
# Actions' own notation so the two can be compared MECHANICALLY instead of by
# eye. `check-ci-paths.py` asserts they match, and runs in `guards.yml`, so
# editing a workflow without editing this file fails CI.
#
# **Each variable is named for its workflow file** (`<stem uppercased, - to _>`
# plus `_PATHS`, so `lint-papers.yml` -> `LINT_PAPERS_PATHS`). That naming is
# load-bearing rather than cosmetic: the check DERIVES which variable to expect
# by globbing `.github/workflows/`, so a new paths-bearing workflow with no
# matching variable here fails CI instead of leaving preflight blind to it.
#
# That check exists because this duplication drifted three times while carrying
# a comment warning that it drifts. Two of those drifts made preflight predict
# no job where one runs (`site/public/setup.md`, then `Taxonomy.md`), and one
# hid `workers/**` entirely. A comment saying "keep these in sync" documents a
# risk; it does not mitigate one.
#
# Fourth drift, 2026-08-12, and the first the check caught rather than recorded
# after the fact: `.claude/skills/matrix-classification-audit/**` was added to
# `lint-papers.yml` and not here, in the same branch that added the extraction
# tests it gates. It failed the PR instead of shipping, which is the whole
# point. Expect a fifth; the mitigation is the check, not this paragraph.
#
# `path_matches` implements exactly the three pattern forms these workflows use,
# and deliberately no more: a literal, a `prefix/**` subtree, and a bare `*.md`,
# which GitHub scopes to the ROOT level only. That last one is not a detail —
# it is why every nested canonical directory has to be named, and why both
# `Taxonomy.md` and `Primers/**` were silently missing. The check also refuses
# any pattern outside those three forms, since `path_matches` would silently
# match nothing rather than erroring.
LINT_PAPERS_PATHS='Papers.md Software.md Databases.md OtherResources.md Taxonomy.md Datasets/** CONTRIBUTING.md CLAUDE.md site/scripts/parser/** site/scripts/db/** site/db/** site/public/api/** site/public/setup.md plugin/skills/** skills/** .claude/skills/matrix-classification-audit/**'
TEST_PATHS='site/** workers/** *.md ResearchAreas/** Datasets/** Primers/** Methods/** .claude/hooks/** .claude/settings.json .github/workflows/test.yml .github/ISSUE_TEMPLATE/**'
DOCS_PATHS='site/** *.md ResearchAreas/** Datasets/** Primers/** Methods/** .github/ISSUE_TEMPLATE/**'
GUARDS_PATHS='.claude/hooks/** .claude/settings.json .claude/skills/caail-pr-wrapup/** .github/workflows/**'

# Does $1 (a repo-relative path) match $2 (one GitHub Actions paths pattern)?
path_matches() {
  local path="$1" pat="$2"
  case "$pat" in
    '*.md') [ "$path" = "${path##*/}" ] && [ "${path%.md}" != "$path" ] ;;
    */'**') [ "${path#"${pat%/**}"/}" != "$path" ] ;;
    *)      [ "$path" = "$pat" ] ;;
  esac
}

# Iterating the pattern list needs word splitting but NOT pathname expansion:
# unquoted, the shell would glob `site/**` against the working directory and the
# loop would compare paths to real filenames instead of to patterns. Measured
# before this guard was added: 18 of 43 corpus paths changed answer, and it
# under-reported (`site/package.json` matched, `site/scripts/parser/x.ts` did
# not), which is the direction that silently predicts "no job will run".
matches_any() {
  local _p="$1" _list="$2" _wasf _rc _pat
  case "$-" in *f*) _wasf=1 ;; *) _wasf=0 ;; esac
  set -f
  _rc=1
  for _pat in $_list; do
    if path_matches "$_p" "$_pat"; then _rc=0; break; fi
  done
  [ "$_wasf" = 1 ] || set +f
  return "$_rc"
}

# Named for the workflow stem, like the variables above, so `check-ci-paths.py`
# can assert that each discovered workflow has BOTH a pattern list and a wrapper
# that preflight actually calls. A variable with no wrapper, or a wrapper with no
# call site, leaves preflight blind while every set comparison still passes.
matches_lint_papers() { matches_any "$1" "$LINT_PAPERS_PATHS"; }
matches_test()        { matches_any "$1" "$TEST_PATHS"; }
matches_docs()        { matches_any "$1" "$DOCS_PATHS"; }
matches_guards()      { matches_any "$1" "$GUARDS_PATHS"; }

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

# The preconditions that must hold at BOTH step 0 and step 2, which is why they
# live here instead of inside cmd_preflight. Every one of them can go stale in
# between, because step 1's review rounds sit in the gap: they edit files (so a
# clean tree becomes dirty), they can be driven from another checkout after a
# `git checkout` (so the branch identity changes, and the primary checkout holds
# main), and they take long enough for a token to lapse.
#
# The dirty-tree case is the one worth spelling out. A fix a round produced and
# nobody committed does not ship, and it fails silently in both directions: the
# working tree the review was performed against still looks correct, and the PR
# body truthfully claims the finding was fixed. Pushing is the last moment the
# two can still be reconciled.
#
# Deliberately NOT here: the non-empty-diff assertion. It needs the fetch that
# cmd_preflight is already doing for its path prediction, so duplicating it here
# would buy a second network round trip for a case preflight already catches.
assert_shippable() {
  local br; br="$(current_branch)"
  [ "$br" != "$DEFAULT_BRANCH" ] || die "on the default branch ($DEFAULT_BRANCH) — ship from a feature branch."
  local dirty; dirty="$(git status --porcelain)"
  if [ -n "$dirty" ]; then
    printf 'ship-pr: working tree is not clean, refusing to proceed\n' >&2
    printf '%s\n' "$dirty" >&2
    # The two classes need opposite remedies, and this check reports untracked
    # DIRECTORIES (as `?? dir/`) that `git clean -n` alone would not list, so
    # someone arriving here from the guard-verification recipe may be looking at
    # leftovers they were told were already gone.
    printf 'ship-pr:   ?? lines are untracked. Leftovers from reproducing a defect: delete them (git clean -nd to preview).\n' >&2
    printf 'ship-pr:   Anything that is part of a review fix: COMMIT it. Stashing a fix clears this check without shipping the fix.\n' >&2
    die 'commit or remove the above, then re-run preflight.'
  fi
  gh auth status >/dev/null 2>&1 || die "gh not authenticated (run: gh auth login)."
}

cmd_preflight() {
  local br; br="$(current_branch)"
  printf 'Branch: %s   Repo: %s   Default: %s\n' "$br" "$REPO" "$DEFAULT_BRANCH"
  assert_shippable
  note "working tree clean ✓"
  note "gh authenticated ✓"

  local paths lint=no tests=no deploy=no guards=no; local routes=()
  paths="$(changed_paths)"
  [ -n "$paths" ] || die "no changes vs origin/$DEFAULT_BRANCH — nothing to ship."
  printf '\nChanged paths (%s):\n' "$(echo "$paths" | wc -l | tr -d ' ')"
  while IFS= read -r p; do
    note "$p"
    matches_lint_papers "$p" && lint=yes
    matches_test "$p" && tests=yes
    matches_docs "$p" && deploy=yes
    matches_guards "$p" && guards=yes
    if r="$(route_for "$p" 2>/dev/null)"; then routes+=("$r"); fi
  done <<< "$paths"

  printf '\nCI prediction:\n'
  note "lint-papers will run on the PR:   $lint"
  note "test (vitest + e2e) on the PR:    $tests"
  note "guards (hook + CI paths) on PR:   $guards"
  note "docs.yml will deploy on merge:    $deploy   (if no, there is no deploy to watch)"
  # de-dup route hints (array → unique, blanks dropped)
  local uniq=""
  [ "${#routes[@]}" -gt 0 ] && uniq="$(printf '%s\n' "${routes[@]}" | awk 'NF' | sort -u | tr '\n' ' ')"
  printf '\nSuggested routes to verify live: %s\n' "${uniq:-(none derived — spot-check the homepage)}"

  # Destination visibility — the PR body and every commit message on this branch
  # are about to become as public as the repo is. Stated before the body is
  # composed, not after it is posted.
  local vis; vis="$(gh repo view "$REPO" --json visibility --jq .visibility 2>/dev/null || echo UNKNOWN)"
  printf '\nDestination: %s is %s\n' "$REPO" "$vis"
  if [ "$vis" = "PUBLIC" ]; then
    note "the PR body, commit messages and branch name will all be world-readable"
    note "PRs cannot be deleted (issues can) — assume anything posted is permanent"
    note "before composing the body, confirm every quoted path, code block and"
    note "architectural detail originates in THIS repo, and that nothing describes"
    note "an unpatched weakness in a live service (.claude/rules/publishing.md)"
  fi
}

cmd_push() {
  local br; br="$(current_branch)"
  # Re-assert everything, not just the tree. Copying one assertion out of
  # preflight is how this grew a hole: the first version of this guard checked
  # the tree and not the branch, so `push` would have pushed main straight to
  # origin: no PR, no checks, and docs.yml deploying an unreviewed commit.
  assert_shippable
  git push -u origin "$br"
}

cmd_open_pr() {
  local title="$1" body_file="$2" br; br="$(current_branch)"
  [ -f "$body_file" ] || die "body file not found: $body_file"
  gh pr create --base "$DEFAULT_BRANCH" --head "$br" --title "$title" --body-file "$body_file"
}

cmd_watch_checks() {
  local pr="$1" out
  # `gh pr checks` exits non-zero when there are no checks at all — happens only
  # for PRs that match none of the four workflows' paths. That is now a narrow
  # set: `.claude/hooks/**`, `.claude/settings.json`, the wrap-up skill and ANY
  # `.github/workflows/**` edit all trigger guards.yml. A truly check-free PR
  # touches only `.claude/` rules, agents, or a skill other than this one.
  # Capture its output to a variable first (NOT `gh ... | grep`): under
  # `set -o pipefail` gh's non-zero exit would mask a grep match and wrongly
  # fall through to the blocking --watch below.
  out="$(gh pr checks "$pr" 2>&1 || true)"
  if printf '%s\n' "$out" | grep -qi 'no checks reported'; then
    note "no checks reported on this PR — proceeding."
    gh pr view "$pr" --json mergeStateStatus -q '"  mergeStateStatus: " + .mergeStateStatus'
    return 0
  fi
  # Checks exist → block on them; non-zero propagates a failure to the caller.
  gh pr checks "$pr" --watch --interval 10
}

cmd_merge() {
  local pr="$1" br
  # Delete the branch THIS PR merged, not whatever is checked out locally. When
  # several PRs are open at once you may well be standing on a different branch;
  # using current_branch() here deletes that other PR's head ref, which GitHub
  # treats as abandoning it and auto-CLOSES the PR.
  br="$(gh pr view "$pr" --json headRefName -q .headRefName)"
  [ -n "$br" ] || die "could not resolve head branch for PR #$pr."

  # Refuse to merge while the local checkout and the PR are on different commits.
  # This is the other half of the failure `push` guards: a fix can be committed
  # and never pushed, and then the merge takes whatever the remote happens to
  # hold. It is silent in both directions, because the local tree is clean, the
  # log shows the fix, and the PR body truthfully claims it.
  #
  # Compare against the PR's OWN head SHA, not a remote-tracking ref. That is the
  # exact commit GitHub will merge, it needs no fetch to read, and it cannot go
  # stale the way `origin/<br>` can when a fetch quietly fails.
  #
  # Then say WHICH WAY they diverged, because the two remedies are opposite and
  # one of them is destructive. "Push" is right when local is ahead. When the
  # REMOTE is ahead (someone pressed GitHub's "Update branch", or a fix went up
  # from another worktree), pushing is rejected non-fast-forward, and the move
  # that error invites next is a --force that would throw away the very commits
  # the PR is built on. A guard that names the wrong remedy is worse than none.
  #
  # Only when this checkout is on the PR's branch: several PRs are usually open
  # at once, and from another branch local HEAD says nothing about this one.
  local pr_head local_head
  pr_head="$(gh pr view "$pr" --json headRefOid -q .headRefOid)"
  local_head="$(git rev-parse HEAD)"
  if [ "$(current_branch)" = "$br" ] && [ -n "$pr_head" ] && [ "$local_head" != "$pr_head" ]; then
    printf 'ship-pr: local %s and the PR head are different commits, refusing to merge\n' "$br" >&2
    printf '  local HEAD    %s\n' "$local_head" >&2
    printf '  PR #%s head   %s\n' "$pr" "$pr_head" >&2
    # Need the PR's head object locally to say which way it went, and it has to
    # be ASSERTED present rather than assumed: `merge-base --is-ancestor` exits
    # 128 (not 1) on a missing commit, so both tests below would be false and
    # control would fall through to "DIVERGED, do not force-push" — a confident
    # wrong answer, which is the one outcome this block is designed to avoid.
    # Reachable when the PR head is on a fork, or when the ref moved between the
    # headRefOid read above and now.
    if ! git rev-parse --verify --quiet "${pr_head}^{commit}" >/dev/null; then
      git fetch origin "$br" >&2 ||
        die "cannot fetch origin/$br to tell which way these diverged; reconcile by hand, do not force."
      git rev-parse --verify --quiet "${pr_head}^{commit}" >/dev/null ||
        die "the PR's head commit is not in this repo even after fetching origin/$br (a fork PR, or the ref moved); reconcile by hand, do not force."
    fi
    if git merge-base --is-ancestor "$pr_head" "$local_head"; then
      die "local is AHEAD of the PR: push, then merge. A committed but unpushed fix is not in the PR."
    elif git merge-base --is-ancestor "$local_head" "$pr_head"; then
      die "local is BEHIND the PR: fast-forward this checkout. Do NOT push or force, the PR holds commits you do not."
    else
      die "local and the PR have DIVERGED: reconcile by hand before merging. Do not force-push."
    fi
  fi

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
  # remote branch is gone via the API. Match the ref exactly: a substring grep
  # would see `fix/foo` inside `fix/foo-bar`.
  remote_has_branch() { git ls-remote --heads origin "$br" | grep -qx "[0-9a-f]*	refs/heads/${br}"; }
  if remote_has_branch; then
    gh api -X DELETE "repos/${REPO}/git/refs/heads/${br}" >/dev/null 2>&1 || true
  fi
  if remote_has_branch; then
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
