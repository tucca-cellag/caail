# Matrix taxonomy, what each row and column means

The [`Papers.md`](./Papers.md) matrix pairs an **AI/ML method** (row) with a **cellular-agriculture
research area** (column). This page is the canonical definition of every row and column: what it
covers, what falls **out of scope**, and (for categories that are easy to confuse) how to tell it
apart from its neighbours. It serves two audiences: readers orienting themselves in the field, and
the automated classification audit, which decides a paper's placement **from the paper's own methods
text** measured against these definitions.

A guiding rule for every category: a placement rests on what a paper demonstrably did, read from its
methods text rather than from what it could be applied to or what its title gestures at. What that
evidence has to establish is set out once in the methods preamble below, and it is narrower than mere
presence: a row records a paper's contribution, not every technique its methods happen to mention.

## Two axes, and how to tell which one you are reading

This file defines three vocabularies, and two of them are *subject* axes over different populations:

- **Research areas** are the matrix's columns. They are a classification instrument: one axis of
  *AI method x research area*, covering only work that applies a method to a problem.
- **Subject themes** are the browse taxonomy behind `/topics/`. They tag *any* content type, so they
  reach databases, datasets and software that never enter the matrix.

The two are **paired but never equated**. Each theme names exactly one research area and each research
area is named by exactly one theme, a correspondence stored as `topics.area_key` and asserted by
`db:check`. The assertion runs through that key and never by comparing labels, because the populations
genuinely differ: on every pair the theme is the larger, because it also tags datasets, software and
databases that never enter the matrix, and the size of the gap varies widely from pair to pair.
**Their counts must never be added together or compared.**

Because the axes are paired, their labels are deliberately shaped differently so that no label appears
on both:

- a **research area** reads as a *problem* (Media Optimization, Sensory Prediction, Food Safety Prediction);
- a **subject theme** reads as an *&-joined subject* (Media & Growth Factors, Sensory & Flavor).

The one pair that once shared a label, `Bioprocess & Scale-Up`, is the one pair that produced a bug: a
whole-file flatten let the theme's two-line blurb silently overwrite the column's scope definition. The
theme is therefore named **Bioprocess & Manufacturing** while the column keeps **Bioprocess & Scale-Up**.
Theme labels are independent of their frozen `topic:` slugs, so that naming carries no identifier change.

This convention governs the two subject axes only. It says nothing about the section names used in
`Software.md` and `Databases.md`, which group entries for browsing and are free to read differently.

## Research areas (columns)

### Media Optimization
Designing and optimizing the **culture medium**: basal formulations, serum-free replacements, growth
factors, and supplement concentrations: to improve cell growth, cost, or product quality. In scope:
media-composition search, formulation design, and the experimental-design loops that drive it. Out of
scope: operating or scaling the bioreactor (→ *Bioprocess & Scale-Up*) and the cells' own biology
(→ *Cellular Engineering*).

Also in scope: **the other designed solutions a cell line is held in**, chiefly cryoprotectant
cocktails and vitrification solutions for cell banking. The optimized object is the same kind of
thing, a multi-component fluid searched over composition under a measured cell response, and the
search methods are the same; what differs is that the response is post-thaw viability rather than
proliferation. That difference is not a reason to split the column.

What puts such a paper in scope is the optimized object rather than the sector it names. Cryoprotectant
optimization has close twins outside this field, in reproductive medicine, cell therapy and biopharma
cell banking, and this column claims these papers in spite of that rather than by pretending otherwise:
banking a line is itself a step in a cultivated-meat process, so the work is in scope whoever the authors
had in mind. Other columns weigh a paper's stated application differently and each states its own test,
so do not read this paragraph as describing theirs. Where that reading is contested, raise it for
re-audit rather than moving the cell.

### Cellular Engineering
Understanding and engineering **the cells themselves**: gene expression and regulation, cell-state
and perturbation modeling, differentiation, cell-line characterization, and single-cell analysis used
to interpret or modify cells. In scope: scRNA-seq analysis, perturbation-response prediction, gene
regulatory modeling, cell-type annotation, and genetic/sequence design. Out of scope: what feeds the
cells (→ *Media Optimization*) and the reactor they grow in (→ *Bioprocess & Scale-Up*).

