# Duck / *Anas platyrhynchos*

Cultivated duck is an emerging cell-ag target. This page collects the fixed data artifacts relevant to cultivating duck cells, and will grow as the field's data accumulates.

## Embryonic muscle development

Duck embryonic breast muscle is the best-covered tissue here. Chen et al. (2022, *Animals*) profiled Shan Ma duck breast muscle at embryonic days 13 and 19 by RNA-seq ([`PRJNA726590`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA726590)) and m6A MeRIP-seq ([`PRJNA725663`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA725663)), comparing m6A modification between the two stages of breast-muscle differentiation; the inventory below also holds an embryonic single-cell atlas of duck skeletal muscle and a circRNA study of the same E13 to E19 window. The first multi-omics characterization of duck embryonic stem cells for cultivated meat (Kusters, Mathieu, Nzekoue et al. 2026, bioRxiv) names no deposit of its own; it reused `PRJNA726590` and three other public BioProjects ([`PRJNA878639`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA878639), [`PRJNA349262`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA349262), [`PRJNA437527`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA437527)) as a conventional-duck reference.

## Follicle development & regulatory genomics

A second axis of duck data captures the epigenetic dynamics of follicular development: a multi-omics map of follicular granulosa cells across seven follicle stages that integrates RNA-seq, ATAC-seq, CUT&Tag, and Hi-C into a three-dimensional cis-regulatory atlas of transcription and chromatin dynamics ([`PRJNA1254901`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA1254901)). Reproductive and follicular biology sits upstream of avian cell sourcing; the chromatin-accessibility and 3D-genome layers make this a regulatory-genomics reference for cultivated-duck cell-line characterization.

## Complete data inventory

A curated snapshot. NCBI / NGDC accessions are the canonical living source: fetch the linked accession for current sample counts, file sizes, and availability.

| Study | Paper | Data | Type | Tissue | Description | Size | Area of research |
|---|---|---|---|---|---|---|---|
| Profiling Analysis of N6-Methyladenosine mRNA Methylation Reveals Differential m6A Patterns during the Embryonic Skeletal Muscle Development of Ducks | [DOI](https://doi.org/10.3390/ani12192593) | [`PRJNA726590`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA726590) | RNA-seq + MeRIP-seq | Breast muscle (embryonic) | Shan Ma duck breast muscle at embryonic days 13 and 19 (female embryos), profiling mRNA expression and m6A methylation across embryonic muscle differentiation (Chen et al. 2022, *Animals*); RNA-seq under `PRJNA726590`, MeRIP-seq under [`PRJNA725663`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA725663); the RNA-seq was later reused as a differentiated-muscle reference by a 2026 duck embryonic stem cell preprint ([Kusters et al.](https://doi.org/10.64898/2026.04.27.720974)) | 6 RNA-seq runs; 99.8 Gb | Myogenesis & m6A RNA methylation |
| Multi-omics data of follicular granulosa cells in duck | [DOI](https://doi.org/10.1186/s40104-026-01393-z) | [`PRJNA1254901`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA1254901) | RNA-seq, ATAC-seq, CUT&Tag, Hi-C | Ovarian follicle (granulosa cells) | Multi-omics map of duck follicular granulosa cells across seven follicle stages; integrates RNA-seq, ATAC-seq, CUT&Tag, and Hi-C into a three-dimensional cis-regulatory atlas of transcription and chromatin dynamics in avian follicle development | — | Follicle development & regulatory genomics |
| Single-cell transcriptomics reveal mechanisms of skeletal muscle differentiation across duck embryonic development | [DOI](https://doi.org/10.1038/s42003-026-09665-0) | [`CRA037446`](https://ngdc.cncb.ac.cn/gsa/search?searchTerm=CRA037446) | scRNA-seq | Skeletal muscle (embryonic) | Single-cell transcriptomic atlas of duck skeletal muscle across embryonic development, tracing myogenic progenitors to myofibers and a LEF1+-mediated slow-to-fast fiber-type transdifferentiation program conserved across avian and mammalian datasets; duck scRNA-seq at NGDC/GSA CRA037446 | — | Myogenesis & fiber-type differentiation |
| Transcriptome RNA sequencing reveals that circular RNAs are abundantly expressed in embryonic breast muscle of duck | [DOI](https://doi.org/10.3390/vetsci10020075) | [`GSE152947`](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE152947) | RNA-seq (circRNA) | Breast (pectoralis) muscle, embryonic | circRNA profiling of Shan Ma duck pectoralis at E13 (undifferentiated) and E19 (differentiated myoblasts); 16,622 circRNAs identified, 260 differentially expressed, with circGAS2-2 shown to promote myoblast proliferation; raw data at GEO GSE152947 | — | Myogenesis & non-coding RNA regulation |

## Further reading

- Atlases & functional genomics: [FAANG](../Databases.md#faang-functional-annotation-of-animal-genomes) in `Databases.md` — the broader functional-annotation network for farmed-animal genomes, including avian species.
- Sequence & expression repositories: [GEO](../Databases.md#nih-gene-expression-omnibus-geo), [SRA](../Databases.md#nih-sequence-read-archive-sra), [Ensembl](../Databases.md#ensembl) (*Anas platyrhynchos* genome assembly).
- Cross-species modeling tooling: [TranscriptFormer](../Software.md#transcriptformer) and [UCE](../Software.md#uce) in `Software.md` — especially useful where labelled species data is sparse.
- Related avian page: [Chicken](./Chicken.md). Adjacent research areas: [Cellular Engineering](../ResearchAreas/CellEngineering.md), [Bioprocess Control](../ResearchAreas/Bioprocess.md).
- Reference substrates: [HumanReference](./HumanReference.md), [CHOReference](./CHOReference.md), [CrossSpecies](./CrossSpecies.md). AI/ML benchmarks: [Benchmarks](./Benchmarks.md).
