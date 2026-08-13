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

Five assertions, each guarding a failure this repo has actually had:

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

    print("\nALL PASS" if ok else "\nFAILURES — see above")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