### Bioprocess & Scale-Up
Running and **scaling the bioprocess**: bioreactor design, process monitoring and control, fermentation
strategy, and the transport phenomena (mixing, mass transfer, fluid dynamics) that govern scale-up.
In scope: reactor and impeller design, CFD/mixing simulation, fed-batch and feeding-strategy control,
real-time process monitoring, precision-fermentation process design (microbial-host production of
media proteins and growth factors, an in-scope cellular-agriculture route), and the
chemical/biological-engineering know-how cultivated-meat manufacturing depends on at volume,
including methods demonstrated on non-biological reactor physics that transfer directly to bioreactor
scale-up. Out of scope: the medium recipe itself
(→ *Media Optimization*) and intracellular biology (→ *Cellular Engineering*).
*(Renamed from "Bioprocess control" to make the reactor/scale-up engineering scope explicit.)*

### Scaffolding
Designing and predicting **edible, food-grade scaffolds and structural biomaterials** (including the
plant-derived structural matrices that cellular agriculture deliberately favors for a fully animal-free
product: textured or extruded plant protein, biopolymer gels, decellularized plant scaffolds, mycelium)
that give cultured tissue and hybrid products their three-dimensional form, mechanical properties, and
structural texture. In scope: scaffold geometry and architecture; mechanical, rheological, and
structural-texture prediction and optimization of the food-grade matrix; tissue moulds; and biomaterial
selection. A paper that predicts or designs the **structural matrix** as a material sits here. It is
additionally **dual-classified** with *Sensory Prediction* when both of the following hold: (a) the
quantity it predicts or optimizes is an eating-quality attribute, meaning either a human sensory
rating or a validated instrumental proxy for one (TPA hardness, chewiness, springiness, cohesiveness;
shear force; instrumental color); and (b) the paper motivates that quantity as a property of the
finished product as eaten, rather than as a process-control or material-characterization endpoint.
Out of scope: the soluble medium (→ *Media Optimization*); flavor, taste, aroma, and quality
assessment of intact finished food (→ *Sensory Prediction*); and **non-edible biomedical scaffolds**
(e.g. orthopedic or bone tissue-engineering constructs) whose methodology may transfer but whose
application is not cellular agriculture, and which belong in *AI Tooling / Methodology*.

### Sensory Prediction
Predicting **sensory, organoleptic, and quality attributes** as *perceived outcomes* of the product:
flavor, odor, taste, aroma, perceived texture and mouthfeel, color, and freshness/spoilage. In scope:
odor/taste/flavor prediction from chemical structure or spectra; perceived-texture and eating-quality
prediction; and meat-quality/freshness classification. A perceived-texture result is
**dual-classified** with *Scaffolding* when the paper also designs or predicts the underlying
structural matrix as a material, judged by the same two-part test given under *Scaffolding*. Out
of scope: designing the structural biomaterial itself as a material (→ *Scaffolding*), and purely
nutritional composition with no sensory target.

### Metabolic Modeling
Reconstructing, simulating, and searching **metabolism itself**: genome-scale metabolic models (GEMs),
flux balance analysis and related constraint-based methods, kinetic/ODE models of metabolic pathways,
pathway and strain design, and the metabolic-network resources these depend on. In scope: GEM
reconstruction, curation, and simulation; flux prediction; pathway enumeration and enzyme or pathway
selection **decided against a network model**; strain design; and machine learning trained on
metabolic-network structure or flux data. Out of scope: black-box optimization of an enzyme cascade's
composition, where the demonstrated result is a formulation and no network is modelled; choosing what
goes into the medium,
even when a metabolic model motivates the choice, where the demonstrated result is a formulation
(→ *Media Optimization*); gene regulation and cell-state modeling that does not run through a metabolic
network (→ *Cellular Engineering*); reactor operation and scale-up (→ *Bioprocess & Scale-Up*); and,
importantly, **metabolomics used as an analytical input to predict an eating-quality attribute**, which
is a sensory result measured by metabolite chemistry rather than a model of metabolism
(→ *Sensory Prediction*). The distinguishing question is whether the paper models the metabolic
network, or merely measures metabolites.

