# Chicken / *Gallus gallus*

Chicken is a leading cultivated-meat target — cultivated chicken was among the first products to reach regulatory approval — and *Gallus gallus* is among the first non-mammalian livestock species to gain a GTEx-style atlas. This page collects the fixed data artifacts relevant to cultivated chicken: the chicken genome-scale metabolic model, the multi-tissue atlases, and individual deposits spanning fibroblast immortalization for serum-free production, myogenesis, and skeletal-muscle development.

## Featured atlases

### [ChickenGTEx-Portal](https://chicken.farmgtex.org/)

Chicken sub-portal of the FarmGTEx consortium — multi-tissue genetic-regulation maps across chicken tissues, the first GTEx-style resource for a non-mammalian amniote livestock species and directly useful for cultivated-chicken cell-line engineering. Companion to [Papers.md ref #136](../Papers.md#136) (Guan et al. 2025, *Nature Genetics*). Full entry in [Databases.md / Livestock Multi-Tissue Atlases](../Databases.md#livestock-multi-tissue-atlases--functional-genomics).

### [GENE-SWitCH](https://www.gene-switch.eu/)

The FAANG consortium's pig + chicken project — *the regulatory GENomE of SWine and CHicken: functional annotation during development*; the [data hub](https://data.faang.org/projects/GENE-SWitCH) hosts its open releases. Substrate for cultivated-chicken developmental-biology and lineage-engineering work. Full entry in [Databases.md / Livestock Multi-Tissue Atlases](../Databases.md#livestock-multi-tissue-atlases--functional-genomics).

## Genome-scale metabolic models

GEMs are SBML-formatted reconstructions of an organism's metabolic network — every reaction, every metabolite, every gene-protein-reaction mapping — and are the input data structure for the constraint-based modeling tools listed in [Software.md / Metabolic Modeling & Strain Design](../Software.md#metabolic-modeling--strain-design). The chicken reconstruction below inherits network structure from the human reference GEMs catalogued in [HumanReference.md](./HumanReference.md).

### iES1300 — *Gallus gallus* (chicken)

Generic genome-scale metabolic reconstruction of chicken, published 2022 in *PLOS ONE* by Salehabadi, Motamedian, and Shojaosadati. Contains 2,427 reactions across 1,300 genes (hence the `i...1300` name); used to investigate network connectivity and identify potential biomarkers across chicken tissues. A generic chicken GEM that serves as a starting point for cultivated-chicken cell-line metabolic modelling, with SBML files provided as supplementary data.

Reference: [Papers.md #82](../Papers.md#82) (Salehabadi, Motamedian, & Shojaosadati 2022, *PLOS ONE*).

## Cultured-meat cell lines & serum-free production

The most directly cultivated-meat-relevant chicken dataset profiles the spontaneous immortalization of chicken fibroblasts into stable, high-yield cell lines for serum-free cultured-meat production (`GSE169291`, *Nature Food*) — RNA-seq of primary and immortalized fibroblasts from two chicken breeds (Broiler Ross 308, Israeli Baladi). Immortalized, serum-free-adapted lines are a central enabling technology for cultivated chicken, and this is one of the few public datasets characterising that transition.

## Myogenesis, satellite cells & nutrient regulation

Two datasets probe the myogenic program and its modulation. RNA-seq of chicken myoblasts under betaine treatment (`CRA006598`) examines nutrient regulation of myogenesis, and RNA-seq of broiler satellite cells under hypoxic culture (`GSE241619`) shows how oxygen tension shifts the balance between proliferation and differentiation — both directly relevant to media and bioprocess design for cultivated chicken.

## Skeletal-muscle development & profiling

Two further datasets build reference profiles of chicken skeletal muscle: a comprehensive expression survey of specific chicken skeletal muscles (`SRP374834`, *Scientific Data*) and a dynamic dual time-series comparing fast-growing Arbor Acres broilers with slow-growing Lushi chickens across embryonic and post-hatch stages (`PRJNA729271`).

## Complete data inventory

A curated snapshot. NCBI / NGDC accessions are the canonical living source — fetch the linked accession for current sample counts, file sizes, and availability.

| Study | Type | Tissue | Description | Size | Area of research |
|---|---|---|---|---|---|
| [Spontaneous immortalization of chicken fibroblasts generates stable, high-yield cell lines for serum-free production of cultured meat](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE169291) | RNA-seq | Embryo | Primary and immortalized fibroblasts from 2 chicken breeds (Broiler Ross 308; Israeli Baladi), 3 replicates each | 163.68 Gb | Cultured meat |
| [RNA sequencing reveals the regulation of betaine on chicken myogenesis](https://ngdc.cncb.ac.cn/gsa/search?searchTerm=CRA006598) | RNA-seq | Muscle | 12 myoblast-cell samples, 3 replicates per betaine treatment | 69.12 Gb | Chicken myogenesis |
| [Gene expression profiles of specific chicken skeletal muscles](https://www.ncbi.nlm.nih.gov/sra/?term=SRP374834) | RNA-seq | Muscle | 4 or 6 biological replicates of each skeletal muscle | 418.4 Gb | Chicken skeletal muscle |
| [Comparative analyses of dynamic transcriptome profiles for muscle development and growth in chicken](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA729271) | RNA-seq | Muscle | Breast-muscle time-series of fast-growing Arbor Acres and slow-growing Lushi chickens at E10/14/18, post-hatch d1, w1/3/5 | 605 Gb | Breast-muscle development |
| [Hypoxia promotes proliferation and inhibits myogenesis in broiler satellite cells](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE241619) | RNA-seq | Muscle | Pectoralis-major satellite cells under hypoxic culture, harvested 0/12/24/36/48 h after differentiation | 4 Gb | Muscle growth |

> **Curation source:** The deposit entries above were initially curated from the supplemental Table 1 of Todhunter et al. 2024 ([Papers.md ref #132](../Papers.md#132)). Subsequent additions come from CAAIL contributors.

## Further reading

- Adjacent research areas: [Cellular Engineering](../ResearchAreas/CellEngineering.md), [Media Optimization](../ResearchAreas/MediaOptimization.md), [Bioprocess Control](../ResearchAreas/Bioprocess.md), [Metabolic Modeling](../ResearchAreas/MetabolicModeling.md).
- Atlases & functional genomics: [Livestock Multi-Tissue Atlases & Functional Genomics](../Databases.md#livestock-multi-tissue-atlases--functional-genomics) in `Databases.md`.
- Sequence & expression repositories: [GEO](../Databases.md#nih-gene-expression-omnibus-geo), [SRA](../Databases.md#nih-sequence-read-archive-sra), [Ensembl](../Databases.md#ensembl), [GenBank](../Databases.md#nih-genbank) — the canonical living indexes for the deposits curated here.
- Cross-species modeling tooling: [TranscriptFormer](../Software.md#transcriptformer) and [UCE](../Software.md#uce) in `Software.md`.
- Reference substrates: [HumanReference](./HumanReference.md), [CHOReference](./CHOReference.md), [CrossSpecies](./CrossSpecies.md). AI/ML benchmarks: [Benchmarks](./Benchmarks.md).
- Reference texts: [*Encyclopedia of Meat Sciences*, 3rd ed.](../OtherResources.md#encyclopedia-of-meat-sciences-3rd-edition) (Dikeman, ed., 2024) — especially [*Biotechnology approaches in poultry meat production*](https://doi.org/10.1016/B978-0-323-85125-1.00180-0) (Golkar-Narenji & Mozdziak 2024) as the conventional-poultry biotechnology reference paired with the cultivated-chicken work above.
