# Cow / *Bos taurus*

Cattle are the highest-profile cultivated-meat target — cultivated beef draws the largest share of cultivated-meat investment, and bovine satellite cells are the most-studied myogenic system in the field. This page collects the fixed data artifacts relevant to engineering and modeling bovine cells for cultivated beef: the genome-scale metabolic model, the multi-tissue atlases, and individual transcriptomic / epigenomic deposits spanning satellite-cell heterogeneity, serum-free differentiation, adipogenesis, and breed comparison.

## Genome-scale metabolic models

GEMs are SBML-formatted reconstructions of an organism's metabolic network — every reaction, every metabolite, every gene-protein-reaction mapping — and are the input data structure for the constraint-based modeling tools listed in [Software.md / Metabolic Modeling & Strain Design](../Software.md#metabolic-modeling--strain-design). The cell-ag GEM ecosystem is fragmented across preprints, supplementary materials, and individual GitHub repos; the bovine reconstruction below inherits network structure from the human reference GEMs catalogued in [HumanReference.md](./HumanReference.md).

### BtaSBML2986 — *Bos taurus* (bovine)

The first cultivated-meat-focused genome-scale metabolic reconstruction of cattle, published 2024 by Lee et al. as a bioRxiv preprint. The model integrates multi-omics data (genomics, transcriptomics, proteomics) and contains ~13,278 reactions across 2,986 genes, with biomass functions parameterized for cultivated-meat-relevant bovine cell types. Designed to support FBA-driven identification of media supplement combinations and metabolic bottlenecks for cultivated beef production. SBML files are distributed via the preprint's supplementary materials.

Reference: [Papers.md #81](../Papers.md#81) (Lee et al. 2024, bioRxiv).

## Further reading

- Adjacent research areas: [Cellular Engineering](../ResearchAreas/CellEngineering.md), [Media Optimization](../ResearchAreas/MediaOptimization.md) (the FBS-replacement problem that motivates much cultivated-beef media work), [Bioprocess Control](../ResearchAreas/Bioprocess.md), [Metabolic Modeling](../ResearchAreas/MetabolicModeling.md).
- Atlases & functional genomics: [Livestock Multi-Tissue Atlases & Functional Genomics](../Databases.md#livestock-multi-tissue-atlases--functional-genomics) in `Databases.md`.
- Sequence & expression repositories: [GEO](../Databases.md#nih-gene-expression-omnibus-geo), [SRA](../Databases.md#nih-sequence-read-archive-sra), [Ensembl](../Databases.md#ensembl), [GenBank](../Databases.md#nih-genbank) — the canonical living indexes for the deposits curated here.
- Metabolome reference: [Bovine Metabolome Database (BMDB)](../Databases.md#bovine-metabolome-database-bmdb).
- Cross-species modeling tooling: [TranscriptFormer](../Software.md#transcriptformer) and [UCE](../Software.md#uce) in `Software.md`.
- Reference substrates: [HumanReference](./HumanReference.md), [CHOReference](./CHOReference.md). AI/ML benchmarks: [Benchmarks](./Benchmarks.md).