### Food Safety Prediction
Computationally assessing **the safety of the proteins and compounds an alternative-protein product
introduces**: allergenicity and immunogenicity prediction, IgE-epitope mapping, cross-reactivity
assessment, and toxicity prediction for novel or heterologously-expressed proteins. In scope: trained
classifiers and learned representations that predict allergenic, immunogenic, or toxic potential from
sequence, structure, or physicochemical descriptors, including protein-language-model approaches. Out
of scope: the allergen reference databases such a method is trained or screened against, which are
catalogued in [`Databases.md`](./Databases.md) rather than placed in the matrix; sensory or spoilage
quality, which is a different kind of safety-adjacent question (→ *Sensory Prediction*); and a
general-purpose predictor presented with no alternative-protein or cell-ag framing
(→ *AI Tooling / Methodology*).

**A boundary this column needs stated, because titles hide it.** Not every published allergenicity
predictor applies an AI/ML method, and a tool that applies none has no row to sit on and is therefore
not matrix-eligible at all, however well it fits this column's subject. Sequence-similarity screening
against a reference set (a sliding-window identity threshold of the kind the FAO/WHO Codex
Alimentarius prescribes) and fingerprint comparison by a similarity coefficient are retrieval
procedures, not trained models. Judge this from the methods section rather than the name: several
tools in this space are named like classifiers and are not. Where an existing placement is affected,
raise it for re-audit rather than silently unseating it.

**How to apply the framing test above, because the words are usually absent.** Papers that belong in
this column rarely say "alternative protein" or "cultivated" anywhere, so a keyword test for the
sector rejects them all. What separates an in-scope paper from an identical method presented for
another field is **what its body text orients itself around**. A paper that argues from the
novel-food regulatory apparatus (FAO/WHO allergenicity guidance, Codex Alimentarius, the dossier
requirements of a food-safety authority) is framed for this column whether or not it names the
sector. A paper whose stated motivation is clinical or pharmaceutical, such as disease risk or the
immunogenicity of a therapeutic protein, is not, however closely its method matches. Read this from
the body text: the title and abstract of an allergenicity paper look the same either way. **This is
never on its own grounds for a removal.** Where the out-of-scope clause above applies on its own terms,
it names the destination; where it does not, because the paper is narrowly scoped to another field's
question rather than general-purpose, raise the placement rather than unseating it.

### AI Tooling / Methodology
**General-purpose AI methods, agents, tools, and frameworks** that are applicable to cellular
agriculture but are not yet tied to a specific applied cell-ag result. This is the home for a method
described in general form (a biomedical agent, an agent framework, a knowledge-graph protocol) that
*could* be applied to a cell-ag problem. In scope: general agents/tools/frameworks and methodology
papers. Out of scope: a tool applied to a concrete cell-ag problem, which belongs in that problem's
column (e.g. an agent used for media design → *Media Optimization*).

## AI/ML methods (rows)

**A row records what a paper contributed, not what appears in its methods section.** A paper earns a
method row by *building or applying* that method as part of its reported result. It does not earn one
by consuming the method as a service, by using it to configure the machinery that produced the
result, or by being measured against it. The same technique can be a contribution in one paper and a
component in another, so the question is never whether the method is present but whether the paper is
making a claim about it.

**Rows that restate it:** Foundation Models, Benchmarks & Evaluation Frameworks, Genetic Algorithms.

Each states it in the terms its own boundary needs, because each has been misread at least once:
building a model versus invoking one, shipping a benchmark versus being scored by it, and where a
search's output appears. Read the row's own text for the test that applies. That list is the
authoritative scope of this principle and is read mechanically, so a row named there without a clause
in its definition, or a clause deleted while the row stays named, is caught rather than noticed.

**This is not the same as the routing rules** elsewhere in this section, which say a paper belongs in
a *different* row (a CNN paper goes to *CNN* rather than *Deep Learning*; a data-driven model trained
on simulation output is not *Hybrid Mechanistic-ML*). Those answer "which row"; this one answers "any
row at all". Do not merge them.

### Bayesian Optimization
Sequential, surrogate-model-based optimization: a probabilistic model (usually a Gaussian process)
plus an **acquisition function** chooses the next experiment to run, sample-efficiently. In cell-ag,
the workhorse for media and process optimization under a tight experimental budget. **Distinct from**
Bayesian *inference* (posterior or flux estimation that quantifies uncertainty without
acquisition-driven experiment selection); that is not this row.

