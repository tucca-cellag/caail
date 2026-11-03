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
  --argv-nested  opt-in (NestedSurface): the argument vectors, each led by the
              index of its command word, followed by those of every command
              string it hands to a shell; ssh and fish count as shells for a
              heredoc. No other view changes with it.
  --argv      each segment as its dequoted words (see argv_segments).
  --argv-literal
              the same words, each segment led by a REASON field: empty when
              the words are what bash will pass, otherwise why they may not
              be (an expansion, a substitution, quoting shlex cannot read, a
              control byte). Opt-in and additive: no other view changes. See
              argv_literal for what it reads differently and why.

Stdlib only, and it must stay that way: these run inside PreToolUse hooks on
every Bash call, so a pip dependency would be a machine-wide outage waiting for
the first broken venv. `shfmt` was evaluated and rejected for the same reason -
a guard that needs a binary installed is a guard that is absent by default.
"""

SHELLS = {"bash", "sh", "zsh", "ksh", "dash", "ash", "eval", "source", "."}
PREFIXES = {"sudo", "command", "env", "nohup", "exec", "time", "builtin", "nice"}
META = set(" \t\n|&;<>()")

# Commands that run their stdin, or a command string, as shell code that the
# existing views do not count: ssh on the remote host, fish in its own
# language. Only the opt-in nested view (NestedSurface) counts them, so the
# guards that read the other views keep their verdicts.
REMOTE_SHELLS = {"ssh", "fish"}

CODE = "C"
DATA = "D"
HIDDEN = "H"

# What follows a `$` when bash expands it: a name, a positional, a special
# parameter, or `{`. Written out because the stdlib-only rule below admits no
# import beyond sys and shlex.
NAME_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")
PARAM_START = NAME_CHARS | set("@*#?$!-{")


class Surface:
    # The commands a heredoc's body runs as shell code when it is fed or piped
    # to them. NestedSurface widens it; every view here reads it as SHELLS.
    FEEDS = SHELLS

    def __init__(self, src, notes=False):
        self.src = src
        self.n = len(src)
        self.cls = [CODE] * self.n
        # NOTES, for argv_literal and normalized_text only, and recorded only
        # when asked: every other view, on every Bash call for every guard,
        # pays nothing for them (ClaudeDotFiles #380 review). Those two build a noted Surface
        # of their own when called on one without.
        #   why:  position -> the reason bash may not pass the words there
        #   esc:  positions of characters a code-level backslash escapes
        #   drop: positions bash removes from the text (quote delimiters,
        #         quoting backslashes, backslash-newlines)
        self.notes = notes
        self.why = {}
        self.esc = set()
        self.drop = set()
        self._scan(0, self.n)
        if notes:
            self._mark_braces()

    def _note(self, pos, reason):
        if self.notes:
            self.why.setdefault(pos, reason)

    def _drop(self, *positions):
        if self.notes:
            self.drop.update(p for p in positions if 0 <= p < self.n)

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
                    self._drop(i, i + 1)
                    i += 2
                    continue
                self._drop(i)
                quoted = True
                if i + 1 < n:
                    out.append(s[i + 1])
                    i += 2
                else:
                    i += 1
                continue
            if c in "'\"":
                quoted = True
                self._drop(i)
                q, i = c, i + 1
                while i < n and s[i] != q:
                    out.append(s[i])
                    i += 1
                self._drop(i)
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
            k = _command_index(toks)
            if k < len(toks):
                first = toks[k].split("/")[-1]
                if first in self.FEEDS:
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
                if self.notes and i + 1 < end:
                    self.esc.add(i + 1)
                    self._drop(i, i + 1 if s[i + 1] == "\n" else -1)
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
                self._drop(i, j)
                self._mark(i, j + 1, DATA)
                i = j + 1
                continue

            # --- ANSI-C quoting $'...' : literal, backslash escapes apply ---
            if c == "$" and i + 1 < end and s[i + 1] == "'":
                self._note(i, "ANSI-C quoting $'...'")
                j = i + 2
                while j < end:
                    if s[j] == "\\":
                        j += 2
                        continue
                    if s[j] == "'":
                        break
                    j += 1
                self._drop(i, i + 1, j)
                self._mark(i, min(j + 1, end), DATA)
                i = j + 1
                continue

            # --- double quotes: data, EXCEPT $(...) and `...` which run ---
            if c == '"':
                j = i + 1
                self.cls[i] = DATA
                self._drop(i)
                while j < end and s[j] != '"':
                    if s[j] == "\\":
                        # Inside double quotes bash drops the backslash only
                        # before $ ` " \ and a newline (and that newline too).
                        if j + 1 < end and s[j + 1] in '$`"\\\n':
                            self._drop(j, j + 1 if s[j + 1] == "\n" else -1)
                        self._mark(j, j + 2, DATA)
                        j += 2
                        continue
                    if s[j] == "$" and j + 1 < end and s[j + 1] == "(":
                        self._note(j, "command substitution")
                        k = _match_paren(s, j + 1, end)
                        self._scan(j + 2, k)      # substitution really runs
                        j = k + 1
                        continue
                    if s[j] == "`":
                        self._note(j, "command substitution")
                        k = s.find("`", j + 1)
                        k = end if k == -1 else k
                        self._scan(j + 1, k)
                        j = k + 1
                        continue
                    # "$X" is one word of unknown text and "${A[@]}" is any
                    # number of words: either can be the flag a reader needs.
                    if s[j] == "$" and j + 1 < end and s[j + 1] in PARAM_START:
                        self._note(j, "parameter expansion")
                    self.cls[j] = DATA
                    j += 1
                if j < end:
                    self.cls[j] = DATA
                    self._drop(j)
                i = j + 1
                continue

            # --- arithmetic $(( )) : no heredocs inside, '<<' is a shift ---
            if c == "$" and s.startswith("$((", i):
                self._note(i, "arithmetic expansion")
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

            if self.notes:
                self._note_expansion(i, start, end)

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

    # ------------------------------------------------------ expansion notes
    def _note_expansion(self, i, start, end):
        """At an unquoted position of the scan, record where bash will expand,
        for argv_literal. Classifies nothing and moves nothing."""
        s, c = self.src, self.src[i]
        if c == "$" and i + 1 < end:
            nxt = s[i + 1]
            if nxt == "(":
                self.why.setdefault(i, "command substitution")
            elif nxt == '"':
                self.why.setdefault(i, 'locale quoting $"..."')
                self._drop(i)
            elif nxt in PARAM_START:
                self.why.setdefault(i, "parameter expansion")
        elif c == "`":
            self.why.setdefault(i, "command substitution")
        elif c in "<>" and i + 1 < end and s[i + 1] == "(":
            self.why.setdefault(i, "process substitution")
        elif c in "*?[":
            self.why.setdefault(i, "pathname expansion")
        elif c == "(" and i > start and s[i - 1] not in " \t\n;|&()":
            # glued to a word: $( <( @( and the like, never a subshell
            self.why.setdefault(i - 1, "parenthesised expansion")

    def _bare(self, j):
        """Is position j unquoted, unescaped code? For argv_literal."""
        return 0 <= j < self.n and self.cls[j] == CODE and j not in self.esc

    def _note_heredoc(self, a, b, quoted, executed):
        """An UNQUOTED heredoc fed to a shell is rewritten by the OUTER shell
        before the inner one reads it, single quotes in the body included: it
        expands `$` and backticks, and drops the backslash of \\\\, \\$, \\`
        and a backslash-newline. So any `$`, backtick or backslash in it makes
        its commands not literal. For argv_literal; classifies nothing."""
        body = self.src[a:b]
        if self.notes and executed and not quoted and ("$" in body or "`" in body or "\\" in body):
            for p in range(a, b):
                self.why.setdefault(p, "an unquoted heredoc fed to a shell, holding $, a backtick or a backslash")

    # ---------------------------------------------------------- brace expansion
    def _mark_braces(self):
        """Record each unquoted `{...}` that bash brace-expands, for argv_literal.

        Run after the scan, because a quote later in the same word decides
        what is code: `{"a b",x}` expands, `"{a,b}"` does not. A brace counts
        when an unquoted `,` or `..` sits at its own depth before its unquoted
        `}`, all within one word. One walk with a stack per word, so its cost
        is linear in the command (ClaudeDotFiles #380 review: the first version was
        quadratic). `${` is a parameter expansion, recorded by the scan; its
        braces are tracked so they close in the right place.
        """
        s, cls = self.src, self.cls
        stack = []                       # [position or None, separator seen]
        for j in range(self.n):
            if cls[j] == HIDDEN:
                stack = []
                continue
            ch = s[j]
            code = cls[j] == CODE and j not in self.esc
            if not code:
                continue
            if ch in " \t\n;|&()<>":
                stack = []
            elif ch == "{":
                param = j > 0 and s[j - 1] == "$" and cls[j - 1] == CODE
                stack.append([None if param else j, False])
            elif ch == "}" and stack:
                pos, sep = stack.pop()
                if pos is not None and sep:
                    self.why.setdefault(pos, "brace expansion")
            elif stack and (ch == "," or s.startswith("..", j)):
                stack[-1][1] = True

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
        self._note_heredoc(a, b, quoted, executed)   # for argv_literal only
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

    def argv_literal(self):
        """argv_segments, each segment paired with a REASON its words may not
        be the ones bash passes, or "" when they are. Opt-in and additive.

        For a guard that must know a VALUE, not guess it: the repo a create
        files on, read from words that an expansion could add to or a cut
        could take from. A segment has a reason when it holds, outside single
        quotes, a parameter expansion ($X, "${A[@]}", ${X:+...}), a command,
        process or arithmetic substitution, a backtick, brace or pathname
        expansion, $'...' or $"..." quoting, quoting shlex cannot read (its
        whitespace fallback), or a US or RS byte, which is replaced with `?` so
        it cannot forge a word or a segment. Tilde expansion is not a reason:
        it makes one word, never a flag.

        Its own loop, not a flag on argv_segments, so the view every other
        guard reads stays byte for byte as it was. It reads three things as
        bash does where argv_segments does not, so a literal segment is not cut
        short: an escaped separator (`a\\;b`) is part of its word; the & of
        `2>&1`, `>&2`, `&>` and the | of `>|` belong to a redirection; and a
        backtick ends a segment the way `(` does, so a command inside one is a
        segment of its own, and the segment it cut from is given a reason.
        """
        if not self.notes:
            return Surface(self.src, notes=True).argv_literal()
        import shlex
        out, cur, why, i = [], [], [], 0
        s = self.src
        in_tick = False

        def end_segment():
            out.append(("".join(cur), why[:]))
            del cur[:]
            del why[:]

        while i < self.n:
            k = self.cls[i]
            # A backtick's reason is placed below, on the segment outside it,
            # never on the command inside it.
            if k != HIDDEN and i in self.why and s[i] != "`" and self.why[i] not in why:
                why.append(self.why[i])
            if k == HIDDEN:
                if s[i] == "\n":
                    end_segment()
                i += 1
                continue
            if k == DATA:
                cur.append(s[i])
                i += 1
                continue
            c = s[i]
            if c == "\\" and i + 1 < self.n and s[i + 1] == "\n":
                # Removed, as bash removes it: `o/r\<nl>x` is one word, o/rx.
                # (argv_segments puts a space here, which no reader of a value
                # can rely on.)
                i += 2
                continue
            if i in self.esc:
                cur.append(c)
                i += 1
                continue
            if c == "`":
                # The segment a backtick cuts, on either side, is not what bash
                # runs: the opening one loses its tail, and the text after the
                # closing one continues an outer command.
                if not in_tick:
                    if "command substitution" not in why:
                        why.append("command substitution")
                    end_segment()
                else:
                    end_segment()
                    why.append("command substitution")
                in_tick = not in_tick
                i += 1
                continue
            # A redirection's & or | (2>&1, >&2, &>, >|) only beside a < or >
            # that is itself unquoted, unescaped code. After `x\>` or '>' it is
            # a real separator, and what follows is another command.
            if (c == "&" and ((s[i - 1:i] in ("<", ">") and self._bare(i - 1))
                              or (s.startswith("&>", i) and self._bare(i + 1)))) \
                    or (c == "|" and s[i - 1:i] == ">" and self._bare(i - 1)):
                cur.append(c)
                i += 1
                continue
            if c in ";|&()\n":
                end_segment()
                i += 1
                continue
            cur.append(c)
            i += 1
        end_segment()
        result = []
        for seg, reasons in out:
            seg = seg.strip()
            if not seg:
                continue
            try:
                toks = shlex.split(seg, comments=False, posix=True)
            except ValueError:
                toks = seg.split()
                reasons.append("quoting shlex cannot read")
            if any("\x1e" in t or "\x1f" in t for t in toks):
                toks = [t.replace("\x1e", "?").replace("\x1f", "?") for t in toks]
                reasons.append("a US or RS control byte")
            if toks:
                result.append((", ".join(reasons), toks))
        return result


