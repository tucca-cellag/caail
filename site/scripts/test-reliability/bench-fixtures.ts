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
 * ## Why this spawns child processes
 *
 * Vitest charges a hook or a test for the **first, cold** call in a worker: the module
 * graph is still loading and V8 has not warmed. Timing the same work later in a
 * process that has already done it measures something else entirely, and it flatters
 * the result by roughly 2x on this corpus.
 *
 * The first version of this script did exactly that. It timed the four corpus models,
 * then `buildMetricsModel`, then re-ran the whole sequence as the "hook" sample, by
 * which point every part of it was warm. It printed the aggregate as *smaller than one
 * of its own components* and claimed 31x headroom where the cold cost gives about 13x.
 * A benchmark whose whole purpose is to replace a number in prose with a measurement,
 * overstating that measurement 2.4x, is worse than the prose was. So each budgeted
 * sample now runs in a fresh child process, in the order the real hook runs it.
 *
 * Deliberately a script and not a test. A wall-clock assertion in the suite would be
 * the flakiest thing in it, and would fail hardest under exactly the contention this
 * work is about. Nothing here asserts; it reports, and a human reads it.
 *
 * Run it on a quiet machine. Under load it measures the load, which is the whole
 * point of the register entries and not a fixture regression.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { HOOK_TIMEOUT_MS, TEST_TIMEOUT_MS } from './budgets.js';

/** One timed step. `total: true` marks the step a budget is charged against. */
interface Step {
  label: string;
  ms: number;
  total?: boolean;
}

// ---------------------------------------------------------------------------
// Child mode: one cold process per budget.
// ---------------------------------------------------------------------------

async function runHookSample(): Promise<Step[]> {
  const { buildPapersModel } = await import('../parser/papers.js');
  const { buildCatalogModel } = await import('../parser/catalog.js');
  const { buildTopicsModel } = await import('../parser/topics.js');
  const { buildDatasetsModel } = await import('../parser/datasets-entries.js');
  const { buildMetricsModel } = await import('../parser/metrics.js');

  const steps: Step[] = [];
  const started = performance.now();
  const time = <T>(label: string, fn: () => T): T => {
    const at = performance.now();
    const value = fn();
    steps.push({ label, ms: performance.now() - at });
    return value;
  };

  // Exactly metrics.test.ts's beforeAll, in its order, in a process that has done
  // none of it before.
  const papers = time('  buildPapersModel', () => buildPapersModel());
  const catalog = time('  buildCatalogModel', () => buildCatalogModel());
  const topics = time('  buildTopicsModel', () => buildTopicsModel());
  const datasets = time('  buildDatasetsModel', () => buildDatasetsModel());
  time('  buildMetricsModel (unit under test)', () =>
    buildMetricsModel({ papers, catalog, topics, datasets }, undefined, '2026-06-01T00:00:00.000Z'),
  );

  steps.push({ label: 'metrics.test.ts beforeAll', ms: performance.now() - started, total: true });
  return steps;
}

async function runTestSample(): Promise<Step[]> {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { buildPapersModel } = await import('../parser/papers.js');
  const { importNdjson, REPO_ROOT } = await import('../db/lib.js');
  const { emitPapersFile } = await import('../db/emit.js');

  const steps: Step[] = [];
  const time = <T>(label: string, fn: () => T): T => {
    const at = performance.now();
    const value = fn();
    steps.push({ label, ms: performance.now() - at });
    return value;
  };

  // emit.test.ts imports the DB in a beforeAll and pays the round-trip per test, so
  // only the round-trip is charged against the per-test budget.
  const db = time('  importNdjson (in the file beforeAll, not per test)', () => importNdjson());

  const dir = mkdtempSync(join(tmpdir(), 'caail-bench-'));
  try {
    const started = performance.now();
    const source = join(REPO_ROOT, 'Papers.md');
    const original = buildPapersModel(source);
    const emitted = join(dir, 'Papers.md');
    writeFileSync(emitted, emitPapersFile(db, source));
    const reparsed = buildPapersModel(emitted);
    // Compared, not just built: the comparison is part of what the test spends.
    if (JSON.stringify(original) !== JSON.stringify(reparsed)) {
      throw new Error('bench: Papers.md round-trip is not identical, which is a real failure');
    }
    steps.push({
      label: 'emit.test.ts Papers.md round-trip',
      ms: performance.now() - started,
      total: true,
    });
  } finally {
    // Otherwise every run leaves a copy of Papers.md in the system temp directory.
    rmSync(dir, { recursive: true, force: true });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Parent mode: spawn one child per budget and format what they report.
// ---------------------------------------------------------------------------

const SAMPLES = {
  hook: { run: runHookSample, budget: HOOK_TIMEOUT_MS, budgetName: 'hook' },
  test: { run: runTestSample, budget: TEST_TIMEOUT_MS, budgetName: 'test' },
} as const;

type SampleName = keyof typeof SAMPLES;

/** `--sample=<name>`, present only in a child. */
const requested = process.argv.find((argument) => argument.startsWith('--sample='))?.slice(9);

if (requested) {
  if (!(requested in SAMPLES)) throw new Error(`bench: unknown sample ${JSON.stringify(requested)}`);
  const steps = await SAMPLES[requested as SampleName].run();
  // One JSON line, so the parent never has to parse formatted output.
  console.log(JSON.stringify(steps));
} else {
  const self = fileURLToPath(import.meta.url);
  const collected: { steps: Step[]; budget: number; budgetName: string }[] = [];

  for (const [name, sample] of Object.entries(SAMPLES)) {
    const child = spawnSync(process.execPath, [...process.execArgv, self, `--sample=${name}`], {
      encoding: 'utf8',
      // The parent was started by tsx, so execArgv carries the loader the child needs
      // to import TypeScript. Inheriting stderr surfaces a child crash rather than
      // leaving the parent to fail on an empty stdout.
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    if (child.status !== 0 || !child.stdout.trim()) {
      throw new Error(`bench: the ${name} sample failed (exit ${child.status})`);
    }
    const lines = child.stdout.trim().split('\n');
    collected.push({
      steps: JSON.parse(lines[lines.length - 1]) as Step[],
      budget: sample.budget,
      budgetName: sample.budgetName,
    });
  }

  const every = collected.flatMap((entry) => entry.steps);
  const width = Math.max(...every.map((step) => step.label.length));

  console.log('\nFixture cost, each measured cold in its own process\n');
  for (const { steps, budget, budgetName } of collected) {
    for (const step of steps) {
      const cost = `${step.ms.toFixed(0)}ms`.padStart(8);
      if (!step.total) {
        console.log(`${step.label.padEnd(width)}  ${cost}`);
        continue;
      }
      const headroom = (budget / step.ms).toFixed(1);
      console.log(
        `${step.label.padEnd(width)}  ${cost}   vs ${budgetName} budget ${budget}ms  =  ${headroom}x headroom`,
      );
    }
    console.log('');
  }
  console.log(
    [
      'Headroom is how much slower than this a run may get before the budget bites.',
      'Contention of 5x has been recorded on this repo, so shrinking headroom is a',
      'fixture regression to look at, not a reason to raise the budget again.',
      'Budgets and their reasoning: scripts/test-reliability/budgets.ts',
      '',
    ].join('\n'),
  );
}
