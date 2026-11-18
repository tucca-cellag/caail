#!/usr/bin/env python3
"""Assert the CI path filters stay consistent with each other and with ship-pr.sh.

`ship-pr.sh` predicts which jobs a PR will trigger, so it mirrors each workflow's
`paths:`. That duplication drifted three times while carrying a comment warning
that it drifts, and twice it made preflight predict "no job" where a job runs.
This is the check that comment could not be.

**The workflow list is discovered, not enumerated.** Every `.yml` in
`.github/workflows/` that carries a `paths:` filter must have a matching
`<STEM>_PATHS` variable in `ship-pr.sh` (`lint-papers.yml` -> `LINT_PAPERS_PATHS`).
Hand-listing the workflows here would reproduce, one level up, the exact defect
this script exists to catch.

Six assertions, each guarding a failure this repo has actually had. The first
five are about the path filters:

1. **Every pattern is a form `path_matches` can evaluate.** A set comparison
   alone would accept `**.md` or `Datasets/*.md` while `path_matches` falls
   through to a literal comparison and matches nothing — predicting "no job" for
   every file it should cover. Comparing strings without checking they are
   *interpretable* leaves the dangerous direction open.

2. **Every paths-bearing workflow has a predictor**, so a new workflow cannot be
   invisible to preflight.

3. **Each workflow's `pull_request` and `push` filters agree** where it has both.
   A filter that fires on PRs but not on pushes to main is the same silent gap
   one level down.

4. **Everything that deploys is also tested** (`docs.yml` paths are a subset of
   `test.yml`'s). Fully derivable from the two workflows, no curated list.

5. **Canonical content reaches both.** This is the class that produced the
   `Primers/**` bug: present in `test.yml`, absent from `docs.yml`, so a change
   was tested, merged, and never published. Assertion 4 catches the reverse
   direction; this one needs to know which paths are *content*, so
   `CONTENT_PATHS` below is hand-kept and is this script's own weak point —
   adding a canonical directory means adding it there, or the guard will confirm
   an incomplete set is complete.

The sixth is not about paths. It rides along because this script already reads
`ship-pr.sh` and already runs in `guards.yml`:

6. **Every `gh` watch the skill runs, or tells a session to type, waits at least
   `WATCH_FLOOR_SECONDS`.** In `ship-pr.sh`, `WATCH_INTERVAL_SECONDS` is assigned
   once, at or above the floor, and each watch takes its interval from it and
   from nowhere else. In the skill's Markdown, every interval a watch states is
   a number at or above the floor, and a watch written as a command to type
   states one. Each refresh of a watch is an API call against the account's
   shared core limit, and a watch run inside the script is invisible to any hook
   that checks the commands a session types. Both of the script's watches once
   polled at 10 and 15 seconds (tucca-cellag/caail-planning#855). Built-in
   fixtures check on every run that it still rejects each way past it that a
   review has found, and still accepts the forms it should.

The ship-pr.sh comparison is deliberately a set comparison of pattern strings
rather than a glob evaluation: it asks the question that keeps going wrong
("do these name the same things") without reimplementing GitHub's matching
semantics, where a subtle error would turn an obviously stale predictor into a
confidently wrong one. `path_matches` owns the semantics; assertion 1 keeps the
patterns inside what it understands.

Run from anywhere:  python3 .claude/skills/caail-pr-wrapup/check-ci-paths.py
"""
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover - fail loudly rather than skip
    sys.exit(
        "check-ci-paths: PyYAML is required and missing. This check must not be "
        "skipped silently; install it (`pip install pyyaml`) or fix the runner image."
    )

ROOT = Path(__file__).resolve().parents[3]
WORKFLOWS = ROOT / ".github" / "workflows"
SHIP_PR = Path(__file__).resolve().parent / "ship-pr.sh"

# Repo-root canonical content that the site renders. A change to any of these
# must both be tested and reach a reader. See assertion 5 on why this one list
# cannot be derived.
CONTENT_PATHS = ["site/**", "*.md", "ResearchAreas/**", "Methods/**", "Datasets/**", "Primers/**"]

# The least a watch may wait between refreshes (assertion 6).
WATCH_FLOOR_SECONDS = 60
WATCH_CONSTANT = "WATCH_INTERVAL_SECONDS"
# The one interval a watch in ship-pr.sh may give, as the word after the flag.
WATCH_FROM_CONSTANT = f'"${WATCH_CONSTANT}"'
# The skill's own Markdown, which tells a session which watches to type.
SKILL_DIR = Path(__file__).resolve().parent
SKILL_MARKDOWN = [
    SKILL_DIR / "SKILL.md",
    *sorted((SKILL_DIR / "reference").glob("*.md")),
]

