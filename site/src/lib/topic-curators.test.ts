import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import topicsData from '../content/data/topics.json';
import { curatorFor, curatorCoverage, LEAD_GUARANTEE, LEAD_ASK, leadCoverageLine } from './topic-curators';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * `topic-curators.ts` says its details "are taken from CITATION.cff … rather than retyped
 * here". That was true of how they were written and false of what enforced it: the name,
 * affiliation and ORCID are literals, and nothing compared them to anything.
 *
 * The failure is silent and it is about a real person. Rotate an ORCID in CITATION.cff and
 * the site keeps crediting the old identifier, with no build error, no test failure, and
 * nothing on the page that looks wrong. That is the repo's named costliest defect class —
 * a hand-typed fact beside the machine-readable one it claims to mirror — so it gets the
 * check the class demands rather than another comment promising the two agree.
 *
 * A containment check, not a YAML parse. The repo ships no YAML parser, and containment is
 * enough: it catches the case that matters (the record of record changed, this file did
 * not) without adding a dependency to assert a five-line fact.
 */
const CITATION = readFileSync(join(REPO_ROOT, 'CITATION.cff'), 'utf-8');

/**
 * CITATION.cff split into one text block per named author.
 *
 * Matching against the whole file only proves a token appears SOMEWHERE in it, which is
 * not the property that matters. Pairing is: giving `ai-methods-tooling` Bromberg's name
 * and Kaplan's ORCID passes a whole-file check, both tokens being present, while the site
 * credits the wrong person — the precise failure this suite exists to prevent, surviving
 * the test written to prevent it. Requiring the name and the identifier to appear in the
 * SAME author block closes that.
 */
const AUTHOR_BLOCKS = CITATION.split(/^\s*-\s+family-names:/m).slice(1);

const themeSlugs = (topicsData.themes as { slug: string }[]).map((t) => t.slug);
const held = themeSlugs
  .map((slug) => ({ slug, curator: curatorFor(slug) }))
  .filter((e): e is { slug: string; curator: NonNullable<ReturnType<typeof curatorFor>> } => e.curator !== null);

describe('topic curators are consistent with CITATION.cff', () => {
  it('has at least one lead, or these checks assert nothing', () => {
    // Guards the suite itself: every assertion below iterates `held`, so an empty map
    // would make this file pass while testing nothing at all.
    expect(held.length).toBeGreaterThan(0);
  });

  it.each(held)('$slug: name and ORCID belong to ONE author in CITATION.cff', ({ curator }) => {
    // Names are recorded as `family-names` / `given-names`, so the parts are checked
    // rather than a display form CITATION.cff never stores as one string. The block must
    // satisfy every part AND the identifier together, so a name paired with somebody
    // else's ORCID has no block that matches and fails here.
    const parts = curator.name.split(/\s+/).filter(Boolean);
    const matching = AUTHOR_BLOCKS.filter(
      (b) => parts.every((p) => b.includes(p)) && (!curator.url || b.includes(curator.url)),
    );
    expect(
      matching.length,
      `no single CITATION.cff author has both "${curator.name}" and ${curator.url ?? '(no identifier)'}. ` +
        `Either the name and the identifier belong to different people, or CITATION.cff moved and ` +
        `this file did not. Rotate both or neither.`,
    ).toBe(1);
  });
});

describe('curatorCoverage', () => {
  it('counts against the live theme list, not a fixed number', () => {
    const { held: h, open, total } = curatorCoverage();
    expect(total).toBe(themeSlugs.length);
    expect(h + open).toBe(total);
    expect(h).toBe(held.length);
  });

  it('phrases the headline from those figures', () => {
    const { open, total } = curatorCoverage();
    expect(leadCoverageLine()).toBe(`${open} of the ${total} themes have no lead.`);
  });
});

describe('the shared recruitment copy', () => {
  it('states the limit that keeps a name from reading as an endorsement', () => {
    // Pinned because it is the sentence that makes crediting someone safe while the
    // placements inside their theme are still being re-verified. Both surfaces render it
    // from this constant, so this one assertion now covers both.
    expect(LEAD_GUARANTEE).toContain('not a guarantee that every entry in it is right');
  });

  it('does not promise terms that have not been agreed', () => {
    expect(LEAD_ASK).toContain('still being worked out');
  });
});
