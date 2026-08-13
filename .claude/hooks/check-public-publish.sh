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
#      makes "is this public?" impossible to not notice. A destination that
#      could NOT be resolved is announced too, naming why: this guard's most
#      likely failure is going quiet, and a silent pass reads exactly like
#      "checked it, nothing to worry about".
#
#   2. DENY (only on risk signals) — a public destination whose payload carries
#      a fenced code block, a foreign github.com owner, or security-finding
#      vocabulary is blocked pending an explicit provenance confirmation.
#      An UNRESOLVED destination is handled as a public one here, because it
#      cannot be ruled out as one. Ordinary feature PRs and issues sail
#      through untouched.
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
# The unrecoverable paths — no stdin, malformed JSON, no publish verb — fail
# OPEN, because a broken hook must never brick publishing. A destination this
# hook merely could not READ is a different thing and is not one of them: it is
# announced and scanned. Failing open there was measured to delete the guard
# outright whenever `gh` auth lapsed, and to do it without saying a word.

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
#
# Held in a variable because the `cd` resolution below needs the SAME pattern to
# find where the verb sits. Written twice, the two would drift, and the way that
# fails is the tripwire matching a command whose verb position the other half
# then locates wrongly.
PUBLISH_VERB_RE='(^|[;&|(]|&&|\|\|)[[:space:]]*(sudo[[:space:]]+)?gh[[:space:]]+((issue|pr|release|gist)[[:space:]]+(create|comment|edit|close|reopen|review)|api[[:space:]][^|]*-X[[:space:]]*POST[^|]*(issues|comments|releases))'

if ! grep -qE "$PUBLISH_VERB_RE" <<<"$cmd"; then
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

# Where the publishing verb sits, and the command split around it. Everything
# below reasons about "before the verb" and "the verb's own segment", and both
# have already been got wrong once each, in opposite directions.
#
# BYTE offsets, so the slicing uses `head -c`/`tail -c` and not bash substring
# expansion, which counts CHARACTERS. With multibyte text ahead of the verb the
# two drift apart by the encoding overhead (measured: one em dash costs 2), and
# once the drift exceeds the length of the publish itself the "before" prefix
# reaches a trailing `cd` and that `cd` steers the destination again. 60 em
# dashes reopened the hole the segment logic exists to close.
verb_at=$(grep -boE "$PUBLISH_VERB_RE" <<<"$cmd" | head -n1 | cut -d: -f1)
verb_at=${verb_at:-0}
before_verb=$(head -c "$verb_at" <<<"$cmd")
# The verb's own segment: from the verb to the next shell separator, with the
# leading separator the match itself captured stripped first. A payload carrying
# a separator only shortens this, which is the safe direction.
publish_seg=$(tail -c "+$((verb_at + 1))" <<<"$cmd" \
  | sed -E 's/^[[:space:]]*[;&|(]*[[:space:]]*//; s/[;&|].*$//')

# `gh api -X POST /repos/<owner>/<repo>/issues` names its destination in the
# endpoint and needs no local repository at all, so resolving it from the cwd
# asks about the wrong place. That was harmless while this hook failed open;
# now that an unreadable destination denies on risk, it would refuse a working
# command from any directory that is not itself a repo. Reproduced from /tmp on
# a healthy authenticated `gh`.
#
# Read ONLY from the segment the publishing verb is in, and only when that
# segment is itself the `gh api` call. Scanning the whole command was worse than
# the bug it fixed: `gh api repos/<a private repo> --jq .name && gh issue create
# --body '…'` set the destination to the repo that was merely READ, took the
# `vis != PUBLIC` short-circuit below, and passed the payload through unscanned
# and unannounced. A `gh api` read inside a `--body` did it too, since `$(`
# satisfies the separator class the verb pattern anchors on.
#
# Endpoint-shaped tokens only, and only when they agree. Two different ones mean
# the endpoint cannot be told apart from the payload, and guessing wrong is how
# the paragraph above happened. Disagreement stays unresolved, which announces
# and scans rather than guessing.
if [[ -z $dest ]] && grep -qE '^(sudo[[:space:]]+)?gh[[:space:]]+api([[:space:]]|$)' <<<"$publish_seg"; then
  api_dest=$(grep -oE 'repos/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/(issues|comments|releases|pulls)' <<<"$publish_seg" \
    | sed -E 's|^repos/([^/]+/[^/]+)/.*|\1|' | sort -u)
  [[ -n $api_dest && $(printf '%s\n' "$api_dest" | wc -l) -eq 1 ]] && dest="$api_dest"
