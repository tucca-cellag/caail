#!/usr/bin/env python3
"""Exercise check-public-publish.sh without putting its trigger strings on a
Bash command line (which the hook itself would, correctly, intercept)."""
import json, subprocess, sys, os, shutil, tempfile

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

BASH = shutil.which("bash") or "/bin/bash"

def run(hook, cmd, env=None, cwd=None, unset=()):
    """Returns (decision, reason, context).

    `context` is asserted on as much as `decision` below: this guard's worst
    failure is being absent while looking present, so what it SAYS on the allow
    path is part of its behaviour, not decoration.
    """
    e = dict(os.environ); e.update(env or {})
    for k in unset: e.pop(k, None)
    r = subprocess.run([BASH, hook], input=json.dumps({"tool_input": {"command": cmd}}),
                       capture_output=True, text=True, env=e, cwd=cwd)
    try:
        out = json.loads(r.stdout)["hookSpecificOutput"]
    except Exception:
        return "PARSE-FAIL", r.stdout[:120], ""
    return (out.get("permissionDecision", "allow"),
            out.get("permissionDecisionReason", ""),
            out.get("additionalContext", ""))

proj = os.path.abspath(".")
fails = 0
print("=== project hook: tripwire precision ===")
for name, cmd, want in CASES:
    got, why, _ = run(HOOK_PROJ, cmd, {"CLAUDE_PROJECT_DIR": proj})
    ok = "PASS" if got == want else "FAIL"
    if got != want: fails += 1
    print(f"  [{ok}] {name:36s} want={want:5s} got={got}")

# The user-global copy is optional: it covers OTHER repos, and a fresh clone of
# this one has no reason to have it. Skip rather than fail when it is absent.
if os.path.exists(HOOK_GLOB):
    print("\n=== global hook defers to the project copy (no double gh call) ===")
    got, _, _ = run(HOOK_GLOB, CASES[0][1], {"CLAUDE_PROJECT_DIR": proj})
    ok = "PASS" if got == "allow" else "FAIL"
    if got != "allow": fails += 1
    print(f"  [{ok}] inside a repo shipping its own hook   want=allow got={got}")

    print("\n=== global hook still enforces where there is no project copy ===")
    got, _, _ = run(HOOK_GLOB, CASES[0][1], {"CLAUDE_PROJECT_DIR": "/tmp"})
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
    got, _, _ = run(HOOK_PROJ, into_this_repo, {"CLAUDE_PROJECT_DIR": proj}, cwd=where)
    ok = "PASS" if got == "deny" else "FAIL"
    if got != "deny": fails += 1
    print(f"  [{ok}] risky publish INTO this repo, run {label:14s} want=deny  got={got}")

