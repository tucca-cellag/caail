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

import { frozenSlug, type Db } from './lib.js';
import { INVENTORY_PAGES } from '../parser/datasets.js';

const ACCESSION = /GSE\d+|PRJ[A-Z]+\d+|PXD\d+|CRA\d+|E-MTAB-\d+|SRP\d+|GSM\d+/;

/**
 * The next free namespaced id for a base slug: `base`, else `base-2`, `base-3`, …,
 * skipping any id already in `items`. Checks existence directly (rather than
 * reconstructing a collision counter), so it is correct even when a prior suffixed
 * id (`sw:tool-2`) already exists and robust to slugs that themselves end in `-N`.
 */
function nextFreeId(db: Db, base: string): string {
  const existing = new Set((db.prepare('SELECT id FROM items').all() as { id: string }[]).map((r) => r.id));
  let id = base;
  let i = 1;
  while (existing.has(id)) { i += 1; id = `${base}-${i}`; }
  return id;
}

export interface PaperAdd {
  type: 'paper';
  raw: string;                                   // full citation markdown incl. <a id> is added if absent
  label: string;                                 // matrix cell display text ('Ndahiro et al. 2025')
  section?: string;                              // default 'References'
  codeUrl?: string | null;
  dataUrl?: string | null;
  blockquotes?: string[];                        // extra verbatim `> **Label**: …` lines (e.g. Models), appended after Code/Data
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

function nextInt(db: Db, sql: string, params: unknown[] = []): number {
  return ((db.prepare(sql).get(...params) as { m: number | null }).m ?? -1) + 1;
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

/**
 * Insert an item and its detail rows atomically. Wraps the multi-statement insert in a
 * SAVEPOINT (mirroring removeItem), so a mid-sequence throw — an unknown method/area/topic
 * after items/papers rows are already inserted — rolls back instead of leaving partial
 * state (matters for any caller that reuses one Db handle across several addItem calls).
 */
export function addItem(db: Db, spec: ItemAdd): string {
  db.exec('SAVEPOINT add_item');
  try {
    const id = addItemImpl(db, spec);
    db.exec('RELEASE add_item');
    return id;
  } catch (err) {
    db.exec('ROLLBACK TO add_item');
    db.exec('RELEASE add_item');
    throw err;
  }
}

/** Returns the frozen id assigned. */
function addItemImpl(db: Db, spec: ItemAdd): string {
  const insItem = db.prepare('INSERT INTO items(id,type,slug) VALUES(?,?,?)');

  if (spec.type === 'paper') {
    // The emitter can only place a citation under a section that already has an anchor in
    // Papers.md (emitPapersFile hooks onto an existing `<a id>` paragraph); a section with
    // zero current papers has no anchor, so a paper added there would fail/drop on emit.
    // Validate against sections that ACTUALLY have papers now — not a hardcoded allowlist
    // (which would wrongly accept a canonical section that a db:remove had just emptied).
    const section = spec.section ?? 'References';
    const known = new Set((db.prepare('SELECT DISTINCT section FROM papers').all() as { section: string }[]).map((r) => r.section));
    if (!known.has(section)) {
      throw new Error(`addItem: section '${section}' has no citation in Papers.md to attach to. Add its '## ${section}' heading + a first reference to Papers.md and re-bootstrap, or use a populated section.`);
    }
    // Max over live papers AND retired ids, so a removed ref_id is never handed out again.
    const refId = nextInt(db, 'SELECT MAX(m) m FROM (SELECT MAX(ref_id) m FROM papers UNION ALL SELECT MAX(ref_id) m FROM retired_paper_ids)');
    const id = `paper:${refId}`;
    // Always anchor with the AUTHORITATIVE assigned refId: strip any leading `<a id="N">`
    // the caller supplied (a copy-pasted template may carry a stale id) and re-prefix.
    // Trusting a caller's id would desync the matrix (which links by refId) from the
    // literal anchor and could duplicate an existing id — invisible to the DB-column guards.
    const body = spec.raw.replace(/^<a\s+id="\d+">\s*\d*\s*<\/a>\s*/, '');
    const raw = `<a id="${refId}">${refId}</a> ${body}`;
    const ord = nextInt(db, 'SELECT MAX(ordinal) m FROM papers');
    // Build the verbatim trailing-blockquote run: the typed Code/Data inputs, then any
    // extra `> **Label**: …` lines (e.g. `> **Models**:`) so db:add isn't limited to two labels.
    const blockquotes = [
      spec.codeUrl ? `> **Code**: ${spec.codeUrl}` : null,
      spec.dataUrl ? `> **Data**: ${spec.dataUrl}` : null,
      ...(spec.blockquotes ?? []),
    ].filter(Boolean).join('\n\n') || null;
    insItem.run(id, 'paper', String(refId));
    db.prepare('INSERT INTO papers(item_id,ref_id,section,raw,blockquotes_md,ordinal) VALUES(?,?,?,?,?,?)')
      .run(id, refId, section, raw, blockquotes, ord);
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
    const id = nextFreeId(db, frozenSlug(spec.name, prefix));
    insItem.run(id, spec.type, id.slice(prefix.length + 1));
    db.prepare('INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,ordinal) VALUES(?,?,?,?,?,?,?)')
      .run(id, spec.name, spec.url, spec.group, `[${spec.name}](${spec.url})`, spec.body,
        // ordinal restarts per file (software vs database), matching emitCatalogFile's
        // `WHERE item_id IN (SELECT id FROM items WHERE type=?)` partition; a global MAX would
        // seed a software entry from the database sequence (and vice versa).
        nextInt(db, 'SELECT MAX(ordinal) m FROM catalog WHERE item_id IN (SELECT id FROM items WHERE type=?)', [spec.type]));
    tagTopics(db, id, spec.topics);
    return id;
  }

  // dataset (inventory row)
  // Only INVENTORY_PAGES have a `## Complete data inventory` table for emitAll to write
  // into; a typo'd or reference/benchmark page would be persisted to NDJSON and then
  // silently never emitted to any Markdown file, so reject it up front.
  if (!INVENTORY_PAGES.includes(spec.page)) {
    throw new Error(`addItem: '${spec.page}' is not an inventory dataset page. Valid pages: ${INVENTORY_PAGES.join(', ')}.`);
  }
  if (!spec.cells?.length) {
    throw new Error('addItem: a dataset row needs at least one cell (the inventory-table row values).');
  }
  const joined = spec.cells.join(' ');
  const acc = joined.match(ACCESSION)?.[0];
  const seedText = acc ?? spec.cells[0].replace(/[[\]`*]/g, '').split(/\s+/).slice(0, 3).join('-');
  const id = nextFreeId(db, frozenSlug(seedText, 'ds'));
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
  // A theme with child fine-tags can't be deleted without orphaning them (topics.theme_slug
  // FK has no cascade) — refuse with a clear message rather than a raw FK error / partial state.
  if (item.type === 'topic') {
    const slug = (db.prepare('SELECT slug FROM topics WHERE item_id=?').get(id) as { slug: string } | undefined)?.slug;
    const children = slug ? (db.prepare('SELECT slug FROM topics WHERE theme_slug=?').all(slug) as { slug: string }[]) : [];
    if (children.length) {
      throw new Error(`removeItem: theme '${id}' has ${children.length} child fine-tag(s) (${children.map((c) => c.slug).join(', ')}); remove or reassign them first.`);
    }
  }
  // All deletes for one item are atomic — a mid-sequence failure rolls back rather than
  // leaving partial state (e.g. its topic tags gone but the item row surviving). SAVEPOINT
  // (not BEGIN) nests safely if a caller already opened a transaction.
  db.exec('SAVEPOINT rm_item');
  try {
    db.prepare('DELETE FROM item_topics WHERE item_id=?').run(id);
    switch (item.type) {
      case 'paper': {
        const ref = db.prepare('SELECT ref_id FROM papers WHERE item_id=?').get(id) as { ref_id: number };
        db.prepare('DELETE FROM matrix_cells WHERE ref_id=?').run(ref.ref_id);
        db.prepare('DELETE FROM papers WHERE item_id=?').run(id);
        // Tombstone the numeric anchor so it is never reassigned to a different paper.
        db.prepare('INSERT OR IGNORE INTO retired_paper_ids(ref_id) VALUES(?)').run(ref.ref_id);
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
    db.exec('RELEASE rm_item');
  } catch (err) {
    db.exec('ROLLBACK TO rm_item');
    db.exec('RELEASE rm_item');
    throw err;
  }
}
