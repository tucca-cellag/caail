# Datasets/ — context for Claude Code and AI agents

This directory holds CAAIL's catalog of **fixed data artifacts** — corpora, atlases, sequencing deposits, and model files you would train or benchmark a model *on*. It is organized **by species**: one page per cell-ag-relevant species, plus reference pages (`HumanReference.md`, `CHOReference.md`, `MicrobialHostReference.md`) for cross-species and host-organism substrate and one topical page (`Benchmarks.md`) for AI/ML benchmark datasets. For living, queryable resources, see [`../Databases.md`](../Databases.md).

[`README.md`](./README.md) is the directory landing page and species index.

## Per-page schema

Each populated species page is a curated, species-scoped collection with these sections, in order, including only those that apply:

1. **Editorial intro** — one paragraph on the species' role in cellular agriculture and what the page covers.
2. **Featured atlases** — inline H3 entries for large-scale atlases (FarmGTEx family, FAANG sub-projects), each duplicating the canonical `Databases.md` summary and cross-linking back to it.
3. **Genome-scale metabolic models** — the species' GEM(s), where one exists.
4. **Single-cell & perturbation corpora** — pretraining corpora (only on `HumanReference.md`).
5. **Thematic clusters** — H2 groupings of individual data deposits, each cluster framed with an editorial paragraph and entries written CAAIL-style around cell-ag relevance.
6. **Complete data inventory** — a markdown table of every catalogued deposit. Single-species pages omit the redundant Species column; multi-species pages (`Fish.md`, `Crustacean.md`, `Mollusk.md`) include it. Each row carries two dedicated link columns immediately after **Study** (the study title, as plain text): **Paper** and **Data**.
   - **Paper** — a clickable link to the source publication: `[DOI](https://doi.org/…)`, or `[preprint](…)` when the only identifier is a preprint DOI. Use a status word (no link) only when no DOI exists at all.
   - **Data** — a clickable link to the primary deposit, written as a code-styled accession badge, e.g. `` [`GSE184128`](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE184128) `` (or `[Zenodo](…)` for record-style hosts). When a row has **multiple deposits**, the Data column carries the primary one and secondary deposits stay in Description. When there is no repository accession to link, use an honest status word instead of a fabricated link, chosen to match how the row's Description characterises the data: `on request` (authors will share on request), `supplementary` (data lives in the paper's supplementary files, not a repository), `unavailable` (a deposit exists but is suppressed/withdrawn/embargoed), or `none named` (the study names no deposit at all — e.g. a preprint that lists only reused reference data, or a paper with no data-availability statement). Never invent an accession or DOI. (Reserve the bare `—` for the Size column.)
7. **Curation source note** *(optional — only when there's a meaningful external source to name)* — a closing blockquote naming the **external** source the entries were curated from: a paper's supplemental (e.g. "the supplemental Table 1 of Todhunter et al. 2024") or a prior CAAIL file (e.g. "migrated from the prior flat `Datasets.md`"). **Omit it entirely** when the only thing to say is that contributors added the entries — a contentless "curated by CAAIL contributors" note adds nothing and should be left out. It must **never** reference the repo's own version control or the curation *process* — no sync-pass numbers, commit IDs, "added in pass #N", or dates of addition. Git history is the record of *when and how* an entry landed; the note names *what it was curated from*.
8. **Further reading** — cross-links into `ResearchAreas/`, `Databases.md`, the reference pages, and `Benchmarks.md`.

Sparse stub pages (species with little dedicated data yet) carry only the intro, a placeholder note in place of the inventory table, and a Further reading footer.

## Note for AI agents and LLMs

The summaries and inventory tables here are deliberately compressed and opinionated for human readability. If you are an automated system using these pages as the basis for reasoning, citation, or downstream analysis:

- The NCBI SRA / GEO / PRIDE / Mendeley accessions in the "Complete data inventory" tables are **living resources** — fetch the linked accession for current sample counts, file sizes, and availability. CAAIL's table is a curated snapshot, not a mirror.
- For a paper's actual methods, results, or conclusions, fetch the full text via its DOI, the [caail Zotero group library](https://www.zotero.org/groups/6549203/caail/library) (full-text-indexed for core TUCCA members; see [top-level CLAUDE.md](../CLAUDE.md)), or a literature API.
- For a dataset or atlas's schema, scale, licensing terms, or version history, fetch the canonical landing page.

Some catalogued deposits are degraded in the source survey (disabled accessions, "data available upon request", supplementary-table-only references) — these are kept with an explicit note rather than dropped, because they still point to a study of curatorial value.
