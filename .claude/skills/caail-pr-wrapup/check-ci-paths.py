#!/usr/bin/env python3
"""Assert ship-pr.sh's declared CI path filters still equal the workflows'.

`ship-pr.sh` predicts which jobs a PR will trigger, so it duplicates each
workflow's `paths:`. That duplication drifted three times while carrying a
comment warning that it drifts, and twice it made preflight predict "no job"
where a job runs. This is the check that comment could not be.

Deliberately a SET comparison of pattern strings, not a glob evaluation. It asks
"do these two lists name the same things", which is the question that keeps
going wrong, and avoids reimplementing GitHub's matching semantics — where a
subtle error would turn an obviously stale predictor into a confidently wrong
one. `ship-pr.sh`'s own `path_matches` implements the semantics, and its
behaviour is pinned separately.

Also asserts each workflow's `pull_request` and `push` filters agree with each
other, since a filter that fires on PRs but not on pushes to main (or the
reverse) is the same silent gap one level down.

Run from the repo root:  python3 .claude/skills/caail-pr-wrapup/check-ci-paths.py
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
}


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


def main() -> int:
    ok = True

    print("=== each workflow's pull_request and push filters agree ===")
    for wf in ("lint-papers.yml", "test.yml"):
        trig = workflow_triggers(wf)
        pr = trig["pull_request"]["paths"]
        push = trig["push"]["paths"]
        ok &= report(f"{wf}: pull_request == push", pr, push,
                     "pull_request", "push")

    print("\n=== ship-pr.sh predicts from the same lists the workflows filter on ===")
    for var, (wf, ev) in PAIRS.items():
        wf_paths = workflow_triggers(wf)[ev]["paths"]
        ok &= report(f"{var} == {wf} [{ev}].paths", wf_paths, declared(var),
                     f"{wf}", "ship-pr.sh")

    print("\nALL PASS" if ok else "\nFAILURES — see above")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
