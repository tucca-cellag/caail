/**
 * curation-page.test.ts — keeps `/curation/`'s hand-written numbers honest.
 *
 * WHY THIS FILE EXISTS, AND WHY THE PAGE IS NOT JUST INTERPOLATED INSTEAD.
 *
 * `site/src/content/docs/curation.mdx` publishes counts that several other things in this
 * repo already know: the corpus totals live in `papers.json`, the topic-lead coverage lives
 * in `curatorCoverage()`, and the agent-API scope caveat lives in `SCOPE_NOTE`. That is
 * CLAUDE.md's named costliest defect — a hand-typed fact beside a machine-derived one — and
 * its stated remedy is one of two things: derive the value, or add a check that fails when
 * the two disagree.
 *
 * Deriving it was tried first and was WRONG HERE, for a reason specific to this page.
 * `scripts/parser/llms-full.ts` inlines each source file's RAW BYTES into `llms-full.txt`;
 * it does not render them. So `{corpus.all}` rendered as `345` on the website and shipped
 * to agents, verbatim, as the four characters `{cor` … — the figures the page exists to
 * publish reached the audience most likely to act on them as unevaluated source code. The
 * site looked perfect the whole time. Round 2 of the review caught it; round 1 introduced
 * it while fixing the drift this file now guards.
 *
 * So the page holds literal numbers, and this is the check. Adding a paper fails
 * `corpus totals`, which is intended: the page's coverage claim genuinely goes stale when
 * the corpus moves, and a failure naming that is the only thing that will make anyone
 * re-run the extraction.
 *
 * THE SNAPSHOT FIGURES ARE DELIBERATELY NOT CHECKED AGAINST A LIVE SOURCE. `docling-corpus/`
 * is gitignored and local, so nothing in CI can recompute 226 / 204 / 22. They are checked
 * for internal consistency (the parts sum to the denominator) and against the second copy
 * of the same run in the extraction skill's README, which is the only other place they
 * appear. That is the contradiction the README paragraph warns about, now enforced.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { curatorCoverage } from '../../src/lib/topic-curators.js';
import { MATRIX_SECTION, SCOPE_NOTE } from './agent-api.js';
import { buildLlmsFullText, splitFrontmatter } from './llms-full.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PAGE_REL = 'site/src/content/docs/curation.mdx';
const README_REL = '.claude/skills/matrix-classification-audit/README.md';

const page = readFileSync(join(REPO_ROOT, PAGE_REL), 'utf-8');
const skillReadme = readFileSync(join(REPO_ROOT, README_REL), 'utf-8');
const papers = JSON.parse(
  readFileSync(join(REPO_ROOT, 'site/src/content/data/papers.json'), 'utf-8'),
) as { references: { section: string }[] };

/** First capture group of `re` against the page, or a failing message naming what is missing. */
function grab(source: string, re: RegExp, what: string): string {
  const m = source.match(re);
  expect(m, `${what}: no match for ${re} — the sentence was reworded, so this guard is now blind`).toBeTruthy();
  return m![1];
}

/**
 * `grab` a figure and parse it as a number, thousands separators included.
 *
 * NOT `Number(grab(...))`, which is what this was and which is a guard that disables itself
 * at exactly the size where it starts to matter. `Number('1,226')` is `NaN`, `toBe` is
 * `Object.is`, and `Object.is(NaN, NaN)` is TRUE — so once any figure here crosses a
 * thousand and is written with the comma the `[\d,]+` class exists to permit, every
 * `expect(a + b).toBe(c)` below would pass by comparing NaN to NaN while the table no
 * longer added up. The `isFinite` assertion is the part that cannot silently rot.
 *
 * Deliberately NOT a `typeof` check, which is the obvious-looking version and is useless:
 * `typeof NaN` is `'number'`, so it passes on precisely the value it would be there to
 * reject.
 */
function num(source: string, re: RegExp, what: string): number {
  const parsed = Number(grab(source, re, what).replace(/,/g, ''));
  expect(
    Number.isFinite(parsed),
    `${what}: parsed to ${parsed}, so every comparison against it would pass vacuously`,
  ).toBe(true);
  return parsed;
}

