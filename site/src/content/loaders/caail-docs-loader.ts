/**
 * caailDocsLoader — a custom Astro content-layer loader for the Starlight
 * `docs` collection.
 *
 * It composes TWO sources into one collection:
 *
 *   1. The in-repo Starlight docs under `site/src/content/docs/**` (homepage,
 *      Papers Explorer, etc.) — loaded via Astro's own `glob()` loader so those
 *      pages keep behaving exactly as before.
 *
 *   2. The canonical repo-root prose files (`ResearchAreas/*.md`,
 *      `Datasets/*.md`, `CONTRIBUTING.md`) — read directly from disk WITHOUT
 *      modifying them, and injected into the store with a synthetic `title`
 *      from `CAAIL_PAGES`.
 *
 * Why a manual read for the canonical files (and NOT `glob()`):
 * --------------------------------------------------------------
 * Starlight's `docsSchema()` REQUIRES `title`. The canonical files have no YAML
 * frontmatter, and several (e.g. `ResearchAreas/Bioprocess.md`) have no `# H1`
 * either, so nothing can derive a title. Astro's `glob()` loader calls
 * `context.parseData()` (schema validation) *during* its own `load()`, BEFORE a
 * caller could patch anything — see
 * `node_modules/astro/dist/content/loaders/glob.js` (`syncData` → `parseData`).
 * So a "glob then patch titles" approach fails validation first. Instead we read
 * each canonical file ourselves and pass an injected `{ title }` straight into
 * `parseData`, so validation passes on the first try.
 *
 * Astro content-layer API used (Astro 6.x, verified against installed source
 * `node_modules/astro/dist/content/loaders/{types,glob}.d.ts` and
 * `node_modules/astro/dist/content/{data-store,mutable-data-store}.d.ts`):
 *
 *   context.parseData({ id, data, filePath? }) => Promise<TData>
 *       Validates `data` against the collection schema (docsSchema()). We pass
 *       the injected `title` here; throws if invalid.
 *   context.renderMarkdown(content, { fileURL? }) => Promise<RenderedContent>
 *       Renders markdown to `{ html, metadata: { headings, frontmatter, ... } }`.
 *       At runtime Astro's `render()` serves `entry.rendered.html` directly
 *       (see `node_modules/astro/dist/content/runtime.js` ~L399), so providing
 *       `rendered` is what makes Starlight display the page.
 *   context.generateDigest(string) => string
 *       Non-cryptographic content digest for change detection.
 *   context.store.set({ id, data, body, filePath, digest, rendered }) => boolean
 *       Upserts a DataEntry. `filePath` is stored relative to the Astro project
 *       root (`site/`) in posix form to mirror the glob loader; for canonical
 *       files that is a `../`-prefixed path, which is fine — it is only used for
 *       image-reference rewriting (none here) and edit links.
 *
 * Internal `.md` links inside the rendered prose are rewritten at render time
 * by the `caailProseRemark` wrapper in astro.config.mjs (rewrite-caail-links +
 * strip-leading-h1), keyed off the `fileURL` passed to `renderMarkdown`.
 */

import { glob } from 'astro/loaders';
import type { Loader, LoaderContext } from 'astro/loaders';
import { readFile, readdir } from 'node:fs/promises';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAAIL_PAGES } from '../caail-pages.ts';

// content/loaders/ -> content/ -> src/ -> site/ -> repo root
const REPO_ROOT = new URL('../../../../', import.meta.url);

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
const CANONICAL_SOURCES = {
  dirs: ['ResearchAreas', 'Datasets'],
  files: ['CONTRIBUTING.md', 'OtherResources.md', 'Taxonomy.md'],
} as const;

export function caailDocsLoader(): Loader {
  // Astro's own loader for the in-repo Starlight docs (mirrors docsLoader()).
  const inRepo = glob({
    base: './src/content/docs',
    pattern: '**/[^_]*.{md,mdx}',
  });

  return {
    name: 'caail-docs-loader',
    async load(context: LoaderContext) {
      // 1. Load the in-repo Starlight docs (homepage, papers/explorer, ...).
      await inRepo.load(context);

      // 2. Discover and ingest the canonical repo-root prose files.
      const projectRootPath = fileURLToPath(context.config.root); // = site/

      const candidates: string[] = [...CANONICAL_SOURCES.files];
      for (const dir of CANONICAL_SOURCES.dirs) {
        const dirURL = new URL(`${dir}/`, REPO_ROOT);
        const entries = await readdir(dirURL, { withFileTypes: true });
        for (const dirent of entries) {
          if (dirent.isFile() && dirent.name.endsWith('.md')) {
            candidates.push(`${dir}/${dirent.name}`);
          }
        }
      }

      const storedIds = new Set<string>();

      for (const rel of candidates) {
        const id = CAAIL_PAGES.idForSourcePath(rel);
        const meta = CAAIL_PAGES.byId(id);
        if (!meta) {
          // No curated metadata (e.g. ResearchAreas/CLAUDE.md) — not a site page.
          continue;
        }

        const fileURL = new URL(rel, REPO_ROOT);
        const absFile = fileURLToPath(fileURL);

        let raw: string;
        try {
          raw = await readFile(fileURL, 'utf-8');
        } catch (err) {
          throw new Error(
            `caail-docs-loader: failed to read expected canonical source "${rel}" ` +
              `(resolved: ${absFile}): ${(err as NodeJS.ErrnoException).message}`,
            { cause: err },
          );
        }

        // Canonical files have no frontmatter, so the whole file is the body.
        // Inject the curated title so docsSchema() validation passes.
        const data = await context.parseData({
          id,
          data: {
            title: meta.title,
            description: meta.description,
            sidebar: { label: meta.sidebarLabel, order: meta.order },
          },
        });

        const rendered = await context.renderMarkdown(raw, { fileURL });
        const digest = context.generateDigest(raw);

        // filePath relative to the Astro project root (site/), posix-style, to
        // match what the glob loader stores. For repo-root files this is a
        // `../`-prefixed path.
        const filePath = relative(projectRootPath, absFile).split(sep).join('/');

        context.store.set({
          id,
          data,
          body: raw,
          filePath,
          digest,
          rendered,
        });

        storedIds.add(id);
      }

      // Warn about any CAAIL_PAGES prose entries that were not produced from a
      // real file on disk (catches renamed / removed canonical sources).
      const proseGroups = new Set(['research-areas', 'datasets', 'top']);
      const missingFromDisk = CAAIL_PAGES.all()
        .filter((p) => proseGroups.has(p.group) && !storedIds.has(p.id))
        .map((p) => p.id);
      if (missingFromDisk.length > 0) {
        context.logger.warn(
          `caail-docs-loader: the following CAAIL_PAGES entries have no matching source file on disk and were NOT rendered: ${missingFromDisk.join(', ')}`,
        );
      }
    },
  };
}

