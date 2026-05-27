# Human Reference (*Homo sapiens*)

Cellular agriculture engineers livestock cells, but the largest and best-annotated single-cell corpora — and the most mature genome-scale metabolic reconstructions — are human. This page collects those human artifacts, because they are the practical substrate cell-ag modeling builds on: human single-cell foundation-model corpora are the pretraining base that cross-species transfer methods adapt to livestock, and the human GEMs are the homology templates and biomass-function donors from which species-specific livestock reconstructions inherit their reaction networks. Human is not a cultivated-meat target species — it is the reference substrate.

## Single-cell & perturbation corpora

### [Genecorpus-30M](https://huggingface.co/datasets/ctheodoris/Genecorpus-30M)

Genecorpus-30M is the pretraining corpus for [Geneformer](../Software.md#geneformer) — a Hugging Face Datasets collection of ~30 million human single-cell transcriptomes assembled from publicly available scRNA-seq studies covering a broad range of human tissues and cell states. Each cell is encoded as a rank-ordered gene-expression "sentence" suitable for masked-language-model pretraining; the corpus is distributed under standard HF Datasets tooling with versioned snapshots. For cellular agriculture, Genecorpus-30M is the de-facto starting substrate for any human-cell foundation-model training run — and the template that cross-species fine-tuning approaches like [SATURN](https://github.com/snap-stanford/SATURN) ([Papers.md ref #118](../Papers.md#118)) and [UCE](../Software.md#uce) ([ref #119](../Papers.md#119)) build on to transfer to livestock species where annotated single-cell data is sparse. Companion to [Papers.md ref #111](../Papers.md#111) (Theodoris et al. 2023, *Nature*).

### [Perturb-Sapiens](https://huggingface.co/datasets/arcinstitute/Perturb-Sapiens)

Perturb-Sapiens is Arc Institute's Hugging Face Datasets release of large-scale perturbational single-cell measurements aggregated from public Perturb-seq, CROP-seq, and ECCITE-seq experiments, plus internal Arc data, covering 70+ human cell lines. The dataset is the training substrate for Arc's [State virtual cell model](../Software.md#state--cell-eval) ([Papers.md ref #57](../Papers.md#57)) and is a companion data product within the [Arc Virtual Cell Atlas](#arc-virtual-cell-atlas) alongside [Tahoe-100M](#tahoe-100m) and [scBaseCount](#scbasecount). For cellular agriculture, Perturb-Sapiens is the most comprehensive public source of cellular-perturbation-response data available — the methodology template for any future livestock-cell-perturbation atlas, and a useful benchmark for evaluating cross-species transfer of perturbation-response models.

### Arc Virtual Cell Atlas

The [Arc Virtual Cell Atlas](https://github.com/ArcInstitute/arc-virtual-cell-atlas) is Arc Institute's open-data initiative providing the substrate datasets for virtual-cell-modeling research, hosted on GitHub with documentation and uniformly processed releases, plus mirroring on [Google Cloud's BigQuery Public Data marketplace](https://console.cloud.google.com/marketplace/product/bigquery-public-data/arc-institute) for cloud-native analytics. The Atlas aggregates several large-scale single-cell datasets under a single curation umbrella:

#### [Tahoe-100M](https://github.com/ArcInstitute/arc-virtual-cell-atlas/blob/main/tahoe-100M/README.md)

A 100-million-cell drug-perturbation dataset profiling cancer-cell-line responses to >1,100 small molecules across 50+ cancer cell lines via large-scale Perturb-seq. The largest publicly available drug-perturbation single-cell dataset at time of release; methodology directly transferable to any future cell-ag work involving small-molecule modulators of differentiation, proliferation, or media response.

#### [scBaseCount](https://github.com/ArcInstitute/arc-virtual-cell-atlas/blob/main/scBaseCount/README.md)

An AI-agent-curated, uniformly processed, and autonomously updated single-cell data repository aggregating thousands of public scRNA-seq studies into a single harmonized reference — the data-engineering substrate that an autonomously updating virtual-cell atlas requires. Companion to [Papers.md ref #126](../Papers.md#126) (Youngblut et al. 2025).

### [Parse Biosciences 10M PBMC Atlas](https://www.parsebiosciences.com/datasets/10-million-human-pbmcs-in-a-single-experiment/)

A publicly released ~10-million peripheral blood mononuclear cell (PBMC) single-cell RNA-seq experiment from Parse Biosciences, demonstrating the throughput of their Evercode WT Mega platform. Includes harmonized cell-type annotations and represents the largest single-experiment PBMC atlas available at time of release. For cellular agriculture, useful both as a benchmark dataset for evaluating single-cell-FM batch-effect handling and scaling at extreme throughput, and as immune-cell reference data for cultivated-meat applications involving immune-cell co-cultures or contamination screening.

## Genome-scale metabolic models

GEMs are SBML-formatted reconstructions of an organism's metabolic network — every reaction, every metabolite, every gene-protein-reaction mapping — and are the input data structure for the constraint-based modeling tools listed in [Software.md / Metabolic Modeling & Strain Design](../Software.md#metabolic-modeling--strain-design). The human reconstructions below are the upstream reference from which the cell-ag livestock GEMs (catalogued on the per-species pages) inherit network structure and curation conventions.

### Recon3D / Human1 / HMR — *Homo sapiens* (template / upstream reference)

The human genome-scale metabolic reconstructions — Recon3D (Brunk et al. 2018, *Nature Biotechnology*), Human-GEM / Human1 (Robinson et al. 2020, *Science Signaling*), and the underlying HMR2 — are the foundational human GEMs from which most mammalian-cell models (including the cell-ag GEMs in the per-species pages of this directory) inherit reaction networks, biomass equations, and curation conventions. Direct use in cell-ag is rare; they're more often used as homology templates or biomass-function donors for species-specific reconstructions.

References: [Papers.md #86](../Papers.md#86) (Brunk et al. 2018, *Nature Biotechnology*) for Recon3D; [Papers.md #87](../Papers.md#87) (Robinson et al. 2020, *Science Signaling*) for Human-GEM.

> **Curation source:** These entries are long-standing CAAIL curation, migrated from the prior flat `Datasets.md`. They are cross-species reference substrate rather than cultivated-meat-species data, so — unlike the per-species pages — they are not drawn from the Todhunter et al. 2024 supplemental.

## Further reading

- Cross-species transfer tooling: [SATURN](https://github.com/snap-stanford/SATURN), [UCE](../Software.md#uce), [Geneformer](../Software.md#geneformer), and [TranscriptFormer](../Software.md#transcriptformer) in `Software.md` — the methods that adapt human single-cell pretraining to livestock species.
- Human reference databases: [Human Cell Atlas](../Databases.md#human-cell-atlas-hca), [CZ CELLxGENE](../Databases.md#cz-cellxgene), [Human Protein Atlas](../Databases.md#human-protein-atlas), and [HMDB](../Databases.md#human-metabolome-database-hmdb) in `Databases.md`.
- Adjacent single-cell atlases: Abbassi-Daloii et al. 2023, *eLife*, [A transcriptome atlas of leg muscles from healthy human volunteers reveals molecular and cellular signatures associated with muscle location](https://doi.org/10.7554/eLife.80500) — multi-muscle transcriptome reference resolving anatomical-location signatures across healthy human leg muscles, useful as a benchmark template for cross-species muscle-atlas work.
- Per-species livestock GEMs that inherit from these reference reconstructions: [Cow](./Cow.md), [Pig](./Pig.md), [Chicken](./Chicken.md), [Fish](./Fish.md).
- Biopharma-adjacent reference: [CHOReference](./CHOReference.md).
- AI/ML benchmarks: [Benchmarks](./Benchmarks.md).
