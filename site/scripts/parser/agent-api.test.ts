/**
 * agent-api.test.ts — the emitted static API.
 *
 * The endpoints are what an AI agent answers from, so the properties that matter are
 * less about shape than about honesty: an empty cell must be distinguishable from a
 * failed lookup, it must carry its own caveat, and every count must say which population
 * it counted. All ground truths derive from the built models, never from literals
 * (site/e2e/data.ts:4-16 states the rule and why).
 */

import { describe, it, expect } from 'vitest';

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildAgentApi,
  buildMatrix,
  buildTopicIndex,
  buildManifest,
  readCorpusDate,
  SCOPE_NOTE,
} from './agent-api.js';
import { buildPapersModel } from './papers.js';
import { buildCatalogModel } from './catalog.js';
import { buildDatasetsModel } from './datasets-entries.js';
import { buildDatasetInventory } from './dataset-inventory.js';
import { buildTopicsModel } from './topics.js';
import { buildTaxonomyModel } from './taxonomy.js';
import { extractInventory } from '../db/extract.js';
import { curatedEntryCount } from './datasets.js';

const papers = buildPapersModel();
const catalog = buildCatalogModel();
const datasets = buildDatasetsModel();
const inventory = buildDatasetInventory();
const topics = buildTopicsModel();
const taxonomy = buildTaxonomyModel();
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DATE = '2026-01-01';

describe('matrix.json', () => {
  const matrix = buildMatrix(papers, DATE);

  it('enumerates the COMPLETE grid, not just the populated cells', () => {
    // The whole reason this endpoint exists: papers.json ships only populated cells, so
    // an agent could not tell "no paper here" from "I failed to find one".
    expect(matrix.cells.length).toBe(papers.methods.length * papers.areas.length);
    expect(matrix.cells.length).toBeGreaterThan(papers.cells.length);
    expect(matrix.totalCells).toBe(matrix.populatedCells + matrix.emptyCells);
  });

  it('agrees with the source model on which cells are populated', () => {
    expect(matrix.populatedCells).toBe(papers.cells.length);
    for (const src of papers.cells) {
      const got = matrix.cells.find((c) => c.method === src.method && c.area === src.area);
      expect(got, `${src.method} × ${src.area} missing from matrix.json`).toBeDefined();
      expect(got!.refIds).toEqual(src.refIds);
      expect(got!.emptyInCorpus).toBe(false);
    }
  });

  it('carries the caveat on every empty cell and on no populated one', () => {
    const empty = matrix.cells.filter((c) => c.emptyInCorpus);
    expect(empty.length).toBeGreaterThan(0);
    for (const c of empty) {
      expect(c.scope).toBe(SCOPE_NOTE);
      expect(c.refIds).toEqual([]);
    }
    for (const c of matrix.cells.filter((c) => !c.emptyInCorpus)) {
      expect(c.scope).toBeUndefined();
      expect(c.refIds.length).toBeGreaterThan(0);
    }
  });

  it('states the limit of the claim in words an agent will pass on', () => {
    // If this wording is ever softened, absence-in-corpus starts reading as
    // absence-in-literature, which is the specific error this endpoint guards.
    expect(SCOPE_NOTE).toMatch(/not a census/i);
    expect(SCOPE_NOTE).toMatch(/not evidence that no such work exists/i);
    expect(SCOPE_NOTE).toMatch(/recall/i);
  });
});

describe('index.json manifest', () => {
  const matrix = buildMatrix(papers, DATE);
  const manifest = buildManifest(papers, matrix, DATE) as any;

  it('labels counts with their population, so "345 papers" cannot be quoted as the matrix corpus', () => {
    const bySection = manifest.counts.papersBySection as Record<string, number>;
    const sum = Object.values(bySection).reduce((a, b) => a + b, 0);

    expect(sum).toBe(papers.references.length);
    expect(manifest.counts.papersAllSections).toBe(papers.references.length);
    expect(manifest.counts.papersMatrixEligible).toBe(bySection['References']);
    // The trap: these are different numbers and both are true of different populations.
    expect(manifest.counts.papersMatrixEligible).toBeLessThan(manifest.counts.papersAllSections);
    // and there really are more than the two sections CLAUDE.md documents
    expect(Object.keys(bySection).length).toBeGreaterThan(2);
  });

  it('describes every endpoint it lists', () => {
    for (const e of manifest.endpoints) {
      expect(e.path).toMatch(/\.json$/);
      expect(e.use.length).toBeGreaterThan(20);
    }
  });
});