class NestedSurface(Surface):
    """The opt-in view for a guard that judges what reaches a shell, here or
    on another machine (ClaudeDotFiles #376). It differs from Surface in two
    ways, and no existing view sees either:

      * ssh and fish count as shells for a heredoc, so a body fed or piped to
        them is code, not inert data, and so does a shell or ssh after a
        wrapper's options (`sudo -u root bash <<EOF`, `timeout 60 ssh h <<EOF`);
      * argv_nested() reads the command strings a segment hands to a shell as
        commands of their own.
    """
    FEEDS = SHELLS | REMOTE_SHELLS

    # Words whose later arguments may be a command string: the shells except
    # `.` and `source`, which take a file, plus ssh and fish.
    RUNNERS = (SHELLS - {".", "source"}) | REMOTE_SHELLS

    def argv_nested(self, depth=32):
        """Each argument vector as (command index, words), followed by the
        vectors of each command string it hands to a shell, as deep as those
        strings nest. Each is shorter than the command holding it, so the
        input's length bounds the recursion; `depth` only keeps a pathological
        input inside python's recursion limit.

        A segment hands one over when its command word is a runner (by the
        last part of its path) or a bare variable, which may hold one; or when
        a later word is a runner by its bare name (`sudo -u root bash -c`,
        `docker exec c sh -c`), or by the last part of its path after a
        prefix, itself named by path or not (`sudo -u root /bin/bash`,
        `/usr/bin/env /bin/bash`), or when a short-option cluster holding `c`
        comes anywhere after it (`xargs /bin/sh -e -o pipefail -c`). Every
        word after that runner
        holding whitespace is read again: the string after `-c`, an ssh
        remote command, eval's arguments. A variable, or a path anywhere
        else, is an argument: `git commit -m "$MSG" -m "..."` and
        `cat ~/.config/fish "..."` hand nothing to a shell.
        """
        out = []
        for toks in self.argv_segments():
            k = _command_index(toks)
            out.append((k, toks))
            r = self._runner_index(toks, k, self.RUNNERS) if depth > 0 else -1
            if r < 0:
                continue
            for w in toks[r + 1:]:
                if any(ch.isspace() for ch in w):
                    out.extend(NestedSurface(w).argv_nested(depth - 1))
        return out

    def _runner_index(self, toks, k, names):
        prefixed = False
        for i, w in enumerate(toks):
            name = w.rsplit("/", 1)[-1]
            if i == k and (name in names or _is_var(w)):
                return i
            if i != k and name in names and \
                    (w == name or prefixed or _c_flag_follows(toks, i)):
                return i
            prefixed = prefixed or name in PREFIXES
        return -1

    def _line_feeds_shell(self, line):
        """Surface's answer, and also a shell or ssh after a wrapper's options
        (`sudo -u root bash <<EOF`, `timeout 60 ssh host <<EOF`), found the way
        argv_nested finds a runner. Surface's own answer is unchanged."""
        if Surface._line_feeds_shell(self, line):
            return True
        for part in _split_top(line):
            toks = part.split()
            if self._runner_index(toks, _command_index(toks), self.RUNNERS) >= 0:
                return True
        return False


