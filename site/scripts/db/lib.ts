/**
 * lib.ts — shared primitives for the CAAIL SQLite authoring backend (#78).
 *
 * Paths, the schema-loaded DB opener, per-table PK-sorted NDJSON export/import
 * (sqlite-diffable style — one file per table, localized git diffs), and the
 * frozen namespaced-slug helper. Promoted from the proven spike
 * (a sqlite-replatform spike, no longer tracked here); this is the production form.
 *
 * Requires Node 22's built-in node:sqlite behind `--experimental-sqlite`
 * (no new dependency, network-free). The DB is authoring-time only — it never
 * runs in the deploy build.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)); // site/scripts/db
/** Repo root (site/scripts/db -> site/scripts -> site -> repo). */
export const REPO_ROOT = join(HERE, '..', '..', '..');
export const SITE_ROOT = join(HERE, '..', '..');
export const SCHEMA_PATH = join(SITE_ROOT, 'db', 'schema.sql');
/** Gitignored build artifact, rebuilt from NDJSON. */
export const DB_PATH = join(SITE_ROOT, 'caail.db');
/** Git-tracked source of truth: per-table PK-sorted NDJSON. */
export const NDJSON_DIR = join(SITE_ROOT, 'db', 'ndjson');

export type Db = DatabaseSync;

/** Open a DB (`:memory:` default) and load the schema into it. */
export function openDb(dbPath = ':memory:'): Db {
  const db = new DatabaseSync(dbPath);
  db.exec(readFileSync(SCHEMA_PATH, 'utf-8'));
  return db;
}

/** Open an existing DB file WITHOUT re-running the schema (for reading an edited db). */
export function openExisting(dbPath: string): Db {
  if (!existsSync(dbPath)) {
    throw new Error(`openExisting: no db at ${dbPath} — run \`pnpm db:build\` first`);
  }
  return new DatabaseSync(dbPath);
}

/**
 * Per-table primary key used to sort NDJSON deterministically, so a one-item
 * edit touches exactly one file at exactly one line (reviewable git diffs).
 */
export const TABLES_PK: Record<string, string> = {
  items: 'id',
  papers: 'ref_id',
  retired_paper_ids: 'ref_id',
  areas: 'ordinal',
  methods: 'ordinal',
  matrix_cells: 'ordinal',
  // ordinal restarts per file (software vs database) / per page / per section, so it is
  // not unique across the whole table — add item_id as a tiebreak so the NDJSON export
  // order is a documented total order, not SQLite's incidental scan order.
  catalog: 'ordinal,item_id',
  dataset_rows: 'ordinal,item_id',
  dataset_entries: 'ordinal,item_id',
  topics: 'slug',
  item_topics: 'item_id,topic_id',
  aliases: 'alias',
};

