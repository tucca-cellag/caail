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

  it.each(held)('$slug: the lead is a named author in CITATION.cff', ({ curator }) => {
    // Names are recorded as `family-names` / `given-names`, so check the parts rather than
    // the display form, which CITATION.cff never stores as one string.
    for (const part of curator.name.split(/\s+/).filter(Boolean)) {
      expect(CITATION, `"${part}" of "${curator.name}" is not in CITATION.cff`).toContain(part);
    }
  });

  it.each(held)('$slug: the ORCID matches the one CITATION.cff records', ({ curator }) => {
    if (!curator.url?.includes('orcid.org')) return;
    expect(
      CITATION,
      `${curator.name}'s ORCID is not the one in CITATION.cff — rotate both or neither`,
    ).toContain(curator.url);
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
