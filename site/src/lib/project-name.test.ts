import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * How the work is titled is written out by hand in several places. `CITATION.cff`
 * is the source of truth; this fails when a copy drifts from it.
 *
 * `CLAUDE.md` names this repo's most expensive recurring defect: a hand-typed fact
 * beside a machine-derived one with nothing checking they agree. Its prescribed fix
 * is one of exactly two things — derive the value, or add a check — and it is
 * explicit that a comment saying "keep these in sync" documents the risk without
 * mitigating it. This is the check.
 *
 * Covered: the hero eyebrow (`Hero.astro`); the BibTeX block in
 * `src/lib/citation.ts`, whose own docstring says to update `CITATION.cff` first
 * and mirror it there — an instruction with nothing enforcing it until now; and
 * the APA line in `content/docs/cite.mdx`.
 *
 * The APA line is here for a sharper reason than the other two. It and the BibTeX
 * block render side by side on `/cite/`, so pinning one without the other would
 * make a retitle worse than doing nothing: the page would show two citations that
 * disagree about the name of the work, which is harder to notice, and harder to
 * trust, than two that are equally out of date.
 *
 * NOT covered, and deliberately not enumerated: the expansion appears in several
 * other files too. An earlier draft of this docstring listed them, and the list was
 * already missing `citation.ts` on the day it was written — a hand-typed inventory
 * of hand-typed copies, in a file whose whole thesis is that those drift. Rather
 * than maintain it, the rule is: if you add a copy, add it here.
 *
 * These read **source text, not rendered output**. Writing the separator or any
 * part of the expansion as an HTML entity will fail this guard on a page that
 * renders correctly. That is the intended trade: source is what a person edits.
 */

// src/lib -> src -> site -> repo root
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

/** The `title:` value from CITATION.cff, e.g. `CAAIL: Cellular Agriculture AI Library`. */
export function parseCitationTitle(cff: string): string {
  const m = cff.match(/^title:\s*"([^"]+)"\s*$/m);
  if (!m) throw new Error('CITATION.cff has no quoted top-level `title:` — this guard cannot run');
  return m[1];
}

/**
 * The hero eyebrow's source text, e.g. `CAAIL · Cellular Agriculture AI Library`.
 *
 * Requires exactly one `.eyebrow` paragraph. Taking the first match would silently
 * check the wrong element if one were added above it, which is a passing guard on a
 * drifting page — the failure mode this file exists to prevent.
 */
export function parseHeroEyebrow(astro: string): string {
  // Match any single-`class`-attribute <p> and test the class LIST, rather than
  // hardcoding `class="eyebrow"`. Pinning the attribute exactly made every second
  // class a silent zero-match — `class="eyebrow sr"` would have read as a deleted
  // eyebrow — and this repo wraps homepage section heads in `.sr` already
  // (WhyCaail.astro's `<div class="hd sr">`), so that edit is one refactor away.
  const all = [...astro.matchAll(/<p class="([^"]*)">([^<]+)<\/p>/g)].filter(([, cls]) =>
    cls.split(/\s+/).includes('eyebrow'),
  );
  if (all.length !== 1) {
    // `[^<]+` cannot cross a child element, so a *present* eyebrow carrying nested
    // markup counts as 0 matches and is indistinguishable here from a deleted one.
    // That is not hypothetical: WhyCaail.astro's eyebrow already opens with a
    // `<span class="bar" aria-hidden="true">`, so giving the hero the same decoration
    // trips this. Say so, rather than sending the reader to hunt for a `<p>` that is
    // still there.
    const zero =
      all.length === 0
        ? ' (0 does NOT necessarily mean it was deleted: this matcher also misses an ' +
          'eyebrow that has gained nested markup, or whose `class` is not a single ' +
          'double-quoted attribute — check the element before assuming it is gone)'
        : '';
    throw new Error(
      `Hero.astro has ${all.length} \`.eyebrow\` paragraphs of plain text, expected ` +
        `exactly 1 — this guard cannot tell which one spells out the acronym${zero}`,
    );
  }
  return all[0][2].trim();
}

/**
 * The BibTeX `title` field, with brace protection stripped.
 *
 * Requires exactly one, for the same reason `parseHeroEyebrow` does: add a second
 * BibTeX block (a per-version entry, say) and a first-match parser would silently
 * check the wrong line and pass on a drifted page.
 */
export function parseBibtexTitle(ts: string): string {
  const all = [...ts.matchAll(/^\s*title\s*=\s*\{(.+)\},\s*$/gm)];
  if (all.length !== 1) {
    throw new Error(
      `citation.ts has ${all.length} BibTeX \`title = {...}\` lines, expected exactly 1 — ` +
        'this guard cannot tell which one titles the work',
    );
  }
  return all[0][1].replace(/[{}]/g, '');
}

