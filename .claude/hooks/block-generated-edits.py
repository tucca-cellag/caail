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
HOOK_REL = os.path.join(".claude", "hooks", os.path.basename(__file__))
path = os.path.abspath(fp)


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
    # file is the repo's own.
    target = path
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
if not re.search(r"(^|/)(Papers|Software|Databases|FieldReports)\.md$", target):
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

name = os.path.basename(fp)
reason = (
    f"{name} is generated from the SQLite authoring DB (issue #78) — its matrix, "
    "references, and catalog entries are DB-owned, and a direct edit here drifts from "
    "the DB and is overwritten by the next `db:emit` (the CI sync guard will fail).\n"
    "To change structured content: edit the DB, then regenerate —\n"
    "  1. `pnpm --dir site db:build`   (materialize caail.db from NDJSON)\n"
    "  2. edit caail.db  (or the relevant site/db/ndjson/*.ndjson)\n"
    "  3. `pnpm --dir site db:export && pnpm --dir site db:emit`  (both re-stamp site/db/corpus-stamp.json)\n"
    "  4. `pnpm --dir site db:check && pnpm --dir site db:verify && pnpm --dir site parse`, then commit "
    "the Markdown, the NDJSON, site/db/corpus-stamp.json and what parse changed under site/public/ together.\n"
    "See the caail-db-authoring skill. (Prose-only edits to these files are allowed; "
    "this fired because the change touches structured markup.)"
)
print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": reason,
}}))
sys.exit(0)
