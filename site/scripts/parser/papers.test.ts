/**
 * papers.test.ts — tests for the Papers.md model orchestrator.
 *
 * Two suites:
 *   A. A small synthetic fixture (papers.fixture.md) exercising every branch.
 *   B. The real repo-root Papers.md, asserting verified ground-truth invariants.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPapersModel, PAPERS_MD_PATH } from './papers.js';
import { doiKey } from './citations.js';
import { PapersDataSchema, type PapersData } from './types.js';

/**
 * Ref 289's published correction: the repo's only post-publication notice.
 * Normalized through the same doiKey the comparisons below use, so retyping it
 * with any uppercase (equally valid, DOIs are case-insensitive) cannot leave the
 * needle mixed-case against a lowercased haystack and pass silently forever.
 */
const CORRECTION_DOI = doiKey('10.1093/biomethods/bpaf076')!;

/**
 * The article-id suffix, derived rather than retyped. This is the needle the
 * #202 guard searches for, because a fix could surface the notice as a
 * publisher URL (`…/biomethods/article/10/1/bpaf076/8320166`) rather than as
 * the DOI, and that URL carries the suffix but not the DOI.
 */
const CORRECTION_ARTICLE_ID = CORRECTION_DOI.split('/').pop()!;

const FIXTURE_PATH = join(
  fileURLToPath(import.meta.url),
  '..',
  'fixtures',
  'papers.fixture.md',
);

// ---------------------------------------------------------------------------
// A. Synthetic fixture
// ---------------------------------------------------------------------------

