#!/usr/bin/env bash
# shellcheck shell=bash
#
# Shell front end for scripts/lib/shsurface.py, the ONE bash-surface classifier
# every PreToolUse guard in hooks/ shares. Source it, then ask for the view you
# need. See shsurface.py for what the views mean and why the classifier exists.
#
# THE CONTRACT IS FAIL-OPEN, AND IT IS ABSOLUTE.
#   Every helper here returns 0 and prints SOMETHING usable. If python3 is
#   absent, the library file has been moved, the classifier throws, or the
#   command is unparseable, the caller gets its input back UNCHANGED, which is
#   exactly the string the guards judged before they adopted this. A guard then
#   degrades to its old accuracy; it does not crash, and it does not stop
#   guarding. A classifier that could brick `bash` would be a worse bug than
#   every false denial it prevents.
#
# THE LATENCY BUDGET IS REAL. These run on every Bash tool call. One python3
# fork is ~25 ms, so a caller must put its cheap string tripwire FIRST and ask
# for a view only once the command already looks interesting. Never call two
# helpers on one command: ask for the single view you need.
#
# bash 3.2 (what macOS ships) is the target. No associative arrays, no ${x,},
# no `coproc`, no `|&`, no `;;&`.

# Where the classifier lives. Resolved relative to THIS file so a worktree or a
# CI checkout finds its own copy, with $HOME as the fallback for the case where
# the caller was reached through a symlink. Overridable so a suite can point at
# a copy under test.
SHSURFACE_NL='
'

#
# String manipulation, not `$(cd ... && pwd)`. Sourcing happens on EVERY Bash
# tool call in every session, and those two subshells measured ~10 ms of the
# ~20 ms it took to source this file at all: more than the classifier itself
# costs on a plain command.
if [ -z "${SHSURFACE_PY:-}" ]; then
  case "${BASH_SOURCE[0]}" in
    */*) SHSURFACE_PY="${BASH_SOURCE[0]%/*}/shsurface.py" ;;
    *)   SHSURFACE_PY="shsurface.py" ;;
  esac
  [ -r "$SHSURFACE_PY" ] || SHSURFACE_PY="$HOME/.claude/scripts/lib/shsurface.py"
fi

# shsurface_view <--exec|--mask|--segments> <command-string>
shsurface_view() {
  local mode="$1" src="$2" out
  # FAST PATH, and it is the common one: no fork at all. Code can only differ
  # from data where one of these characters appears, so a command carrying none
  # of them IS its own executed surface, its own mask and its own single
  # segment. `git status --short` and `npm run build` take this path; anything
  # quoted, continued, commented, grouped, substituted or heredoc'd does not.
  # Worth the eight lines: it takes ~21 ms of python startup off every plain
  # command in every session, on a hook that runs on every Bash tool call.
  case $src in
    *[\'\"\`\\\#\<\;\|\&\(\)\$]*) : ;;
    *"$SHSURFACE_NL"*)            : ;;
    *)
      # The segment view trims, so the fast path has to trim too, or a caller
      # gets a leading space here and not there.
      if [ "$mode" = "--segments" ]; then
        src="${src#"${src%%[![:space:]]*}"}"
        src="${src%"${src##*[![:space:]]}"}"
      fi
      printf '%s' "$src"
      return 0 ;;
  esac
  [ -r "$SHSURFACE_PY" ] || { printf '%s' "$src"; return 0; }
  command -v python3 >/dev/null 2>&1 || { printf '%s' "$src"; return 0; }
  if out=$(printf '%s' "$src" | python3 "$SHSURFACE_PY" "$mode" 2>/dev/null); then
    printf '%s' "$out"
  else
    printf '%s' "$src"
  fi
  return 0
}

# Command-position view, byte-for-byte the same length as the input: an offset
# taken here indexes the ORIGINAL string. Quoted spans, comments and inert
# heredoc bodies become spaces; newlines are preserved.
shsurface_mask() { shsurface_view --mask "$1"; }

# The executed surface: shsurface_mask plus backslash-newline joining, so an
# argument on a continued line sits beside its subcommand. Not length-preserving.
shsurface_exec() { shsurface_view --exec "$1"; }

# One shell segment per line, split at code-level `; | & ( )` and at newlines.
# Quoted text is kept verbatim, because a caller asking which ref a push names
# has to read `main` out of `git push origin "main"`.
shsurface_segments() { shsurface_view --segments "$1"; }

# Argument vectors: each executed segment as its dequoted words, words joined
# by US (\037) and each segment terminated by RS (\036). For a guard that must
# read an argument's VALUE (the file `git commit -F` names, the ref a push
# sends), which a mask cannot give it: the mask blanks exactly the quoted text
# such a value lives in.
#
# No fast path: callers ask for this only after a cheap tripwire has fired.
# Fail-open keeps the contract above: with no classifier the whole command
# comes back as ONE segment of ONE word, which names no subcommand, so a guard
# reading argv finds nothing to judge and degrades instead of misfiring.
shsurface_argv() {
  local src="$1" out
  if [ -r "$SHSURFACE_PY" ] && command -v python3 >/dev/null 2>&1 \
     && out=$(printf '%s' "$src" | python3 "$SHSURFACE_PY" --argv 2>/dev/null); then
    printf '%s' "$out"
  else
    printf '%s\036' "$src"
  fi
  return 0
}
