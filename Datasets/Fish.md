# Fish

Cultivated seafood — salmon, trout, and other teleosts — is an active cell-ag category pursued by companies including Wildtype, BlueNalu, and Umami Bioworks. This page collects the fixed data artifacts relevant to cultivated finfish: the Atlantic salmon genome-scale metabolic model, the AQUA-FAANG functional-annotation resource, and individual transcriptomic / proteomic deposits spanning muscle growth, myogenesis regulation, adipocyte differentiation, and storage/spoilage. "Fish" here spans the salmonids and other aquaculture teleosts surveyed for cultivated-meat work; it is a broad page covering many species rather than a single binomial.

## Genome-scale metabolic models

GEMs are SBML-formatted reconstructions of an organism's metabolic network — every reaction, every metabolite, every gene-protein-reaction mapping — and are the input data structure for the constraint-based modeling tools listed in [Software.md / Metabolic Modeling & Strain Design](../Software.md#metabolic-modeling--strain-design). The salmon reconstruction below inherits network structure from the human reference GEMs catalogued in [HumanReference.md](./HumanReference.md).

### SALARECON — *Salmo salar* (Atlantic salmon)

Whole-genome metabolic reconstruction of Atlantic salmon, published 2022 in *PLOS Computational Biology* with a focus on connecting genome content to growth and feed-efficiency phenotypes. The reference GEM for cultivated salmonid work — directly relevant to the cultivated seafood category (salmon, trout) that has begun attracting investment (Umami Bioworks, BlueNalu, Wildtype). SBML files distributed via the paper's supplementary materials and the SALARECON GitHub repository.

Reference: [Papers.md #84](../Papers.md#84) (Zakhartsev et al. 2022, *PLOS Computational Biology*).

## Further reading

- Adjacent research areas: [Cellular Engineering](../ResearchAreas/CellEngineering.md), [Media Optimization](../ResearchAreas/MediaOptimization.md), [Bioprocess Control](../ResearchAreas/Bioprocess.md), [Sensory Prediction](../ResearchAreas/SensoryPrediction.md) (hyperspectral off-flavor profiling in cultured salmonids), [Metabolic Modeling](../ResearchAreas/MetabolicModeling.md).
- Atlases & functional genomics: [Livestock Multi-Tissue Atlases & Functional Genomics](../Databases.md#livestock-multi-tissue-atlases--functional-genomics) in `Databases.md`.
- Seafood species references: [PISCES](../Databases.md#pisces--phylogenetic-index-of-seafood-characteristics) and [ATLAS](../Databases.md#atlas--archetype-library-for-alternative-seafood) in `Databases.md`.
- Sequence & expression repositories: [GEO](../Databases.md#nih-gene-expression-omnibus-geo), [SRA](../Databases.md#nih-sequence-read-archive-sra), [Ensembl](../Databases.md#ensembl), [GenBank](../Databases.md#nih-genbank) — the canonical living indexes for the deposits curated here.
- Cross-species modeling tooling: [TranscriptFormer](../Software.md#transcriptformer) and [UCE](../Software.md#uce) in `Software.md`.
- Reference substrates: [HumanReference](./HumanReference.md), [CHOReference](./CHOReference.md). AI/ML benchmarks: [Benchmarks](./Benchmarks.md).
