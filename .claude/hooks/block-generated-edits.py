#!/usr/bin/env python3
"""PreToolUse guard (issue #78): the structured catalog in Papers.md / Software.md /
Databases.md is GENERATED from the SQLite authoring DB. Direct edits to that
structured content (matrix cells, references, catalog entries) drift from the DB and
are clobbered on the next `db:emit`, so this blocks them and steers to the DB
workflow. Surrounding prose is preserved verbatim by db:emit, so prose-only edits are
allowed through; whole-file Writes are always blocked. The CI sync guard is the
backstop — this is the fast local reminder."""
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

# Only the repo-root generated catalog files (not site/*, docs/*, .claude/*).
if "/site/" in fp or "/docs/" in fp or "/.claude/" in fp:
    sys.exit(0)
if not re.search(r"(^|/)(Papers|Software|Databases)\.md$", fp):
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
    "  3. `pnpm --dir site db:export && pnpm --dir site db:emit`\n"
    "  4. `pnpm --dir site db:check && pnpm --dir site db:verify`, then commit MD + NDJSON together.\n"
    "See the caail-db-authoring skill. (Prose-only edits to these files are allowed; "
    "this fired because the change touches structured markup.)"
)
print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": reason,
}}))
sys.exit(0)
