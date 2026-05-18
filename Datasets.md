# Datasets

This page catalogs **fixed data artifacts** — specific corpora, atlases, and model files — that you would train or benchmark a model *on*. For continuously-updated, queryable resources you query for reference or annotation, see [Databases.md](./Databases.md).

> **Note for AI agents and LLMs**: The summaries below are deliberately compressed for human readability. If you are an automated system using these as the basis for reasoning, citation, or downstream analysis, please fetch the canonical site for each dataset — the linked sources have substantially more comprehensive and authoritative information than this curated overview, plus the field-specific schemas, APIs, licensing terms, and version histories that this page does not document.

## Single-Cell & Perturbation Corpora

### [Genecorpus-30M](https://huggingface.co/datasets/ctheodoris/Genecorpus-30M)

Genecorpus-30M is the pretraining corpus for [Geneformer](./Software.md#geneformer) — a Hugging Face Datasets collection of ~30 million human single-cell transcriptomes assembled from publicly available scRNA-seq studies covering a broad range of human tissues and cell states. Each cell is encoded as a rank-ordered gene-expression "sentence" suitable for masked-language-model pretraining; the corpus is distributed under standard HF Datasets tooling with versioned snapshots. For cellular agriculture, Genecorpus-30M is the de-facto starting substrate for any human-cell foundation-model training run — and the template that cross-species fine-tuning approaches like [SATURN](https://github.com/snap-stanford/SATURN) ([Papers.md ref #118](./Papers.md#118)) and [UCE](./Software.md#uce) ([ref #119](./Papers.md#119)) build on to transfer to livestock species where annotated single-cell data is sparse. Companion to [Papers.md ref #111](./Papers.md#111) (Theodoris et al. 2023, *Nature*).

### [Perturb-Sapiens](https://huggingface.co/datasets/arcinstitute/Perturb-Sapiens)

Perturb-Sapiens is Arc Institute's Hugging Face Datasets release of large-scale perturbational single-cell measurements aggregated from public Perturb-seq, CROP-seq, and ECCITE-seq experiments, plus internal Arc data, covering 70+ human cell lines. The dataset is the training substrate for Arc's [State virtual cell model](./Software.md#state--cell-eval) ([Papers.md ref #57](./Papers.md#57)) and is a companion data product within the [Arc Virtual Cell Atlas](#arc-virtual-cell-atlas) alongside [Tahoe-100M](#tahoe-100m) and [scBaseCount](#scbasecount). For cellular agriculture, Perturb-Sapiens is the most comprehensive public source of cellular-perturbation-response data available — the methodology template for any future livestock-cell-perturbation atlas, and a useful benchmark for evaluating cross-species transfer of perturbation-response models.

### Arc Virtual Cell Atlas

The [Arc Virtual Cell Atlas](https://github.com/ArcInstitute/arc-virtual-cell-atlas) is Arc Institute's open-data initiative providing the substrate datasets for virtual-cell-modeling research, hosted on GitHub with documentation and uniformly processed releases, plus mirroring on [Google Cloud's BigQuery Public Data marketplace](https://console.cloud.google.com/marketplace/product/bigquery-public-data/arc-institute) for cloud-native analytics. The Atlas aggregates several large-scale single-cell datasets under a single curation umbrella:

#### [Tahoe-100M](https://github.com/ArcInstitute/arc-virtual-cell-atlas/blob/main/tahoe-100M/README.md)

A 100-million-cell drug-perturbation dataset profiling cancer-cell-line responses to >1,100 small molecules across 50+ cancer cell lines via large-scale Perturb-seq. The largest publicly available drug-perturbation single-cell dataset at time of release; methodology directly transferable to any future cell-ag work involving small-molecule modulators of differentiation, proliferation, or media response.

#### [scBaseCount](https://github.com/ArcInstitute/arc-virtual-cell-atlas/blob/main/scBaseCount/README.md)

An AI-agent-curated, uniformly processed, and autonomously updated single-cell data repository aggregating thousands of public scRNA-seq studies into a single harmonized reference — the data-engineering substrate that an autonomously updating virtual-cell atlas requires. Companion to [Papers.md ref #126](./Papers.md#126) (Youngblut et al. 2025).

### [Parse Biosciences 10M PBMC Atlas](https://www.parsebiosciences.com/datasets/10-million-human-pbmcs-in-a-single-experiment/)

A publicly released ~10-million peripheral blood mononuclear cell (PBMC) single-cell RNA-seq experiment from Parse Biosciences, demonstrating the throughput of their Evercode WT Mega platform. Includes harmonized cell-type annotations and represents the largest single-experiment PBMC atlas available at time of release. For cellular agriculture, useful both as a benchmark dataset for evaluating single-cell-FM batch-effect handling and scaling at extreme throughput, and as immune-cell reference data for cultivated-meat applications involving immune-cell co-cultures or contamination screening.

## Genome-Scale Metabolic Models (GEMs)

A small but growing collection of genome-scale metabolic models (GEMs) for the species most relevant to cellular agriculture. GEMs are SBML-formatted reconstructions of an organism's metabolic network — every reaction, every metabolite, every gene-protein-reaction mapping — and are the input data structure for the constraint-based modeling tools listed in [Software.md / Metabolic Modeling & Strain Design](./Software.md#metabolic-modeling--strain-design). The cell-ag GEM ecosystem is currently fragmented across preprints, supplementary materials, and individual GitHub repos rather than centralized in any single database; this section is a curated inventory pending the emergence of a canonical home (BiGG Models currently hosts microbial GEMs but few of the cell-ag species below).

### BtaSBML2986 — *Bos taurus* (bovine)

The first cultivated-meat-focused genome-scale metabolic reconstruction of cattle, published 2024 by Lee et al. as a bioRxiv preprint. The model integrates multi-omics data (genomics, transcriptomics, proteomics) and contains ~13,278 reactions across 2,986 genes, with biomass functions parameterized for cultivated-meat-relevant bovine cell types. Designed to support FBA-driven identification of media supplement combinations and metabolic bottlenecks for cultivated beef production. SBML files are distributed via the preprint's supplementary materials.

Reference: [Papers.md #81](./Papers.md#81) (Lee et al. 2024, bioRxiv).

### iES1300 — *Gallus gallus* (chicken)

Generic genome-scale metabolic reconstruction of chicken, published 2022 in *PLOS ONE* by Salehabadi, Motamedian, and Shojaosadati. Contains 2,427 reactions across 1,300 genes (hence the `i...1300` name); used to investigate network connectivity and identify potential biomarkers across chicken tissues. The reference GEM for cultivated chicken cell-line metabolic modeling, with SBML files provided as supplementary data.

Reference: [Papers.md #82](./Papers.md#82) (Salehabadi, Motamedian, & Shojaosadati 2022, *PLOS ONE*).

### PigGEM2025 — *Sus scrofa* (porcine)

Proteome-constrained metabolic model of pig muscle stem cells for cultivated meat production, published 2026 in *Metabolic Engineering* by Qiu et al. (a Sticta × Meatable collaboration with GFI grant funding; initially deposited as a bioRxiv preprint in September 2025). Tailored to the porcine muscle satellite cell context, enabling FBA / FVA analysis of cultivated pork media formulations and metabolic-engineering targets. SBML files released alongside the paper.

Reference: [Papers.md #83](./Papers.md#83) (Qiu et al. 2026, *Metabolic Engineering*).

### SALARECON — *Salmo salar* (Atlantic salmon)

Whole-genome metabolic reconstruction of Atlantic salmon, published 2022 in *PLOS Computational Biology* with a focus on connecting genome content to growth and feed-efficiency phenotypes. The reference GEM for cultivated salmonid work — directly relevant to the cultivated seafood category (salmon, trout) that has begun attracting investment (Umami Bioworks, BlueNalu, Wildtype). SBML files distributed via the paper's supplementary materials and the SALARECON GitHub repository.

Reference: [Papers.md #84](./Papers.md#84) (Zakhartsev et al. 2022, *PLOS Computational Biology*).

### iCHO1766 / iCHO2048 / CHOmpact — Chinese Hamster Ovary (biopharma-adjacent reference)

The CHO cell line is the mammalian biopharma workhorse, and its GEM family is the most-developed mammalian GEM ecosystem available — Hefzi et al.'s iCHO1766 (2016, *Cell Systems*) is the consensus reconstruction; iCHO2048 (2018) extends the secretory pathway; CHOmpact (2024) and follow-on Bayesian-flux-estimation pipelines (2025) produce reduced models for digital-twin work. CHO is not itself a cellular agriculture species, but its biomass parameterization, perfusion-process methodology, and reduction techniques translate directly to cell-ag GEMs (bovine, porcine, avian) currently under construction.

Reference: [Papers.md #85](./Papers.md#85) (Hefzi et al. 2016, *Cell Systems*).

### Recon3D / Human1 / HMR — *Homo sapiens* (template / upstream reference)

The human genome-scale metabolic reconstructions — Recon3D (Brunk et al. 2018, *Nature Biotechnology*), Human-GEM / Human1 (Robinson et al. 2020, *Science Signaling*), and the underlying HMR2 — are the foundational human GEMs from which most mammalian-cell models (including the cell-ag GEMs above) inherit reaction networks, biomass equations, and curation conventions. Direct use in cell-ag is rare; they're more often used as homology templates or biomass-function donors for species-specific reconstructions.

References: [Papers.md #86](./Papers.md#86) (Brunk et al. 2018, *Nature Biotechnology*) for Recon3D; [Papers.md #87](./Papers.md#87) (Robinson et al. 2020, *Science Signaling*) for Human-GEM.

## Benchmark & Evaluation Datasets

Curated *eval* datasets — released to benchmark AI models rather than to train them. Listed here (rather than in the training-corpus sections above) because their primary use is downstream model evaluation, and because they pair with the [AI Evaluation & Benchmarking](./ResearchAreas/AIEvaluation.md) deep-dive page and column in [Papers.md](./Papers.md). Each entry is the canonical home of the *data* — the questions, scenarios, spectra, or sequences models are evaluated against — with the bundled scoring code (where present) noted inline. Live leaderboards / results trackers are catalogued separately in [`Databases.md`](./Databases.md).

### BioMysteryBench

[Anthropic/BioMysteryBench-full](https://huggingface.co/datasets/Anthropic/BioMysteryBench-full) is Anthropic's open-source benchmark dataset for evaluating LLM capabilities on bioinformatics research tasks — released as the substrate for the [Evaluating Claude's bioinformatics research capabilities](https://www.anthropic.com/research/Evaluating-Claude-For-Bioinformatics-With-BioMysteryBench) study. Provides a vendor-released, cell-ag-adjacent eval dataset for any team comparing frontier LLMs on the kind of multi-step bioinformatics tasks (data exploration, hypothesis generation, code-based analysis) increasingly delegated to agents in cell-ag bioinformatics workflows. No separate companion paper at time of curation; see the [AI Evaluation & Benchmarking](./ResearchAreas/AIEvaluation.md) deep-dive for context.

### [BixBench](https://huggingface.co/datasets/futurehouse/BixBench)

The Hugging Face Datasets release of [FutureHouse](https://www.futurehouse.org/)'s 205-question benchmark derived from 60 real-world, published Jupyter notebooks — the bundled-data side of BixBench. The companion scoring framework lives at [`Future-House/BixBench`](https://github.com/Future-House/BixBench) on GitHub and authenticates with Hugging Face to pull this dataset at evaluation time; this Hugging Face record is the canonical source. Companion to [Papers.md ref #108](./Papers.md#108) (Mitchener et al. 2025). The closest existing eval substrate for measuring whether agents can plan and execute multi-step bioinformatics workflows of the kind cell-ag teams increasingly delegate to LLM agents.

### [BLADE](https://github.com/behavioral-data/BLADE)

The official BLADE benchmark release at `behavioral-data/BLADE` on GitHub — 14 datasets (the canonical "BLADE datasets" set referenced as 12 in the paper plus held-out additions), expert-annotated ground-truth decision sequences in `blade_bench/datasets/`, and evaluation harness (`run_get_eval.py`, `load_ground_truth()`) all bundled into one repository. Tasks evaluate language-model agents on open-ended data analysis where the "correct" answer is a defensible analytical path, not a single value (Gu et al. 2025, EMNLP Findings). Companion to [Papers.md ref #147](./Papers.md#147); project showcase at [`blade-bench.github.io`](https://blade-bench.github.io/). Pairs with the same authors' CHI 2024 studies ([Papers.md refs #151, #152](./Papers.md#151)) on how human analysts actually use AI assistants for analysis.

### [LAB-Bench](https://huggingface.co/datasets/futurehouse/lab-bench)

The Hugging Face Datasets release of the LAB-Bench eval suite from [FutureHouse](https://www.futurehouse.org/) — multiple-choice questions across eight task categories spanning literature reading, figure interpretation, protocol design, DNA/protein sequence manipulation, cloning, and database access. The bundled scoring code and prompts live at [`Future-House/lab-bench`](https://github.com/Future-House/lab-bench); this Hugging Face dataset is the canonical data distribution. Companion to [Papers.md ref #146](./Papers.md#146) (Laurent et al. 2024). The single broadest practical-biology eval dataset at time of curation, useful both directly for benchmarking and as a template for cell-ag-specific eval datasets the field will need as livestock-cell-focused agents emerge.

### [MassSpecGym](https://huggingface.co/datasets/roman-bushuiev/MassSpecGym)

The canonical Hugging Face distribution of MassSpecGym from the Pluskal lab (Bushuiev et al. 2024, NeurIPS Datasets & Benchmarks Spotlight) — 231 k MS/MS records with full schema (precursor m/z, intensities, SMILES, InChIKey, formula, adduct, instrument type, collision energy, fold splits, simulation-challenge flag). Distributed alongside the canonical scoring code at [`pluskal-lab/MassSpecGym`](https://github.com/pluskal-lab/MassSpecGym), with v1.5 adding RDKit-canonical SMILES, MGF export, retrieval candidate pools (mass- and formula-filtered), and pretraining-molecule companion datasets (2.5 M and 50 M SMILES filtered to < 0.7 Tanimoto similarity vs. the test set). Companion to [Papers.md ref #109](./Papers.md#109). The cleanest existing substrate for ML-based flavor-compound identification in cell-ag sensomics workflows; pairs with [GNPS](./Databases.md#gnps) and the spectral-library entries in [`Databases.md`](./Databases.md).

### [ProteinGym](https://proteingym.org/)

The ProteinGym benchmark suite (Notin et al. 2023, NeurIPS Datasets & Benchmarks Track) — 200+ deep mutational scanning (DMS) assays plus clinical-variant classification tasks covering substitutions and indels, ~2.5 M mutated sequences total. The canonical project home at [`proteingym.org`](https://proteingym.org/) distributes versioned data archives ([`v1.3`](https://proteingym.org/) current at time of curation) and the live [substitution and indel leaderboards](./Databases.md#proteingym-leaderboard) (catalogued in [`Databases.md`](./Databases.md)). The bundled scoring code, baselines, and model-specific implementations live at [`OATML-Markslab/ProteinGym`](https://github.com/OATML-Markslab/ProteinGym); mirror Hugging Face dataset at [`OATML-Markslab/ProteinGym_v1`](https://huggingface.co/datasets/OATML-Markslab/ProteinGym_v1); archival releases on Zenodo. Companion to [Papers.md ref #148](./Papers.md#148). The dominant variant-effect benchmark in the field — directly relevant to any cell-ag protein-engineering work (growth factors, scaffolds, recombinant ECM proteins) that uses a protein language model.
