/**
 * mutate.ts — the ergonomic add/remove layer over the authoring DB.
 *
 * `addItem` takes a structured descriptor for any content type, assigns the frozen
 * namespaced id, and does the correct inserts (paper -> items + papers + matrix_cells;
 * software/database -> items + catalog; dataset -> items + dataset_rows), plus optional
 * topic tags. `removeItem` deletes an item and all its dependent rows (a paper's id is
 * retired, never reused — matrix + external bookmarks depend on it). Pure DB mutation;
 * the db:add / db:remove CLIs wrap these with export + emit + check.
 */

import { assignId, frozenSlug, type Db } from './lib.js';

const ACCESSION = /GSE\d+|PRJ[A-Z]+\d+|PXD\d+|CRA\d+|E-MTAB-\d+|SRP\d+|GSM\d+/;

export interface PaperAdd {
  type: 'paper';
  raw: string;                                   // full citation markdown incl. <a id> is added if absent
  label: string;                                 // matrix cell display text ('Ndahiro et al. 2025')
  section?: string;                              // default 'References'
  codeUrl?: string | null;
  dataUrl?: string | null;
  cells?: Array<{ method: string; area: string }>; // area may be key or label
  topics?: string[];
}
export interface CatalogAdd {
  type: 'software' | 'database';
  name: string;
  url: string;
  group: string;
  body: string;
  topics?: string[];
}
export interface DatasetAdd {
  type: 'dataset';
  page: string;
  cells: string[];
  topics?: string[];
}
export type ItemAdd = PaperAdd | CatalogAdd | DatasetAdd;

function nextInt(db: Db, sql: string): number {
  return ((db.prepare(sql).get() as { m: number | null }).m ?? -1) + 1;
}

function tagTopics(db: Db, itemId: string, topics: string[] = []): void {
  const tag = db.prepare('INSERT OR IGNORE INTO item_topics(item_id,topic_id) VALUES(?,?)');
  for (const slug of topics) {
    const tid = `topic:${slug}`;
    const exists = db.prepare('SELECT 1 FROM topics WHERE item_id=?').get(tid);
    if (!exists) throw new Error(`addItem: unknown topic '${slug}'. Add it first, or use an existing topic slug.`);
    tag.run(itemId, tid);
  }
}

/** Resolve a matrix area given as either its key ('media') or its label. */
function areaKey(db: Db, area: string): string {
  const byKey = db.prepare('SELECT key FROM areas WHERE key=?').get(area) as { key: string } | undefined;
  if (byKey) return byKey.key;
  const byLabel = db.prepare('SELECT key FROM areas WHERE label=?').get(area) as { key: string } | undefined;
  if (byLabel) return byLabel.key;
  throw new Error(`addItem: no matrix area '${area}'. Existing columns are authored in Taxonomy.md + Papers.md.`);
}

