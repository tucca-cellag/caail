# Chicken / *Gallus gallus*

Chicken is a leading cultivated-meat target — cultivated chicken was among the first products to reach regulatory approval — and *Gallus gallus* is the first non-mammalian livestock species with a GTEx-style atlas. This page collects the fixed data artifacts relevant to cultivated chicken: the chicken genome-scale metabolic model, the multi-tissue atlases, and individual deposits spanning fibroblast immortalization for serum-free production, myogenesis, and skeletal-muscle development.

## Genome-scale metabolic models

GEMs are SBML-formatted reconstructions of an organism's metabolic network — every reaction, every metabolite, every gene-protein-reaction mapping — and are the input data structure for the constraint-based modeling tools listed in [Software.md / Metabolic Modeling & Strain Design](../Software.md#metabolic-modeling--strain-design). The chicken reconstruction below inherits network structure from the human reference GEMs catalogued in [HumanReference.md](./HumanReference.md).

### iES1300 — *Gallus gallus* (chicken)

Generic genome-scale metabolic reconstruction of chicken, published 2022 in *PLOS ONE* by Salehabadi, Motamedian, and Shojaosadati. Contains 2,427 reactions across 1,300 genes (hence the `i...1300` name); used to investigate network connectivity and identify potential biomarkers across chicken tissues. The reference GEM for cultivated chicken cell-line metabolic modeling, with SBML files provided as supplementary data.

Reference: [Papers.md #82](../Papers.md#82) (Salehabadi, Motamedian, & Shojaosadati 2022, *PLOS ONE*).

## Further reading

- Adjacent research areas: [Cellular Engineering](../ResearchAreas/CellEngineering.md), [Media Optimization](../ResearchAreas/MediaOptimization.md), [Bioprocess Control](../ResearchAreas/Bioprocess.md), [Metabolic Modeling](../ResearchAreas/MetabolicModeling.md).
- Atlases & functional genomics: [Livestock Multi-Tissue Atlases & Functional Genomics](../Databases.md#livestock-multi-tissue-atlases--functional-genomics) in `Databases.md`.
- Sequence & expression repositories: [GEO](../Databases.md#nih-gene-expression-omnibus-geo), [SRA](../Databases.md#nih-sequence-read-archive-sra), [Ensembl](../Databases.md#ensembl), [GenBank](../Databases.md#nih-genbank) — the canonical living indexes for the deposits curated here.
- Cross-species modeling tooling: [TranscriptFormer](../Software.md#transcriptformer) and [UCE](../Software.md#uce) in `Software.md`.
- Reference substrates: [HumanReference](./HumanReference.md), [CHOReference](./CHOReference.md). AI/ML benchmarks: [Benchmarks](./Benchmarks.md).