# A gh watch: `gh run watch`, or `gh pr checks` with `--watch`. Global flags may
# sit between `gh` and the subcommand, hence the `.*`.
WATCH_CMD = re.compile(r"\bgh\b.*(?:\brun\s+watch\b|\bpr\s+checks\b.*--watch\b)")
# Every form gh accepts an interval in: `--interval 60`, `--interval=60`,
# `-i 60`, `-i=60`, `-i60`. gh takes the last one given, so each is counted.
INTERVAL_FLAG = re.compile(r"(?<!\S)(?:--interval(?:=|\s+)|-i(?:=|\s*))(\S+)")
# An assignment to the constant in any form bash takes one: plain, `local`,
# `export`, `readonly`, `+=`, or the `${VAR=...}` default. A `$` in front is a
# read of it, not an assignment.
WATCH_ASSIGN = re.compile(rf"(?<![\w$]){WATCH_CONSTANT}(\+?=)(\S*)")

# The three pattern forms ship-pr.sh's `path_matches` implements, and no others.
SUPPORTED = (
    re.compile(r"^\*\.md$"),            # bare *.md — GitHub scopes it to the ROOT
    re.compile(r"^[^*?!\[\]]+/\*\*$"),  # prefix/** subtree
    re.compile(r"^[^*?!\[\]]+$"),       # a literal path
)

TRIGGERS = ("pull_request", "push")


def var_name(stem: str) -> str:
    """lint-papers -> LINT_PAPERS_PATHS."""
    return stem.upper().replace("-", "_") + "_PATHS"


def workflow_files() -> list[Path]:
    """Both extensions: GitHub runs `.yaml` workflows identically to `.yml`, and a
    `.yaml` one slipping past this glob would be invisible to every assertion
    below — the same 'confirms an incomplete set is complete' failure the
    CONTENT_PATHS caveat warns about, in the part that claims to be derived."""
    return sorted(list(WORKFLOWS.glob("*.yml")) + list(WORKFLOWS.glob("*.yaml")))


def load_filters() -> tuple[dict[str, dict[str, list[str]]], list[str]]:
    """({workflow: {trigger: paths}}, [workflows using paths-ignore]).

    `paths-ignore` is reported rather than skipped: ship-pr.sh's matcher model
    has no way to express negation, so a workflow filtered that way cannot be
    predicted at all. Silently treating it as filterless is how it would become
    invisible.
    """
    out: dict[str, dict[str, list[str]]] = {}
    negated: list[str] = []
    for wf in workflow_files():
        doc = yaml.safe_load(wf.read_text())
        # PyYAML resolves the bare key `on:` to the boolean True (YAML 1.1 tag).
        trig = doc.get("on", doc.get(True)) if isinstance(doc, dict) else None
        if not isinstance(trig, dict):
            continue
        found = {}
        for ev in TRIGGERS:
            block = trig.get(ev)
            if not isinstance(block, dict):
                continue
            if isinstance(block.get("paths-ignore"), list):
                negated.append(f"{wf.name} [{ev}]")
            if isinstance(block.get("paths"), list):
                found[ev] = block["paths"]
        if found:
            out[wf.name] = found
    return out, negated


def declared(var: str) -> list[str] | None:
    """Pull `VAR='a b c'` out of ship-pr.sh without sourcing it."""
    m = re.search(rf"^{var}='([^']*)'", SHIP_PR.read_text(), re.MULTILINE)
    return m.group(1).split() if m else None


def wrapper_state(stem: str) -> tuple[str, bool, bool]:
    """(function name, is it defined?, does preflight call it?).

    A pattern list with no wrapper, or a wrapper preflight never calls, leaves
    the prediction silently absent while every set comparison still passes. The
    variable existing is not the property that matters; being *read* is.
    """
    fn = "matches_" + stem.replace("-", "_")
    src = SHIP_PR.read_text()
    defined = re.search(rf"^{fn}\s*\(\)", src, re.MULTILINE) is not None
    called = re.search(rf"^\s+{fn}\s+\"\$p\"", src, re.MULTILINE) is not None
    return fn, defined, called


def report(label: str, left: list[str], right: list[str],
           left_name: str, right_name: str) -> bool:
    only_left = sorted(set(left) - set(right))
    only_right = sorted(set(right) - set(left))
    if not only_left and not only_right:
        print(f"  [PASS] {label}")
        return True
    print(f"  [FAIL] {label}")
    for p in only_left:
        print(f"           in {left_name} but not {right_name}: {p}")
    for p in only_right:
        print(f"           in {right_name} but not {left_name}: {p}")
    return False