/** Insert an item and its detail rows. Returns the frozen id assigned. */
export function addItem(db: Db, spec: ItemAdd): string {
  const insItem = db.prepare('INSERT INTO items(id,type,slug) VALUES(?,?,?)');

  if (spec.type === 'paper') {
    const refId = nextInt(db, 'SELECT MAX(ref_id) m FROM papers');
    const id = `paper:${refId}`;
    const raw = /^<a id=/.test(spec.raw) ? spec.raw : `<a id="${refId}">${refId}</a> ${spec.raw}`;
    const ord = nextInt(db, 'SELECT MAX(ordinal) m FROM papers');
    insItem.run(id, 'paper', String(refId));
    db.prepare('INSERT INTO papers(item_id,ref_id,section,raw,code_url,data_url,ordinal) VALUES(?,?,?,?,?,?,?)')
      .run(id, refId, spec.section ?? 'References', raw, spec.codeUrl ?? null, spec.dataUrl ?? null, ord);
    const insCell = db.prepare('INSERT INTO matrix_cells(method,area_key,ref_id,label,ordinal) VALUES(?,?,?,?,?)');
    for (const c of spec.cells ?? []) {
      const method = db.prepare('SELECT label FROM methods WHERE label=?').get(c.method) as { label: string } | undefined;
      if (!method) throw new Error(`addItem: no matrix method '${c.method}'. Rows are authored in Taxonomy.md + Papers.md.`);
      insCell.run(c.method, areaKey(db, c.area), refId, spec.label, nextInt(db, 'SELECT MAX(ordinal) m FROM matrix_cells'));
    }
    tagTopics(db, id, spec.topics);
    return id;
  }

  if (spec.type === 'software' || spec.type === 'database') {
    const prefix = spec.type === 'software' ? 'sw' : 'db';
    const seen = new Map<string, number>();
    for (const r of db.prepare('SELECT slug FROM items WHERE type=?').all(spec.type) as { slug: string }[]) {
      seen.set(`${prefix}:${r.slug}`, (seen.get(`${prefix}:${r.slug}`) ?? 0) + 1);
    }
    const id = assignId(seen, frozenSlug(spec.name, prefix));
    insItem.run(id, spec.type, id.slice(prefix.length + 1));
    db.prepare('INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,ordinal) VALUES(?,?,?,?,?,?,?)')
      .run(id, spec.name, spec.url, spec.group, `[${spec.name}](${spec.url})`, spec.body, nextInt(db, 'SELECT MAX(ordinal) m FROM catalog'));
    tagTopics(db, id, spec.topics);
    return id;
  }

  // dataset
  const joined = spec.cells.join(' ');
  const acc = joined.match(ACCESSION)?.[0];
  const seedText = acc ?? spec.cells[0].replace(/[[\]`*]/g, '').split(/\s+/).slice(0, 3).join('-');
  const seen = new Map<string, number>();
  for (const r of db.prepare("SELECT slug FROM items WHERE type='dataset'").all() as { slug: string }[]) {
    seen.set(`ds:${r.slug}`, (seen.get(`ds:${r.slug}`) ?? 0) + 1);
  }
  const id = assignId(seen, frozenSlug(seedText, 'ds'));
  insItem.run(id, 'dataset', id.slice(3));
  db.prepare('INSERT INTO dataset_rows(item_id,page,cells_json,ordinal) VALUES(?,?,?,?)')
    .run(id, spec.page, JSON.stringify(spec.cells), nextInt(db, 'SELECT MAX(ordinal) m FROM dataset_rows'));
  tagTopics(db, id, spec.topics);
  return id;
}

/** Delete an item and its dependent rows (paper ids are retired, never reused). */
export function removeItem(db: Db, id: string): void {
  const item = db.prepare('SELECT type FROM items WHERE id=?').get(id) as { type: string } | undefined;
  if (!item) throw new Error(`removeItem: no item '${id}'`);
  db.prepare('DELETE FROM item_topics WHERE item_id=?').run(id);
  switch (item.type) {
    case 'paper': {
      const ref = db.prepare('SELECT ref_id FROM papers WHERE item_id=?').get(id) as { ref_id: number };
      db.prepare('DELETE FROM matrix_cells WHERE ref_id=?').run(ref.ref_id);
      db.prepare('DELETE FROM papers WHERE item_id=?').run(id);
      break;
    }
    case 'software':
    case 'database':
      db.prepare('DELETE FROM catalog WHERE item_id=?').run(id);
      break;
    case 'dataset':
      db.prepare('DELETE FROM dataset_rows WHERE item_id=?').run(id);
      break;
    case 'topic':
      db.prepare('DELETE FROM item_topics WHERE topic_id=?').run(id);
      db.prepare('DELETE FROM aliases WHERE topic_id=?').run(id);
      db.prepare('DELETE FROM topics WHERE item_id=?').run(id);
      break;
  }
  db.prepare('DELETE FROM items WHERE id=?').run(id);
}
