/**
 * catalog.ts — parses Software.md and Databases.md into catalog.json.
 *
 * Both files share one shape: `## <group>` sections containing `### [name](url)`
 * entries, each followed by a one-line description paragraph. Software.md labels
 * that paragraph `Summary:`; Databases.md uses the first paragraph verbatim — a
 * single code path covers both (the `Summary:` prefix is stripped if present).
 *
 * The parser READS the canonical files and never mutates them. Entries are
 * emitted in document order so the site can derive group order by first
 * appearance.
 */

import { fileURLToPath } from 'node:url';
import { toString as mdastToString } from 'mdast-util-to-string';
import { toHast } from 'mdast-util-to-hast';
import { toHtml } from 'hast-util-to-html';
import { visit } from 'unist-util-visit';
import type { Root, RootContent, Heading, Link, Paragraph } from 'mdast';

import { parseFile } from './markdown.js';
import { rewriteCaailLinks } from '../remark/rewrite-caail-links.js';
import { CatalogSchema, type Catalog, type CatalogEntry } from './types.js';

// ---------------------------------------------------------------------------
// Canonical paths (three levels up: parser → scripts → site → repo root)
// ---------------------------------------------------------------------------

const SOFTWARE_PATH: string = fileURLToPath(
  new URL('../../../Software.md', import.meta.url),
);
const DATABASES_PATH: string = fileURLToPath(
  new URL('../../../Databases.md', import.meta.url),
);

const SUMMARY_PREFIX_RE = /^Summary:\s*/i;

/**
 * Site base path, mirroring `BASE` in astro.config.mjs. Used by
 * rewriteCaailLinks so a repo-relative `.md` link inside an entry body resolves
 * to the same site route the prose pages use (e.g. `/caail/datasets/cow/`).
 */
const CATALOG_BASE = '/caail';

// ---------------------------------------------------------------------------
// Slug helpers (self-contained — mirrors papers.ts, kept local so this module
// has no cross-dependency on the Papers.md parser)
// ---------------------------------------------------------------------------

/** lowercase, spaces→`-`, strip all but [a-z0-9-], collapse repeats. */
function slugifyToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** 0→"", 1→"-b", 2→"-c", …, then numeric for ≥26. */
function disambiguationSuffix(index: number): string {
  if (index === 0) return '';
  if (index < 26) return `-${String.fromCharCode(97 + index)}`;
  return `-${index}`;
}

/**
 * Assign deterministic slugs: entries sharing a base slug are ordered by
 * document position; the first keeps the base, the rest get `-b`, `-c`, …
 */
function assignSlugs(entries: Array<Omit<CatalogEntry, 'slug'>>): CatalogEntry[] {
  const seen = new Map<string, number>();
  return entries.map((e) => {
    const base = slugifyToken(e.name) || 'entry';
    const idx = seen.get(base) ?? 0;
    seen.set(base, idx + 1);
    return { ...e, slug: base + disambiguationSuffix(idx) };
  });
}

// ---------------------------------------------------------------------------
// Per-file parse
// ---------------------------------------------------------------------------

/** Find the first descendant `link` node of a heading (the `### [name](url)`). */
function headingLink(heading: Heading): Link | null {
  let found: Link | null = null;
  visit(heading, 'link', (link: Link) => {
    if (found === null) found = link;
  });
  return found;
}

/**
 * Strip a leading `Summary:` label from the first text node of the first
 * paragraph in `nodes`, in place. Software.md prefixes each entry body with
 * `Summary: `; mutating the node (rather than the flattened string) ensures the
 * label is dropped from BOTH the plain-text and the rendered-HTML outputs.
 */
function stripSummaryLabel(nodes: RootContent[]): void {
  const para = nodes.find((n): n is Paragraph => n.type === 'paragraph');
  if (!para) return;
  const first = para.children[0];
  if (first && first.type === 'text') {
    first.value = first.value.replace(SUMMARY_PREFIX_RE, '');
  }
}

