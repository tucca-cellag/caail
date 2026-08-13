#!/usr/bin/env python3
"""Exercise check-public-publish.sh without putting its trigger strings on a
Bash command line (which the hook itself would, correctly, intercept)."""
import json, subprocess, sys, os

HOOK_PROJ = os.path.abspath(".claude/hooks/check-public-publish.sh")
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

def run(hook, cmd, env=None, cwd=None):
    e = dict(os.environ); e.update(env or {})
    r = subprocess.run(["bash", hook], input=json.dumps({"tool_input": {"command": cmd}}),
                       capture_output=True, text=True, env=e, cwd=cwd)
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

# --- the destination is the command's, not the hook's cwd -------------------
# The hook runs BEFORE the command, in the session's directory. A command that
# does `cd <elsewhere> && <publish>` publishes to <elsewhere>'s repo. Resolving
# from the hook's own cwd got that backwards in both directions, and one of them
# was the guard vanishing: from a private cwd, a risky publish into THIS public
# repo passed through with no announcement and no payload scan. The verdict must
# depend on the command, never on where the caller happened to be standing.
print("\n=== destination is the command's, not the hook's cwd ===")
elsewhere = next(d for d in ("/tmp", os.path.expanduser("~"))
                 if os.path.isdir(d) and os.path.abspath(d) != proj)

into_this_repo = f'cd {proj} && {V} --title x --body "{RISK}"'
for label, where in (("from this repo", proj), ("from elsewhere", elsewhere)):
    got, _ = run(HOOK_PROJ, into_this_repo, {"CLAUDE_PROJECT_DIR": proj}, cwd=where)
    ok = "PASS" if got == "deny" else "FAIL"
    if got != "deny": fails += 1
    print(f"  [{ok}] risky publish INTO this repo, run {label:14s} want=deny  got={got}")

# The mirror case. A cd we cannot follow is not "no repo here": it cannot be
# ruled public, so it stays denied on risk. Waving it through would move the hole
# rather than close it, and the reason must not claim a visibility it never read.
got, why = run(HOOK_PROJ, f'cd /nonexistent-{os.getpid()} && {V} --title x --body "{RISK}"',
               {"CLAUDE_PROJECT_DIR": proj}, cwd=proj)
ok = "PASS" if got == "deny" else "FAIL"
if got != "deny": fails += 1
print(f"  [{ok}] risky publish after an unresolvable cd   want=deny  got={got}")
# Both halves matter: it must SAY the destination is unresolved, and it must not
# assert a visibility it never read. Claiming PUBLIC would be a fresh false claim
# inside the fix for a false claim.
honest = "UNRESOLVED" in why and "(PUBLIC)" not in why
ok = "PASS" if honest else "FAIL"
if not honest: fails += 1
print(f"  [{ok}] and it says UNRESOLVED rather than claiming the destination is PUBLIC")

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
