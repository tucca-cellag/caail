# Contributing to CAAIL

Thanks for your interest in adding to the Cellular Agriculture AI Library. This repository is a curated collection of papers, software, datasets, and other resources at the intersection of cellular agriculture and AI. We welcome suggestions from researchers, engineers, students, and anyone working in or learning about the field.

## Two ways to contribute

You don't need to know Git to suggest a resource.

### Option 1 — Open an issue (no Git required)

Pick the template that fits and fill it out:

- [**Suggest a paper**](https://github.com/tucca-cellag/caail/issues/new?template=paper.yml) — for peer-reviewed papers and preprints. Asks for DOI, AI methods, and research areas.
- [**Suggest software, a dataset, or other resource**](https://github.com/tucca-cellag/caail/issues/new?template=resource.yml) — for entries that would go in `Software.md`, `Data.md`, or `OtherResources.md`.
- [**Propose a new research area**](https://github.com/tucca-cellag/caail/issues/new?template=research-area.yml) — for a new column in the Papers.md matrix.

A maintainer will incorporate accepted suggestions. This is the right path if you're not comfortable with pull requests or just want to flag something quickly.

### Option 2 — Open a pull request

Faster to merge, and you get authorship credit in the Git history. Branch from `main` (e.g. `feat/papers-cosenza-2024`, `docs/add-bioprocess-section`), apply the change directly, and open the PR back against `main`. The format guides below tell you exactly what to edit.

## Adding a paper to `Papers.md`

`Papers.md` has two parts that must be kept in sync:

1. A matrix at the top, organized by AI method (rows) and research area (columns).
2. A numbered reference list below.

To add a paper:

1. **Pick the next ID.** Scan the reference list for the highest existing `<a id="N">` number and use `N+1`. Reference IDs are permanent — please don't renumber existing entries, since the matrix cells (and any external links) point at them by ID.
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

5. **If the paper uses an AI method that isn't yet a row**, add a new row. The row label should link to the Wikipedia article for that method (so the link stays stable):

   ```markdown
   | [Reinforcement Learning](https://en.wikipedia.org/wiki/Reinforcement_learning) | | | [42](#42) | | |
   ```

6. **If the paper covers a research area that isn't yet a column**, see "Adding a new research area" below.

Before opening the PR, double-check that every matrix `[N](#N)` you added resolves to a reference entry, and that your new reference is reachable from at least one matrix cell.

## Adding software, datasets, or other resources

### `Software.md` and `Data.md`

Use the existing hierarchical structure. Each entry is an H3 link, followed by a one-paragraph summary:

```markdown
## <Application area>
Short framing paragraph (optional if the section already exists).

### [<Tool or dataset name>](<canonical URL>)

Summary: One to three sentences describing what it is and, importantly, *how it applies to cellular agriculture* — not just what it does in general.
```

- For software, link to the project's GitHub repo (or canonical home if not on GitHub).
- For datasets, link to the dataset's primary landing page (NCBI GEO, UniProt, AlphaFold DB, etc.).
- Group new entries under an existing section if one fits. If none does, add a new `##` section.

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

```
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

This repository is licensed under [CC BY 4.0](./LICENSE). By submitting a contribution (pull request, issue, or other form), you agree that your contribution is offered under the same license, and you confirm that you have the right to do so. We don't host copyrighted abstracts or full text — please link to the canonical source instead.

## Questions

If you're not sure whether a resource fits, how to categorize it, or how to format an entry, open an issue using one of the templates above and a maintainer will help. We'd rather guide you than have you not contribute.
