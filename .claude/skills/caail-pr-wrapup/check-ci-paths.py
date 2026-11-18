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

6. **Every `gh` watch the skill runs, or names in its Markdown, waits at least
   `WATCH_FLOOR_SECONDS`.** In `ship-pr.sh` the interval is structural rather
   than checked call by call: `WATCH_INTERVAL_SECONDS` is `readonly` and set
   once, at or above the floor, and every watch goes through the `gh_watch`
   wrapper, which adds it. No watch may run directly and no call may give an
   interval of its own. In the skill's Markdown, every line naming a watch
   states an interval at or above the floor. Each refresh of a watch is an API
   call against the account's shared core limit, and a watch run inside the
   script is invisible to any hook that checks the commands a session types.
   Both of the script's watches once polled at 10 and 15 seconds
   (tucca-cellag/caail-planning#855). Built-in fixtures check on every run that
   it still rejects each way past it that a review has found, and still accepts
   the forms it should.

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
# ship-pr.sh's one gh watch wrapper, which adds the interval to every call.
WATCH_WRAPPER = 'gh_watch() { gh "$@" --interval "$WATCH_INTERVAL_SECONDS"; }'
# The skill's own Markdown, which tells a session which watches to type.
SKILL_DIR = Path(__file__).resolve().parent
SKILL_MARKDOWN = [
    SKILL_DIR / "SKILL.md",
    *sorted((SKILL_DIR / "reference").glob("*.md")),
]

# A gh watch: `gh run watch`, or `gh pr checks` with `--watch`, anywhere in a
# line, so a prompt, an env prefix, an earlier command or a global flag between
# `gh` and the subcommand does not hide one. A `gh_watch` call does not match,
# since `\b` finds no boundary between `gh` and `_`.
WATCH_CMD = re.compile(r"\bgh\b.*(?:\brun\s+watch\b|\bpr\s+checks\b.*--watch\b)")
# Every form gh accepts an interval in: `--interval 60`, `--interval=60`,
# `-i 60`, `-i=60`, `-i60`. The value stops at a backtick, for inline code.
INTERVAL_FLAG = re.compile(r"(?<!\S)(?:--interval(?:=|\s+)|-i(?:=|\s*))([^\s`]+)")
# An assignment to the constant: plain, `local`, `export`, `readonly`, `+=`, or
# the `${VAR=...}` default. A `$` in front is a read of it, not an assignment.
# This needs to find only the forms that could pass for the one declaration:
# `readonly` stops the script on any other when it runs.
WATCH_ASSIGN = re.compile(rf"(?<![\w$]){WATCH_CONSTANT}(\+?=)(\S*)")
# A definition of the wrapper, in either form bash takes one.
WRAPPER_DEF = re.compile(r"\s*(?:function\s+gh_watch\b|gh_watch\s*\(\))")
# A call of the wrapper anywhere in a line, the definition excepted.
WRAPPER_CALL = re.compile(r"(?<![\w$-])gh_watch\s+[^\s(]")

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


def logical_lines(src: str, shell: bool) -> list[tuple[int, str]]:
    """(first line number, text) for each line, joined with any it continues onto.

    A trailing backslash continues a line, so a command split across lines is
    read whole. In a shell source a whole-line comment is dropped, since it ends
    at its newline whatever it ends in. A trailing comment is kept: telling its
    `#` from one inside quotes would take a shell parser, and keeping it errs
    toward a red run, never toward a missed watch.
    """
    out: list[tuple[int, str]] = []
    start, buf = 0, ""
    for n, line in enumerate(src.splitlines(), 1):
        if shell and not buf and line.lstrip().startswith("#"):
            continue
        if not buf:
            start = n
        if line.endswith("\\"):
            buf += line[:-1] + " "
            continue
        out.append((start, buf + line))
        buf = ""
    if buf:
        out.append((start, buf))
    return out


def watch_problems(src: str) -> list[str]:
    """What breaks assertion 6 in a ship-pr.sh source; empty when nothing does.

    The interval is structural rather than checked call by call. The constant is
    `readonly`, so a later assignment in any form stops the script when it runs,
    and it must be declared exactly once that way, in whole seconds at or above
    the floor. Every watch goes through `gh_watch`, defined once as
    WATCH_WRAPPER: no line may run a gh watch directly, and no call may give an
    interval of its own, whichever of two intervals gh would take.
    """
    problems = []
    lines = [line for _, line in logical_lines(src, shell=True)]
    assigns = [m.group(0) for line in lines for m in WATCH_ASSIGN.finditer(line)]
    declared = [
        m
        for line in lines
        if (m := re.fullmatch(rf"\s*readonly\s+{WATCH_CONSTANT}=(\d+)\s*", line))
    ]
    if len(assigns) != 1 or len(declared) != 1:
        problems.append(
            f"{WATCH_CONSTANT} must be set once, as readonly {WATCH_CONSTANT}="
            f"<seconds>, and is set as: {', '.join(assigns) or 'nothing'}"
        )
    elif int(declared[0].group(1)) < WATCH_FLOOR_SECONDS:
        problems.append(
            f"{WATCH_CONSTANT} is {declared[0].group(1)}, "
            f"under the {WATCH_FLOOR_SECONDS} s floor"
        )
    defs = [line.strip() for line in lines if WRAPPER_DEF.match(line)]
    if defs != [WATCH_WRAPPER]:
        problems.append(
            f"the watch wrapper must be defined once, as {WATCH_WRAPPER}, "
            f"and is defined as: {' | '.join(defs) or 'nothing'}"
        )
    calls = [
        line.strip()
        for line in lines
        if WRAPPER_CALL.search(line) and not WRAPPER_DEF.match(line)
    ]
    if not calls:
        problems.append(
            "no gh_watch call in ship-pr.sh, so this assertion read nothing"
        )
    for call in calls:
        if given := INTERVAL_FLAG.findall(call):
            problems.append(
                f"a gh_watch call gives its own interval ({', '.join(given)}): {call}"
            )
    for line in lines:
        if WATCH_CMD.search(line):
            problems.append(
                f"a gh watch that does not go through gh_watch: {line.strip()}"
            )
    return problems


def markdown_watch_problems(name: str, text: str) -> list[str]:
    """What breaks assertion 6 in the skill's Markdown; empty when nothing does.

    Read by line, not by code span: any line naming a gh watch, inline or
    fenced, after a prompt or not, must state an interval, and every interval it
    states must be a whole number at or above the floor. A line ending in a
    backslash is read with the next. That holds a bare mention to the rule a
    command to type is held to. It is meant to: telling the two apart is where
    the earlier versions of this check let a watch through, and a watch with no
    interval is the defect it exists for.
    """
    problems = []
    for n, line in logical_lines(text, shell=False):
        if not WATCH_CMD.search(line):
            continue
        given = [v.rstrip(".,;:)") for v in INTERVAL_FLAG.findall(line)]
        floor = WATCH_FLOOR_SECONDS
        low = [v for v in given if not (v.isdigit() and int(v) >= floor)]
        if not given:
            problems.append(
                f"{name}:{n}: names a gh watch and states no interval: {line.strip()}"
            )
        elif low:
            problems.append(
                f"{name}:{n}: a watch states {', '.join(low)}, not a whole number "
                f"at or above {floor}: {line.strip()}"
            )
    return problems


# Assertion 6 run on sources built here rather than on the repo's own files, so
# it is tested in both directions: a check that matched nothing, or matched too
# loosely, would still pass on today's ship-pr.sh. Each rejected source differs
# from the accepted one by the one change its label names, and the problem it
# must report is named by a phrase from the message.
GOOD_SH = """\
readonly WATCH_INTERVAL_SECONDS=60
gh_watch() { gh "$@" --interval "$WATCH_INTERVAL_SECONDS"; }
cmd_watch_checks() {
  gh_watch pr checks "$pr" --watch
}
cmd_watch_deploy() {
  # gh run watch "$id" -i 3   (a commented-out watch is not a watch)
  gh_watch run watch "$id" --exit-status
}
"""
CHECKS = 'gh_watch pr checks "$pr" --watch'
DEPLOY = 'gh_watch run watch "$id" --exit-status'
REJECTED_SH = [
    (
        "the constant missing",
        GOOD_SH.replace("readonly WATCH_INTERVAL_SECONDS=60\n", ""),
        "set as: nothing",
    ),
    ("the constant not readonly", GOOD_SH.replace("readonly W", "W"), "set once"),
    ("the constant under the floor", GOOD_SH.replace("=60", "=59"), "under the 60 s"),
    ("the constant not a number", GOOD_SH.replace("=60", "=$X"), "set once"),
    ("a second assignment", GOOD_SH + "WATCH_INTERVAL_SECONDS=10\n", "set once"),
    ("the wrapper missing", GOOD_SH.replace(WATCH_WRAPPER + "\n", ""), "wrapper"),
    (
        "the wrapper on a literal",
        GOOD_SH.replace('"$WATCH_INTERVAL_SECONDS"; }', "10; }"),
        "wrapper",
    ),
    ("the wrapper redefined", GOOD_SH + 'gh_watch() { gh "$@"; }\n', "wrapper"),
    (
        "a direct watch",
        GOOD_SH.replace(DEPLOY, 'gh run watch "$id" --interval "$X"'),
        "does not go through",
    ),
    (
        "a direct watch after a prefix",
        GOOD_SH.replace(DEPLOY, 'GH_TOKEN=x gh run watch "$id"'),
        "does not go through",
    ),
    (
        "a direct watch split across lines",
        GOOD_SH.replace(CHECKS, 'gh pr checks "$pr" \\\n    --watch'),
        "does not go through",
    ),
    (
        "a call giving its own interval",
        GOOD_SH.replace(DEPLOY, DEPLOY + " -i 5"),
        "its own interval (5)",
    ),
    (
        "no call at all",
        GOOD_SH.replace(CHECKS, ":").replace(DEPLOY, ":"),
        "no gh_watch call",
    ),
]
GOOD_MD = """\
Watch it with `gh run watch <id> --interval 60 --exit-status`.

```bash
gh pr checks <pr> --watch --interval 60
```
"""
FENCED = "gh pr checks <pr> --watch --interval 60\n"
REJECTED_MD = [
    (
        "a watch with no interval",
        GOOD_MD.replace("<id> --interval 60", "<id>"),
        "states no interval",
    ),
    (
        "a watch under the floor",
        GOOD_MD.replace("<id> --interval 60", "<id> --interval 15"),
        "states 15",
    ),
    (
        "a flag before the argument",
        GOOD_MD.replace("<id> --interval 60 --exit-status", "--exit-status <id>"),
        "states no interval",
    ),
    (
        "a prompt before the watch",
        GOOD_MD.replace(FENCED, "$ gh run watch <id>\n"),
        "states no interval",
    ),
    (
        "a continued line overriding it",
        GOOD_MD.replace(FENCED, FENCED[:-1] + " \\\n  -i 5\n"),
        "states 5",
    ),
    (
        "a bare mention",
        GOOD_MD + "\nA bare `gh pr checks --watch` is held to the rule too.\n",
        "states no interval",
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
            f"  [PASS] ship-pr.sh runs every watch through gh_watch at a readonly "
            f"{WATCH_CONSTANT} of at least {WATCH_FLOOR_SECONDS}, and every watch "
            f"named in {len(SKILL_MARKDOWN)} Markdown files states at least that"
        )

    print("\nALL PASS" if ok else "\nFAILURES — see above")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
