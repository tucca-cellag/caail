#!/usr/bin/env python3
"""Exercise check-public-publish.sh without putting its trigger strings on a
Bash command line (which the hook itself would, correctly, intercept)."""
import json, subprocess, sys, os

HOOK_PROJ = ".claude/hooks/check-public-publish.sh"
HOOK_GLOB = os.path.expanduser("~/.claude/hooks/check-public-publish.sh")

V = "gh" + " issue create"
P = "gh" + " pr create"
RISK = "unauthenticated endpoint, absent rate" + " limiting"

CASES = [
    ("real publish, risky payload",      f'{V} --title x --body "{RISK}"',           "deny"),
    ("real publish, ordinary payload",   f'{P} --title "feat: add paper" --body "one ref"', "allow"),
    ("verb as DATA in a variable",       f"RISKY='{V} --body \"{RISK}\"'",           "allow"),
    ("verb as DATA in an echo",          f'echo "run: {V} --body \\"{RISK}\\""',     "allow"),
    ("real publish after a separator",   f'cd /tmp && {V} --title x --body "{RISK}"', "deny"),
    ("read-only command",                "gh issue list --limit 5",                   "allow"),
    # close/reopen/review publish text via --comment, easy to forget.
    ("close with a risky comment",       f'gh issue close 1 --comment "{RISK}"',      "deny"),
    ("close with an ordinary comment",   'gh issue close 1 --comment "fixed in #126"', "allow"),
]

def run(hook, cmd, env=None):
    e = dict(os.environ); e.update(env or {})
    r = subprocess.run(["bash", hook], input=json.dumps({"tool_input": {"command": cmd}}),
                       capture_output=True, text=True, env=e)
    try:
        out = json.loads(r.stdout)["hookSpecificOutput"]
    except Exception:
        return "PARSE-FAIL", r.stdout[:120]
    return out.get("permissionDecision", "allow"), out.get("permissionDecisionReason", "")

proj = os.path.abspath(".")
fails = 0
print("=== project hook: tripwire precision ===")
for name, cmd, want in CASES:
    got, why = run(HOOK_PROJ, cmd, {"CLAUDE_PROJECT_DIR": proj})
    ok = "PASS" if got == want else "FAIL"
    if got != want: fails += 1
    print(f"  [{ok}] {name:36s} want={want:5s} got={got}")

# The user-global copy is optional: it covers OTHER repos, and a fresh clone of
# this one has no reason to have it. Skip rather than fail when it is absent.
if os.path.exists(HOOK_GLOB):
    print("\n=== global hook defers to the project copy (no double gh call) ===")
    got, _ = run(HOOK_GLOB, CASES[0][1], {"CLAUDE_PROJECT_DIR": proj})
    ok = "PASS" if got == "allow" else "FAIL"
    if got != "allow": fails += 1
    print(f"  [{ok}] inside a repo shipping its own hook   want=allow got={got}")

    print("\n=== global hook still enforces where there is no project copy ===")
    got, _ = run(HOOK_GLOB, CASES[0][1], {"CLAUDE_PROJECT_DIR": "/tmp"})
    ok = "PASS" if got == "deny" else "FAIL"
    if got != "deny": fails += 1
    print(f"  [{ok}] CLAUDE_PROJECT_DIR without a hook     want=deny  got={got}")

    import filecmp
    same = filecmp.cmp(HOOK_PROJ, HOOK_GLOB, shallow=False)
    ok = "PASS" if same else "FAIL"
    if not same: fails += 1
    print(f"\n=== the two copies have not drifted ===\n  [{ok}] project and global hook are byte-identical")
else:
    print("\n=== global hook not installed — skipping cross-copy checks ===")
    print("  [SKIP] this repo's own hook is what protects this repo; the global")
    print("         copy only matters for repos that ship none.")

print("\n=== fail-open safety ===")
for label, payload in [("malformed json", "not json"), ("empty stdin", "")]:
    r = subprocess.run(["bash", HOOK_PROJ], input=payload, capture_output=True, text=True)
    try:
        d = json.loads(r.stdout)["hookSpecificOutput"].get("permissionDecision", "allow")
    except Exception:
        d = "PARSE-FAIL"
    ok = "PASS" if d == "allow" else "FAIL"
    if d != "allow": fails += 1
    print(f"  [{ok}] {label:36s} want=allow got={d}")

print(f"\n{'ALL PASS' if fails == 0 else str(fails) + ' FAILURE(S)'}")
sys.exit(1 if fails else 0)