/**
 * Render an entry's body nodes to a `{ summary, summaryHtml }` pair.
 *
 * Both derive from the SAME nodes so they can't disagree: `summary` is the
 * flattened plain text (top-level nodes joined by spaces, for the search index
 * and the JS-disabled fallback); `summaryHtml` is the rendered HTML with every
 * hyperlink preserved and repo-relative `.md` links rewritten to site routes
 * (via rewriteCaailLinks). Returns empty strings when there is no body.
 *
 * @param bodyNodes  Sibling nodes between an H3 and the next heading.
 * @param sourcePath Repo-relative path of the source file (e.g. "Software.md"),
 *   used by rewriteCaailLinks to resolve the relative links.
 */
function renderBody(
  bodyNodes: RootContent[],
  sourcePath: string,
): { summary: string; summaryHtml: string } {
  if (bodyNodes.length === 0) return { summary: '', summaryHtml: '' };

  stripSummaryLabel(bodyNodes);

  // Plain text: mdast's toString concatenates block text with no separator, so
  // flatten each top-level node and join with spaces to keep paragraph
  // boundaries as word breaks (matters for search).
  const summary = bodyNodes
    .map((n) => mdastToString(n).trim())
    .filter((s) => s.length > 0)
    .join(' ')
    .replace(SUMMARY_PREFIX_RE, '');

  // HTML: rewrite internal `.md` links on a synthetic root, then mdast → hast →
  // HTML. Raw HTML in markdown is escaped (toHtml default) — the safe choice;
  // catalog bodies contain none.
  const bodyRoot: Root = { type: 'root', children: bodyNodes };
  rewriteCaailLinks({ base: CATALOG_BASE, sourcePath })(bodyRoot);
  const summaryHtml = toHtml(toHast(bodyRoot));

  return { summary, summaryHtml };
}

/**
 * Parse one catalog file into entries. Walks top-level nodes, tracking the
 * current H2 as `group`; each H3 becomes an entry whose `summary`/`summaryHtml`
 * are the full body (every node up to the next heading).
 *
 * @param path       Absolute path to read from disk.
 * @param sourcePath Repo-relative path used for link rewriting (e.g.
 *   "Software.md"). Defaults to the basename of `path`.
 */
export function parseCatalogFile(
  path: string,
  sourcePath: string = path.split('/').pop() ?? path,
): CatalogEntry[] {
  const root: Root = parseFile(path);
  const kids = root.children;
  const partial: Array<Omit<CatalogEntry, 'slug'>> = [];
  let group = '';

  for (let i = 0; i < kids.length; i++) {
    const node = kids[i];
    if (node.type !== 'heading') continue;
    const h = node as Heading;

    if (h.depth === 2) {
      group = mdastToString(h).trim();
      continue;
    }
    if (h.depth !== 3) continue;

    const link = headingLink(h);
    if (link === null) {
      throw new Error(
        `catalog: H3 entry without a link in ${path}: "${mdastToString(h).trim()}"`,
      );
    }

    // Body = every node after this H3 up to the next heading (any depth).
    const bodyNodes: RootContent[] = [];
    for (let j = i + 1; j < kids.length; j++) {
      const n = kids[j];
      if (n.type === 'heading') break;
      bodyNodes.push(n);
    }
    const { summary, summaryHtml } = renderBody(bodyNodes, sourcePath);

    partial.push({
      name: mdastToString(link).trim(),
      url: link.url,
      group,
      summary,
      summaryHtml,
    });
  }

  return assignSlugs(partial);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Build the catalog.json model from Software.md and Databases.md.
 *
 * @param softwarePath   Path to Software.md (defaults to canonical).
 * @param databasesPath  Path to Databases.md (defaults to canonical).
 */
export function buildCatalogModel(
  softwarePath: string = SOFTWARE_PATH,
  databasesPath: string = DATABASES_PATH,
): Catalog {
  const model: Catalog = {
    software: parseCatalogFile(softwarePath, 'Software.md'),
    databases: parseCatalogFile(databasesPath, 'Databases.md'),
  };
  return CatalogSchema.parse(model);
}
