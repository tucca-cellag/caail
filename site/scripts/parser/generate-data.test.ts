/**
 * generate-data.test.ts — tests for the generateData() core function.
 *
 * Imports the pure core export; never triggers CLI side effects (the isMain
 * guard in generate-data.ts ensures the isMain branch never runs during import).
 *
 * Uses a fresh OS temp dir — never writes to the real src/content/data/, and passes a
 * temp apiDir too so the emitted agent API doesn't land in the real site/public/.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

import { generateData, writeParseOutputs, type ParseOutputDirs } from './generate-data.js';
import { CORPUS_DATE_PREFIX, corpusDateNote, findCorpusDateLine } from './llms-corpus-date.js';
import { PapersDataSchema, CountsSchema, CatalogSchema, TalksSchema } from './types.js';

// ---------------------------------------------------------------------------
// Temp directory setup / teardown
// ---------------------------------------------------------------------------

const tmpDir = mkdtempSync(join(os.tmpdir(), 'caail-generate-data-'));

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateData()', () => {
  // Run generateData once; subsequent assertions reuse the result.
  // A fixed corpus date keeps git and the clock out of it. The last arg is the agent-API
  // dir. Omitting it would default to the real site/public/api/ and rewrite it (plus
  // setup.md) on every test run.
  const result = generateData('2026-01-02', tmpDir, join(tmpDir, 'api'));

  it('returns an object with papersRefs and counts', () => {
    expect(result).toHaveProperty('papersRefs');
    expect(result).toHaveProperty('counts');
  });

  it('papersRefs === 348', () => {
    // 348 = current Papers.md reference count; bump when refs are added.
    expect(result.papersRefs).toBe(348);
  });

  it('counts.papers === 348', () => {
    // 348 = current Papers.md reference count; bump when refs are added.
    expect(result.counts.papers).toBe(348);
  });

  it('counts.datasets === 218 (every catalogued dataset)', () => {
    // 218 = current catalogued-dataset total across Datasets/; bump when
    // inventory tables / curated / reference / benchmark entries change.
    expect(result.counts.datasets).toBe(218);
  });

  it('writes papers.json to the output directory', () => {
    expect(existsSync(join(tmpDir, 'papers.json'))).toBe(true);
  });

  it('writes counts.json to the output directory', () => {
    expect(existsSync(join(tmpDir, 'counts.json'))).toBe(true);
  });

  it('papers.json is valid JSON and passes PapersDataSchema', () => {
    const raw = readFileSync(join(tmpDir, 'papers.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    const result = PapersDataSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('counts.json is valid JSON and passes CountsSchema', () => {
    const raw = readFileSync(join(tmpDir, 'counts.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    const result = CountsSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('parsed papers.json has references.length === 348', () => {
    const raw = readFileSync(join(tmpDir, 'papers.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    // 348 = current Papers.md reference count; bump when refs are added.
    expect(parsed.references.length).toBe(348);
  });

  it('parsed counts.json has papers === 348', () => {
    const raw = readFileSync(join(tmpDir, 'counts.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    // 348 = current Papers.md reference count; bump when refs are added.
    expect(parsed.papers).toBe(348);
  });

  it('papers.json is pretty-printed (contains newlines)', () => {
    const raw = readFileSync(join(tmpDir, 'papers.json'), 'utf-8');
    expect(raw).toContain('\n');
  });

  it('counts.json is pretty-printed (contains newlines)', () => {
    const raw = readFileSync(join(tmpDir, 'counts.json'), 'utf-8');
    expect(raw).toContain('\n');
  });

  it('returns catalogEntries and talks tallies', () => {
    expect(result).toHaveProperty('catalogEntries');
    expect(result).toHaveProperty('talks');
    expect(result.catalogEntries).toBe(result.counts.software + result.counts.databases);
    expect(result.talks).toBe(result.counts.talks);
  });

  it('writes catalog.json (valid, passes CatalogSchema, counts match)', () => {
    const path = join(tmpDir, 'catalog.json');
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    expect(CatalogSchema.safeParse(parsed).success).toBe(true);
    expect(parsed.software.length).toBe(result.counts.software);
    expect(parsed.databases.length).toBe(result.counts.databases);
  });

  it('writes talks.json (valid, passes TalksSchema, count matches)', () => {
    const path = join(tmpDir, 'talks.json');
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    expect(TalksSchema.safeParse(parsed).success).toBe(true);
    const items = parsed.sections.flatMap((s: { items: unknown[] }) => s.items);
    expect(items.length).toBe(result.counts.talks);
  });

  it('writes topics.json with 8 themes (reaching here == topic-join guard passed)', () => {
    // generateData() throws if any catalog/paper topic tag is unresolved, so the
    // `result` above existing means the orphan guard passed.
    const path = join(tmpDir, 'topics.json');
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    expect(parsed.themes).toHaveLength(8);
    expect(parsed.tags.length).toBeGreaterThan(0);
  });
});

describe('writeParseOutputs()', () => {
  const CORPUS_DATE = '2026-01-02';

  /** A minimal llms.txt: hand-typed lines around one corpus-date line, `dateLine`. */
  const llmsTxtWith = (dateLine: string) => `# CAAIL\n\n> Summary.\n\n${dateLine}\n\nBody.\n`;
  const STALE = llmsTxtWith('Corpus date: 2020-01-01, an older note.');
  const CURRENT = llmsTxtWith(corpusDateNote(CORPUS_DATE, 'llms.txt'));

  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  /** Fresh temp output dirs whose public dir holds `llmsTxt` as llms.txt. */
  function outputDirs(llmsTxt: string): { root: string; dirs: ParseOutputDirs } {
    const root = mkdtempSync(join(os.tmpdir(), 'caail-parse-outputs-'));
    roots.push(root);
    const publicDir = join(root, 'public');
    mkdirSync(publicDir);
    writeFileSync(join(publicDir, 'llms.txt'), llmsTxt, 'utf-8');
    return { root, dirs: { outDir: join(root, 'data'), apiDir: join(publicDir, 'api'), publicDir } };
  }

  /** One parse into fresh dirs seeded with `llmsTxt`, and what it left in the files that carry a date. */
  function parseInto(llmsTxt: string) {
    const { dirs } = outputDirs(llmsTxt);
    const { llmsTxtRewritten } = writeParseOutputs(CORPUS_DATE, dirs);
    const read = (rel: string) => readFileSync(join(dirs.publicDir, rel), 'utf-8');
    return {
      llmsTxtRewritten,
      llmsTxt: read('llms.txt'),
      // Only the header: the concatenated corpus below it is not llms-full.txt's own text.
      llmsFullHeader: read('llms-full.txt').split('\n# ===== ')[0]!,
      indexCorpusDate: (JSON.parse(read('api/index.json')) as { corpusDate: string }).corpusDate,
    };
  }

  /** The date on the one corpus-date line of `text`: what follows the label, up to its comma. */
  function dateOn(text: string, file: string): string {
    const lines = text.split('\n');
    return lines[findCorpusDateLine(lines, file)]!.slice(CORPUS_DATE_PREFIX.length).split(',')[0]!.trim();
  }

  // Each run is a whole parse, about as long as generateData's run above, so like that run they
  // happen once, here, rather than inside a test: the per-test budget in
  // scripts/test-reliability/budgets.ts is sized for tests several times cheaper.
  const fromStale = parseInto(STALE);
  const fromCurrent = parseInto(CURRENT);

  it('throws on a llms.txt with no corpus-date line before writing anything', () => {
    // A bad llms.txt is found first, so parse fails with the tree as it was, rather than after
    // the data, the agent API, setup.md and llms-full.txt have been regenerated around it.
    const undated = '# CAAIL\n\nNo corpus-date line here.\n';
    const { root, dirs } = outputDirs(undated);
    expect(() => writeParseOutputs(CORPUS_DATE, dirs)).toThrow(/^llms\.txt: .*found 0/);
    expect(readdirSync(root)).toEqual(['public']);
    expect(readdirSync(dirs.publicDir)).toEqual(['llms.txt']);
    expect(readFileSync(join(dirs.publicDir, 'llms.txt'), 'utf-8')).toBe(undated);
  });

  it('dates llms.txt, llms-full.txt and the agent API with the one date it is given', () => {
    expect({
      'llms.txt': dateOn(fromStale.llmsTxt, 'llms.txt'),
      'llms-full.txt': dateOn(fromStale.llmsFullHeader, 'llms-full.txt'),
      'api/index.json': fromStale.indexCorpusDate,
    }).toEqual({ 'llms.txt': CORPUS_DATE, 'llms-full.txt': CORPUS_DATE, 'api/index.json': CORPUS_DATE });
  });

  it("rewrites llms.txt's date line in parse's own words and keeps every hand-typed line", () => {
    expect({ rewritten: fromStale.llmsTxtRewritten, text: fromStale.llmsTxt }).toEqual({ rewritten: true, text: CURRENT });
  });

  it('leaves a llms.txt already carrying the current note byte for byte', () => {
    // What lets a second parse report llms.txt unchanged, and the sync guard's diff stay empty.
    expect({ rewritten: fromCurrent.llmsTxtRewritten, text: fromCurrent.llmsTxt }).toEqual({ rewritten: false, text: CURRENT });
  });
});
