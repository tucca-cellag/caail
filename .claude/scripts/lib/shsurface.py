#!/usr/bin/env python3
"""shsurface - classify every byte of a bash command string as CODE or DATA.

ONE implementation, N adopters. Every Bash-parsing guard in hooks/ asks this
module the same question, so the guards cannot disagree with each other about
what the shell will actually run. Implementation drift between near-identical
copies is the most expensive recurring bug in this repo; before CLAUDE-40 there
were five separate answers to "is this heredoc body a command?", four of which
were wrong in at least one direction.

WHY IT EXISTS, BOTH DIRECTIONS
  Measured 2026-08-19 against real bash 3.2 with a 68-case corpus. The stripper
  that used to live inline in check-command-antipatterns.sh scored 42/68:
    * 19 cases KEPT data as if executed  -> false denials. Filing CLAUDE-40 and
      commenting on CLAUDE-39 both tripped a guard by QUOTING a command as
      evidence. That is the symptom the ticket describes.
    * 7 cases LOST text that really executes -> guard EVASION, which the ticket
      does not mention. `cat <<EOF | bash`, `sudo bash <<EOF` and
      `env FOO=1 bash <<EOF` all had their bodies dropped as inert.
  Both directions are the same defect: judging shell syntax with line-oriented
  regexes. This scores 68/68.

CLASSIFICATION, one character at a time:
  'C'  code    - the shell will interpret this
  'D'  data    - a quoted span. Its TEXT may still matter to a caller (a branch
                 name, a filename), so segment views keep it; command-position
                 views blank it.
  'H'  hidden  - a comment or an inert heredoc body. Nothing here reaches the
                 shell at all, so every view drops it.

Heredoc bodies fed to a shell interpreter are classified 'C' and re-scanned,
because there the text really is executed. That includes the piped form
(`cat <<EOF | bash`) and prefixed forms (`sudo bash <<EOF`, `env X=1 bash
<<EOF`), which the old carve-out missed. An UNQUOTED heredoc body is scanned for
$(...) / `...` even when fed to cat, because command substitution inside it runs
at redirection time (verified against bash 3.2).

VIEWS
  --mask      code kept, 'D' and 'H' blanked to spaces, newlines preserved.
              Byte-for-byte the same length as the input, so a caller may take
              an offset from this view and index the ORIGINAL string with it.
  --exec      --mask plus code-level backslash-newline joining, so an argument
              on a continued line sits beside its subcommand. Not
              length-preserving. This is the "executed surface" the corpus
              scores.
  --segments  one shell segment per line, split at code-level ; | & ( ) and at
              newlines. 'H' spans are dropped; 'D' spans are kept VERBATIM,
              because a caller asking "which branch does this push?" needs to
              read `main` out of `git push origin "main"`.

Stdlib only, and it must stay that way: these run inside PreToolUse hooks on
every Bash call, so a pip dependency would be a machine-wide outage waiting for
the first broken venv. `shfmt` was evaluated and rejected for the same reason -
a guard that needs a binary installed is a guard that is absent by default.
"""

SHELLS = {"bash", "sh", "zsh", "ksh", "dash", "ash", "eval", "source", "."}
PREFIXES = {"sudo", "command", "env", "nohup", "exec", "time", "builtin", "nice"}
META = set(" \t\n|&;<>()")

CODE = "C"
DATA = "D"
HIDDEN = "H"