# The mirror case. A cd we cannot follow is not "no repo here": it cannot be
# ruled public, so it stays denied on risk. Waving it through would move the hole
# rather than close it, and the reason must not claim a visibility it never read.
got, why, _ = run(HOOK_PROJ, f'cd /nonexistent-{os.getpid()} && {V} --title x --body "{RISK}"',
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

# --- a destination gh could not READ is announced, never waved through -------
# The measured defect: with `gh` unauthenticated, `gh repo view` returns nothing,
# no PUBLIC verdict follows, and the hook emits the SAME empty pass-through it
# emits for "resolved it, the repo is private, carry on". Three of the eight
# tripwire cases above flipped deny -> allow, and nothing said so.
#
# Both halves are asserted, because either alone is worth little: the verdict has
# to survive the outage, AND the outage has to be stated. A guard that quietly
# stops guarding is worse than an absent one, because it is still being priced
# into the decision.
print("\n=== a destination gh cannot read: verdicts hold, and it says so ===")

tmp = tempfile.mkdtemp(prefix="caail-publish-guard-")

no_auth_cfg = os.path.join(tmp, "empty-gh-config"); os.makedirs(no_auth_cfg)
NO_AUTH = {"GH_CONFIG_DIR": no_auth_cfg}
NO_TOKENS = ("GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN")

# One variable at a time. Emptying PATH to hide `gh` would hide jq, grep and
# timeout with it, and the hook would then be failing for four reasons at once;
# this PATH keeps everything the hook needs except the one thing under test.
no_gh_bin = os.path.join(tmp, "bin"); os.makedirs(no_gh_bin)
for tool in ("cat", "jq", "shasum", "cut", "find", "grep", "timeout", "sed", "awk",
             "tr", "head", "paste", "sort", "dirname", "basename", "rm", "env"):
    src = shutil.which(tool)
    if src: os.symlink(src, os.path.join(no_gh_bin, tool))
NO_GH = {"PATH": no_gh_bin}

# label, env, a phrase the hook must name as the cause. The two causes are
# genuinely different news: `gh` absent is a fresh clone and expected, `gh`
# present and unable to log in is a machine that was guarding yesterday.
OUTAGES = [
    ("gh unauthenticated", {**NO_AUTH, "CLAUDE_PROJECT_DIR": proj}, "gh auth status"),
    ("gh not installed",   {**NO_GH,   "CLAUDE_PROJECT_DIR": proj}, "not installed"),
]

for label, env, cause in OUTAGES:
    for name, cmd, want in CASES:
        got, _, _ = run(HOOK_PROJ, cmd, env, cwd=proj, unset=NO_TOKENS)
        ok = "PASS" if got == want else "FAIL"
        if got != want: fails += 1
        print(f"  [{ok}] {label}: {name:33s} want={want:5s} got={got}")

    _, why, _ = run(HOOK_PROJ, CASES[0][1], env, cwd=proj, unset=NO_TOKENS)
    named = "UNRESOLVED" in why and cause in why and "(PUBLIC)" not in why
    ok = "PASS" if named else "FAIL"
    if not named: fails += 1
    print(f"  [{ok}] {label}: the deny names the cause ({cause})")

    # The allow path is where the silence actually lived, so it is asserted too.
    got, _, ctx = run(HOOK_PROJ, CASES[1][1], env, cwd=proj, unset=NO_TOKENS)
    said = got == "allow" and "could NOT resolve" in ctx
    ok = "PASS" if said else "FAIL"
    if not said: fails += 1
    print(f"  [{ok}] {label}: ordinary publish allowed AND the gap announced")

# The contrast. Without this, "announces something" would pass for both states,
# and the announcement would stop carrying information.
got, _, ctx = run(HOOK_PROJ, CASES[1][1], {"CLAUDE_PROJECT_DIR": proj}, cwd=proj)
resolved = got == "allow" and "which is PUBLIC" in ctx
ok = "PASS" if resolved else "FAIL"
if not resolved: fails += 1
print(f"  [{ok}] a destination it CAN read is announced as read, not as degraded")

# An unresolved destination has no owner, so the foreign-owner signal cannot call
# a reference "another owner's" repo. Measured: with an empty owner the signal
# still fires, which is the safe direction and stays. What it must not do is
# dress an owner it never compared up as one it did.
got, why, _ = run(HOOK_PROJ,
                  f'cd /nonexistent-{os.getpid()} && {V} --title x '
                  '--body "context: https://github.com/someoneelse/theirrepo"',
                  {"CLAUDE_PROJECT_DIR": proj}, cwd=proj)
honest = got == "deny" and "another owner" not in why
ok = "PASS" if honest else "FAIL"
if not honest: fails += 1
print(f"  [{ok}] an owner it never compared is not reported as another owner's")

shutil.rmtree(tmp, ignore_errors=True)

print("\n=== fail-open safety ===")
for label, payload in [("malformed json", "not json"), ("empty stdin", "")]:
    r = subprocess.run([BASH, HOOK_PROJ], input=payload, capture_output=True, text=True)
    try:
        d = json.loads(r.stdout)["hookSpecificOutput"].get("permissionDecision", "allow")
    except Exception:
        d = "PARSE-FAIL"
    ok = "PASS" if d == "allow" else "FAIL"
    if d != "allow": fails += 1
    print(f"  [{ok}] {label:36s} want=allow got={d}")

print(f"\n{'ALL PASS' if fails == 0 else str(fails) + ' FAILURE(S)'}")
sys.exit(1 if fails else 0)
