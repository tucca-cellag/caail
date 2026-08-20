/**
 * Curated title/sidebar map for the canonical prose pages the CAAIL site renders.
 *
 * Titles for Datasets pages are verified against the real H1 headers in the
 * canonical Markdown files (stripping leading `# ` and de-emphasising `*…*`).
 * Titles for ResearchAreas pages use the matrix column labels from Papers.md,
 * and titles for Methods pages the matrix row labels: the two directories are
 * the two matrix axes, one deep-dive page each.
 */

export type PageGroup = 'research-areas' | 'methods' | 'datasets' | 'top';

export interface PageMeta {
  title: string;
  sidebarLabel: string;
  group: PageGroup;
  order: number;
  /** Unique meta description / og:description for SEO (the canonical files have
   *  no frontmatter, so without this they'd all inherit the generic site one). */
  description: string;
}

// ---------------------------------------------------------------------------
// Internal map — keyed by route id (lower-kebab-case path with no leading /)
// ---------------------------------------------------------------------------

const PAGES: Record<string, PageMeta> = {
  // ── ResearchAreas ──────────────────────────────────────────────────────────
  'research-areas/mediaoptimization': {
    title: 'Media Optimization',
    sidebarLabel: 'Media Optimization',
    group: 'research-areas',
    order: 1,
    description:
      'AI and machine learning for cell-culture media optimization in cellular agriculture: design of experiments, Bayesian optimization, and data-driven formulation.',
  },
  'research-areas/cellengineering': {
    title: 'Cellular Engineering',
    sidebarLabel: 'Cellular Engineering',
    group: 'research-areas',
    order: 2,
    description:
      'Computational and AI approaches to cellular engineering for cultivated meat: cell-line development, differentiation, and genome-scale modeling.',
  },
  'research-areas/bioprocess': {
    title: 'Bioprocess & Scale-Up',
    sidebarLabel: 'Bioprocess & Scale-Up',
    group: 'research-areas',
    order: 3,
    description:
      'AI and modeling for bioprocess control and scale-up in cellular agriculture: bioreactor CFD, soft sensors, and process optimization.',
  },
  'research-areas/scaffolding': {
    title: 'Scaffolding',
    sidebarLabel: 'Scaffolding',
    group: 'research-areas',
    order: 4,
    description:
      'Computational methods for scaffolding and biomaterials in cultivated meat: structure design, simulation, and tissue architecture.',
  },
  'research-areas/sensoryprediction': {
    title: 'Sensory Prediction',
    sidebarLabel: 'Sensory Prediction',
    group: 'research-areas',
    order: 5,
    description:
      'Predicting flavor, texture, and sensory quality of cultivated meat with AI: sensomics, multi-omics, and machine-learning models.',
  },
  'research-areas/aitooling': {
    title: 'AI Tooling / Methodology',
    sidebarLabel: 'AI Tooling',
    group: 'research-areas',
    order: 8,
    description:
      'General-purpose AI methods, agents, and tooling applicable to cellular agriculture: foundation models, LLM agents, and ML infrastructure.',
  },
  'research-areas/metabolicmodeling': {
    title: 'Metabolic Modeling',
    sidebarLabel: 'Metabolic Modeling',
    group: 'research-areas',
    order: 6,
    description:
      'Genome-scale metabolic modeling and strain design for cellular agriculture: constraint-based modeling, flux analysis, and metabolic engineering.',
  },
  'research-areas/foodsafetyprediction': {
    title: 'Food Safety Prediction',
    sidebarLabel: 'Food Safety Prediction',
    group: 'research-areas',
    order: 7,
    description:
      'Predicting the allergenicity, immunogenicity, and toxicity of the novel proteins cultivated meat and precision fermentation introduce: sequence-based classifiers, IgE-epitope mapping, and regulatory screening.',
  },

  // ── Methods ────────────────────────────────────────────────────────────────
  // Deep dives on the matrix's *row* axis, one page per row. `order` follows the
  // matrix's own row order (methods.ndjson `ordinal` + 1) rather than the
  // alphabetical filename order, so the sidebar reads top-to-bottom the way the
  // matrix does — the same convention the ResearchAreas block uses for columns.
  //
  // Route ids are run-together lowercase (`methods/bayesianoptimization`): the
  // hyphenation special cases in `idForSourcePath` fire only for TOP-LEVEL files,
  // never for a path containing a `/`. See Methods/CLAUDE.md.
  'methods/bayesianoptimization': {
    title: 'Bayesian Optimization',
    sidebarLabel: 'Bayesian Optimization',
    group: 'methods',
    order: 1,
    description:
      'Bayesian optimization for cellular agriculture: Gaussian-process surrogates and acquisition functions that choose the next media, cryoprotectant, or bioreactor experiment under a tight budget.',
  },
  'methods/deeplearning': {
    title: 'Deep Learning',
    sidebarLabel: 'Deep Learning',
    group: 'methods',
    order: 2,
    description:
      'Neural networks across cell-ag: bioprocess surrogates and hybrid physics-informed controllers, cross-species cell embeddings, scaffold property prediction, and structure-to-odor models.',
  },
  'methods/gnn': {
    title: 'GNN',
    sidebarLabel: 'GNN',
    group: 'methods',
    order: 3,
    description:
      'Graph neural networks in cellular agriculture: cell-cell similarity graphs for single-cell clustering, gene-interaction networks for perturbation prediction, and molecular graphs for taste and odor.',
  },
  'methods/cnn': {
    title: 'CNN',
    sidebarLabel: 'CNN',
    group: 'methods',
    order: 4,
    description:
      'Convolutional networks for cell-ag imaging: brightfield differentiation scoring, digital staining of bovine satellite cells, contamination detection, hyperspectral metabolite sensing, and scaffold microstructure.',
  },
  'methods/ganvae': {
    title: 'GAN / VAE',
    sidebarLabel: 'GAN / VAE',
    group: 'methods',
    order: 5,
    description:
      'Deep generative models in cell-ag: synthetic regulatory-DNA design, single-cell dimensionality reduction, tissue-mould surrogates, and generative augmentation of small sensory datasets.',
  },
  'methods/geneticalgorithms': {
    title: 'Genetic Algorithms',
    sidebarLabel: 'Genetic Algorithms',
    group: 'methods',
    order: 6,
    description:
      'Evolutionary search for cellular agriculture: media formulation, fermentation control trajectories, cryoprotectant cocktails, and tissue-mould design over large combinatorial spaces.',
  },
  'methods/svm': {
    title: 'SVM',
    sidebarLabel: 'SVM',
    group: 'methods',
    order: 7,
    description:
      'Support vector machines and regression in cell-ag: serum-free media screening, one-class contamination detection in bioreactors, and taste and texture prediction on small featurized datasets.',
  },
  'methods/ensemblelearning': {
    title: 'Ensemble Learning',
    sidebarLabel: 'Ensemble Learning',
    group: 'methods',
    order: 8,
    description:
      'Tree ensembles and model averaging in cellular agriculture: the default strong baseline for media, bioprocess soft sensors, scaffold rheology, and structure-to-taste prediction.',
  },
  'methods/knearestneighbors': {
    title: 'K-Nearest Neighbors',
    sidebarLabel: 'K-Nearest Neighbors',
    group: 'methods',
    order: 9,
    description:
      'Instance-based prediction in cell-ag, almost always as a benchmarked baseline: syngas fermentation, algal odor classification, bitter-receptor matching, and sweetness QSTR.',
  },
  'methods/linearregularizedmodels': {
    title: 'Linear & Regularized Models',
    sidebarLabel: 'Linear & Regularized',
    group: 'methods',
    order: 10,
    description:
      'Linear and penalized models in cell-ag, chosen for interpretability: porcine muscle stem-cell potency from morphology, meat-analog texture, and sequence-based umami and odor scoring.',
  },
  'methods/chemometrics': {
    title: 'Chemometrics',
    sidebarLabel: 'Chemometrics',
    group: 'methods',
    order: 11,
    description:
      'Multivariate spectral statistics for cellular agriculture: PLS, PLS-DA, PCA and OPLS behind NIR and Raman process analytical technology and hyperspectral meat and fish quality prediction.',
  },
  'methods/activelearning': {
    title: 'Active Learning',
    sidebarLabel: 'Active Learning',
    group: 'methods',
    order: 12,
    description:
      'Iterative design of experiments for cell-ag: predict, test the most informative formulations, retrain. Media optimization campaigns for HeLa, CHO and mAb production, and Perturb-seq gene selection.',
  },
  'methods/reinforcementlearning': {
    title: 'Reinforcement Learning',
    sidebarLabel: 'Reinforcement Learning',
    group: 'methods',
    order: 13,
    description:
      'Reward-driven learning in cellular agriculture: policy-gradient and hybrid MPC control of bioreactors, and reinforcement post-training of virtual-cell and chemistry reasoning models.',
  },
  'methods/foundationmodelsnexttoken': {
    title: 'Foundation Models: Next-Token Prediction',
    sidebarLabel: 'FM: Next-Token',
    group: 'methods',
    order: 14,
    description:
      'Autoregressive foundation models for biology: generative cell atlases spanning twelve species, cell-sentence LLMs, and conditional protein language models used to design taste-active peptides.',
  },
  'methods/foundationmodelsmaskedlm': {
    title: 'Foundation Models: Masked Language Modeling',
    sidebarLabel: 'FM: Masked LM',
    group: 'methods',
    order: 15,
    description:
      'BERT-style pretrained models for biology: scBERT, scFoundation, CellFM and Geneformer for single-cell transfer learning, DNABERT for regulatory DNA, and Umami-BERT for taste peptides.',
  },
  'methods/foundationmodelsbiopriors': {
    title: 'Foundation Models: LM + Biological Priors',
    sidebarLabel: 'FM: LM + Bio Priors',
    group: 'methods',
    order: 16,
    description:
      'Foundation models that build an explicit biological prior into the backbone, tokenizing genes by protein-language-model embeddings so cells from unseen species can be embedded without orthology mapping.',
  },
  'methods/foundationmodelscellstate': {
    title: 'Foundation Models: Cell-State & Perturbation Prediction',
    sidebarLabel: 'FM: Cell-State',
    group: 'methods',
    order: 17,
    description:
      'Pretrained virtual-cell models predicting perturbation response across contexts: State, Stack, C2S-Scale and scGPT, and what their generalization claims rest on for livestock cell biology.',
  },
  'methods/foundationmodelsothermodalities': {
    title: 'Foundation Models (other modalities)',
    sidebarLabel: 'FM: Other Modalities',
    group: 'methods',
    order: 18,
    description:
      'Pretrained models beyond single-cell transcriptomics: taste-peptide predictors, multimodal omics LLMs, natural-product graph pretraining, and protein-phenotype models.',
  },
  'methods/literaturediscoveryagents': {
    title: 'Scientific Literature & Discovery Agents',
    sidebarLabel: 'Literature & Discovery Agents',
    group: 'methods',
    order: 19,
    description:
      'LLM agents for literature synthesis and autonomous discovery: retrieval-augmented paper QA, idea-to-manuscript pipelines, and lab-in-the-loop systems, and how each one verifies its own output.',
  },
  'methods/generalpurposebiomedicalagents': {
    title: 'General-Purpose Biomedical Agents',
    sidebarLabel: 'General-Purpose Agents',
    group: 'methods',
    order: 20,
    description:
      'LLM agents built for breadth across biomedical tasks without task-specific tuning: Biomni, BRAD, OLAF, STELLA, BioMANIA and the Virtual Lab, and where each of them places its trust.',
  },
  'methods/chemistrysynthesisagents': {
    title: 'Chemistry / Synthesis Agents',
    sidebarLabel: 'Chemistry Agents',
    group: 'methods',
    order: 21,
    description:
      'LLM agents specialized for chemistry: Coscientist and ChemCrow, their tool layers and safety checks, and why the architecture transfers to media, scaffold and flavor chemistry in cell-ag.',
  },
  'methods/domainspecificbiomedicalagents': {
    title: 'Domain-Specific Biomedical Agents',
    sidebarLabel: 'Domain-Specific Agents',
    group: 'methods',
    order: 22,
    description:
      'LLM agents purpose-built for one biomedical task: perturbation design, spatial biology, RNA-seq analysis, kinetic modeling, gene editing, protein design and single-cell data curation.',
  },
  'methods/robotscientistslabautomation': {
    title: 'Robot Scientists & Lab Automation',
    sidebarLabel: 'Robot Scientists',
    group: 'methods',
    order: 23,
    description:
      'AI coupled to physical lab automation for cellular agriculture: robotic search for iPSC differentiation conditions, automated strain design, autonomous cell passaging, and the Adam-to-Genesis lineage.',
  },
  'methods/benchmarksevaluation': {
    title: 'Benchmarks & Evaluation Frameworks',
    sidebarLabel: 'Benchmarks & Evaluation',
    group: 'methods',
    order: 24,
    description:
      'Benchmarks and evaluation frameworks for AI in biology and cellular agriculture: eval datasets, agent benchmarks, leaderboards, and verifier-reliability methodology.',
  },
  'methods/agentinfrastructure': {
    title: 'Agent Infrastructure (Frameworks, KGs, Protocols)',
    sidebarLabel: 'Agent Infrastructure',
    group: 'methods',
    order: 25,
    description:
      'The substrate biomedical AI agents run on: tool ecosystems and MCP protocols, biomedical knowledge graphs and graph-serving platforms, and language-agent training environments.',
  },

  // ── Datasets ───────────────────────────────────────────────────────────────
  // README → index page for the Datasets section
  'datasets/readme': {
    title: 'Datasets',
    sidebarLabel: 'Index',
    group: 'datasets',
    order: 0,
    description:
      'Train-on data artifacts for cellular-agriculture AI, organized by species: sequencing deposits, perturbation atlases, and genome-scale models.',
  },
  // Species pages — titles match H1 in each file (markdown emphasis stripped)
  'datasets/cow': {
    title: 'Cow / Bos taurus',
    sidebarLabel: 'Cow',
    group: 'datasets',
    order: 1,
    description:
      'Cultivated-beef datasets: bovine satellite cells, cell-line and tissue atlases, and a Bos taurus genome-scale metabolic model.',
  },
  'datasets/pig': {
    title: 'Pig / Sus scrofa',
    sidebarLabel: 'Pig',
    group: 'datasets',
    order: 2,
    description:
      'Cultivated-pork datasets: porcine myogenesis and adipogenesis deposits, multi-tissue atlases, and a Sus scrofa genome-scale model.',
  },
  'datasets/chicken': {
    title: 'Chicken / Gallus gallus',
    sidebarLabel: 'Chicken',
    group: 'datasets',
    order: 3,
    description:
      'Cultivated-chicken datasets: gallus fibroblast and myoblast deposits, functional-genomics atlases, and a chicken genome-scale model.',
  },
  'datasets/fish': {
    title: 'Fish',
    sidebarLabel: 'Fish',
    group: 'datasets',
    order: 4,
    description:
      'Cultivated-seafood datasets for fish: salmonid and teleost sequencing deposits and the AQUA-FAANG functional-genomics atlas.',
  },
  'datasets/crustacean': {
    title: 'Crustacean',
    sidebarLabel: 'Crustacean',
    group: 'datasets',
    order: 5,
    description:
      'Cultivated-seafood datasets for crustaceans: shrimp, crab, and crayfish muscle and growth sequencing deposits.',
  },
  'datasets/mollusk': {
    title: 'Mollusk',
    sidebarLabel: 'Mollusk',
    group: 'datasets',
    order: 6,
    description:
      'Cultivated-seafood datasets for mollusks: mussel, scallop, and snail muscle and tissue sequencing deposits.',
  },
  'datasets/sheep': {
    title: 'Sheep / Ovis aries',
    sidebarLabel: 'Sheep',
    group: 'datasets',
    order: 7,
    description:
      'Cultivated-lamb datasets: ovine meat-quality proteomics and metabolomics and a multi-tissue regulatory atlas.',
  },
  'datasets/goat': {
    title: 'Goat / Capra hircus',
    sidebarLabel: 'Goat',
    group: 'datasets',
    order: 8,
    description:
      'Cultivated-goat datasets: an early-stage species page; contributions welcome.',
  },
  'datasets/duck': {
    title: 'Duck / Anas platyrhynchos',
    sidebarLabel: 'Duck',
    group: 'datasets',
    order: 9,
    description:
      'Cultivated-duck datasets: multi-omics characterization of duck embryonic stem cells for cultivated meat.',
  },
  'datasets/turkey': {
    title: 'Turkey / Meleagris gallopavo',
    sidebarLabel: 'Turkey',
    group: 'datasets',
    order: 10,
    description:
      'Cultivated-turkey datasets: an early-stage species page; contributions welcome.',
  },
  // Cross-species & reference pages
  'datasets/crossspecies': {
    title: 'Cross-species reference substrate',
    sidebarLabel: 'Cross-species',
    group: 'datasets',
    order: 11,
    description:
      'Cross-species reference substrate for cell-ag AI: multi-species training tables and engineering datasets spanning taxa.',
  },
  'datasets/humanreference': {
    title: 'Human Reference (Homo sapiens)',
    sidebarLabel: 'Human Reference',
    group: 'datasets',
    order: 12,
    description:
      'Human reference data for cellular-agriculture AI: single-cell pretraining corpora and human genome-scale metabolic models.',
  },
  'datasets/choreference': {
    title: 'CHO Reference (Chinese Hamster Ovary)',
    sidebarLabel: 'CHO Reference',
    group: 'datasets',
    order: 13,
    description:
      'CHO (Chinese Hamster Ovary) reference data: the biopharma cell-line GEM family and reference substrate for cell-ag metabolic modeling.',
  },
  'datasets/microbialhostreference': {
    title: 'Microbial Host Reference',
    sidebarLabel: 'Microbial Hosts',
    group: 'datasets',
    order: 14,
    description:
      'Microbial-host reference data for precision-fermentation cellular agriculture: genome-scale metabolic models of yeast and Pichia production hosts.',
  },
  'datasets/benchmarks': {
    title: 'Benchmark & Evaluation Datasets',
    sidebarLabel: 'Benchmarks',
    group: 'datasets',
    order: 15,
    description:
      'AI/ML benchmark and evaluation datasets relevant to cellular agriculture: bundled eval suites for bioinformatics and protein models.',
  },
  'datasets/foodsafety': {
    title: 'Food Safety & Allergenicity',
    sidebarLabel: 'Food Safety',
    group: 'datasets',
    order: 16,
    description:
      'Food-safety datasets for cellular agriculture: labeled allergen sequence and IgE-epitope corpora for training and benchmarking allergenicity predictors.',
  },
  'datasets/sustainability': {
    title: 'Sustainability & Techno-Economics',
    sidebarLabel: 'Sustainability',
    group: 'datasets',
    order: 17,
    description:
      'Sustainability datasets for cellular agriculture: downloadable cultivated-meat life-cycle inventories behind the field’s techno-economic and environmental models.',
  },

  // ── Top-level prose pages ──────────────────────────────────────────────────
  contributing: {
    title: 'Contributing',
    sidebarLabel: 'Contributing',
    group: 'top',
    order: 1,
    description:
      'How to contribute to CAAIL: where each kind of paper, tool, dataset, or resource belongs, and how to add it.',
  },
  'other-resources': {
    title: 'Other Resources',
    sidebarLabel: 'Other Resources',
    group: 'top',
    order: 2,
    description:
      'Journal editorials and opinion on AI in science and in animal agriculture, field reports on the state of the sector, and cellular-agriculture ecosystem initiatives: research centers, consortia, and convening efforts.',
  },
  taxonomy: {
    title: 'Matrix Taxonomy',
    sidebarLabel: 'Matrix Taxonomy',
    group: 'top',
    order: 3,
    description:
      'Definitions of every AI/ML method row and cellular-agriculture research-area column in the Papers matrix: what each covers, what is out of scope, and how to tell confusable categories apart.',
  },
  'ai-agents-foundation-models': {
    title: 'AI Agents & Foundation Models',
    sidebarLabel: 'AI Agents & Foundation Models',
    group: 'top',
    order: 4,
    description:
      'The connective hub for AI agents and biological foundation models in cellular agriculture: agent frameworks, single-cell foundation models, the virtual-cell initiative, and where each is catalogued across CAAIL.',
  },
  'reference-works': {
    title: 'Reference Works',
    sidebarLabel: 'Reference Works',
    group: 'top',
    order: 5,
    description:
      'Reference textbooks and multi-volume works for cellular agriculture: the foundational cell-ag textbook and the Encyclopedia of Meat Sciences, with a DOI-resolvable chapter index of the cell-ag-relevant subset.',
  },
  funding: {
    title: 'Funding & Grants',
    sidebarLabel: 'Funding & Grants',
    group: 'top',
    order: 6,
    description:
      'Funding organizations and funding opportunities for cellular-agriculture research: the organizations that fund the field and the grant programs and research-portfolio mechanisms to follow.',
  },
  community: {
    title: 'Community',
    sidebarLabel: 'Community',
    group: 'top',
    order: 7,
    description:
      'The CAAIL community, its Slack workspace, GitHub issue and pull-request workflow, and Zotero group library: where to ask questions, where to propose additions, and the norms that apply across all of them.',
  },
};

