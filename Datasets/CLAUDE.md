# Datasets/ — context for Claude Code and AI agents

This directory holds CAAIL's catalog of **fixed data artifacts** — corpora, atlases, sequencing deposits, and model files you would train or benchmark a model *on*. It is organized **by species**: one page per cell-ag-relevant species, plus reference pages (`HumanReference.md`, `CHOReference.md`, `MicrobialHostReference.md`) for cross-species and host-organism substrate and three topical pages (`Benchmarks.md` for AI/ML benchmark datasets, `FoodSafety.md` for allergen sequence corpora, and `Sustainability.md` for cultivated-meat life-cycle inventories). For living, queryable resources, see [`../Databases.md`](../Databases.md).

[`README.md`](./README.md) is the directory landing page and species index.

## Per-page schema

Each populated species page is a curated, species-scoped collection with these sections, in order, including only those that apply:

1. **Editorial intro** — one paragraph on the species' role in cellular agriculture and what the page covers.
2. **Featured atlases** — inline H3 entries for large-scale atlases (FarmGTEx family, FAANG sub-projects), each duplicating the canonical `Databases.md` summary and cross-linking back to it.
3. **Genome-scale metabolic models** — the species' GEM(s), where a model file is public (see "Which studies get a row" below).
4. **Single-cell & perturbation corpora** — pretraining corpora (only on `HumanReference.md`).
5. **Thematic clusters** — H2 groupings of individual data deposits, each cluster framed with an editorial paragraph and entries written CAAIL-style around cell-ag relevance.
6. **Complete data inventory** — a markdown table of every catalogued deposit. Single-species pages omit the redundant Species column; multi-species pages (`Fish.md`, `Crustacean.md`, `Mollusk.md`) include it. Each row carries two dedicated link columns immediately after **Study** (the study title, as plain text): **Paper** and **Data**.
   - **Paper** — a clickable link to the source publication: `[DOI](https://doi.org/…)`, or `[preprint](…)` when the only identifier is a preprint DOI. Write `none named` (no link) only when no DOI exists at all, as for a benchmark dataset with no describing paper.
   - **Data** — a clickable link to the primary deposit, written as a code-styled accession badge, e.g. `` [`GSE184128`](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE184128) `` (or `[Zenodo](…)` for record-style hosts). When a row has **multiple deposits**, the Data column carries the primary one and secondary deposits stay in Description. When there is no repository accession to link, one of two status words takes its place, chosen to match how the row's Description characterises the data: `supplementary` (a per-sample, per-gene or per-feature results table is published in the paper's supplementary files rather than a repository, and the Description names the file) or `unavailable` (a deposit exists and is embargoed, and the Description says what lifts the embargo). A study whose data are shared only on request, promised for a later deposit, withdrawn, or named nowhere has no row at all; see "Which studies get a row" below. Never invent an accession or DOI. (Reserve the bare `—` for the Size column.)
   - **The Data vocabulary is checked.** `db:check` fails, naming the row, its cell and the reason, when a Data cell is neither a link to an http(s) address nor a bare, lowercase `supplementary` or `unavailable` (`checkInventoryCells` in `site/scripts/db/check.ts`), and `db:add` and `db:remove` run it before writing anything. It reads the cell with the same parser function that fills the agent API's identity fields, so a link labelled with a word that names no deposit (a status word, `none named`, `see paper`, `on request`), and a link to a DOI whose registrant is not a known data host, fail it too: for the DOI, the reason says whether it belongs in the Paper cell or its host needs adding to the registrant list. It checks a cell's shape, not where its link leads. `CrossSpecies.md`, whose table has a **DOI / URL** column in place of Paper and Data, is held to an http(s) link in that cell and takes no status word.
7. **Curation source note** *(optional — only when there's a meaningful external source to name)* — a closing blockquote naming the **external** source the entries were curated from: a paper's supplemental (e.g. "the supplemental Table 1 of Todhunter et al. 2024") or a prior CAAIL file (e.g. "migrated from the prior flat `Datasets.md`"). **Omit it entirely** when the only thing to say is that contributors added the entries — a contentless "curated by CAAIL contributors" note adds nothing and should be left out. It must **never** reference the repo's own version control or the curation *process* — no sync-pass numbers, commit IDs, "added in pass #N", or dates of addition. Git history is the record of *when and how* an entry landed; the note names *what it was curated from*.
8. **Further reading** — cross-links into `ResearchAreas/`, `Databases.md`, the reference pages, and `Benchmarks.md`.

Sparse stub pages (species with little dedicated data yet) carry only the intro, a placeholder note in place of the inventory table, and a Further reading footer.

`Benchmarks.md` is the one page that departs from this shape: it has no inventory table and no H2 section groupings, and instead carries **one `##` heading per benchmark dataset**. That is deliberate (each benchmark is a standalone resource, not a deposit in a cluster), but it means the page's entries sit at a different heading depth from every other page's. Anything that walks dataset entries must ask `entryHeadingDepth(page)` rather than assume `###` — see the SQLite-authoring section of the repo-root `CLAUDE.md`. Adding a `## Further reading` footer here would read as an 18th dataset unless it stays in the `NON_ENTRY_H2` list.

## Note for AI agents and LLMs

The summaries and inventory tables here are deliberately compressed and opinionated for human readability. If you are an automated system using these pages as the basis for reasoning, citation, or downstream analysis:

- The NCBI SRA / GEO / PRIDE / Mendeley accessions in the "Complete data inventory" tables are **living resources** — fetch the linked accession for current sample counts, file sizes, and availability. CAAIL's table is a curated snapshot, not a mirror.
- For a paper's actual methods, results, or conclusions, fetch the full text via its DOI, the [caail Zotero group library](https://www.zotero.org/groups/6549203/caail/library) (full-text-indexed for core TUCCA members; see [top-level CLAUDE.md](../CLAUDE.md)), or a literature API.
- For a dataset or atlas's schema, scale, licensing terms, or version history, fetch the canonical landing page.

## Which studies get a row

The inventory tracks public data that is readily available: a repository deposit, or a results table published with the paper as supplementary material. An embargoed deposit stays, with a note saying what lifts the embargo. A study whose data are shared only on request, promised for a later deposit, withdrawn, or named nowhere gets no row, and an existing row that turns out to be one of these is retired rather than kept with a note. The paper itself stays wherever else CAAIL cites it.

Read the paper's supplementary files before retiring a row for having no public data. A supplement that publishes a per-sample, per-gene or per-feature results table makes the row a `supplementary` row instead, and summary-level tables count (differential-expression statistics, cluster means, descriptive statistics), because they still serve comparisons when the raw data are not public. One holding no such table (primer or reagent lists, sequencing QC, images, plots) does not.

The curated entries (each `###` entry, and each `##` entry on `Benchmarks.md`) follow the same rule. A GEM entry needs its model file to be public (a supplementary file, a model repository such as BiGG or BioModels, or a code repository), and every other entry a deposit or a supplementary results table, named in its heading link or its description.
