# CHO Reference (Chinese Hamster Ovary)

The Chinese Hamster Ovary (CHO) cell line is the dominant mammalian host for recombinant-protein biomanufacturing. CHO is not a cellular agriculture species, but it is the closest mature analogue for cell-ag process modeling: its genome-scale metabolic models are the most-developed mammalian-cell GEM ecosystem available, and its biomass parameterization, perfusion-process methodology, and model-reduction techniques translate directly to the cultivated-meat GEMs (bovine, porcine, avian, salmonid) catalogued on the per-species pages of this directory. This page collects the CHO reference reconstructions as a biopharma-adjacent substrate.

## Genome-scale metabolic models

### iCHO1766 / iCHO2048 / CHOmpact — Chinese Hamster Ovary (biopharma-adjacent reference)

The CHO cell line is the mammalian biopharma workhorse, and its GEM family is the most-developed mammalian GEM ecosystem available — Hefzi et al.'s iCHO1766 (2016, *Cell Systems*) is the consensus reconstruction; iCHO2048 (2018) extends the secretory pathway; CHOmpact (2024) and follow-on Bayesian-flux-estimation pipelines (2025) produce reduced models for digital-twin work. CHO is not itself a cellular agriculture species, but its biomass parameterization, perfusion-process methodology, and reduction techniques translate directly to cell-ag GEMs (bovine, porcine, avian) currently under construction.

Reference: [Papers.md #85](../Papers.md#85) (Hefzi et al. 2016, *Cell Systems*).

> **Curation source:** This entry is long-standing CAAIL curation, migrated from the prior flat `Datasets.md`. CHO is a biopharma-adjacent reference rather than a cultivated-meat species, so it is not drawn from the Todhunter et al. 2024 supplemental.

## Further reading

- CHO-focused metabolic-modeling methodology: [Papers.md ref #59](../Papers.md#59) (Antonakoudis & Richelle 2026, data-driven GEM reduction for bioprocess modeling) — a CHO case study whose reduction approach is directly applicable to cell-ag digital twins.
- Constraint-based modeling tools: [Software.md / Metabolic Modeling & Strain Design](../Software.md#metabolic-modeling--strain-design).
- Cell-ag livestock GEMs that adapt CHO process methodology: [Cow](./Cow.md), [Pig](./Pig.md), [Chicken](./Chicken.md), [Fish](./Fish.md).
- Bioprocess context: [ResearchAreas/Bioprocess.md](../ResearchAreas/Bioprocess.md), [ResearchAreas/MetabolicModeling.md](../ResearchAreas/MetabolicModeling.md).
- Human reference reconstructions: [HumanReference](./HumanReference.md).
