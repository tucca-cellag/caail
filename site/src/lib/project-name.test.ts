import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The hero eyebrow spells out what CAAIL stands for, and that expansion is a
 * hand-typed copy of a string whose source of truth is `CITATION.cff`.
 *
 * `CLAUDE.md` names this repo's most expensive recurring defect: a hand-typed
 * fact sitting next to a machine-derived one with nothing checking they agree.
 * Its prescribed fix is one of exactly two things — derive the value, or add a
 * check that fails when the two disagree — and it is explicit that a comment
 * saying "keep these in sync" documents the risk without mitigating it.
 *
 * Deriving it at build time was the other option and was not taken: the eyebrow
 * is one short string in a presentational component, and threading a build-time
 * read of a repo-root YAML file into it costs more than it saves. So: a check.
 *
 * What this guards, precisely: that the hero eyebrow agrees with the citation
 * record. Bump `CITATION.cff` for a new release and this fails until the hero
 * follows.
 *
 * What it does NOT guard, stated so nobody reads more assurance into it than is
 * here: the same expansion is also written out in `README.md`, `llms.txt`,
 * `site.webmanifest`, `scripts/favicons.mjs`, `src/content/docs/index.mdx` and
 * `astro.config.mjs`. Those copies remain unchecked. This test was added with
 * the hero copy that introduced one more of them, and widening it to the whole
 * set is worth doing separately rather than smuggling into a copy change.
 */

// src/lib -> src -> site -> repo root
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

/** The `title:` value from CITATION.cff, e.g. `CAAIL: Cellular Agriculture AI Library`. */
function citationTitle(): string {
  const cff = read('CITATION.cff');
  const m = cff.match(/^title:\s*"([^"]+)"\s*$/m);
  if (!m) throw new Error('CITATION.cff has no quoted top-level `title:` — this guard cannot run');
  return m[1];
}

/** The rendered text of the hero's `.eyebrow`, e.g. `CAAIL · Cellular Agriculture AI Library`. */
function heroEyebrow(): string {
  const hero = read('site/src/components/Hero.astro');
  const m = hero.match(/<p class="eyebrow">([^<]+)<\/p>/);
  if (!m) throw new Error('Hero.astro has no `.eyebrow` paragraph — this guard cannot run');
  return m[1].trim();
}

describe('the hero eyebrow agrees with the citation record', () => {
  it('expands the acronym exactly as CITATION.cff titles the work', () => {
    // "CAAIL: Cellular Agriculture AI Library" -> "Cellular Agriculture AI Library"
    const expansion = citationTitle().replace(/^CAAIL:\s*/, '');
    expect(expansion, 'CITATION.cff title should be "CAAIL: <expansion>"').not.toBe(
      citationTitle(),
    );
    expect(heroEyebrow()).toBe(`CAAIL · ${expansion}`);
  });

  it('fails loudly rather than silently if either source is restructured', () => {
    expect(() => citationTitle()).not.toThrow();
    expect(() => heroEyebrow()).not.toThrow();
  });
});
