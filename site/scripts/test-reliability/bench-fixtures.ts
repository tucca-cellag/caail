/**
 * bench-fixtures.ts — print what the expensive test fixtures actually cost.
 *
 * `pnpm --dir site bench:fixtures`
 *
 * CAAIL-239's objection to raising a timeout is that it hides how long the fixtures
 * take, which is a signal worth keeping. This is that signal, on demand: it measures
 * the fixtures the registered slow files build and reports each against the budget in
 * `budgets.ts`, so a fixture that grows shows up as headroom shrinking rather than as
 * a timeout six weeks later on someone else's branch.
 *
 * Deliberately a script and not a test. A wall-clock assertion in the suite would be
 * the flakiest thing in it, and would fail hardest under exactly the contention this
 * work is about. Nothing here asserts; it reports, and a human reads it.
 *
 * Run it on a quiet machine. Under load it measures the load, which is the whole
 * point of the register entries and not a fixture regression.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildPapersModel } from '../parser/papers.js';
import { buildCatalogModel } from '../parser/catalog.js';
import { buildTopicsModel } from '../parser/topics.js';
import { buildDatasetsModel } from '../parser/datasets-entries.js';
import { buildMetricsModel } from '../parser/metrics.js';
import { importNdjson, REPO_ROOT } from '../db/lib.js';
import { emitPapersFile } from '../db/emit.js';
import { HOOK_TIMEOUT_MS, TEST_TIMEOUT_MS } from './budgets.js';

interface Sample {
  label: string;
  ms: number;
  /** Which budget this cost is charged against, or null when it is a component. */
  budget: 'hook' | 'test' | null;
}

function time<T>(label: string, budget: Sample['budget'], fn: () => T, into: Sample[]): T {
  const started = performance.now();
  const value = fn();
  into.push({ label, ms: performance.now() - started, budget });
  return value;
}

const samples: Sample[] = [];

// The four corpus models, individually. These are what corpus-fixture.ts memoises,
// so this is also the ceiling on what sharing them can ever be worth.
const papers = time('buildPapersModel', null, () => buildPapersModel(), samples);
const catalog = time('buildCatalogModel', null, () => buildCatalogModel(), samples);
const topics = time('buildTopicsModel', null, () => buildTopicsModel(), samples);
const datasets = time('buildDatasetsModel', null, () => buildDatasetsModel(), samples);

// The unit under test in metrics.test.ts. Not shareable: caching it would cache the
// thing the file exists to check.
time(
  'buildMetricsModel (unit under test)',
  null,
  () => buildMetricsModel({ papers, catalog, topics, datasets }, undefined, '2026-06-01T00:00:00.000Z'),
  samples,
);

// The whole of metrics.test.ts's beforeAll, which is what the hook budget is for.
time(
  'metrics.test.ts beforeAll (all of the above)',
  'hook',
  () => {
    const p = buildPapersModel();
    const c = buildCatalogModel();
    const t = buildTopicsModel();
    const d = buildDatasetsModel();
    return buildMetricsModel({ papers: p, catalog: c, topics: t, datasets: d }, undefined, '2026-06-01T00:00:00.000Z');
  },
  samples,
);

// The slowest single test in the suite, reproduced in the shape the test budget
// actually charges: emit.test.ts's Papers.md round-trip. Measuring one component of
// it (the DB import, say) and reporting that against the test budget would overstate
// the headroom several times over, which is the same class of error as quoting a
// number nothing checks.
time('importNdjson (component, per test)', null, () => importNdjson(), samples);
const db = importNdjson();
time(
  'emit.test.ts Papers.md round-trip (slowest test)',
  'test',
  () => {
    const source = join(REPO_ROOT, 'Papers.md');
    const original = buildPapersModel(source);
    const emitted = join(mkdtempSync(join(tmpdir(), 'caail-bench-')), 'Papers.md');
    writeFileSync(emitted, emitPapersFile(db, source));
    const reparsed = buildPapersModel(emitted);
    // Compared, not just built: the comparison is part of what the test spends.
    if (JSON.stringify(original) !== JSON.stringify(reparsed)) {
      throw new Error('bench: Papers.md round-trip is not identical, which is a real failure');
    }
  },
  samples,
);

const width = Math.max(...samples.map((s) => s.label.length));
console.log('\nFixture cost (quiet machine; under load this measures the load)\n');
for (const sample of samples) {
  const cost = `${sample.ms.toFixed(0)}ms`.padStart(7);
  if (sample.budget === null) {
    console.log(`  ${sample.label.padEnd(width)}  ${cost}`);
    continue;
  }
  const budget = sample.budget === 'hook' ? HOOK_TIMEOUT_MS : TEST_TIMEOUT_MS;
  const headroom = (budget / sample.ms).toFixed(1);
  console.log(
    `  ${sample.label.padEnd(width)}  ${cost}   vs ${sample.budget} budget ${budget}ms  =  ${headroom}x headroom`,
  );
}
console.log(
  [
    '',
    'Headroom is how much slower than this a run may get before the budget bites, and',
    'it is an UPPER bound: these run warm, while vitest charges the first, cold call in',
    'a worker (which puts the round-trip nearer 1.4s there than the figure above).',
    'Contention of 5x has been recorded on this repo, so shrinking headroom is a',
    'fixture regression to look at, not a reason to raise the budget again.',
    'Budgets and their reasoning: scripts/test-reliability/budgets.ts',
    '',
  ].join('\n'),
);
