# matrix-corpus scripts (no longer a skill)

The `matrix-classification-audit` skill and its multi-agent workflow were retired: they
were written against `Papers.md` as the source of truth, which stopped being true when
the SQLite authoring backend landed (#78 / PR #85). The structured catalog is now
authored in `site/db/ndjson/`, direct edits to the generated Markdown are blocked by
`.claude/hooks/block-generated-edits.py`, and CI fails on drift — so the workflow's
integration path no longer exists. See git history for the retired SKILL.md and
`.claude/workflows/matrix-classification-audit.js`.

These four scripts survive because they are **stdlib-only and zero-token**, and remain
useful on their own. This directory intentionally has no `SKILL.md`, so it does not
register as a skill.

| Script | What it does |
|---|---|
| `extract_matrix_corpus.py` | Parses matrix-participating refs out of `Papers.md`, matches each to the Zotero group libraries by DOI, and pulls methods-section text from the local PDF full-text cache. Emits `matrix-corpus.json` + per-ref files (both gitignored), each carrying a `has_fulltext` flag. |
| `prefilter_corpus.py` | Deterministic pass that auto-clears lexically-obvious placements and emits the residual needing human judgment. Never auto-clears deep-learning / agent / foundation-model rows. |
| `skim_to_audit_ids.py` | Glue that validates skim batches and emits a deduped id list. Only useful with the retired workflow. |
| `verify_routing.mjs` | Routing checks. |

## Usage

Requires Zotero desktop running with "Allow other applications" enabled
(Preferences → Advanced), local API at `http://localhost:23119`.

```bash
python3 .claude/skills/matrix-classification-audit/extract_matrix_corpus.py
```

`extract_matrix_corpus.py` imports Zotero API helpers from the sibling
`zotero-collection-scope/scope.py` via a relative path, which is why it stays under
`.claude/skills/`. Don't relocate it without patching that import.

## Known state (2026-08-08)

Last run: **229 matrix-participating refs, 222 with full text (97%)**. Seven lack usable
text: 2 have a PDF with no full-text cache, 5 are not in Zotero at all. They are refs
**52, 167, 195, 289, 290, 309, 310** — four in AI Tooling, two in Scaffolding, one in
Sensory Prediction.

**Wave 3b (249–277) is 29/29.** Those PDFs were acquired on 2026-07-21.

> **This block is a snapshot and goes stale the moment anyone adds a PDF. Trust the
> script's output over this table.** The previous version of this section claimed
> `Wave 3b 0/29 (0%)` and was still saying so on 2026-08-08, three weeks after
> `matrix-corpus.json` was regenerated showing 29/29. That stale number was read as a
> live one and turned a solved problem back into a feared one. If you are deciding
> whether work is needed, run the script; it prints the real figures in about a minute.

**`has_fulltext` measures availability, not verification.** A ref can have its PDF
attached and still carry a placement nobody checked against the methods section. The
Wave 3b tranche is exactly that case: classified from abstracts, PDFs added afterwards,
never re-audited. This script is the mechanical half of an audit and cannot tell you
which placements were actually read.
