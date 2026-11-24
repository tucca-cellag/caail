#!/usr/bin/env python3
"""PreToolUse guard (issue #78): the structured catalog in Papers.md / Software.md /
Databases.md / FieldReports.md is GENERATED from the SQLite authoring DB. Direct edits
to that structured content (matrix cells, references, catalog entries, field-report
entries) drift from the DB and are clobbered on the next `db:emit`, so this blocks them
and steers to the DB workflow. Surrounding prose is preserved verbatim by db:emit, so
prose-only edits are allowed through; whole-file Writes are always blocked. The CI sync
guard is the backstop — this is the fast local reminder."""
import json
import os
import re
import sys
import unicodedata

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

tool = data.get("tool_name", "")
ti = data.get("tool_input", {}) or {}
fp = ti.get("file_path", "") or ""
if not fp:
    sys.exit(0)

# Classify the path by where it sits INSIDE its checkout, never by the directories
# above the checkout. This once substring-matched "/site/", "/docs/" and "/.claude/"
# against the absolute path, so a clone that itself lived under such a directory
# (~/docs/caail, ~/site/caail) had the guard off for every file, with no signal.
#
# A checkout's root is the nearest directory above the file that carries this hook
# at .claude/hooks/, as every clone and every git worktree of this repo does. That
# finds the file's own checkout whichever copy of the hook is running, and needs no
# .git, so a checkout without one is judged the same. abspath also folds "..", so
# <repo>/site/../Papers.md is judged as <repo>/Papers.md.
#
# A relative path is resolved against the session's working directory, the "cwd"
# field every hook input carries, so the hook judges the path the tool is given from
# the directory the tool resolves it against, not from whichever directory this
# process happened to start in. Symlinks are not resolved: a path is judged as written.
HOOK_REL = os.path.join(".claude", "hooks", os.path.basename(__file__))
path = os.path.abspath(os.path.join(data.get("cwd") or os.getcwd(), os.path.expanduser(fp)))

CATALOG = ("Papers.md", "Software.md", "Databases.md", "FieldReports.md")


def fold(name):
    """A file name as macOS's default disk (APFS) compares it.

    APFS opens papers.md as Papers.md, so a Write to the lowercase name at the
    checkout root replaces the whole generated file. It folds more than ASCII case: it
    also opens "Paperſ.md" (long s) as Papers.md and "ﬁeldReports.md" (fi ligature) as
    FieldReports.md, and it ignores Unicode normalization. str.lower() misses both, and
    re.IGNORECASE misses the ligature, so this uses Unicode's caseless matching,
    NFD(casefold(NFD)). An HFS+ case-insensitive volume compares names by rules of its
    own, which this does not model.

    Only a name at the checkout root (or at a worktree's root, once the worktree prefix
    below is stripped) is folded. Every other rule matches as spelled, exactly as before
    folding existed, so another spelling of a catalog name below the root, in a nested
    checkout holding no copy of this hook, or outside any checkout is not refused.
    """
    return unicodedata.normalize("NFD", unicodedata.normalize("NFD", name).casefold())


CANONICAL = {fold(n): n for n in CATALOG}


def checkout_root(p):
    d = os.path.dirname(p)
    while True:
        if os.path.isfile(os.path.join(d, HOOK_REL)):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


root = checkout_root(path)
if root is None:
    # In no checkout, so there is no inside to classify: judge by the file name
    # alone, failing closed, rather than guess that a site/ or docs/ above the
    # file is the repo's own. Failing open here would also switch the guard off
    # without a word for every path if checkout_root ever stopped finding
    # checkouts, which is the defect this classification exists to remove.
    target = path.replace(os.sep, "/")
else:
    rel = os.path.relpath(path, root).replace(os.sep, "/")
    # Git worktrees live at <repo>/.claude/worktrees/<name>/. One whose directory
    # carries the hook is found by checkout_root as a checkout of its own; one that
    # does not is found from the primary checkout, so strip the worktree prefix and
    # judge the rest, or every file in it would land in the .claude/ exclusion below
    # and the guard would be off in exactly the workspace CLAUDE.md tells you to use.
    rel = re.sub(r"^(?:\.claude/worktrees/[^/]+/)+", "", rel)
    # Only the repo-root generated catalog files (not site/*, docs/*, .claude/*).
    if rel.split("/", 1)[0] in ("site", "docs", ".claude"):
        sys.exit(0)
    target = rel
base = target.rsplit("/", 1)[-1]
if base in CATALOG:
    catalog_name = base
elif root is not None and "/" not in target:
    # A catalog name at the checkout root spelled in another case: a case-insensitive
    # disk opens it as the generated file, so it is refused as that file (see fold).
    catalog_name = CANONICAL.get(fold(base))
else:
    catalog_name = None
if catalog_name is None:
    sys.exit(0)

MARKERS = ('<a id="', '](#', '### [')  # references, matrix/anchor links, catalog H3


def structured(text):
    return any(m in (text or "") for m in MARKERS)


blocked = False
if tool == "Write":
    blocked = True                                   # whole-file rewrite
elif tool == "Edit":
    blocked = structured(ti.get("old_string", "")) or structured(ti.get("new_string", ""))
elif tool == "MultiEdit":
    blocked = any(
        structured(e.get("old_string", "")) or structured(e.get("new_string", ""))
        for e in (ti.get("edits", []) or [])
    )

if not blocked:
    sys.exit(0)

name = catalog_name
typed = os.path.basename(path)
outside = "" if root is not None else (
    f"{path} is in no CAAIL checkout this guard can find (no directory above it holds "
    f"{HOOK_REL}), so it was refused as if it were one of CAAIL's catalog files. The "
    "routes below apply only if it is one.\n"
)
variant = "" if typed == name else (
    f"{typed} was refused as {name}: a case-insensitive disk such as macOS's default "
    "opens one name as the other, so the guard treats them as the same file on every "
    "disk.\n"
)
reason = outside + variant + (
    f"{name} is generated from the SQLite authoring DB (issue #78) — its matrix, "
    "references, and catalog entries are DB-owned, and a direct edit here drifts from "
    "the DB and is overwritten by the next `db:emit` (the CI sync guard will fail).\n"
    "To change structured content, take ONE of these two routes, and do not mix them:\n"
    "  A. `pnpm --dir site db:build` (materializes site/caail.db from the NDJSON), edit site/caail.db, "
    "then `pnpm --dir site db:export && pnpm --dir site db:emit`.\n"
    "  B. edit the relevant site/db/ndjson/*.ndjson directly, then `pnpm --dir site db:emit` alone. "
    "Skip db:export here: it rewrites every NDJSON file from caail.db, which would revert the edit.\n"
    "Then, after either route: `pnpm --dir site db:check && pnpm --dir site db:verify && "
    "pnpm --dir site parse`, and commit the Markdown, the NDJSON, site/db/corpus-stamp.json "
    "(db:emit re-stamps it) and what parse changed under site/public/ together.\n"
    "See the caail-db-authoring skill. (Prose-only edits to these files are allowed; "
    "this fired because the change touches structured markup.)"
)
print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": reason,
}}))
sys.exit(0)
