/**
 * verify.ts — the round-trip oracle. Rebuilds the DB from committed NDJSON, emits
 * each DB-owned canonical file into a temp dir, re-parses it with the REAL parser,
 * and asserts the regenerated model matches the original per the fidelity bar:
 *   - Papers:  JSON-identical PapersData + lint 0 errors      (spike S1)
 *   - Catalog: {name,url,group,summary,summaryHtml} identical (spike S3)
 *   - Datasets: inventory row-set identical                   (spike S4)
 * Never writes canonical files. Exit 1 on any mismatch.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:verify
 */

import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPapersModel } from '../parser/papers.js';
import { lint } from '../parser/lint.js';
import { parseCatalogFile } from '../parser/catalog.js';
import { INVENTORY_PAGES } from '../parser/datasets.js';
import { importNdjson, REPO_ROOT, type Db } from './lib.js';
import { extractInventory } from './extract.js';
import { emitPapersFile, emitCatalogFile, emitDatasetPage } from './emit.js';

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${detail && !cond ? `\n      ${detail}` : ''}`);
  if (!cond) failures++;
}
function firstDiff(a: string, b: string): string {
  if (a === b) return '';
  const i = [...a].findIndex((ch, k) => ch !== b[k]);
  return `first diff @${i}: …${a.slice(Math.max(0, i - 70), i + 70)}… vs …${b.slice(Math.max(0, i - 70), i + 70)}…`;
}

const TMP = mkdtempSync(join(tmpdir(), 'caail-db-verify-'));

function verifyPapers(db: Db): void {
  console.log('\n── Papers round-trip (JSON-identical + lint green) ──');
  const src = join(REPO_ROOT, 'Papers.md');
  const original = buildPapersModel(src);
  const regenPath = join(TMP, 'Papers.md');
  writeFileSync(regenPath, emitPapersFile(db, src));
  const regen = buildPapersModel(regenPath);
  const a = JSON.stringify(original), b = JSON.stringify(regen);
  check(`papers JSON byte-identical (${original.references.length} refs, ${original.cells.length} cells)`, a === b, firstDiff(a, b));
  const res = lint(regen);
  check(`lint green on regenerated model (0 errors; ${res.warnings.length} warnings)`, res.errors.length === 0, res.errors.join('; '));
}

function verifyCatalog(db: Db, type: 'software' | 'database', file: string): void {
  console.log(`\n── ${file} round-trip (entries identical) ──`);
  const src = join(REPO_ROOT, file);
  const pick = (e: any) => ({ name: e.name, url: e.url, group: e.group, summary: e.summary, summaryHtml: e.summaryHtml });
  const original = parseCatalogFile(src, file).map(pick);
  const regenPath = join(TMP, file);
  writeFileSync(regenPath, emitCatalogFile(db, src, type));
  const regen = parseCatalogFile(regenPath, file).map(pick);
  const a = JSON.stringify(original), b = JSON.stringify(regen);
  check(`${file} entries identical (name/url/group/summary/summaryHtml, ${original.length} entries)`, a === b, firstDiff(a, b));
}

function verifyDatasets(db: Db): void {
  console.log('\n── Dataset inventory round-trip (row-set identical) ──');
  let pages = 0, ok = 0;
  for (const page of INVENTORY_PAGES) {
    const src = join(REPO_ROOT, 'Datasets', `${page}.md`);
    const original = extractInventory(src);
    if (!original) continue;
    pages++;
    const regenPath = join(TMP, `${page}.md`);
    writeFileSync(regenPath, emitDatasetPage(db, src, page));
    const regen = extractInventory(regenPath);
    const same = JSON.stringify(original) === JSON.stringify(regen);
    if (same) ok++;
    else check(`${page}.md inventory identical`, false, firstDiff(JSON.stringify(original), JSON.stringify(regen ?? {})));
  }
  check(`all ${pages} inventory pages round-trip identically`, ok === pages, `${ok}/${pages} ok`);
}

function main(): void {
  console.log(`CAAIL DB round-trip verify — tmp: ${TMP}`);
  const db = importNdjson();
  verifyPapers(db);
  verifyCatalog(db, 'software', 'Software.md');
  verifyCatalog(db, 'database', 'Databases.md');
  verifyDatasets(db);
  console.log(`\n${failures === 0 ? '✓ all round-trip checks passed' : `✗ ${failures} check(s) FAILED`}`);
  if (failures) process.exitCode = 1;
}

main();
