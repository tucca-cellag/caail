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
import { SCOPE_NOTE } from './agent-api.js';

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

describe('curation page: numbers that another source already knows', () => {
  it('corpus totals match papers.json', () => {
    const all = papers.references.length;
    const matrix = papers.references.filter((r) => r.section === 'References').length;

    expect(Number(grab(page, /holds ([\d,]+) references/, 'total references'))).toBe(all);
    expect(Number(grab(page, /([\d,]+) are primary research/, 'matrix references'))).toBe(matrix);
    expect(Number(grab(page, /The other ([\d,]+) are reviews/, 'non-matrix references'))).toBe(
      all - matrix,
    );
  });

  it('topic-lead coverage matches curatorCoverage()', () => {
    const { held, open, total } = curatorCoverage();

    // Stage table + section 3 + roadmap all state the theme total.
    const totals = [...page.matchAll(/all (\d+) subject themes/g)].map((m) => Number(m[1]));
    expect(totals.length, 'nobody states the theme total any more').toBeGreaterThanOrEqual(2);
    for (const t of totals) expect(t).toBe(total);

    expect(Number(grab(page, /Two people covering (\d+) themes/, 'section 3 lede'))).toBe(total);
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
  const bounded = () => Number(grab(page, /Read a bounded methods section \| ([\d,]+)/, 'bounded'));
  const explicit = () =>
    Number(grab(page, /located from an explicit methods heading \| ([\d,]+)/, 'explicit'));
  const positional = () =>
    Number(grab(page, /between the introduction and the first results heading \| ([\d,]+)/, 'positional'));
  const noSection = () =>
    Number(grab(page, /holds it in a supplement we do not have \| (\d+)/, 'no methods section'));
  const noPdf = () => Number(grab(page, /PDF not held \| (\d+)/, 'no PDF'));

  it('the table sums to its own stated denominator', () => {
    // The denominator is frozen and dated ("Of those N matrix references, as at that date"),
    // NOT derived. A derived denominator over typed rows is the same defect inverted: add one
    // paper and the page reads "Of those 230" above rows summing to 229, with 226 becoming a
    // percentage of the wrong base.
    const denominator = Number(
      grab(page, /Of those ([\d,]+) matrix references, as at that date/, 'denominator'),
    );
    expect(explicit() + positional()).toBe(bounded());
    expect(bounded() + noSection() + noPdf()).toBe(denominator);
  });

  it('agrees with the same run as transcribed in the extraction skill README', () => {
    // The one place these figures appear twice. The README paragraph beside them says a figure
    // edited in one place and not the other is a contradiction CAAIL ships in both directions;
    // this is what makes that statement true rather than aspirational.
    const r = (re: RegExp, what: string) => Number(grab(skillReadme, re, `README ${what}`));

    expect(r(/(\d+) located from an explicit methods/, 'explicit')).toBe(explicit());
    expect(r(/and (\d+) from the introduction-to-results span/, 'positional')).toBe(positional());
    expect(r(/(\d+) usable at 400 characters/, 'usable')).toBe(bounded());
    expect(r(/\*\*Unresolved, matrix-participating: (\d+)\*\*/, 'unresolved')).toBe(noSection());

    for (const stat of ['13,206', '114,066']) {
      expect(page, `page lost the ${stat} figure`).toContain(stat);
      expect(skillReadme, `README lost the ${stat} figure`).toContain(stat);
    }

    const date = grab(page, /\*\*Measured (\d{4}-\d{2}-\d{2})\.\*\*/, 'page snapshot date');
    expect(skillReadme, 'the two snapshots claim different dates').toContain(
      `snapshot dated ${date}`,
    );
  });
});

describe('curation page: what reaches an agent', () => {
  it('is in llms-full.txt as rendered prose, not as source', () => {
    // THE REGRESSION THIS WHOLE FILE IS NAMED FOR. `llms-full.ts` concatenates raw bytes, so
    // ANY JSX expression in this page ships to agents unevaluated. Asserting on the built
    // artifact rather than on the source, because the source is only half the contract.
    const llmsFull = readFileSync(join(REPO_ROOT, 'site/public/llms-full.txt'), 'utf-8');
    const marker = `# ===== ${PAGE_REL} =====`;
    const start = llmsFull.indexOf(marker);
    expect(start, `${PAGE_REL} is not in llms-full.txt at all`).toBeGreaterThan(-1);

    const nextSection = llmsFull.indexOf('\n# ===== ', start + marker.length);
    const section = llmsFull.slice(start, nextSection === -1 ? undefined : nextSection);

    // `{ident.field}` and `{ident}` — the shapes an interpolated count takes. Code spans on
    // this page are backticked identifiers (`methods_source`, `ftcache`) and match neither.
    const expressions = section.match(/\{\s*[A-Za-z_$][\w$]*(\s*\.\s*[\w$]+|\s*\})/g) ?? [];
    expect(
      expressions,
      'unevaluated JSX reached llms-full.txt — agents get source code where a number should be',
    ).toEqual([]);

    // And the figures are actually present as digits, so an empty match above cannot be
    // achieved by deleting the sentences instead of rendering them.
    expect(section).toMatch(/holds [\d,]+ references/);
    expect(section).toMatch(/[\d,]+ are primary research/);
  });
});
