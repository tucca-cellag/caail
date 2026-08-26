/**
 * canonical-sources.ts — which repo-root files the docs loader turns into routes.
 *
 * WHY THIS IS ITS OWN MODULE, and not part of `loaders/caail-docs-loader.ts`
 * where it used to live. `site/scripts/private-paths.test.ts` is the guard that
 * proves `.env` and every private working tree are gitignored, and it needs this
 * list to know what must STAY publishable. Importing it from the loader dragged
 * `astro/loaders` and the whole Astro module graph into that guard: an Astro
 * major bump, a change to that package's export map, or any error thrown at the
 * loader's top level would take the guard down for a reason with nothing to do
 * with what it guards, and the failure would name a module the test has no
 * business touching.
 *
 * This file therefore has NO imports and must keep none. It is data.
 */

/**
 * Canonical source files to ingest, as paths relative to the repo root.
 *
 *   - Every top-level `*.md` in `dirs` is considered (enumerated with
 *     `fs.readdir` — no extra glob dependency needed).
 *   - `files` lists individual top-level files.
 *
 * Each candidate is resolved to a route id via `CAAIL_PAGES.idForSourcePath`;
 * any file whose id has no `CAAIL_PAGES` entry (e.g. the `CLAUDE.md` files in
 * those directories) is skipped, so the directory scan is allowed to be broad.
 */
export const CANONICAL_SOURCES = {
  dirs: ['ResearchAreas', 'Methods', 'Datasets'],
  files: [
    'CONTRIBUTING.md',
    'OtherResources.md',
    'Taxonomy.md',
    'AIAgentsFoundationModels.md',
    'ReferenceWorks.md',
    'Funding.md',
    'Community.md',
  ],
} as const;