def _command_index(toks):
    """The index of a segment's command word, past the prefixes and
    assignments before it, or len(toks) when there is none."""
    k = 0
    while k < len(toks) and (toks[k] in PREFIXES or _is_assign(toks[k])):
        k += 1
    return k


def _c_flag_follows(toks, i):
    """A short-option cluster holding `c` comes anywhere after toks[i], as in
    `sh -c`, `bash -lc` or `sh -e -o pipefail -c`: a command string follows.
    Any later word counts, so an option that takes a value cannot hide it."""
    return any(w.startswith("-") and not w.startswith("--") and "c" in w[1:]
               for w in toks[i + 1:])


def _is_var(tok):
    """A word that is nothing but a parameter expansion: `$x` or `${...}`."""
    if tok.startswith("${") and tok.endswith("}"):
        return len(tok) > 3
    name = tok[1:]
    return tok.startswith("$") and bool(name) and \
        (name[0].isalpha() or name[0] == "_") and \
        all(ch.isalnum() or ch == "_" for ch in name)


def _normalized(surface):
    """The command's characters as bash reads them, for a tripwire that must
    see text no argument vector keeps (a heredoc body another program reads,
    the string eval or bash -c runs). Quote delimiters, quoting backslashes
    and backslash-newlines are removed; comments and heredoc bodies are kept
    as written, since what reads a body is not known. US, RS and GS become
    `?`. Opt-in: argv_literal's mode prints it ahead of the segments."""
    if not surface.notes:
        surface = Surface(surface.src, notes=True)
    text = "".join(surface.src[i] for i in range(surface.n) if i not in surface.drop)
    return text.replace("\x1d", "?").replace("\x1e", "?").replace("\x1f", "?")


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
    surface = NestedSurface(raw) if mode == "--argv-nested" else \
        Surface(raw, notes=(mode == "--argv-literal"))
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
    elif mode == "--argv-nested":
        # As --argv, each segment led by the index of its command word.
        out = "".join(str(k) + "\x1f" + "\x1f".join(t) + "\x1e"
                      for k, t in surface.argv_nested())
    elif mode == "--argv-literal":
        # The normalised text, a GS, then each segment with its reason as the
        # first field, empty when literal.
        out = _normalized(surface) + "\x1d" + \
            "".join("\x1f".join([r] + t) + "\x1e" for r, t in surface.argv_literal())
    else:
        sys.stderr.write("usage: shsurface.py [--exec|--mask|--segments|--argv|--argv-nested|--argv-literal]\n")
        return 2
    sys.stdout.buffer.write(out.encode("utf-8", "surrogateescape"))
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main(sys.argv))