describe('curation page: numbers that another source already knows', () => {
  it('corpus totals match papers.json', () => {
    const all = papers.references.length;
    const matrix = papers.references.filter((r) => r.section === MATRIX_SECTION).length;

    expect(num(page, /holds ([\d,]+) references/, 'total references')).toBe(all);
    expect(num(page, /([\d,]+) are primary research/, 'matrix references')).toBe(matrix);
    expect(num(page, /The other ([\d,]+) are reviews/, 'non-matrix references')).toBe(all - matrix);
  });

  it('topic-lead coverage matches curatorCoverage()', () => {
    const { held, open, total } = curatorCoverage();

    // Stage table + section 3 + roadmap: THREE places state the theme total. Asserted as an
    // exact count, not `>= 2`, which is what this was: at `>= 2` the roadmap's copy could be
    // deleted or reworded and the loop below would still pass over the survivors, so the page
    // would quietly stop committing to a number in one of the three places it is claimed.
    const totals = [...page.matchAll(/all (\d+) subject themes/g)].map((m) => Number(m[1]));
    expect(totals, 'a copy of the theme total was removed or reworded').toHaveLength(3);
    for (const t of totals) expect(t).toBe(total);

    expect(num(page, /Two people covering (\d+) themes/, 'section 3 lede')).toBe(total);
    expect(grab(page, /(\d+ of the \d+) themes has a lead/, 'held count')).toBe(
      `${held} of the ${total}`,
    );
    expect(grab(page, /(\d+) of the \d+ have no lead/, 'tip aside open count')).toBe(String(open));
    expect(grab(page, /(\d+) of the \d+ subject themes have no lead/, 'section 7 ask')).toBe(
      String(open),
    );
  });

  it('quotes SCOPE_NOTE verbatim, capitalisation included', () => {
    // The page attributes this to the agent API in quotation marks. `INDEXED` is caps in the
    // constant, where the capitalisation IS the emphasis; a draft quoted it lowercased.
    expect(page).toContain(SCOPE_NOTE);
  });
});

describe('curation page: the local-corpus snapshot', () => {
  const bounded = () => num(page, /Read a bounded methods section \| ([\d,]+)/, 'bounded');
  const explicit = () =>
    num(page, /located from an explicit methods heading \| ([\d,]+)/, 'explicit');
  const positional = () =>
    num(page, /between the introduction and the first results heading \| ([\d,]+)/, 'positional');
  const noSection = () =>
    num(page, /holds it in a supplement we do not have \| (\d+)/, 'no methods section');
  const noPdf = () => num(page, /PDF not held \| (\d+)/, 'no PDF');

  it('the published percentage matches the count printed beside it', () => {
    // `| Read a bounded methods section | 226 (99%) |` — the 226 is checked against the
    // README and the denominator; the `(99%)` was checked by nothing, because the capture
    // stops at the digits. A re-ingest that moves the count and leaves the percentage passes
    // every other guard in this file and publishes a figure contradicting its own numerator.
    const denominator = num(page, /Of the ([\d,]+) matrix references held at that date/, 'denominator');
    const pct = num(page, /Read a bounded methods section \| [\d,]+ \((\d+)%\)/, 'bounded pct');
    expect(
      pct,
      `page says ${pct}% but ${bounded()} of ${denominator} is ` +
        `${Math.round((bounded() / denominator) * 100)}%`,
    ).toBe(Math.round((bounded() / denominator) * 100));
  });

  it('the table sums to its own stated denominator', () => {
    // The denominator is frozen and dated ("Of those N matrix references, as at that date"),
    // NOT derived. A derived denominator over typed rows is the same defect inverted: add one
    // paper and the page reads "Of those 230" above rows summing to 229, with 226 becoming a
    // percentage of the wrong base.
    const denominator = num(page, /Of the ([\d,]+) matrix references held at that date/, 'denominator');
    // NOTE THE TWO POPULATIONS, because a failure here reads like a transcription slip and may
    // not be one. `explicit` and `positional` are strategy counts over every located section;
    // `bounded` is the count at or above 400 characters. They are equal today only because no
    // section is located-but-short. The first one that is makes this fail legitimately, and the
    // fix is to reword the table rather than to "correct" a number.
    expect(
      explicit() + positional(),
      'strategy counts no longer sum to the usable count: a section is located but under 400 ' +
        'characters, so the table needs rewording rather than a corrected figure',
    ).toBe(bounded());
    expect(bounded() + noSection() + noPdf()).toBe(denominator);
  });

  it('agrees with the same run as transcribed in the extraction skill README', () => {
    // The one place these figures appear twice. The README paragraph beside them says a figure
    // edited in one place and not the other is a contradiction CAAIL ships in both directions;
    // this is what makes that statement true rather than aspirational.
    const r = (re: RegExp, what: string) => num(skillReadme, re, `README ${what}`);

    expect(r(/(\d+) located from an explicit methods/, 'explicit')).toBe(explicit());
    expect(r(/and (\d+) from the introduction-to-results span/, 'positional')).toBe(positional());
    expect(r(/(\d+) usable at 400 characters/, 'usable')).toBe(bounded());
    expect(r(/\*\*Unresolved, matrix-participating: (\d+)\*\*/, 'unresolved')).toBe(noSection());

    for (const stat of ['13,206', '114,066']) {
      expect(page, `page lost the ${stat} figure`).toContain(stat);
      expect(skillReadme, `README lost the ${stat} figure`).toContain(stat);
    }

    // The README states two figures the page does not, so nothing else can check them.
    // `228 sections` is the one that reads as a transcription error on its face — 204 + 22
    // is 226, and the gap is the 2 unresolved, stated a paragraph later — so it is exactly
    // the number someone would "correct". Pinned to the arithmetic that makes it right.
    const sections = num(skillReadme, /At that date: ([\d,]+) sections/, 'README sections');
    expect(
      sections,
      'README `N sections` no longer equals located + unresolved; one of the three moved',
    ).toBe(explicit() + positional() + noSection());
    // `124 exceed the old window` is checked only for presence and internal plausibility:
    // nothing in the repo can recompute it, but it cannot exceed the usable count.
    const over = num(skillReadme, /of which ([\d,]+) exceed the old/, 'README over-window');
    expect(over).toBeGreaterThan(0);
    expect(over, 'more sections exceed the old window than are usable at all').toBeLessThanOrEqual(bounded());

    const date = grab(page, /\*\*Measured (\d{4}-\d{2}-\d{2})\.\*\*/, 'page snapshot date');
    expect(skillReadme, 'the two snapshots claim different dates').toContain(
      `snapshot dated ${date}`,
    );
  });
});

