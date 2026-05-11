# CAAIL — Project Context for Claude

CAAIL (Cellular Agriculture AI Library) is a **curated, markdown-only resource library** at the intersection of Cellular Agriculture and AI. There is no source code, no build step, no test suite — every file is human-readable Markdown rendered by GitHub.

The repository is owned by [tucca-cellag](https://github.com/tucca-cellag) (Tufts University Center for Cellular Agriculture). Content is licensed CC BY 4.0; see `LICENSE` and the README for attribution.

## Repository layout

```
README.md              Landing page + license/contributing pointers
Papers.md              Peer-reviewed papers (matrix + numbered references)
Software.md            Open-source tools grouped by application area
Data.md                Datasets grouped by data type
OtherResources.md      Videos and other educational material (flat list)
ResearchAreas/         Per-area deep-dive pages
  Bioprocess.md
  CellEngineering.md
  MediaOptimization.md
  Scaffolding.md
  SensoryPrediction.md
CONTRIBUTING.md        How to add resources (read before editing)
LICENSE                Verbatim CC BY 4.0 legal text
```

## Conventions by file

### `Papers.md` — the most important schema

`Papers.md` has **two coordinated parts** that must stay in sync:

1. **A 2D matrix table** at the top:
   - **Rows** = AI/ML method (Bayesian Optimization, Deep Learning, GNN, CNN, GAN/VAE, Genetic Algorithms, SVM, Ensemble Learning, KNN, Active Learning, ...). Each row label links to its Wikipedia article.
   - **Columns** = research area, each linked to the matching `ResearchAreas/*.md` page.
   - **Cells** = comma-separated anchor links to numbered references, e.g. `[2](#2),[3](#3),[15](#15)`.

2. **A `## References` list** below the matrix:
   - Each reference is anchored: `<a id="N">N</a> Author, A., & Author, B. (YEAR). Title. *Journal, vol*(issue), pp. https://doi.org/...`
   - Citations are **APA style**, journal italicized with `*…*`, DOI as a full `https://doi.org/...` hyperlink.
   - If the paper has associated code, follow the citation with a blockquote on the next line:
     ```
     > **Code**: https://github.com/<owner>/<repo>
     ```

**Stability rules** (these prevent silently breaking links):

- **Reference IDs are permanent.** Never renumber an existing entry — the matrix points at them by ID and external readers may bookmark anchor URLs.
- **New papers get the next available ID** (max existing ID + 1). Append to the end of the reference list, then add the anchor link(s) to the appropriate matrix cell(s).
- **Every reference must appear in at least one matrix cell**, otherwise it is unreachable from the matrix view.
- **Every matrix anchor link must resolve to an existing reference ID**, otherwise the link 404s within the page.

### `Software.md` and `Data.md`

Both use the same hierarchical pattern:

```markdown
## <Application area>
Short paragraph framing the area (optional).

### [<Tool/Dataset name>](<canonical URL>)

Summary: <1–3 sentences describing what it is and how it applies to cell-ag.>
```

- The H3 link target should be the primary canonical home — GitHub for software, the dataset's own landing page for data (NCBI GEO, UniProt, AlphaFold DB, etc.).
- Keep summaries focused on **how the resource is useful for cellular agriculture**, not just what it generally does.

### `OtherResources.md`

Flat unordered list, one bullet per resource:

```markdown
* [<Title>](<URL>)
```

Currently a YouTube section; add new sections (e.g. `## Podcasts`, `## Courses`) as additional categories accumulate rather than overloading the existing list.

### `ResearchAreas/<Area>.md`

Per-area deep-dive page. Linked from the column header of the `Papers.md` matrix. When you add a new column to the matrix, you must also create the corresponding file under `ResearchAreas/` and link to it from the column header.

## Citation style

- **APA** throughout.
- Italicize journal/publication names with `*…*`.
- Use full `https://doi.org/...` URLs (not bare DOIs, not `dx.doi.org`).
- Multi-author papers: list all authors as APA does — don't abbreviate to "et al." in the reference list (the in-text `[N]` anchor is the abbreviation).

## Workflow

- **No build, no tests.** Editing is just text — preview locally in any Markdown viewer or push to a branch and let GitHub render it.
- **Branching.** Work on `<type>/<slug>` branches off `main`; open PRs against `main`. Never commit directly to `main`.
- **Commits.** Conventional Commits, Angular flavor. Common scopes for this repo: `papers`, `software`, `data`, `resources`, `research-areas`, `docs`.
  - `feat(papers): add Cosenza 2024 multi-fidelity BO paper`
  - `docs(readme): clarify scope of the library`
  - `fix(papers): correct DOI on reference 17`
- **PRs.** Describe what you added and why it fits — for papers, mention the AI method(s) and research area(s) it spans (i.e. which matrix cells get updated).

## Gotchas

- **Matrix-vs-references drift.** The single most common mistake is adding a reference without updating the matrix (so it's unreachable) or adding a matrix anchor that doesn't resolve. Always do both edits in the same commit.
- **Renumbering tempts you to "clean up" gaps.** Don't — if a reference is removed, leave the ID retired rather than shifting subsequent IDs. (If absolutely necessary to renumber, do it as a dedicated PR that updates every matrix link in lockstep.)
- **GitHub-flavored markdown anchor quirks.** GitHub auto-generates heading anchors from header text. The `<a id="N">N</a>` anchors in `Papers.md` are explicit HTML anchors, which work but bypass GitHub's auto-anchor system. Don't rely on header-derived anchors for references; keep using the explicit `<a id>` form.
- **Wikipedia method links.** Row labels in the matrix link to Wikipedia for each AI method. When adding a new row, prefer Wikipedia over a paper or vendor page so the link stays stable.

## License

Content: CC BY 4.0 (see `LICENSE`). When adding linked resources, link to the canonical source — don't mirror copyrighted abstracts or full text into this repo.
