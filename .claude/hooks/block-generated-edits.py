#!/usr/bin/env python3
"""PreToolUse guard (issue #78) on the root catalog files, Papers.md / Software.md /
Databases.md / FieldReports.md (CATALOG below), whose structured content is GENERATED
from the SQLite authoring DB: `db:emit` regenerates it, so a direct edit there is not
safe. This refuses every whole-file Write to one of them, and any Edit or MultiEdit
whose old or new text contains one of MARKERS below, and steers to the DB workflow. An
exact catalog name below the root, outside site/, docs/ and .claude/, is refused the same
way (see fold). Prose around that content (a page's intro, a group's intro) is hand-authored and passed
through verbatim by `db:emit`, which is why an Edit with no marker is allowed.

That is less than the DB owns, and nothing else here stops the rest. The rule is the
whole account: an Edit or MultiEdit whose text carries no marker passes, whatever it
changes, and an edit made with any other tool (a `sed` run through Bash, for one) is never
seen, as .claude/settings.json registers this hook for Edit, Write and MultiEdit alone.
Every page under Datasets/ passes too, since this guard does not check them, though their
inventory tables and curated entries are DB-owned. Examples of DB-owned text that passes:
an entry's body (a catalog Summary: line, a field report's text), a reference's citation,
DOI and `> **Code**:` or notice lines, and the matrix's row and column labels. The CI sync
guard, which fails on any
difference between the committed Markdown and what `db:emit` writes, is the backstop for
all of it; this is the fast local reminder for the structural edits."""
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
# Why it fired, by tool; the path-based reasons are the outside and variant lines above.
# The markers are printed from MARKERS, so the message cannot name a set the guard does
# not match, and the sentence after it refers back to them.
markers = ", ".join(f"`{m}`" for m in MARKERS)
fired = (
    "This fired because the change is a whole-file Write, which this guard refuses "
    f"whatever it holds; it refuses an Edit only when its text contains one of {markers}."
    if tool == "Write" else
    f"This fired because the edit's text contains one of {markers}."
)
reason = outside + variant + (
    f"{name} is generated from the SQLite authoring DB (issue #78): its matrix, "
    "references and catalog entries are DB-owned, and `db:emit` regenerates them, so a "
    "direct edit here is not safe and the CI sync guard fails on the drift.\n"
    "To change structured content, take ONE of these two routes, and do not mix them:\n"
    "  A. `pnpm --dir site db:build` (materializes site/caail.db from the NDJSON), edit site/caail.db, "
    "then `pnpm --dir site db:export && pnpm --dir site db:emit`.\n"
    "  B. edit the relevant site/db/ndjson/*.ndjson directly, then `pnpm --dir site db:emit` alone. "
    "Skip db:export here: it rewrites every NDJSON file from caail.db, which would revert the edit.\n"
    "Then, after either route, run every gate in step 5 of the caail-db-authoring skill's "
    "Procedure, and commit the Markdown, the NDJSON, site/db/corpus-stamp.json (db:emit "
    "re-stamps it) and what parse changed under site/public/ together, as its step 6 says.\n"
    + fired +
    " An Edit that contains none of them gets past this guard, but if it changes other "
    "DB-owned text, such as an entry's body or a reference's citation, it is not safe "
    "either: `db:emit` regenerates that text from the DB, and the CI sync guard fails on "
    "any difference. Prose around the structure, such as a page's or a group's intro, is "
    "hand-authored: to edit it, narrow the Edit so its text carries none of these markers."
)
print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": reason,
}}))
sys.exit(0)
