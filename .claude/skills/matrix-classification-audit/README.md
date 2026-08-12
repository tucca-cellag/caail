# matrix-corpus scripts (no longer a skill)

The `matrix-classification-audit` skill and its multi-agent workflow were retired: they
were written against `Papers.md` as the source of truth, which stopped being true when
the SQLite authoring backend landed (#78 / PR #85). The structured catalog is now
authored in `site/db/ndjson/`, direct edits to the generated Markdown are blocked by
`.claude/hooks/block-generated-edits.py`, and CI fails on drift — so the workflow's
integration path no longer exists. See git history for the retired SKILL.md and
`.claude/workflows/matrix-classification-audit.js`.

These scripts survive because they are useful on their own. This directory intentionally
has no `SKILL.md`, so it does not register as a skill. Everything except the Docling
ingest is **stdlib-only and zero-token**.

| Script | What it does |
|---|---|
| `extract_matrix_corpus.py` | Parses matrix-participating refs out of `Papers.md`, matches each to the Zotero group libraries by DOI, and pulls methods-section text. Prefers a `docling-corpus/` section when one exists and falls back to the flat full-text cache. Emits `matrix-corpus.json` + per-ref files (both gitignored). |
| `docling_ingest.py` | **Opt-in batch job.** Converts every corpus PDF to a `DoclingDocument` and locates each paper's methods section against its real heading structure. Writes the gitignored `docling-corpus/`. Needs `docling`; resumable. |
| `docling_sections.py` | Pure function: ordered heading list → the methods span. No Docling, no PDF, no network, so it is unit-testable. |
| `docling_sections.test.py` | Runs `docling_sections` against real heading lists from the corpus, and shows the old regex failing the same inputs. `python3 …/docling_sections.test.py` |
| `measure_extraction_quality.py` | Prints how good the extraction currently is, by calling the code being measured rather than restating its rules. Run this instead of trusting any number written down. |
| `compare_extraction.py` | Ranks matrix refs by how much the evidence a curator reads has changed between the old window and the located section. Input to the CAAIL-203 re-audit: it says where to look, not what is wrong. |
| `audit_sections.py` | Quality report over the located sections, split by population. Recomputes spans with the current rule, so a vocabulary change is visible before committing to a `--respan`. |
| `show_headings.py` | Curator view of one ref: every heading Docling found, with the located section's start and end marked. `show_headings.py 51` |
| `testdata/make_fixtures.py` | Regenerates the test fixtures from the ingest output. |
| `prefilter_corpus.py` | Deterministic pass that auto-clears lexically-obvious placements and emits the residual needing human judgment. Never auto-clears deep-learning / agent / foundation-model rows. |
| `skim_to_audit_ids.py` | Glue that validates skim batches and emits a deduped id list. Only useful with the retired workflow. |
| `verify_routing.mjs` | Routing checks. |

## The Docling ingest (CAAIL-206)

`extract_matrix_corpus.py` originally read Zotero's flat `.zotero-ft-cache` text and took
a fixed 12,000-character window from the first methods-like heading. That approach has no
end boundary and cannot get one, because the flat cache has already discarded the
structure that says where a section stops.

Run the ingest once, then every later curation pass reads real section boundaries:

```bash
# Needs docling. Keep it out of the base interpreter.
uv run --python 3.12 --with docling \
    python .claude/skills/matrix-classification-audit/docling_ingest.py

# Then, as before -- it now prefers docling-corpus/ automatically.
python3 .claude/skills/matrix-classification-audit/extract_matrix_corpus.py
```

The ingest is resumable: a ref whose `sections/` file exists is skipped, so an
interrupted run is restarted with the same command.

**After changing the section rule, re-span rather than re-ingest.** `docs/` is the durable
artifact and `sections/` is derived from it, so improving `docling_sections.py` costs
seconds instead of another full conversion:

```bash
uv run --python 3.12 --with docling \
    python .claude/skills/matrix-classification-audit/docling_ingest.py --respan
```

It prints every ref whose strategy changed, so a rule change is reviewable rather than
taken on faith. Regenerate the test fixtures afterwards with `testdata/make_fixtures.py`
and re-run `docling_sections.test.py`.

The rule will keep needing this. Every few papers introduce a convention nobody
anticipated: `Online Methods` in the back matter, `Main` where Nature means introduction,
a section named after the algorithm. That is a property of the literature, not a defect to
be finished off.

Records gain `methods_source` (`docling` / `ftcache`), `methods_strategy`,
`methods_heading`, `methods_end_heading`, `methods_pages` and `methods_truncated`.
**Weigh evidence by these**: a `ftcache` section may be cut mid-sentence and may run well
past the end of the real methods section; a `docling` one does neither.

**Licensing.** `docling-corpus/` holds full text of works CAAIL may read but may not
redistribute. It is gitignored and stays local — the *local curation tier* of CAAIL-169.
Anything that publishes text (the agent API, the chat widget, a public index) must filter
on `licenseTier ∈ {permissive, copyleft}` (131 works), never on `is_oa` (~74%).

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

**What `has_fulltext` covers.** It means usable full-text evidence from *either* source.
It used to mean ft-cache availability alone; a Docling section is derived from the PDF,
so it exists for a ref whose ft-cache is missing, and leaving the flag False there would
have hidden a complete methods section from every consumer that filters on it.
`fulltext_chars` still carries the ft-cache length specifically, so the two remain
separable.

## Extraction quality, snapshot 2026-08-12

Measured over the 222 matrix refs that have full text. **`measure_extraction_quality.py`
prints these live — read it, not this block.**

| | ft-cache path | with the Docling ingest |
|---|---|---|
| methods heading found | 201 (91%) | 195 explicit + 22 positional = **217 (98%)** |
| positional fallback | 21 (9%) | 2 of those 21 remain |
| **truncated at the 12,000-char window** | **213 (96%)** | **4** |
| characters beyond the window's reach | 8,938,492 | — |
| sections larger than the old window | — | 118, i.e. 118 papers were being cut off |

Median located section: 13,039 chars; largest 93,826. Full ingest: 303 documents,
301 converted in 88 minutes on CPU with no failures, 155 MB.

Two things worth knowing about that 96%, because both have already caused a wrong number
to be written down:

* **It is not 72%.** Only 159 refs land at *exactly* 12,000 characters, and an earlier
  measurement counted those. `extract_methods` strips its return value, so a cut landing
  next to whitespace yields 11,99x and an `== METHODS_WINDOW` test misses it. 54 refs sit
  in that gap.
* **Truncation is not the only defect, and not the worst one.** A paper that puts
  `Online Methods` in the back matter (ref 51: page 22 of 34) gets a window taken from
  10% into the document that contains *none* of the methods. Start detection fails there,
  not just the end boundary. Non-standard names (`Implementation`, `Experiment`) and roman
  numerals (`II. GENETIC ALGORITHM`) are the other two.

### What "unresolved" counts

`audit_sections.py` reports unresolved refs **split by population**, and the split matters
more than the total. Over the full corpus 24 refs resolve to no methods section, but 19 of
those are Reviews & Perspectives entries or Reference Work chapters, which have no methods
section because of what they are. Counting them overstates the gap five-fold and points at
work that does not exist.

The number that means something is **5 of 222 matrix refs**, and none of the five is a
naming problem: their PDFs contain no methods section at all, because the methods are in a
supplementary document nobody acquired. Refs 14 and 80 are *Science* research articles
whose only "Materials and Methods" string is the supplement URL; 48 and 133 are Nature
Correspondence pieces; 224 cites "Methods Sec. 4.5" in a supplement. They are recorded on
CAAIL-246, and they fall through to the ft-cache path meanwhile.
