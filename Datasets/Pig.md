# Pig / *Sus scrofa*

Pigs are a major cultivated-meat target and, via the FarmGTEx pig effort, one of the best-characterized livestock species at the systems-genetics level. This page collects the fixed data artifacts relevant to cultivated pork: the porcine muscle-stem-cell genome-scale metabolic model, the multi-tissue atlases, and individual deposits spanning myogenesis, the cellular landscape of skeletal muscle, marbling and intramuscular-fat biology, and 3D meat-like tissue work.

## Genome-scale metabolic models

GEMs are SBML-formatted reconstructions of an organism's metabolic network — every reaction, every metabolite, every gene-protein-reaction mapping — and are the input data structure for the constraint-based modeling tools listed in [Software.md / Metabolic Modeling & Strain Design](../Software.md#metabolic-modeling--strain-design). The porcine reconstruction below inherits network structure from the human reference GEMs catalogued in [HumanReference.md](./HumanReference.md).

### PigGEM2025 — *Sus scrofa* (porcine)

Proteome-constrained metabolic model of pig muscle stem cells for cultivated meat production, published 2026 in *Metabolic Engineering* by Qiu et al. (a Sticta × Meatable collaboration with GFI grant funding; initially deposited as a bioRxiv preprint in September 2025). Tailored to the porcine muscle satellite cell context, enabling FBA / FVA analysis of cultivated pork media formulations and metabolic-engineering targets. SBML files released alongside the paper.

Reference: [Papers.md #83](../Papers.md#83) (Qiu et al. 2026, *Metabolic Engineering*).

## Further reading

- Adjacent research areas: [Cellular Engineering](../ResearchAreas/CellEngineering.md), [Media Optimization](../ResearchAreas/MediaOptimization.md), [Bioprocess Control](../ResearchAreas/Bioprocess.md), [Sensory Prediction](../ResearchAreas/SensoryPrediction.md) (cultivated porcine adipose tissue as a flavor enhancer), [Metabolic Modeling](../ResearchAreas/MetabolicModeling.md).
- Atlases & functional genomics: [Livestock Multi-Tissue Atlases & Functional Genomics](../Databases.md#livestock-multi-tissue-atlases--functional-genomics) in `Databases.md`.
- Sequence & expression repositories: [GEO](../Databases.md#nih-gene-expression-omnibus-geo), [SRA](../Databases.md#nih-sequence-read-archive-sra), [Ensembl](../Databases.md#ensembl) — the canonical living indexes for the deposits curated here.
- Cross-species modeling tooling: [TranscriptFormer](../Software.md#transcriptformer) and [UCE](../Software.md#uce) in `Software.md`.
- Reference substrates: [HumanReference](./HumanReference.md), [CHOReference](./CHOReference.md). AI/ML benchmarks: [Benchmarks](./Benchmarks.md).
