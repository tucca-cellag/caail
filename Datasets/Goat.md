# Goat / *Capra hircus*

Cultivated goat (chevon) is an early-stage cell-ag target with little dedicated computational data so far. This page collects what exists and will grow as the field's data accumulates.

## Complete data inventory

A curated snapshot. NCBI / NGDC accessions are the canonical living source — fetch the linked accession for current sample counts, file sizes, and availability.

| Study | Paper | Data | Type | Tissue | Description | Size | Area of research |
|---|---|---|---|---|---|---|---|
| Single-cell atlas of goat longissimus dorsi across muscle development (MuSCs & FAPs) | [DOI](https://doi.org/10.3390/cells15020206) | [`PRJCA049754`](https://ngdc.cncb.ac.cn/bioproject/browse/PRJCA049754) | scRNA-seq | Longissimus dorsi | First scRNA-seq atlas of the goat longissimus dorsi across 14 developmental stages (E30 to Y11), 120,944 cells; resolves muscle satellite-cell (MuSC) and fibro-adipogenic progenitor (FAP) subpopulations and DLK1-NOTCH3 FAP-to-MuSC crosstalk that maintains MuSC quiescence (Chen et al. 2026, *Cells*; Chengdu gray goat) | 120,944 cells; 14 stages | Goat muscle development / seed-cell biology |
| Full-length (Oxford Nanopore) transcriptome of goat muscle development | [DOI](https://doi.org/10.1038/s41597-025-04950-9) | [`SRP531789`](https://www.ncbi.nlm.nih.gov/sra/?term=SRP531789) | Long-read RNA-seq (ONT, full-length) | Longissimus dorsi & biceps femoris | ONT full-length transcriptome from late-gestation dams and fetuses; 169.8M valid reads, 58,092 full-length transcripts, 89,468 alternative-splicing events, 5,538 predicted lncRNAs; data descriptor enriching the goat transcriptome annotation (Pei et al. 2025, *Scientific Data*) | 169.8M reads; 24 SRA runs | Goat transcriptome annotation |

## Further reading

- Atlases & functional genomics: [FarmGTEx](../Databases.md#farmgtex) and [FAANG](../Databases.md#faang-functional-annotation-of-animal-genomes) in `Databases.md`.
- Sequence & expression repositories: [GEO](../Databases.md#nih-gene-expression-omnibus-geo), [SRA](../Databases.md#nih-sequence-read-archive-sra), [Ensembl](../Databases.md#ensembl) (*Capra hircus* genome assembly).
- Cross-species modeling tooling: [TranscriptFormer](../Software.md#transcriptformer) and [UCE](../Software.md#uce) in `Software.md` — especially useful where labelled species data is sparse.
- Adjacent research areas: [Cellular Engineering](../ResearchAreas/CellEngineering.md), [Media Optimization](../ResearchAreas/MediaOptimization.md), [Bioprocess Control](../ResearchAreas/Bioprocess.md).
- Reference substrates: [HumanReference](./HumanReference.md), [CHOReference](./CHOReference.md), [CrossSpecies](./CrossSpecies.md). AI/ML benchmarks: [Benchmarks](./Benchmarks.md).
