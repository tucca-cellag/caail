# Methods/, context for Claude Code and AI agents

This directory holds one deep-dive page per **row** of the [Papers.md matrix](../Papers.md), the AI/ML method axis. [`ResearchAreas/`](../ResearchAreas/) is its counterpart on the **column** axis, the research-area one. Both are an editorial product; [`Taxonomy.md`](../Taxonomy.md) is the only trusted scope definition for any row or column, and a matrix header links there rather than here.

Every matrix row now has a page here. **Do not write the row count into prose here**: the live set drifts and re-enumerating it is the defect #81 records. `jq '.methods | length' site/public/api/papers.json` prints it, and `ls Methods/*.md | grep -v CLAUDE` is the page set to compare it against.

A **new** row added to the matrix therefore starts out without a page, which is a temporary gap rather than the steady state. Write the page in the same change where practical; the two rules below say what is and is not enforced.

## Two rules that are load-bearing

**A method page must not be added to `ResearchAreas/`.** `site/scripts/parser/counts.ts` derives `counts.json`'s `researchAreas` by counting `*.md` files in that directory (excluding `CLAUDE.md`), and the homepage card labels that number "Research Areas". A method page dropped there silently inflates a count labelled as something else. If a `methods` count is ever wanted on the homepage, derive it the same way from this directory rather than merging the two populations.

**A new row still does not require a page here first, and no `db:check` guard asserts that it does.** The reason that guard was deferred was that a bijection over a half-written axis would block every new method row on someone writing prose for it. That precondition has now changed: the axis is complete, so the guard *could* be added without blocking anything that exists today. It has deliberately not been, because the cost it was deferred to avoid does not disappear with completeness — it simply moves to the next row anyone proposes, and a row is normally proposed by someone integrating a paper rather than someone writing a deep dive. **Extending it is a curator decision that is now open rather than blocked.** If it is taken, say so in the same change, and expect the next new-row PR to carry a page.

A narrower assertion does **not** have that tradeoff and is the one worth landing first: *a page that exists covers its row's refs*. It is checkable wherever a page exists and vacuous where none does, so it blocks nothing. Nothing enforces it today. Every row page currently links every ref in its row, but "links" is weaker than "describes": `Methods/BenchmarksEvaluation.md` links three of its refs only in order to record that they have no write-up. Compare a page's refs against its row's with `jq` over `site/public/api/papers.json` rather than trusting a number written here, and decide which of the two properties a guard should assert before writing one.

## Wiring a new page

Each page needs one thing: an entry in `site/src/content/caail-pages.ts`, with its own meta description. `caail-docs-loader.ts` already scans this whole directory (`CANONICAL_SOURCES.dirs` contains `Methods`), so a new page here needs no loader edit; only a new *directory* would. The `caailProseRemark` guard in `site/astro.config.mjs` derives its allowlist from `CAAIL_PAGES`, so it follows automatically; the route and sidebar entry likewise come from the map. One trap: `idForSourcePath` consults its hyphenation special cases (`ReferenceWorks` → `reference-works`) **only for top-level files**, inside the `slashIdx === -1` branch. A path with a `/` always returns `${dirSlug}/${filename.toLowerCase()}`, so a `Methods/` page cannot use that precedent. `BayesianOptimization.md` becomes `methods/bayesianoptimization`, and registering `methods/bayesian-optimization` instead fails `caail-pages.test.ts` with an id nobody wrote. Either accept the run-together id or add a mechanism for the directory branch; do not copy the top-level pattern and expect it to fire.

## Note for AI agents and LLMs

The narratives here are deliberately compressed and opinionated for human readability, and they are AI-assisted: they are not a trusted source for any paper, tool, dataset, or database they reference. If you are an automated system using these pages as the basis for reasoning, citation, or downstream analysis:

- For a paper's actual methods, results, or conclusions, fetch the full text via its DOI, the [caail Zotero group library](https://www.zotero.org/groups/6549203/caail/library) (full-text-indexed for core TUCCA members; see [top-level CLAUDE.md](../CLAUDE.md)), or a literature API such as OpenAlex, Semantic Scholar, or scite.
- For a method row's scope, read its [`Taxonomy.md`](../Taxonomy.md) definition, never the prose here.
- For a software tool's API, license, or current version, fetch the linked source from [`../Software.md`](../Software.md).
- For a dataset or database's schema, scale, licensing terms, or version history, fetch the canonical landing page from the [`../Datasets/`](../Datasets/) directory or [`../Databases.md`](../Databases.md).