// ---------------------------------------------------------------------------
// Directory slug → route prefix
// ---------------------------------------------------------------------------

const DIR_SLUG: Record<string, string> = {
  ResearchAreas: 'research-areas',
  Methods: 'methods',
  Datasets: 'datasets',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const CAAIL_PAGES = {
  /**
   * Resolve a source-path (relative to repo root, no leading slash, no `.md`)
   * to a route id.
   *
   * Examples:
   *   'ResearchAreas/Bioprocess'  →  'research-areas/bioprocess'
   *   'Datasets/Cow'              →  'datasets/cow'
   *   'CONTRIBUTING'              →  'contributing'
   */
  idForSourcePath(p: string): string {
    // Strip .md extension if present
    const stripped = p.endsWith('.md') ? p.slice(0, -3) : p;

    const slashIdx = stripped.indexOf('/');
    if (slashIdx === -1) {
      // Top-level file (e.g. CONTRIBUTING). Multi-word names get an explicit
      // hyphenated route id (the default lowercasing would merge the words).
      if (stripped === 'OtherResources') return 'other-resources';
      if (stripped === 'AIAgentsFoundationModels') return 'ai-agents-foundation-models';
      if (stripped === 'ReferenceWorks') return 'reference-works';
      return stripped.toLowerCase();
    }

    const dir = stripped.slice(0, slashIdx);
    const filename = stripped.slice(slashIdx + 1);
    const dirSlug = DIR_SLUG[dir] ?? dir.toLowerCase();
    return `${dirSlug}/${filename.toLowerCase()}`;
  },

  /** Look up metadata by route id. Returns `undefined` for unknown ids. */
  byId(id: string): PageMeta | undefined {
    return PAGES[id];
  },

  /**
   * Return all entries as an array of `{id, ...meta}` objects.
   *
   * Each element has the shape `{ id: string } & PageMeta` so callers can
   * filter/sort/map without needing to destructure a tuple.
   */
  all(): Array<{ id: string } & PageMeta> {
    return Object.entries(PAGES).map(([id, m]) => ({ id, ...m }));
  },

  /**
   * Given the raw file lists from the canonical directories, return the ids of
   * any files that lack a map entry.  Used in tests to catch map drift.
   *
   * `byDir` keys are directory names ('ResearchAreas', 'Datasets'); values are
   * arrays of filenames (with `.md` extension).
   */
  missingEntries(byDir: Record<string, string[]>): string[] {
    const missing: string[] = [];
    for (const [dir, files] of Object.entries(byDir)) {
      for (const file of files) {
        const id = CAAIL_PAGES.idForSourcePath(`${dir}/${file}`);
        if (!PAGES[id]) {
          missing.push(id);
        }
      }
    }
    return missing;
  },
};