describe('ref 51: the page-count figure that exists in five places', () => {
  // 22-of-43 is stated on the public page and in four files in the extraction skill, and
  // until this check nothing compared them. It was 34 in all five for weeks, silently, which
  // is the drift this repo names as its costliest defect — five copies is simply five chances
  // to fix one and miss four.
  //
  // WHY THE COMMITTED FIXTURE APPEARS TO SAY 34, which is presumably where the wrong value
  // came from and is the trap for whoever checks this next: testdata/headings.json holds
  // HEADINGS, not pages. Ref 51's last heading (`References`) is on page 34; the document
  // runs to 43. The fixture has no `n_pages` field and cannot have one, because the page
  // count lives in the gitignored converted corpus. So the fixture is not evidence for this
  // figure in either direction — measure it with docling_ingest.py, do not infer it here.
  const SOURCES = [
    PAGE_REL,
    README_REL,
    '.claude/skills/matrix-classification-audit/docling_sections.py',
    '.claude/skills/matrix-classification-audit/docling_sections.test.py',
    '.claude/skills/matrix-classification-audit/extract_matrix_corpus.py',
  ];

  it('states the same page and total everywhere it appears', () => {
    // matchAll, not exec. The guard's own rationale is that five copies is five chances to fix
    // one and miss four; WITHIN a file the same arithmetic applies, and extract_matrix_corpus.py
    // is 21 KB of docstrings that could easily gain a second statement of the figure.
    const seen = SOURCES.flatMap((rel) => {
      const text = readFileSync(join(REPO_ROOT, rel), 'utf-8').replace(/\s+/g, ' ');
      const hits = [...text.matchAll(/page 22 of\s+(\d+)/g)];
      expect(
        hits.length,
        `${rel} no longer states ref 51's page range, so this guard is blind to it`,
      ).toBeGreaterThanOrEqual(1);
      return hits.map((m) => ({ rel, total: Number(m[1]) }));
    });
    const totals = [...new Set(seen.map((x) => x.total))];
    expect(
      totals,
      `ref 51's page total disagrees across copies: ${seen.map((x) => `${x.rel}=${x.total}`).join(', ')}`,
    ).toHaveLength(1);
  });
});

