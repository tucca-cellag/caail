#!/usr/bin/env bash
# PreToolUse hook for Bash — guards outward-facing `gh` publishing commands.
#
# Why this exists: an agent traced a feature into a PRIVATE third-party repo,
# correctly reported that it was private, and its source code and unmitigated
# security posture were then published into a PUBLIC issue tracker anyway. The
# provenance fact was present in context and simply never re-consulted at the
# moment of publishing. Prose rules did not prevent that (several already said
# to confirm outward-facing actions); a deterministic check at the point of
# action does.
#
# Two behaviours, per .claude/rules/publishing.md:
#
#   1. ANNOUNCE (always, non-blocking) — every publish into a public repo gets
#      the destination's visibility injected into context. Costs nothing and
#      makes "is this public?" impossible to not notice.
#
#   2. DENY (only on risk signals) — a public destination whose payload carries
#      a fenced code block, a foreign github.com owner, or security-finding
#      vocabulary is blocked pending an explicit provenance confirmation.
#      Ordinary feature PRs and issues sail through untouched.
#
# TWO COPIES, DELIBERATELY IDENTICAL:
#   .claude/hooks/     (this repo — protects anyone who clones it)
#   ~/.claude/hooks/   (user global — protects every other repo)
# They must stay byte-identical; `diff` the two to check. The global copy
# detects a project copy and passes through, so `gh` is never queried twice.
#
# Override mechanism (mirrors check-command-antipatterns.sh):
#   Claude writes /tmp/claude-publish-override-<sha16-of-cmd>, then immediately
#   re-runs the SAME command. Single-use, 60s TTL, pinned to one exact command.
#
# Architecture: defer → tripwire → override → visibility → payload scan → JSON.
# EVERY error path fails OPEN. A broken hook must never brick publishing.

set -uo pipefail

PASS_THROUGH='{"hookSpecificOutput":{"hookEventName":"PreToolUse"}}'

# --- Defer: if this is the global copy and the project ships its own, stop ---
proj_dir="${CLAUDE_PROJECT_DIR:-}"
proj_hook="${proj_dir}/.claude/hooks/check-public-publish.sh"
if [[ -n $proj_dir && -r $proj_hook ]]; then
  self_real=$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)/$(basename "$0")
  proj_real=$(cd "$(dirname "$proj_hook")" 2>/dev/null && pwd -P)/$(basename "$proj_hook")
  if [[ $self_real != "$proj_real" ]]; then
    printf '%s\n' "$PASS_THROUGH"
    exit 0
  fi
fi

# The rule this hook enforces — prefer the project's copy when one exists.
RULE="$HOME/.claude/docs/rules/publishing.md"
[[ -r "${proj_dir}/.claude/rules/publishing.md" ]] && RULE=".claude/rules/publishing.md"

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)

[[ -z $cmd ]] && { printf '%s\n' "$PASS_THROUGH"; exit 0; }

# --- Tripwire: is this a publishing command at all? -----------------------
# Deliberately narrow. Reads (gh issue view/list, gh pr view) never match.
#
# ANCHORED TO COMMAND POSITION — start of line, or after a shell separator.
# Without this it also matched the verb appearing as *data*: a test fixture, a
# heredoc writing documentation, an echo describing a command. Those fired
# constantly during ordinary work, and a guard that cries wolf is one that gets
# switched off. A real publish is always at command position; a mention is not.
# `close`/`reopen`/`review` are in the list because each accepts --comment/--body
# and therefore publishes text, which is easy to forget when reaching for them.
if ! grep -qE '(^|[;&|(]|&&|\|\|)[[:space:]]*(sudo[[:space:]]+)?gh[[:space:]]+((issue|pr|release|gist)[[:space:]]+(create|comment|edit|close|reopen|review)|api[[:space:]][^|]*-X[[:space:]]*POST[^|]*(issues|comments|releases))' <<<"$cmd"; then
  printf '%s\n' "$PASS_THROUGH"
  exit 0
fi

# --- Override check (single-use, 60s TTL) ---------------------------------
cmd_hash=$(printf '%s' "$cmd" | shasum -a 256 | cut -c1-16)
override_file="/tmp/claude-publish-override-${cmd_hash}"

if [[ -f $override_file ]]; then
  if find "$override_file" -mmin -1 -print 2>/dev/null | grep -q .; then
    rm -f "$override_file"
    printf '%s\n' "$PASS_THROUGH"
    exit 0
  fi
  rm -f "$override_file"  # stale
fi

# --- Resolve the destination repo and its visibility ----------------------
command -v gh >/dev/null 2>&1 || { printf '%s\n' "$PASS_THROUGH"; exit 0; }

# An explicit --repo/-R wins; otherwise gh infers from the directory the command
# will actually run in — which is NOT necessarily this hook's cwd.
#
# The hook runs before the command, in the session's directory. A command that
# begins `cd <elsewhere> && gh issue create …` publishes to <elsewhere>'s repo,
# and resolving from our own cwd answers a question nobody asked.
#
# Both directions were reproduced, and only one of them is harmless. Naming the
# wrong repo in the announcement is merely wrong. The other direction is the
# guard disappearing: with the session in a PRIVATE repo and the command doing
# `cd <public repo> && gh issue create --body '…api_key…'`, the private verdict
# short-circuits below and the payload is never scanned. Measured on the exact
# same command, changing nothing but the hook's cwd: deny from one, silent
# pass-through from the other. That is this guard's own cautionary pattern, a
# check that looks present and is not.
dest=$(grep -oE '(--repo|-R) +[^ ]+' <<<"$cmd" | head -n1 | awk '{print $2}' | tr -d "\"'")
cd_dir=""
if [[ -z $dest ]]; then
  # First `cd` at the start of the command or of a segment. Deliberately narrow:
  # it catches the shape that actually occurs (`cd X && gh …`) and leaves anything
  # cleverer to the undetermined branch below rather than guessing at it.
  cd_dir=$(grep -oE '(^|[;&|(]) *cd +[^ ;&|)]+' <<<"$cmd" | head -n1 | sed -E 's/.*cd +//' | tr -d "\"'")
  cd_dir="${cd_dir/#\~/$HOME}"
