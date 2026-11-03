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
# Three behaviours, per .claude/rules/publishing.md:
#
#   0. LEAK DENY (any destination): a Claude session link or attribution
#      footer anywhere in the payload is refused before the destination is even
#      resolved, because it discloses a session to anyone who can read a private
#      repo as much as a public one.
#
#   1. ANNOUNCE (always, non-blocking): every publish into a public repo gets
#      the destination's visibility injected into context. Costs nothing and
#      makes "is this public?" impossible to not notice. A destination that
#      could NOT be resolved is announced too, naming why: this guard's most
#      likely failure is going quiet, and a silent pass reads exactly like
#      "checked it, nothing to worry about".
#
#   2. DENY (only on risk signals): a public destination whose payload carries
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
# An attended caller's denial asks no question (ClaudeDotFiles #212). It takes
# the Bash guard's shape since ClaudeDotFiles #191: what tripped and the fix (strip the flagged
# text, or revise the payload), `Reformulate and run it again.`, the route
# through Benji's `!` for when the permission mode refuses (attended_route_note
# in scripts/lib/unattended.sh), and last the override line, for when Benji has
# already said the exact command must run as written.
#
# The two denies differ in what may go to Benji's `!`, because a command run
# with `!` never passes through this hook. The provenance deny is the last
# check, so `!` skips nothing else: it names once the case its old question
# named for running as written, all three checks clear, and sends that to `!`,
# as gh-watch and hpctools-first do, and its route is attended_route_note's
# default kind. The leak deny runs ahead of the visibility check and the
# provenance scan, so `!` would skip both: its false positive keeps the
# override, after which the rest of the guard runs, and its route is the
# reformulated-only kind, which hands Benji only a reformulated command (one
# this hook has passed, when it is the permission mode that refuses it) and
# never the blocked one. A subagent's denial says nothing of either: it has no
# `!` to hand anything to.
#
# The route is there because auto mode can refuse both of the other remedies:
# the override file, as a bypass, and a cleaned retry this hook has passed, as
# routing around the denial. Nothing tells the classifier that this hook passed
# a payload.
#
# Override mechanism (mirrors check-command-antipatterns.sh):
#   Claude writes the file a deny names, then immediately re-runs the SAME
#   command. Single-use, 60s TTL, pinned to one exact command. Each deny has its
#   own file and consumes only that one: /tmp/claude-publish-leak-override-<sha16>
#   for the leak deny, /tmp/claude-publish-override-<sha16> for the provenance
#   deny. One shared file let an override approved for an attribution false
#   positive also skip the provenance scan, which the user was never shown.
#
# An unattended caller (a subagent: scripts/lib/unattended.sh) gets neither
# override (ClaudeDotFiles #302). When it runs the command, both files are removed on that run
# past the tripwire, whichever deny the run reaches. Its denials carry the shared
# sentence (the block is final, report the command and this hook's reason to
# the caller) in place of the attended closing lines, and the provenance deny
# names revising the payload as the alternative, with its three questions
# applying to the revised payload. Announcing is not a stop and is unchanged.
#
# Architecture: defer → tripwire → leak scan → visibility → payload scan → JSON.
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

# --- Overrides (single-use, 60s TTL, one per deny) ------------------------
# Consumed only at the deny each one answers, never up front: an override that
# passed the whole hook through skipped every check after the one it was granted
# for. See the header for why there are two.
cmd_hash=$(printf '%s' "$cmd" | shasum -a 256 | cut -c1-16)
override_file="/tmp/claude-publish-override-${cmd_hash}"
leak_override_file="/tmp/claude-publish-leak-override-${cmd_hash}"

# Loaded here, past the tripwire, so only a publishing command pays for it.
# --- the guard libraries (ClaudeDotFiles #334) ----------------------------
# One line loads both: scripts/lib/unattended.sh, which loads
# scripts/lib/shsurface.sh beside it. The block under that line stands in when
# it cannot load, the same in every guard (scripts/test-unattended.sh holds
# them to it). A guard that cannot tell who is calling treats every caller as
# an unattended caller (ClaudeDotFiles #334): it blocks for good, removes
# and ignores override files, and asks nothing. It still loads the classifier
# where that is there, and judges the raw command where it is not.
# shellcheck source=../scripts/lib/unattended.sh
. "${BASH_SOURCE[0]%/*}/../scripts/lib/unattended.sh" 2>/dev/null || . "$HOME/.claude/scripts/lib/unattended.sh" 2>/dev/null
if ! command -v consume_override >/dev/null 2>&1; then
  unattended_caller() { return 0; }
  unattended_note() { printf 'This hook could not load scripts/lib/unattended.sh, so it cannot tell whether its caller is a subagent and blocks as for one: no override file and no prompt lets this %s through. Do not get around this hook by other means. Report the %s, this hook'"'"'s reason and the missing library.' "${1:-command}" "${1:-command}"; }
  attended_route_note() { unattended_note; }
  attended_close() { unattended_note; }
  discard_overrides() { shift; rm -f "$@"; }
  consume_override() { rm -f "$2"; return 1; }
  # shellcheck source=../scripts/lib/shsurface.sh
  . "${BASH_SOURCE[0]%/*}/../scripts/lib/shsurface.sh" 2>/dev/null || . "$HOME/.claude/scripts/lib/shsurface.sh" 2>/dev/null
  # The library's own rule for the classifier: all four views, or not loaded.
  # shellcheck disable=SC2034 # read by the guards that use the classifier
  if command -v shsurface_exec && command -v shsurface_mask \
     && command -v shsurface_segments && command -v shsurface_argv; then
    SHSURFACE_OK=1
  else
    SHSURFACE_OK=0 SHSURFACE_TRIED="${BASH_SOURCE[0]%/*}/../scripts/lib/shsurface.sh and $HOME/.claude/scripts/lib/shsurface.sh"
  fi >/dev/null 2>&1
  command -v shsurface_exec >/dev/null 2>&1 || shsurface_exec() { printf '%s' "$1"; }
  command -v shsurface_mask >/dev/null 2>&1 || shsurface_mask() { printf '%s' "$1"; }
  command -v shsurface_segments >/dev/null 2>&1 || shsurface_segments() { printf '%s' "$1"; }
  command -v shsurface_argv >/dev/null 2>&1 || shsurface_argv() { printf '%s\036' "$1"; }