def contains(label: str, superset: list[str], required: list[str], detail: str) -> bool:
    missing = sorted(set(required) - set(superset))
    if not missing:
        print(f"  [PASS] {label}")
        return True
    print(f"  [FAIL] {label}")
    for p in missing:
        print(f"           {detail}: {p}")
    return False


def code_lines(src: str) -> list[str]:
    """A shell source's commands, one per line as bash reads them.

    A trailing backslash continues a command onto the next line, so a watch
    split across lines is read whole. Comments are dropped: a whole-line one
    ends at its newline whatever it ends in, and a trailing one starts at a `#`
    that opens a word (so `$#` and `${#x}` are kept).
    """
    out: list[str] = []
    buf = ""
    for line in src.splitlines():
        if not buf and line.lstrip().startswith("#"):
            continue
        code = re.split(r"(?<!\S)#", line, maxsplit=1)[0]
        if code.endswith("\\"):
            buf += code[:-1] + " "
            continue
        out.append(buf + code)
        buf = ""
    if buf:
        out.append(buf)
    return out


def watch_problems(src: str) -> list[str]:
    """What breaks assertion 6 in a ship-pr.sh source; empty when nothing does.

    The constant must be assigned exactly once, as a whole number of seconds at
    or above the floor: a second assignment, later or `local`, would override
    the value checked here. Each watch must give exactly one interval, and that
    interval must be `"$WATCH_INTERVAL_SECONDS"`, so a literal in any form, or a
    second flag after the constant (gh takes the last), fails rather than
    slipping past a number check.
    """
    problems = []
    code = code_lines(src)
    assigns = [m for line in code for m in WATCH_ASSIGN.finditer(line)]
    if not assigns:
        problems.append(f"no {WATCH_CONSTANT}=<seconds> in ship-pr.sh")
    elif len(assigns) > 1:
        found = ", ".join(m.group(0) for m in assigns)
        problems.append(
            f"{WATCH_CONSTANT} is assigned {len(assigns)} times ({found}); "
            "any but the first would override the value checked here"
        )
    else:
        op, value = assigns[0].group(1), assigns[0].group(2).strip("'\"")
        if op != "=" or not value.isdigit():
            problems.append(
                f"{WATCH_CONSTANT} is set as {assigns[0].group(0)}, "
                "not a whole number of seconds"
            )
        elif int(value) < WATCH_FLOOR_SECONDS:
            problems.append(
                f"{WATCH_CONSTANT} is {value}, under the {WATCH_FLOOR_SECONDS} s floor"
            )
    watches = [line.strip() for line in code if WATCH_CMD.search(line)]
    if not watches:
        problems.append(
            "no gh watch found in ship-pr.sh, so this assertion read nothing"
        )
    for line in watches:
        given = INTERVAL_FLAG.findall(line)
        if given != [WATCH_FROM_CONSTANT]:
            problems.append(
                f"a watch must give one interval, {WATCH_FROM_CONSTANT}, and this one "
                f"gives {', '.join(given) or 'none'}: {line}"
            )
    return problems


def markdown_watch_problems(name: str, text: str) -> list[str]:
    """What breaks assertion 6 in the skill's Markdown; empty when nothing does.

    A watch is read from inline code and from lines of fenced code. Every
    interval it states must be a whole number at or above the floor. A watch
    whose subcommand is followed by an argument (`gh run watch <id> ...`) is a
    command a session is told to type, so it must state one; a bare mention
    such as `gh run watch` or `gh pr checks --watch` need not.
    """
    problems = []
    in_fence = False
    for n, line in enumerate(text.splitlines(), 1):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        for span in [line.strip()] if in_fence else re.findall(r"`([^`]+)`", line):
            m = re.match(r"gh\s+(?:run\s+watch|pr\s+checks)\b(.*)", span.strip())
            if not m or not WATCH_CMD.search(span):
                continue
            rest = m.group(1).split()
            given = INTERVAL_FLAG.findall(span)
            floor = WATCH_FLOOR_SECONDS
            low = [v for v in given if not (v.isdigit() and int(v) >= floor)]
            if low:
                problems.append(
                    f"{name}:{n}: a watch states {', '.join(low)}, not a whole number "
                    f"at or above {WATCH_FLOOR_SECONDS}: {span}"
                )
            elif not given and rest and not rest[0].startswith("-"):
                problems.append(
                    f"{name}:{n}: a watch to type states no interval: {span}"
                )
    return problems


