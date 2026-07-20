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

## Known state (2026-07-20)

Last run: 195 matrix-participating refs, **155 with full text (79%)**. Coverage is
strongly banded by ingest date, not age:

| Band | Full text |
|---|---|
| Legacy 1–152 | 105/108 (97%) |
| 153–248 | 50/55 (91%) |
| Wave 3b 249–277 | 0/29 (0%) |
| 278+ | 0/3 (0%) |

The Wave 3b tranche (PR #66) was landed from gap-analysis output and classified from
abstracts; those 29 papers are not in the Zotero libraries with attached PDFs. Ten of
them sit in Bioprocess & Scale-Up. Re-run the extract after the PDFs are added.
