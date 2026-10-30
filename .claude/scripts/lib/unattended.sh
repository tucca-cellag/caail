# shellcheck shell=bash
#
# Who is calling a hook: the ONE place a hook in hooks/ decides whether its
# caller is an unattended caller. Source it, then ask unattended_caller with the
# hook's input. It holds everything else the nine guards share as well (ClaudeDotFiles #334):
# what a denial says (unattended_note, attended_route_note, attended_close), the
# loader that brings in scripts/lib/shsurface.sh, and the override check
# (discard_overrides, consume_override), last. Tests:
# scripts/test-unattended.sh, and each adopter's own suite.
#
# DELETING, EMPTYING OR CUTTING THIS FILE BLOCKS EVERY GUARDED CALL. A guard that
# cannot load it treats every caller as an unattended caller (below), so every
# stop it makes is final, Benji's own sessions included, until the file is back.
#
# THE TERM, from GLOSSARY.md, used exactly: an unattended caller is "A session
# or agent that cannot put a question to Benji and wait for his answer when a
# hook stops it: a subagent, a workflow agent or a `claude -p` run."
#
# THE ONE FIELD A HOOK CAN READ. A hook sees part of that definition and no
# more. Its input carries `agent_id` when a subagent or an in-process teammate
# makes the call; nothing in it marks a workflow agent or a `claude -p` run.
# hooks.md, read 2026-10-26 against Claude Code 2.1.310: "`agent_id` and
# `agent_type` tell your script which agent a hook fired in, such as a subagent,
# an in-process teammate, or the agent you chose with `--agent`", and `agent_id`
# is the "Unique identifier for the subagent or in-process teammate the hook
# fires in." So a non-empty `agent_id` at the top level of the input is the
# whole test.
#
# A MAIN SESSION STARTED WITH `--agent` MAY CARRY `agent_id`, AND IS THEN
# TREATED AS UNATTENDED, WHICH FAILS SAFE. Such a session is blocked where it
# would have been asked, and loses the override file; it is never let through
# by this check, and that edge is not handled further. A `-p` run carries
# nothing and so is treated as attended; per hooks.md, when Claude Code denies
# the call in a `-p` run where no one can answer a prompt, Claude reads the
# reason in the tool result.
#
# WHAT A HOOK DOES WITH THE ANSWER (ClaudeDotFiles #302). For an unattended
# caller, every hook that can stop a call:
#   - blocks it, and never answers `ask`;
#   - ignores its override file and removes it when the subagent itself makes
#     the call. The dangerous-git hook has had no override file since ClaudeDotFiles #226,
#     so it has none to ignore;
#   - says in its denial that the block is final for a subagent, and that it
#     should report the command and the hook's reason to its caller. That
#     sentence is unattended_note below, written once so every adopter says it
#     alike. The report is unconditional. The sentence also carries the ban on
#     getting around the hook, which an attended denial states in its own
#     closing lines (attended_route_note below), and it allows only an
#     alternative the denial itself names, never one the subagent devises;
#   - names only alternatives the subagent can carry out itself. One that asks
#     or shows the user something becomes one that goes in its report.
#
# WHICH GUARDS STILL ASK, stated here and nowhere else (ClaudeDotFiles #334).
# For an attended caller, no guard that loads this
# file tells the session to put a question through AskUserQuestion:
# dangerous-git and personal-identifier answer `ask` natively, so Claude Code's
# own permission prompt does the asking (ClaudeDotFiles #226), and the other seven deny with
# the closing lines below (ClaudeDotFiles #304, ClaudeDotFiles #212). One guard outside the nine still
# instructs a question: check-tracker-duplicates.sh, whose denial embeds the
# filing bar from scripts/tracker-digest.sh, and item 3 of that bar asks Benji
# through AskUserQuestion. scripts/test-unattended.sh names it as exempt, with
# why.
#
# FAIL DIRECTION. Malformed input, input that is not a JSON object, or a missing
# `jq` answers "attended": each of those is a path where the hook itself already
# fails open, so the caller's identity changes nothing there.
#
# A HOOK THAT CANNOT LOAD THIS FILE TREATS EVERY CALLER AS UNATTENDED
# (ClaudeDotFiles #334). It cannot tell a subagent from Benji then, and
# answering "attended" would let a subagent's override file through on every
# hook that has one, and have dangerous-git and personal-identifier ask a
# subagent. So the call is blocked for good, an override file is removed and
# ignored, and nothing is asked, Benji's own session included, until the
# library is restored; the
# session-start check names a missing, emptied or cut-off one. That fallback
# cannot live in the file that failed to load: it is the block under each hook's
# loading line, the same in all nine hooks, and scripts/test-unattended.sh holds
# them to it.
#
# COST. Hooks ask only on the paths that decide something (an override file
# that exists, a deny, an ask), never on every call, and jq runs at most once
# per hook call however often a hook asks (ClaudeDotFiles #334): the answer is kept for the
# input it was given. The substring test below keeps an input that carries no
# `agent_id` at all from forking jq.
#
# bash 3.2 (what macOS ships) is the target.

