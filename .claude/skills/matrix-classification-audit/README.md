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
| `extract_accessions.py` | Pulls deposit accessions and code repos out of each paper's *bounded* availability statement, and labels each one deposit / reuse / unclear. Being inside an availability statement is not enough to call something a deposit. |
| `fetch_accession_citations.py` | **The only networked script here.** Asks each registry which paper its record belongs to, so the label above rests on a fact rather than a sentence. Writes a cache the extractor then reads offline. |
| `extract_accessions.test.py` | Guards the pure half of that chain: accession patterns, sentence cues, title joins, cache schema. Needs no corpus and no network, so CI runs it. |
| `norm_url.test.py` | Guards `_norm_url`, the join between a `Papers.md` ref and its Zotero item. Fragments are stripped and query strings are not, which is the difference between finding ref 52 and reporting a paper you already hold as missing. No corpus, no network. |
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

## Accession provenance (CAAIL-259)

An accession in a paper is not evidence of a deposit. Availability statements
routinely announce *reused* data — "single-cell datasets were obtained from
GSE81076, GSE85241 and E-MTAB-5061" — and ref 54 lists 23 GEO accessions in a
table of data sources, none of them its own. A pass that treats every accession
as a deposit reports papers' bibliographies as gaps in CAAIL's inventory.

So each accession is labelled, and the label carries how it was decided:

| decided by | what it means |
|---|---|
| `registry` | the record's own linked PubMed id / DOI settled it. A fact about the record. |
| `registry (title join)` | the record was matched to the paper by title, because one side has no PubMed id. Weaker. Read these. |
| `registry-silent` | the record exists and names no paper. Common for a recent deposit; not evidence either way. |
| `registry (no such record)` | the token is not an accession at all. |
| `sentence` | no registry answer, so the reading of the surrounding clause stands. A guess, and reported as one. |

```bash
python3 .claude/skills/matrix-classification-audit/extract_accessions.py --json docling-corpus/accessions.json
python3 .claude/skills/matrix-classification-audit/fetch_accession_citations.py   # networked, opt-in
python3 .claude/skills/matrix-classification-audit/extract_accessions.py --orphans
```

Four things here are worth not rediscovering:

* **The verdict belongs to the (paper, accession) pair, not the accession.**
  `GSE118480` is ref 115's deposit and ref 5's reuse. A cache keyed by accession
  alone stores one answer and hands it to both papers.
* **A token the registry has never heard of is a typesetting defect, not a gap.**
  Ref 5 declares `GSE727857`; the paper means Paul et al.'s `GSE72857`, with a
  digit duplicated. "No such record" and "record names no paper" are different
  answers and were once the same one.
* **Most Zenodo DOIs in an availability statement are code, not data** — GitHub
  release archives minted by the GitHub–Zenodo integration. They are the paper's
  own deposit, and they belong beside the reference as `> **Code**:` rather than
  in `Datasets/`, so `--orphans` lists them separately.
* **Ownership language outranks access language.** "The human monocyte data
  generated by us can be downloaded from GEO (GSE146974)" names both who made
  the data and where a reader gets it; only the first is evidence about
  provenance. Weighing the two equally called ref 5's own deposit unclear.

* **A 404 is not always an answer.** BioStudies 404s for every `E-HCAD-…`
  accession including `E-HCAD-1`, so a 404 there means "not served at this
  endpoint", not "no such study". Reading it as the latter files a coverage gap
  as a typo in the paper.
* **The orphan check reads the curated content, not the repo.** This README
  quotes real accessions as examples, and an unscoped `git grep` counted one of
  those quotes as evidence that CAAIL inventories `GSE146974`.

dbGaP has no id-level lookup here: E-utilities answers `Invalid db name
specified: gap`. Dryad, PRIDE, MassIVE, Metabolights, EGA and PDB have no
resolver because no accession in the corpus exercises one, and network-parsing
code that has never run is not coverage.

**Snapshot 2026-08-12 — run the commands above for live figures.** 144
accessions across 63 refs: 93 reuse, 16 deposit, 34 unclear, 1 not an accession.
The registry settles 92 and is honestly silent on 49; 21 rest on a title join,
and **2** on the sentence. Six deposits are absent from CAAIL's curated content
(refs 5, 85, 91, 116, 235, 263) plus two code archives (refs 117, 118). Whether
any of them belongs is a curation judgement about scope, which this cannot make.

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
