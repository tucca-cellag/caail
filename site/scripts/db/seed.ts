/**
 * seed.ts — canonical Markdown -> SQLite, reusing the real parser as the ETL.
 *
 * Seeds content only (raw citation md, cell membership, entry body md, inventory
 * cells); everything derived (APA fields, summaries, slugs) is recomputed by the
 * parser at parse time. Frozen namespaced ids are assigned once here and stored.
 *
 * Topic seeding is the ETL's deterministic auto-tag pass: a small set of recurring
 * cross-cutting subjects (the "Media / Bioprocess / Sensory recur" observation in
 * #78) plus a per-group topic for full catalog coverage. Manual per-item curation
 * and vocabulary reconciliation are a later pass — this is the seed, not the finish.
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { PapersData } from '../parser/types.js';
import { INVENTORY_PAGES } from '../parser/datasets.js';
import { REPO_ROOT, assignId, frozenSlug, type Db } from './lib.js';
import { extractCatalogEntries, extractInventory, extractMatrixHeaders, extractPaperBlockquotes, type CatalogRaw } from './extract.js';

// --- papers ----------------------------------------------------------------

export function seedPapers(db: Db, model: PapersData, papersPath: string): void {
  const insItem = db.prepare('INSERT OR IGNORE INTO items(id,type,slug) VALUES(?,?,?)');
  const insPaper = db.prepare(
    'INSERT INTO papers(item_id,ref_id,section,raw,blockquotes_md,ordinal) VALUES(?,?,?,?,?,?)',
  );
  const insArea = db.prepare('INSERT INTO areas(key,label,header_md,ordinal) VALUES(?,?,?,?)');
  const insMethod = db.prepare('INSERT INTO methods(label,header_md,ordinal) VALUES(?,?,?)');
  const insCell = db.prepare(
    'INSERT INTO matrix_cells(method,area_key,ref_id,label,ordinal) VALUES(?,?,?,?,?)',
  );

  const headers = extractMatrixHeaders(papersPath);
  if (headers.areas.length !== model.areas.length || headers.methods.length !== model.methods.length) {
    throw new Error('seedPapers: matrix header/model axis count mismatch');
  }
  model.areas.forEach((a, i) => insArea.run(a.key, a.label, headers.areas[i], i));
  model.methods.forEach((m, i) => insMethod.run(m, headers.methods[i], i));
  // Verbatim trailing blockquote run per reference (Code/Data/Models/any label), so the
  // emit reproduces them attached to their own citation — not just the typed two.
  const bqByRef = extractPaperBlockquotes(papersPath);
  model.references.forEach((r, i) => {
    const id = `paper:${r.id}`;
    insItem.run(id, 'paper', String(r.id));
    insPaper.run(id, r.id, r.section, r.raw, bqByRef.get(r.id) ?? null, i);
  });

  let ord = 0;
  for (const cell of model.cells) {
    const seenRefs = new Set<number>();
    cell.refIds.forEach((refId, k) => {
      // matrix_cells PK is (method, area_key, ref_id); a ref cited twice in one cell would
      // hit a UNIQUE constraint mid-insert. Fail with a clear, actionable message instead.
      if (seenRefs.has(refId)) {
        throw new Error(
          `seedPapers: reference #${refId} is cited twice in the ${cell.method} × ${cell.area} ` +
            `matrix cell — remove the duplicate citation in Papers.md.`,
        );
      }
      seenRefs.add(refId);
      insCell.run(cell.method, cell.area, refId, cell.labels[k], ord++);
    });
  }
}

// --- catalog (software + databases) ----------------------------------------

export function seedCatalog(db: Db, entries: CatalogRaw[], type: 'software' | 'database'): void {
  const insItem = db.prepare('INSERT OR IGNORE INTO items(id,type,slug) VALUES(?,?,?)');
  const insCat = db.prepare(
    'INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,ordinal) VALUES(?,?,?,?,?,?,?)',
  );
  const prefix = type === 'software' ? 'sw' : 'db';
  const seen = new Set<string>();
  entries.forEach((e, i) => {
    const id = assignId(seen, frozenSlug(e.name, prefix));
    insItem.run(id, type, id.slice(prefix.length + 1));
    insCat.run(id, e.name, e.url, e.group, e.headingMd, e.bodyMd, i);
  });
}

// --- dataset inventory rows ------------------------------------------------

const ACCESSION = /GSE\d+|PRJ[A-Z]+\d+|PXD\d+|CRA\d+|E-MTAB-\d+|SRP\d+|GSM\d+/;

/** Seed one page's `## Complete data inventory` rows as first-class ds: records. */
export function seedDatasetPage(db: Db, page: string, seen: Set<string>): number {
  const path = join(REPO_ROOT, 'Datasets', `${page}.md`);
  if (!existsSync(path)) return 0;
  const inv = extractInventory(path);
  if (!inv) return 0;
  const insItem = db.prepare('INSERT OR IGNORE INTO items(id,type,slug) VALUES(?,?,?)');
  const insRow = db.prepare(
    'INSERT INTO dataset_rows(item_id,page,cells_json,ordinal) VALUES(?,?,?,?)',
  );
  inv.rows.forEach((cells, i) => {
    const joined = cells.join(' ');
    const acc = joined.match(ACCESSION)?.[0];
    const seed = acc ?? cells[0].replace(/[[\]`*]/g, '').split(/\s+/).slice(0, 3).join('-');
    const id = assignId(seen, frozenSlug(seed, 'ds'));
    insItem.run(id, 'dataset', id.slice(3));
    insRow.run(id, page, JSON.stringify(cells), i);
  });
  return inv.rows.length;
}

/** Seed inventory rows across every inventory-bearing dataset page. */
export function seedDatasets(db: Db): Record<string, number> {
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  for (const page of INVENTORY_PAGES) {
    const n = seedDatasetPage(db, page, seen);
    if (n) counts[page] = n;
  }
  return counts;
}

// --- topics (deterministic two-tier auto-tag seed) -------------------------

interface Theme { slug: string; label: string; area?: string; kw: RegExp; }
interface FineTag { slug: string; label: string; theme: string; kw: RegExp; sections?: RegExp; }

/** The fixed 7-theme backbone (curator-designed). `area` links to a matrix column. */
const THEMES: Theme[] = [
  { slug: 'media-growth-factors', label: 'Media & Growth Factors', area: 'Media Optimization', kw: /media|serum|growth[- ]?factor|formulation|cytokine/i },
  { slug: 'cell-lines-engineering', label: 'Cell Lines & Engineering', area: 'Cellular Engineering', kw: /cell[- ]?line|engineering|crispr|perturbation|differentiation|stem|senescen|immortal|atlas|single[- ]?cell|muscle|adipo/i },
  { slug: 'bioprocess-scale-up', label: 'Bioprocess & Scale-Up', area: 'Bioprocess & Scale-Up', kw: /bioprocess|bioreactor|scal(e|ing)|fermentation|perfusion|process/i },
  { slug: 'scaffolding-biomaterials', label: 'Scaffolding & Biomaterials', area: 'Scaffolding', kw: /scaffold|biomaterial|bioprint|3d[- ]?print|hydrogel|texture/i },
  { slug: 'sensory-flavor', label: 'Sensory & Flavor', area: 'Sensory Prediction', kw: /sensor|flavou?r|taste|aroma|mass[- ]?spec|chemometr|spectr|metabolomic/i },
  { slug: 'metabolism-modeling', label: 'Metabolism & Modeling', kw: /metabol|flux|genome[- ]?scale|pathway|\bgem\b|sbml|strain/i },
  { slug: 'ai-methods-tooling', label: 'AI Methods & Tooling', area: 'AI Tooling / Methodology', kw: /agent|foundation[- ]?model|\bllm\b|benchmark|framework|ontolog|database|repositor|\btool/i },
];

/** Earned fine tags (initial seed; slugs are DISJOINT from every theme slug). */
const FINE_TAGS: FineTag[] = [
  { slug: 'serum-free-media', label: 'Serum-free media', theme: 'media-growth-factors', kw: /serum[- ]?free|serum/i },
  { slug: 'media-optimization', label: 'Media optimization', theme: 'media-growth-factors', kw: /media optim|formulation|design of experiment|\bdoe\b/i },
  { slug: 'growth-factors', label: 'Growth factors', theme: 'media-growth-factors', kw: /growth[- ]?factor|cytokine|recombinant protein/i },
  { slug: 'cell-line-engineering', label: 'Cell-line engineering', theme: 'cell-lines-engineering', kw: /cell[- ]?line|crispr|perturbation|gene[- ]?edit/i },
  { slug: 'single-cell-atlases', label: 'Single-cell atlases', theme: 'cell-lines-engineering', kw: /single[- ]?cell|atlas|scrna|snrna/i },
  { slug: 'bioreactor-scale-up', label: 'Bioreactor & scale-up', theme: 'bioprocess-scale-up', kw: /bioreactor|scal(e|ing)|\bcfd\b|perfusion|fermentation/i },
  { slug: 'scaffolds-biomaterials', label: 'Scaffolds & biomaterials', theme: 'scaffolding-biomaterials', kw: /scaffold|biomaterial|bioprint|hydrogel/i },
  { slug: 'flavor-sensory', label: 'Flavor & sensory prediction', theme: 'sensory-flavor', kw: /flavou?r|taste|aroma|sensory/i, sections: /Sensory & Flavor Reference Work/ },
  { slug: 'mass-spectrometry', label: 'Mass spectrometry & metabolomics', theme: 'sensory-flavor', kw: /mass[- ]?spec|chemometr|metabolomic|spectr/i },
  { slug: 'metabolic-modeling', label: 'Metabolic modeling', theme: 'metabolism-modeling', kw: /metabol|flux|genome[- ]?scale|\bgem\b|sbml|strain[- ]?design/i, sections: /Metabolic Reference Work/ },
  { slug: 'ai-agents', label: 'AI agents & foundation models', theme: 'ai-methods-tooling', kw: /agent|foundation[- ]?model|\bllm\b/i },
  { slug: 'benchmarks-evaluation', label: 'Benchmarks & evaluation', theme: 'ai-methods-tooling', kw: /benchmark|evaluation/i },
];

export const THEME_SLUGS = THEMES.map((t) => t.slug).sort();

export function seedTopics(db: Db): { topics: number; tags: number } {
  // Guard the shared slug namespace at seed time (schema UNIQUE would otherwise throw).
  const themeSet = new Set(THEMES.map((t) => t.slug));
  for (const f of FINE_TAGS) if (themeSet.has(f.slug)) throw new Error(`seedTopics: fine-tag slug '${f.slug}' collides with a theme slug`);

  const insItem = db.prepare('INSERT OR IGNORE INTO items(id,type,slug) VALUES(?,?,?)');
  const insTopic = db.prepare('INSERT INTO topics(item_id,slug,label,tier,theme_slug,area_key) VALUES(?,?,?,?,?,?)');
  const insAlias = db.prepare('INSERT OR IGNORE INTO aliases(alias,topic_id) VALUES(?,?)');
  const tag = db.prepare('INSERT OR IGNORE INTO item_topics(item_id,topic_id) VALUES(?,?)');
  const areaKey = (label: string) =>
    (db.prepare('SELECT key FROM areas WHERE label=?').get(label) as { key: string } | undefined)?.key ?? null;
  const topicId = (slug: string) => `topic:${slug}`;

  // 1. Themes, then fine tags.
  for (const t of THEMES) {
    insItem.run(topicId(t.slug), 'topic', t.slug);
    insTopic.run(topicId(t.slug), t.slug, t.label, 'theme', null, t.area ? areaKey(t.area) : null);
  }
  for (const f of FINE_TAGS) {
    insItem.run(topicId(f.slug), 'topic', f.slug);
    insTopic.run(topicId(f.slug), f.slug, f.label, 'tag', f.theme, null);
  }

  // 2. Aliases: every catalog group string -> a theme (kw match, fallback ai-methods-tooling).
  const groupTheme = (grp: string) => (THEMES.find((t) => t.kw.test(grp)) ?? THEMES.find((t) => t.slug === 'ai-methods-tooling')!).slug;
  for (const { grp } of db.prepare('SELECT DISTINCT grp FROM catalog').all() as { grp: string }[]) {
    insAlias.run(grp, topicId(groupTheme(grp)));
  }

  // 3. Papers: matrix area -> its theme; Reference-Work section + raw citation -> fine tags.
  const areaToTheme = new Map<string, string>();
  for (const t of THEMES) if (t.area) { const k = areaKey(t.area); if (k) areaToTheme.set(k, topicId(t.slug)); }
  for (const c of db.prepare('SELECT DISTINCT area_key, ref_id FROM matrix_cells').all() as any[]) {
    const tid = areaToTheme.get(c.area_key);
    if (tid) tag.run(`paper:${c.ref_id}`, tid);
  }
  for (const p of db.prepare('SELECT item_id, section, raw FROM papers').all() as any[]) {
    for (const f of FINE_TAGS) if (f.sections?.test(p.section) || f.kw.test(p.raw)) tag.run(p.item_id, topicId(f.slug));
  }

  // 4. Catalog: group -> theme (via alias); group+name -> fine tags.
  for (const c of db.prepare('SELECT item_id, grp, name FROM catalog').all() as any[]) {
    tag.run(c.item_id, topicId(groupTheme(c.grp)));
    const text = `${c.grp} ${c.name}`;
    for (const f of FINE_TAGS) if (f.kw.test(text)) tag.run(c.item_id, topicId(f.slug));
  }

  // 5. Datasets: cell text -> theme + fine tags.
  for (const d of db.prepare('SELECT item_id, cells_json FROM dataset_rows').all() as any[]) {
    const text = (JSON.parse(d.cells_json) as string[]).join(' ');
    for (const t of THEMES) if (t.kw.test(text)) tag.run(d.item_id, topicId(t.slug));
    for (const f of FINE_TAGS) if (f.kw.test(text)) tag.run(d.item_id, topicId(f.slug));
  }

  const topics = (db.prepare('SELECT COUNT(*) c FROM topics').get() as any).c;
  const tags = (db.prepare('SELECT COUNT(*) c FROM item_topics').get() as any).c;
  return { topics, tags };
}