# unattended_caller <hook-input-json>: status 0 when the caller is unattended.
# The answer is kept for the input it was given, so a hook that asks at its
# override check, at its denial and in a helper starts jq once, not three times
# (ClaudeDotFiles #334). A hook asks from its own shell, never from a `$( )` subshell, which
# would drop what was kept.
_UNATTENDED_FOR=""
_UNATTENDED_IS=""
unattended_caller() {
  case $1 in
    *'"agent_id"'*) : ;;
    *) return 1 ;;
  esac
  if [ -n "$_UNATTENDED_IS" ] && [ "$_UNATTENDED_FOR" = "$1" ]; then
    return "$_UNATTENDED_IS"
  fi
  local id
  # Any value but null, false or "" counts: the field's presence is the signal,
  # and reading a number or an object as "attended" would fail the wrong way.
  id=$(printf '%s' "$1" \
    | jq -r 'if type == "object" then (.agent_id // empty | tostring) else empty end' 2>/dev/null) \
    || id=""
  _UNATTENDED_FOR=$1
  if [ -n "$id" ]; then _UNATTENDED_IS=0; else _UNATTENDED_IS=1; fi
  return "$_UNATTENDED_IS"
}

# unattended_note [noun]: the sentence a denial carries for an unattended
# caller. The noun names what was blocked, "command" unless the hook says
# otherwise (an edit, a call).
unattended_note() {
  local noun="${1:-command}"
  printf 'This block is final for a subagent (an unattended caller): no override file and no prompt lets this %s through. Do not get around this hook by other means. You may use an alternative this denial names; either way, report the %s and this hook'"'"'s reason to your caller.' "$noun" "$noun"
}

# attended_route_note [kind]: the sentence an attended caller's denial carries
# between `Reformulate and run it again.` and its override line
# (ClaudeDotFiles #304), or, in its `prompt` kind, the close of the context a
# hook sends with an `ask` (ClaudeDotFiles #226). An attended denial asks no
# question: it says to reformulate, and ends with the override for when Benji
# has already said the exact call must run as written. In auto mode the
# classifier can refuse the override file, and can read a reformulated retry as
# routing around the denial. So the denial also names the route that works
# then, command plus read-back: the session hands Benji the exact command and
# the command that reads its result back, he runs the first with `!`, and the
# session runs the read-back itself, or hands it over too if that is refused.
# The read-back is the point: a step counts as done only once its result is
# read back from where it landed.
#
# Written once so every adopter says it alike, in one of four kinds. Each ends
# with the ban on getting around the hook, which the AskUserQuestion options it
# replaces used to carry.
#   command            The default. The reformulated command, or the one the
#                      override would let through, goes to Benji's `!` with its
#                      read-back.
#   edit               A blocked Write or Edit. It has no command, and a shell
#                      rewrite of the file run with `!` never passes through
#                      the hook, so Benji gets the file and the exact text to
#                      change and makes the edit himself; the session reads the
#                      file back.
#   reformulated-only  A blocked command whose output is the harm (a secret
#                      value), so it must not run by any route: only the
#                      reformulated command goes to `!`, because what `!` runs
#                      lands in the transcript the same way (ClaudeDotFiles #304).
#   prompt             Not a denial: a hook that answered `ask`, so Benji
#                      already confirms the exact command in Claude Code's own
#                      prompt, with no override and nothing to reformulate
#                      (ClaudeDotFiles #226). In auto mode the classifier can
#                      still deny a call a hook asked about, so the same command
#                      goes to `!` with its read-back. One Benji declines
#                      himself goes nowhere.
attended_route_note() {
  local ban='Do not get around this hook by other means.'
  case ${1:-command} in
    prompt)
      printf 'If the permission mode refuses it anyway (in auto mode the classifier can deny a call this hook asked about), hand Benji the exact command to run and the command that reads its result back: he runs the first with `!`, and you run the read-back, or hand him that too if it is refused. If Benji declines it himself, do not run it another way. %s' "$ban" ;;
    edit)
      printf 'If the permission mode refuses the reformulated edit or the override below, hand Benji the file and the exact text to change, and he makes the edit himself; then read the file back. Never hand him a shell command that writes the file: run with `!`, it never passes through this hook. %s' "$ban" ;;
    reformulated-only)
      printf 'If the permission mode refuses the reformulated command, hand Benji that command to run and the command that reads its result back: he runs the first with `!`, and you run the read-back, or hand him that too if it is refused. Never hand him the blocked command itself: what he runs with `!` lands in the transcript too. %s' "$ban" ;;
    *)
      printf 'If the permission mode refuses the reformulated command or the override below, hand Benji the exact command to run and the command that reads its result back: he runs the first with `!`, and you run the read-back, or hand him that too if it is refused. %s' "$ban" ;;
  esac
}