describe('curation page: what reaches an agent', () => {
  it('contributes no brace to llms-full.txt, so no expression can reach an agent unevaluated', () => {
    // THE REGRESSION THIS WHOLE FILE IS NAMED FOR. `llms-full.ts` concatenates raw bytes, so
    // ANY JSX expression in this page ships to agents unevaluated. Asserted on the built
    // artifact rather than on the source, because the source is only half the contract.
    //
    // NO BRACE AT ALL, rather than a pattern for what an interpolation looks like. The first
    // version matched `{ident.field}` and `{ident}`, which are the shapes the defect happened
    // to take — and missed `{curatorCoverage().open}`, which is the shape the NEXT one would
    // take, since the theme counts are exactly what a later edit would derive. A guard that
    // enumerates spellings loses to the spelling nobody enumerated. This page needs no brace
    // for any purpose, so the categorical rule is both stronger and simpler to keep true.
    // If a future edit genuinely needs one, it needs a Markdown source for this list instead.
    // Computed, NOT read from site/public/llms-full.txt. Reading the artifact validates
    // whatever the last `pnpm parse` happened to write: add an expression to the page, run
    // the suite without re-parsing, and this passes on the exact regression it is named for.
    // It also ENOENTs in a checkout that has never run the parser, since that path is
    // gitignored — the fresh-worktree gotcha, dressed as a broken test. llms-full.test.ts
    // already calls the builder for the same reason.
    const llmsFull = buildLlmsFullText(REPO_ROOT);
    const marker = `# ===== ${PAGE_REL} =====`;
    const start = llmsFull.indexOf(marker);
    expect(start, `${PAGE_REL} is not in llms-full.txt at all`).toBeGreaterThan(-1);

    const nextSection = llmsFull.indexOf('\n# ===== ', start + marker.length);
    const section = llmsFull.slice(start, nextSection === -1 ? undefined : nextSection);

    const braces = section.match(/[{}]/g) ?? [];
    expect(
      braces,
      'a brace reached llms-full.txt from curation.mdx — JSX and MDX comments are inlined ' +
        'raw, so agents would get source code where prose should be',
    ).toEqual([]);

    // And the figures are actually present as digits, so an empty match above cannot be
    // achieved by deleting the sentences instead of rendering them.
    expect(section).toMatch(/holds [\d,]+ references/);
    expect(section).toMatch(/[\d,]+ are primary research/);

    // The page's YAML frontmatter is stripped rather than concatenated in as body prose.
    // This is the only source in the list that has any, and an agent reading the file has
    // no way to tell `title:` from a sentence.
    expect(section).not.toContain('title: Curation Methodology');
    expect(section, 'frontmatter fence reached the agent artifact').not.toMatch(
      /^# ===== .+ =====\n\n---\n/,
    );
  });
});

describe('llms-full frontmatter splitting', () => {
  // `---` is also `<hr>` in Markdown and this runs over ~45 canonical files, so the cases that
  // must NOT strip matter more than the one that must. The third of them is the one that
  // caught a real defect: an earlier version anchored to the start and required a closing
  // fence, which passed the first two and silently deleted the intro paragraph from the third.
  // The test that shipped with that version pinned only the no-second-rule case, so it was
  // green and the docstring's claim was false. Do not remove a case here without adding one.
  const CONTENT = 'site/src/content/docs/x.mdx';
  const CANONICAL = 'Papers.md';

  it('takes a real frontmatter block from a content page, title included', () => {
    expect(splitFrontmatter('---\ntitle: X\n---\n\nBody here.', CONTENT)).toEqual({
      title: 'X',
      body: 'Body here.',
    });
    expect(
      splitFrontmatter('---\ntitle: "Quoted: with a colon"\nfoo: 1\n---\n\nB.', CONTENT).title,
    ).toBe('Quoted: with a colon');
    // A block sequence at column 0 is real Starlight frontmatter (`head:` takes one). The
    // previous YAML-shape heuristic REJECTED this, so the whole block shipped to agents.
    expect(splitFrontmatter('---\ntitle: Y\nhead:\n- tag: meta\n---\n\nB.', CONTENT)).toEqual({
      title: 'Y',
      body: 'B.',
    });
  });

  it('never touches a canonical repo-root source, whatever it contains', () => {
    // THE CASES THAT MATTER MORE THAN THE ONE ABOVE. `---` is `<hr>`, and two earlier versions
    // of this function silently deleted body text from documents shaped like these. The path
    // test makes them unreachable rather than defended-against, so they are pinned here to stop
    // anyone reintroducing a content sniff.
    for (const doc of [
      '# Heading\n\nText.\n\n---\n\nMore text.',
      '---\n\nA doc that opens with a rule.',
      '---\n\nIntro paragraph that must survive.\n\n---\n\nMore text.',
      // Survived version 1, DELETED by version 2: `Note:` reads as a YAML key.
      '---\n\nNote: this is important.\n\n---\n\nBody survives?',
      '---\n\nSummary: the point.\n\n---\n\nMore.',
      // Even a genuine-looking frontmatter block is left alone in a canonical file, because
      // canonical files do not have frontmatter and a match there means something else.
      '---\ntitle: Not frontmatter here\n---\n\nBody.',
    ]) {
      expect(splitFrontmatter(doc, CANONICAL), doc).toEqual({ title: null, body: doc });
    }
  });

  it('re-emits the title so a frontmatter page is not identified only by its path', () => {
    const full = buildLlmsFullText(REPO_ROOT);
    const at = full.indexOf(`# ===== ${PAGE_REL} =====`);
    expect(at).toBeGreaterThan(-1);
    expect(full.slice(at)).toMatch(/^# ===== [^\n]+ =====\n\n# Curation Methodology\n/);
  });
});