describe('topics.json inverted index', () => {
  const built = buildTopicIndex(papers, catalog, datasets, topics) as any;

  it('maps a subject to items across content types, not just papers', () => {
    const slugs = Object.keys(built.index);
    expect(slugs.length).toBeGreaterThan(0);
    const spansTypes = slugs.filter((s) => {
      const e = built.index[s];
      return e.papers.length > 0 && (e.software.length + e.databases.length + e.datasets.length) > 0;
    });
    // The design-decision use case needs resources alongside papers, so this must not
    // collapse into a papers-only index.
    expect(spansTypes.length).toBeGreaterThan(slugs.length / 2);
  });

  it('indexes every topic reference carried by a paper', () => {
    const tagged = papers.references.filter((r) => (r.topics ?? []).length > 0);
    expect(tagged.length).toBeGreaterThan(0);
    for (const r of tagged.slice(0, 40)) {
      for (const t of r.topics!) {
        expect(built.index[t.slug]?.papers, `topic ${t.slug} missing`).toContain(r.id);
      }
    }
  });
});

describe('buildAgentApi', () => {
  const files = buildAgentApi({ papers, catalog, datasets, inventory, topics, taxonomy, corpusDate: DATE });

  it('emits every endpoint the manifest advertises', () => {
    const names = files.map((f) => f.name);
    const manifest = files.find((f) => f.name === 'index.json')!.body as any;
    for (const e of manifest.endpoints) expect(names).toContain(e.path);
  });

  it('stamps every endpoint with the corpus date, so staleness is always visible', () => {
    // openapi.json is the DESCRIPTION, not a described response: a bare `corpusDate` key
    // at its root would make it invalid against the OpenAPI 3.1 meta-schema, so it states
    // the same fact as info.version plus an x- extension. Assert that, don't exempt it.
    for (const f of files.filter((f) => f.name !== 'openapi.json')) {
      expect((f.body as any).corpusDate, `${f.name} has no corpusDate`).toBe(DATE);
    }
    const doc = files.find((f) => f.name === 'openapi.json')!.body as any;
    expect(doc.info.version).toBe(DATE);
    expect(doc['x-corpus-date']).toBe(DATE);
  });

  it('stamps a real date when none is supplied', () => {
    // Every other test passes corpusDate explicitly, so none of them exercise the
    // default. A shorthand `{ corpusDate }` once captured the same-named function
    // instead of the string, and JSON.stringify silently dropped it: the output was
    // deterministic and every assertion still passed while the field was undefined.
    const dflt = buildAgentApi({ papers, catalog, datasets, inventory, topics, taxonomy });
    for (const f of dflt) {
      const d =
        f.name === 'openapi.json'
          ? (f.body as { 'x-corpus-date'?: unknown })['x-corpus-date']
          : (f.body as { corpusDate?: unknown }).corpusDate;
      expect(typeof d, `${f.name} corpusDate is not a string`).toBe('string');
      expect(d as string).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('derives the date from the corpus, not the clock, so the CI sync guard is stable', () => {
    // The emitted files are committed and CI re-runs the parse to diff them. A
    // build-time `new Date()` would differ on any later day and fail the guard.
    const a = buildAgentApi({ papers, catalog, datasets, inventory, topics, taxonomy });
    const b = buildAgentApi({ papers, catalog, datasets, inventory, topics, taxonomy });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));

    // Asserting the date differs from today would be flaky: a commit to the NDJSON
    // today makes them legitimately equal. The real properties are that it comes from
    // git and is never in the future.
    const d = (a[0]!.body as { corpusDate: string }).corpusDate;
    expect(d).toBe(readCorpusDate(REPO_ROOT));
    expect(d <= new Date().toISOString().slice(0, 10)).toBe(true);
  });

  it('refuses to derive a date from a shallow clone rather than inventing one', () => {
    // A depth-1 clone's grafted root has no parent, so `git log -- <path>` reports any
    // path present in that tree as touched and returns the TIP commit's date. It is
    // well-formed, so a format check passes it, and the committed output would then
    // disagree with CI's. Verified against a real shallow clone rather than a mock.
    // A two-commit synthetic repo, NOT a clone of CAAIL. Cloning the real repo tested
    // nothing extra and pushed CI from 2 minutes to 13, because --depth 1 over file://
    // forces a full object transfer of the whole history.
    const tmp = mkdtempSync(join(tmpdir(), 'caail-shallow-'));
    const origin = join(tmp, 'origin');
    const clone = join(tmp, 'shallow');
    const git = (cwd: string, args: string[]) =>
      execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'ignore', 'ignore'] });
    try {
      mkdirSync(join(origin, 'site', 'db', 'ndjson'), { recursive: true });
      execFileSync('git', ['init', '-q', origin], { stdio: 'ignore' });
      git(origin, ['config', 'user.email', 't@t']);
      git(origin, ['config', 'user.name', 't']);
      writeFileSync(join(origin, 'site', 'db', 'ndjson', 'x.ndjson'), '{}\n');
      git(origin, ['add', '-A']);
      git(origin, ['commit', '-q', '-m', 'touches the watched path']);
      // a later commit that does NOT touch it: in a shallow clone this becomes the
      // graft root and git wrongly reports its date as the last touch.
      writeFileSync(join(origin, 'unrelated.txt'), 'x\n');
      git(origin, ['add', '-A']);
      git(origin, ['commit', '-q', '-m', 'unrelated']);
      execFileSync('git', ['clone', '-q', '--depth', '1', `file://${origin}`, clone], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });

      expect(
        execFileSync('git', ['-C', clone, 'rev-parse', '--is-shallow-repository'], {
          encoding: 'utf-8',
        }).trim(),
      ).toBe('true');
      expect(() => readCorpusDate(clone)).toThrow(/shallow clone/i);
      // and the full original resolves fine, so the throw is about shallowness
      expect(readCorpusDate(origin)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('serialises without throwing (no cycles, no undefined-only bodies)', () => {
    for (const f of files) {
      const json = JSON.stringify(f.body);
      expect(json.length, `${f.name} serialised empty`).toBeGreaterThan(100);
    }
  });
});

// ---------------------------------------------------------------------------
// datasets.json — the endpoint must carry what its own manifest advertises
// ---------------------------------------------------------------------------

/**
 * The manifest calls this endpoint "Curated dataset entries AND per-species inventory",
 * and the inventory rows are the per-study deposits — accession, tissue, assay, size —
 * i.e. the only things in the corpus a researcher could actually combine their own run
 * with. Shipping the 45 curated entries alone left an agent seeing 3 bovine datasets
 * where a reader of Datasets/Cow.md sees 34, and the count-only treatment of inventory
 * rows in the /topics/ hub is no precedent: that is a browsing-UI choice about
 * unlinkable rows, this is an endpoint naming them in its own manifest.
 *
 * Ground truth is the canonical Markdown, never a literal, so these can't drift as the
 * corpus grows.
 */
describe('datasets.json inventory', () => {
  const cowTable = extractInventory(join(REPO_ROOT, 'Datasets', 'Cow.md'))!;
  const files = buildAgentApi({ papers, catalog, datasets, inventory, topics, taxonomy, corpusDate: DATE });
  const body = files.find((f) => f.name === 'datasets.json')!.body as any;
  const manifest = files.find((f) => f.name === 'index.json')!.body as any;

  /** Everything the endpoint offers for one dataset page, however it is partitioned. */
  const itemsForPage = (b: any, page: string): any[] =>
    [...(b.entries ?? []), ...(b.inventory ?? [])].filter((e: any) => e.page === page);

  it('delivers the inventory its manifest promises', () => {
    // If this ever fails, the fix is to carry the rows — NOT to soften the manifest.
    const promise = manifest.endpoints.find((e: any) => e.path === 'datasets.json').use;
    expect(promise).toMatch(/inventory/i);
    expect(itemsForPage(body, 'Cow').length).toBeGreaterThanOrEqual(cowTable.rows.length);
  });

  it('reaches the deposits an agent would integrate against, not just the curated three', () => {
    // The behavioural check from the issue: "which bovine datasets could I combine my own
    // run with". Answering it needs accessions/repository links, which only the inventory
    // rows carry — every curated Cow entry is a portal or a model file.
    const deposits = cowTable.rows.filter((r) => /\]\(https?:\/\//.test(r.join(' ')));
    expect(deposits.length).toBeGreaterThan(10); // sanity: the ground truth is not empty

    const reachable = itemsForPage(body, 'Cow').flatMap((e: any) => e.links ?? []);
    expect(new Set(reachable).size).toBeGreaterThanOrEqual(deposits.length);
  });

  it('labels a row so a consumer can tell it from a curated entry', () => {
    for (const row of body.inventory ?? []) expect(row.kind).toBe('inventory');
    for (const e of body.entries ?? []) expect(e.kind).not.toBe('inventory');
    expect((body.inventory ?? []).length).toBeGreaterThan(0);
  });

  it('reaches the benchmark datasets, which live under H2 rather than H3 headings', () => {
    // #156. Every other dataset page puts one curated entry per `###`; Datasets/Benchmarks.md
    // puts one per `##`. The extractor keyed on depth 3, so the benchmarks fell through the gap
    // between two heading conventions and reached the endpoint in neither partition.
    //
    // Ground truth is read from the Markdown — a different path from the endpoint, which is
    // built from the committed NDJSON. It must be `curatedEntryCount`, not a raw H2 count: the
    // page is explicitly allowed to grow a `## Further reading` footer, and a raw count would
    // then demand an 18th dataset and fail against correct code.
    const onPage = curatedEntryCount(REPO_ROOT, 'Benchmarks');
    expect(onPage).toBeGreaterThan(10); // sanity: the ground truth is not empty
    expect(itemsForPage(body, 'Benchmarks').length).toBe(onPage);
  });

  it('answers "what evaluation data does CAAIL index" with resources, not just names', () => {
    // The behavioural check: an agent choosing a benchmark needs somewhere to fetch it.
    const benchmarks = itemsForPage(body, 'Benchmarks');
    const named = benchmarks.find((e: any) => /MassSpecGym/i.test(e.name));
    expect(named, 'MassSpecGym should be reachable from the datasets endpoint').toBeDefined();
    expect(named.url).toMatch(/^https?:\/\//);
    // Most carry a link; the unlinked one (BioMysteryBench) is a real shape, not a failure.
    expect(benchmarks.filter((e: any) => e.url).length).toBeGreaterThan(10);
  });

  it('names its columns, since they differ per page', () => {
    // Cow/Chicken tables are 8 columns, Fish/Crustacean/Mollusk 9 (an extra Species),
    // CrossSpecies a different 6 — positional cells would be unreadable without headers.
    const cow = (body.inventory ?? []).filter((r: any) => r.page === 'Cow');
    expect(cow.length).toBe(cowTable.rows.length);
    for (const r of cow) expect(Object.keys(r.columns)).toEqual(cowTable.header);
  });
});

/**
 * The same properties, asserted against the COMMITTED ARTIFACT rather than the freshly
 * built model. The two can disagree — that is exactly what the CI sync guard (`parse`
 * then `git diff --exit-code -- site/public/api`) exists to catch — and a model-only
 * assertion would pass while the file an agent actually fetches is still wrong.
 */
describe('site/public/api/datasets.json (the shipped file)', () => {
  const shipped = JSON.parse(
    readFileSync(join(REPO_ROOT, 'site', 'public', 'api', 'datasets.json'), 'utf-8'),
  );
  const cowTable = extractInventory(join(REPO_ROOT, 'Datasets', 'Cow.md'))!;

  it('shows an agent as many bovine datasets as a reader of Datasets/Cow.md sees', () => {
    const cow = [...(shipped.entries ?? []), ...(shipped.inventory ?? [])].filter(
      (e: any) => e.page === 'Cow',
    );
    expect(cow.length).toBeGreaterThanOrEqual(cowTable.rows.length);
  });

  it('shows an agent every benchmark a reader of Datasets/Benchmarks.md sees', () => {
    const shippedBenchmarks = [...(shipped.entries ?? []), ...(shipped.inventory ?? [])].filter(
      (e: any) => e.page === 'Benchmarks',
    );
    expect(shippedBenchmarks.length).toBe(curatedEntryCount(REPO_ROOT, 'Benchmarks'));
  });
});
