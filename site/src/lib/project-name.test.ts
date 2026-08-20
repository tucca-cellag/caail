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
 * Covered: the hero eyebrow (`Hero.astro`), and the BibTeX block in
 * `src/lib/citation.ts`, whose own docstring says to update `CITATION.cff` first
 * and mirror it there — an instruction with nothing enforcing it until now.
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
  const all = [...astro.matchAll(/<p class="eyebrow">([^<]+)<\/p>/g)];
  if (all.length !== 1) {
    // `[^<]+` cannot cross a child element, so a *present* eyebrow carrying nested
    // markup counts as 0 matches and is indistinguishable here from a deleted one.
    // That is not hypothetical: WhyCaail.astro's eyebrow already opens with a
    // `<span class="bar" aria-hidden="true">`, so giving the hero the same decoration
    // trips this. Say so, rather than sending the reader to hunt for a `<p>` that is
    // still there.
    const zero =
      all.length === 0
        ? ' (0 can also mean the eyebrow is still there but now contains nested markup, ' +
          'which this matcher cannot read — check before assuming it was deleted)'
        : '';
    throw new Error(
      `Hero.astro has ${all.length} \`.eyebrow\` paragraphs of plain text, expected ` +
        `exactly 1 — this guard cannot tell which one spells out the acronym${zero}`,
    );
  }
  return all[0][1].trim();
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
});
