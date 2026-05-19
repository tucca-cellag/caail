# Cow / *Bos taurus*

Cattle are the highest-profile cultivated-meat target — cultivated beef draws the largest share of cultivated-meat investment, and bovine satellite cells are the most-studied myogenic system in the field. This page collects the fixed data artifacts relevant to engineering and modeling bovine cells for cultivated beef: the genome-scale metabolic model, the multi-tissue atlases, and individual transcriptomic / epigenomic deposits spanning satellite-cell heterogeneity, serum-free differentiation, adipogenesis, and breed comparison.

## Featured atlases

### [CattleGTEx](https://ngdc.cncb.ac.cn/cattleca/home)

Cattle sub-portal of the FarmGTEx consortium, providing bulk and single-cell multi-tissue expression atlases for cattle (*Bos taurus*) — directly relevant to cultivated-beef cell-line characterization and engineering. Companion to [Papers.md ref #137](../Papers.md#137) (Han et al. 2025, the single-cell atlas paper). Full entry in [Databases.md / Livestock Multi-Tissue Atlases](../Databases.md#livestock-multi-tissue-atlases--functional-genomics).

### [BovReg](https://bovreg.eu/)

The FAANG consortium's cattle functional-annotation project, mapping functionally active genomic features in cattle (*Bos taurus*); the [data hub](https://data.faang.org/projects/BovReg) hosts its open releases. A regulatory-element substrate complementary to CattleGTEx for cultivated-beef cell-line characterisation. Full entry in [Databases.md / Livestock Multi-Tissue Atlases](../Databases.md#livestock-multi-tissue-atlases--functional-genomics).

## Genome-scale metabolic models

GEMs are SBML-formatted reconstructions of an organism's metabolic network — every reaction, every metabolite, every gene-protein-reaction mapping — and are the input data structure for the constraint-based modeling tools listed in [Software.md / Metabolic Modeling & Strain Design](../Software.md#metabolic-modeling--strain-design). The cell-ag GEM ecosystem is fragmented across preprints, supplementary materials, and individual GitHub repos; the bovine reconstruction below inherits network structure from the human reference GEMs catalogued in [HumanReference.md](./HumanReference.md).

### BtaSBML2986 — *Bos taurus* (bovine)

The first cultivated-meat-focused genome-scale metabolic reconstruction of cattle, published 2024 by Lee et al. as a bioRxiv preprint. The model integrates multi-omics data (genomics, transcriptomics, proteomics) and contains ~13,278 reactions across 2,986 genes, with biomass functions parameterized for cultivated-meat-relevant bovine cell types. Designed to support FBA-driven identification of media supplement combinations and metabolic bottlenecks for cultivated beef production. SBML files are distributed via the preprint's supplementary materials.

Reference: [Papers.md #81](../Papers.md#81) (Lee et al. 2024, bioRxiv).

## Bovine satellite cells & cultured-meat differentiation

The most directly cultivated-meat-relevant bovine datasets profile satellite cells — the myogenic progenitors cultivated beef is grown from — across isolation, expansion, and differentiation. Single-cell RNA-seq of cultured bovine satellite cells (`GSE184128`) and of muscle-derived cell types sampled across long-term culture (`GSE211428`) characterise the heterogeneity and drift of the starting population, while single-nucleus RNA-seq of serum-free differentiation (`GSE240556`) and the serum-free media-formulation study (`GSE173199`) map the transcriptional response to the FBS-replacement strategies central to scaling cultivated beef.

## Chromatin accessibility & muscle development

A second cluster maps the regulatory genome of bovine skeletal muscle. Single-cell RNA-seq plus scATAC-seq of developing muscle (`CRA006626`) and ATAC-seq across indicine cattle tissues (`GSE182909`) resolve the chromatin landscape underlying myogenic development, and the multi-species functional-annotation effort (`GSE158430`, which also covers pig — see [Pig.md](./Pig.md)) adds CTCF ChIP-seq and ATAC-seq across eight tissues. A companion bovine myoblast proliferation/differentiation dataset is listed in the inventory for completeness though its SRA accession is marked unavailable in the source survey.

## Adipogenesis, fibrogenesis & breed comparison

Marbling — intramuscular fat — is a key cultivated-beef quality target. A single-cell atlas of bovine skeletal muscle (`GSE205347`) dissects the adipogenic and fibrogenic cell populations across Wagyu, Brahman, and crossbred calves, complemented by a Wagyu-vs-Chinese-Red-Steppe differential-expression study (`GSE161967`) and a Hanwoo satellite-cell differentiation dataset spanning two muscle groups.

## Complete data inventory

A curated snapshot. NCBI accessions are the canonical living source — fetch the linked accession for current sample counts, file sizes, and availability.

| Study | Type | Tissue | Description | Size | Area of research |
|---|---|---|---|---|---|
| [Single-cell RNA sequencing reveals heterogeneity of cultured bovine satellite cells](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE184128) | scRNA-seq | Muscle | Satellite cells from a male calf, one week in growth medium, two 10x libraries | 265.1 Gb, 860 M reads | Satellite-cell heterogeneity |
| [Single-cell analysis of bovine muscle-derived cell types for cultured meat production](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE211428) | scRNA-seq | Muscle | 5 time points across long-term culture: post-isolation, 72 h, passages 2/5/8 | 462.12 Gb | Cultured meat |
| [Optimisation of cell fate determination for cultured muscle differentiation](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE240556) | snRNA-seq | Muscle | Bovine satellite cells in serum-free differentiation medium, harvested 0/24/48/72/96 h | 52.97 Gb | Cultured meat |
| [A serum-free media formulation for cultured meat production supports bovine satellite cell differentiation](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE173199) | RNA-seq | Muscle | Serum-starvation series (20%→2% FBS) and SFM vs 20% FBS comparison | 93.25 Gb | Cultured meat |
| [Transcriptional and open chromatin analysis of bovine skeletal muscle development by single-cell sequencing](https://ngdc.cncb.ac.cn/gsa/search?searchTerm=CRA006626) | scRNA-seq + scATAC-seq | Muscle | Developing bovine skeletal muscle across gestational, lactational, and adult stages | — | Developmental biology |
| [Functional annotations of three domestic animal genomes](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE158430) | ChIP-seq + ATAC-seq | 8 tissues incl. skeletal muscle, adipose | ATAC-seq and CTCF ChIP-seq across 8 tissues in 2–3 livestock species; also covers pig (see [Pig.md](./Pig.md)) | 6.8 B ChIP-seq reads, 1.19 B ATAC-seq reads | Comparative epigenomics |
| Transcriptional states and chromatin accessibility during bovine myoblast proliferation and differentiation | RNA-seq + ATAC-seq | Muscle | Bovine myoblast proliferation/differentiation; SRA accession `PRJNA790762` marked unavailable in source | — | Epigenetics, developmental biology |
| [Chromatin accessibility and regulatory vocabulary across indicine cattle tissues](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE182909) | ATAC-seq + RNA-seq | Liver, Muscle, Hypothalamus | ATAC-seq in liver, muscle, hypothalamus of indicine cattle (also GEO `GSB-113`, `GSB-8708`) | 60.74 Gb | Epigenetics, developmental biology |
| [A single-cell atlas of bovine skeletal muscle reveals mechanisms regulating intramuscular adipogenesis and fibrogenesis](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE205347) | scRNA-seq | Muscle | Longissimus dorsi cells from 4-month Wagyu, Brahman, and crossbred heifer calves | 765.33 Gb | Adipogenesis & fibrogenesis |
| [RNA-Seq analysis identifies differentially expressed genes in the longissimus dorsi of Wagyu and Chinese Red Steppe cattle](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE161967) | RNA-seq | Muscle | Wagyu and Chinese Red Steppe cattle slaughtered at 28 months, longissimus dorsi, triplicate | 26.85 Gb | Breed comparison & meat quality |
| Gene expression of Hanwoo satellite cell differentiation in longissimus dorsi and semimembranosus | RNA-seq | Muscle | LD and SM muscle of three Korean Hanwoo newborn calves; RNA-seq data available on request | ~35.7 M reads/sample | Embryonic myogenesis |

> **Curation source:** The deposit entries above were initially curated from the supplemental Table 1 of Todhunter et al. 2024 ([Papers.md ref #132](../Papers.md#132)). Subsequent additions come from CAAIL contributors.

## Further reading

- Adjacent research areas: [Cellular Engineering](../ResearchAreas/CellEngineering.md), [Media Optimization](../ResearchAreas/MediaOptimization.md) (the FBS-replacement problem that motivates much cultivated-beef media work), [Bioprocess Control](../ResearchAreas/Bioprocess.md), [Metabolic Modeling](../ResearchAreas/MetabolicModeling.md).
- Atlases & functional genomics: [Livestock Multi-Tissue Atlases & Functional Genomics](../Databases.md#livestock-multi-tissue-atlases--functional-genomics) in `Databases.md`.
- Sequence & expression repositories: [GEO](../Databases.md#nih-gene-expression-omnibus-geo), [SRA](../Databases.md#nih-sequence-read-archive-sra), [Ensembl](../Databases.md#ensembl), [GenBank](../Databases.md#nih-genbank) — the canonical living indexes for the deposits curated here.
- Metabolome reference: [Bovine Metabolome Database (BMDB)](../Databases.md#bovine-metabolome-database-bmdb).
- Cross-species modeling tooling: [TranscriptFormer](../Software.md#transcriptformer) and [UCE](../Software.md#uce) in `Software.md`.
- Reference substrates: [HumanReference](./HumanReference.md), [CHOReference](./CHOReference.md). AI/ML benchmarks: [Benchmarks](./Benchmarks.md).