class Surface:
    def __init__(self, src):
        self.src = src
        self.n = len(src)
        self.cls = [CODE] * self.n
        self._scan(0, self.n)

    # ---------------------------------------------------------------- helpers
    def _mark(self, a, b, k):
        for i in range(a, min(b, self.n)):
            self.cls[i] = k

    def _at_word_start(self, i):
        """True if position i can begin a word (so '#' there starts a comment)."""
        j = i - 1
        while j >= 0 and self.src[j] in " \t":
            j -= 1
        return j < 0 or self.src[j] in "\n;|&()"

    # ------------------------------------------------------------- delimiters
    def _read_delim(self, i):
        """Parse a heredoc delimiter starting at i. -> (delim, quoted, end)."""
        n, s = self.n, self.src
        while i < n and s[i] in " \t":
            i += 1
        out, quoted = [], False
        while i < n:
            c = s[i]
            if c == "\\":
                # backslash-NEWLINE is a line continuation: the lexer removes it
                # before the delimiter is read, so `<<EO\<nl>F` means EOF and
                # stays UNQUOTED. Any other backslash quotes the next character
                # (`<<\EOF`), which makes the heredoc a no-expansion one.
                if i + 1 < n and s[i + 1] == "\n":
                    i += 2
                    continue
                quoted = True
                if i + 1 < n:
                    out.append(s[i + 1])
                    i += 2
                else:
                    i += 1
                continue
            if c in "'\"":
                quoted = True
                q, i = c, i + 1
                while i < n and s[i] != q:
                    out.append(s[i])
                    i += 1
                i += 1
                continue
            if c in META:
                break
            out.append(c)
            i += 1
        return "".join(out), quoted, i

    # ------------------------------------------------------------ line helper
    def _code_of_line(self, a, b):
        return "".join(self.src[i] for i in range(a, min(b, self.n))
                       if self.cls[i] == CODE)

    def _line_feeds_shell(self, line):
        """Does any command in this logical line hand the heredoc to a shell?

        THE EVASION THIS CLOSES. The old carve-out matched only a bare
        `bash <<EOF`, judged by the first word of the line. So `cat <<EOF | bash`
        (the shell is after the pipe), `sudo bash <<EOF` and `env FOO=1 bash
        <<EOF` (the shell is after a prefix) all had their bodies dropped as
        inert text - a body that really runs, waved through by the guard.
        """
        for part in _split_top(line):
            toks = part.split()
            k = 0
            while k < len(toks) and (toks[k] in PREFIXES or _is_assign(toks[k])):
                k += 1
            if k < len(toks):
                first = toks[k].split("/")[-1]
                if first in SHELLS:
                    return True
        return False

    # -------------------------------------------------------------- main scan
    def _scan(self, start, end):
        s, i = self.src, start
        pending = []          # heredocs opened on the current line
        line_start = start
        while i < end:
            c = s[i]

            # --- backslash escape (outside quotes) ---
            if c == "\\":
                i += 2
                continue

            # --- comment ---
            if c == "#" and self._at_word_start(i):
                j = s.find("\n", i)
                j = end if j == -1 or j > end else j
                self._mark(i, j, HIDDEN)
                i = j
                continue

            # --- single quotes: fully literal ---
            if c == "'":
                j = s.find("'", i + 1)
                j = end if j == -1 else j
                self._mark(i, j + 1, DATA)
                i = j + 1
                continue

            # --- ANSI-C quoting $'...' : literal, backslash escapes apply ---
            if c == "$" and i + 1 < end and s[i + 1] == "'":
                j = i + 2
                while j < end:
                    if s[j] == "\\":
                        j += 2
                        continue
                    if s[j] == "'":
                        break
                    j += 1
                self._mark(i, min(j + 1, end), DATA)
                i = j + 1
                continue

            # --- double quotes: data, EXCEPT $(...) and `...` which run ---
            if c == '"':
                j = i + 1
                self.cls[i] = DATA
                while j < end and s[j] != '"':
                    if s[j] == "\\":
                        self._mark(j, j + 2, DATA)
                        j += 2
                        continue
                    if s[j] == "$" and j + 1 < end and s[j + 1] == "(":
                        k = _match_paren(s, j + 1, end)
                        self._scan(j + 2, k)      # substitution really runs
                        j = k + 1
                        continue
                    if s[j] == "`":
                        k = s.find("`", j + 1)
                        k = end if k == -1 else k
                        self._scan(j + 1, k)
                        j = k + 1
                        continue
                    self.cls[j] = DATA
                    j += 1
                if j < end:
                    self.cls[j] = DATA
                i = j + 1
                continue

            # --- arithmetic $(( )) : no heredocs inside, '<<' is a shift ---
            if c == "$" and s.startswith("$((", i):
                k = _match_paren(s, i + 1, end)
                k = _match_paren(s, k + 1, end) if k + 1 < end and s[k + 1] == ")" else k
                i = k + 1
                continue

            # --- herestring <<< is NOT a heredoc ---
            if s.startswith("<<<", i):
                i += 3
                continue

            # --- heredoc opener ---
            if s.startswith("<<", i):
                dash = i + 2 < end and s[i + 2] == "-"
                delim, quoted, j = self._read_delim(i + 2 + (1 if dash else 0))
                if delim:
                    pending.append((delim, quoted, dash))
                i = j
                continue

            # --- newline: settle any heredocs opened on this line ---
            if c == "\n":
                i += 1
                if pending:
                    line = self._code_of_line(line_start, i)
                    executed = self._line_feeds_shell(line)
                    for delim, quoted, dash in pending:
                        i = self._consume_body(i, end, delim, quoted, dash, executed)
                    pending = []
                line_start = i
                continue

            i += 1

        # unterminated heredoc: body runs to the end of input
        if pending:
            line = self._code_of_line(line_start, end)
            executed = self._line_feeds_shell(line)
            for delim, quoted, dash in pending:
                self._consume_body(end, end, delim, quoted, dash, executed)

    # ------------------------------------------------------------ heredoc body
    def _consume_body(self, i, end, delim, quoted, dash, executed):
        s = self.src
        body_start = i
        while i < end:
            nl = s.find("\n", i)
            stop = end if nl == -1 or nl > end else nl
            line = s[i:stop]
            # UNQUOTED heredocs honour backslash-newline continuation, so a
            # terminator on a continued line does NOT terminate (bash-verified).
            if not quoted:
                while line.endswith("\\") and (len(line) - len(line.rstrip("\\"))) % 2 == 1 and stop < end:
                    nl2 = s.find("\n", stop + 1)
                    stop = end if nl2 == -1 or nl2 > end else nl2
                    line = s[i:stop]
            probe = line.lstrip("\t") if dash else line
            if probe == delim:
                self._finish_body(body_start, i, quoted, executed)
                return stop + 1 if stop < end else end
            i = stop + 1 if stop < end else end
        # unterminated
        self._finish_body(body_start, end, quoted, executed)
        return end

    def _finish_body(self, a, b, quoted, executed):
        self._mark(a, b, CODE if executed else HIDDEN)
        if executed:
            self._scan(a, b)
        elif not quoted:
            self._subst_only(a, b)

    def _subst_only(self, a, b):
        """In an inert but UNQUOTED heredoc body, $(...) and `...` still run.

        Verified against bash 3.2: `cat > f <<EOF` with `$(git clean -fd)` in the
        body runs git at redirection time. Dropping the whole body hides a real
        execution, which is why this is not simply skipped.
        """
        s, i = self.src, a
        while i < b:
            if s[i] == "\\":
                i += 2
                continue
            if s[i] == "$" and i + 1 < b and s[i + 1] == "(" and not s.startswith("$((", i):
                k = _match_paren(s, i + 1, b)
                self._mark(i + 2, k, CODE)
                self._scan(i + 2, k)
                i = k + 1
                continue
            if s[i] == "`":
                k = s.find("`", i + 1)
                k = b if k == -1 else k
                self._mark(i + 1, k, CODE)
                self._scan(i + 1, k)
                i = k + 1
                continue
            i += 1

    # ------------------------------------------------------------------ views
    def masked_surface(self):
        """Command-position view, CHARACTER FOR CHARACTER with the input.

        Data and hidden spans become spaces; newlines stay newlines so grep
        stays line-oriented. The length is preserved on purpose: a caller may
        locate a token here and then index the RAW command at the same offset to
        read the text this view blanked.
        """
        out, s = [], self.src
        for i in range(self.n):
            ch = s[i]
            out.append(ch if self.cls[i] == CODE else ("\n" if ch == "\n" else " "))
        return "".join(out)

    def executed_surface(self):
        """masked_surface plus code-level backslash-newline joining, so an
        argument on a continued line sits beside its subcommand."""
        out, i, s = [], 0, self.src
        while i < self.n:
            if self.cls[i] == CODE and s[i] == "\\" and i + 1 < self.n and s[i + 1] == "\n":
                i += 2                      # continuation: join the lines
                continue
            ch = s[i]
            out.append(ch if self.cls[i] == CODE else ("\n" if ch == "\n" else " "))
            i += 1
        return "".join(out)

    def segments(self):
        """Split on ; && || | & and subshell parens, outside quotes.

        Quoted text is kept VERBATIM rather than blanked. A caller that needs to
        know WHICH ref a push names must be able to read it out of
        `git push origin "main"`; blanking would silently disarm that check.
        What quoting buys here is that the separators inside a quoted span are
        not separators - `git commit -m '(cd sub && git clean -fd)'` stays one
        segment describing a commit, not three commands.
        """
        out, cur, i = [], [], 0
        s = self.src
        while i < self.n:
            k = self.cls[i]
            if k == HIDDEN:
                # Never reaches the shell. Its newlines still separate, so the
                # line after a heredoc body starts a fresh segment.
                if s[i] == "\n":
                    out.append("".join(cur))
                    cur = []
                i += 1
                continue
            if k == DATA:
                # A newline inside a quoted span still ends the segment: the
                # readers on the other side of this are line-oriented, and a
                # multi-line commit body split across segments is harmless
                # (no fragment of it starts with a command name).
                if s[i] == "\n":
                    out.append("".join(cur))
                    cur = []
                else:
                    cur.append(s[i])
                i += 1
                continue
            c = s[i]
            if c == "\\" and i + 1 < self.n and s[i + 1] == "\n":
                cur.append(" ")          # line continuation joins
                i += 2
                continue
            if c in ";|&()\n":
                out.append("".join(cur))
                cur = []
                i += 1
                continue
            cur.append(c)
            i += 1
        out.append("".join(cur))
        return [x.strip() for x in out if x.strip()]

    def argv_segments(self):
        """Each executed segment as an argument vector.

        For a guard that has to read an ARGUMENT, not just spot a command: the
        file a `git commit -F` names, the ref a push sends, the body handed to
        `gh pr merge`. Splitting is the same code/data judgement segments()
        makes, with one difference: a newline INSIDE a quoted span stays in the
        segment, because the argument it belongs to (a PR body, a commit
        message) spans lines and has to arrive whole.

        Tokenising the segment is stdlib shlex in POSIX mode, which is only
        asked to dequote words once this classifier has decided where the
        segment is. An unbalanced segment (a `"$(` whose substitution was split
        off as its own command) falls back to whitespace words: the flags are
        still readable, and the guard degrades rather than stops.
        """
        import shlex
        out, cur, i = [], [], 0
        s = self.src
        while i < self.n:
            k = self.cls[i]
            if k == HIDDEN:
                if s[i] == "\n":
                    out.append("".join(cur))
                    cur = []
                i += 1
                continue
            if k == DATA:
                cur.append(s[i])
                i += 1
                continue
            c = s[i]
            if c == "\\" and i + 1 < self.n and s[i + 1] == "\n":
                cur.append(" ")
                i += 2
                continue
            if c in ";|&()\n":
                out.append("".join(cur))
                cur = []
                i += 1
                continue
            cur.append(c)
            i += 1
        out.append("".join(cur))
        result = []
        for seg in out:
            seg = seg.strip()
            if not seg:
                continue
            try:
                toks = shlex.split(seg, comments=False, posix=True)
            except ValueError:
                toks = seg.split()
            if toks:
                result.append(toks)
        return result