fi

cd_dir=""
if [[ -z $dest ]]; then
  # First `cd` at the start of the command or of a segment, and — this is the part
  # that was missing — only one that runs BEFORE the publishing verb. Only such a
  # `cd` can change where the publish lands.
  #
  # Searching the whole command matched a trailing `cd` too, which inverts the
  # guard rather than merely confusing it: `gh issue create --body '…api_key…' &&
  # cd ~/some-private-repo` resolved the destination as that private repo, took
  # the `vis != PUBLIC` short-circuit below, and passed the payload through
  # unscanned. That is the same "guard disappearing" failure described above, in
  # the opposite command order, and the comment claiming the match was narrow was
  # describing an ordering the regex never enforced.
  #
  # Deliberately still narrow: it catches the shape that occurs and leaves
  # anything cleverer to the unresolved branch, which announces and scans.
  cd_dir=$(grep -oE '(^|[;&|(]) *cd +[^ ;&|)]+' <<<"$before_verb" \
    | head -n1 | sed -E 's/.*cd +//' | tr -d "\"'")
  cd_dir="${cd_dir/#\~/$HOME}"
fi

# WHY the destination could not be resolved, phrased for a human to read;
# empty once it IS resolved. Every branch that leaves $meta empty must fill this,
# because the defect being closed here is a resolution failure that reads as a
# clean pass. Naming the cause is half the fix: `gh` absent is a fresh clone and
# expected, while `gh` present and unable to log in is a machine that was
# guarding yesterday and is not today.
unresolved=""
meta=""

# GNU coreutils. macOS ships no `timeout` at all, and Homebrew installs it as
# `gtimeout` unless gnubin is on PATH, so looking only for `timeout` pinned such
# a machine to UNRESOLVED permanently: every risky publish denied and every
# ordinary one carried a degradation notice, on a host where `gh` was fine. That
# is the "cries wolf, gets switched off" failure, not an outage. The bound itself
# is kept rather than dropped, because an unbounded `gh` can hang before a publish.
TIMEOUT_BIN=$(command -v timeout || command -v gtimeout || true)

if ! command -v gh >/dev/null 2>&1; then
  unresolved="\`gh\` is not installed"
elif [[ -z $TIMEOUT_BIN ]]; then
  unresolved="neither \`timeout\` nor \`gtimeout\` is installed, so no bounded \`gh\` call can be made"
else
  if [[ -n $dest ]]; then
    meta=$("$TIMEOUT_BIN" 10 gh repo view "$dest" --json nameWithOwner,visibility 2>/dev/null)
    [[ -z $meta ]] && unresolved="\`gh\` could not read '${dest}'"
  elif [[ -n $cd_dir ]]; then
    meta=$( (cd "$cd_dir" 2>/dev/null && "$TIMEOUT_BIN" 10 gh repo view --json nameWithOwner,visibility 2>/dev/null) )
    # A cd we could not follow is not the same as "no repo here", and must not be
    # treated as one. Resolving from our own cwd instead would be the original bug;
    # skipping the payload scan would move the hole rather than close it.
    [[ -z $meta ]] && unresolved="the command changes directory to '${cd_dir}', which could not be entered or holds no repository \`gh\` can read"
  else
    meta=$("$TIMEOUT_BIN" 10 gh repo view --json nameWithOwner,visibility 2>/dev/null)
    [[ -z $meta ]] && unresolved="\`gh\` could not read a repository for this command"
  fi

  # `gh` is here and still could not answer. An auth lapse is the routine cause
  # and the actionable one, so it gets named separately. Probed only on the path
  # that already failed, so an ordinary publish pays nothing for it, and bounded
  # at 5s rather than 10: this is diagnostic wording, and the one time it runs is
  # the one time the network may be hanging, where it would otherwise double the
  # stall in front of every publish.
  if [[ -n $unresolved ]] && ! "$TIMEOUT_BIN" 5 gh auth status >/dev/null 2>&1; then
    unresolved+="; \`gh auth status\` reports no working login (an expired token, no token, or an unreachable github.com all land here)"
  fi
