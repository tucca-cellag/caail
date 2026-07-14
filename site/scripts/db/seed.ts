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
import { REPO_ROOT, assignId, frozenSlug, slugify, type Db } from './lib.js';
import { extractCatalogEntries, extractInventory, extractMatrixHeaders, type CatalogRaw } from './extract.js';

// --- papers ----------------------------------------------------------------

export function seedPapers(db: Db, model: PapersData, papersPath: string): void {
  const insItem = db.prepare('INSERT OR IGNORE INTO items(id,type,slug) VALUES(?,?,?)');
  const insPaper = db.prepare(
    'INSERT INTO papers(item_id,ref_id,section,raw,code_url,data_url,ordinal) VALUES(?,?,?,?,?,?,?)',
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
  model.references.forEach((r, i) => {
    const id = `paper:${r.id}`;
    insItem.run(id, 'paper', String(r.id));
    insPaper.run(id, r.id, r.section, r.raw, r.codeUrl ?? null, r.dataUrl ?? null, i);
  });

  let ord = 0;
  for (const cell of model.cells) {
    cell.refIds.forEach((refId, k) => {
      insCell.run(cell.method, cell.area, refId, cell.labels[k], ord++);
    });
  }
}

// --- catalog (software + databases) ----------------------------------------

export function seedCatalog(db: Db, entries: CatalogRaw[], type: 'software' | 'database'): void {
  const insItem = db.prepare('INSERT OR IGNORE INTO items(id,type,slug) VALUES(?,?,?)');
  const insCat = db.prepare(
    'INSERT INTO catalog(item_id,name,url,grp,body_md,ordinal) VALUES(?,?,?,?,?,?)',
  );
  const prefix = type === 'software' ? 'sw' : 'db';
  const seen = new Map<string, number>();
  entries.forEach((e, i) => {
    const id = assignId(seen, frozenSlug(e.name, prefix));
    insItem.run(id, type, id.slice(prefix.length + 1));
    insCat.run(id, e.name, e.url, e.group, e.bodyMd, i);
  });
}

// --- dataset inventory rows ------------------------------------------------

const ACCESSION = /GSE\d+|PRJ[A-Z]+\d+|PXD\d+|CRA\d+|E-MTAB-\d+|SRP\d+|GSM\d+/;

/** Seed one page's `## Complete data inventory` rows as first-class ds: records. */
export function seedDatasetPage(db: Db, page: string, seen: Map<string, number>): number {
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
  const seen = new Map<string, number>();
  const counts: Record<string, number> = {};
  for (const page of INVENTORY_PAGES) {
    const n = seedDatasetPage(db, page, seen);
    if (n) counts[page] = n;
  }
  return counts;
}

// --- topics (deterministic auto-tag seed) ----------------------------------

interface CanonicalTopic {
  slug: string;
  label: string;
  area?: string;        // matrix-area LABEL this topic links to (optional)
  kw: RegExp;           // matches catalog group strings + dataset cell text
  sections?: RegExp;    // matches Papers.md section headings (Reference Work shelves)
}

/**
 * The recurring cross-cutting subjects #78 calls out. Deterministic keyword/alias
 * seed — a starting vocabulary, refined in the later curation pass.
 */
const CANONICAL_TOPICS: CanonicalTopic[] = [
  { slug: 'media-optimization', label: 'Media optimization', area: 'Media Optimization', kw: /media|serum|formulation/i },
  { slug: 'cellular-engineering', label: 'Cellular engineering', area: 'Cellular Engineering', kw: /cell[- ]?line|engineering|perturbation|crispr|differentiation/i },
  { slug: 'bioprocess', label: 'Bioprocess & scale-up', area: 'Bioprocess & Scale-Up', kw: /bioprocess|bioreactor|scal(e|ing)|fermentation/i },
  { slug: 'scaffolding', label: 'Scaffolding & biomaterials', area: 'Scaffolding', kw: /scaffold|biomaterial|bioprint|3d[- ]?print/i },
  { slug: 'sensory-flavor', label: 'Sensory & flavor', area: 'Sensory Prediction', kw: /sensor|flavou?r|taste|texture|aroma/i, sections: /Sensory & Flavor Reference Work/ },
  { slug: 'metabolic-modeling', label: 'Metabolic modeling', kw: /metabol|flux|genome[- ]?scale|strain[- ]?design|\bgem\b|sbml/i, sections: /Metabolic Reference Work/ },
];

export function seedTopics(db: Db): { topics: number; tags: number } {
  const insItem = db.prepare('INSERT OR IGNORE INTO items(id,type,slug) VALUES(?,?,?)');
  const insTopic = db.prepare('INSERT INTO topics(item_id,slug,label,area_key) VALUES(?,?,?,?)');
  const insAlias = db.prepare('INSERT OR IGNORE INTO aliases(alias,topic_id) VALUES(?,?)');
  const tag = db.prepare('INSERT OR IGNORE INTO item_topics(item_id,topic_id) VALUES(?,?)');
  const areaKey = (label: string) =>
    (db.prepare('SELECT key FROM areas WHERE label=?').get(label) as { key: string } | undefined)?.key ?? null;

  const topicId = (slug: string) => `topic:${slug}`;
  const created = new Set<string>();
  const createTopic = (slug: string, label: string, area: string | null): string => {
    const id = topicId(slug);
    if (!created.has(slug)) {
      insItem.run(id, 'topic', slug);
      insTopic.run(id, slug, label, area);
      created.add(slug);
    }
    return id;
  };

  // 1. Canonical cross-cutting topics.
  for (const t of CANONICAL_TOPICS) createTopic(t.slug, t.label, t.area ? areaKey(t.area) : null);

  // 2. Tag papers: by matrix area (-> the area's canonical topic) and by Reference-
  //    Work section shelf (-> the matching canonical topic).
  const areaToTopic = new Map<string, string>();
  for (const t of CANONICAL_TOPICS) if (t.area) { const k = areaKey(t.area); if (k) areaToTopic.set(k, topicId(t.slug)); }
  for (const c of db.prepare('SELECT DISTINCT area_key, ref_id FROM matrix_cells').all() as any[]) {
    const tid = areaToTopic.get(c.area_key);
    if (tid) tag.run(`paper:${c.ref_id}`, tid);
  }
  for (const p of db.prepare('SELECT item_id, section FROM papers').all() as any[]) {
    for (const t of CANONICAL_TOPICS) if (t.sections?.test(p.section)) tag.run(p.item_id, topicId(t.slug));
  }

  // 3. Catalog: every distinct group becomes a topic (full coverage); a group whose
  //    label matches a canonical topic ALSO aliases into it (multi-tag join). Tag
  //    each catalog item to every topic its group maps to.
  const groups = (db.prepare('SELECT DISTINCT grp FROM catalog').all() as { grp: string }[]).map((r) => r.grp);
  const groupTopics = new Map<string, string[]>();
  for (const grp of groups) {
    const ids: string[] = [];
    for (const t of CANONICAL_TOPICS) if (t.kw.test(grp)) ids.push(createTopic(t.slug, t.label, t.area ? areaKey(t.area) : null));
    if (ids.length === 0) ids.push(createTopic(slugify(grp), grp, null)); // standalone group topic
    for (const id of ids) insAlias.run(grp, id); // aliases PK is the group string; first mapping wins
    groupTopics.set(grp, ids);
  }
  for (const c of db.prepare('SELECT item_id, grp FROM catalog').all() as any[]) {
    for (const id of groupTopics.get(c.grp) ?? []) tag.run(c.item_id, id);
  }

  // 4. Datasets: tag inventory rows whose cell text matches a canonical topic.
  for (const d of db.prepare('SELECT item_id, cells_json FROM dataset_rows').all() as any[]) {
    const text = (JSON.parse(d.cells_json) as string[]).join(' ');
    for (const t of CANONICAL_TOPICS) if (t.kw.test(text)) tag.run(d.item_id, topicId(t.slug));
  }

  const topics = (db.prepare('SELECT COUNT(*) c FROM topics').get() as any).c;
  const tags = (db.prepare('SELECT COUNT(*) c FROM item_topics').get() as any).c;
  return { topics, tags };
}
