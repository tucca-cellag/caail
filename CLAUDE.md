# CAAIL — Project Context for Claude

CAAIL (Cellular Agriculture AI Library) is a **curated, markdown-only resource library** at the intersection of Cellular Agriculture and AI. There is no source code, no build step, no test suite — every file is human-readable Markdown rendered by GitHub.

The repository is owned by [tucca-cellag](https://github.com/tucca-cellag) (Tufts University Center for Cellular Agriculture). Content is licensed under the MIT License; see `LICENSE` and the README for attribution.

## Companion Zotero group library — full-text access for AI agents

The **`caail` Zotero group library (ID `6549203`)** is a private, members-only group library maintained by core TUCCA members. Its purpose is **not** to be an open contribution channel — external contributors suggest entries via GitHub issues / PRs (see `CONTRIBUTING.md`). Its purpose is to give **AI coding agents running on TUCCA member machines** direct access to the full text of papers under consideration.

Why this matters for AI workflows:

- Crossref / arXiv / scite APIs return metadata and (sometimes) abstracts — not full text.
- Accurate classification of a paper into the matrix (AI method × research area) often requires reading the methods section, not just the abstract — especially for papers that combine multiple techniques or apply general-purpose AI agents to a specific cell-ag problem.
- Zotero attached PDFs are full-text-indexed locally. AI agents (Claude Code with the [`benjibromberg/zotero-context`](https://github.com/benjibromberg/zotero-context) plugin, or any client of the local Zotero API at `http://localhost:23119`) can pull excerpts from the actual paper text rather than guessing from titles.

### Access (core TUCCA members only)

- **Membership** is restricted to core TUCCA members. Don't direct external contributors to request access; route them through `CONTRIBUTING.md` instead.
- **Local path (no auth, preferred):** Zotero desktop running with "Allow other applications" enabled (Preferences → Advanced), the caail group synced locally, and the AI agent on the same machine. Endpoint: `http://localhost:23119/api/groups/6549203/...`.
- **Web API path:** a Zotero API key scoped to the caail group (generated at `https://www.zotero.org/settings/keys`), used via `https://api.zotero.org/groups/6549203/...`. Only needed when running an agent off the member's local machine.

### When working on this repo as an AI agent

If you're an AI agent running on a TUCCA member's machine and you need to classify a paper for `Papers.md`:

1. Look up the paper in the caail Zotero library by DOI or title (most papers under consideration will be there).
2. Pull the full text via `get_fulltext` on the attached PDF (or read the PDF directly via the Zotero storage path).
3. Use the methods section to inform the matrix classification — don't rely on the abstract alone.

If the paper isn't in the Zotero library, fall back to Crossref / arXiv / scite for metadata and flag the classification confidence as lower.

### The Zotero ⇄ CAAIL sync workflow

Reconciling the repo against the Zotero libraries is a recurring task covered by four
project skills (in `.claude/skills/`) that form a lifecycle:

1. **`zotero-collection-scope`** (Phase 1 — scope): given a Zotero collection (or set of
   collections), recursively enumerates every item, pulls per-item evidence (DOI, title,
   creators, abstract, data-availability snippet), and cross-references against the repo to
   produce a categorized actionable-vs-already-in-repo report.
2. **`zotero-to-caail-sync`** (Phase 2 — integrate): classifies each gap to its target file,
   drafts the entry in schema-correct form, and routes it through the reviewer subagents
   before commit. The authoritative *workflow* skill — it restates none of this file's schema
   rules; it owns the judgment steps.
3. **`papers-dataset-audit`** (Phase 3 — reverse-audit): for every `Papers.md` ref, checks
   whether its deposit accessions / code repos are actually cited somewhere in the repo, and
   reports ORPHANs (cited paper, missing dataset) for review.
Matrix re-classification (formerly Phase 4) is now a manual curation task. Re-audit a
placement by reading the paper's methods section against the column's `Taxonomy.md`
definition (the trusted scope source; the ResearchAreas pages are AI-assisted and
untrusted), then edit the cell through the DB per `caail-db-authoring`. Two rules carry
over and still hold:

- **Scope removals carry an asymmetric burden.** A general-purpose method is a MOVE to
  *AI Tooling / Methodology*, not a deletion. Removal is only for papers with no
  plausible cell-ag connection.
- **Taxonomy gaps are non-destructive.** When a paper's genuine method or area has no
  matching row/column, keep its current cell and surface a *proposed* new row/column for
  curator decision. New rows and columns (each defined in `Taxonomy.md`, with the
  matrix-header link pointing there) are never auto-added.

`.claude/skills/matrix-classification-audit/` retains the zero-token
`extract_matrix_corpus.py`, which pulls each matrix ref's methods text and reports per-ref
`has_fulltext` — the mechanical half of an audit, and the fastest way to see which
placements are grounded in a paper anyone has read. It reads a **Docling section** where
one exists and falls back to Zotero's flat PDF full-text cache where it does not, so weigh
evidence by the record's `methods_source`: the fallback path has no end boundary and
truncates at 12,000 chars (96% of refs), while a Docling section carries both boundaries
and its page range. Build the Docling side with the opt-in `docling_ingest.py`; run
`measure_extraction_quality.py` for the live figures rather than trusting any written down.
See that directory's `README.md`.

Every drafted or re-audited entry is verified before commit by read-only adversarial reviewer
subagents in `.claude/agents/` — **`caail-citation-reviewer`** (Papers.md bibliographic
fidelity), **`caail-claim-reviewer`** (prose-entry factual claims), and
**`caail-classification-reviewer`** (matrix `method × area` placement, grounded in the paper's
methods section) — which an entry must pass before it lands. The agent that wrote or proposed an
entry never reviews it.

### Field-gap analysis (retired as an automated workflow)

The Zotero-sync lifecycle above reconciles the repo against *our Zotero library*. A complementary
**field-gap** axis reconciles it against *the published field* — sweeping recent literature, datasets,
software, and databases for resources CAAIL is missing. This ran as a multi-agent workflow
(`caail-gap-analysis`); it has been retired. Its outputs are still live: issues #32, #58, #59, and #61
hold vetted candidate additions, and the ledgers under `manuscript/` record the triage.

**Why it was retired.** Two reasons, both decisive. It fanned ~16 finder agents plus verifiers with no
model override, so every agent ran Opus (~$155/run). And it reasoned about `Papers.md` as the source of
truth, which stopped being true when the SQLite backend landed (#78 / PR #85) — direct edits to the
generated Markdown are now hook-blocked and CI fails on drift, so its integration path no longer exists.

**What replaces it.** Gap-finding is a manual or lightly-assisted curation task; integration follows
`caail-db-authoring`. Two lessons from the retired pipeline are worth keeping, because both produced
real errors:

- **It proposed matrix cells without ever seeing the live matrix.** Confirm every "new row / new column /
  empty cell" claim against the real matrix before acting — most were false alarms and the row usually
  already existed.
- **Bulk tranches landed under-verified.** The Wave 3b tranche (refs 249–277, PR #66) was classified from
  abstracts; none of those 29 papers had full text in Zotero. Get the PDF into the group library and read
  the methods section before assigning a matrix cell.

Integration rules are unchanged: matrix anchor + reference entry in the same commit, IDs assigned at
landing, every entry through the reviewer subagents.

## Repository layout

```text
README.md              Landing page + license/contributing pointers
Papers.md              Peer-reviewed papers (matrix + numbered references)
Software.md            Open-source tools grouped by application area
Datasets/              Train-on data artifacts, organized into per-species pages
  README.md            Directory landing page + species index
  CLAUDE.md            Per-page schema + curation conventions
  Cow.md / Pig.md / Chicken.md / Fish.md / ...   Per-species data pages
  HumanReference.md / CHOReference.md            Cross-species & biopharma reference
  Benchmarks.md        AI/ML benchmark & evaluation datasets
Databases.md           Query/lookup resources (repositories, ontologies, directories)
OtherResources.md      Editorials & opinion + non-funding ecosystem initiatives (centers, consortia)
ReferenceWorks.md      Reference textbooks + Encyclopedia of Meat Sciences (DOI chapter index)
AwesomeLists.md        Curated bibliographies & "awesome lists" (card page w/ GitHub metrics)
Funding.md             Funding organizations + funding opportunities (grant programs)
Talks.md               Curated lectures, talks & webinars (rendered + embedded on the site)
Primers/               Two-audience onboarding hubs (canonical md; media embedded on site)
  README.md            Directory landing + index
  CellAg.md            Cellular agriculture, for AI researchers
  AI.md                AI/ML fundamentals, for cell-ag researchers
ResearchAreas/         Per-area deep-dive pages (the matrix's COLUMN axis). One file per
                       page; the set drifts, so it is deliberately not enumerated here
Methods/               Per-method deep-dive pages (the matrix's ROW axis). Same, plus a
                       CLAUDE.md carrying why a method page must not live in ResearchAreas/
CONTRIBUTING.md        How to add resources (read before editing)
LICENSE                MIT License
```

## Conventions by file

### `Papers.md` — the most important schema

`Papers.md` has **three coordinated parts**:

1. **A 2D matrix table** at the top, for **primary research** applying a specific AI method to a specific cell-ag problem:
   - **Rows** = AI/ML method, spanning classical ML (Bayesian Optimization, Deep Learning, GNN, …) through the foundation-model and agentic families. The live set is whatever `Papers.md` contains — don't re-enumerate it here, it drifts (see #81). Each row label links to its definition in `Taxonomy.md` (the canonical, CAAIL-specific definition of every row and column).
   - **Columns** = research area, each linked to its definition in `Taxonomy.md`. Current columns: Media Optimization, Cellular Engineering, Bioprocess & Scale-Up, Scaffolding, Sensory Prediction, **AI Tooling / Methodology**.
   - **Cells** = comma-separated anchor links to numbered references, e.g. `[2](#2),[3](#3),[15](#15)`.

2. **A `## References` list** below the matrix — *primary research only*:
   - Each reference is anchored: `<a id="N">N</a> Author, A., & Author, B. (YEAR). Title. *Journal, vol*(issue), pp. https://doi.org/...`
   - Citations are **APA style**, journal italicized with `*…*`, DOI as a full `https://doi.org/...` hyperlink.
   - If the paper has associated code, follow the citation with a blockquote on the next line:

     ```markdown
     > **Code**: https://github.com/<owner>/<repo>
     ```

   - If the publisher has issued a **post-publication notice**, record it the same way, under its own DOI. **Use the publisher's own word for the notice as the label** (`Correction`, `Erratum`, `Expression of concern`, `Retraction`), never a generic one:

     ```markdown
     > **Correction**: https://doi.org/<correction-doi>
     ```

     The label is the claim. An expression of concern says the publisher doubts the work and has fixed nothing, so filing one under `Correction` tells every reader the opposite of what was published.

     **The blockquote is DB-owned. Author it through `caail-db-authoring`, never by typing into `Papers.md`.** `db:emit` rebuilds every trailing blockquote from `papers.blockquotes_md`, so a line typed into the Markdown is either deleted by the next emit or reddens the CI sync guard. `block-generated-edits.py` will not catch it either: its markers are `<a id="`, `](#` and `### [`, and a blockquote-only edit contains none of them, so the local guard that exists for this file stays silent. That gap is pinned by the `MARKERS gap` case in `site/scripts/db/hook.test.ts`, which goes red if the tuple ever learns `> **` — so closing the gap forces this sentence to be rewritten rather than left asserting the opposite.

     **Separate multiple blockquote labels with a blank line.** GitHub does not convert a soft break into a line break in a repository file, so two adjacent `>` lines render as a single run-on line — and GitHub is the surface these notices are read on. Every multi-label reference in `Papers.md` follows this convention, and `papers.test.ts` asserts it rather than leaving it to be typed: the parser recovers both labels either way, so without that check nothing at all would notice a run-on line.

     Two things to know before adding one. The site parser lifts only the `Code` and `Data` labels (`site/scripts/parser/papers.ts`), so a notice reaches GitHub and `llms-full.txt` but **not** `api/papers.json` or the Papers Explorer. That gap is tracked as tucca-cellag/caail#202, and the claim is pinned by the `drops a post-publication notice label` case in `site/scripts/parser/papers.test.ts`, which fails if a notice reaches the parsed model. It does not cover every possible fix: one that renders the notice on the card straight from the canonical Markdown would leave the test green, so re-read this paragraph when that issue lands rather than trusting CI alone. And record a notice even when it looks cosmetic: the correction on ref 289 changed a single word of the abstract, 2-fold to 5-fold cross-validation, which is precisely the claim an abstract-only classification would have rested on.

3. **A `## Reviews & Perspectives` section** below `## References` — for review articles, position papers, and commentaries that survey or opine on the field rather than applying a specific method:
   - Same anchor format and APA style as the primary references.
   - **No matrix participation.** Reviews don't get cell anchors in the matrix — they live only in this section.
   - Share the same numeric ID space as primary references (don't restart numbering — a review just gets the next available ID after the latest primary ref).

**Why two sections?** The matrix is built for "AI method × research area" pairs. Reviews and commentaries survey many methods or zoom out to the field as a whole, so forcing them into the matrix either (a) pollutes many cells with the same reference number, or (b) misrepresents what the paper is. The separate section keeps them discoverable without distorting the matrix.

**The `AI Tooling / Methodology` column** is the home for papers about general-purpose AI methods, agents, or tools that *could be applied* to cell-ag but don't yet have a specific application — e.g. a TxAgent or ToolUniverse paper that describes a general biomedical agent framework. When a follow-up paper applies one of these tools to (say) media optimization, that follow-up goes in the appropriate research-area column instead.

**The `LLMs / AI Agents` row** captures large-language-model and agentic-AI methods. This is distinct from "Deep Learning" because LLM agents involve tool use, retrieval, and reasoning architectures that aren't accurately described by the deep-learning row alone.

**Stability rules** (these prevent silently breaking links):

- **Reference IDs are permanent.** Never renumber an existing entry — the matrix points at them by ID and external readers may bookmark anchor URLs.
- **New entries get the next available ID** (max existing ID + 1), regardless of whether they go in `## References` or `## Reviews & Perspectives` — both sections share one ID counter.
- **`papers.ndjson` holds six sections, not two:** References (229), Reviews & Perspectives (74), and four `… Reference Work` sections (42). Only the 229 are matrix-eligible, so label every count with the population it counted — "345 papers" and "papers in the matrix" are different numbers.
- **Every primary-research reference must appear in at least one matrix cell**, otherwise it is unreachable from the matrix view. Reviews & Perspectives entries are exempt — they're reached via the dedicated section.
- **Every matrix anchor link must resolve to an existing reference ID**, otherwise the link 404s within the page.

### `Software.md` and `Databases.md`

Both use the same hierarchical pattern:

```markdown
## <Application area>
Short paragraph framing the area (optional).

### [<Tool/Database name>](<canonical URL>)

Summary: <1–3 sentences describing what it is and how it applies to cell-ag.>
```

- The H3 link target should be the primary canonical home — GitHub for software, the database's own canonical home for databases.
- Keep summaries focused on **how the resource is useful for cellular agriculture**, not just what it generally does.

### The `Datasets/` directory

`Datasets/` is *not* a flat file — it is a directory organized **by species**: one page per cell-ag-relevant species (`Cow.md`, `Pig.md`, `Chicken.md`, `Fish.md`, `Crustacean.md`, `Mollusk.md`, plus sparse extension stubs), two reference pages (`HumanReference.md`, `CHOReference.md`), and one topical page (`Benchmarks.md`). Each per-species page follows a narrative-plus-table schema (editorial intro → featured atlases → GEMs → thematic clusters → complete data-inventory table → curation note → further reading). The directory's own [`Datasets/CLAUDE.md`](./Datasets/CLAUDE.md) is the authoritative description of that schema; [`Datasets/README.md`](./Datasets/README.md) is the landing page and species index.

**The Datasets/ / Databases.md / OtherResources.md split.** CAAIL distinguishes train-on artifacts from query/lookup resources from non-cataloguing context. The categorization rules (also in CONTRIBUTING.md):

1. **Train-on artifacts → the `Datasets/` directory** — ML pretraining corpora, perturbation atlases, GEM model files, and per-species sequencing deposits. Within `Datasets/`, route each entry to its species page (`Cow.md`, `Pig.md`, …), to `HumanReference.md` / `CHOReference.md` for cross-species reference substrate, or to `Benchmarks.md` for AI/ML benchmark datasets.
2. **Query/lookup resources → `Databases.md`** — repositories, ontologies, spectral libraries, structure/compound/pathway databases.
3. **"Database" in the name or any directory/registry/tracker → `Databases.md`** — even when the content is people, companies, or regulation rather than scientific data.
4. **Funding → `Funding.md`** — funding organizations and funding opportunities (grant programs, research-portfolio mechanisms).
5. **Non-funding ecosystem initiatives → `OtherResources.md`** — research centers, consortia, and convening initiatives that conduct or coordinate (rather than fund) the work.
6. **Borderline cases → dual-listed** — full entry in the primary-home file and a short cross-referenced entry in the other (e.g. GNPS).

**Benchmark placement (Paper + Dataset + Database triangle).** AI/ML benchmarks have a distinct artifact shape that resolves the categorization ambiguities above. Apply this rule strictly:

- **Paper** describing the benchmark → `Papers.md` with a `> **Code**:` blockquote anchoring the project's canonical home.
- **The data** (questions / scenarios / spectra / sequences) + any **bundled scoring code shipped with the data** → `Datasets/Benchmarks.md`. Bundled scoring code does *not* get a separate `Software.md` entry — it's part of the dataset distribution.
- **Live leaderboard or continuously-updated results tracker** → `Databases.md` under "Benchmark Leaderboards & Results Trackers" (per rule 3, trackers belong in `Databases.md`).
- **Separately-installable evaluation framework that brings its own data** → `Software.md`. CausalBench is the existing example: a framework that scores models against externally-hosted data (Replogle et al. Perturb-seq) it does not itself distribute. Such frameworks live in `Software.md` and have no `Datasets/` entry. Bundled-data benchmarks (LAB-Bench, BixBench, BLADE, MassSpecGym, ProteinGym) do *not* belong in `Software.md`.

All entries cross-link via the established `Companion to [Papers.md ref #N]` convention. This rule supersedes the more general 5-rule classification above for the specific case of benchmarks — when in doubt, follow this section. Also documented in `CONTRIBUTING.md`.

### `OtherResources.md`, `ReferenceWorks.md`, `AwesomeLists.md`, and `Funding.md`

These four flat, bulleted prose pages hold the educational and contextual material that doesn't belong in the cataloguing files. They were split out of a single overloaded `OtherResources.md`:

- **`OtherResources.md`** — `## Editorials & Opinion` (journal editorials, news features, and commentary on AI in science / cellular agriculture, e.g. unsigned Nature `d41586-`-prefix items — deliberately distinct from `Papers.md`'s `## Reviews & Perspectives`, which is reserved for signed, substantive review and position papers cited as numbered references) and `## Cell-Ag Ecosystem Initiatives` (non-funding research centers, consortia, and convening efforts).
- **`ReferenceWorks.md`** — reference textbooks and multi-volume works (the foundational cell-ag textbook; the *Encyclopedia of Meat Sciences* with a curated, DOI-resolvable chapter index). A **canonical-prose** page: the `### [*Encyclopedia of Meat Sciences*, 3rd edition]` H3 anchor (`#encyclopedia-of-meat-sciences-3rd-edition`) is deep-linked from `Datasets/{Cow,Pig,Chicken}.md` and `ResearchAreas/{Bioprocess,Scaffolding,SensoryPrediction}.md` — keep that H3 text verbatim if editing.
- **`AwesomeLists.md`** — community "awesome lists" / curated bibliographies, as `##` topic groups of `* [owner/repo](github-url) — desc` bullets. **Not** prose-rendered: it's parsed into `awesome-lists.json` and rendered as searchable cards with live GitHub star / last-updated metrics at `/awesome-lists/` (same pattern as Software/Databases — see the site section).
- **`Funding.md`** (route `/funding/`, title "Funding & Grants") — `## Funding Organizations` and `## Funding Opportunities & Programs`.

Each prose page is a flat unordered list (`* [<Title>](<URL>)`); add new `##` sections as categories accumulate rather than overloading an existing list. Newcomer-facing courses and field-overview material live in `Primers/` instead (see below).

### The `Primers/` directory

Two curated, audience-oriented onboarding hubs — `CellAg.md` ("Cellular Agriculture for AI Researchers") and `AI.md` ("AI for Cell-Ag Researchers") — plus a `README.md` index. They are the home for *newcomer entry-point* material (field-overview videos, learning playlists, "start here" reading, and the field's **cellular-agriculture courses**) that previously lived scattered across `OtherResources.md` and `Talks.md`.

**File schema** (parser-readable, like `Talks.md`): an `# H1` title, a single lede paragraph, then `##` sections, each with an optional intro paragraph and a bullet list of `* [Title](url) — optional note` items. Items may be YouTube videos, YouTube playlists, internal repo-relative cross-links (`../Papers.md`, `../ReferenceWorks.md`, `../AwesomeLists.md`, `./AI.md`), or external links. Use repo-relative `../`/`./` paths for internal links so they resolve on GitHub; the site rewrites them.

**Rendering.** Unlike the other canonical prose files, primers are **not** served through the prose loader. A dedicated parser (`site/scripts/parser/primers.ts` → `primers.json`) classifies each item and rewrites internal `.md` links to site routes (Papers→`/papers/explorer/`, Talks/OtherResources/ResearchAreas→their routes, **keeping** the section `#anchor`), and `PrimerHub.astro` renders the result at `/primers/cell-ag/` and `/primers/ai/`: YouTube videos embed inline (`lite-youtube`), playlists/external links become cards, internal links become same-tab CAAIL nav cards. So the canonical Markdown stays the source of truth (and is in `llms-full.txt`) while the site upgrades it to playable, navigable pages. Anchor gotcha: `/talks/` heading ids use the single-dash slugger in `talk-sections.ts` (`AI/ML`→`ai-ml`), while canonical-prose pages (OtherResources) use the GitHub/Starlight double-dash-for-`&` slugger — match the target's scheme when deep-linking.

### `ResearchAreas/<Area>.md`

Per-area deep-dive page (optional, supplementary). The matrix column header links to the area's definition in `Taxonomy.md`, not here. These pages are AI-assisted and not a trusted definition source; when you add a new column, define it in `Taxonomy.md` and point the column header there.

## Curated summaries are compressed — fetch canonical sources for substantive work

The per-entry summaries in the `Datasets/` pages, `Databases.md`, `Software.md`, and `OtherResources.md` are deliberately compressed for human readability. When an AI session needs substantive information about a listed resource — data schema, API limits, license terms, specific record counts, recent version changes — fetch the canonical site rather than paraphrasing the local summary. The linked sources are authoritative; this repo's curation is a navigation layer, not a knowledge base. The same principle applies to the citation lines in `Papers.md`: those identify a paper but are not a substitute for reading it.

## CAAIL documents the work; it does not take a position on whether the work succeeds

CAAIL indexes what has been researched. It is **not opinionated about whether AI will solve any given problem in cellular agriculture**, and it must never be written as though it were. A research area is a *classification rule* saying which work belongs in that column, not a thesis that the approach works. Read `Taxonomy.md`'s definitions: they are overwhelmingly scope and exclusion criteria rather than claims about what succeeds.

Where one slips, that is a defect in the definition rather than a licence to write more of them. *Bioprocess & Scale-Up* currently admits "methods demonstrated on non-biological reactor physics that transfer directly to bioreactor scale-up" — "transfer directly" asserts a result, where a boundary would say the transfer is the paper's own claim. Fixing it is tracked, not done here.

So, when writing any curated entry or summary:

- **Report what a source argues. Never position CAAIL for or against it.** A catalogued critique is just a catalogued critique. Cross-reference the area it bears on if that helps navigation, but do not describe it as supporting or undermining CAAIL, and do not attribute a "premise" or "central claim" to a research area. Areas do not have premises.
- **Prefer "work indexed under X" to "the premise of X".** The first is true by construction; the second invents a position.
- Skepticism about an approach is *evidence to index*, not an attack to answer. A well-argued case that a whole area is a dead end belongs in the library on the same terms as a paper claiming the opposite.

**The failure this prevents, which happened:** the `OtherResources.md` entry for Weinstock's "AI cannot taste things" once ended "…which cuts against the central premise of the Sensory Prediction research area." That attributed to CAAIL, in public and in CAAIL's own voice, a claim that instrumental prediction of human sensory response works. `Taxonomy.md` makes no such claim, so the entry manufactured a position and then reported it as contested.

This is a distinct virtue from the coverage humility already in `api/index.json`'s `scopeNote` ("a curated subset, not a census… has not measured its own recall"). That one is about what CAAIL has *seen*; this one is about what CAAIL *believes*, which is nothing. Both need stating; only the first currently is on the site, and surfacing this one there is open work.

## Citation style

- **APA** throughout.
- Italicize journal/publication names with `*…*`.
- Use full `https://doi.org/...` URLs (not bare DOIs, not `dx.doi.org`).
- Multi-author papers: list all authors as APA does — don't abbreviate to "et al." in the reference list (the in-text `[N]` anchor is the abbreviation).

## Workflow

- **Jira first, always.** Every piece of work gets an issue in the private **CAAIL** Jira project *before* the work starts, not after. A public GitHub issue is an additional venue when the content is genuinely world-safe, never a substitute. The failure this prevents: a session's reasoning is the expensive part and it evaporates on compaction, so anything that lives only in a todo list or a chat transcript is already lost. See "Jira conventions" below for the schema. (The site and cloud id are deliberately not recorded in this world-readable file — resolve them at runtime via `getAccessibleAtlassianResources` and `getVisibleJiraProjects`.)
- **The structured catalog is authored in a SQLite DB, not by hand** — see "The SQLite authoring backend" below. The matrix + references in `Papers.md`, the entries in `Software.md` / `Databases.md`, and the inventory tables in `Datasets/*.md` are **generated** from `site/db/ndjson/`; don't hand-edit those regions (a hook blocks it; CI fails on drift). Prose in those files, and every other canonical file, is still just hand-authored Markdown — preview in any Markdown viewer or let GitHub render it. (The generated website under `site/` has its own build — see "Documentation site (`site/`)" below.)
- **Branching.** Work on `<type>/<slug>` branches off `main`; open PRs against `main`. Never commit directly to `main`.
- **Superpowers specs stay local.** `.gitignore` excludes `docs/superpowers/`, so write the design doc there but don't commit it — the skill's default to commit doesn't apply here, and the existing specs are all untracked.
- **Commits.** Conventional Commits, Angular flavor. Common scopes for this repo: `papers`, `software`, `data`, `resources`, `research-areas`, `docs`.
  - `feat(papers): add Cosenza 2024 multi-fidelity BO paper`
  - `docs(readme): clarify scope of the library`
  - `fix(papers): correct DOI on reference 17`
- **PRs.** Describe what you added and why it fits — for papers, mention the AI method(s) and research area(s) it spans (i.e. which matrix cells get updated).
- **Publishing is irreversible.** `tucca-cellag/caail` is **public**: issue bodies, PR bodies, commit messages, branch names **and `.gitignore` comments** are all world-readable, GitHub issues can be deleted but **pull requests cannot**, and GHArchive permanently captures every public event. Before filing or commenting, confirm every quoted path, code block and architectural detail originates in *this* repo — anything read from a private repo or a third party's source is not publishable, and paraphrase discloses as much as a quote. Findings about a weakness in someone else's live service go to its owner privately, never a tracker. Rule: `.claude/rules/publishing.md`; enforced at the Bash layer by `.claude/hooks/check-public-publish.sh` (wired in the committed `.claude/settings.json`, tests in `check-public-publish.test.py`).
- **Shipping a branch.** When a feature branch is done and locally green, the **`caail-pr-wrapup`** skill (in `.claude/skills/`) is the Ship stage: it runs the code review, pushes, opens the PR, watches CI, merges (after confirming — the merge triggers the public Pages deploy), watches the `docs.yml` deploy to green (build + Lighthouse + deploy), verifies the live site, and cleans up the worktree/branch. **Review belongs to that skill, not upstream of it**, and it is deliberately more than one round. The level, the floor on rounds and the stop rule live in the skill's step 1 and are deliberately not repeated here: this file loads every session while the skill loads at ship time, so a copy here would go on issuing the old instruction after the skill changed, and would win. Read step 1 rather than assuming, and read its rationale before shortening it. It also owns the CAAIL-specific gotchas (the `gh pr merge` "main already checked out" benign failure, the Lighthouse gate, which CI runs on which paths) so they don't have to be re-derived each time.

## Jira conventions

Jira is the durable record. Claude's todo list is session-scoped and dies with the session; a chat transcript gets compacted. **Whatever is only in those two places is already lost.** So the reasoning goes to Jira as it is produced, not once the work is finished.

**Hierarchy.** `Workstream` (hierarchy 1) → `Task` (0) → `Sub-task` (-1). A Workstream is a body of related work with a shared thesis; Tasks hang off it via `parent`. Retroactive Workstreams recording completed work are an established and useful pattern, not clutter.

**Status.** `To Do` (transition id `21`) → `In Progress` (`31`) → `Done` (`41`). All are global and always available. **Transition to In Progress when work actually starts**, not at the end. A board where everything jumps To Do → Done records no reasoning and answers no question about where time went.

**Descriptions carry reasoning, not just instructions.** State the thesis, what superseded what and why, the central vulnerability of the argument, and which options were rejected. When the full record lives in a gitignored working file, name that path. A description that only says what to do is a description that will be re-derived from scratch in three weeks.

**Fields available on Task** (the project exposes no others worth using; `Category` has no configured options):

| Field | Key | Use |
| --- | --- | --- |
| Priority | `priority` | Highest / High / Medium / Low / Lowest |
| Start date | `customfield_10015` | When work is expected to begin |
| Due date | `duedate` | Loose plan, not a commitment |
| Original estimate | `timetracking` | Rough hours |
| Labels | `labels` | The taxonomy below |

**Priority is argued, never inherited.** Do not take a CVSS score, a linter severity, or a source rubric's framing as the priority. Score against this project's actual exposure and say why in the description. A build-time-only advisory rated critical upstream is not critical here.

**Label taxonomy.** Flat lowercase-hyphen strings, combined freely:

- Kind: `finding` · `workflow`
- Domain: `security` · `supply-chain` · `ci-cd` · `testing` · `observability` · `a11y` · `perf` · `tooling` · `content` · `docs` · `verification` · `licensing`
- Disclosure: `disclosure-private` · `disclosure-public-ok`
- Workstream-scoped prefixes (`phase-*`, `lane-*`, `rubric-*`) are minted per workstream and documented in its description.

**`disclosure-private` is a hard gate, not a hint.** It marks content that must not reach the public repo in any form: unmitigated weaknesses in a live service, unpublished analysis, named individuals, and anything derived from paid or third-party material. Paraphrase discloses as much as a quote. Once a weakness is fixed the label can be dropped and the finding discussed freely.

**Search the whole open board before filing anything. This is not optional.** The board runs to ~90 open issues and no one holds it in their head, so "I don't remember one like this" is not evidence. Filing a duplicate is worse than filing nothing: it splits the reasoning across two tickets, and whichever one you are not reading looks like the complete picture.

**Do not rely on a JQL text search to find it.** Jira's text index tokenizes, so `summary ~ "full text"` and `description ~ "CAAIL-166"` both miss matches you need — hyphenated keys in particular. The only sound method is to pull every open issue and scan locally:

```
# via the Rovo MCP: project = CAAIL AND statusCategory != Done ORDER BY key ASC
# fields: key, summary, parent, priority, labels   (descriptions too if the topic is subtle)
jq -r '.issues.nodes[] | [.key, .fields.summary] | @tsv' <saved-result> | grep -i '<concept>'
```

Search for the **concept**, not your phrasing of it. A ticket about "refs whose classification rests on something short of full text" is the same work as one about "abstract-only placements", and no keyword search finds the second from the first. Read the summaries of anything adjacent before concluding it is new.

**When you find an overlap, prefer editing the existing ticket to filing a new one.** If both genuinely need to exist, say in each what the boundary is (this one owns X, that one owns Y) and link them. An unlinked pair of overlapping tickets is how the same work gets done twice or not at all.

**Jira vs public GitHub.** Jira is the default and is never skipped. A public GitHub issue is an *additional* venue, appropriate when the content is world-safe and outside contributors benefit from seeing it: reproducible bugs in shipped behaviour, feature proposals, content suggestions. Where both exist, cross-reference each from the other. Anything `disclosure-private` gets no GitHub issue at all.

## Agent skills

### Issue tracker

Split. Jira project `CAAIL` is the durable record and is never skipped (`/to-spec`, `/to-tickets`, `/wayfinder`); public GitHub `tucca-cellag/caail` takes discrete world-safe requests and anything a PR closes, and is what `/triage` reads. Enumerate **both** before creating anything. See `docs/agents/issue-tracker.md`.

### Triage labels

Two independent axes. **State** answers what is blocking a ticket now, and has two spellings because it has two writers: `state:<class>` on Jira (from `tracker-backfill`) and the five canonical triage roles on GitHub (from `/triage`, for issues someone else filed) — `wontfix` already exists on the repo and should be applied rather than duplicated. **Type** answers what kind of work resolves it: `wayfinder:<type>`, on both trackers, applied to every ticket regardless of how it was created. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root, both created lazily by `/domain-modeling` rather than seeded. Neither exists yet, which is the expected starting state; `Taxonomy.md` already carries the curation vocabulary a glossary would restate. See `docs/agents/domain.md`.

## The SQLite authoring backend (structured catalog)

CAAIL's **structured catalog** is authored in an in-repo SQLite DB and generated back to
Markdown (issue #78). This covers `Papers.md` (matrix + references), `Software.md` /
`Databases.md` (entries), and the `Datasets/*.md` `## Complete data inventory` tables
**plus the curated `### …` entries** (featured atlases, GEMs, reference entries — every H3
outside the inventory section). Everything else — editorial prose in those files, and all the
non-catalog canonical files (`OtherResources.md`, `ReferenceWorks.md`, `AwesomeLists.md`,
`Funding.md`, `ResearchAreas/`, `Methods/`, `Talks.md`, `Primers/`) — stays hand-authored Markdown.

- **Source of truth = `site/db/ndjson/`** (per-table PK-sorted NDJSON, committed). `site/db/schema.sql`
  is the DDL; `site/caail.db` is a gitignored artifact rebuilt from the NDJSON. Every item has a
  frozen namespaced id (`paper:N`, `sw:…`, `db:…`, `ds:…`, `topic:…`) assigned once and never changed.
  - **The one sanctioned exception: an id the canonical pipeline cannot reproduce.** If a fresh
    `db:bootstrap` from the canonical Markdown mints a *different* id than the one committed, that id
    is already broken — bootstrap either aborts (as it did for ~2.5 weeks on
    `ds:algpred-2-0-allergen-dataset`, minted by a slug rule `lib.slugify` no longer implements) or
    silently renames it. Reconciling it to the rule's output is then repair, not a rename of a working
    id. Conditions, all required: the id is **provably unreproducible** (show the seed's output beside
    the committed id); **every** reference moves with it (`item_topics`, `dois-manual.json`,
    `licenses-manual.json`, `dois-related.json` — note the last two key by *url*, not id) and
    `db:check` passes; and the commit says which id changed and why. **Never** do this to a `paper:N`
    id — those are public anchors people bookmark, they are retired rather than reused, and the fix
    for a bad one is a tombstone. Prefer changing the outlier over changing the slug rule: a rule
    change silently re-mints every id derived from it.
    Note this *is* visible outwardly — `ds:` ids are served in `api/datasets.json` and
    `api/topics.json` — so it is a curator decision, not a refactor to make in passing.
- **Authoring-time only.** The DB is not in the deploy build: `pnpm build` still parses the committed
  Markdown into `data/*.json`. A plain add/remove is one command — `db:add <descriptor.json>` /
  `db:remove <id>` (auto frozen-id, guards, regenerate); the full edit flow is `db:build` → edit →
  `db:export` → `db:emit` → `db:check` / `db:verify`. Either way, commit **Markdown + NDJSON together**.
  The **`caail-db-authoring`** skill owns this workflow; use it whenever adding/editing a paper, tool,
  database, or dataset row.
- **Guards.** A PreToolUse hook (`.claude/hooks/block-generated-edits.py`) blocks direct edits to the
  generated structured content (prose edits still allowed). `db:check` enforces id/referential integrity,
  matrix↔reference reachability, and the #81 column-list drift check; `db:verify` proves the emitted
  Markdown re-parses to identical parser models. In CI, `lint-papers.yml` runs `db:check` + `db:verify`
  and a **sync guard** (`db:emit` then `git diff --exit-code`) so committed Markdown can't drift from the DB.
- **Topics** are the shared cross-content subject axis (multi-tag), two-tier: a fixed backbone of **8
  themes** + earned **fine tags** (each tag under one theme; `topics.tier`/`theme_slug`, guarded by
  `db:check`, which asserts the theme list exactly — `check.ts` is the source of truth for the count,
  not this line). Distinct from the matrix research areas (a theme may link to one via `area_key`); defined
  in `Taxonomy.md` under "Subject themes". The build folds the committed topic NDJSON into the site JSON
  offline (`site/scripts/parser/topics.ts` → `catalog.json`/`papers.json` topic refs + `topics.json`),
  surfaced as **topic chips on cards** (`TopicChips`) and a **cross-content hub** at `/topics/`
  (`/topics/?t=<slug>`). Fine tags are minted only when ≥3 items cluster (curator sign-off).
- **Curated dataset entries** live in `dataset_entries` (catalog-shaped; nullable `url` for unlinked
  GEM headings; `section` + `kind` ∈ {atlas,gem,other}). They share the `ds:` id namespace with the
  inventory rows (a `dataset` item is in `dataset_rows` XOR `dataset_entries`, guarded by `db:check`);
  `db:emit` owns their heading sections (splices narrative verbatim); `db:verify` round-trips them.
  The build folds them into `datasets.json` (`site/scripts/parser/datasets-entries.ts`), and a remark
  transform (`site/scripts/remark/dataset-cards.ts`, wired via `caailProseRemark`) renders each entry as a
  tagged `.ds-card` with topic chips on `/datasets/<page>/`; the entries are also linkable items in the
  `/topics/` hub (inventory rows stay count-only). Inventory rows and narrative are never carded.
  - **Entry heading depth is per-page, not a constant.** Every page marks an entry with `###` under an
    `##` section — except `Datasets/Benchmarks.md`, which uses one `##` per dataset and has no enclosing
    section (its entries carry `section: ''`). Extraction, emit and card rendering all ask
    `entryHeadingDepth(page)` (`site/scripts/parser/datasets.ts`) rather than hardcoding `3`. That single
    constant is what #156 fixed: three call sites keyed on depth 3 while the *counter* knew the benchmarks
    were H2s, so all 17 fell through the gap between two conventions and reached the DB — and therefore
    the datasets endpoint — in neither. If you add a page with a new heading shape, teach that one
    function and add the page to `db:verify`'s list; a page absent from that list has no round-trip oracle.
- **The dataset total and the datasets endpoint count one population.** `counts.datasets` (the headline)
  == `dataset_entries` + `dataset_rows` == what `api/datasets.json` serves. `computeDatasetBreakdown`
  splits it four ways — inventory rows, curated entries *on* the inventory pages, reference-page entries,
  benchmarks — and `generate-data.ts` asserts both the parts-sum and served-==-counted. Before #156 the
  headline omitted the species pages' featured atlases/GEMs while the endpoint omitted the benchmarks, so
  the two figures disagreed in both directions and `index.json` shipped a `datasetsNote` warning consumers
  not to add them. Don't reintroduce a divergence and paper over it with prose.
- **Licenses** are a coarse, DB-owned triage axis (permissive / copyleft / restricted / unknown),
  supersedes #80's cache-only design. `catalog` + `dataset_entries` carry nullable `license` +
  `license_source` (`auto` = GitHub SPDX, `manual` = curated); the coarse **tier is derived** at parse
  via the shared `src/lib/licenses.ts` classifier (one unified 4-tier axis over code + data — CC
  licenses + controlled-access map in). Like topics, license is **DB-only** (not in canonical
  Markdown): `seedLicenses` (run via `db:reseed-axes` — a license/DOI-only fold that, unlike
  `db:bootstrap`, leaves curated topics + ordinals intact, see #100) folds two committed offline inputs — `license-cache.json`
  (auto, refreshed by the opt-in `db:fetch-licenses`) and `licenses-manual.json` (curator overrides,
  manual winning) — into the DB, and the parser (`site/scripts/parser/licenses.ts`) folds the resolved
  value into `catalog.json`/`datasets.json`. Surfaced as a **corner badge** on every card (solid=auto,
  dashed=manual; `LicenseBadge` + the dataset-cards remark), a **cross-content hub** at `/licenses/`
  (`/licenses/?tier=<tier>`), and a **tier filter facet** on the Software/Databases pages. `db:check`
  guards `license_source`. A coarse triage signal, not verified terms — confirm at the source.
  **Papers carry a license too**, but *derive* it (like their DOI) rather than storing a column:
  `fetch:citations` selects `open_access` + `best_oa_location`, `loadPaperLicenses` folds it in, and the
  same `licenses.ts` classifier assigns the tier. **`is_oa` is not a redistribution grant** — 48 works
  are free to read with no license at all (every bronze, 30 of the green), and 41 more are `-nd`. So
  anything that **publishes** text (a public tool, a shipped dataset) must filter on
  `licenseTier ∈ {permissive, copyleft}` (131 works, 38%), never on `is_oa` (~74%). The tier governs
  *redistribution*. **Do not restate that as a permission to copy internally**, which is what this
  line used to do, and what the #ask band's licensing card was deleted for: whether an organisation
  may index what it can read depends on its own access agreements and on the law where it operates,
  and CAAIL takes no position on it. The tier bounds publishing; it licenses nothing. (Checked
  against the statutes twice, and deliberately not summarised here or in the agent skill — a library
  that indexes work should not be handing out legal conclusions about it. The reasoning is on
  CAAIL-2. Note also that the claim survived its own retraction in two files, so when a claim is
  withdrawn anywhere, grep for every copy of it.)
- **DOIs & citation counts** are a second DB-owned axis mirroring licenses. `catalog` +
  `dataset_entries` carry nullable `doi` + `doi_source` (`manual` = curator-verified; `auto` reserved).
  Like licenses the DOI is **DB-only** (not in canonical Markdown): `seedDois` (run via `db:reseed-axes`) folds the
  committed `site/scripts/db/dois-manual.json` (catalog by url, datasets by `ds:` id) into the DB;
  `db:check` guards `doi_source` (both-set-or-both-null) and that every override key resolves. Papers
  need no column — their DOI is derived from the citation `raw`. The **OpenAlex `cited_by_count`** for
  each DOI is fetched by the same opt-in `fetch:citations` (which now selects `cited_by_count` and
  gathers catalog/dataset DOIs alongside paper DOIs, storing the count in `citation-cache.json`), and
  the parser (`site/scripts/parser/citation-counts.ts`) folds it into `papers.json`
  (`citedByOpenAlex`), `catalog.json`, and `datasets.json` (`citationCount`) — derived, never stored.
  Surfaced as a **"cited by N" badge** on paper/software/database/dataset cards (`CitationBadge` + the
  dataset-cards remark, linking to the work on OpenAlex), a **cross-content hub** at `/citations/`
  (`/citations/?band=<band>`, banded 1,000+ / 100–999 / 10–99 / under 10), and a **"Most cited" facet**
  on the Software/Databases pages. A coarse popularity signal, not a quality measure — confirm at the
  source. Full DOI backfill of the catalog/dataset entries is an ongoing curation task
  (`dois-manual.json`); the plumbing renders nothing where no DOI is recorded.
  - **Citation aggregation for versioned resources (#102).** A database that publishes a new paper each
    release (STRING, UniProt, KEGG, Ensembl, …) would badly undercount if the badge showed only one
    paper. A third DB-only input, `site/scripts/db/dois-related.json` (catalog by url, datasets by `ds:`
    id → JSON array of **sibling version DOIs**), is folded by `seedRelatedDois` into a `related_dois`
    column; `fetch:citations` gathers those DOIs too, and `citation-counts.ts` **sums** `cited_by_count`
    over the primary DOI ∪ its siblings. The card shows the aggregate with a `∑` marker (`citationSources`
    > 1) and a tooltip saying how many papers it spans, while the badge link still opens the current
    (primary) paper. `db:check` guards that every `dois-related.json` key resolves and that stored
    `related_dois` are bare-lowercase with no primary overlap (no double-count). Like the other axes it's
    DB-only, folded by `db:reseed-axes`; the sibling-DOI curation is ongoing.

## Documentation site (`site/`)

The canonical root content remains build-free, GitHub-rendered Markdown — that is unchanged. Separately, a generated **documentation website** lives in the top-level `site/` directory (Astro Starlight). It is a navigable layer over the canonical Markdown, never a replacement, and **site work must never modify the canonical files** (`Papers.md`, `Software.md`, `Databases.md`, `OtherResources.md`, `ReferenceWorks.md`, `AwesomeLists.md`, `Funding.md`, `ResearchAreas/`, `Methods/`, `Datasets/`).

- **Stack:** Astro + Starlight, Preact islands, `astro-icon` (Phosphor icon set), self-hosted fonts via `@fontsource` (Bricolage Grotesque for display, Inter for body, JetBrains Mono for code/identifiers), OKLch design tokens, `lite-youtube-embed` for talk facades, `cytoscape` for the citation-network graph (lazy-loaded via `client:idle`). The design system is documented in the repo-root `DESIGN.md`.
- **Node:** requires Node ≥ 22.12 (pinned in `site/.nvmrc`). Run `nvm use 22` (e.g. `source ~/.nvm/nvm.sh && nvm use 22`) before any site command, since the system default may be older.
- **Commands:** `pnpm --dir site dev` (local preview at `/caail/`), `pnpm --dir site build` (runs the parser first), `pnpm --dir site test` (vitest parser suite), `pnpm --dir site test:e2e` (Playwright + axe a11y), `pnpm --dir site parse` (regenerate data only).
  - **Stale-`node_modules` gotcha:** `pnpm parse` dies with `ERR_MODULE_NOT_FOUND: ajv` if `node_modules` predates the OpenAPI work, since `scripts/parser/openapi.ts` imports `ajv`/`ajv-formats`. The lockfile is correct, so `pnpm --dir site install` fixes it. Worth knowing because the error names a package nothing in the repo obviously uses, and it fires on the first command anyone runs after switching branches.
  - **Fresh-worktree `pnpm test` gotcha:** in a checkout that has never run the parser, `pnpm --dir site test` fails with `Cannot find module '../content/data/topics.json'` (or `catalog.json`). Nothing is broken: everything under `src/content/data/` is generated and gitignored, so it does not exist yet. Run `pnpm --dir site parse` first and the suite is green. Like the `ajv` error above it names a module nothing in the repo obviously owns, and it fires on the first command anyone runs in a fresh worktree, so it reads as a real regression when it is only missing build output.
  - **Dev-server staleness gotcha:** editing canonical Markdown while `pnpm dev` is running shows **stale** content until you restart. `caail-docs-loader.ts` reads the canonical files from `REPO_ROOT` (outside `site/`) but never registers them with Astro's content-layer watcher, so nothing invalidates. Restart the server (and `rm -rf site/.astro` if it persists) after editing any canonical page. Verify a change by diffing the rendered list against the file on disk, not by trusting the page you are looking at.
- **CI:** `.github/workflows/docs.yml` builds, runs Lighthouse CI, and deploys to GitHub Pages **on push to `main`** (so the deploy/gate only runs post-merge; use `workflow_dispatch` to trigger manually). The gate is **blocking Accessibility ≥0.90 on all 2 collected URLs, warn-level (does NOT block) Performance ≥0.90 on all 2 collected URLs**: performance has been warn-level since `e627e97`, so a perf regression ships and only accessibility stops a deploy. That bold sentence is *generated* from `site/lighthouserc.json` by `site/scripts/lighthouse-gate.ts` and asserted verbatim, so change the config and paste what the test prints rather than editing this line freehand. `lint-papers.yml` runs the matrix ↔ reference lint plus `db:check`/`db:verify` and the DB sync guard, on PRs and pushes to `main` that touch the canonical content or the parser/DB layer (`Papers.md`, `Software.md`, `Databases.md`, `OtherResources.md`, `Datasets/**`, `CONTRIBUTING.md`, `CLAUDE.md`, `site/scripts/parser/**`, `site/scripts/db/**`, `site/db/**`). `test.yml` runs the vitest parser suite and the Playwright + axe e2e suite in CI on every PR and push to `main` touching `site/**` or the canonical content (they also still run locally).
  - **e2e gotcha:** run Playwright **from `site/`** — `webServer` is `pnpm preview`, which doesn't resolve from the repo root and fails as an opaque 120s `config.webServer` timeout. Set `CAAIL_E2E_PORT` to a port you verified free (`lsof -ti:<port>`); 4321/4325/4331-4333 are commonly held. A held port no longer silently tests another worktree's build: the preflight below aborts the run instead.
  - **e2e preflight:** before the suite starts, `site/scripts/e2e-preflight.ts` aborts the run naming the cause when the pagefind artifacts in `dist` are entirely NUL (an incremental build writes them correctly sized and zero-filled, and every search spec then fails ten seconds later on a content assertion), or when the port is held by a server this run did not start. Both are deterministic within one `dist`, so they read as a reproducible regression rather than a flake. Escape hatches and the Playwright ordering constraints that decide where the check can live: [`site/CLAUDE.md`](./site/CLAUDE.md).
  - **Stale-`dist` e2e gotcha:** `test:e2e` is bare `playwright test`; it does **not** build. `webServer` runs `pnpm preview`, which serves whatever already sits in `site/dist`, so a stale build is tested silently and the failures point at the wrong thing: specs for pages the build predates fail (a `dist` older than the privacy page fails 5 `privacy.spec.ts` and 2 `network-metrics.spec.ts` specs) while everything touching your actual change passes. Run `pnpm --dir site build` first. If a run fails unexpectedly, check `ls -ld site/dist` against the merge date of the feature whose specs failed before you start bisecting your diff.
  - **lhci gotcha:** lhci serves the build via `pnpm preview --port 4321`. If a stale `astro dev`/preview already holds :4321, lhci silently measures *that* server and reports a bogus ~0.5 perf score — free the port first.
- **Data:** a build-time parser (`site/scripts/parser/`, run via `pnpm parse`, and automatically by `build`) reads the canonical Markdown and emits zod-validated JSON to `site/src/content/data/`: `papers.json` (Papers.md matrix + references), `counts.json` (homepage stats), `catalog.json` (Software.md + Databases.md entries, grouped), `talks.json` (Talks.md lectures/talks/playlists, grouped by section with per-item kind), `primers.json` (the `Primers/*.md` onboarding hubs — parsed like talks, but with internal `.md` cross-links rewritten to site routes), `awesome-lists.json` (the `AwesomeLists.md` curated bibliographies — `##` groups of GitHub repos, rendered as cards at `/awesome-lists/` with live star / last-updated metrics folded in offline from the committed `site/scripts/parser/awesome-cache.json`; that cache is refreshed only by the manual `pnpm --dir site fetch:awesome-lists` script — the GitHub-API counterpart to `fetch:citations` — so `parse`/`build` stay network-free, and an absent cache simply renders cards without metrics), `graph.json` (the paper network — shared-author **and** citation edges, with per-mode metadata), `metrics.json` (matrix coverage + per-species dataset gaps + a build-time git momentum snapshot), and `taxonomy.json` (the `Taxonomy.md` per-row/column definition text, keyed by matrix label, for the Papers Explorer's definition popups). The parser **reads** the canonical files and never mutates them; `generate-data.ts` asserts the catalog/talks/graph/metrics tallies match `counts.json` so a stat can't drift from the page it links to, and asserts every matrix method/area label has a non-empty `taxonomy.json` definition so a row/column can't lose its popup text. (`graph.json` is gitignored — a build artifact regenerated by `pnpm parse`.)
- **Citation edges (M7):** the network page's "Citation" mode draws directed `A cites B` edges, derived from OpenAlex `referenced_works` intersected against the corpus' DOIs. The network call is quarantined to one **manual** script — `pnpm --dir site fetch:citations` (`scripts/parser/fetch-citations.ts`) — which writes the committed input `site/scripts/parser/citation-cache.json` (DOI → OpenAlex id + referenced-works). `pnpm parse` reads that cache offline via `citations.ts` and folds edges into `graph.json`, so `parse`/`build` stay deterministic and network-free. Re-run `fetch:citations` only when papers are added; set `OPENALEX_MAILTO=<contact>` for OpenAlex's polite pool. With no cache the citation graph is simply empty.
- **SEO / AEO:** `site/public/` holds the static SEO assets — `og.png` (the 1200×630 social card, generated by `scripts/og-image.mjs`, see `DESIGN.md` §8), `robots.txt` (→ sitemap), `llms.txt` (an agent-facing index leaning into CAAIL's AI-agent audience), and the favicon package (`favicon.svg` + raster fallbacks `favicon.ico`/`apple-touch-icon.png`/`icon-192.png`/`icon-512.png` + `site.webmanifest`, generated by `scripts/favicons.mjs` from the same bioreactor mark). `astro.config.mjs`'s Starlight `head` wires the site-wide `og:image`/`twitter:image`, the favicon/apple-touch/manifest links + `theme-color`, and an Organization+WebSite JSON-LD block. Per-page meta descriptions for the loader-rendered prose pages live in `CAAIL_PAGES` (`src/content/caail-pages.ts`) so each has a unique one rather than the generic site default. (Project-page caveat: `robots.txt`/`llms.txt` at the `/caail/` subpath aren't the domain-root files crawlers/agents check first; the in-`<head>` sitemap link is what's honored, and real submission is via Search Console.)
- **Analytics & privacy:** the `<head>` carries a **Cloudflare Web Analytics** beacon (`astro.config.mjs`, `data-cf-beacon` token) — standalone JS-beacon mode, cookieless, with Cloudflare *not* in the serving path (the site is GitHub Pages). It measures page views and Core Web Vitals and **cannot do custom events**. It is **origin-gated**: an inline guard loads it only when `location.hostname` is the deployed host (derived from the `site` config, not typed twice), so `dev`, `preview` and the e2e suite record nothing. That has to be a runtime check — `preview` and e2e serve the same production build the deploy does, and `import.meta.env` is unavailable in `astro.config.mjs` (Astro evaluates the config before Vite's env transform), so `import.meta.env.PROD` there reads `undefined` and would kill analytics everywhere. Two consequences worth holding: **no local run can observe the beacon**, so a change to it is unverifiable except at the real hostname (which is why `privacy.spec.ts` serves the built page under the deployed host), and **Lighthouse no longer measures it** since lhci collects from `localhost`. Those live in `src/lib/analytics.ts` (pure, unit-tested classification + redaction) wired by `src/components/Analytics.astro` (behavior-only, mounted from `Footer.astro`, so it runs site-wide): an `outbound_click` event classifying links as `doi`/`repo`/`external`, and a GA4-shaped `search` event carrying `search_term` + `result_count`. Both resolve their destination at call time via `resolveSink`, which tries a GA4 `gtag`, then a GTM `dataLayer`, then a **first-party beacon** posting to the Cloudflare Worker in `workers/events/` (Workers Analytics Engine), and no-ops when none is available. The beacon is the live path: a GA4 container was rejected because GA4 sets first-party cookies, which under ePrivacy would force a consent banner onto the site. Its endpoint comes from the `PUBLIC_CAAIL_EVENTS_API` repo variable, so a fork or a preview build with it unset collects nothing. **The Worker re-applies the search redaction rather than trusting the client**, since anyone can post to it directly; a differential test over a shared corpus (`workers/events/src/index.test.ts`) fails when the Worker's copy and `normalizeQuery` disagree, so extend the corpus rather than re-reading both by eye. The Worker also caps how many events one caller can post (`[[ratelimits]]` in `workers/events/wrangler.toml`, first of the POST checks so every path is charged), keyed by IPv4 address or IPv6 /64: the redaction bounds an event's content, that bounds the volume, and an aggregate anyone can move at will measures nothing. Its suite has no vitest project of its own; it runs inside `site`'s via a `../workers/*/src/**` include, and `workers/**` is in `test.yml`'s path filters so a Worker-only change still gates. **The Worker is deployed by hand** (`pnpm --dir workers/events run deploy` — the bare `pnpm … deploy` is pnpm's own workspace command and never reaches the script), and no workflow deploys it, so it is the one part of this repo where **shipping the code does not ship the change**. Deploy it *before pushing the branch*, not before merging: a commit message is published the moment it is pushed, and the privacy page follows on merge, so both can otherwise describe an endpoint that does not behave that way yet. CI does gate the Worker (`workers/**` is in `test.yml`'s path filters, and the `worker` job runs `wrangler deploy --dry-run` over the config), but a green pipeline still means nothing is live. Two constraints on this code: several e2e specs assert **zero** axe violations, so it must add no DOM; and it must never `preventDefault`/`stopPropagation`, since Starlight's search modal and the catalog islands rely on bubbled clicks. Reader-facing disclosure is `src/content/docs/privacy.mdx` (linked from the footer, deliberately absent from the sidebar like `/taxonomy/`) — **keep it in step with what the code actually collects**. There is no cookie banner and none is required: nothing writes tracking storage, and the browser-storage keys — the three `localStorage` display prefs (`caail-nav-collapsed`, `caail-toc-collapsed`, `caail-tableview`) plus the `sessionStorage` `caail-chat-dismissed` flag — all fall under the ePrivacy "explicitly requested by the user" exemption. Adding anything cookie-based changes that analysis. **Any new browser-storage key needs a row in the privacy page's storage table in the same change**; that table is the reader-facing inventory and there is no automated check keeping it honest.
- **Pagefind has no zero-result state.** Don't build a "searched and found nothing" signal on it: Pagefind degrades to fuzzy matches, so even `kkkkkkkkkk` returns four hits against this corpus. That's why the `search` event records `result_count` and the weak-query analysis happens downstream.
- **Gotcha — empty Hero override:** Starlight's `Hero` component is overridden by an intentionally empty `site/src/components/StarlightHeroOverride.astro` so the splash homepage renders no auto page-title `<h1>`. This is registered site-wide but only affects pages that set `hero` frontmatter (currently just the homepage). Any future page that wants a real Starlight hero must revisit this.
- **Scope/branching:** the site is built one milestone at a time in a worktree off `main`, PR'd back. Issue #13 tracks the full plan (milestones M0–M7): M0 prototype, M1 parser+lint, M2 core site + deploy, M3 catalog browsers (Software/Databases) + Talks, M5 Citation Network (#8), and M6 By the Numbers dashboard (#9) are all in place; the M7 OpenAlex citation edges are now shipped too (the network page toggles between shared-author and citation edges — see "Citation edges" below), leaving only the optional cross-species datasets explorer. Routes: Home, Primers (cell-ag / AI), Papers Explorer, Citation Network, Software, Databases, Topics (`/topics/` cross-content hub), Licenses (`/licenses/` license-tier hub), Awesome Lists, Datasets (by species), Research Areas, Methods, Talks, Other Resources, Reference Works, Funding & Grants, By the Numbers, Contributing, About. `OtherResources.md`, `ReferenceWorks.md`, and `Funding.md` are surfaced as prose via the same canonical-prose loader as Datasets/ResearchAreas/Methods/Contributing (registered in `caail-pages.ts` + `caail-docs-loader.ts` + the `caailProseRemark` guard; `ReferenceWorks` needs an explicit `idForSourcePath` hyphenation case → `reference-works`); `AwesomeLists.md` instead drives an island card page (like Software/Databases); and the `Primers/*.md` files go through their own parser + `PrimerHub` component (see "The `Primers/` directory" above) so their videos embed and cross-links rewrite. The homepage "Start here" cards route to the two primers plus the Papers Explorer and Datasets.
- **TOC gotcha:** Starlight's "On This Page" is built only from a page's *Markdown* headings, so island-rendered sections (the Software/Databases catalog) aren't captured natively. A `TableOfContents` component override (`site/src/components/TableOfContents.astro`) injects the catalog's application-area groups into `starlightRoute.toc.items` for `/software` + `/databases` (anchors shared with the island via `src/lib/catalog-groups.ts`); every other route renders Starlight's default TOC.

## The Claude Code plugin (`plugin/`)

`.claude-plugin/marketplace.json` publishes this repo as a Claude Code plugin marketplace; `plugin/` is the plugin itself, and it ships exactly one thing — `plugin/skills/caail/SKILL.md`, the skill an agent installs. **Keep it exactly one.** Claude Code auto-discovers every subdirectory of `plugin/skills/`, and the marketplace entry points at `./plugin`, so a second skill there is installed along with the first. That is how the *installer* skill briefly shipped inside the thing it installs: every user who followed the hero's install prompt ended up carrying, as always-on context forever, a skill whose only job was to install what they already had.

The installer therefore lives **outside** the plugin, at `skills/caail-install/SKILL.md`, and it is what `site/public/setup.md` is a **generated** copy of (written by `publishSkillDoc` during `pnpm parse`). So edit `skills/caail-install/SKILL.md` and re-run the parse; never edit `setup.md`, CI diffs it.

The two skills have opposite lifecycles, which is the thing to hold on to when editing either: the **installer** is fetched once by an agent that does not have CAAIL yet and is then discarded, so its length costs nothing; the **`caail` query skill** is loaded into context on every session forever, so anything added to it is paid for repeatedly. Don't merge them. `setup.md` published the query skill until the two were told apart, which is why the short site URL it exists to provide went unused and the hero fetched a raw GitHub path instead.

**`plugin.json` deliberately carries no `version` field. Do not add one.** Claude Code resolves a plugin's version from the first of: `plugin.json`'s `version`, the marketplace entry's `version`, then the source's git commit SHA — and it uses that as the cache key deciding whether an update exists. An explicit `version` therefore *pins* the plugin: users receive updates only when the field is bumped, and `/plugin update` reports "already at the latest version" no matter how many commits have landed. That is precisely what went wrong here — `0.1.0` never moved while `SKILL.md` changed three times, so every installed user sat on the original skill and had no way to know. Omitting the field falls through to the commit SHA, which is the documented model for a plugin under active development, and CAAIL's skill is exactly that: it restates endpoint shapes and corpus counts that move with the data.

`claude plugin validate .` warns "No version specified. Consider adding a version following semver." **That warning is expected and should be ignored here** — acting on it silently restores the delivery bug. If CAAIL ever does want release cadence over freshness, the change is to re-add `version` *and* adopt a bump-on-every-skill-edit discipline (plus a `CHANGELOG.md`); half of that is worse than neither. `metadata.version` in `marketplace.json` is the marketplace's own version and is not in the plugin's resolution chain, so it is unaffected.

## Gotchas

- **A hand-typed fact next to a machine-derived one is a future defect.** This repo's most expensive recurring bug is not logic, it is a number or a rule that a human wrote down beside the system that already knows it, with nothing checking the two agree. It has bitten at least five times: `#156` (three call sites hardcoding heading depth `3` while the counter knew the benchmarks were H2s, so 17 datasets reached neither the DB nor the endpoint), `#81` (the matrix column list drifting out of this file), the manuscript figures (written against 303/197/64 when the DB said 345/229/74), the `normalizeQuery` parity comment (a byte-for-byte requirement across a trust boundary enforced by prose, with the untrusted copy carrying zero tests; since replaced by a differential test), and the `matrix-classification-audit` README (asserting `Wave 3b 0/29` for three weeks after the data file beside it said 29/29 — read as live, it turned a solved problem back into a feared one and cost a full session's detour). **The fix is always one of two things: derive the value instead of typing it, or add a check that fails when the two disagree.** A comment saying "keep these in sync" documents the risk; it does not mitigate it. When you must snapshot a live number into prose, label it as a snapshot with its date and say which command prints the real one.
- **Matrix-vs-references drift.** The single most common mistake is adding a reference without updating the matrix (so it's unreachable) or adding a matrix anchor that doesn't resolve. Always do both edits in the same commit.
- **Renumbering tempts you to "clean up" gaps.** Don't — if a reference is removed, leave the ID retired rather than shifting subsequent IDs. (If absolutely necessary to renumber, do it as a dedicated PR that updates every matrix link in lockstep.)
- **GitHub-flavored markdown anchor quirks.** GitHub auto-generates heading anchors from header text. The `<a id="N">N</a>` anchors in `Papers.md` are explicit HTML anchors, which work but bypass GitHub's auto-anchor system. Don't rely on header-derived anchors for references; keep using the explicit `<a id>` form.
- **Matrix axis links.** Every matrix row and column label links to its definition in `Taxonomy.md` (the canonical, CAAIL-specific scope of each method/area — preferred over Wikipedia, which is too generic). When adding a new row or column, add its `Taxonomy.md` definition and point the matrix header there. The `ResearchAreas/*.md` and `Methods/*.md` pages are AI-assisted and not a trusted definition source.
- **No version-control or process self-references in content.** Curated entries name *what they were curated from* (a paper, a prior file, a named effort) — never the repo's own history or the curation process. Don't write "surfaced via the May 2026 sync pass #2", "added in pass #N", "introduced in commit X", or dates-of-addition into the rendered content (e.g. a `Datasets/` curation-source note). Git history is the record of *when and how* something landed; the file should read as a clean description of *what* is there, not a changelog. (Same principle as the no-"moved"/"removed" placeholder rule below.)
- **No "moved" / "removed" / "deprecated" placeholders.** When structurally relocating a page or a section — e.g., moving `ResearchAreas/AIEvaluation.md` to `Methods/BenchmarksEvaluation.md` once it turned out to describe a method row rather than a research area — delete the original cleanly. Don't leave behind a stub like `## X → moved`, `## X (now lives in Y)`, or `<!-- removed: X -->`. The git history is the record of what moved; the file itself should read as if it had always been organized this way. Surface the cross-reference once in the intro paragraph or the "Adjacent research areas" footer instead. A *route* is the exception and is not a placeholder: a published URL outlives its directory, so a moved page gets an `astro.config.mjs` redirect even though the Markdown keeps no trace of the move. The same rule applies to refactors of `Papers.md` reference IDs and `Software.md` / `Datasets/` entries: deletions should be silent in the file (apart from a single cross-link if the new home isn't obvious), not commented out or annotated as "moved."

## License

Content: MIT License (see `LICENSE`). When adding linked resources, link to the canonical source — don't mirror copyrighted abstracts or full text into this repo, since the third-party content remains under its original license regardless of CAAIL's.