fi

# An unattended caller's override files go now, both of them. Each is otherwise
# consumed only at its own deny, so a run stopped at the leak deny would leave
# the provenance file for whoever runs this command next. This is the shared
# rule (discard_overrides, scripts/lib/unattended.sh), the same one
# consume_override applies at each deny below, so it is written once (ClaudeDotFiles #334).
discard_overrides "$input" "$override_file" "$leak_override_file"

# --- Highest-severity, visibility-INDEPENDENT scan ------------------------
# A Claude session link (claude.ai/code/session…) and the Claude attribution
# footer are a DIFFERENT risk class from the provenance signals further down.
# Those only bite on a PUBLIC destination, because the data-leak they guard
# against does not apply to a repo nobody outside can read. A session link does:
# it discloses the CONTENTS of a Claude session to anyone who can read the
# published text, so it is forbidden in a PUBLIC and a PRIVATE destination alike,
# as is the attribution footer (rules/publishing.md, rules/conventional-commits.md).
#
# This is the exact door the originating incident walked in. A
# `gh pr create --body-file <f>` into a PRIVATE repo, whose file carried both a
# session link and the footer, hit the `vis != PUBLIC` short-circuit below and
# was waved through before the payload was ever read. So this scan runs HERE,
# ahead of destination resolution, and denies unconditionally.
#
# The shared classifier (scripts/lib/shsurface.sh) comes in with the guard
# libraries above. Without it the file-flag extraction below degrades to
# whitespace splitting of the raw command, which can miss a real --body-file (a
# path with spaces, unusual quoting). Inline text and heredocs are unaffected,
# since they sit in the raw command, which is scanned whole, but a file this
# hook fails to read is a body it never checked. SHSURFACE_OK=0 records the
# degradation, so a file-carrying publish fails CLOSED below instead of passing
# on a partial read.