# Assertion 6 run on sources built here rather than on the repo's own files, so
# it is tested in both directions: a check that matched nothing, or matched too
# loosely, would still pass on today's ship-pr.sh. Each rejected source differs
# from the accepted one by the one change its label names, and the problem it
# must report is named by a phrase from the message.
GOOD_SH = """\
WATCH_INTERVAL_SECONDS=60
cmd_watch_checks() {
  gh pr checks "$pr" --watch --interval "$WATCH_INTERVAL_SECONDS"
}
cmd_watch_deploy() {
  # gh run watch "$id" -i 3   (a commented-out watch is not a watch)
  gh run watch "$id" --interval "$WATCH_INTERVAL_SECONDS" --exit-status  # 3 s default
}
"""
CHECKS = 'gh pr checks "$pr" --watch --interval "$WATCH_INTERVAL_SECONDS"'
DEPLOY = 'gh run watch "$id" --interval "$WATCH_INTERVAL_SECONDS" --exit-status'
REJECTED_SH = [
    (
        "the constant missing",
        GOOD_SH.replace("WATCH_INTERVAL_SECONDS=60\n", ""),
        "no WATCH",
    ),
    ("the constant under the floor", GOOD_SH.replace("=60", "=59"), "under the 60 s"),
    ("the constant not a number", GOOD_SH.replace("=60", "=$X"), "not a whole"),
    (
        "a literal interval",
        GOOD_SH.replace(CHECKS, 'gh pr checks "$pr" --watch --interval 10'),
        "gives 10",
    ),
    (
        "a short-flag literal",
        GOOD_SH.replace(DEPLOY, 'gh run watch "$id" -i 15 --exit-status'),
        "gives 15",
    ),
    (
        "an = literal",
        GOOD_SH.replace(DEPLOY, 'gh run watch "$id" --interval=5'),
        "gives 5",
    ),
    (
        "no interval at all",
        GOOD_SH.replace(DEPLOY, 'gh run watch "$id" --exit-status'),
        "gives none",
    ),
    (
        "a second flag after the constant",
        GOOD_SH.replace(DEPLOY, DEPLOY + " -i 5"),
        '", 5',
    ),
    (
        "a watch split across lines",
        GOOD_SH.replace(CHECKS, 'gh pr checks "$pr" \\\n    --watch -i 10'),
        "gives 10",
    ),
    (
        "a later reassignment",
        GOOD_SH + "WATCH_INTERVAL_SECONDS=10\n",
        "assigned 2 times",
    ),
    (
        "a local override",
        GOOD_SH.replace(
            "  gh run watch", "  local WATCH_INTERVAL_SECONDS=5\n  gh run watch", 1
        ),
        "assigned 2 times",
    ),
    ("no watch at all", "WATCH_INTERVAL_SECONDS=60\n", "no gh watch"),
]
GOOD_MD = """\
Watch it with `gh run watch <id> --interval 60 --exit-status`. A bare
`gh run watch` or `gh pr checks --watch` is a mention, not a command.

```bash
gh pr checks <pr> --watch --interval 60
```
"""
REJECTED_MD = [
    (
        "a typed watch with no interval",
        GOOD_MD.replace("<id> --interval 60", "<id>"),
        "states no interval",
    ),
    (
        "a typed watch under the floor",
        GOOD_MD.replace("<id> --interval 60", "<id> --interval 15"),
        "states 15",
    ),
    (
        "a fenced watch under the floor",
        GOOD_MD.replace("--watch --interval 60", "--watch -i 10"),
        "states 10",
    ),
]


def watch_self_test() -> list[str]:
    """Every way assertion 6 fails to accept or reject its fixtures."""
    failures = []
    for label, check, good, rejected in (
        ("ship-pr.sh", watch_problems, GOOD_SH, REJECTED_SH),
        (
            "Markdown",
            lambda s: markdown_watch_problems("fixture", s),
            GOOD_MD,
            REJECTED_MD,
        ),
    ):
        if got := check(good):
            failures.append(f"rejects the accepted {label} fixture: {got}")
        for case, src, phrase in rejected:
            got = check(src)
            if not any(phrase in p for p in got):
                failures.append(
                    f"{label}, {case}: expected a problem saying {phrase!r}, got {got}"
                )
    return failures