### Deep Learning
Multi-layer neural networks not better described by a more specific row: deep MLPs, generic
feed-forward and recurrent nets, and autoencoders/transformers used as plain predictors. A catch-all:
a paper whose core architecture is a CNN, GNN, GAN/VAE, or a pretrained foundation model belongs in
*that* row instead. **Not** shallow models (e.g. RBF networks, single-hidden-layer MLPs used only as
a baseline) and **not** non-neural methods (chemometrics/PLS, network propagation) that are sometimes
loosely called "deep learning".

### GNN
Graph neural networks: **learned, message-passing** models over graph-structured data (GCN, GAT, GIN,
graph autoencoders). In cell-ag: cell–cell similarity graphs, molecular graphs, and gene-interaction
networks. **Distinct from** classical graph algorithms, random-walk **network propagation**, and
non-learned graph embeddings (e.g. metapath2vec, node2vec), which are not trained GNNs.

### CNN
Convolutional neural networks for grid- or image-structured data. In cell-ag: microscopy and product
imaging, hyperspectral/spectral data, and 3-D scaffold tomography. The placement requires genuine
spatial convolution on image-like input, a dense regression surrogate merely labelled "CNN" is
better placed under *Deep Learning*.

### GAN / VAE
Deep generative models (generative adversarial networks and variational autoencoders) used for data
synthesis, augmentation, or generative dimensionality reduction. In cell-ag: synthetic regulatory-
sequence design and scRNA-seq embedding.

### Hybrid Mechanistic-ML Models
Models that **couple a first-principles description to a learned component**, so that neither half
stands alone: mass-balance or kinetic ODEs whose unknown rates are supplied by a network,
physics-informed networks carrying a governing equation in the loss, and grey-box serial or parallel
structures. **The row is earned by the coupling, not by the network**, which is why a paper whose
learned part is a small shallow net belongs here rather than in *Deep Learning*, and why a paper
with a genuinely deep network can hold both rows. **Distinct from** a purely data-driven model that
merely uses a mechanistic simulation to generate its training data, and from an ensemble that
averages several learned models and calls the combination hybrid: in both of those the
first-principles structure is absent from the deployed model.

### Genetic Algorithms
Population-based evolutionary search: genetic algorithms, evolutionary strategies, NSGA, differential
evolution. In cell-ag: optimizing media, process parameters, and tissue/scaffold designs over large
combinatorial spaces.

**The test is where the search's output appears.** The row is earned when what the search returned is
part of what the paper reports: a formulation, a physical design, a process setting, or the fitted
model itself. It is **not** earned when the output only configures the machinery that produced the
reported result, which covers a search over hyperparameters, over model architecture, and over which
preprocessing or feature-selection *technique* to apply. Both kinds are real optimisation and both are
often described at length, so the length of the description decides nothing. What decides it is whether
the answer the search returned is one the paper makes a claim about.

A feature subset can itself be a finding, since "these are the variables that matter" is a claim about
the problem. Feature selection is therefore not excluded as a category; what is excluded is a search
whose answer is which technique to run.

Two shapes, written out because a single sentence here has already been read both ways. A scoring-card
method whose evolutionary search produces the score table that *is* the predictor earns the row,
because the table is the result. A study whose search identifies the best combination of
feature-selection techniques to reduce features before training does not, because its reported result
is about the biology and the search's answer is a step in the pipeline. A paper that does both earns
the row on the first, so read the whole methods section rather than the first evolutionary-search
heading in it.

### SVM
Support vector machines and support vector regression, kernel methods for classification and
regression on modest, well-featurized datasets. Common in sensory and media/process modeling.

### Ensemble Learning
Tree ensembles and model averaging: random forests, gradient boosting / XGBoost, AdaBoost, and
stacked ensembles. The default strong baseline for tabular prediction across sensory, media, scaffold,
and process problems. The row is earned when trees, boosting, or stacking over classical learners is
the **primary learner**. **Not** an ensemble assembled over networks that already hold their own
architecture row: model averaging, snapshot ensembling, or stacking over CNNs, GNNs, or deep MLPs
does not additionally earn this row, because what the row records is the learner, not the combination
rule placed on top of it. Where an existing placement is affected, raise it for re-audit rather than
silently unseating it.

### K-Nearest Neighbors
Instance-based prediction from nearest-neighbor similarity, for small-data classification and
regression. Usually appears alongside other classical models in comparative studies.

