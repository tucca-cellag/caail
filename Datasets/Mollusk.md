# Mollusk

Cultivated mollusk meat — mussels, scallops, oysters, and snails — is an early-stage cell-ag category. This page collects the fixed data artifacts relevant to cultivating mollusk cells: transcriptomic and proteomic deposits spanning muscle tissue analysis, adductor-muscle differentiation, toxin response, and molecular-resource development across bivalves and gastropods. No GTEx-style atlas or genome-scale metabolic model exists for any mollusk yet; the data here is individual study deposits.

## Muscle tissue transcriptomics & differentiation

The mollusk muscle datasets are predominantly comparative transcriptomics across tissues and muscle types. RNA-seq of mantle, muscle, and gill in the Mediterranean mussel (`SRP033481`) and of foot muscle versus mantle in the giant triton snail (`PRJNA695322`) characterise tissue-specific expression, while a fast- vs slow-muscle proteomic/transcriptomic study in the Yesso scallop and a microRNA signature of its striated versus smooth adductor muscles (`PRJNA822005`) probe muscle-type differentiation — relevant background for any cultivated-mollusk muscle-tissue work.

## Toxin response & molecular-resource development

Two further datasets sit outside the muscle focus: an RNA-seq profile of the queen scallop digestive gland after exposure to domoic-acid-producing algae (`PRJNA508885`), relevant to contamination and food-safety screening; and an early RNA-seq-based molecular-resource effort for the freshwater mussel *Villosa lienosa* (`SRP009061`), a reference-building dataset for a species with little prior sequence data.

## Complete data inventory

A curated snapshot. NCBI / ProteomeXchange accessions are the canonical living source — fetch the linked accession for current sample counts, file sizes, and availability.

| Study | Type | Species | Tissue | Description | Size | Area of research |
|---|---|---|---|---|---|---|
| [RNA-Seq in Mytilus galloprovincialis: comparative transcriptomics among different tissues](https://www.ncbi.nlm.nih.gov/sra/?term=SRP033481) | RNA-seq | *Mytilus galloprovincialis* | Mantle, Muscle, Gill | Mantle, muscle, and gill from 5 mussels; 2 biological replicates per tissue (gill: 1) | 33.7 Gb | Muscle tissue analysis |
| [Differences between fast and slow muscles in scallops revealed through proteomics and transcriptomics](https://proteomecentral.proteomexchange.org/cgi/GetDataset?ID=PXD005166) | RNA-seq, mass spectrometry | *Patinopecten yessoensis* | Muscle | Transcriptomic and proteomic, 2 biological replicates, 6 individuals; SRA run `SRR4254476` marked unavailable in source — proteomics linked via ProteomeXchange `PXD005166` | ~94 M reads | Muscle tissue analysis |
| [Rapid development of molecular resources for the freshwater mussel Villosa lienosa](https://www.ncbi.nlm.nih.gov/sra/?term=SRP009061) | RNA-seq, contigs | *Villosa lienosa* | Mantle, Muscle, Gill | RNA-seq of 4 samples; also GenBank contigs `JR494687`–`JR540729` | 16.2 Gb | Molecular-resource development |
| [RNA-Seq transcriptome profiling of the queen scallop digestive gland after domoic-acid exposure](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA508885) | RNA-seq | *Aequipecten opercularis* | Digestive gland | Digestive-gland transcriptome after exposure to domoic-acid-producing *Pseudo-nitzschia* | ~968 M filtered reads | Toxin response |
| [Comparative transcriptomic profiles between foot muscle and mantle in the giant triton snail](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA695322) | RNA-seq | *Charonia tritonis* | Muscle, Mantle | Foot muscle and mantle tissue from adult *C. tritonis* | 7 Gb | Muscle tissue analysis |
| [MicroRNA expression signature in the striated and smooth adductor muscles of the Yesso scallop](https://www.ncbi.nlm.nih.gov/sra/?term=PRJNA822005) | miRNA-seq | *Patinopecten yessoensis* | Muscle | Striated and smooth adductor-muscle tissue from young adults | 4 Gb | Muscle growth & differentiation |

> **Curation source:** The deposit entries above were initially curated from the supplemental Table 1 of Todhunter et al. 2024 ([Papers.md ref #132](../Papers.md#132)). Subsequent additions come from CAAIL contributors.

## Further reading

- Adjacent research areas: [Cellular Engineering](../ResearchAreas/CellEngineering.md), [Bioprocess Control](../ResearchAreas/Bioprocess.md), [Media Optimization](../ResearchAreas/MediaOptimization.md).
- Sequence & expression repositories: [GEO](../Databases.md#nih-gene-expression-omnibus-geo), [SRA](../Databases.md#nih-sequence-read-archive-sra), [Ensembl](../Databases.md#ensembl) — the canonical living indexes for the deposits curated here.
- Alternative-seafood species references: [Seafood Species Reference Databases](../Databases.md#seafood-species-reference-databases) in `Databases.md`.
- Cross-species modeling tooling: [TranscriptFormer](../Software.md#transcriptformer) and [UCE](../Software.md#uce) in `Software.md` — relevant where labelled mollusk data is sparse.
- Reference substrates: [HumanReference](./HumanReference.md), [CHOReference](./CHOReference.md), [CrossSpecies](./CrossSpecies.md). AI/ML benchmarks: [Benchmarks](./Benchmarks.md).
