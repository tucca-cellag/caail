# Matrix taxonomy — what each row and column means

The [`Papers.md`](./Papers.md) matrix pairs an **AI/ML method** (row) with a **cellular-agriculture
research area** (column). This page is the canonical definition of every row and column: what it
covers, what falls **out of scope**, and — for categories that are easy to confuse — how to tell it
apart from its neighbours. It serves two audiences: readers orienting themselves in the field, and
the automated classification audit, which decides a paper's placement **from the paper's own methods
text** measured against these definitions.

A guiding rule for every category: a placement records what a paper **actually does**, demonstrated in
its methods — not what it could be applied to, and not what its title gestures at.

## Research areas (columns)

### Media Optimization
Designing and optimizing the **culture medium** — basal formulations, serum-free replacements, growth
factors, and supplement concentrations — to improve cell growth, cost, or product quality. In scope:
media-composition search, formulation design, and the experimental-design loops that drive it. Out of
scope: operating or scaling the bioreactor (→ *Bioprocess & Scale-Up*) and the cells' own biology
(→ *Cellular Engineering*).

### Cellular Engineering
Understanding and engineering **the cells themselves** — gene expression and regulation, cell-state
and perturbation modeling, differentiation, cell-line characterization, and single-cell analysis used
to interpret or modify cells. In scope: scRNA-seq analysis, perturbation-response prediction, gene
regulatory modeling, cell-type annotation, and genetic/sequence design. Out of scope: what feeds the
cells (→ *Media Optimization*) and the reactor they grow in (→ *Bioprocess & Scale-Up*).

### Bioprocess & Scale-Up
Running and **scaling the bioprocess** — bioreactor design, process monitoring and control, fermentation
strategy, and the transport phenomena (mixing, mass transfer, fluid dynamics) that govern scale-up.
In scope: reactor and impeller design, CFD/mixing simulation, fed-batch and feeding-strategy control,
real-time process monitoring, precision-fermentation process design (microbial-host production of
media proteins and growth factors, an in-scope cellular-agriculture route), and the
chemical/biological-engineering know-how cultivated-meat manufacturing depends on at volume —
including methods demonstrated on non-biological reactor physics that transfer directly to bioreactor
scale-up. Out of scope: the medium recipe itself
(→ *Media Optimization*) and intracellular biology (→ *Cellular Engineering*).
*(Renamed from "Bioprocess control" to make the reactor/scale-up engineering scope explicit.)*

### Scaffolding
Designing and predicting **edible, food-grade scaffolds and structural biomaterials** that give
cultured tissue its three-dimensional form and texture. In scope: scaffold geometry and architecture,
mechanical-property prediction, tissue moulds, and food-grade biomaterial selection. Out of scope: the
soluble medium (→ *Media Optimization*), sensory outcomes of the finished product
(→ *Sensory Prediction*), and **non-edible biomedical scaffolds** (e.g. orthopedic or bone
tissue-engineering constructs) whose methodology may transfer but whose application is not cellular
agriculture; a general method demonstrated only on such a scaffold belongs in
*AI Tooling / Methodology*, not here.

### Sensory Prediction
Predicting **sensory, organoleptic, and quality attributes** of the product — flavor, odor, taste,
aroma, texture, color, and freshness/spoilage. In scope: odor/taste/flavor prediction from chemical
structure or spectra, and meat-quality/freshness classification. Out of scope: purely nutritional
composition with no sensory target.

### AI Tooling / Methodology
**General-purpose AI methods, agents, tools, and frameworks** that are applicable to cellular
agriculture but are not yet tied to a specific applied cell-ag result. This is the home for a method
described in general form — a biomedical agent, an agent framework, a knowledge-graph protocol — that
*could* be applied to a cell-ag problem. In scope: general agents/tools/frameworks and methodology
papers. Out of scope: a tool applied to a concrete cell-ag problem, which belongs in that problem's
column (e.g. an agent used for media design → *Media Optimization*).