### Linear & Regularized Models
Classical linear predictors and their regularized variants, ordinary and penalized linear/logistic
regression (**LASSO**, ridge, elastic net) and linear additive scoring models (e.g. propensity-score
scoring cards). Valued for interpretability and small-data stability: the fitted coefficients name which
features drive the prediction, and L1 penalties perform explicit feature selection. In cell-ag:
morphology- and sequence-feature regression for cell-quality and taste prediction where the feature set
is modest and interpretability matters. Distinct from the *SVM* row (no kernel or margin), *Ensemble
Learning* (no trees, bagging, or boosting), and *Chemometrics* (not restricted to spectral
latent-variable projection).

### Chemometrics
Multivariate statistics for extracting quantitative information from chemical measurements,
overwhelmingly **spectra**. The workhorses are **Partial Least Squares (PLS)** regression, PLS-DA
(discriminant analysis), PCA, and OPLS. In cell-ag this is the backbone of spectroscopy-based
**Process Analytical Technology**: NIR/Raman monitoring of glucose, lactate, and biomass in a
bioreactor, and hyperspectral quality/freshness prediction. Distinct from the kernel (SVM),
tree-ensemble, and neural-net rows: it is latent-variable linear projection, not learning by
kernels, trees, or backpropagation.

### Active Learning
Iterative design-of-experiments in which the model **selects which experiments to run next** to label,
typically wrapped around a surrogate model, closing a predict→experiment→retrain loop. In cell-ag:
media and strain optimization campaigns. Adjacent to *Bayesian Optimization* (a specific acquisition-
driven instance); this row is the broader iterative-selection framing.

### Reinforcement Learning
Learning policies from reward signals: classical RL, policy-gradient methods, and LLM post-training
(GRPO, RLHF). In cell-ag: reward-driven post-training of models and virtual-cell control.

### Foundation Models: Next-Token Prediction
Large, **pretrained, transferable** models trained with an autoregressive next-token objective
(GPT-style), applied to biology, e.g. generative transcriptome and cell-atlas models. The defining
test is that the model is a pretrained foundation model, not a task-specific network. **Not** a paper
that merely invokes such a model, as an agent's tool call or a queried service: that paper keeps its own
row, and this one records building the model rather than using it. Where an existing placement is affected, raise it for re-audit rather than silently unseating it.

### Foundation Models: Masked Language Modeling
Pretrained, transferable foundation models trained with a **masked** (BERT-style) objective, the
single-cell foundation models such as scBERT, Geneformer, and scFoundation. Defined by masked
self-supervised pretraining at scale plus downstream transfer. **Not** a paper that merely invokes such
a model, as an agent's tool call or a queried service: that paper keeps its own row. Where an existing placement is affected, raise it for re-audit rather than silently unseating it.

### Foundation Models: LM + Biological Priors
Foundation models that **combine a language-model backbone with explicit biological priors or
structured knowledge** (e.g. protein-language-model representations integrated with curated biology).
The model must itself be such a foundation model, a task-specific network that merely *consumes*
pretrained embeddings as input features does not belong here (it is *Deep Learning* / *GNN*), and
neither does an agent that *invokes* one as a tool (it keeps its agent row). Where an existing placement is affected, raise it for re-audit rather than silently unseating it.

### Foundation Models: Cell-State & Perturbation Prediction
**Pretrained, transferable** foundation models whose target is predicting cell state and perturbation
responses across contexts. The discriminator is pretraining-and-transfer: a single-task supervised
predictor (for example a GNN trained end-to-end on one perturbation dataset) is **not** a foundation
model, even though it predicts perturbations, it belongs in its architecture's row. **Not** a paper
that merely invokes such a model, as an agent's tool call or a queried service. Where an existing placement is affected, raise it for re-audit rather than silently unseating it.

### Foundation Models (other modalities)
Pretrained foundation models for modalities **beyond single-cell transcriptomics** not covered by the
other foundation-model rows: multimodal omics, spectra, and small-molecule/natural-product models.
**Not** a paper that merely invokes such a model, as an agent's tool call or a queried service. Where an existing placement is affected, raise it for re-audit rather than silently unseating it.

### Scientific Literature & Discovery Agents
LLM agents for **literature search, synthesis, and (semi-)autonomous discovery**: retrieval-augmented
question answering over papers and idea→experiment→manuscript pipelines. Among the agent rows, this
one is defined by its focus on knowledge synthesis and the discovery workflow.

