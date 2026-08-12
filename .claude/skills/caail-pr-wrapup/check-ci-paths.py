#!/usr/bin/env python3
"""Assert the CI path filters stay consistent with each other and with ship-pr.sh.

`ship-pr.sh` predicts which jobs a PR will trigger, so it duplicates each
workflow's `paths:`. That duplication drifted three times while carrying a
comment warning that it drifts, and twice it made preflight predict "no job"
where a job runs. This is the check that comment could not be.

Three assertions, each guarding a failure this repo has actually had:

1. **Pattern forms are ones ship-pr.sh can evaluate.** A set comparison alone
   would pass a pattern like `**.md` or `Datasets/*.md` while `path_matches`
   falls through to a literal comparison and matches nothing — predicting "no
   job" for every file it should cover. Comparing strings without checking they
   are *interpretable* leaves the dangerous direction open.

2. **Each workflow's own `pull_request` and `push` filters agree.** A filter
   that fires on PRs but not on pushes to main is the same silent gap one level
   down. (`docs.yml` is push-only and is exempt by construction.)

3. **Canonical content reaches both the test and the deploy filter.** This is
   the class that produced the `Primers/**` bug: present in `test.yml`, absent
   from `docs.yml`, so a change was tested, merged, and never published. Neither
   assertion 2 nor the ship-pr.sh mirror can catch a *cross-workflow* gap, so it
   needs naming explicitly rather than leaving it to prose.

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
SHIP_PR = Path(__file__).resolve().parent / "ship-pr.sh"

# declared-variable name -> (workflow file, which trigger carries the filter)
PAIRS = {
    "LINT_PATHS": ("lint-papers.yml", "pull_request"),
    "TEST_PATHS": ("test.yml", "pull_request"),
    "DEPLOY_PATHS": ("docs.yml", "push"),
    "GUARDS_PATHS": ("guards.yml", "pull_request"),
}

# Workflows that carry both a pull_request and a push filter. docs.yml deploys
# on push only, so it has no pull_request trigger to compare against.
BOTH_TRIGGERS = ("lint-papers.yml", "test.yml", "guards.yml")

# Repo-root canonical content that the site renders. A change to any of these
# must both be tested and reach a reader, so it belongs in test.yml AND docs.yml.
# `site/**` is the site itself and is covered by the same assertion.
CONTENT_PATHS = ["site/**", "*.md", "ResearchAreas/**", "Datasets/**", "Primers/**"]

# The three pattern forms ship-pr.sh's `path_matches` implements, and no others.
SUPPORTED = (
    re.compile(r"^\*\.md$"),           # bare *.md — GitHub scopes it to the ROOT
    re.compile(r"^[^*?!\[\]]+/\*\*$"),  # prefix/** subtree
    re.compile(r"^[^*?!\[\]]+$"),       # a literal path
)


def workflow_triggers(name: str) -> dict:
    doc = yaml.safe_load((ROOT / ".github" / "workflows" / name).read_text())
    # PyYAML resolves the bare key `on:` to the boolean True (YAML 1.1 tag).
    return doc.get("on", doc.get(True))


def declared(var: str) -> list[str]:
    """Pull `VAR='a b c'` out of ship-pr.sh without sourcing it."""
    m = re.search(rf"^{var}='([^']*)'", SHIP_PR.read_text(), re.MULTILINE)
    if not m:
        sys.exit(f"check-ci-paths: no {var}= declaration found in {SHIP_PR}")
    return m.group(1).split()


def report(label: str, left: list[str], right: list[str],
           left_name: str, right_name: str) -> bool:
    """Set-compare two path lists, naming each side so the diff is actionable."""
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


def contains(label: str, superset: list[str], required: list[str],
             superset_name: str) -> bool:
    missing = sorted(set(required) - set(superset))
    if not missing:
        print(f"  [PASS] {label}")
        return True
    print(f"  [FAIL] {label}")
    for p in missing:
        print(f"           canonical content not covered by {superset_name}: {p}")
    return False


def main() -> int:
    ok = True

    print("=== every pattern is a form ship-pr.sh's path_matches understands ===")
    for var, (wf, ev) in PAIRS.items():
        bad = [p for p in workflow_triggers(wf)[ev]["paths"]
               if not any(rx.match(p) for rx in SUPPORTED)]
        if bad:
            ok = False
            print(f"  [FAIL] {wf} [{ev}]")
            for p in bad:
                print(f"           unsupported pattern {p!r}: path_matches handles "
                      f"'*.md', 'prefix/**' and literals only, and would silently "
                      f"match nothing. Teach path_matches first, or use a "
                      f"supported form.")
        else:
            print(f"  [PASS] {wf} [{ev}]")

    print("\n=== each workflow's pull_request and push filters agree ===")
    for wf in BOTH_TRIGGERS:
        trig = workflow_triggers(wf)
        ok &= report(f"{wf}: pull_request == push",
                     trig["pull_request"]["paths"], trig["push"]["paths"],
                     "pull_request", "push")

    print("\n=== ship-pr.sh predicts from the same lists the workflows filter on ===")
    for var, (wf, ev) in PAIRS.items():
        ok &= report(f"{var} == {wf} [{ev}].paths",
                     workflow_triggers(wf)[ev]["paths"], declared(var),
                     f"{wf}", "ship-pr.sh")

    print("\n=== canonical content is both tested and deployed (the Primers class) ===")
    ok &= contains("test.yml covers all canonical content",
                   workflow_triggers("test.yml")["pull_request"]["paths"],
                   CONTENT_PATHS, "test.yml")
    ok &= contains("docs.yml covers all canonical content",
                   workflow_triggers("docs.yml")["push"]["paths"],
                   CONTENT_PATHS, "docs.yml")

    print("\nALL PASS" if ok else "\nFAILURES — see above")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
