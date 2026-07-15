/**
 * check.ts — integrity + drift guards for the authoring DB, mirroring the
 * generate-data.ts assert pattern (build the model, cross-check invariants, fail
 * loudly with a descriptive error). Runs on the DB rebuilt from committed NDJSON.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:check
 *
 * Guards:
 *  - referential integrity (PRAGMA foreign_key_check) + namespaced-id format +
 *    detail/registry type agreement + id uniqueness;
 *  - business rule: every primary-`## References` paper is cited in >=1 matrix cell
 *    (the matrix<->reference reachability lint, enforced at the source);
 *  - #81 drift: the matrix COLUMN list enumerated in CONTRIBUTING.md / CLAUDE.md
 *    must match the DB areas exactly (the volatile row list is de-enumerated, so
 *    only the stable column axis is guarded).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importNdjson, REPO_ROOT, type Db } from './lib.js';
import { THEME_SLUGS } from './seed.js';

export interface CheckResult { label: string; ok: boolean; detail: string; }
const ok = (label: string, cond: boolean, detail = ''): CheckResult => ({ label, ok: cond, detail });

const PREFIX: Record<string, string> = { paper: 'paper', software: 'sw', database: 'db', dataset: 'ds', topic: 'topic' };

export function checkIntegrity(db: Db): CheckResult[] {
  const out: CheckResult[] = [];
  const fk = db.prepare('PRAGMA foreign_key_check').all() as unknown[];
  out.push(ok('no foreign-key violations', fk.length === 0, `${fk.length} violation(s)`));

  const items = db.prepare('SELECT id,type,slug FROM items').all() as { id: string; type: string; slug: string }[];
  const badFormat = items.filter((it) => it.id !== `${PREFIX[it.type]}:${it.slug}`);
  out.push(ok('every id is namespaced and matches its type + slug', badFormat.length === 0,
    badFormat.slice(0, 3).map((i) => i.id).join(', ')));

  const detailType: Array<[string, string | null]> = [
    ['papers', 'paper'], ['catalog', null], ['dataset_rows', 'dataset'], ['topics', 'topic'],
  ];
  for (const [table, type] of detailType) {
    const orphan = db.prepare(
      `SELECT d.item_id FROM ${table} d LEFT JOIN items i ON i.id=d.item_id WHERE i.id IS NULL`,
    ).all() as unknown[];
    out.push(ok(`every ${table} row has a registry item`, orphan.length === 0, `${orphan.length} orphan(s)`));
    if (type) {
      const wrong = db.prepare(
        `SELECT d.item_id FROM ${table} d JOIN items i ON i.id=d.item_id WHERE i.type<>?`,
      ).all(type) as unknown[];
      out.push(ok(`every ${table} item is type '${type}'`, wrong.length === 0, `${wrong.length} mistyped`));
    }
  }

  // catalog holds two types (software + database), so the single-type check above skips
  // it — assert its items are one of those two (a mistyped id, e.g. a paper: id in a
  // catalog row, would otherwise pass the orphan check and go unflagged).
  const wrongCat = db.prepare(
    "SELECT c.item_id FROM catalog c JOIN items i ON i.id=c.item_id WHERE i.type NOT IN ('software','database')",
  ).all() as { item_id: string }[];
  out.push(ok("every catalog item is type 'software' or 'database'", wrongCat.length === 0,
    wrongCat.slice(0, 3).map((r) => r.item_id).join(', ')));
  return out;
}

export function checkReachability(db: Db): CheckResult[] {
  const unreachable = db.prepare(
    `SELECT ref_id FROM papers WHERE section='References'
       AND ref_id NOT IN (SELECT DISTINCT ref_id FROM matrix_cells) ORDER BY ref_id`,
  ).all() as { ref_id: number }[];
  return [ok('every primary `## References` paper is cited in >=1 matrix cell',
    unreachable.length === 0,
    `unreachable: ${unreachable.slice(0, 8).map((r) => '#' + r.ref_id).join(', ')}`)];
}

/** Parse a "Current … columns …: A, B, C." line's comma list, stripping markdown. */
export function parseList(text: string, re: RegExp): string[] | null {
  const m = text.match(re);
  if (!m) return null;
  return m[1].replace(/\.\s*$/, '').split(',')
    .map((s) => s.replace(/\*\*/g, '').replace(/`/g, '').trim())
    .filter(Boolean);
}

export const COLUMN_SOURCES: Array<[string, RegExp]> = [
  ['CONTRIBUTING.md', /Current matrix columns[^:]*:\s*([^\n]+)/],
  ['CLAUDE.md', /Current columns:\s*([^\n]+)/],
];

export function checkColumnDrift(db: Db, repoRoot: string = REPO_ROOT): CheckResult[] {
  const out: CheckResult[] = [];
  const areas = new Set((db.prepare('SELECT label FROM areas').all() as { label: string }[]).map((r) => r.label));
  for (const [file, re] of COLUMN_SOURCES) {
    const path = join(repoRoot, file);
    if (!existsSync(path)) { out.push(ok(`${file} enumerates the matrix columns`, false, `${file} not found at ${repoRoot}`)); continue; }
    const list = parseList(readFileSync(path, 'utf-8'), re);
    if (!list) { out.push(ok(`${file} enumerates the matrix columns`, false, 'no "Current … columns" line found')); continue; }
    const missing = [...areas].filter((a) => !list.includes(a));
    const phantom = list.filter((c) => !areas.has(c));
    out.push(ok(`${file} column list matches DB areas exactly`, missing.length === 0 && phantom.length === 0,
      `missing from prose: [${missing.join(', ')}]; phantom in prose: [${phantom.join(', ')}]`));
  }
  return out;
}

export function checkTopicTiers(db: Db): CheckResult[] {
  const out: CheckResult[] = [];
  const themes = (db.prepare("SELECT slug FROM topics WHERE tier='theme'").all() as { slug: string }[]).map((r) => r.slug).sort();
  out.push(ok('topics: exactly the 7 expected themes', JSON.stringify(themes) === JSON.stringify(THEME_SLUGS), `got: ${themes.join(', ')}`));
  const badTag = db.prepare(
    "SELECT slug FROM topics WHERE tier='tag' AND (theme_slug IS NULL OR theme_slug NOT IN (SELECT slug FROM topics WHERE tier='theme'))",
  ).all() as { slug: string }[];
  out.push(ok('topics: every fine tag has a valid parent theme', badTag.length === 0, badTag.map((t) => t.slug).join(', ')));
  const badTheme = db.prepare("SELECT slug FROM topics WHERE tier='theme' AND theme_slug IS NOT NULL").all() as { slug: string }[];
  out.push(ok('topics: no theme carries a theme_slug', badTheme.length === 0, badTheme.map((t) => t.slug).join(', ')));
  const badArea = db.prepare('SELECT slug FROM topics WHERE area_key IS NOT NULL AND area_key NOT IN (SELECT key FROM areas)').all() as unknown[];
  out.push(ok('topics: every area_key resolves', badArea.length === 0, `${badArea.length} unresolved`));
  return out;
}

/**
 * Catalog consistency guard: `heading_md` is what `db:emit` writes, but the topic/license
 * folds join on the separate `url` column (and the tally uses `name`). If a hand-edited
 * NDJSON drifts `name`/`url` from `heading_md`'s link, emit stays correct while the folds
 * silently mismatch and the sync guard passes clean. Assert the first link in `heading_md`
 * equals `(name, url)` so the two can't diverge unnoticed.
 */
export function checkCatalogHeadings(db: Db): CheckResult[] {
  const rows = db.prepare('SELECT item_id, name, url, heading_md FROM catalog').all() as
    { item_id: string; name: string; url: string; heading_md: string }[];
  const bad: string[] = [];
  for (const r of rows) {
    // heading_md is emitted as `[name](url)` (+ any trailing curator annotation), so the
    // link is exactly that prefix. Reconstruct and prefix-match rather than regex-parse —
    // a URL or name containing `)` / `]` would break a negated-class capture (false drift).
    if (!r.heading_md.startsWith(`[${r.name}](${r.url})`)) bad.push(r.item_id);
  }
  return [ok('catalog: name/url match the heading_md link', bad.length === 0,
    `mismatched: ${bad.slice(0, 5).join(', ')}`)];
}

/** Run every guard against a DB. Returns all results (ok + failing). */
export function runChecks(db: Db, repoRoot: string = REPO_ROOT): CheckResult[] {
  return [...checkIntegrity(db), ...checkReachability(db), ...checkColumnDrift(db, repoRoot),
    ...checkTopicTiers(db), ...checkCatalogHeadings(db)];
}

function main(): void {
  console.log('CAAIL DB integrity + drift check');
  const results = runChecks(importNdjson());
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.label}${r.detail && !r.ok ? `\n      ${r.detail}` : ''}`);
  const failures = results.filter((r) => !r.ok).length;
  console.log(`\n${failures === 0 ? '✓ all checks passed' : `✗ ${failures} check(s) FAILED`}`);
  if (failures) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
