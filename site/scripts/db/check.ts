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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importNdjson, REPO_ROOT, type Db } from './lib.js';

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${detail && !cond ? `\n      ${detail}` : ''}`);
  if (!cond) failures++;
}

const PREFIX: Record<string, string> = { paper: 'paper', software: 'sw', database: 'db', dataset: 'ds', topic: 'topic' };

function checkIntegrity(db: Db): void {
  console.log('\n── Referential integrity + id format ──');
  const fk = db.prepare('PRAGMA foreign_key_check').all() as unknown[];
  check('no foreign-key violations', fk.length === 0, `${fk.length} violation(s)`);

  const items = db.prepare('SELECT id,type,slug FROM items').all() as { id: string; type: string; slug: string }[];
  const badFormat = items.filter((it) => it.id !== `${PREFIX[it.type]}:${it.slug}`);
  check('every id is namespaced and matches its type + slug', badFormat.length === 0,
    badFormat.slice(0, 3).map((i) => i.id).join(', '));

  // detail tables agree with the registry type
  const detailType: Array<[string, string | null]> = [
    ['papers', 'paper'], ['catalog', null], ['dataset_rows', 'dataset'], ['topics', 'topic'],
  ];
  for (const [table, type] of detailType) {
    const orphan = db.prepare(
      `SELECT d.item_id FROM ${table} d LEFT JOIN items i ON i.id=d.item_id WHERE i.id IS NULL`,
    ).all() as unknown[];
    check(`every ${table} row has a registry item`, orphan.length === 0, `${orphan.length} orphan(s)`);
    if (type) {
      const wrong = db.prepare(
        `SELECT d.item_id FROM ${table} d JOIN items i ON i.id=d.item_id WHERE i.type<>?`,
      ).all(type) as unknown[];
      check(`every ${table} item is type '${type}'`, wrong.length === 0, `${wrong.length} mistyped`);
    }
  }
}

function checkReachability(db: Db): void {
  console.log('\n── Matrix ↔ reference reachability ──');
  const unreachable = db.prepare(
    `SELECT ref_id FROM papers WHERE section='References'
       AND ref_id NOT IN (SELECT DISTINCT ref_id FROM matrix_cells) ORDER BY ref_id`,
  ).all() as { ref_id: number }[];
  check('every primary `## References` paper is cited in >=1 matrix cell',
    unreachable.length === 0,
    `unreachable: ${unreachable.slice(0, 8).map((r) => '#' + r.ref_id).join(', ')}`);
}

/** Parse a "Current … columns …: A, B, C." line's comma list, stripping markdown. */
function parseList(text: string, re: RegExp): string[] | null {
  const m = text.match(re);
  if (!m) return null;
  return m[1].replace(/\.\s*$/, '').split(',')
    .map((s) => s.replace(/\*\*/g, '').replace(/`/g, '').trim())
    .filter(Boolean);
}

function checkColumnDrift(db: Db): void {
  console.log('\n── #81 column-list drift (prose vs DB) ──');
  const areas = new Set((db.prepare('SELECT label FROM areas').all() as { label: string }[]).map((r) => r.label));
  const sources: Array<[string, RegExp]> = [
    ['CONTRIBUTING.md', /Current matrix columns[^:]*:\s*([^\n]+)/],
    ['CLAUDE.md', /Current columns:\s*([^\n]+)/],
  ];
  for (const [file, re] of sources) {
    const list = parseList(readFileSync(join(REPO_ROOT, file), 'utf-8'), re);
    if (!list) { check(`${file} enumerates the matrix columns`, false, 'no "Current … columns" line found'); continue; }
    const missing = [...areas].filter((a) => !list.includes(a));
    const phantom = list.filter((c) => !areas.has(c));
    check(`${file} column list matches DB areas exactly`, missing.length === 0 && phantom.length === 0,
      `missing from prose: [${missing.join(', ')}]; phantom in prose: [${phantom.join(', ')}]`);
  }
}

function main(): void {
  console.log('CAAIL DB integrity + drift check');
  const db = importNdjson();
  checkIntegrity(db);
  checkReachability(db);
  checkColumnDrift(db);
  console.log(`\n${failures === 0 ? '✓ all checks passed' : `✗ ${failures} check(s) FAILED`}`);
  if (failures) process.exitCode = 1;
}

main();
