# Methods/, context for Claude Code and AI agents

This directory holds one deep-dive page per **row** of the [Papers.md matrix](../Papers.md), the AI/ML method axis. [`ResearchAreas/`](../ResearchAreas/) is its counterpart on the **column** axis, the research-area one. Both are an editorial product; [`Taxonomy.md`](../Taxonomy.md) is the only trusted scope definition for any row or column, and a matrix header links there rather than here.

The directory is being filled in one page at a time, so most of the 25 rows have no page yet. That is the expected state, not a gap to close in a batch.

## Two rules that are load-bearing

**A method page must not be added to `ResearchAreas/`.** `site/scripts/parser/counts.ts` derives `counts.json`'s `researchAreas` by counting `*.md` files in that directory (excluding `CLAUDE.md`), and the homepage card labels that number "Research Areas". A method page dropped there silently inflates a count labelled as something else. If a `methods` count is ever wanted on the homepage, derive it the same way from this directory rather than merging the two populations.

**A new row does not require a page here first.** No `db:check` guard asserts that a method row has a page, and none should be added until all 25 exist: a bijection guard over a half-written axis blocks every new method row on someone writing prose for it, which would have blocked the Gaussian Processes row. Extend the guard to this axis only once the set is complete, and say so in the same change.

## Wiring a new page

Each page needs an entry in `site/src/content/caail-pages.ts` (with its own meta description) and inclusion in `site/src/content/loaders/caail-docs-loader.ts`'s canonical sources. The `caailProseRemark` guard in `site/astro.config.mjs` derives its allowlist from `CAAIL_PAGES`, so it follows automatically; the route and sidebar entry likewise come from the map. A page whose filename would lowercase into an unreadable id needs an explicit case in `idForSourcePath` (`ReferenceWorks` → `reference-works` is the precedent).

## Note for AI agents and LLMs

The narratives here are deliberately compressed and opinionated for human readability, and they are AI-assisted: they are not a trusted source for any paper, tool, dataset, or database they reference. If you are an automated system using these pages as the basis for reasoning, citation, or downstream analysis:

- For a paper's actual methods, results, or conclusions, fetch the full text via its DOI, the [caail Zotero group library](https://www.zotero.org/groups/6549203/caail/library) (full-text-indexed for core TUCCA members; see [top-level CLAUDE.md](../CLAUDE.md)), or a literature API such as OpenAlex, Semantic Scholar, or scite.
- For a method row's scope, read its [`Taxonomy.md`](../Taxonomy.md) definition, never the prose here.
- For a software tool's API, license, or current version, fetch the linked source from [`../Software.md`](../Software.md).
- For a dataset or database's schema, scale, licensing terms, or version history, fetch the canonical landing page from the [`../Datasets/`](../Datasets/) directory or [`../Databases.md`](../Databases.md).