### AI Evaluation & Benchmarking
**Benchmarks, evaluation frameworks, and measurement methods** for AI and agent performance on
biological / cell-ag-adjacent tasks. In scope: benchmark datasets bundled with protocols and metrics,
evaluation methodologies, and verification frameworks. Out of scope: a model that merely *reports*
benchmark numbers (it belongs in its own method × area), a dataset with no evaluation protocol
(→ the `Datasets/` directory), and a leaderboard service (→ `Databases.md`).

## AI/ML methods (rows)

### Bayesian Optimization
Sequential, surrogate-model-based optimization: a probabilistic model (usually a Gaussian process)
plus an **acquisition function** chooses the next experiment to run, sample-efficiently. In cell-ag,
the workhorse for media and process optimization under a tight experimental budget. **Distinct from**
Bayesian *inference* (posterior or flux estimation that quantifies uncertainty without
acquisition-driven experiment selection) — that is not this row.

### Deep Learning
Multi-layer neural networks not better described by a more specific row — deep MLPs, generic
feed-forward and recurrent nets, and autoencoders/transformers used as plain predictors. A catch-all:
a paper whose core architecture is a CNN, GNN, GAN/VAE, or a pretrained foundation model belongs in
*that* row instead. **Not** shallow models (e.g. RBF networks, single-hidden-layer MLPs used only as
a baseline) and **not** non-neural methods (chemometrics/PLS, network propagation) that are sometimes
loosely called "deep learning".

### GNN
Graph neural networks — **learned, message-passing** models over graph-structured data (GCN, GAT, GIN,
graph autoencoders). In cell-ag: cell–cell similarity graphs, molecular graphs, and gene-interaction
networks. **Distinct from** classical graph algorithms, random-walk **network propagation**, and
non-learned graph embeddings (e.g. metapath2vec, node2vec), which are not trained GNNs.

### CNN
Convolutional neural networks for grid- or image-structured data. In cell-ag: microscopy and product
imaging, hyperspectral/spectral data, and 3-D scaffold tomography. The placement requires genuine
spatial convolution on image-like input — a dense regression surrogate merely labelled "CNN" is
better placed under *Deep Learning*.

### GAN / VAE
Deep generative models — generative adversarial networks and variational autoencoders — used for data
synthesis, augmentation, or generative dimensionality reduction. In cell-ag: synthetic regulatory-
sequence design and scRNA-seq embedding.

### Genetic Algorithms
Population-based evolutionary search — genetic algorithms, evolutionary strategies, NSGA, differential
evolution. In cell-ag: optimizing media, process parameters, and tissue/scaffold designs over large
combinatorial spaces.

### SVM
Support vector machines and support vector regression — kernel methods for classification and
regression on modest, well-featurized datasets. Common in sensory and media/process modeling.

### Ensemble Learning
Tree ensembles and model averaging — random forests, gradient boosting / XGBoost, AdaBoost, and
stacked ensembles. The default strong baseline for tabular prediction across sensory, media, scaffold,
and process problems.

### K-Nearest Neighbors
Instance-based prediction from nearest-neighbor similarity, for small-data classification and
regression. Usually appears alongside other classical models in comparative studies.

### Linear & Regularized Models
Classical linear predictors and their regularized variants — ordinary and penalized linear/logistic
regression (**LASSO**, ridge, elastic net) and linear additive scoring models (e.g. propensity-score
scoring cards). Valued for interpretability and small-data stability: the fitted coefficients name which
features drive the prediction, and L1 penalties perform explicit feature selection. In cell-ag:
morphology- and sequence-feature regression for cell-quality and taste prediction where the feature set
is modest and interpretability matters. Distinct from the *SVM* row (no kernel or margin), *Ensemble
Learning* (no trees, bagging, or boosting), and *Chemometrics* (not restricted to spectral
latent-variable projection).

### Chemometrics
Multivariate statistics for extracting quantitative information from chemical measurements —
overwhelmingly **spectra**. The workhorses are **Partial Least Squares (PLS)** regression, PLS-DA
(discriminant analysis), PCA, and OPLS. In cell-ag this is the backbone of spectroscopy-based
**Process Analytical Technology** — NIR/Raman monitoring of glucose, lactate, and biomass in a
bioreactor, and hyperspectral quality/freshness prediction. Distinct from the kernel (SVM),
tree-ensemble, and neural-net rows: it is latent-variable linear projection, not learning by
kernels, trees, or backpropagation.