### General-Purpose Biomedical Agents
LLM agents built to be **broadly applicable across biomedical tasks** without task-specific tuning,
and that say so. Distinguished from *Domain-Specific Biomedical Agents* by breadth of intended use.

### Chemistry / Synthesis Agents
LLM agents specialized for **chemistry**: synthesis planning, molecular reasoning, and autonomous
chemical experimentation.

### Domain-Specific Biomedical Agents
LLM agents purpose-built for **one specific biomedical task or domain**: NGS/RNA-seq analysis,
spatial biology, a single named assay or modality. Distinguished from *General-Purpose Biomedical
Agents* by narrow, dedicated focus.

### Robot Scientists & Lab Automation
Systems that couple AI to **physical laboratory automation** for autonomous experimentation, closing
the loop from hypothesis to robotically executed experiment. The discriminator is physical/automated
wet-lab execution, not an in-silico agent alone.

### Benchmarks & Evaluation Frameworks
Papers whose **primary contribution is a benchmark or evaluation framework**: datasets paired with
tasks, protocols, and metrics, or a method for scoring/verifying AI and agent performance. **Not** a
model that is merely evaluated on a benchmark (→ its own method × area), a dataset shipped without an
evaluation protocol (→ `Datasets/`), a leaderboard service (→ `Databases.md`), or a
correspondence/commentary about an evaluation (→ *Reviews & Perspectives*).

A paper in this row takes the **column of the research area its benchmark measures**, read off the
task set rather than the title: a benchmark of protein-fitness or gene-perturbation tasks is
*Cellular Engineering*, one of gel-microstructure tasks is *Scaffolding*, and one whose tasks span
many sciences with no applied cell-ag endpoint is *AI Tooling / Methodology*. What decides it is the
**quantity the benchmark grades**, not how much of its subject matter sounds biological: a suite
scoring a statistical estimate recovered from simulated data measures analytic skill, whichever field
supplied the scenario. A multi-domain suite whose task set genuinely splits, with each side
substantially represented and one side outside every research area, is **dual-classified** across
both columns rather than forced into one.

**The boundary against *Comparative Studies*, which this row is otherwise easy to confuse with.** A
benchmark **ships a reusable task suite, protocol and metrics for others to score against**; a
comparative study **evaluates existing methods to answer its own question and ships nothing for
reuse**. A paper may do both, and then it takes both rows. The same test decides whether a paper
earns a cell in each method family it ran: it does so only where the evaluation is the paper's own
method study, and not where it supplies a suite for others to run against models it did not build.

### Comparative Studies
Papers whose **primary contribution is a head-to-head evaluation of existing methods on the authors'
own data**, run to answer a question the authors have rather than to supply a resource: which model
family to adopt for a given prediction task, or which measurement modality feeds it best. In scope:
sweeps across model families, and studies whose stated result is a recommendation about method
choice. A paper here takes the **column of the research area it evaluates methods for**, on the same
reading as *Benchmarks & Evaluation Frameworks* above: read off what the study actually measured. Out of scope: an applied paper that happens to try several models before
reporting the one it uses, since the row records a paper's contribution and not its model count.

### Agent Infrastructure (Frameworks, KGs, Protocols)
The **substrate that agents run on**: agent frameworks, knowledge graphs, tool/communication
protocols (e.g. MCP), and orchestration ecosystems. The discriminator is that the contribution is
plumbing/infrastructure, not an agent that itself solves a downstream task.

## Subject themes (topic tags)

A separate axis from the matrix: **subject-matter themes** that group *any* content type (papers,
software, databases, datasets) for cross-content discovery. Unlike research areas, which are
problems an AI method is applied *to*: themes are what the material is *about*, so they fit
databases and datasets that never enter the matrix (per the Databases-vs-ResearchAreas distinction).
Themes are a fixed backbone; finer tags live under them and are minted only when several items
cluster. Every theme names exactly one matrix research area, and every research area is named by
exactly one theme; see *Two axes, and how to tell which one you are reading* above for what that
pairing does and does not license.

### Media & Growth Factors
Culture-medium composition and optimization: serum-free/serum-reduced formulations, growth factors
and cytokines, recombinant medium proteins, and design-of-experiments for medium screening. Links to
the *Media Optimization* research area.