describe('buildPapersModel — fixture', () => {
  let model: PapersData;

  it('builds without throwing (internal schema validation passes)', () => {
    expect(() => {
      model = buildPapersModel(FIXTURE_PATH);
    }).not.toThrow();
  });

  it('parses the two area columns in order', () => {
    expect(model.areas).toEqual([
      { key: 'media', label: 'Media Optimization' },
      { key: 'cell', label: 'Cellular Engineering' },
    ]);
  });

  it('collects the method rows in order', () => {
    expect(model.methods).toEqual([
      'Bayesian Optimization',
      'Deep Learning',
      'GNN',
    ]);
  });

  it('emits only populated cells with correct refIds/labels', () => {
    // Bayesian Optimization × media has #1 and #2; Deep Learning × cell has #1,#4;
    // GNN × media has #5 (the merged-blockquote fixture ref).
    expect(model.cells).toEqual([
      {
        method: 'Bayesian Optimization',
        area: 'media',
        refIds: [1, 2],
        labels: ['Cosenza et al. 2022', 'Cosenza et al. 2022'],
      },
      {
        method: 'Deep Learning',
        area: 'cell',
        refIds: [1, 4],
        labels: ['Cosenza et al. 2022', 'Jones 2020'],
      },
      {
        method: 'GNN',
        area: 'media',
        refIds: [5],
        labels: ['Merged 2024'],
      },
    ]);
  });

  it('marks a matrix-cited References ref as primary with code+data flags', () => {
    const ref2 = model.references.find((r) => r.id === 2)!;
    expect(ref2.section).toBe('References');
    expect(ref2.isPrimary).toBe(true);
    expect(ref2.methods).toEqual(['Bayesian Optimization']);
    expect(ref2.areas).toEqual(['media']);
    expect(ref2.hasCode).toBe(true);
    expect(ref2.hasData).toBe(true);
    expect(ref2.codeUrl).toBe('https://github.com/example/repo-two');
    expect(ref2.dataUrl).toBe('https://doi.org/10.5281/zenodo.1234567');
  });

  it('handles a ref cited across two methods/areas', () => {
    const ref1 = model.references.find((r) => r.id === 1)!;
    expect(ref1.isPrimary).toBe(true);
    expect(ref1.methods).toEqual(['Bayesian Optimization', 'Deep Learning']);
    expect(ref1.areas).toEqual(['media', 'cell']);
    expect(ref1.hasCode).toBe(true);
    expect(ref1.hasData).toBe(false);
    expect(ref1.codeUrl).toBe('https://github.com/example/repo-one');
    expect(ref1.dataUrl).toBeNull();
  });

  it('marks the Reviews ref as non-primary with no methods/areas', () => {
    const ref3 = model.references.find((r) => r.id === 3)!;
    expect(ref3.section).toBe('Reviews & Perspectives');
    expect(ref3.isPrimary).toBe(false);
    expect(ref3.methods).toEqual([]);
    expect(ref3.areas).toEqual([]);
  });

  it('recovers BOTH codeUrl and dataUrl from a merged single-node blockquote (Fix E)', () => {
    // ref 5 in the fixture has `> **Code**: …\n> **Data**: …` with NO blank line
    // between them — remark folds both lines into one blockquote node.
    const ref5 = model.references.find((r) => r.id === 5)!;
    expect(ref5.isPrimary).toBe(true);
    expect(ref5.hasCode).toBe(true);
    expect(ref5.hasData).toBe(true);
    expect(ref5.codeUrl).toBe('https://github.com/example/merged');
    expect(ref5.dataUrl).toBe('https://zenodo.org/record/merged');
  });

  it('disambiguates colliding base slugs by ascending id', () => {
    const ref1 = model.references.find((r) => r.id === 1)!;
    const ref2 = model.references.find((r) => r.id === 2)!;
    expect(ref1.slug).toBe('cosenza-2022');
    expect(ref2.slug).toBe('cosenza-2022b');
  });

  it('leaves single-occurrence slugs unsuffixed', () => {
    const ref4 = model.references.find((r) => r.id === 4)!;
    expect(ref4.slug).toBe('jones-2020');
  });

  it('produces a model that validates against the schema', () => {
    expect(PapersDataSchema.safeParse(model).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B. Real corpus integration
// ---------------------------------------------------------------------------

describe('buildPapersModel — real Papers.md', () => {
  const model = buildPapersModel();

  it('resolves PAPERS_MD_PATH to the repo-root Papers.md', () => {
    // Repo-root basename — robust across normal checkouts and linked worktrees
    // (whose root dir isn't named "caail"); must have ascended out of site/.
    expect(PAPERS_MD_PATH.endsWith('/Papers.md')).toBe(true);
    expect(PAPERS_MD_PATH.includes('/site/')).toBe(false);
  });

  it('has 345 references', () => {
    // current Papers.md reference count; bump when refs are added.
    expect(model.references.length).toBe(345);
  });

  // Ground truth (bump when refs change): DISTINCT refs with a code URL and
  // refs with a non-null absolute data URL. (Ref 132's only data link is the relative
  // `./Datasets/` — rejected by the schema's `z.string().url()`, stored as null.)
  it('has 92 refs with a code URL, consistent with hasCode', () => {
    const withCodeUrl = model.references.filter((r) => r.codeUrl !== null).length;
    const withHasCode = model.references.filter((r) => r.hasCode).length;
    expect(withCodeUrl).toBe(92);
    expect(withHasCode).toBe(92);
  });

  it('has 10 refs with an absolute data URL', () => {
    const withDataUrl = model.references.filter((r) => r.dataUrl !== null).length;
    expect(withDataUrl).toBe(11);
  });

  it('has 6 distinct sections including References and Reviews & Perspectives', () => {
    const sections = new Set(model.references.map((r) => r.section));
    expect(sections.size).toBe(6);
    expect(sections.has('References')).toBe(true);
    expect(sections.has('Reviews & Perspectives')).toBe(true);
  });

  it('has 24 method rows', () => {
    expect(model.methods.length).toBe(25);
  });

  it('has 6 areas with the exact keys in column order', () => {
    expect(model.areas.length).toBe(6);
    expect(model.areas.map((a) => a.key)).toEqual([
      'media',
      'cell',
      'bioprocess',
      'scaffolding',
      'sensory',
      'tooling',
    ]);
  });

  it('has no dangling matrix refIds', () => {
    const ids = new Set(model.references.map((r) => r.id));
    const dangling = model.cells
      .flatMap((c) => c.refIds)
      .filter((id) => !ids.has(id));
    expect(dangling.length).toBe(0);
  });

  it('spot-checks the Deep Learning × cell cell', () => {
    const cell = model.cells.find(
      (c) => c.method === 'Deep Learning' && c.area === 'cell',
    )!;
    expect(cell).toBeDefined();
    expect(cell.refIds).toEqual([5, 122, 57, 145, 118, 123, 263]);
    expect(cell.refIds.length).toBe(7);
  });

  it('spot-checks reference id 6', () => {
    const ref6 = model.references.find((r) => r.id === 6)!;
    expect(ref6.year).toBe(2021);
    expect(ref6.journal).toBe('Bioinformatics');
    expect(ref6.doi).toBe('10.1093/bioinformatics/btab083');
    expect(ref6.hasCode).toBe(true);
    expect(ref6.isPrimary).toBe(true);
  });

  // Pins the claim CLAUDE.md and CONTRIBUTING.md both make about post-publication
  // notices: they reach GitHub and llms-full.txt but never the parsed model, because
  // parseReferences selects blockquote labels by name and keeps only Code/Data.
  //
  // Ref 289 is the only reference carrying such a notice, so the source assertion
  // comes first: without it the rest passes vacuously the day someone removes the
  // notice, and goes on confirming a claim that nothing is testing any more.
  //
  // When tucca-cellag/caail#202 teaches the parser the label it must also widen the
  // schema to carry it — buildPapersModel ends in PapersDataSchema.parse(), which
  // strips unknown keys — and this test then fails. Rewrite both paragraphs with it.
  //
  // Scope, so the docs do not over-claim what this covers: it fails for any fix that
  // routes the notice through the parsed model, including a sibling structure keyed
  // by ref id, because the assertion is over the whole model. It does NOT fire for a
  // fix that renders the notice on the card straight from the canonical Markdown.
  it('drops a post-publication notice label, keeping only Code/Data (#202)', () => {
    // The two assertions over large inputs carry messages: Papers.md is ~129 KB
    // and the model ~400 KB, so a bare toContain/not.toContain prints the whole
    // thing on failure and buries the one line saying what to do about it. The
    // codeUrl/dataUrl checks below are small and self-describing, so they don't.
    const src = readFileSync(PAPERS_MD_PATH, 'utf8');
    expect(
      src.includes(`> **Correction**: https://doi.org/${CORRECTION_DOI}`),
      "ref 289 no longer carries its correction blockquote, so the rest of this test proves nothing: either restore it, or retire this guard and the post-publication-notice paragraphs in CLAUDE.md and CONTRIBUTING.md with it",
    ).toBe(true);

    // Checked before dereferencing: the assertion above only proves the notice
    // line is somewhere in Papers.md, not that it still belongs to 289. If 289
    // were retired while the string survived elsewhere, a bare `!` would throw
    // "cannot read properties of undefined" and none of the guidance messages
    // written into this test would ever print.
    const ref289 = model.references.find((r) => r.id === 289);
    expect(ref289, 'ref 289 is gone from Papers.md; retire this guard and the post-publication-notice paragraphs in CLAUDE.md and CONTRIBUTING.md with it').toBeDefined();

    expect(ref289!.codeUrl).toBe('https://github.com/faezesarlakifar/AllerTrans');
    expect(ref289!.dataUrl).toBeNull();

    // Searched over the whole model, not just ref 289, so a sibling structure (a
    // notices map keyed by ref id) trips it too.
    //
    // `raw` is deliberately KEPT in the search. Blanking it would open a blind
    // spot in the exact claim this guard exists to pin: the Explorer renders the
    // citation from `raw`, so a #202 that folds the notice in there would reach
    // api/papers.json and the card while this stayed green and both paragraphs
    // went silently false. What is excluded instead is narrower and cannot hide
    // that: a reference whose OWN doi is the correction, which is the only
    // legitimate way the string belongs in the model (someone one day giving the
    // notice its own numbered entry).
    // Compared through doiKey, not as a raw string: parseApa preserves the
    // source case, so a differently-cased entry for the same DOI would slip the
    // filter and fail here with a message announcing that #202 had landed when
    // nothing of the sort had. That is the misdirection this guard was already
    // corrected for once.
    const searchable = JSON.stringify({
      ...model,
      references: model.references.filter((r) => doiKey(r.doi) !== CORRECTION_DOI),
    });
    // Searches for the article-id suffix, not the full DOI, so a fix that
    // surfaces the notice as a publisher URL trips it too — that URL carries
    // `bpaf076` but not `10.1093/biomethods/bpaf076`. Safe against a false
    // positive from ref 289's own citation, which carries bpaf040.
    //
    // Lowercased on this side too: routing only the exclusion through doiKey
    // and leaving the detection case-sensitive would reintroduce the same bug
    // on the opposite side.
    expect(
      searchable.toLowerCase().includes(CORRECTION_ARTICLE_ID),
      "ref 289's correction reached the parsed model: #202 has landed, so rewrite the post-publication-notice paragraphs in CLAUDE.md and CONTRIBUTING.md",
    ).toBe(false);
  });


  it('validates against the schema', () => {
    expect(PapersDataSchema.safeParse(model).success).toBe(true);
  });
});