# attended_close <noun> <route-kind|none> <override-files> [<line> [<condition>]]
# The lines that end an attended caller's denial, written once for every guard
# (ClaudeDotFiles #334): `Reformulate and run it
# again.`, the route through Benji (attended_route_note <route-kind>, or none,
# for the Bash guard's short denial), a line of the hook's own if it gives one,
# and last the override, for when Benji has already said this exact <noun>
# must run as written, and has accepted <condition> too if the hook names one.
attended_close() {
  printf 'Reformulate and run it again.\n'
  [ "$2" = none ] || printf '%s\n' "$(attended_route_note "$2")"
  [ -z "${4:-}" ] || printf '%s\n' "$4"
  printf 'If Benji has already said this exact %s must run as written%s:\ntouch %s and re-run it within 60 seconds.' \
    "$1" "${5:-}" "$3"
}

# --- the loader (ClaudeDotFiles #334) ----------------------------------------
# A hook loads both guard libraries with one line, sourcing this file, and this
# file loads scripts/lib/shsurface.sh, the shared bash-surface classifier, from
# beside itself or from $HOME's copy (the same two places a hook looks for this
# one). Any view that does not load is stubbed to hand back the raw command, the
# contract shsurface.sh keeps itself: a guard then judges the string it judged
# before it adopted the classifier. Every view has a stub, which
# check-commit-message.sh's own loader lacked for shsurface_argv.
#   SHSURFACE_OK     1 when the classifier loaded, 0 when a stub stands in
#   SHSURFACE_TRIED  where it was looked for, for a denial that says so
SHSURFACE_TRIED="${BASH_SOURCE[0]%/*}/shsurface.sh"
if [ -r "${BASH_SOURCE[0]%/*}/shsurface.sh" ]; then
  # shellcheck source=shsurface.sh
  . "${BASH_SOURCE[0]%/*}/shsurface.sh"
elif [ "$HOME/.claude/scripts/lib/shsurface.sh" != "$SHSURFACE_TRIED" ]; then
  SHSURFACE_TRIED="$SHSURFACE_TRIED and $HOME/.claude/scripts/lib/shsurface.sh"
  if [ -r "$HOME/.claude/scripts/lib/shsurface.sh" ]; then
    # shellcheck source=shsurface.sh
    . "$HOME/.claude/scripts/lib/shsurface.sh"
  fi
fi
# shellcheck disable=SC2034 # read by the hooks that load this file
if command -v shsurface_exec && command -v shsurface_mask \
   && command -v shsurface_segments && command -v shsurface_argv; then
  SHSURFACE_OK=1
else
  SHSURFACE_OK=0
fi >/dev/null 2>&1
command -v shsurface_exec >/dev/null 2>&1 || shsurface_exec() { printf '%s' "$1"; }
command -v shsurface_mask >/dev/null 2>&1 || shsurface_mask() { printf '%s' "$1"; }
command -v shsurface_segments >/dev/null 2>&1 || shsurface_segments() { printf '%s' "$1"; }
command -v shsurface_argv >/dev/null 2>&1 || shsurface_argv() { printf '%s\036' "$1"; }

# --- the override check (ClaudeDotFiles #334) --------------------------------
# An override file is the single-use pass an attended denial names: touched, it
# lets the same call through once within 60 seconds. These two functions are
# the only code that decides whether one passes. Every hook with an override
# file calls consume_override, and scripts/test-unattended.sh fails a hook that
# carries its own freshness test, or whose override a subagent can use.
#
# THEY COME LAST, AFTER THE LOADER, ON PURPOSE. A guard decides this file loaded
# by whether consume_override exists. Defined anywhere earlier, a file cut off
# below it left the guards trusting a library with no classifier views, which
# let `git push --force origin main` through. Defined
# last, a cut anywhere sends every guard to its fallback, which fails safe. Its
# closing line, the last of the file, is written to be one the session-start
# check can look for (hooks/check-session-integrity.sh) and no stub carries.
#
# discard_overrides <input> <file>...: when the caller is unattended, remove
# every named file and succeed, since it gets no override; otherwise touch
# nothing and fail. It asks who is calling only when one of the files exists.
# It removes the file of a subagent that makes the call.
discard_overrides() {
  local input=$1 f found=""
  shift
  for f in "$@"; do
    [ -f "$f" ] && found=1
  done
  if [ -n "$found" ] && unattended_caller "$input"; then
    rm -f "$@"
    return 0
  fi
  return 1
}

# consume_override <input> <file>: status 0 once, when <file> was touched within
# the last minute and the caller is not unattended. The file is removed either
# way, so it passes one call at most, and a stale one or an unattended caller's
# passes none.
consume_override() {
  [ -f "$2" ] || return 1
  discard_overrides "$1" "$2" && return 1
  local fresh=1
  find "$2" -mmin -1 -print 2>/dev/null | grep -q . && fresh=0
  rm -f "$2"; return "$fresh"; }