fi

if [[ -n $unresolved ]]; then
  # ONE answer to one question. "We could not resolve the destination" is the
  # same state however it arose, so it gets the same treatment the `cd` branch
  # already got: announced, payload-scanned, denied on risk. Two behaviours for
  # one question is the split this closes — the `cd` branch denied while every
  # other unresolvable cause waved the payload through unread.
  #
  # The deny is usually free, because the conditions that stop `gh repo view`
  # answering mostly stop `gh issue create` succeeding too: no `gh`, no login, no
  # reachable github.com, no repository to infer. There the deny lands on a
  # command that was going to fail anyway and says something useful instead of
  # nothing.
  #
  # "Mostly" is doing real work in that sentence, and an earlier draft of this
  # comment claimed "always" while a counterexample sat one tripwire branch away:
  # `gh api -X POST /repos/<owner>/<repo>/issues` carries its own destination and
  # needs no local repository, so from any non-repo directory it would have
  # worked and this hook denied it. That is why the endpoint is parsed above.
  # What remains: an `api` call whose `repos/` tokens disagree, and a token
  # scoped to write issues but not read repo metadata. Both are unusual, and both
  # pay the one-line override rather than a silent pass.
  repo="an unresolved destination"
  vis_phrase="whose visibility could NOT be resolved (${unresolved}), so it is treated as if it were public. No owner was read either, so the foreign-owner signal could not be computed and did not run; the fenced-block and security-vocabulary signals did"
  vis_tag="UNRESOLVED, ${unresolved}"
  owner=""
else
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
#
# Computed only when an owner was actually read. "Foreign" is defined relative to
# the destination, so with no destination it is not a weaker signal, it is an
# undefined one — and letting it run anyway was measurably worse than useless.
# With `$owner` empty, `grep -vix ""` matches only the empty line and so KEEPS
# every owner: every github.com URL became a signal. That state used to need an
# unfollowable `cd` and was rare; making an expired `gh` token reach it turned an
# ordinary PR body linking to this repo's own issue into a deny. Crying wolf on
# the routine case is how a guard gets switched off, which this file argues
# against three times over. The unresolved announcement says the comparison did
# not run, so its absence is stated rather than silent.
if [[ -n $owner ]]; then
  foreign=$(grep -oE 'github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+' <<<"$payload" \
    | sed -E 's|github\.com/||' | cut -d/ -f1 | sort -u \
    | grep -vix "$owner" | head -n3 | paste -sd, -)
  [[ -n $foreign ]] && signals+=("references to another owner's repo ($foreign)")
fi

if grep -qiE 'no auth|unauthenticated|without auth|rate.?limit|api[ _-]?key|auth_token|credential|\bsecret\b|password|samesite|allow_credentials|vulnerab|exploit|CVE-[0-9]|XSS|injection|logs? (the )?(full|raw|verbatim)' <<<"$payload"; then
  signals+=("security-finding vocabulary")
fi

# --- No signals: announce visibility, allow ------------------------------
# The allow path is where the silence lived. "Resolved it, the repo is private,
# carry on" and "resolved nothing, carry on" used to be the same empty
# pass-through, so an operator's belief that a guardrail was present outlived the
# guardrail. They are different sentences now.
if [[ ${#signals[@]} -eq 0 ]]; then
  if [[ -n $unresolved ]]; then
    ctx="The public-publish provenance guard could NOT resolve this command's destination (${unresolved}), so it never checked whether the destination is public. It scanned the payload anyway and found nothing risky, so this is allowed. Note that with no owner read, the foreign-owner signal could not be computed and did not run; only the fenced-block and security-vocabulary signals did. Until that is fixed, treat the visibility half of this guard as absent rather than as having passed."
  else
    ctx="Publishing to ${repo}, ${vis_phrase}. Nothing in the payload tripped the provenance guard."
  fi
  jq -nc --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
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
