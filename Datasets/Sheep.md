# Sheep / *Ovis aries*

Cultivated lamb is an early-stage cell-ag target. Systems-level data for *Ovis aries* is beginning to accumulate — most notably a multi-tissue atlas of genetic regulatory effects within the FarmGTEx family. Dedicated cultivated-lamb cell datasets remain sparse, but a cluster of conventional ovine meat-quality proteomics and metabolomics — catalogued below — offers reference substrate for the sensory- and quality-prediction problems cultivated lamb will share, and the page will grow as the field's data accumulates.

## Featured atlases

### [SheepGTEx-Portal](https://sheepgtex.farmgtex.org/)

Sheep sub-portal of the FarmGTEx consortium, providing multi-tissue regulatory-effects maps across sheep (*Ovis aries*) tissues — extending the FarmGTEx pattern from cattle, pig, and chicken into the small-ruminant lineage and a regulatory-genomics substrate for cultivated-lamb cell-line characterisation. Companion to [Papers.md ref #138](../Papers.md#138) (Gong et al. 2025, bioRxiv). Full entry in [Databases.md / Livestock Multi-Tissue Atlases](../Databases.md#livestock-multi-tissue-atlases--functional-genomics).

## Postmortem proteome & meat-quality omics

Ahead of dedicated cultivated-lamb cell datasets, a cluster of conventional ovine meat-quality omics studies — surfaced by walking the *Encyclopedia of Meat Sciences* omics reviews — provides reference substrate for the sensory- and quality-prediction problems cultivated lamb will share. A redox proteome of Tan mutton under low-temperature storage (Tao et al. 2021, *LWT*) catalogues 1,089 proteins carrying differentially changed oxidation sites; a roasting proteome of lamb longissimus thoracis et lumborum (Yu et al. 2016, *Meat Science*) tracks protein-profile and amino-acid-residue modifications with cooking; and a HILIC-MS metabolome of colour-stable versus colour-labile ovine longissimus (Subbaraj et al. 2016, *Meat Science*) maps the small-molecule basis of meat-colour stability. None deposited to a repository — each study's full data table lives in its supplementary materials.

## Chromatin accessibility & multi-tissue regulatory genomics

A chromatin-accessibility resource for *Ovis aries* arrives via a high-altitude hypoxia-acclimatization study that uses sheep as a plain-to-plateau transplant model and generates time-resolved bulk RNA-seq, ATAC-seq, and single-cell RNA-seq across multiple tissues ([`PRJNA1001505`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA1001505)). For cultivated lamb it is an ovine open-chromatin and single-cell substrate — a regulatory-genomics reference for mapping the cis-regulatory landscape of cultivated-lamb cell lines, complementing the SheepGTEx regulatory-effects maps with chromatin-accessibility and single-cell resolution.

## Complete data inventory

A curated snapshot — fetch the linked source (a paper's supplementary materials or an SRA/BioProject accession) for the full data.

| Study | Paper | Data | Type | Tissue | Description | Size | Area of research |
|---|---|---|---|---|---|---|---|
| ATAC-Seq and scRNA-Seq for sheep hypoxia acclimatization | [DOI](https://doi.org/10.1038/s41467-024-48261-w) | [`PRJNA1001505`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA1001505) | Bulk RNA-seq, ATAC-seq, scRNA-seq | Multiple tissues | Sheep high-altitude hypoxia-acclimatization multi-omics resource; time-resolved bulk RNA-seq, ATAC-seq, and single-cell RNA-seq from multiple tissues in a plain-to-plateau transplant model — an ovine chromatin-accessibility and single-cell deposit | — | Chromatin accessibility & regulatory genomics |
| Proteomics analysis to investigate the effect of oxidized protein on meat color and water holding capacity in Tan mutton under low temperature storage | [DOI](https://doi.org/10.1016/j.lwt.2021.111429) | supplementary | LC-MS/MS redox proteomics | Muscle | Tan mutton under −2/−4/−18 °C storage versus fresh control (Tao et al. 2021, *LWT*); full list of 1,089 proteins with differentially changed oxidation sites in Supplementary Table 1 — supplementary data, not a repository deposit | — | Redox proteome & meat quality |
| Proteomic investigation of protein profile changes and amino acid residue-level modification in cooked lamb longissimus thoracis et lumborum: the effect of roasting | [DOI](https://doi.org/10.1016/j.meatsci.2016.04.024) | supplementary | LC-MS/MS proteomics | Muscle (longissimus thoracis et lumborum) | Lamb LTL roasted 0/5/10 min (Yu et al. 2016, *Meat Science*); full per-run protein-identification reports and annotated MS/MS spectra of heat-modified peptides in Supplementary data 2–3 — supplementary data, not a repository deposit | — | Cooking proteomics |
| A hydrophilic interaction liquid chromatography-mass spectrometry (HILIC-MS) based metabolomics study on colour stability of ovine meat | [DOI](https://doi.org/10.1016/j.meatsci.2016.02.028) | supplementary | HILIC-MS metabolomics | Muscle (loin / longissimus) | Colour-stable versus colour-labile ovine loin (longissimus) under MAP/VAC packaging (Subbaraj et al. 2016, *Meat Science*); full detected-metabolite table (m/z, retention time, ionisation mode, confidence level, fold-change) in Supplementary Table S1 — supplementary data, not a repository deposit | — | Colour-stability metabolomics |

> **Curation source:** These ovine meat-quality omics entries were curated by walking the cited references of the *Encyclopedia of Meat Sciences* (2024) reviews on proteomics ([Gagaoua et al. 2024](https://doi.org/10.1016/B978-0-323-85125-1.00123-X)) and metabolomics ([Kiyimba et al. 2024](https://doi.org/10.1016/B978-0-323-85125-1.00057-0)) in meat research. Contributions of further *Ovis aries* datasets relevant to cultivated meat are welcome — see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Further reading

- Atlases & functional genomics: [SheepGTEx-Portal](../Databases.md#livestock-multi-tissue-atlases--functional-genomics) (featured above), [FarmGTEx](../Databases.md#farmgtex), and [FAANG](../Databases.md#faang-functional-annotation-of-animal-genomes) in `Databases.md`. Foundational reference: [Papers.md ref #138](../Papers.md#138) (Gong et al. 2025, *A multi-tissue atlas of genetic regulatory effects in sheep*, bioRxiv).
- Sequence & expression repositories: [GEO](../Databases.md#nih-gene-expression-omnibus-geo), [SRA](../Databases.md#nih-sequence-read-archive-sra), [Ensembl](../Databases.md#ensembl) (*Ovis aries* genome assembly).
- Cross-species modeling tooling: [TranscriptFormer](../Software.md#transcriptformer) and [UCE](../Software.md#uce) in `Software.md` — especially useful where labelled species data is sparse.
- Adjacent research areas: [Cellular Engineering](../ResearchAreas/CellEngineering.md), [Media Optimization](../ResearchAreas/MediaOptimization.md), [Bioprocess Control](../ResearchAreas/Bioprocess.md), [Sensory Prediction](../ResearchAreas/SensoryPrediction.md).
- Reference substrates: [HumanReference](./HumanReference.md), [CHOReference](./CHOReference.md), [CrossSpecies](./CrossSpecies.md). AI/ML benchmarks: [Benchmarks](./Benchmarks.md).