# Build the published payload ONCE and reuse it for the provenance scan below.
# The raw command already carries inline --body/-b text and heredoc bodies; add
# the contents of every file the command hands to gh.
payload="$cmd"
unread_bodies=()
expanded_bodies=()
stdin_body=0
_collect_file() {  # _collect_file <B|R> <word>
  # B: a body-file value (--body-file, --notes-file, a key=@ file field, or any
  # -F not on a gh api line). R: a -F word on a gh api line, where it is a typed
  # `key=value` field, read only if it happens to name a regular file.
  local kind="$1" f="$2"
  # The segment view keeps quoted text verbatim, quote characters included, so a
  # `--body-file "/path"` arrives as `"/path"`. Strip the quotes the way the old
  # raw-grep gathering did, then expand a leading `~`.
  f="${f//\"/}"; f="${f//\'/}"
  [[ -z $f ]] && return 0
  # `-` is gh's name for stdin, which only the command supplies, so it is
  # refused below, whatever the tag: gh api takes no body as `-F -`. A
  # redirection glued to it (`-< f`, `-<<'EOF'`) is still `-` to gh, since bash
  # splits the word there.
  if [[ $f == "-" || $f == -[\<\>]* ]]; then stdin_body=1; return 0; fi
  # Bash removes a backslash, unwraps $'…' and expands a variable or a command
  # substitution before gh sees the word, so `\-`, `$'-'` and "$D" all reach gh
  # as `-`, and a variable can name any file. This hook does not evaluate them,
  # so a body-file word carrying `$`, a backtick or a backslash is refused
  # below, whatever its quoting: telling a single-quoted word from an expanding
  # one is quote parsing, which is the shared classifier's job and not this
  # hook's. A file that happens to be named `$F` says nothing about what `$F`
  # expands to.
  if [[ $kind == B && $f == *[\$\`\\]* ]]; then expanded_bodies+=("$f"); return 0; fi
  f="${f/#\~/$HOME}"
  # A regular file only, and nothing else is opened. The hook runs before the
  # command, so a named pipe has no writer yet, and `head` on one blocked until
  # the hook was killed, which let the publish through unscanned. Skipping it was
  # no better: gh reads a pipe, `/dev/stdin` or a device when the command runs,
  # after this check, so the body went out unread. So anything that exists and is
  # neither a regular file nor a directory is recorded and refused below. A
  # directory is not, since gh cannot read one as a body and an over-read
  # `ls -F <dir>` names one; nor is a word naming nothing on disk, since the
  # reader over-reads every `-F`, and gh api's `-F key=value` names no file.
  if [[ ! -f $f ]]; then
    [[ -e $f && ! -d $f ]] && unread_bodies+=("$f")
    return 0
  fi
  [[ -r $f ]] || return 0
  payload+=$'\n'$(head -c 100000 "$f" 2>/dev/null)
}
# File-passing flags, read from the shared classifier's SEGMENT view (CLAUDE-40),
# which splits the command at its code-level separators. awk then splits each
# segment on whitespace, quoted text included, so a flag-like word inside quoted
# prose is read too (an over-read, the safe direction), and a quoted path that
# contains a space is cut at the space and not read. Covers --body-file / --notes-file
# (pr/issue/release create, `=` or space form), `-F` (gh's short --body-file) as
# `-F <path>`, `-F=<path>` or `-F<path>`, all three of which gh's flag parser
# accepts, and a `key=@<path>` field (gh api), checked on every word including an
# attached `-Fkey=@<path>`. Scanning an extra referenced
# file over-reads at worst, which is the SAFE direction for a deny-on-presence
# check; missing a quoted real path (the raw-grep failure mode) is not.
#
# Every line is read, deliberately, so `grep -F <file>` elsewhere in the
# command gets its file scanned too. Narrowing this to gh's own flags was tried
# twice and under-read both times, which is the unsafe direction: the segment
# view splits at `$(…)`, so a body flag can sit on a line without `gh`
# (`--title "$(date)" --body-file f`) or on one that starts with a word
# (`--title $(date)suffix --body-file f`). A false deny on an over-read file is
# visible and has an override; an unread body is silent.
#
# Each value is tagged B or R for _collect_file. `-F` is gh's --body-file on
# issue, pr and release, and a typed field on gh api. For the same `$(…)`
# reason, a line need not start with the command its `-F` belongs to, so every
# `-F` counts as a body file unless its own line is positively a `gh api` one.
# With the classifier degraded the command arrives unsplit, so no line can be
# identified and every `-F` counts.
while IFS= read -r _bf; do _collect_file "${_bf%% *}" "${_bf#* }"; done < <(
  shsurface_segments "$cmd" | awk -v degraded="$(( SHSURFACE_OK == 0 ))" '
    { c1 = $1; c2 = $2
      if (c1 == "sudo") { c1 = $2; c2 = $3 }
      fk = (degraded == 0 && c1 == "gh" && c2 == "api") ? "R" : "B"
      for (i=1;i<=NF;i++) {
        w = $i
        if (w=="--body-file"||w=="--notes-file") { if (i+1<=NF) print "B " $(i+1) }
        else if (w=="-F") { if (i+1<=NF) print fk " " $(i+1) }
        else if (w ~ /^(--body-file|--notes-file)=/) { sub(/^[^=]+=/,"",w); print "B " w }
        else if (w ~ /^-F./) { sub(/^-F=?/,"",w); print fk " " w }
        if (w ~ /=@/) { sub(/^.*=@/,"",w); print "B " w }
      } }'
)

# Scanned on the RAW payload so a link survives any quoting style, including a
# heredoc body, for the same reason the commit-message hook scans attribution raw.
leak_signals=()
grep -qiE 'claude\.ai/code/session' <<<"$payload" \
  && leak_signals+=("a Claude session link (claude.ai/code/session…), which exposes the contents of a Claude session to anyone who can read the published text")
# The footer is matched by its text, not by the robot emoji that usually leads
# it: a bare emoji is ordinary prose ("the bot keeps failing"), and denying it in
# a private repo too cried wolf on exactly the publishes this scan reaches.
grep -qiE 'Generated with \[?Claude|claude\.com/claude-code|Co-Authored-By:[[:space:]]*(Claude|Anthropic)|Claude-Session:' <<<"$payload" \
  && leak_signals+=("Claude attribution (a 'Generated with Claude Code' / claude.com/claude-code footer, or a 'Co-Authored-By: Claude' or 'Claude-Session:' trailer)")
# Fail closed when the body lives in a file and the classifier is missing: the
# scan above may not have read that file at all. Scoped to file-passing flags so
# an inline-only publish (fully visible in the raw command) is not taxed.
if (( SHSURFACE_OK == 0 )) \
   && grep -qE '(--body-file|--notes-file)([=[:space:]])|(^|[[:space:]])-F|=@' <<<"$cmd"; then
  leak_signals+=("a body FILE this hook could not reliably read: the shared shell classifier (scripts/lib/shsurface.sh) did not load, so a session link or attribution inside that file could not be ruled out. Restore the library, or pass the body inline")
fi
# A body file that exists and is not a regular file, recorded by _collect_file.
if (( ${#unread_bodies[@]} > 0 )); then
  _ub=$(printf '%s, ' "${unread_bodies[@]}"); _ub="${_ub%, }"
  leak_signals+=("a body FILE this hook could not read because it is not a regular file (${_ub}): gh reads a named pipe, /dev/stdin or a device only when the command runs, after this check, so a session link or attribution inside it could not be ruled out. Write the body to a regular file, or pass it inline")
fi
# A body-file value spelled with expansion syntax, recorded by _collect_file.
if (( ${#expanded_bodies[@]} > 0 )); then
  _eb=$(printf '%s, ' "${expanded_bodies[@]}"); _eb="${_eb%, }"
  leak_signals+=("a body FILE named by an expansion this hook does not evaluate (${_eb}): bash resolves a backslash, \$'…', a variable or a command substitution only when the command runs, so it could be \`-\` or any file, and a session link or attribution inside it could not be ruled out. Write the path out literally, with no \`\$\`, backtick or backslash in it, or pass the text as \`--body \"\$(cat <<'EOF' ... EOF)\"\` with the delimiter quoted")
fi
# A body gh reads from stdin: `--body-file -`, `--notes-file -`, `-F -` or
# `key=@-`. A pipe, a redirect or a heredoc supplies it when the command runs,
# after this check, so it is /dev/stdin under another name and is refused the
# same way. Measured: `cat f | gh issue comment 1 --body-file -` and `... < f`
# both passed with a session link in f.
#
# There is no heredoc exception, deliberately. One was tried and could not be
# tied to the right input: a heredoc on fd 3 or `{fd}` left gh reading the pipe,
# a `<<` on one gh command exempted the `-` on another, and an unquoted
# delimiter or a `"$var"` here-string expands at run time into text this hook
# never saw. The shared classifier does not report which fd a heredoc feeds or
# whether its delimiter is quoted, so nothing here could tell those apart.
# `--body "$(cat <<'EOF' … EOF)"` with a quoted delimiter puts the text in the
# command, where it is scanned, so that is the form the deny offers.
if (( stdin_body == 1 )); then
  leak_signals+=("a body read from stdin (\`-\`), which a pipe, a redirect or a heredoc supplies only when the command runs, after this check, so a session link or attribution inside it could not be ruled out. Pass the text as \`--body \"\$(cat <<'EOF' ... EOF)\"\` with the delimiter quoted, which puts it in the command where it is scanned, or write it to a regular file")
fi

# Remembered for the provenance deny below: when one payload trips both, the
# leak override is spent on the run that reaches the provenance deny, so that
# deny has to ask for both files again or the user can never get through.
leak_override_used=0
if [[ ${#leak_signals[@]} -gt 0 ]] && consume_override "$input" "$leak_override_file"; then
  leak_override_used=1
fi

# What the read-back is for a publish, for both attended denials. The route
# through Benji (attended_route_note) hands him the command and the command that
# reads its result back, and a publish's result is what it made or changed,
# which this guard's tripwire spans: a PR, an issue or comment, a release, a
# gist, or a `gh api` post.
READBACK_NOTE=" Should the route through Benji below be needed, the read-back for a publish reads what it made or changed from where it landed: \`gh pr view <number>\`, \`gh issue view <number> --comments\`, \`gh release view <tag>\`, \`gh gist view <id>\`, or a \`gh api\` GET of the endpoint it posted to."

if [[ ${#leak_signals[@]} -gt 0 ]] && (( leak_override_used == 0 )); then
  joined=$(printf '%s; ' "${leak_signals[@]}"); joined="${joined%; }"
  reason="This gh publish carries: ${joined}. Forbidden in every published payload, public or private."
  ctx="BLOCKED by the public-publish guard (${RULE}). The payload (the command plus any file it names with --body-file, --notes-file, -F or key=@) carries: ${joined}.

This is INDEPENDENT of the destination's visibility: a session link or an attribution footer is forbidden in a public repo and a private one alike, so it is checked before the destination is resolved. The session link is the serious one, since it can expose session contents, and should be DELETED, not overridden.

"
  if unattended_caller "$input"; then
    reason="${reason} $(unattended_note)"
    ctx="${ctx}Remove the flagged text from the command and from any file it references, then re-run."
  else
    ctx="${ctx}Remove the flagged text from the command and from any file it references. When the match is a false positive, such as a body that quotes an attribution trailer to discuss the rule, the override below is for it: it skips only this check, and the rest of the guard still runs, which for a public or unresolved destination includes the provenance scan, while a private destination is passed through. A body this hook could not read has no match to be a false positive: use the form its signal names.${READBACK_NOTE}

$(attended_close command reformulated-only "$leak_override_file" \
  'Run with `!`, the blocked command would never pass through this hook, so it would publish what this check stopped and skip every check after it.')"
  fi
  jq -nc --arg reason "$reason" --arg ctx "$ctx" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason,additionalContext:$ctx}}'
  exit 0
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
# Where the publishing verb sits, and the command split around it. The `cd` and
# `gh api` extractors read one of these two slices and never the whole command,
# because reading the whole command is how the payload gets to choose where the
# hook thinks the publish is going.
#
# The `--repo`/`-R` extractor below is the deliberate exception, and its argument
# is written out there rather than here: scoping it was tried and was worse than
# the hole it addressed. Do not "restore the invariant" without reading that.
#
# BYTE offsets, so the slicing uses `head -c`/`tail -c` and not bash substring
# expansion, which counts CHARACTERS. With multibyte text ahead of the verb the
# two drift apart by the encoding overhead (measured: one em dash costs 2), and
# once the drift exceeds the length of the publish itself the "before" prefix
# reaches a trailing `cd` and that `cd` steers the destination again. 60 em
# dashes reopened the hole the segment logic exists to close.
verb_at=$(grep -boE "$PUBLISH_VERB_RE" <<<"$cmd" | head -n1 | cut -d: -f1)
verb_at=${verb_at:-0}
# `head -c 0` is an error on BSD/macOS `head`, and offset 0 is the common case
# (any command starting with the verb), so it printed to stderr on every publish.
before_verb=""
[[ $verb_at -gt 0 ]] && before_verb=$(head -c "$verb_at" <<<"$cmd")

# The verb's own segment: from the verb to the next shell separator, with the
# leading separator the match itself captured stripped first. A payload carrying
# a separator only shortens this, which is the safe direction.
#
# Newlines are separators too, and `tr` is what makes that true. `sed` is
# line-oriented, so it truncated only the FIRST line and everything past the
# first newline stayed inside "the segment" — which put a heredoc body there.
# Measured on the same body and the same real destination: single-line denied
# and named the right repo, the multi-line form allowed and announced
# `octocat/Hello-World`, a repo named only in the payload. Where the payload
# names a repo that resolves PRIVATE, that reaches the `vis != PUBLIC`
# short-circuit and the payload is never scanned at all.
publish_seg=$(tail -c "+$((verb_at + 1))" <<<"$cmd" | tr '\n' ';' \
  | sed -E 's/^[[:space:]]*[;&|(]*[[:space:]]*//; s/[;&|].*$//')

# An explicit --repo/-R, read from the WHOLE command on purpose.
#
# A positional rule was tried here and withdrawn, and the reason is worth keeping
# because it will look like an omission otherwise. The known hole is that a `-R`
# quoted inside a body steers the destination: an ordinary bug report saying
# `reproduce with: gh pr list -R octocat/Hello-World` publishes to that repo.
# Closing it needs shell-quote reasoning, which is deliberately not attempted
# here: a check that parses quoting can be fooled on purpose and fails silently
# when it is.
#
# The positional approximation (only a repo flag before the first body flag
# counts) was worse than the hole it addressed, because it turned a rare wrong
# answer into several common ones, each of them CONFIDENT rather than unresolved.
# All measured on this hook: a `--repo` on a backslash-continuation line became
# invisible; a `;` or `|` inside a `--title` truncated the segment before the
# flag; `--comment`, `--notes` and `-d` were absent from the body-flag list even
# though `close`/`release`/`gist` publish through exactly those; and a `--title`
# is free text that sits before the body flag by construction, so no list could
# have covered it. Each fell back to the cwd's repo, and a private cwd there
# takes the `vis != PUBLIC` short-circuit and skips the payload scan, which is
# the failure this whole branch is about.
#
# So this stays EXACTLY as it was. Widening it to also accept `--repo=O/R` and
# the attached `-RO/R` was tried and reverted: both are valid `gh` and both fell
# back to the cwd, so the change looked strictly good, and it was a regression.
# Dropping the mandatory space after `-R` let the flag match inside ordinary
# prose. Measured on this hook: a body mentioning "X-Ray" resolved the
# destination to `ay`, and because that does not exist the command went
# UNRESOLVED with no owner, which suppressed the foreign-owner signal and ALLOWED
# a payload that denies without those two words. `-Rzotero-context` in prose
# resolved to a real repo (a bare name resolves as <current-user>/<name>), and a
# private one there short-circuits the scan. `chmod -Rv`, `grep -Ri` and
# `Bio-Rad` all matched too. The mandatory space is what makes the flag a flag.
#
# The gap that leaves is real and matches main: `--repo=O/R` and the attached
# `-RO/R` fall back to the cwd. Recorded with the residual rather than fixed by
# loosening this pattern. Two spaces after `--repo` are NOT a gap and were
# wrongly listed as one here: ` +` is greedy and `awk` splits on whitespace runs,
# measured resolving correctly from outside the repo. A residual that names
# working behaviour invites a fix to the one pattern that must not be touched.
dest=$(grep -oE '(--repo|-R) +[^ ]+' <<<"$cmd" | head -n1 | awk '{print $2}' | tr -d "\"'")

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
#
# For a `gh api` call the endpoint REPLACES anything the flag scrape found, and
# is not merely a fallback for when it found nothing. `gh api` accepts no
# `--repo`/`-R` at all, so in an `api` command every match of that flag is by
# definition payload text, and letting it win let the payload disable the one
# authoritative source. Measured against the pattern above: a body containing
# `chmod -R 755` resolves the destination to `755`, and under fallback semantics
# that skips the endpoint entirely and reports UNRESOLVED, denying a command
# that would have worked from any directory. `grep -R pattern` does it too.
# (The example has to be a SPACED one. An earlier draft cited `chmod -Rv`, which
# was measured against round 5's widened pattern and does not reproduce against
# this one, so it read as an argument that this rule is unnecessary.)
#
# An `api` call whose endpoint cannot be read resolves to nothing rather than
# falling back to that scrape, for the same reason.
#
# `$api_call` is what makes that sentence true of the DIRECTORY fallbacks below
# as well, and it is not a refinement: without it, clearing `$dest` here dropped
# straight into `if [[ -z $dest ]]` and the destination came from `cd`, or from
# the session's own cwd, which is the one thing an api call's destination can
# never be. Measured on this hook, from a private checkout:
# `gh api -X POST repos/me/mine/issues -f body='… repos/other/thing/issues …'`
# resolved to the private cwd, took the `vis != PUBLIC` short-circuit below, and
# passed the payload through unscanned and unannounced. Two disagreeing tokens
# are the documented way to reach that, and a body is free to supply the second
# one. The comment above already described the safe behaviour; the code did the
# opposite of it.
#
# One exception, and it is gh's own rule, not a guess: `gh api` fills the
# placeholders `{owner}` and `{repo}` in an endpoint "with values from the
# repository of the current directory or the repository specified in the GH_REPO
# environment variable" (`gh api --help`). So `repos/{owner}/{repo}/issues` IS a
# directory-resolved publish, and treating it as unreadable lost the destination
# owner and with it the foreign-owner signal: measured, a paraphrase-plus-link
# body that main denied went through. With no concrete `repos/<o>/<r>/` token
# beside it, it resolves exactly as a non-api command does (`gh repo view`
# honours GH_REPO too). With one, a payload may be the source of that token, so
# it stays unresolved like any other disagreement.
#
# The placeholder counts only in the ENDPOINT position, straight after `gh api`
# and an optional `-X METHOD`. Matched anywhere, a `{owner}/{repo}` typed into a
# graphql body switched resolution to the directory, and a private one there
# short-circuits the scan. Any other placement stays unresolved, which loses only
# the foreign-owner signal and still announces and scans.
# `$api_from_dir` marks an api call whose destination comes from the directory
# after all (the placeholder case), so `$api_call` keeps meaning only "this is a
# gh api command".
api_call=0
api_from_dir=0
if grep -qE '^(sudo[[:space:]]+)?gh[[:space:]]+api([[:space:]]|$)' <<<"$publish_seg"; then
  api_call=1
  api_dest=$(grep -oE 'repos/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/(issues|comments|releases|pulls)' <<<"$publish_seg" \
    | sed -E 's|^repos/([^/]+/[^/]+)/.*|\1|' | sort -u)
  api_placeholder=0
  grep -qE '^(sudo[[:space:]]+)?gh[[:space:]]+api[[:space:]]+(-X[[:space:]]*[A-Za-z]+[[:space:]]+)?/?repos/\{owner\}/\{repo\}/' <<<"$publish_seg" \
    && api_placeholder=1
  # gh fills the placeholders from GH_REPO ahead of the directory, and this hook
  # does not evaluate a GH_REPO the command sets (an assignment, `export` or
  # `env`), so such a command publishes where the directory does not say.
  # Measured from a private checkout: `export GH_REPO=<public repo>; gh api -X
  # POST repos/{owner}/{repo}/issues/1/comments -f body=…` with a fenced block
  # resolved to the checkout and passed unscanned. Any GH_REPO before the verb
  # or in its segment keeps the destination unresolved, which announces and
  # scans. A GH_REPO already in the environment needs nothing here: the
  # `gh repo view` below reads it the same way gh api does.
  api_gh_repo=0
  grep -qE '(^|[^A-Za-z0-9_])GH_REPO([^A-Za-z0-9_]|$)' <<<"${before_verb}"$'\n'"${publish_seg}" \
    && api_gh_repo=1
  if [[ $api_placeholder -eq 1 && -z $api_dest && $api_gh_repo -eq 0 ]]; then
    api_from_dir=1
    dest=""
  elif [[ $api_placeholder -eq 0 && -n $api_dest && $(printf '%s\n' "$api_dest" | wc -l) -eq 1 ]]; then
    dest="$api_dest"
  else
    dest=""
  fi
fi

cd_dir=""
if [[ -z $dest && ( $api_call -eq 0 || $api_from_dir -eq 1 ) ]]; then
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

# GNU coreutils, under either of its two names. A missing bound is NOT a reason
# to call the destination unreadable, and treating it as one was worse than the
# hang it avoided: BSD ships no `timeout` and Homebrew installs it as `gtimeout`
# only with coreutils, so stock macOS — the default for anyone cloning this
# public repo — was pinned to UNRESOLVED permanently, denying every risky publish
# on a perfectly healthy `gh`. Neither machine that runs this code would have
# noticed: this Mac has coreutils and CI is Linux.
#
# So the bound is applied when it exists and skipped when it does not. An
# unbounded `gh` can hang before a publish, which is a real cost, but it is a
# cost paid only where no bound is installable, and a hook that hangs is at least
# visibly wrong, where one that cries wolf gets switched off.
TIMEOUT_BIN=$(command -v timeout || command -v gtimeout || true)
gh_bounded() {  # gh_bounded <seconds> <gh args…>
  local secs=$1; shift
  if [[ -n $TIMEOUT_BIN ]]; then "$TIMEOUT_BIN" "$secs" gh "$@"; else gh "$@"; fi
}

if ! command -v gh >/dev/null 2>&1; then
  unresolved="\`gh\` is not installed"
else
  # Whether an auth lapse is a candidate explanation at all. It is one only
  # where `gh` was actually asked something and did not answer.
  probe_auth=1
  if [[ -n $dest ]]; then
    meta=$(gh_bounded 10 repo view "$dest" --json nameWithOwner,visibility 2>/dev/null)
    [[ -z $meta ]] && unresolved="\`gh\` could not read '${dest}'"
  elif [[ $api_call -eq 1 && $api_from_dir -eq 0 ]]; then
    # The endpoint is the only destination an api call has, and this one could
    # not be read: either no `repos/<owner>/<repo>/…` token at all, or several
    # that disagree. Asking a directory instead answers a different question, so
    # this stays unresolved, which announces and scans rather than guessing. No
    # `gh` call is made, because there is nothing to ask about.
    unresolved="this is a \`gh api\` call and its endpoint could not be read unambiguously, so no destination repository was named"
    [[ $api_placeholder -eq 1 && $api_gh_repo -eq 1 ]] \
      && unresolved="this is a \`gh api\` call whose {owner}/{repo} placeholder gh fills from a GH_REPO the command sets, which this hook does not evaluate, so no destination repository was named"
    probe_auth=0
  elif [[ -n $cd_dir ]]; then
    meta=$( (cd "$cd_dir" 2>/dev/null && gh_bounded 10 repo view --json nameWithOwner,visibility 2>/dev/null) )
    # A cd we could not follow is not the same as "no repo here", and must not be
    # treated as one. Resolving from our own cwd instead would be the original bug;
    # skipping the payload scan would move the hole rather than close it.
    [[ -z $meta ]] && unresolved="the command changes directory to '${cd_dir}', which could not be entered or holds no repository \`gh\` can read"
  else
    meta=$(gh_bounded 10 repo view --json nameWithOwner,visibility 2>/dev/null)
    [[ -z $meta ]] && unresolved="\`gh\` could not read a repository for this command"
  fi

  # `gh` is here and still could not answer. An auth lapse is the routine cause
  # and the actionable one, so it gets named separately. Probed only on the path
  # that already failed, so an ordinary publish pays nothing for it, and bounded
  # at 5s rather than 10: this is diagnostic wording, and the one time it runs is
  # the one time the network may be hanging, where it would otherwise double the
  # stall in front of every publish.
  # Not probed where nothing was asked of `gh`: a working login would not have
  # changed the answer, and naming one as a cause sends the reader after a fault
  # that is not there.
  if [[ -n $unresolved && $probe_auth -eq 1 ]] && ! gh_bounded 5 auth status >/dev/null 2>&1; then
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
  # What remains: an `api` call whose `repos/` tokens disagree; a token scoped to
  # write issues but not read repo metadata; and `gh gist create`, which is in the
  # tripwire and has no repository at all, so it always lands here. That last one
  # is a deliberate behaviour change and not an oversight: a gist IS publication
  # under .claude/rules/publishing.md, and a fenced block in one is exactly the
  # pasted-from-a-private-repo leak the fence signal exists to catch. It is the
  # noisiest of the three, because gists are code by nature. All pay the one-line
  # override rather than a silent pass. (The mirror case is unchanged from main
  # and still open: a gist created from inside a PRIVATE repo resolves that repo
  # and short-circuits, so the payload is never scanned.)
  repo="an unresolved destination"

  # The destination's OWNER is often known even when its visibility is not:
  # `$dest` is `owner/repo` by construction, whether it came from `--repo`/`-R` or
  # from the api endpoint. Suppressing the foreign-owner comparison merely because
  # `gh` could not answer threw that away, and measured, it flipped a deny to an
  # ALLOW on the originating incident's own payload shape (a paraphrase plus a
  # link, no fence, no vocabulary) the moment a token lapsed — with the owner
  # sitting in the command string the whole time. The crying-wolf argument for
  # suppressing it only ever applied to the genuinely owner-less cwd and `cd`
  # paths, which is where it still applies.
  owner=""
  [[ $dest =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] && owner="${dest%%/*}"
  if [[ -n $owner ]]; then
    owner_clause="The owner is known from the command itself (${owner}), so the foreign-owner signal DID run"
  else
    owner_clause="No owner was read either, so the foreign-owner signal could not be computed and did not run; the fenced-block and security-vocabulary signals did"
  fi
  vis_phrase="whose visibility could NOT be resolved (${unresolved}), so it is treated as if it were public. ${owner_clause}"
  vis_tag="UNRESOLVED, ${unresolved}"
else
  repo=$(jq -r '.nameWithOwner // empty' <<<"$meta" 2>/dev/null)
  vis=$(jq -r '.visibility // empty' <<<"$meta" 2>/dev/null)
  owner="${repo%%/*}"

  # A non-empty `$meta` that does not parse is a resolution failure too, and the
  # invariant above was written over emptiness only, so this fell straight
  # through: `$vis` came out empty, `!= PUBLIC` was true, and the bare
  # pass-through went out with no announcement and no scan. Exactly the silence
  # this branch exists to delete, reached by a different door.
  #
  # It takes only stray stdout ahead of the JSON. Reproduced with `CDPATH`
  # exported, where bash prints the resolved directory on a CDPATH-resolved `cd`:
  # the same publish denied with an absolute path and passed silently with a
  # relative one. `cd -` with `OLDPWD` set does it too. Pre-dates this branch.
  if [[ -z $repo || -z $vis ]]; then
    unresolved="\`gh\` answered but the reply did not parse (something wrote to stdout ahead of it)"
    repo="an unresolved destination"
    owner=""
    owner_clause="No owner was read either, so the foreign-owner signal could not be computed and did not run; the fenced-block and security-vocabulary signals did"
    vis_phrase="whose visibility could NOT be resolved (${unresolved}), so it is treated as if it were public. ${owner_clause}"
    vis_tag="UNRESOLVED, ${unresolved}"
  else
    # Private destination: the leak class this guards against does not apply.
    if [[ $vis != "PUBLIC" ]]; then
      printf '%s\n' "$PASS_THROUGH"
      exit 0
    fi
    vis_phrase="which is PUBLIC"
    vis_tag="PUBLIC"
  fi
fi

# --- Gather the payload ---------------------------------------------------
# Already built above, before the visibility short-circuit, as `$payload`: the
# raw command (heredoc bodies and --body "..." text included) plus the contents
# of every --body-file/--notes-file/-F/`key=@path` file the command names. It is
# reused here verbatim, so the provenance signals below see the file contents
# too, which the old body-file-at-the-end gathering did only for a PUBLIC repo,
# and only for the first bare `--body-file`.

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
owner_note=""
if [[ -n $owner ]]; then
  foreign=$(grep -oE 'github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+' <<<"$payload" \
    | sed -E 's|github\.com/||' | cut -d/ -f1 | sort -u \
    | grep -vix "$owner" | head -n3 | paste -sd, -)
  [[ -n $foreign ]] && signals+=("references to another owner's repo ($foreign)")

  # An owner known from the command but NOT confirmed by `gh` is only as
  # trustworthy as the command, and the `-R`-inside-a-body hole means the payload
  # can supply it. Where it does, every link under that same owner compares equal
  # and raises nothing, so listing what was seen is the only thing left. Before
  # the owner was derived from `$dest` this case still produced the note below,
  # so saying nothing here would extend an accepted hole rather than hold it.
  if [[ -n $unresolved ]]; then
    seen=$(grep -oE 'github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+' <<<"$payload" \
      | sed -E 's|github\.com/||' | cut -d/ -f1 | sort -u | head -n3 | paste -sd, -)
    [[ -n $seen ]] && owner_note=" The owner used for that comparison (${owner}) came from the command and was NOT confirmed by \`gh\`, and the payload references these github.com owners: ${seen}. Check them yourself."
  fi
else
  # Not denying is not the same as saying nothing. The originating incident's
  # payload shape — a paraphrase of a third party's repo, with a link, and no
  # fenced block or security vocabulary — trips none of the other signals, so
  # dropping this one silently would leave exactly that case unremarked. The
  # owners are named without a verdict attached, which is all the hook can
  # honestly offer when it never learned whose repo it is publishing to.
  seen=$(grep -oE 'github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+' <<<"$payload" \
    | sed -E 's|github\.com/||' | cut -d/ -f1 | sort -u | head -n3 | paste -sd, -)
  [[ -n $seen ]] && owner_note=" The payload references these github.com owners: ${seen}. With no destination owner read, whether any is foreign could not be decided, so this did NOT deny on their account — check them yourself, since a paraphrase of another party's repo discloses as much as a quote."
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
    # `$owner_clause`, not a second copy of it. Hardcoding the owner-less
    # sentence here asserted the foreign-owner signal had not run even after the
    # owner became derivable from the command, so the message contradicted the
    # code while the correct clause sat two branches up. Same defect class the
    # rest of this branch is about, in the text rather than the logic.
    ctx="The public-publish provenance guard could NOT resolve this command's destination (${unresolved}), so it never checked whether the destination is public. It scanned the payload anyway and found nothing risky, so this is allowed. ${owner_clause}. Until that is fixed, treat the visibility half of this guard as absent rather than as having passed.${owner_note}"
  else
    ctx="Publishing to ${repo}, ${vis_phrase}. Nothing in the payload tripped the provenance guard."
  fi
  jq -nc --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
  exit 0
fi

# --- Signals: deny pending explicit provenance confirmation ---------------
# The provenance override answers this deny and nothing else, which is why it
# is consumed here rather than up front: the leak scan above has already run.
if consume_override "$input" "$override_file"; then
  printf '%s\n' "$PASS_THROUGH"
  exit 0
fi

joined=$(printf '%s; ' "${signals[@]}"); joined="${joined%; }"
prov_files="${override_file}"
prov_spent=""
if (( leak_override_used == 1 )); then
  prov_files="${leak_override_file} ${override_file}"
  prov_spent=" The leak override approved earlier was spent on this run, so the override line below names both files."
fi
reason="Publishing to ${repo} (${vis_tag}) with: ${joined}."

prov_head="BLOCKED by the public-publish provenance guard (${RULE}). Destination: ${repo}, ${vis_phrase}. Payload contains: ${joined}.${owner_note}"
prov_questions="  1. PROVENANCE — does every quoted file path, code block, config value and architectural detail originate in THIS repo? Anything learned from a private repo, a third party's source, or an authenticated API for a repo you do not own MUST NOT be published. Paraphrase discloses as much as a quote.
  2. SECURITY — does this describe a weakness in a live service (missing auth, absent rate limiting, an exposed key, an injection path)? If the service is not yours, it goes to its owner privately. If it is yours and unpatched, do not pair the weakness with a live hostname or endpoint.
  3. DESTINATION — is a public tracker the right venue at all, versus a private channel to the code's owner?"

if unattended_caller "$input"; then
  # A subagent cannot be asked, so it is not told to retry after answering: the
  # alternative it can carry out is a payload without the flagged content, and
  # the three checks apply to that revised payload.
  reason="${reason} $(unattended_note)"
  ctx="${prov_head}

The alternative this denial names: revise the payload to drop the flagged content, then run the revised command. These three checks apply to the revised payload. If one fails, or cannot be answered from this repo alone, do not publish it; put the answer in your report:
${prov_questions}"
else
  ctx="${prov_head}

Before retrying, verify EACH of these and state the answers explicitly:
${prov_questions}

Revise the payload to remove the flagged content where a check fails, and apply the three checks to the revised payload too; content that cannot pass them does not belong here, so route it privately instead. When all three are clear for the payload as it stands, as for this repo's own code in a fenced block, the publish may run as written: hand Benji that exact command to run with \`!\` instead of revising it. Do not assume a false positive without checking.${prov_spent}${READBACK_NOTE}

$(attended_close command command "$prov_files")"
fi

jq -nc --arg reason "$reason" --arg ctx "$ctx" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason,additionalContext:$ctx}}'
exit 0