// Named for exactly what it checks, not for the ambition behind it. An earlier title
// said the project name agreed "everywhere it is written by hand", which is the coverage
// the docstring above explicitly disclaims — and a describe string is printed on every
// run, so a green result read as "all copies agree" when it means "these two do".
/**
 * The APA title from `cite.mdx`, e.g. `CAAIL: Cellular Agriculture AI Library`.
 *
 * Anchored on the APA form itself — an italicised work title immediately followed
 * by a `(Version …)` parenthetical — rather than on "the only italics in the file",
 * which is false: there are three, and the other two are ordinary emphasis.
 */
export function parseApaTitle(mdx: string): string {
  const all = [...mdx.matchAll(/\*([^*]+)\*\s+\(Version\b/g)];
  if (all.length !== 1) {
    throw new Error(
      `cite.mdx has ${all.length} italicised titles followed by "(Version …)", expected ` +
        'exactly 1 — this guard cannot tell which one titles the work',
    );
  }
  return all[0][1];
}

describe('the hero eyebrow and the BibTeX title agree with CITATION.cff', () => {
  const title = () => parseCitationTitle(read('CITATION.cff'));

  it('the hero eyebrow expands the acronym exactly as CITATION.cff titles the work', () => {
    const expansion = title().replace(/^CAAIL:\s*/, '');
    expect(expansion, 'CITATION.cff title should read "CAAIL: <expansion>"').not.toBe(title());
    expect(parseHeroEyebrow(read('site/src/components/Hero.astro'))).toBe(`CAAIL · ${expansion}`);
  });

  it('the BibTeX title matches CITATION.cff once brace protection is stripped', () => {
    expect(parseBibtexTitle(read('site/src/lib/citation.ts'))).toBe(title());
  });

  it('the APA title on /cite/ matches the BibTeX title rendered beside it', () => {
    // /cite/ renders these two citations on one page. Pinning only the BibTeX one
    // would make a retitle WORSE than leaving both alone: CITATION.cff, the hero and
    // the BibTeX would move together while the APA line stayed put, and the page
    // would show two citations disagreeing about the name of the work. Uniformly
    // stale is recoverable; self-contradicting is not.
    expect(parseApaTitle(read('site/src/content/docs/cite.mdx'))).toBe(title());
  });
});

describe('the guard fails loudly rather than silently when a source is restructured', () => {
  it('rejects an unquoted CITATION.cff title instead of returning nothing', () => {
    expect(() => parseCitationTitle('title: CAAIL: Cellular Agriculture AI Library\n')).toThrow(
      /no quoted top-level/,
    );
  });

  it('rejects a second .eyebrow rather than silently checking the first', () => {
    const two = '<p class="eyebrow">Something else</p>\n<p class="eyebrow">CAAIL · X</p>';
    expect(() => parseHeroEyebrow(two)).toThrow(/2 `\.eyebrow` paragraphs/);
  });

  it('still finds the eyebrow when it carries a second class', () => {
    // `.sr` is this homepage's scroll-reveal hook. It sits on a wrapper today, so the
    // eyebrows are all single-class — but nothing enforces that, and an exact
    // `class="eyebrow"` match would have turned that refactor into a guard reporting
    // a deleted element.
    const withSr = '<p class="eyebrow sr">CAAIL · X</p>';
    expect(parseHeroEyebrow(withSr)).toBe('CAAIL · X');
  });

  it('says nested markup may be the cause, not only a deleted eyebrow', () => {
    // The decoration WhyCaail.astro's own eyebrow already carries. Giving the hero the
    // same one leaves the paragraph present and this matcher blind to it, so the message
    // has to name that possibility or it sends the reader after the wrong thing.
    const nested =
      '<p class="eyebrow"><span class="bar" aria-hidden="true"></span>CAAIL · X</p>';
    expect(() => parseHeroEyebrow(nested)).toThrow(/nested markup/);
  });

  it('rejects a missing BibTeX title line', () => {
    expect(() => parseBibtexTitle('export const X = `@misc{a, year = {2026},}`;')).toThrow(
      /0 BibTeX/,
    );
  });

  it('rejects a second BibTeX title rather than silently checking the first', () => {
    const two = '  title        = {{CAAIL}: A},\n  title        = {{CAAIL}: B},\n';
    expect(() => parseBibtexTitle(two)).toThrow(/2 BibTeX/);
  });

  it('ignores ordinary emphasis and reads only the APA work title', () => {
    // cite.mdx carries three italic spans; only one is the title, and it is the one
    // an APA "(Version …)" parenthetical follows.
    const mdx =
      'See *“Cite this repository”* on GitHub.\n\n' +
      'Author, A. (2026). *CAAIL: X* (Version 1.0.0). Zenodo.\n\n' +
      'Credit the *original source*.\n';
    expect(parseApaTitle(mdx)).toBe('CAAIL: X');
  });

  it('rejects an APA line whose title lost its italics', () => {
    expect(() => parseApaTitle('Author, A. (2026). CAAIL: X (Version 1.0.0).')).toThrow(
      /0 italicised titles/,
    );
  });
});
