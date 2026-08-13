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
  PLACEMENT_NOTE,
} from './agent-api.js';
import { buildPapersModel } from './papers.js';
import { computeCounts } from './counts.js';
import { buildCatalogModel } from './catalog.js';
import { buildDatasetsModel } from './datasets-entries.js';
import { buildDatasetInventory } from './dataset-inventory.js';
import { buildTopicsModel } from './topics.js';
import { buildTaxonomyModel } from './taxonomy.js';
import { extractInventory } from '../db/extract.js';
import { curatedEntryCount } from './datasets.js';

const papers = buildPapersModel();
const counts = computeCounts(papers);
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

  /**
   * SCOPE_NOTE bounds what an EMPTY cell proves; this bounds what a POPULATED one does.
   * An agent that looks up one cell never reads the envelope, so both travel on the cell.
   */
  it('carries the placement caveat on every populated cell and on no empty one', () => {
    const populated = matrix.cells.filter((c) => !c.emptyInCorpus);
    expect(populated.length).toBeGreaterThan(0);
    for (const c of populated) expect(c.placement).toBe(PLACEMENT_NOTE);
    for (const c of matrix.cells.filter((c) => c.emptyInCorpus)) {
      expect(c.placement).toBeUndefined();
    }
    // Exactly one caveat each: both would tell an agent the cell is simultaneously
    // empty and populated.
    expect(matrix.cells.filter((c) => c.scope && c.placement)).toEqual([]);
  });

  /**
   * The two caveats are deliberately different STRENGTHS, and that asymmetry is the thing
   * worth protecting. Absence is weak evidence, so SCOPE_NOTE undercuts it hard. A
   * placement is a real claim, so PLACEMENT_NOTE must qualify precision without telling an
   * agent to discount the classification — which is the one thing CAAIL adds. If this ever
   * drifts toward "unverified" or "do not rely on", the endpoint starts arguing against
   * its own contribution.
   */
  it('declares its maturity without undercutting the classification', () => {
    expect(matrix.status).toBe('beta');
    expect(matrix.placementsUnderReview).toBe(true);
    expect(PLACEMENT_NOTE).toMatch(/substantive claim/i);
    expect(PLACEMENT_NOTE).toMatch(/precision, not inclusion/i);
    expect(PLACEMENT_NOTE).toMatch(/cite the paper/i);
    // Absence stays the stronger caveat of the two.
    expect(SCOPE_NOTE).toMatch(/not evidence that no such work exists/i);
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
    // Every benchmark should be fetchable: an eval dataset an agent cannot reach is a name,
    // not a resource. `url` is nullable in the schema (unlinked GEM headings on the species
    // pages use it, and emit.test.ts covers that shape) — but on this page it should never
    // be exercised, because a benchmark always has a canonical home to link.
    for (const e of benchmarks) {
      expect(e.url, `${e.name} has no URL — link its heading`).toMatch(/^https?:\/\//);
    }
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

/**
 * The prose that quotes these counts back at a reader.
 *
 * `plugin/skills/caail/SKILL.md` is loaded into every plugin user's context on every
 * session, and it states the grid size under a heading called "The one thing to get
 * right" — so a stale number there is read far more often than it is edited, and it
 * contradicts the endpoint it tells the agent to fetch in the same breath. It went stale
 * exactly once, when CAAIL-164 retired a column and moved the grid from 175/107 to
 * 150/80; nothing failed. `agent-api.ts`'s own module doc is the text SKILL.md's wording
 * was derived from, so it is checked too, or the next rewrite re-derives it wrong.
 *
 * This is the repo's standing rule against a hand-typed fact sitting next to a
 * machine-derived one (CLAUDE.md, "Gotchas"). Neither number can be derived at read time
 * — both live in prose — so the remedy is the other one: fail when they disagree.
 */
describe('prose that quotes the matrix grid size', () => {
  const matrix = buildMatrix(papers, DATE);
  const read = (...seg: string[]) => readFileSync(join(REPO_ROOT, ...seg), 'utf-8');

  /**
   * EVERY number written directly against a phrase, not just the first.
   *
   * Set membership was the first attempt and is too weak: "all 80 method×area cells,
   * including the 150 with no indexed paper" contains both live values and would pass
   * while saying something false. A transposition is exactly the edit these numbers
   * invite, since they are read far more often than they are changed.
   *
   * Scoping to one comment block was itself a hole: `agent-api.ts` states the same pair
   * twice, in the module doc and again in `buildMatrix`'s docstring 148 lines below, and
   * a guard that stopped at the first close-comment left the second free to contradict
   * it with a green suite. Returning every occurrence means a third restatement cannot
   * quietly escape the check.
   *
   * The number must be ADJACENT. Scanning backwards to the nearest digit anywhere ahead
   * of the phrase reads unrelated numbers as claims: it took a line number out of nearby
   * code as the count for the manifest's number-less "All method×area cells", and the 17
   * of "17 dataset pages" as the count for "which tools, datasets and prior work". Those
   * are prose mentions, not assertions, so a phrase with no number against it is not a
   * claim this guard has anything to say about.
   */
  const numbersBefore = (text: string, phrase: string): number[] => {
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // `(?<![\d.,])` anchors the START of the numeral, so a number that has been split by a
    // separator cannot be read as a smaller whole one. Without the comma, "1,345 papers"
    // matched 345 — which equals the live count, so the guard passed while the shipped text
    // was wrong. Without the dot, "§4.6 research areas" matches 6, and "v0.1.0 papers"
    // matches 0. A silent pass is the one failure mode this guard cannot have.
    return [...text.matchAll(new RegExp(`(?<![\\d.,])(\\d+)\\s*${esc}`, 'g'))].map((m) =>
      Number(m[1]),
    );
  };

  /**
   * Assert the phrase carries a number at least once, and that every one is `expected`.
   *
   * The two failure messages are deliberately different. A separator-split number matches
   * zero times by design, so reporting that as "no number" would misdiagnose the first
   * legitimate "1,024 datasets" as a missing figure rather than as a format this guard
   * cannot read. `counts.datasets` is 238 and climbing, so that day is coming.
   */
  const everyMention = (text: string, phrase: string, expected: number, label: string) => {
    const found = numbersBefore(text, phrase);
    if (found.length === 0) {
      const near = new RegExp(`[\\d.,]+\\s*${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      expect(
        text.match(near)?.[0] ?? null,
        `${label}: no plain-integer count against "${phrase}" — write 1024, not 1,024 or 1.0k`,
      ).toBeNull();
      expect.fail(`${label}: no number written against "${phrase}"`);
    }
    expect(found, label).toEqual(found.map(() => expected));
  };

  /** `Records<section, n>` over the live corpus, for the figures SKILL.md quotes. */
  const bySection: Record<string, number> = {};
  for (const r of papers.references) bySection[r.section] = (bySection[r.section] ?? 0) + 1;
  const referenceWorkTotal = Object.entries(bySection)
    .filter(([s]) => s.includes('Reference Work'))
    .reduce((a, [, n]) => a + n, 0);

  /**
   * EVERY number inside `(…)` immediately after a phrase, e.g. "Perspectives (74)".
   *
   * Global for the same reason `numbersBefore` is: a non-global match reads only the first
   * occurrence, so a second restatement carrying a stale figure passes. That hole was fixed
   * once in this file and reintroduced here in the same commit, which is a good argument for
   * every phrase-matcher in this block defaulting to "all of them".
   */
  const parensAfter = (text: string, phrase: string): number[] => {
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...text.matchAll(new RegExp(`${esc}\\s*\\((\\d+)\\)`, 'g'))].map((m) => Number(m[1]));
  };

  /** Every value found must equal `expected`, and at least one must have been found. */
  const everyEquals = (found: number[], expected: number, label: string) => {
    expect(found.length, `${label}: phrase not found with a parenthesised count`).toBeGreaterThan(0);
    expect(found, label).toEqual(found.map(() => expected));
  };

  it('the installed plugin skill states the live total and empty-cell counts', () => {
    const src = read('plugin', 'skills', 'caail', 'SKILL.md');
    everyMention(src, 'method×area cells', matrix.totalCells, 'SKILL.md: cell total');
    everyMention(src, 'with no indexed paper', matrix.emptyCells, 'SKILL.md: empty count');
  });

  /**
   * The rest of SKILL.md's figures. Its "Counting" section exists to stop an agent
   * quoting "345 papers" as the matrix corpus, so those per-section numbers being wrong
   * would defeat the one paragraph written to prevent a miscount.
   *
   * The corpus total is checked in the FRONTMATTER only, not across the file. Demanding
   * that every "N papers" in SKILL.md equal 345 would forbid writing "229 papers are
   * matrix-eligible" — a true sentence, in the one file whose whole thesis is that a
   * paper count must name its population. A guard that blocks the correct text is worse
   * than no guard on that line.
   */
  it('the installed plugin skill states live paper counts', () => {
    const src = read('plugin', 'skills', 'caail', 'SKILL.md');
    const frontmatter = src.slice(0, src.indexOf('\n---', 4));
    everyMention(frontmatter, ' papers', counts.papers, 'SKILL.md frontmatter: total papers');
    everyEquals(parensAfter(src, '`References`'), bySection['References'], 'SKILL.md: matrix-eligible');
    everyEquals(parensAfter(src, 'Perspectives'), bySection['Reviews & Perspectives'], 'SKILL.md: reviews');
    everyEquals(parensAfter(src, 'Reference Work sections'), referenceWorkTotal, 'SKILL.md: reference works');

    // The spelled-out counts in the same sentence. Both oracles are already computed here,
    // and leaving them out would let "spans six sections" go stale beside a digit that the
    // line above keeps honest — a half-guarded sentence reads as a checked one.
    const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const sectionCount = Object.keys(bySection).length;
    const refWorkSections = Object.keys(bySection).filter((s) => s.includes('Reference Work')).length;
    expect(src, `SKILL.md: "${WORDS[sectionCount]} sections"`).toContain(`spans ${WORDS[sectionCount]} sections`);
    expect(src, `SKILL.md: "${WORDS[refWorkSections]} Reference Work sections"`).toContain(
      `${WORDS[refWorkSections]} Reference Work sections`,
    );
  });

  /**
   * The ROOT marketplace manifest, one directory above the plugin one. Same class of file
   * carrying the same class of figure, and until this branch `.claude-plugin/**` was
   * matched by no workflow's `paths:` filter at all — so the gap the plugin manifest was
   * just fixed for existed one level up, unguarded and unnoticed.
   */
  it('the root marketplace manifest states the live paper total', () => {
    const mkt = JSON.parse(read('.claude-plugin', 'marketplace.json'));
    everyMention(mkt.metadata.description, ' papers', counts.papers, 'marketplace.json: papers');
  });

  it('every restatement in agent-api.ts agrees with the live grid', () => {
    const src = read('site', 'scripts', 'parser', 'agent-api.ts');
    everyMention(src, 'method×area cells', matrix.totalCells, 'agent-api: cell total');
    everyMention(src, 'with no indexed paper', matrix.emptyCells, 'agent-api: empty count');
    everyMention(src, 'populated ones', matrix.populatedCells, 'agent-api: populated count');
    // `buildMatrix`'s docstring phrases the same pair as "references (70 of 150)" rather
    // than in words, so it needs its own matcher. Global, because a non-global match reads
    // only the first pair and re-opens the hole this assertion exists to close.
    //
    // Anchored to "references (", which is a real trade rather than a free win: it stops an
    // unrelated "(N of M)" elsewhere in this file being reported as a grid mismatch, and in
    // exchange a future restatement worded "the populated cells (70 of 150)" escapes the
    // check entirely. Anchoring is the safer side only because a false alarm on an unrelated
    // parenthetical would train the next reader to loosen the guard.
    const ofPairs = [...src.matchAll(/references \((\d+) of (\d+)\)/g)];
    expect(ofPairs.length, 'agent-api: the "references (N of M)" restatement').toBeGreaterThan(0);
    for (const p of ofPairs) {
      expect([Number(p[1]), Number(p[2])], 'agent-api: populated of total').toEqual([
        matrix.populatedCells,
        matrix.totalCells,
      ]);
    }
  });

  /**
   * The social card GENERATOR's palette — not the card. The distinction is the whole point
   * of the title: `og.png` is a committed artifact regenerated only by a manual
   * `node scripts/og-image.mjs`, with no npm script and no CI regen-and-diff, so this
   * asserts the source a re-run would use and cannot prove the shipped PNG matches it.
   * Extending `AREA` and not re-running the script still ships a stale card with a green
   * suite, which is exactly what happened when the column was retired. Closing that needs
   * a regen-and-diff step in CI (as `setup.md` has); this is the cheap half.
   *
   * The palette is also a hand-copied duplicate of the `--caail-area-*` tokens, so the
   * hexes themselves remain unguarded — only the count has an oracle.
   */
  it('the social card generator defines one dot colour per research area', () => {
    const src = read('site', 'scripts', 'og-image.mjs');
    const arr = src.match(/const AREA = \[([^\]]*)\]/);
    expect(arr, 'og-image.mjs: the AREA palette').not.toBeNull();
    const hexes = [...arr![1].matchAll(/'(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1]);
    expect(hexes.length, 'og-image.mjs: one colour per area').toBe(papers.areas.length);
  });

  /**
   * The plugin manifest's description, which is the corpus summary that had NO workflow
   * behind it: until this branch no `paths:` filter matched `plugin/.claude-plugin/**`, so
   * an edit there triggered nothing. It was found stale twice over in one review (a retired
   * column, and a dataset total 33 short), which is what a figure nobody checks looks like.
   */
  it('the plugin marketplace description states live corpus figures', () => {
    const desc = JSON.parse(read('plugin', '.claude-plugin', 'plugin.json')).description as string;
    everyMention(desc, ' papers', counts.papers, 'plugin.json: papers');
    everyMention(desc, ' methods', papers.methods.length, 'plugin.json: methods');
    everyMention(desc, ' research areas', papers.areas.length, 'plugin.json: areas');
    everyMention(desc, ' software tools', counts.software, 'plugin.json: software');
    everyMention(desc, ' databases', counts.databases, 'plugin.json: databases');
    everyMention(desc, ' datasets', counts.datasets, 'plugin.json: datasets');
    everyMention(desc, ' dataset pages', counts.species, 'plugin.json: dataset pages');
  });
});
