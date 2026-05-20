# Contributing to CAAIL

Thanks for your interest in adding to the Cellular Agriculture AI Library. This repository is a curated collection of papers, software, datasets, and other resources at the intersection of cellular agriculture and AI. We welcome suggestions from researchers, engineers, students, and anyone working in or learning about the field.

## Two ways to contribute

You don't need to know Git to suggest a resource.

### Option 1 — Open an issue (no Git required)

Pick the template that fits and fill it out:

- [**Suggest a paper**](https://github.com/tucca-cellag/caail/issues/new?template=paper.yml) — for peer-reviewed papers and preprints. Asks for DOI, AI methods, and research areas.
- [**Suggest software, a dataset, or other resource**](https://github.com/tucca-cellag/caail/issues/new?template=resource.yml) — for entries that would go in `Software.md`, the `Datasets/` directory, `Databases.md`, or `OtherResources.md`.
- [**Propose a new research area**](https://github.com/tucca-cellag/caail/issues/new?template=research-area.yml) — for a new column in the Papers.md matrix.

A maintainer will incorporate accepted suggestions. This is the right path if you're not comfortable with pull requests or just want to flag something quickly.

### Option 2 — Open a pull request

Faster to merge, and you get authorship credit in the Git history. Branch from `main` (e.g. `feat/papers-cosenza-2024`, `docs/add-bioprocess-section`), apply the change directly, and open the PR back against `main`. The format guides below tell you exactly what to edit.

## Adding a paper to `Papers.md`

First decide which **kind** of paper you're adding — the file has two homes for entries:

- **Primary research** (a paper applying a specific AI method to a specific cell-ag problem) → goes in the matrix + `## References` section. *Most papers go here.*
- **Review, perspective, position paper, or commentary** (a paper surveying the field or opining on it rather than applying one method) → goes in the `## Reviews & Perspectives` section only, with no matrix cell. See "Adding a review or perspective paper" below.

### Primary research

The matrix and the `## References` list must be kept in sync:

1. **Pick the next ID.** Scan both the `## References` list and the `## Reviews & Perspectives` section for the highest existing `<a id="N">` number and use `N+1` (the two sections share one numeric counter). Reference IDs are permanent — please don't renumber existing entries, since the matrix cells (and any external links) point at them by ID.
2. **Append the reference** at the end of the `## References` section in APA style:

   ```markdown
   <a id="42">42</a> Author, A. B., & Coauthor, C. D. (2024). Title of the paper. *Journal Name, 12*(3), 456–478. https://doi.org/10.xxxx/yyyy
   ```

   - Use APA style, with the journal name italicized (`*…*`) and the DOI as a full `https://doi.org/...` link.
   - List all authors — don't abbreviate to "et al." in the reference list.
3. **If the paper has associated code**, add a blockquote on the next line:

   ```markdown
   > **Code**: https://github.com/<owner>/<repo>
   ```

4. **Add the paper to every applicable matrix cell.** For each AI method (row) and research area (column) the paper covers, add `[42](#42)` to the corresponding cell — comma-separated with any existing entries:

   ```markdown
   | [Bayesian Optimization](...) | [2](#2),[3](#3),[42](#42) | ... |
   ```

   Current matrix rows: Bayesian Optimization, Deep Learning, GNN, CNN, GAN/VAE, Genetic Algorithms, SVM, Ensemble Learning, K-Nearest Neighbors, Active Learning, LLMs / AI Agents.

   Current matrix columns: Media Optimization, Cellular Engineering, Bioprocess Control, Scaffolding, Sensory Prediction, AI Tooling / Methodology, AI Evaluation & Benchmarking.

5. **If the paper uses an AI method that isn't yet a row**, add a new row. The row label should link to the Wikipedia article for that method (so the link stays stable):

   ```markdown
   | [Reinforcement Learning](https://en.wikipedia.org/wiki/Reinforcement_learning) | | | [42](#42) | | |
   ```

6. **If the paper covers a research area that isn't yet a column**, see "Adding a new research area" below.

7. **The `AI Tooling / Methodology` column** is for papers about general-purpose AI methods or agent frameworks that don't yet have a specific cell-ag application (e.g. a paper introducing a biomedical AI agent that *could* be applied to media optimization). When a follow-up paper applies one of these tools to a specific area, it goes in that area's column instead.

Before opening the PR, double-check that every matrix `[N](#N)` you added resolves to a reference entry, and that your new reference is reachable from at least one matrix cell.

### Adding a review or perspective paper

Reviews, position papers, and commentaries don't participate in the matrix. Add them to the `## Reviews & Perspectives` section instead:

1. **Pick the next ID** (same counter as primary references — see step 1 above).
2. **Append the reference** at the end of the `## Reviews & Perspectives` section, in the same APA format as primary references:

   ```markdown
   <a id="43">43</a> Author, A. B. (2024). Title of the review. *Journal, vol*(issue), pp. https://doi.org/...
   ```

3. **Do not add a matrix cell** — reviews stay out of the matrix.

If you're unsure whether a paper is "primary research" or "review/perspective," err on the side of the matrix when the paper has a clear single contribution (new method, new application) and on the side of Reviews & Perspectives when it surveys multiple methods or zooms out to the field as a whole.

## Adding software, datasets, or other resources

### `Software.md` and `Databases.md`

Use the existing hierarchical structure. Each entry is an H3 link, followed by a one-paragraph summary:

```markdown
## <Application area>
Short framing paragraph (optional if the section already exists).

### [<Tool or database name>](<canonical URL>)

Summary: One to three sentences describing what it is and, importantly, *how it applies to cellular agriculture* — not just what it does in general.
```

- For software, link to the project's GitHub repo (or canonical home if not on GitHub).
- For databases, link to the database's primary canonical home (UniProt, KEGG, ChEMBL, etc.).
- Group new entries under an existing section if one fits. If none does, add a new `##` section.

### The `Datasets/` directory

`Datasets/` is a directory of per-species pages, not a flat file — see [`Datasets/CLAUDE.md`](./Datasets/CLAUDE.md) for the full per-page schema. To add a data resource:

- **Pick the page.** A species-specific data deposit (e.g. a bovine RNA-seq study) goes on its species page (`Datasets/Cow.md`, `Datasets/Pig.md`, …). Cross-species human pretraining corpora and reference GEMs go on `Datasets/HumanReference.md`; the CHO GEM family on `Datasets/CHOReference.md`; AI/ML benchmark datasets on `Datasets/Benchmarks.md`. If no species page exists for your species, propose a new one (mirror an existing sparse stub like `Datasets/Goat.md`) and add it to the index table in `Datasets/README.md`.
- **Add a row to the page's "Complete data inventory" table** — `Study` (linked title), data type, tissue, a short description, dataset size, and area of research. If the deposit fits an existing thematic cluster on that page, mention it in the cluster prose too. A sparse stub page (e.g. `Datasets/Goat.md`) has no table yet — its "Complete data inventory" section is a placeholder note; when you add the first deposit, replace that note with a table by copying the column headers from a populated page such as `Datasets/Cow.md`.
- **Link the canonical accession** — the NCBI SRA/GEO/PRIDE, Mendeley Data, or Hugging Face landing page. If the source has no usable accession (data on request, supplementary-table-only), keep the entry with an explicit note rather than dropping it.

**Picking between `Datasets/`, `Databases.md`, and `OtherResources.md`.** CAAIL distinguishes between fixed train-on artifacts and living query/lookup resources:

1. **Train-on artifacts → the `Datasets/` directory.** ML pretraining corpora, perturbation atlases, downloadable benchmark datasets, individual GEM model artifacts, per-species sequencing deposits.
2. **Query / lookup resources → `Databases.md`.** Repositories, ontologies, spectral libraries, structure / compound / pathway databases.
3. **"Database" in the name, or any directory / registry / tracker → `Databases.md`** — even when the content is people, companies, or regulation rather than scientific data.
4. **Initiatives and programs → `OtherResources.md`.** Research programs, funding mechanisms, and similar non-database, non-tool resources.
5. **Borderline cases → dual-listed.** Resources that are genuinely both software and database (e.g. GNPS) get a full entry in their primary-home file and a short cross-referenced entry in the other.

**Benchmark placement (Paper + Dataset + Database triangle).** AI/ML benchmarks have a distinct artifact shape — a paper, a downloadable eval dataset, and (sometimes) a live leaderboard. Place each aspect in its appropriate file:

- **Paper** describing the benchmark → `Papers.md` with a `> **Code**:` blockquote anchoring the project's canonical home.
- **The data** (questions / scenarios / spectra / sequences) + any **bundled scoring code shipped with the data** → `Datasets/Benchmarks.md`. The bundled scoring code is *not* a separate `Software.md` entry — it's part of the dataset distribution.
- **Live leaderboard or continuously-updated results tracker** → `Databases.md` under "Benchmark Leaderboards & Results Trackers" (per rule 3, trackers belong in `Databases.md`).
- **Separately-installable evaluation framework that brings its own data** (e.g. a framework that scores models against externally-hosted data the framework does not itself distribute) → `Software.md`. CausalBench is the existing example — it's a benchmarking framework, not a bundled-data benchmark, so it lives in `Software.md` and has no `Datasets/` entry.

All entries cross-link via the established `Companion to [Papers.md ref #N]` convention.

### `OtherResources.md`

A flat bulleted list under category headings (currently `## YouTube Videos`):

```markdown
* [<Title>](<URL>)
```

If you're adding a different kind of resource (podcast, course, blog post), create a new `##` section rather than mixing it into an existing list.

## Adding a new research area

A research area is a column in the `Papers.md` matrix, backed by a deep-dive page under `ResearchAreas/`. To add one:

1. **Create `ResearchAreas/<AreaName>.md`** (PascalCase, no spaces — e.g. `ProteinDesign.md`). The file should give a short overview of why the area matters to cellular agriculture and what computational/AI techniques are being applied to it. Existing files like `MediaOptimization.md` are good models.
2. **Add a column** to the `Papers.md` matrix, with the column header linked to your new file:

   ```markdown
   | | ... | [Protein Design](./ResearchAreas/ProteinDesign.md) | ... |
   ```

3. **Link your new area from the README's "What's Inside" section** if it stands as a primary entry point. (Not every research area needs to — small/exploratory areas can live only inside `Papers.md`.)
4. **Backfill matrix cells** for any existing references that also apply to your new area.

## Citation style

We use APA throughout `Papers.md`. In short: author last name, initials, year, title, italicized journal/venue, volume(issue), pages, DOI.

```text
Author, A. B., Coauthor, C. D., & Third, E. F. (2024). Title of the paper. *Journal Name, 12*(3), 456–478. https://doi.org/10.xxxx/yyyy
```

- Italicize journal/publication names with `*…*`.
- DOI as a full `https://doi.org/...` link (not `dx.doi.org`, not a bare DOI string).
- List all authors in the reference; the `[N]` matrix anchor serves as the in-text abbreviation.

## Pull request checklist

Before opening a PR, please confirm:

- [ ] Your branch is off the latest `main` and uses a `<type>/<slug>` name (e.g. `feat/papers-...`, `docs/...`).
- [ ] All new links resolve (no 404s).
- [ ] For `Papers.md` changes: every new reference is reachable from at least one matrix cell, and every new matrix `[N](#N)` resolves to a reference.
- [ ] No existing reference IDs were renumbered.
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (Angular flavor), e.g. `feat(papers): add Cosenza 2024 multi-fidelity BO paper`.
- [ ] The PR description mentions which research area(s) and AI method(s) the change covers, so reviewers can spot-check the matrix updates.

## Licensing of contributions

This repository is licensed under the [MIT License](./LICENSE). By submitting a contribution (pull request, issue, or other form), you agree that your contribution is offered under the same license, and you confirm that you have the right to do so. We don't host copyrighted abstracts or full text — please link to the canonical source instead, since third-party content stays under its original license regardless of CAAIL's.

## Questions

If you're not sure whether a resource fits, how to categorize it, or how to format an entry, open an issue using one of the templates above and a maintainer will help. We'd rather guide you than have you not contribute.