### Active Learning
Iterative design-of-experiments in which the model **selects which experiments to run next** to label,
typically wrapped around a surrogate model, closing a predict→experiment→retrain loop. In cell-ag:
media and strain optimization campaigns. Adjacent to *Bayesian Optimization* (a specific acquisition-
driven instance); this row is the broader iterative-selection framing.

### Reinforcement Learning
Learning policies from reward signals — classical RL, policy-gradient methods, and LLM post-training
(GRPO, RLHF). In cell-ag: reward-driven post-training of models and virtual-cell control.

### Foundation Models: Next-Token Prediction
Large, **pretrained, transferable** models trained with an autoregressive next-token objective
(GPT-style), applied to biology — e.g. generative transcriptome and cell-atlas models. The defining
test is that the model is a pretrained foundation model, not a task-specific network.

### Foundation Models: Masked Language Modeling
Pretrained, transferable foundation models trained with a **masked** (BERT-style) objective — the
single-cell foundation models such as scBERT, Geneformer, and scFoundation. Defined by masked
self-supervised pretraining at scale plus downstream transfer.

### Foundation Models: LM + Biological Priors
Foundation models that **combine a language-model backbone with explicit biological priors or
structured knowledge** (e.g. protein-language-model representations integrated with curated biology).
The model must itself be such a foundation model — a task-specific network that merely *consumes*
pretrained embeddings as input features does not belong here (it is *Deep Learning* / *GNN*).

### Foundation Models: Cell-State & Perturbation Prediction
**Pretrained, transferable** foundation models whose target is predicting cell state and perturbation
responses across contexts. The discriminator is pretraining-and-transfer: a single-task supervised
predictor (for example a GNN trained end-to-end on one perturbation dataset) is **not** a foundation
model, even though it predicts perturbations — it belongs in its architecture's row.

### Foundation Models (other modalities)
Pretrained foundation models for modalities **beyond single-cell transcriptomics** not covered by the
other foundation-model rows — multimodal omics, spectra, and small-molecule/natural-product models.

### Scientific Literature & Discovery Agents
LLM agents for **literature search, synthesis, and (semi-)autonomous discovery** — retrieval-augmented
question answering over papers and idea→experiment→manuscript pipelines. Among the agent rows, this
one is defined by its focus on knowledge synthesis and the discovery workflow.

### General-Purpose Biomedical Agents
LLM agents built to be **broadly applicable across biomedical tasks** without task-specific tuning,
and that say so. Distinguished from *Domain-Specific Biomedical Agents* by breadth of intended use.

### Chemistry / Synthesis Agents
LLM agents specialized for **chemistry** — synthesis planning, molecular reasoning, and autonomous
chemical experimentation.

### Domain-Specific Biomedical Agents
LLM agents purpose-built for **one specific biomedical task or domain** — NGS/RNA-seq analysis,
spatial biology, a single named assay or modality. Distinguished from *General-Purpose Biomedical
Agents* by narrow, dedicated focus.

### Robot Scientists & Lab Automation
Systems that couple AI to **physical laboratory automation** for autonomous experimentation, closing
the loop from hypothesis to robotically executed experiment. The discriminator is physical/automated
wet-lab execution, not an in-silico agent alone.

### Benchmarks & Evaluation Frameworks
Papers whose **primary contribution is a benchmark or evaluation framework** — datasets paired with
tasks, protocols, and metrics, or a method for scoring/verifying AI and agent performance. **Not** a
model that is merely evaluated on a benchmark (→ its own method × area), a dataset shipped without an
evaluation protocol (→ `Datasets/`), or a correspondence/commentary about an evaluation (→ *Reviews &
Perspectives*).

### Agent Infrastructure (Frameworks, KGs, Protocols)
The **substrate that agents run on** — agent frameworks, knowledge graphs, tool/communication
protocols (e.g. MCP), and orchestration ecosystems. The discriminator is that the contribution is
plumbing/infrastructure, not an agent that itself solves a downstream task.
