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
  },
  'research-areas/cellengineering': {
    title: 'Cellular Engineering',
    sidebarLabel: 'Cellular Engineering',
    group: 'research-areas',
    order: 2,
  },
  'research-areas/bioprocess': {
    title: 'Bioprocess control',
    sidebarLabel: 'Bioprocess control',
    group: 'research-areas',
    order: 3,
  },
  'research-areas/scaffolding': {
    title: 'Scaffolding',
    sidebarLabel: 'Scaffolding',
    group: 'research-areas',
    order: 4,
  },
  'research-areas/sensoryprediction': {
    title: 'Sensory Prediction',
    sidebarLabel: 'Sensory Prediction',
    group: 'research-areas',
    order: 5,
  },
  'research-areas/aitooling': {
    title: 'AI Tooling / Methodology',
    sidebarLabel: 'AI Tooling',
    group: 'research-areas',
    order: 6,
  },
  'research-areas/aievaluation': {
    title: 'AI Evaluation & Benchmarking',
    sidebarLabel: 'AI Evaluation',
    group: 'research-areas',
    order: 7,
  },
  'research-areas/metabolicmodeling': {
    title: 'Metabolic Modeling',
    sidebarLabel: 'Metabolic Modeling',
    group: 'research-areas',
    order: 8,
  },

  // ── Datasets ───────────────────────────────────────────────────────────────
  // README → index page for the Datasets section
  'datasets/readme': {
    title: 'Datasets',
    sidebarLabel: 'Index',
    group: 'datasets',
    order: 0,
  },
  // Species pages — titles match H1 in each file (markdown emphasis stripped)
  'datasets/cow': {
    title: 'Cow / Bos taurus',
    sidebarLabel: 'Cow',
    group: 'datasets',
    order: 1,
  },
  'datasets/pig': {
    title: 'Pig / Sus scrofa',
    sidebarLabel: 'Pig',
    group: 'datasets',
    order: 2,
  },
  'datasets/chicken': {
    title: 'Chicken / Gallus gallus',
    sidebarLabel: 'Chicken',
    group: 'datasets',
    order: 3,
  },
  'datasets/fish': {
    title: 'Fish',
    sidebarLabel: 'Fish',
    group: 'datasets',
    order: 4,
  },
  'datasets/crustacean': {
    title: 'Crustacean',
    sidebarLabel: 'Crustacean',
    group: 'datasets',
    order: 5,
  },
  'datasets/mollusk': {
    title: 'Mollusk',
    sidebarLabel: 'Mollusk',
    group: 'datasets',
    order: 6,
  },
  'datasets/sheep': {
    title: 'Sheep / Ovis aries',
    sidebarLabel: 'Sheep',
    group: 'datasets',
    order: 7,
  },
  'datasets/goat': {
    title: 'Goat / Capra hircus',
    sidebarLabel: 'Goat',
    group: 'datasets',
    order: 8,
  },
  'datasets/duck': {
    title: 'Duck / Anas platyrhynchos',
    sidebarLabel: 'Duck',
    group: 'datasets',
    order: 9,
  },
  'datasets/turkey': {
    title: 'Turkey / Meleagris gallopavo',
    sidebarLabel: 'Turkey',
    group: 'datasets',
    order: 10,
  },
  // Cross-species & reference pages
  'datasets/crossspecies': {
    title: 'Cross-species reference substrate',
    sidebarLabel: 'Cross-species',
    group: 'datasets',
    order: 11,
  },
  'datasets/humanreference': {
    title: 'Human Reference (Homo sapiens)',
    sidebarLabel: 'Human Reference',
    group: 'datasets',
    order: 12,
  },
  'datasets/choreference': {
    title: 'CHO Reference (Chinese Hamster Ovary)',
    sidebarLabel: 'CHO Reference',
    group: 'datasets',
    order: 13,
  },
  'datasets/benchmarks': {
    title: 'Benchmark & Evaluation Datasets',
    sidebarLabel: 'Benchmarks',
    group: 'datasets',
    order: 14,
  },

  // ── Top-level prose pages ──────────────────────────────────────────────────
  contributing: {
    title: 'Contributing',
    sidebarLabel: 'Contributing',
    group: 'top',
    order: 1,
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
      // Top-level file (e.g. CONTRIBUTING)
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
