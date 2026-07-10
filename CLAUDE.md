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
4. **`matrix-classification-audit`** (Phase 4 — reclassify): re-audits the `Papers.md` matrix
   itself. For each matrix-participating paper it grounds the placement in the paper's methods
   section (pulled from the Zotero PDF full-text cache by `extract_matrix_corpus.py`) and asks
   two questions — is each current `(method × area)` cell defensible, and does the paper also
   belong in additional cells (multi-category)? It edits matrix cells only; it never touches
   `## References` citation text or renumbers IDs. A **scope** removal (a paper judged not
   cell-ag-relevant) carries an asymmetric burden: it must survive a steelman *defender* that
   reads the paper's own methods against the column's `Taxonomy.md` definition (the trusted scope
   source; the ResearchAreas pages are AI-assisted and untrusted) — so a general-purpose method
   becomes a MOVE to *AI Tooling / Methodology*, not a deletion. When a paper's genuine method or area has **no matching row/column**, the audit
   emits a non-destructive **taxonomy gap** — it keeps the paper's cell and surfaces a *proposed*
   new row/column (clustered across ≥2 papers, adversarially verified) for **curator decision**;
   new rows and columns (each defined in `Taxonomy.md`, with the matrix-header link pointing there)
   are never auto-added. (Run via the named workflow `.claude/workflows/matrix-classification-audit.js`.)

Every drafted or re-audited entry is verified before commit by read-only adversarial reviewer
subagents in `.claude/agents/` — **`caail-citation-reviewer`** (Papers.md bibliographic
fidelity), **`caail-claim-reviewer`** (prose-entry factual claims), and
**`caail-classification-reviewer`** (matrix `method × area` placement, grounded in the paper's
methods section) — which an entry must pass before it lands. The agent that wrote or proposed an
entry never reviews it.

### The field-gap analysis workflow

