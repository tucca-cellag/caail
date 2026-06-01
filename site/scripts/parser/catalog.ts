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
import { visit } from 'unist-util-visit';
import type { Root, Heading, Link } from 'mdast';

import { parseFile } from './markdown.js';
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
 * Parse one catalog file into entries. Walks top-level nodes, tracking the
 * current H2 as `group`; each H3 becomes an entry whose `summary` is the first
 * paragraph before the next heading.
 */
export function parseCatalogFile(path: string): CatalogEntry[] {
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

    // First paragraph after this H3, before the next heading, is the summary.
    let summary = '';
    for (let j = i + 1; j < kids.length; j++) {
      const n = kids[j];
      if (n.type === 'heading') break;
      if (n.type === 'paragraph') {
        summary = mdastToString(n).trim().replace(SUMMARY_PREFIX_RE, '');
        break;
      }
    }

    partial.push({
      name: mdastToString(link).trim(),
      url: link.url,
      group,
      summary,
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
    software: parseCatalogFile(softwarePath),
    databases: parseCatalogFile(databasesPath),
  };
  return CatalogSchema.parse(model);
}
