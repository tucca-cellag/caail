/**
 * Curated title/sidebar map for the canonical prose pages the CAAIL site renders.
 *
 * Titles for Datasets pages are verified against the real H1 headers in the
 * canonical Markdown files (stripping leading `# ` and de-emphasising `*…*`).
 * Titles for ResearchAreas pages use the matrix column labels from Papers.md.
 */

export type PageGroup = 'research-areas' | 'datasets' | 'top';

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
      'AI and machine learning for cell-culture media optimization in cellular agriculture — design of experiments, Bayesian optimization, and data-driven formulation.',
  },
  'research-areas/cellengineering': {
    title: 'Cellular Engineering',
    sidebarLabel: 'Cellular Engineering',
    group: 'research-areas',
    order: 2,
    description:
      'Computational and AI approaches to cellular engineering for cultivated meat — cell-line development, differentiation, and genome-scale modeling.',
  },
  'research-areas/bioprocess': {
    title: 'Bioprocess control',
    sidebarLabel: 'Bioprocess control',
    group: 'research-areas',
    order: 3,
    description:
      'AI and modeling for bioprocess control and scale-up in cellular agriculture — bioreactor CFD, soft sensors, and process optimization.',
  },
  'research-areas/scaffolding': {
    title: 'Scaffolding',
    sidebarLabel: 'Scaffolding',
    group: 'research-areas',
    order: 4,
    description:
      'Computational methods for scaffolding and biomaterials in cultivated meat — structure design, simulation, and tissue architecture.',
  },
  'research-areas/sensoryprediction': {
    title: 'Sensory Prediction',
    sidebarLabel: 'Sensory Prediction',
    group: 'research-areas',
    order: 5,
    description:
      'Predicting flavor, texture, and sensory quality of cultivated meat with AI — sensomics, multi-omics, and machine-learning models.',
  },
  'research-areas/aitooling': {
    title: 'AI Tooling / Methodology',
    sidebarLabel: 'AI Tooling',
    group: 'research-areas',
    order: 6,
    description:
      'General-purpose AI methods, agents, and tooling applicable to cellular agriculture — foundation models, LLM agents, and ML infrastructure.',
  },
  'research-areas/aievaluation': {
    title: 'AI Evaluation & Benchmarking',
    sidebarLabel: 'AI Evaluation',
    group: 'research-areas',
    order: 7,
    description:
      'Benchmarks and evaluation methods for AI in biology and cellular agriculture — eval datasets, leaderboards, and model assessment.',
  },
  'research-areas/metabolicmodeling': {
    title: 'Metabolic Modeling',
    sidebarLabel: 'Metabolic Modeling',
    group: 'research-areas',
    order: 8,
    description:
      'Genome-scale metabolic modeling and strain design for cellular agriculture — constraint-based modeling, flux analysis, and metabolic engineering.',
  },

  // ── Datasets ───────────────────────────────────────────────────────────────
  // README → index page for the Datasets section
  'datasets/readme': {
    title: 'Datasets',
    sidebarLabel: 'Index',
    group: 'datasets',
    order: 0,
    description:
      'Train-on data artifacts for cellular-agriculture AI, organized by species — sequencing deposits, perturbation atlases, and genome-scale models.',
  },
  // Species pages — titles match H1 in each file (markdown emphasis stripped)
  'datasets/cow': {
    title: 'Cow / Bos taurus',
    sidebarLabel: 'Cow',
    group: 'datasets',
    order: 1,
    description:
      'Cultivated-beef datasets — bovine satellite cells, cell-line and tissue atlases, and a Bos taurus genome-scale metabolic model.',
  },
  'datasets/pig': {
    title: 'Pig / Sus scrofa',
    sidebarLabel: 'Pig',
    group: 'datasets',
    order: 2,
    description:
      'Cultivated-pork datasets — porcine myogenesis and adipogenesis deposits, multi-tissue atlases, and a Sus scrofa genome-scale model.',
  },
  'datasets/chicken': {
    title: 'Chicken / Gallus gallus',
    sidebarLabel: 'Chicken',
    group: 'datasets',
    order: 3,
    description:
      'Cultivated-chicken datasets — gallus fibroblast and myoblast deposits, functional-genomics atlases, and a chicken genome-scale model.',
  },
  'datasets/fish': {
    title: 'Fish',
    sidebarLabel: 'Fish',
    group: 'datasets',
    order: 4,
    description:
      'Cultivated-seafood datasets for fish — salmonid and teleost sequencing deposits and the AQUA-FAANG functional-genomics atlas.',
  },
  'datasets/crustacean': {
    title: 'Crustacean',
    sidebarLabel: 'Crustacean',
    group: 'datasets',
    order: 5,
    description:
      'Cultivated-seafood datasets for crustaceans — shrimp, crab, and crayfish muscle and growth sequencing deposits.',
  },
  'datasets/mollusk': {
    title: 'Mollusk',
    sidebarLabel: 'Mollusk',
    group: 'datasets',
    order: 6,
    description:
      'Cultivated-seafood datasets for mollusks — mussel, scallop, and snail muscle and tissue sequencing deposits.',
  },
  'datasets/sheep': {
    title: 'Sheep / Ovis aries',
    sidebarLabel: 'Sheep',
    group: 'datasets',
    order: 7,
    description:
      'Cultivated-lamb datasets — ovine meat-quality proteomics and metabolomics and a multi-tissue regulatory atlas.',
  },
  'datasets/goat': {
    title: 'Goat / Capra hircus',
    sidebarLabel: 'Goat',
    group: 'datasets',
    order: 8,
    description:
      'Cultivated-goat datasets — an early-stage species page; contributions welcome.',
  },
  'datasets/duck': {
    title: 'Duck / Anas platyrhynchos',
    sidebarLabel: 'Duck',
    group: 'datasets',
    order: 9,
    description:
      'Cultivated-duck datasets — multi-omics characterization of duck embryonic stem cells for cultivated meat.',
  },
  'datasets/turkey': {
    title: 'Turkey / Meleagris gallopavo',
    sidebarLabel: 'Turkey',
    group: 'datasets',
    order: 10,
    description:
      'Cultivated-turkey datasets — an early-stage species page; contributions welcome.',
  },
  // Cross-species & reference pages
  'datasets/crossspecies': {
    title: 'Cross-species reference substrate',
    sidebarLabel: 'Cross-species',
    group: 'datasets',
    order: 11,
    description:
      'Cross-species reference substrate for cell-ag AI — multi-species training tables and engineering datasets spanning taxa.',
  },
  'datasets/humanreference': {
    title: 'Human Reference (Homo sapiens)',
    sidebarLabel: 'Human Reference',
    group: 'datasets',
    order: 12,
    description:
      'Human reference data for cellular-agriculture AI — single-cell pretraining corpora and human genome-scale metabolic models.',
  },
  'datasets/choreference': {
    title: 'CHO Reference (Chinese Hamster Ovary)',
    sidebarLabel: 'CHO Reference',
    group: 'datasets',
    order: 13,
    description:
      'CHO (Chinese Hamster Ovary) reference data — the biopharma cell-line GEM family and reference substrate for cell-ag metabolic modeling.',
  },
  'datasets/benchmarks': {
    title: 'Benchmark & Evaluation Datasets',
    sidebarLabel: 'Benchmarks',
    group: 'datasets',
    order: 14,
    description:
      'AI/ML benchmark and evaluation datasets relevant to cellular agriculture — bundled eval suites for bioinformatics and protein models.',
  },

  // ── Top-level prose pages ──────────────────────────────────────────────────
  contributing: {
    title: 'Contributing',
    sidebarLabel: 'Contributing',
    group: 'top',
    order: 1,
    description:
      'How to contribute to CAAIL — where each kind of paper, tool, dataset, or resource belongs, and how to add it.',
  },
  'other-resources': {
    title: 'Other Resources',
    sidebarLabel: 'Other Resources',
    group: 'top',
    order: 2,
    description:
      'Journal editorials and opinion on AI in science, and cellular-agriculture ecosystem initiatives — research centers, consortia, and convening efforts.',
  },
  taxonomy: {
    title: 'Matrix Taxonomy',
    sidebarLabel: 'Matrix Taxonomy',
    group: 'top',
    order: 3,
    description:
      'Definitions of every AI/ML method row and cellular-agriculture research-area column in the Papers matrix — what each covers, what is out of scope, and how to tell confusable categories apart.',
  },
  'ai-agents-foundation-models': {
    title: 'AI Agents & Foundation Models',
    sidebarLabel: 'AI Agents & Foundation Models',
    group: 'top',
    order: 4,
    description:
      'The connective hub for AI agents and biological foundation models in cellular agriculture — agent frameworks, single-cell foundation models, the virtual-cell initiative, and where each is catalogued across CAAIL.',
  },
  'reference-works': {
    title: 'Reference Works',
    sidebarLabel: 'Reference Works',
    group: 'top',
    order: 5,
    description:
      'Reference textbooks and multi-volume works for cellular agriculture — the foundational cell-ag textbook and the Encyclopedia of Meat Sciences, with a DOI-resolvable chapter index of the cell-ag-relevant subset.',
  },
  funding: {
    title: 'Funding & Grants',
    sidebarLabel: 'Funding & Grants',
    group: 'top',
    order: 6,
    description:
      'Funding organizations and funding opportunities for cellular-agriculture research — the organizations that fund the field and the grant programs and research-portfolio mechanisms to follow.',
  },
};

// ---------------------------------------------------------------------------
// Directory slug → route prefix
// ---------------------------------------------------------------------------

const DIR_SLUG: Record<string, string> = {
  ResearchAreas: 'research-areas',
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