/** Export every table to `<dir>/<table>.ndjson`, PK-sorted. Returns row counts. */
export function exportNdjson(db: Db, dir: string = NDJSON_DIR): Record<string, number> {
  mkdirSync(dir, { recursive: true });
  const counts: Record<string, number> = {};
  for (const [table, pk] of Object.entries(TABLES_PK)) {
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${pk}`).all() as Record<string, unknown>[];
    const lines = rows.map((r) => JSON.stringify(r));
    writeFileSync(join(dir, `${table}.ndjson`), lines.length ? lines.join('\n') + '\n' : '');
    counts[table] = rows.length;
  }
  return counts;
}

/**
 * Rebuild a DB from NDJSON. FK enforcement is off during load (order-independent),
 * then a foreign_key_check is run so a broken source fails loudly.
 */
export function importNdjson(dir: string = NDJSON_DIR, dbPath = ':memory:'): Db {
  if (dbPath !== ':memory:' && existsSync(dbPath)) rmSync(dbPath);
  const db = openDb(dbPath);
  db.exec('PRAGMA foreign_keys = OFF');
  for (const table of Object.keys(TABLES_PK)) {
    const path = join(dir, `${table}.ndjson`);
    if (!existsSync(path)) continue; // a missing per-table file = empty table
    const text = readFileSync(path, 'utf-8').trim();
    if (!text) continue;
    // Column identifiers can't be parameter-bound, so a stray/mistyped NDJSON key would
    // splice into the SQL text. Allowlist against the real schema (table names come from
    // TABLES_PK, not the file) so a bad key fails with a clear message, not raw SQL.
    const validCols = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name),
    );
    for (const line of text.split('\n')) {
      const row = JSON.parse(line) as Record<string, unknown>;
      const cols = Object.keys(row);
      const bad = cols.filter((c) => !validCols.has(c));
      if (bad.length) {
        throw new Error(`importNdjson: ${table}.ndjson has column(s) not in the schema: ${bad.join(', ')}`);
      }
      db.prepare(
        `INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`,
      ).run(...cols.map((c) => row[c] as never));
    }
  }
  const broken = db.prepare('PRAGMA foreign_key_check').all() as unknown[];
  if (broken.length) {
    throw new Error(`importNdjson: ${broken.length} foreign-key violation(s) in NDJSON source`);
  }
  db.exec('PRAGMA foreign_keys = ON'); // enforce for subsequent edits to the built db
  return db;
}

/**
 * The repository accession families CAAIL indexes, as one source of truth.
 *
 * There were three copies of this vocabulary and they had already diverged: the id minter
 * accepted `SRP`/`GSM` while the subseries member guard did not, so a curator recording a
 * perfectly valid `SRP…` member would have been told it was malformed. That is the
 * hand-typed-fact-beside-a-machine-derived-one defect this repo names as its most expensive
 * recurring bug, in its smallest form. Import these rather than re-typing the alternation.
 *
 * `E-MTAB-\d+` is the only family carrying an internal hyphen, which is why an id's
 * accession must be read with `ACCESSION_PREFIX` rather than by stripping a trailing `-N`:
 * `e-mtab-9622` would otherwise reduce to `E-MTAB`.
 */
export const ACCESSION_SOURCE = String.raw`GSE\d+|GSM\d+|PRJ[A-Z]+\d+|SRP\d+|PXD\d+|CRA\d+|E-MTAB-\d+`;
/** First accession appearing anywhere in a string (used to seed a frozen `ds:` id). */
export const ACCESSION = new RegExp(ACCESSION_SOURCE);
/** The whole string is exactly one accession (used to validate a curated member). */
export const ACCESSION_EXACT = new RegExp(`^(?:${ACCESSION_SOURCE})$`);
/** The accession a string STARTS with, ignoring any `-2`/`-3` id disambiguator after it. */
export const ACCESSION_PREFIX = new RegExp(`^(?:${ACCESSION_SOURCE})`);

/**
 * The accession encoded in a frozen `ds:` id, ignoring any `-2`/`-3` disambiguator
 * (`ds:gse158430-2` -> `GSE158430`, `ds:e-mtab-9622` -> `E-MTAB-9622`).
 *
 * Read with `ACCESSION_PREFIX` rather than by stripping a trailing `-N`, because `E-MTAB-…`
 * carries an internal hyphen and would otherwise reduce to `E-MTAB`, collapsing every
 * ArrayExpress row onto one key. Falls back to the bare slug for an id minted from a title.
 *
 * Lives here rather than beside its parser caller so `check.ts` can share it without
 * importing the parser: that edge pulled the whole Markdown-parsing graph into the DB
 * guards and multiplied the test suite's import time roughly sixfold.
 */
export function idAccession(itemId: string): string {
  const slug = itemId.slice(3).toUpperCase();
  return slug.match(ACCESSION_PREFIX)?.[0] ?? slug;
}

/** Slugify a display name into the local part of a frozen namespaced id. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Frozen namespaced slug from a display name (`sw:alphafold`), assigned once. */
export function frozenSlug(name: string, prefix: string): string {
  return `${prefix}:${slugify(name) || 'entry'}`;
}

/**
 * Assign a collision-free frozen id: first use of a base keeps it, later
 * collisions get `-2`, `-3`, … Mutates the `assigned` id set.
 */
export function assignId(assigned: Set<string>, base: string): string {
  let id = base;
  let i = 1;
  // Check the derived id against every id already assigned this run — not just a per-base
  // counter — so a suffixed candidate can't collide with a coincidentally-named distinct
  // entry (e.g. base `gnps-2` clashing with a separate `GNPS 2` → `gnps-2`).
  while (assigned.has(id)) { i += 1; id = `${base}-${i}`; }
  assigned.add(id);
  return id;
}
