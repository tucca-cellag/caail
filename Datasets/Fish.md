# Fish

Cultivated seafood — salmon, trout, and other teleosts — is an active cell-ag category pursued by companies including Wildtype, BlueNalu, and Umami Bioworks. This page collects the fixed data artifacts relevant to cultivated finfish: the Atlantic salmon genome-scale metabolic model, the AQUA-FAANG functional-annotation resource, and individual transcriptomic / proteomic deposits spanning muscle growth, myogenesis regulation, adipocyte differentiation, and storage/spoilage. "Fish" here spans the salmonids and other aquaculture teleosts surveyed for cultivated-meat work; it is a broad page covering many species rather than a single binomial.

## Featured atlases

### [AQUA-FAANG](https://www.aqua-faang.eu/)

The FAANG consortium's aquaculture programme — *Advancing European Aquaculture by Genome Functional Annotation* — generating genome-wide functional annotation maps for six aquaculture species important to European aquaculture (Atlantic salmon, rainbow trout, European sea bass, gilthead sea bream, common carp, turbot); the [data hub](https://data.faang.org/projects/AQUA-FAANG) hosts its open releases. A FAANG functional-annotation substrate for cell-ag-relevant aquaculture-cell-line work. Full entry in [Databases.md / Livestock Multi-Tissue Atlases](../Databases.md#livestock-multi-tissue-atlases--functional-genomics).

## Genome-scale metabolic models

GEMs are SBML-formatted reconstructions of an organism's metabolic network — every reaction, every metabolite, every gene-protein-reaction mapping — and are the input data structure for the constraint-based modeling tools listed in [Software.md / Metabolic Modeling & Strain Design](../Software.md#metabolic-modeling--strain-design). The salmon reconstruction below inherits network structure from the human reference GEMs catalogued in [HumanReference.md](./HumanReference.md).

### SALARECON — *Salmo salar* (Atlantic salmon)

Whole-genome metabolic reconstruction of Atlantic salmon, published 2022 in *PLOS Computational Biology*, built to connect genome content to growth and feed-efficiency phenotypes for aquaculture. It is the most directly applicable existing GEM for cultivated salmonid modelling — though not purpose-built for cultivated meat — and relevant to the cultivated seafood category (salmon, trout) attracting investment from companies such as Umami Bioworks, BlueNalu, and Wildtype. SBML files distributed via the paper's supplementary materials and the SALARECON GitHub repository.

