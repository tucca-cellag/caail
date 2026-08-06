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
import { mkdtempSync, rmSync } from 'node:fs';
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
import { buildTopicsModel } from './topics.js';
import { buildTaxonomyModel } from './taxonomy.js';

const papers = buildPapersModel();
const catalog = buildCatalogModel();
const datasets = buildDatasetsModel();
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
  const files = buildAgentApi({ papers, catalog, datasets, topics, taxonomy, corpusDate: DATE });

  it('emits every endpoint the manifest advertises', () => {
    const names = files.map((f) => f.name);
    const manifest = files.find((f) => f.name === 'index.json')!.body as any;
    for (const e of manifest.endpoints) expect(names).toContain(e.path);
  });

  it('stamps every endpoint with the corpus date, so staleness is always visible', () => {
    for (const f of files) {
      expect((f.body as any).corpusDate, `${f.name} has no corpusDate`).toBe(DATE);
    }
  });

  it('stamps a real date when none is supplied', () => {
    // Every other test passes corpusDate explicitly, so none of them exercise the
    // default. A shorthand `{ corpusDate }` once captured the same-named function
    // instead of the string, and JSON.stringify silently dropped it: the output was
    // deterministic and every assertion still passed while the field was undefined.
    const dflt = buildAgentApi({ papers, catalog, datasets, topics, taxonomy });
    for (const f of dflt) {
      const d = (f.body as { corpusDate?: unknown }).corpusDate;
      expect(typeof d, `${f.name} corpusDate is not a string`).toBe('string');
      expect(d as string).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('derives the date from the corpus, not the clock, so the CI sync guard is stable', () => {
    // The emitted files are committed and CI re-runs the parse to diff them. A
    // build-time `new Date()` would differ on any later day and fail the guard.
    const a = buildAgentApi({ papers, catalog, datasets, topics, taxonomy });
    const b = buildAgentApi({ papers, catalog, datasets, topics, taxonomy });
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
    const tmp = mkdtempSync(join(tmpdir(), 'caail-shallow-'));
    const clone = join(tmp, 'shallow');
    try {
      execFileSync('git', ['clone', '-q', '--depth', '1', `file://${REPO_ROOT}`, clone], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      expect(
        execFileSync('git', ['-C', clone, 'rev-parse', '--is-shallow-repository'], {
          encoding: 'utf-8',
        }).trim(),
      ).toBe('true');
      expect(() => readCorpusDate(clone)).toThrow(/shallow clone/i);
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