def main() -> int:
    filters, negated = load_filters()
    if not filters:
        sys.exit(f"check-ci-paths: no paths-bearing workflows found under {WORKFLOWS}")
    ok = True

    print(f"=== discovered {len(filters)} paths-bearing workflow(s) "
          f"of {len(workflow_files())} total ===")
    for wf, evs in filters.items():
        print(f"  {wf}  [{', '.join(evs)}]")

    print("\n=== no workflow filters with paths-ignore ===")
    if negated:
        ok = False
        print("  [FAIL] ship-pr.sh's matchers cannot express negation, so these "
              "cannot be predicted:")
        for n in negated:
            print(f"           {n} uses paths-ignore")
    else:
        print("  [PASS] none")

    print("\n=== every pattern is a form ship-pr.sh's path_matches understands ===")
    for wf, evs in filters.items():
        for ev, paths in evs.items():
            bad = [p for p in paths if not any(rx.match(p) for rx in SUPPORTED)]
            if bad:
                ok = False
                print(f"  [FAIL] {wf} [{ev}]")
                for p in bad:
                    print(f"           unsupported pattern {p!r}: path_matches handles "
                          "'*.md', 'prefix/**' and literals only, and would silently "
                          "match nothing. Teach path_matches first, or use a supported form.")
            else:
                print(f"  [PASS] {wf} [{ev}]")

    print("\n=== every paths-bearing workflow has a predictor in ship-pr.sh ===")
    for wf, evs in filters.items():
        stem = Path(wf).stem
        var = var_name(stem)
        got = declared(var)
        if got is None:
            ok = False
            print(f"  [FAIL] {wf} -> {var}")
            print(f"           no {var}= in ship-pr.sh, so preflight cannot predict this "
                  "workflow. Add it (named for the file), a matches_* wrapper, and a "
                  "call in cmd_preflight.")
            continue
        ev = "pull_request" if "pull_request" in evs else next(iter(evs))
        ok &= report(f"{var} == {wf} [{ev}].paths", evs[ev], got, wf, "ship-pr.sh")

    print("\n=== every predictor is wired into cmd_preflight ===")
    for wf in filters:
        stem = Path(wf).stem
        fn, defined, called = wrapper_state(stem)
        if defined and called:
            print(f"  [PASS] {fn} is defined and called")
            continue
        ok = False
        print(f"  [FAIL] {wf} -> {fn}")
        if not defined:
            print(f"           no {fn}() in ship-pr.sh. The pattern list alone predicts "
                  "nothing.")
        elif not called:
            print(f"           {fn}() exists but cmd_preflight never calls it, so the "
                  "prediction is silently absent while every set comparison passes.")

    print("\n=== each workflow's pull_request and push filters agree ===")
    for wf, evs in filters.items():
        if len(evs) < 2:
            print(f"  [SKIP] {wf}: only [{', '.join(evs)}]")
            continue
        ok &= report(f"{wf}: pull_request == push",
                     evs["pull_request"], evs["push"], "pull_request", "push")

    print("\n=== everything that deploys is also tested ===")
    deploy = filters.get("docs.yml", {}).get("push", [])
    test = filters.get("test.yml", {}).get("pull_request", [])
    ok &= contains("docs.yml paths are a subset of test.yml's", test, deploy,
                   "deploys but is not covered by test.yml")

    print("\n=== canonical content is both tested and deployed (the Primers class) ===")
    ok &= contains("test.yml covers all canonical content", test, CONTENT_PATHS,
                   "canonical content not covered by test.yml")
    ok &= contains("docs.yml covers all canonical content", deploy, CONTENT_PATHS,
                   "canonical content not covered by docs.yml")

    print("\n=== the watch check accepts and rejects its own fixtures ===")
    failures = watch_self_test()
    if failures:
        ok = False
        print("  [FAIL] the check below cannot be trusted:")
        for failure in failures:
            print(f"           {failure}")
    else:
        print(
            f"  [PASS] {len(REJECTED_SH) + len(REJECTED_MD)} rejected, "
            "2 accepted, as expected"
        )

    print(
        "\n=== every gh watch the skill runs or names waits "
        f"{WATCH_FLOOR_SECONDS} s or more ==="
    )
    problems = watch_problems(SHIP_PR.read_text())
    for md in SKILL_MARKDOWN:
        problems += markdown_watch_problems(md.name, md.read_text())
    if problems:
        ok = False
        print("  [FAIL] the skill's watches")
        for problem in problems:
            print(f"           {problem}")
    else:
        print(
            f"  [PASS] every watch in ship-pr.sh reads {WATCH_CONSTANT}, which is "
            f"at least {WATCH_FLOOR_SECONDS}, and every one in {len(SKILL_MARKDOWN)} "
            "Markdown files states at least that"
        )

    print("\nALL PASS" if ok else "\nFAILURES — see above")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
