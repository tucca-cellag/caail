# Turkey / *Meleagris gallopavo*

Cultivated turkey is an early-stage cell-ag target with little dedicated computational data so far. This page collects what exists and will grow as the field's data accumulates.

## Complete data inventory

A curated snapshot. NCBI accessions are the canonical living source — fetch the linked accession for current sample counts, file sizes, and availability.

| Study | Paper | Data | Type | Tissue | Description | Size | Area of research |
|---|---|---|---|---|---|---|---|
| Satellite-cell clone heterogeneity during differentiation in turkey pectoralis major | [DOI](https://doi.org/10.1016/j.psj.2025.105735) | [`PRJNA1280141`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA1280141) | RNA-seq (clonal) | Pectoralis major (satellite-cell clones) | Transcriptomes of individual satellite-cell clones from one turkey p. major after 48 h differentiation, classed as early (fast-growing) vs late (slow-growing); >1,400 DEGs; MSTN upregulated in early clones, FGFBP1 in late (Yimiletey et al. 2025, *Poultry Science*) | — | Turkey satellite-cell heterogeneity |
| Heterogeneity of satellite-cell populations from an individual turkey pectoralis major | [DOI](https://doi.org/10.3389/fphys.2025.1547188) | [`PRJNA1196520`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA1196520) | RNA-seq (clonal) | Pectoralis major (satellite-cell clones) | RNA-seq of fast- vs slow-growing satellite-cell clones from the same p. major after 72 h proliferation; >5,300 DEGs; early clones enriched for muscle-development genes, late clones for ECM / niche / cytokine signaling (Yu et al. 2025, *Frontiers in Physiology*) | — | Turkey satellite-cell heterogeneity |
| Transcriptome response of differentiating turkey satellite cells to thermal challenge | [DOI](https://doi.org/10.3390/genes13101857) | [`PRJNA842679`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA842679) | RNA-seq | Pectoralis major satellite cells | Satellite cells from fast-growing commercial (Nicholas, NCT) and slower research-line (Randombred Control Line 2, RBC2) turkeys proliferated at 38 °C then differentiated at 33/38/43 °C; RNA-seq DEGs isolate cold- and heat-stress responses in muscle regeneration and sarcomere organization (Reed et al. 2022, *Genes*) | — | Thermal stress / satellite-cell differentiation |

## Further reading

- Atlases & functional genomics: [FAANG](../Databases.md#faang-functional-annotation-of-animal-genomes) in `Databases.md` — the broader functional-annotation network for farmed-animal genomes, including avian species.
- Sequence & expression repositories: [GEO](../Databases.md#nih-gene-expression-omnibus-geo), [SRA](../Databases.md#nih-sequence-read-archive-sra), [Ensembl](../Databases.md#ensembl) (*Meleagris gallopavo* genome assembly).
- Cross-species modeling tooling: [TranscriptFormer](../Software.md#transcriptformer) and [UCE](../Software.md#uce) in `Software.md` — especially useful where labelled species data is sparse.
- Related avian page: [Chicken](./Chicken.md). Adjacent research areas: [Cellular Engineering](../ResearchAreas/CellEngineering.md), [Bioprocess Control](../ResearchAreas/Bioprocess.md).
- Reference substrates: [HumanReference](./HumanReference.md), [CHOReference](./CHOReference.md), [CrossSpecies](./CrossSpecies.md). AI/ML benchmarks: [Benchmarks](./Benchmarks.md).