The Zotero-sync lifecycle above reconciles the repo against *our Zotero library*. A complementary
**field-gap** axis reconciles it against *the published field* — sweeping recent literature, datasets,
software, and databases for resources CAAIL is missing — via the **`caail-gap-analysis`** skill
(in `.claude/skills/`). It runs a saved multi-agent workflow (`.claude/workflows/caail-gap-analysis.js`,
invoked with `Workflow({ name: 'caail-gap-analysis' })`): ~16 finder agents each read the live canonical
files to build their own exclusion set, then research the field; a second agent adversarially verifies
each candidate (exists / absent from repo / in-scope / correctly routed); a bounded completeness sweep
chases missed angles; and per-category synthesizers assemble a GitHub-issue draft of vetted candidate
additions (worked example: issue #32). Because finders read the repo at run time, the workflow
auto-adapts as the repo grows — there is no baseline to maintain.

The workflow *proposes* matrix cells but never sees the live matrix, so the skill owns the judgment:
the operator confirms every "new row/column/empty cell" claim against the real `Papers.md` header (most
are false alarms), resolves genuine paper-vs-perspective / method-row questions by reading the source,
recomputes the summary tallies from the rendered checkboxes, spot-checks a DOI sample, and only then
files the issue. The output is a *shortlist for maintainers*; actual integration still follows the
`zotero-to-caail-sync` rules (matrix anchor + reference entry in the same commit; IDs assigned at landing).
Run it on a periodic cadence (a monthly reminder); the Zotero skills run whenever the group library drifts.

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
ResearchAreas/         Per-area deep-dive pages
  Bioprocess.md
  CellEngineering.md
  MediaOptimization.md
  Scaffolding.md
  SensoryPrediction.md
CONTRIBUTING.md        How to add resources (read before editing)
LICENSE                MIT License
```

## Conventions by file

### `Papers.md` — the most important schema

`Papers.md` has **three coordinated parts**:

1. **A 2D matrix table** at the top, for **primary research** applying a specific AI method to a specific cell-ag problem:
   - **Rows** = AI/ML method. Current rows: Bayesian Optimization, Deep Learning, GNN, CNN, GAN/VAE, Genetic Algorithms, SVM, Ensemble Learning, K-Nearest Neighbors, Active Learning, **LLMs / AI Agents**. Each row label links to its definition in `Taxonomy.md` (the canonical, CAAIL-specific definition of every row and column).
   - **Columns** = research area, each linked to its definition in `Taxonomy.md`. Current columns: Media Optimization, Cellular Engineering, Bioprocess & Scale-Up, Scaffolding, Sensory Prediction, **AI Tooling / Methodology**, **AI Evaluation & Benchmarking**.
   - **Cells** = comma-separated anchor links to numbered references, e.g. `[2](#2),[3](#3),[15](#15)`.

2. **A `## References` list** below the matrix — *primary research only*:
   - Each reference is anchored: `<a id="N">N</a> Author, A., & Author, B. (YEAR). Title. *Journal, vol*(issue), pp. https://doi.org/...`
   - Citations are **APA style**, journal italicized with `*…*`, DOI as a full `https://doi.org/...` hyperlink.
   - If the paper has associated code, follow the citation with a blockquote on the next line:

     ```markdown
     > **Code**: https://github.com/<owner>/<repo>
     ```

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
- **Every primary-research reference must appear in at least one matrix cell**, otherwise it is unreachable from the matrix view. Reviews & Perspectives entries are exempt — they're reached via the dedicated section.
- **Every matrix anchor link must resolve to an existing reference ID**, otherwise the link 404s within the page.

### `Software.md` and `Databases.md`

Both use the same hierarchical pattern:

```markdown
## <Application area>
Short paragraph framing the area (optional).

### [<Tool/Database name>](<canonical URL>)

Summary: <1–3 sentences describing what it is and how it applies to cell-ag.>

License: <optional — SPDX id or short note, e.g. "Non-commercial">
```

- The H3 link target should be the primary canonical home — GitHub for software, the database's own canonical home for databases.
- Keep summaries focused on **how the resource is useful for cellular agriculture**, not just what it generally does.
- **License field (optional).** Each entry carries a coarse license *triage tag* (a detected SPDX id or a curated note), surfaced on the site as a colored badge (permissive / copyleft / restricted / unknown) and rolled up into a distribution on the By the Numbers dashboard. Provenance is tracked (`licenseSource`): **auto** tags render *solid*, **curated** tags render *dashed* with a "verify before commercial use" tooltip; a disclaimer on the catalog pages + dashboard says the tags are triage signals, may be stale/incorrect, and must be validated at the source. Two network-quarantined maintenance scripts feed it (both offline-folded at `parse` time, like `fetch:citations`):
  - **`pnpm --dir site fetch:licenses`** (auto) → the committed `site/scripts/parser/license-cache.json`, holding **only GitHub's own authoritative SPDX matches**. A repo GitHub returns `NOASSERTION` for is deliberately left out — its license is non-standard, exactly where a text deep-read is unreliable (it mislabels a BSD-header non-commercial license as BSD, a CC-BY-NC as CC0), so those must not become trusted auto tags.
  - **`pnpm --dir site scan:licenses`** (curated candidates) → reads GitHub `NOASSERTION` LICENSE files, follows a resource's own license/terms subpages, and checks Crossref for DOI entries, writing a review table (`license-scan.json`, gitignored). **Every candidate is human-verified before it lands** — false positives are common (a photo-credit CC, a footer "all rights reserved", a repo's GitHub-ToS page). Confirmed ones are added as `License:` lines.
  - A **manual `License:` line** (its own paragraph, parsed like `Summary:` and stripped from the rendered summary) is how curated tags are recorded; it **wins** over the cache and covers non-GitHub resources and non-standard licenses. The tier classifier (`site/src/lib/licenses.ts`, badge/dashboard/metrics) and the text classifier (`site/scripts/parser/license-classify.ts`, both maintenance scripts) are shared so nothing can disagree.

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

## Citation style

- **APA** throughout.
- Italicize journal/publication names with `*…*`.
- Use full `https://doi.org/...` URLs (not bare DOIs, not `dx.doi.org`).
- Multi-author papers: list all authors as APA does — don't abbreviate to "et al." in the reference list (the in-text `[N]` anchor is the abbreviation).

## Workflow

- **No build, no tests for the canonical content.** Editing the root `*.md` files is just text — preview in any Markdown viewer, or push to a branch and let GitHub render it. (The generated website under `site/` does have a build — see "Documentation site (`site/`)" below.)
- **Branching.** Work on `<type>/<slug>` branches off `main`; open PRs against `main`. Never commit directly to `main`.
- **Commits.** Conventional Commits, Angular flavor. Common scopes for this repo: `papers`, `software`, `data`, `resources`, `research-areas`, `docs`.
  - `feat(papers): add Cosenza 2024 multi-fidelity BO paper`
  - `docs(readme): clarify scope of the library`
  - `fix(papers): correct DOI on reference 17`
- **PRs.** Describe what you added and why it fits — for papers, mention the AI method(s) and research area(s) it spans (i.e. which matrix cells get updated).
- **Shipping a branch.** When a feature branch is done, reviewed, and locally green, the **`caail-pr-wrapup`** skill (in `.claude/skills/`) is the Ship stage: it pushes, opens the PR, watches CI, merges (after confirming — the merge triggers the public Pages deploy), watches the `docs.yml` deploy to green (build + Lighthouse + deploy), verifies the live site, and cleans up the worktree/branch. It owns the CAAIL-specific gotchas (the `gh pr merge` "main already checked out" benign failure, the Lighthouse gate, which CI runs on which paths) so they don't have to be re-derived each time.

## Documentation site (`site/`)

The canonical root content remains build-free, GitHub-rendered Markdown — that is unchanged. Separately, a generated **documentation website** lives in the top-level `site/` directory (Astro Starlight). It is a navigable layer over the canonical Markdown, never a replacement, and **site work must never modify the canonical files** (`Papers.md`, `Software.md`, `Databases.md`, `OtherResources.md`, `ReferenceWorks.md`, `AwesomeLists.md`, `Funding.md`, `ResearchAreas/`, `Datasets/`).

- **Stack:** Astro + Starlight, Preact islands, `astro-icon` (Phosphor icon set), self-hosted fonts via `@fontsource` (Bricolage Grotesque for display, Inter for body, JetBrains Mono for code/identifiers), OKLch design tokens, `lite-youtube-embed` for talk facades, `cytoscape` for the citation-network graph (lazy-loaded via `client:idle`). The design system is documented in the repo-root `DESIGN.md`.
- **Node:** requires Node ≥ 22.12 (pinned in `site/.nvmrc`). Run `nvm use 22` (e.g. `source ~/.nvm/nvm.sh && nvm use 22`) before any site command, since the system default may be older.
- **Commands:** `pnpm --dir site dev` (local preview at `/caail/`), `pnpm --dir site build` (runs the parser first), `pnpm --dir site test` (vitest parser suite), `pnpm --dir site test:e2e` (Playwright + axe a11y), `pnpm --dir site parse` (regenerate data only).
- **CI:** `.github/workflows/docs.yml` builds, runs Lighthouse CI (`lighthouserc.json` — blocking Accessibility ≥0.90 on landing + explorer and Performance ≥0.90 on landing), and deploys to GitHub Pages **on push to `main`** (so the deploy/gate only runs post-merge; use `workflow_dispatch` to trigger manually). `lint-papers.yml` lints the matrix ↔ references on changes to `Papers.md`/`Datasets/`. The vitest/Playwright suites are currently run locally, not in CI.
  - **lhci gotcha:** lhci serves the build via `pnpm preview --port 4321`. If a stale `astro dev`/preview already holds :4321, lhci silently measures *that* server and reports a bogus ~0.5 perf score — free the port first.
- **Data:** a build-time parser (`site/scripts/parser/`, run via `pnpm parse`, and automatically by `build`) reads the canonical Markdown and emits zod-validated JSON to `site/src/content/data/`: `papers.json` (Papers.md matrix + references), `counts.json` (homepage stats), `catalog.json` (Software.md + Databases.md entries, grouped, each carrying a coarse `license` tag — a GitHub-detected SPDX id folded in offline from the committed `site/scripts/parser/license-cache.json`, or a curator's manual `License:` line which wins; the cache is refreshed only by the manual `pnpm --dir site fetch:licenses` script, a sibling of `fetch:citations`/`fetch:awesome-lists`, so `parse`/`build` stay network-free and an absent cache just yields untagged entries; `pnpm --dir site scan:licenses` is the companion curated-candidate generator for everything GitHub can't auto-detect), `talks.json` (Talks.md lectures/talks/playlists, grouped by section with per-item kind), `primers.json` (the `Primers/*.md` onboarding hubs — parsed like talks, but with internal `.md` cross-links rewritten to site routes), `awesome-lists.json` (the `AwesomeLists.md` curated bibliographies — `##` groups of GitHub repos, rendered as cards at `/awesome-lists/` with live star / last-updated metrics folded in offline from the committed `site/scripts/parser/awesome-cache.json`; that cache is refreshed only by the manual `pnpm --dir site fetch:awesome-lists` script — the GitHub-API counterpart to `fetch:citations` — so `parse`/`build` stay network-free, and an absent cache simply renders cards without metrics), `graph.json` (the paper network — shared-author **and** citation edges, with per-mode metadata), `metrics.json` (matrix coverage + per-species dataset gaps + a Software/Databases license distribution by tier and application area + a build-time git momentum snapshot), and `taxonomy.json` (the `Taxonomy.md` per-row/column definition text, keyed by matrix label, for the Papers Explorer's definition popups). The parser **reads** the canonical files and never mutates them; `generate-data.ts` asserts the catalog/talks/graph/metrics tallies match `counts.json` so a stat can't drift from the page it links to, and asserts every matrix method/area label has a non-empty `taxonomy.json` definition so a row/column can't lose its popup text. (`graph.json` is gitignored — a build artifact regenerated by `pnpm parse`.)
- **Citation edges (M7):** the network page's "Citation" mode draws directed `A cites B` edges, derived from OpenAlex `referenced_works` intersected against the corpus' DOIs. The network call is quarantined to one **manual** script — `pnpm --dir site fetch:citations` (`scripts/parser/fetch-citations.ts`) — which writes the committed input `site/scripts/parser/citation-cache.json` (DOI → OpenAlex id + referenced-works). `pnpm parse` reads that cache offline via `citations.ts` and folds edges into `graph.json`, so `parse`/`build` stay deterministic and network-free. Re-run `fetch:citations` only when papers are added; set `OPENALEX_MAILTO=<contact>` for OpenAlex's polite pool. With no cache the citation graph is simply empty.
- **SEO / AEO:** `site/public/` holds the static SEO assets — `og.png` (the 1200×630 social card, generated by `scripts/og-image.mjs`, see `DESIGN.md` §8), `robots.txt` (→ sitemap), `llms.txt` (an agent-facing index leaning into CAAIL's AI-agent audience), and the favicon package (`favicon.svg` + raster fallbacks `favicon.ico`/`apple-touch-icon.png`/`icon-192.png`/`icon-512.png` + `site.webmanifest`, generated by `scripts/favicons.mjs` from the same bioreactor mark). `astro.config.mjs`'s Starlight `head` wires the site-wide `og:image`/`twitter:image`, the favicon/apple-touch/manifest links + `theme-color`, and an Organization+WebSite JSON-LD block. Per-page meta descriptions for the loader-rendered prose pages live in `CAAIL_PAGES` (`src/content/caail-pages.ts`) so each has a unique one rather than the generic site default. (Project-page caveat: `robots.txt`/`llms.txt` at the `/caail/` subpath aren't the domain-root files crawlers/agents check first; the in-`<head>` sitemap link is what's honored, and real submission is via Search Console.)
- **Gotcha — empty Hero override:** Starlight's `Hero` component is overridden by an intentionally empty `site/src/components/StarlightHeroOverride.astro` so the splash homepage renders no auto page-title `<h1>`. This is registered site-wide but only affects pages that set `hero` frontmatter (currently just the homepage). Any future page that wants a real Starlight hero must revisit this.
- **Scope/branching:** the site is built one milestone at a time in a worktree off `main`, PR'd back. Issue #13 tracks the full plan (milestones M0–M7): M0 prototype, M1 parser+lint, M2 core site + deploy, M3 catalog browsers (Software/Databases) + Talks, M5 Citation Network (#8), and M6 By the Numbers dashboard (#9) are all in place; the M7 OpenAlex citation edges are now shipped too (the network page toggles between shared-author and citation edges — see "Citation edges" below), leaving only the optional cross-species datasets explorer. Routes: Home, Primers (cell-ag / AI), Papers Explorer, Citation Network, Software, Databases, Awesome Lists, Datasets (by species), Research Areas, Talks, Other Resources, Reference Works, Funding & Grants, By the Numbers, Contributing, About. `OtherResources.md`, `ReferenceWorks.md`, and `Funding.md` are surfaced as prose via the same canonical-prose loader as Datasets/ResearchAreas/Contributing (registered in `caail-pages.ts` + `caail-docs-loader.ts` + the `caailProseRemark` guard; `ReferenceWorks` needs an explicit `idForSourcePath` hyphenation case → `reference-works`); `AwesomeLists.md` instead drives an island card page (like Software/Databases); and the `Primers/*.md` files go through their own parser + `PrimerHub` component (see "The `Primers/` directory" above) so their videos embed and cross-links rewrite. The homepage "Start here" cards route to the two primers plus the Papers Explorer and Datasets.
- **TOC gotcha:** Starlight's "On This Page" is built only from a page's *Markdown* headings, so island-rendered sections (the Software/Databases catalog) aren't captured natively. A `TableOfContents` component override (`site/src/components/TableOfContents.astro`) injects the catalog's application-area groups into `starlightRoute.toc.items` for `/software` + `/databases` (anchors shared with the island via `src/lib/catalog-groups.ts`); every other route renders Starlight's default TOC.

## Gotchas

- **Matrix-vs-references drift.** The single most common mistake is adding a reference without updating the matrix (so it's unreachable) or adding a matrix anchor that doesn't resolve. Always do both edits in the same commit.
- **Renumbering tempts you to "clean up" gaps.** Don't — if a reference is removed, leave the ID retired rather than shifting subsequent IDs. (If absolutely necessary to renumber, do it as a dedicated PR that updates every matrix link in lockstep.)
- **GitHub-flavored markdown anchor quirks.** GitHub auto-generates heading anchors from header text. The `<a id="N">N</a>` anchors in `Papers.md` are explicit HTML anchors, which work but bypass GitHub's auto-anchor system. Don't rely on header-derived anchors for references; keep using the explicit `<a id>` form.
- **Matrix axis links.** Every matrix row and column label links to its definition in `Taxonomy.md` (the canonical, CAAIL-specific scope of each method/area — preferred over Wikipedia, which is too generic). When adding a new row or column, add its `Taxonomy.md` definition and point the matrix header there. The `ResearchAreas/*.md` pages are AI-assisted and not a trusted definition source.
- **No version-control or process self-references in content.** Curated entries name *what they were curated from* (a paper, a prior file, a named effort) — never the repo's own history or the curation process. Don't write "surfaced via the May 2026 sync pass #2", "added in pass #N", "introduced in commit X", or dates-of-addition into the rendered content (e.g. a `Datasets/` curation-source note). Git history is the record of *when and how* something landed; the file should read as a clean description of *what* is there, not a changelog. (Same principle as the no-"moved"/"removed" placeholder rule below.)
- **No "moved" / "removed" / "deprecated" placeholders.** When structurally relocating a section — e.g., moving the Benchmarks cluster out of `AITooling.md` into a new `AIEvaluation.md` — delete the original heading cleanly. Don't leave behind a stub like `## X → moved`, `## X (now lives in Y)`, or `<!-- removed: X -->`. The git history is the record of what moved; the file itself should read as if it had always been organized this way. Surface the cross-reference once in the intro paragraph or the "Adjacent research areas" footer instead. The same rule applies to refactors of `Papers.md` reference IDs and `Software.md` / `Datasets/` entries: deletions should be silent in the file (apart from a single cross-link if the new home isn't obvious), not commented out or annotated as "moved."

## License

Content: MIT License (see `LICENSE`). When adding linked resources, link to the canonical source — don't mirror copyrighted abstracts or full text into this repo, since the third-party content remains under its original license regardless of CAAIL's.
