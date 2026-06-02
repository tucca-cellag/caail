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

For the recurring task of reconciling the whole repo against the Zotero library — finding everything in Zotero not yet catalogued and adding it in schema-correct form — use the project skill **`zotero-to-caail-sync`** (`.claude/skills/zotero-to-caail-sync/`). It paginates and de-duplicates the full library, classifies each gap to its target file, and routes every drafted entry through two read-only adversarial reviewer subagents (`caail-citation-reviewer` and `caail-claim-reviewer`, in `.claude/agents/`) that verify it against the version of record before commit.

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
OtherResources.md      Videos, editorials & opinion, initiatives, curated bibliographies
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
   - **Rows** = AI/ML method. Current rows: Bayesian Optimization, Deep Learning, GNN, CNN, GAN/VAE, Genetic Algorithms, SVM, Ensemble Learning, K-Nearest Neighbors, Active Learning, **LLMs / AI Agents**. Each row label links to its Wikipedia article (or to a representative reference for emerging categories without a dedicated Wikipedia page).
   - **Columns** = research area, each linked to the matching `ResearchAreas/*.md` page. Current columns: Media Optimization, Cellular Engineering, Bioprocess Control, Scaffolding, Sensory Prediction, **AI Tooling / Methodology**.
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
```

- The H3 link target should be the primary canonical home — GitHub for software, the database's own canonical home for databases.
- Keep summaries focused on **how the resource is useful for cellular agriculture**, not just what it generally does.

### The `Datasets/` directory

`Datasets/` is *not* a flat file — it is a directory organized **by species**: one page per cell-ag-relevant species (`Cow.md`, `Pig.md`, `Chicken.md`, `Fish.md`, `Crustacean.md`, `Mollusk.md`, plus sparse extension stubs), two reference pages (`HumanReference.md`, `CHOReference.md`), and one topical page (`Benchmarks.md`). Each per-species page follows a narrative-plus-table schema (editorial intro → featured atlases → GEMs → thematic clusters → complete data-inventory table → curation note → further reading). The directory's own [`Datasets/CLAUDE.md`](./Datasets/CLAUDE.md) is the authoritative description of that schema; [`Datasets/README.md`](./Datasets/README.md) is the landing page and species index.

**The Datasets/ / Databases.md / OtherResources.md split.** CAAIL distinguishes train-on artifacts from query/lookup resources from non-cataloguing context. The categorization rules (also in CONTRIBUTING.md):

1. **Train-on artifacts → the `Datasets/` directory** — ML pretraining corpora, perturbation atlases, GEM model files, and per-species sequencing deposits. Within `Datasets/`, route each entry to its species page (`Cow.md`, `Pig.md`, …), to `HumanReference.md` / `CHOReference.md` for cross-species reference substrate, or to `Benchmarks.md` for AI/ML benchmark datasets.
2. **Query/lookup resources → `Databases.md`** — repositories, ontologies, spectral libraries, structure/compound/pathway databases.
3. **"Database" in the name or any directory/registry/tracker → `Databases.md`** — even when the content is people, companies, or regulation rather than scientific data.
4. **Initiatives and programs → `OtherResources.md`** — research programs, funding mechanisms.
5. **Borderline cases → dual-listed** — full entry in the primary-home file and a short cross-referenced entry in the other (e.g. GNPS).

**Benchmark placement (Paper + Dataset + Database triangle).** AI/ML benchmarks have a distinct artifact shape that resolves the categorization ambiguities above. Apply this rule strictly:

- **Paper** describing the benchmark → `Papers.md` with a `> **Code**:` blockquote anchoring the project's canonical home.
- **The data** (questions / scenarios / spectra / sequences) + any **bundled scoring code shipped with the data** → `Datasets/Benchmarks.md`. Bundled scoring code does *not* get a separate `Software.md` entry — it's part of the dataset distribution.
- **Live leaderboard or continuously-updated results tracker** → `Databases.md` under "Benchmark Leaderboards & Results Trackers" (per rule 3, trackers belong in `Databases.md`).
- **Separately-installable evaluation framework that brings its own data** → `Software.md`. CausalBench is the existing example: a framework that scores models against externally-hosted data (Replogle et al. Perturb-seq) it does not itself distribute. Such frameworks live in `Software.md` and have no `Datasets/` entry. Bundled-data benchmarks (LAB-Bench, BixBench, BLADE, MassSpecGym, ProteinGym) do *not* belong in `Software.md`.

All entries cross-link via the established `Companion to [Papers.md ref #N]` convention. This rule supersedes the more general 5-rule classification above for the specific case of benchmarks — when in doubt, follow this section. Also documented in `CONTRIBUTING.md`.

### `OtherResources.md`

A multi-section page for resources that don't belong in the cataloguing files — videos, field overviews, ecosystem initiatives, curated bibliographies, and journal editorials, news, and opinion pieces about the field. Each section is a flat unordered list:

```markdown
* [<Title>](<URL>)
```

`## Editorials & Opinion` holds journal editorials, news features, and commentary on AI in science / cellular agriculture (e.g. unsigned Nature `d41586-`-prefix items) — deliberately distinct from `Papers.md`'s `## Reviews & Perspectives`, which is reserved for signed, substantive review and position papers cited as numbered references. Add new sections as categories accumulate rather than overloading an existing list.

### `ResearchAreas/<Area>.md`

Per-area deep-dive page. Linked from the column header of the `Papers.md` matrix. When you add a new column to the matrix, you must also create the corresponding file under `ResearchAreas/` and link to it from the column header.

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

## Documentation site (`site/`)

The canonical root content remains build-free, GitHub-rendered Markdown — that is unchanged. Separately, a generated **documentation website** lives in the top-level `site/` directory (Astro Starlight). It is a navigable layer over the canonical Markdown, never a replacement, and **site work must never modify the canonical files** (`Papers.md`, `Software.md`, `Databases.md`, `OtherResources.md`, `ResearchAreas/`, `Datasets/`).

- **Stack:** Astro + Starlight, Preact islands, `astro-icon` (Phosphor icon set), self-hosted fonts via `@fontsource` (Bricolage Grotesque for display, Inter for body, JetBrains Mono for code/identifiers), OKLch design tokens, `lite-youtube-embed` for talk facades, `cytoscape` for the citation-network graph (lazy-loaded via `client:idle`). The design system is documented in the repo-root `DESIGN.md`.
- **Node:** requires Node ≥ 22.12 (pinned in `site/.nvmrc`). Run `nvm use 22` (e.g. `source ~/.nvm/nvm.sh && nvm use 22`) before any site command, since the system default may be older.
- **Commands:** `pnpm --dir site dev` (local preview at `/caail/`), `pnpm --dir site build` (runs the parser first), `pnpm --dir site test` (vitest parser suite), `pnpm --dir site test:e2e` (Playwright + axe a11y), `pnpm --dir site parse` (regenerate data only).
- **CI:** `.github/workflows/docs.yml` builds, runs Lighthouse CI (`lighthouserc.json` — blocking Accessibility ≥0.90 on landing + explorer and Performance ≥0.90 on landing), and deploys to GitHub Pages **on push to `main`** (so the deploy/gate only runs post-merge; use `workflow_dispatch` to trigger manually). `lint-papers.yml` lints the matrix ↔ references on changes to `Papers.md`/`Datasets/`. The vitest/Playwright suites are currently run locally, not in CI.
  - **lhci gotcha:** lhci serves the build via `pnpm preview --port 4321`. If a stale `astro dev`/preview already holds :4321, lhci silently measures *that* server and reports a bogus ~0.5 perf score — free the port first.
- **Data:** a build-time parser (`site/scripts/parser/`, run via `pnpm parse`, and automatically by `build`) reads the canonical Markdown and emits zod-validated JSON to `site/src/content/data/`: `papers.json` (Papers.md matrix + references), `counts.json` (homepage stats), `catalog.json` (Software.md + Databases.md entries, grouped), `talks.json` (Talks.md lectures/talks/playlists, grouped by section with per-item kind), `graph.json` (shared-author co-authorship network), and `metrics.json` (matrix coverage + per-species dataset gaps + a build-time git momentum snapshot). The parser **reads** the canonical files and never mutates them; `generate-data.ts` asserts the catalog/talks/graph/metrics tallies match `counts.json` so a stat can't drift from the page it links to.
- **Gotcha — empty Hero override:** Starlight's `Hero` component is overridden by an intentionally empty `site/src/components/StarlightHeroOverride.astro` so the splash homepage renders no auto page-title `<h1>`. This is registered site-wide but only affects pages that set `hero` frontmatter (currently just the homepage). Any future page that wants a real Starlight hero must revisit this.
- **Scope/branching:** the site is built one milestone at a time in a worktree off `main`, PR'd back. Issue #13 tracks the full plan (milestones M0–M7): M0 prototype, M1 parser+lint, M2 core site + deploy, M3 catalog browsers (Software/Databases) + Talks, M5 Citation Network (#8), and M6 By the Numbers dashboard (#9) are all in place; only the optional post-launch M7 (OpenAlex citation edges, cross-species datasets explorer) remains. Routes: Home, Papers Explorer, Citation Network, Software, Databases, Datasets (by species), Research Areas, Talks, Other Resources, By the Numbers, Contributing, About. `OtherResources.md` is surfaced as prose via the same canonical-prose loader as Datasets/ResearchAreas/Contributing.
- **TOC gotcha:** Starlight's "On This Page" is built only from a page's *Markdown* headings, so island-rendered sections (the Software/Databases catalog) aren't captured natively. A `TableOfContents` component override (`site/src/components/TableOfContents.astro`) injects the catalog's application-area groups into `starlightRoute.toc.items` for `/software` + `/databases` (anchors shared with the island via `src/lib/catalog-groups.ts`); every other route renders Starlight's default TOC.

## Gotchas

- **Matrix-vs-references drift.** The single most common mistake is adding a reference without updating the matrix (so it's unreachable) or adding a matrix anchor that doesn't resolve. Always do both edits in the same commit.
- **Renumbering tempts you to "clean up" gaps.** Don't — if a reference is removed, leave the ID retired rather than shifting subsequent IDs. (If absolutely necessary to renumber, do it as a dedicated PR that updates every matrix link in lockstep.)
- **GitHub-flavored markdown anchor quirks.** GitHub auto-generates heading anchors from header text. The `<a id="N">N</a>` anchors in `Papers.md` are explicit HTML anchors, which work but bypass GitHub's auto-anchor system. Don't rely on header-derived anchors for references; keep using the explicit `<a id>` form.
- **Wikipedia method links.** Row labels in the matrix link to Wikipedia for each AI method. When adding a new row, prefer Wikipedia over a paper or vendor page so the link stays stable.
- **No version-control or process self-references in content.** Curated entries name *what they were curated from* (a paper, a prior file, a named effort) — never the repo's own history or the curation process. Don't write "surfaced via the May 2026 sync pass #2", "added in pass #N", "introduced in commit X", or dates-of-addition into the rendered content (e.g. a `Datasets/` curation-source note). Git history is the record of *when and how* something landed; the file should read as a clean description of *what* is there, not a changelog. (Same principle as the no-"moved"/"removed" placeholder rule below.)
- **No "moved" / "removed" / "deprecated" placeholders.** When structurally relocating a section — e.g., moving the Benchmarks cluster out of `AITooling.md` into a new `AIEvaluation.md` — delete the original heading cleanly. Don't leave behind a stub like `## X → moved`, `## X (now lives in Y)`, or `<!-- removed: X -->`. The git history is the record of what moved; the file itself should read as if it had always been organized this way. Surface the cross-reference once in the intro paragraph or the "Adjacent research areas" footer instead. The same rule applies to refactors of `Papers.md` reference IDs and `Software.md` / `Datasets/` entries: deletions should be silent in the file (apart from a single cross-link if the new home isn't obvious), not commented out or annotated as "moved."

## License

Content: MIT License (see `LICENSE`). When adding linked resources, link to the canonical source — don't mirror copyrighted abstracts or full text into this repo, since the third-party content remains under its original license regardless of CAAIL's.