Reference: [Papers.md #84](../Papers.md#84) (Zakhartsev et al. 2022, *PLOS Computational Biology*).

## Muscle growth & myogenesis

The bulk of the fish data surveyed here is skeletal-muscle transcriptomics across a wide taxonomic spread — the substrate for understanding how finfish muscle grows, the trait a cultivated-seafood process is built around. Studies span exercise-induced muscle remodelling in rainbow trout (`SRA051669.1`), myogenic regulatory genes in beltfish (`SRX1674471`), growth-hormone-transgenic coho salmon (`PRJEB7712`), spawning-associated muscle wasting in Atlantic cod (`SRR955389`–`SRR955396`), compensatory growth in fine flounder (`SRS643409`), age-series muscle transcriptomes in Schizothorax prenanti (`SRP074282`), microRNA–SmyD1 regulation in Chinese perch (`GSE97173`), fast- vs slow-growing phoenix barb (`PRJNA848289`), exercise-driven muscle-texture improvement in a hybrid cyprinid (`PRJNA843454`), and pigmentation-linked muscular atrophy in Atlantic salmon (`PRJNA706530`).

## Myoblast cell lines & myogenic differentiation

The most directly cultivated-meat-relevant fish datasets are the in-vitro ones. The establishment of a continuous myoblast cell line in the marine teleost *Sebastes schlegelii* (`PRJNA661185`, also CNGB `CNP0000222`) — propagated 50 passages over 150 days — and a proteomic characterisation of primary cultured gilthead sea bream myocytes across myogenic-differentiation stages together provide a close fish analogue to the bovine and porcine satellite-cell work that anchors cultivated-meat cell biology.

## Adipocyte differentiation

Two microarray time-series profile finfish adipocyte biology — proliferation and differentiation of rainbow trout adipocyte precursor cells (`GSE90058`) and differentiation of the Atlantic salmon adipose-derived stromo-vascular fraction into adipocytes (`GSE18389`) — relevant to engineering the fat component of cultivated seafood.

## Atlases, proteomes & quality profiling

A final cluster covers reference-scale and quality-oriented resources: a single-cell transcriptome atlas of zebrafish development (`PRJNA564810`), a spatial transcriptomic atlas of Atlantic salmon skin (`PRJNA970983`), the PeptideAtlas of the widely cultivated *Labeo rohita* (PRIDE `PXD026377`), and a mass-spectrometry study of how fish-muscle metabolite profiles shift with sampling method, storage temperature, and time — directly relevant to cultivated-seafood quality and shelf-life.

## Complete data inventory

A curated snapshot spanning many finfish species. NCBI / EBI / Mendeley accessions are the canonical living source — fetch the linked accession for current sample counts, file sizes, and availability.

| Study | Type | Species | Tissue | Description | Size | Area of research |
|---|---|---|---|---|---|---|
| [A single-cell transcriptome atlas for zebrafish development](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA564810) | scRNA-seq | *Danio rerio* | Whole embryo | Whole zebrafish embryos at 1/2/5 dpf, 220 cell types, n=2 per timepoint | 44,102 cells, 525 Gb | Cell-type atlas |
| [Deep RNA sequencing of the skeletal muscle transcriptome in swimming fish](https://www.ncbi.nlm.nih.gov/sra/?term=SRA051669.1) | RNA-seq | *Oncorhynchus mykiss* | Muscle | Red/white muscle of rainbow trout rested (n=10) or swum 1176 km over 40 days (n=10) | 3.4 Gb | Muscle growth |
| [Identification of myogenic regulatory genes in the muscle transcriptome of beltfish](https://www.ncbi.nlm.nih.gov/sra/?term=SRX1674471) | RNA-seq | *Trichiurus lepturus* | Muscle | Muscle tissue of a wild juvenile beltfish (n=1) | 15.8 Gb | Myogenesis regulation |
| [RNA-seq of fast skeletal muscle in restriction-fed transgenic coho salmon](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJEB7712) | RNA-seq | *Oncorhynchus kisutch* | Muscle | Fast skeletal muscle, GH-transgenic (n=6) and wildtype (n=6) coho salmon | 132 Gb | Muscle growth regulation |
| [Transcriptomic landscape of Atlantic salmon skin](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA970983) | RNA-seq (spatial) | *Salmo salar* | Skin | Skin tissue from 4 body locations in 2 Atlantic salmon | 78.6 Gb | Spatial transcriptomic atlas |
| [Proteomic characterization of primary cultured myocytes in a fish model at different myogenesis stages](https://static-content.springer.com/esm/art%3A10.1038%2Fs41598-019-50651-w/MediaObjects/41598_2019_50651_MOESM2_ESM.xlsx) | LC-MS/MS | *Sparus aurata* | Muscle | Primary satellite cells at 4/8/12 days culture (n=5 each); 2-D gel + LC-MS/MS; data in the paper's supplementary file | 898 spots | Myogenesis |
| [Substantial downregulation of myogenic transcripts in skeletal muscle of Atlantic cod during the spawning period](https://www.ncbi.nlm.nih.gov/sra/?term=SRR955389) | RNA-seq | *Gadus morhua* | Muscle | Skeletal muscle from 3 sampling time points, 6 male + 6 female fish (runs `SRR955389`–`SRR955396`) | — | Muscle wasting |
| [Establishment of a myoblast cell line in the marine teleost Sebastes schlegelii](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA661185) | RNA-seq | *Sebastes schlegelii* | Muscle | Continuous myoblast cell line, explant method, 50 passages over 150 days (also CNGB `CNP0000222`) | 105.2 Gb | Muscle cell line |
| [RNA-seq analysis of compensatory growth in the skeletal muscle of fine flounder](https://www.ncbi.nlm.nih.gov/sra/?term=SRS643409) | RNA-seq | *Paralichthys adspersus* | Muscle | Feeding-regime and fasting groups, weeks 0/3/4 | 3 Gb | Muscle growth |
| [Gene expression during proliferation and differentiation of rainbow trout adipocyte precursor cells](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE90058) | Microarray | *Oncorhynchus mykiss* | Fat | Timepoints at days 3/8/15/21 | 52.5 Mb | Adipocyte proliferation & differentiation |
| [Gene expression in Atlantic salmon adipose-derived stromo-vascular fraction during adipocyte differentiation](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE18389) | Microarray | *Salmo salar* | Fat | 6 time-points across adipocyte differentiation | 6.1 Mb | Adipocyte differentiation |
| [Characterization of the muscle transcriptome in Schizothorax prenanti](https://www.ncbi.nlm.nih.gov/sra/?term=SRP074282) | RNA-seq | *Schizothorax prenanti* | Muscle | Skeletal muscle at 3 time points: 30-day larva, 1 year, 3 years | 19.7 Gb | Muscle growth regulation |
| [Proteomic and microRNA transcriptome analysis of the microRNA-SmyD1 network in Chinese perch skeletal muscle](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE97173) | Microarray | *Siniperca chuatsi* | Muscle | Red and white muscle from 2-year-old Chinese perch | ~3 Mb | Muscle protein expression |
| [Transcriptome analysis of the muscle of fast- and slow-growing phoenix barb](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA848289) | RNA-seq | *Spinibarbus denticulatus denticulatus* | Muscle | Muscle at 3 growth stages; liver, muscle, brain also collected; 10 individuals | 153 Gb | Muscle growth |
| [Comparative transcriptome analysis of muscle textural quality improvement by exercise in a hybrid cyprinid](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA843454) | RNA-seq | *Erythroculter ilishaeformis* × *Ancherythroculter nigrocauda* | Muscle | Hybrid cyprinid; 12 samples (covers both parent species) | 76 Gb | Muscle texture |
| [Metabolic profile of fish muscle tissue changes with sampling method, storage strategy and time](https://data.mendeley.com/datasets/k4dyxzzptj/1) | Mass spectrometry peak list | *Oncorhynchus mykiss* | Muscle | 45 samples, 6 timepoints, 3 storage temperatures, 4 sampling/storage methods | 4.08 Mb | Storage |
| [The PeptideAtlas of the widely cultivated fish Labeo rohita](https://www.ebi.ac.uk/pride/archive/projects/PXD026377) | Mass spectrometry (DDA-MS/MS) | *Labeo rohita* | Multiple | Multi-tissue peptide atlas | 295 raw files | Protein atlas |
| [Histological and transcriptomic analysis of muscular atrophy linked to depleted flesh pigmentation in Atlantic salmon](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA706530) | RNA-seq | *Salmo salar* | Muscle | 15 fish (3 flesh-colour groups, n=5), two muscle regions | 348 Gb | Muscle pigmentation & integrity |

> **Curation source:** The deposit entries above were initially curated from the supplemental Table 1 of Todhunter et al. 2024 ([Papers.md ref #132](../Papers.md#132)). Subsequent additions come from CAAIL contributors.

## Further reading

- Adjacent research areas: [Cellular Engineering](../ResearchAreas/CellEngineering.md), [Media Optimization](../ResearchAreas/MediaOptimization.md), [Bioprocess Control](../ResearchAreas/Bioprocess.md), [Sensory Prediction](../ResearchAreas/SensoryPrediction.md) (hyperspectral off-flavor profiling in cultured salmonids), [Metabolic Modeling](../ResearchAreas/MetabolicModeling.md).
- Atlases & functional genomics: [Livestock Multi-Tissue Atlases & Functional Genomics](../Databases.md#livestock-multi-tissue-atlases--functional-genomics) in `Databases.md`.
- Seafood species references: [PISCES](../Databases.md#pisces--phylogenetic-index-of-seafood-characteristics) and [ATLAS](../Databases.md#atlas--archetype-library-for-alternative-seafood) in `Databases.md`.
- Sequence & expression repositories: [GEO](../Databases.md#nih-gene-expression-omnibus-geo), [SRA](../Databases.md#nih-sequence-read-archive-sra), [Ensembl](../Databases.md#ensembl), [GenBank](../Databases.md#nih-genbank) — the canonical living indexes for the deposits curated here.
- Cross-species modeling tooling: [TranscriptFormer](../Software.md#transcriptformer) and [UCE](../Software.md#uce) in `Software.md`.
- Reference substrates: [HumanReference](./HumanReference.md), [CHOReference](./CHOReference.md). AI/ML benchmarks: [Benchmarks](./Benchmarks.md).
