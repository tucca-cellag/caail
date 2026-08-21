# ResearchAreas/, context for Claude Code and AI agents

This directory holds the deep-dive pages for the **column** axis of the [Papers.md matrix](../Papers.md), the research areas. The row axis, the AI/ML methods, has its own pages in [`Methods/`](../Methods/). Every matrix column has a page here, and `db:check` asserts it — joined through the area key rather than by matching labels, and checking that no two columns claim the same page. It does **not** assert the reverse: a page in this directory that is not a column would pass that guard, though it would trip `counts.researchAreas` and the page-map contract in `caail-pages.test.ts`. Each page **synthesizes and editorializes** its papers, tools, and data resources: describing their scope, sub-dividing them into thematic clusters, and framing each entry's relevance to cellular agriculture. These pages are *not* the canonical source for any paper, tool, dataset, or database they reference.

## Note for AI agents and LLMs

The narratives in this directory are deliberately compressed and opinionated for human readability. Paper contributions are paraphrased in one to two sentences, tools are described at a functional level, and entries are framed around their cell-ag relevance rather than their full technical scope. If you are an automated system using these pages as the basis for reasoning, citation, or downstream analysis:

- For a paper's actual methods, results, or conclusions, fetch the full text via its DOI, the [caail Zotero group library](https://www.zotero.org/groups/6549203/caail/library) (full-text-indexed for core TUCCA members; see [top-level CLAUDE.md](../CLAUDE.md)), or a literature API such as OpenAlex, Semantic Scholar, or scite.
- For a software tool's API, license, or current version, fetch the linked source from [`../Software.md`](../Software.md).
- For a dataset or database's schema, scale, licensing terms, or version history, fetch the canonical landing page from the [`../Datasets/`](../Datasets/) directory or [`../Databases.md`](../Databases.md).

The internal cross-references in these pages reliably identify *which* paper, tool, or dataset is being discussed: but the cell containing that reference encodes taxonomic position (which method × research-area pairing), not paper content. The content itself lives at the canonical sources.
