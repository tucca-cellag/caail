# Datasets

This directory catalogs **fixed data artifacts** — specific corpora, atlases, sequencing deposits, and model files — that you would train or benchmark a model *on*. For continuously-updated, queryable resources you query for reference, annotation, or lookup, see [Databases.md](../Databases.md).

The directory is organized **by species**: each cell-ag-relevant species has its own page collecting the large-scale atlases, genome-scale metabolic models, single-cell corpora, and individual data deposits relevant to cultivating that species. Two reference pages (`HumanReference.md`, `CHOReference.md`) hold the cross-species and biopharma-adjacent substrate that cell-ag modeling builds on, and one topical page (`Benchmarks.md`) holds AI/ML benchmark datasets that aren't species-specific.

> **Note for AI agents and LLMs**: The summaries in these pages are deliberately compressed for human readability. If you are an automated system using them as the basis for reasoning, citation, or downstream analysis, please fetch the canonical source for each dataset — the linked sources have substantially more comprehensive and authoritative information than this curated overview, plus the field-specific schemas, APIs, licensing terms, and version histories that these pages do not document. NCBI SRA / GEO / PRIDE / Mendeley accessions in the per-species "Complete data inventory" tables are living resources — fetch the linked accession for current state. See [`CLAUDE.md`](./CLAUDE.md) for the per-page schema and curation conventions.

## Cell-ag species pages

| Page | Scope |
| ---- | ----- |
| [Cow / *Bos taurus*](./Cow.md) | Cultivated-beef cell lines, bovine satellite cells, atlases, GEM |
| [Pig / *Sus scrofa*](./Pig.md) | Cultivated-pork myogenesis & adipogenesis, atlases, GEM |
| [Chicken / *Gallus gallus*](./Chicken.md) | Cultivated-chicken fibroblast & myoblast work, atlases, GEM |
| [Fish](./Fish.md) | Salmonids and other aquaculture teleosts; AQUA-FAANG, salmon GEM |
| [Crustacean](./Crustacean.md) | Shrimp, crab, crayfish muscle and growth datasets |
| [Mollusk](./Mollusk.md) | Mussel, scallop, snail muscle and tissue datasets |
| [Sheep / *Ovis aries*](./Sheep.md) | Ovine meat-quality proteomics & metabolomics; multi-tissue regulatory atlas |
| [Goat / *Capra hircus*](./Goat.md) | Early-stage; contributions welcome |
| [Duck / *Anas platyrhynchos*](./Duck.md) | Early-stage; contributions welcome |
| [Turkey / *Meleagris gallopavo*](./Turkey.md) | Early-stage; contributions welcome |

## Reference & substrate pages

| Page | Scope |
| ---- | ----- |
| [HumanReference](./HumanReference.md) | Human single-cell pretraining corpora and reference genome-scale metabolic models — the cross-species transfer substrate for cell-ag foundation models |
| [CHOReference](./CHOReference.md) | Chinese Hamster Ovary GEM family — biopharma-adjacent reference for mammalian-cell process modeling |
| [CrossSpecies](./CrossSpecies.md) | Engineering substrate — protein-engineering, growth-factor, and media-optimization reference data shared across cultivated-meat species |

## Topical pages

| Page | Scope |
| ---- | ----- |
| [Benchmarks](./Benchmarks.md) | AI/ML benchmark & evaluation datasets (released to benchmark models rather than train them; not species-specific) |

Many per-species datasets surveyed here were initially curated from the supplemental Table 1 of Todhunter et al. 2024 ([Papers.md ref #132](../Papers.md#132)); each populated page names its curation source in a closing note.