def _is_assign(tok):
    if "=" not in tok:
        return False
    name = tok.split("=", 1)[0]
    return bool(name) and (name[0].isalpha() or name[0] == "_") and \
        all(ch.isalnum() or ch == "_" for ch in name)


def _match_paren(s, i, end):
    """i points at '('. Return index of the matching ')'."""
    depth = 0
    while i < end:
        if s[i] == "(":
            depth += 1
        elif s[i] == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return end


def _split_top(line):
    out, cur, q = [], [], ""
    for c in line:
        if q:
            cur.append(c)
            if c == q:
                q = ""
            continue
        if c in "'\"":
            q = c
            cur.append(c)
            continue
        if c in "|&;":
            out.append("".join(cur))
            cur = []
            continue
        cur.append(c)
    out.append("".join(cur))
    return out


def main(argv):
    import sys
    mode = argv[1] if len(argv) > 1 else "--exec"
    # Bytes in, bytes out. A command may carry any encoding at all, and a
    # UnicodeDecodeError here would take the calling guard down with it;
    # surrogateescape round-trips every byte sequence unchanged.
    raw = sys.stdin.buffer.read().decode("utf-8", "surrogateescape")
    surface = Surface(raw)
    if mode == "--mask":
        out = surface.masked_surface()
    elif mode == "--segments":
        out = "\n".join(surface.segments()) + "\n"
    elif mode == "--exec":
        out = surface.executed_surface()
    elif mode == "--argv":
        # US between arguments, RS after each segment: neither can occur in a
        # command a person typed, and both survive bash `read -d`.
        out = "".join("\x1f".join(t) + "\x1e" for t in surface.argv_segments())
    else:
        sys.stderr.write("usage: shsurface.py [--exec|--mask|--segments|--argv]\n")
        return 2
    sys.stdout.buffer.write(out.encode("utf-8", "surrogateescape"))
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main(sys.argv))