fi

dest_unknown=0
if [[ -n $dest ]]; then
  meta=$(timeout 10 gh repo view "$dest" --json nameWithOwner,visibility 2>/dev/null)
elif [[ -n $cd_dir ]]; then
  meta=$( (cd "$cd_dir" 2>/dev/null && timeout 10 gh repo view --json nameWithOwner,visibility 2>/dev/null) )
  # A cd we could not follow is not the same as "no repo here", and must not be
  # treated as one. Resolving from our own cwd instead would be the original bug;
  # skipping the payload scan would move the hole rather than close it. So the
  # destination is marked unknown and the scan runs anyway: an unknown
  # destination cannot be ruled public, so risky content is denied and the reason
  # says why it could not be resolved.
  [[ -z $meta ]] && dest_unknown=1
else
  meta=$(timeout 10 gh repo view --json nameWithOwner,visibility 2>/dev/null)
fi

if [[ $dest_unknown -eq 1 ]]; then
  repo="an unresolved destination (the command changes directory to '${cd_dir}')"
  vis_phrase="whose visibility could NOT be resolved, so it is treated as if it were public"
  vis_tag="UNRESOLVED"
  # No owner, so the foreign-owner signal cannot be computed. Left empty
  # deliberately: it degrades to "not a signal" rather than matching everything.
  owner=""
else
  # Can't determine the destination at all — fail open rather than block real work.
  [[ -z $meta ]] && { printf '%s\n' "$PASS_THROUGH"; exit 0; }

  repo=$(jq -r '.nameWithOwner // empty' <<<"$meta" 2>/dev/null)
  vis=$(jq -r '.visibility // empty' <<<"$meta" 2>/dev/null)
  owner="${repo%%/*}"

  # Private destination: the leak class this guards against does not apply.
  if [[ $vis != "PUBLIC" ]]; then
    printf '%s\n' "$PASS_THROUGH"
    exit 0
  fi
  vis_phrase="which is PUBLIC"
  vis_tag="PUBLIC"
fi

# --- Gather the payload ---------------------------------------------------
# The command string already contains heredoc bodies and --body "..." text.
# --body-file points elsewhere, so pull that in too.
payload="$cmd"
body_file=$(grep -oE '\--body-file +[^ ]+' <<<"$cmd" | head -n1 | awk '{print $2}' | tr -d "\"'")
if [[ -n $body_file && $body_file != "-" && -r $body_file ]]; then
  payload+=$'\n'$(head -c 100000 "$body_file" 2>/dev/null)
fi

# --- Risk signals ---------------------------------------------------------
signals=()

grep -qE '```' <<<"$payload" && signals+=("a fenced code block")

# A github.com URL under an owner that is not this repo's owner.
foreign=$(grep -oE 'github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+' <<<"$payload" \
  | sed -E 's|github\.com/||' | cut -d/ -f1 | sort -u \
  | grep -vix "$owner" | head -n3 | paste -sd, -)
[[ -n $foreign ]] && signals+=("references to another owner's repo ($foreign)")

if grep -qiE 'no auth|unauthenticated|without auth|rate.?limit|api[ _-]?key|auth_token|credential|\bsecret\b|password|samesite|allow_credentials|vulnerab|exploit|CVE-[0-9]|XSS|injection|logs? (the )?(full|raw|verbatim)' <<<"$payload"; then
  signals+=("security-finding vocabulary")
fi

# --- No signals: announce visibility, allow ------------------------------
if [[ ${#signals[@]} -eq 0 ]]; then
  jq -nc --arg ctx "Publishing to ${repo}, ${vis_phrase}. Nothing in the payload tripped the provenance guard." \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
  exit 0
fi

# --- Signals: deny pending explicit provenance confirmation ---------------
joined=$(printf '%s; ' "${signals[@]}"); joined="${joined%; }"
reason="Publishing to ${repo} (${vis_tag}) with: ${joined}."

ctx="BLOCKED by the public-publish provenance guard (${RULE}). Destination: ${repo}, ${vis_phrase}. Payload contains: ${joined}.

Before retrying, verify EACH of these and state the answers explicitly:
  1. PROVENANCE — does every quoted file path, code block, config value and architectural detail originate in THIS repo? Anything learned from a private repo, a third party's source, or an authenticated API for a repo you do not own MUST NOT be published. Paraphrase discloses as much as a quote.
  2. SECURITY — does this describe a weakness in a live service (missing auth, absent rate limiting, an exposed key, an injection path)? If the service is not yours, it goes to its owner privately. If it is yours and unpatched, do not pair the weakness with a live hostname or endpoint.
  3. DESTINATION — is a public tracker the right venue at all, versus a private channel to the code's owner?

If all three are clear, INVOKE AskUserQuestion and offer: (a) Publish as-is — run \`touch ${override_file}\` then immediately re-run the SAME command (single-use, expires in 60s); (b) Revise the payload to remove the flagged content; (c) Cancel and route it privately instead. Do not bypass this by other means, and do not assume a false positive without checking."

jq -nc --arg reason "$reason" --arg ctx "$ctx" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason,additionalContext:$ctx}}'
exit 0