### Cell Lines & Engineering
The cells themselves and their manipulation: cell-line establishment and characterization, genetic
engineering (CRISPR, perturbation), differentiation and myogenesis, stemness/senescence, and
single-cell atlases. Links to *Cellular Engineering*.

### Bioprocess & Manufacturing
Growing cells at scale: bioreactor design and CFD, perfusion and fed-batch, soft sensors and process
control, and scale-up engineering. Links to *Bioprocess & Scale-Up*.

### Scaffolding & Biomaterials
The structural substrate for tissue: scaffolds, biomaterials and hydrogels, 3D bioprinting, and the
texture/architecture of cultured tissue. Links to *Scaffolding*.

### Sensory & Flavor
The eating quality of the product and the analytics behind it: flavor and taste prediction, aroma,
and the mass-spectrometry / chemometrics / metabolomics infrastructure used to measure them. Links to
*Sensory Prediction*.

### Metabolism & Modeling
Metabolic knowledge and models: genome-scale metabolic models (GEMs), flux analysis, pathway and
strain design, and metabolic-network resources. Pairs with the *Metabolic Modeling* research area,
which is narrower: the column holds papers that model a metabolic network, while this theme also
collects the model files, databases and tools that never enter the matrix.

### Food Safety
The safety assessment of the proteins a cultured product introduces: allergenicity and immunogenicity
prediction, IgE-epitope mapping, and the allergen reference databases that screening pipelines compare
against. Pairs with the *Food Safety Prediction* research area; the *allergenicity* fine tag groups the
in-silico screening tools, allergen databases, and their methods papers, most of which are catalogue
entries rather than matrix placements.

### AI Methods & Tooling
General-purpose AI capability and infrastructure applied across cell-ag: agents and foundation
models, benchmarks and evaluation, frameworks, ontologies, and lookup databases/tooling. Links to
*AI Tooling / Methodology*.

## Crosswalk to GFI's solutions taxonomy

The Good Food Institute organises its [solutions database](https://gfi.org/solutions/) on two facets,
*Technology sector* and *Value chain segment*. Readers arriving from GFI's vocabulary need to know how
it lines up with the matrix columns, so this table maps each CAAIL research area to its nearest GFI
technology sector and says how good the fit is.

Adopting GFI's facets as the matrix column axis was considered and rejected. The reason is visible in
the table: GFI's axis answers *who should act on this gap*, while a CAAIL column answers *what did this
paper demonstrate*, and GFI has no facet at all for a general-purpose AI method. The largest CAAIL
column is exactly that, so adopting their axis would leave a large share of the matrix with nowhere to
sit. The crosswalk buys the legibility without the axis change.

| CAAIL research area | Nearest GFI technology sector | Fit |
|---|---|---|
| Media Optimization | Cell culture media | direct |
| Cellular Engineering | Cell line development *and* Host strain development | splits across two |
| Bioprocess & Scale-Up | Bioprocess design | direct |
| Scaffolding | Scaffolding | direct |
| Sensory Prediction | End product formulation & manufacturing | partial: GFI's is a production activity, CAAIL's is a prediction target |
| Metabolic Modeling | Host strain development | partial: nearest neighbour only, GFI has no modelling facet |
| Food Safety Prediction | *(none)* | no GFI sector covers safety assessment |
| AI Tooling / Methodology | *(none)* | no GFI sector covers general-purpose AI method work |

The gaps run in both directions, and both are real rather than an artefact of mapping:

- **CAAIL areas with no GFI sector:** Food Safety Prediction and AI Tooling / Methodology, with Sensory
  Prediction and Metabolic Modeling matching only loosely.
- **GFI sectors with no CAAIL column:** Crop development, Ingredient optimization, and Target molecule
  selection. These are largely plant-based and fermentation-ingredient concerns that the matrix's
  cultivated-cell focus does not reach.

Two details worth stating because they are easy to get wrong. GFI lists **Scaffolding** on *both*
facets, as a technology sector and as a value chain segment, where CAAIL has only the one axis. And
almost every paper in the matrix would fall under GFI's **R&D** value chain segment, so that facet
does not discriminate between CAAIL columns and is not mapped per-row here.

*GFI's facet lists were read from `gfi.org/solutions` on 2026-08-20 and are reproduced verbatim. They
are a third party's taxonomy and can change without notice; re-read the page rather than trusting this
snapshot.*
