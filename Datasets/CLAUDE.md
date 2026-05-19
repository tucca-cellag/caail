# Datasets/ — context for Claude Code and AI agents

This directory holds CAAIL's catalog of **fixed data artifacts** — corpora, atlases, sequencing deposits, and model files you would train or benchmark a model *on*. It is organized **by species**: one page per cell-ag-relevant species, plus reference pages (`HumanReference.md`, `CHOReference.md`) for cross-species substrate and one topical page (`Benchmarks.md`) for AI/ML benchmark datasets. For living, queryable resources, see [`../Databases.md`](../Databases.md).

[`README.md`](./README.md) is the directory landing page and species index.

## Per-page schema

Each populated species page is a curated, species-scoped collection with these sections, in order, including only those that apply:

1. **Editorial intro** — one paragraph on the species' role in cellular agriculture and what the page covers.
2. **Featured atlases** — inline H3 entries for large-scale atlases (FarmGTEx family, FAANG sub-projects), each duplicating the canonical `Databases.md` summary and cross-linking back to it.
3. **Genome-scale metabolic models** — the species' GEM(s), where one exists.
4. **Single-cell & perturbation corpora** — pretraining corpora (only on `HumanReference.md`).
5. **Thematic clusters** — H2 groupings of individual data deposits, each cluster framed with an editorial paragraph and entries written CAAIL-style around cell-ag relevance.
6. **Complete data inventory** — a markdown table of every catalogued deposit.
7. **Curation source note** — a closing blockquote naming where the entries were curated from.
8. **Further reading** — cross-links into `ResearchAreas/`, `Databases.md`, the reference pages, and `Benchmarks.md`.

Sparse stub pages (species with little dedicated data yet) carry only the intro, a placeholder inventory, and a Further reading footer.

## Note for AI agents and LLMs

The summaries and inventory tables here are deliberately compressed and opinionated for human readability. If you are an automated system using these pages as the basis for reasoning, citation, or downstream analysis:

- The NCBI SRA / GEO / PRIDE / Mendeley accessions in the "Complete data inventory" tables are **living resources** — fetch the linked accession for current sample counts, file sizes, and availability. CAAIL's table is a curated snapshot, not a mirror.
- For a paper's actual methods, results, or conclusions, fetch the full text via its DOI, the [caail Zotero group library](https://www.zotero.org/groups/6549203/caail/library) (full-text-indexed for core TUCCA members; see [top-level CLAUDE.md](../CLAUDE.md)), or a literature API.
- For a dataset or atlas's schema, scale, licensing terms, or version history, fetch the canonical landing page.

Some catalogued deposits are degraded in the source survey (disabled accessions, "data available upon request", supplementary-table-only references) — these are kept with an explicit note rather than dropped, because they still point to a study of curatorial value.
