/**
 * Data assumptions the homepage's worked-queries band makes about the emitted API.
 *
 * These lived as `throw`s inside AskExamples.astro, which ran at build time and so were
 * only enforced while the component was mounted. It is currently unmounted (its API and
 * skill work is unfinished), which silently took the assertions with it: the corpus could
 * drift out from under it and nothing would say so until someone re-mounted it and the
 * build failed with no obvious cause.
 *
 * Keeping them here means the guarantee survives the unmount. Delete this file only when
 * the component itself is deleted, not when it is remounted.
 */
import { describe, expect, it } from 'vitest';

import matrix from '../../public/api/matrix.json';
import topicsApi from '../../public/api/topics.json';

/** Every slug AskExamples.astro looks up via its `topic()` helper. */
const REQUIRED_TOPICS = [
  'serum-free-media',
  'bioreactor-scale-up',
  'metabolic-modeling',
  'single-cell-atlases',
  'cell-line-engineering',
  'allergenicity',
];

/** The areas it needs to have something to say about. */
const REQUIRED_POPULATED_AREAS = ['scaffolding', 'bioprocess', 'media'];

describe('homepage worked-queries data assumptions', () => {
  const index = topicsApi.index as Record<string, Record<string, unknown[]>>;

  it.each(REQUIRED_TOPICS)('topic "%s" is present in topics.json', (slug) => {
    expect(index[slug], `topic "${slug}" missing from topics.json`).toBeDefined();
  });

  it.each(REQUIRED_POPULATED_AREAS)('area "%s" has at least one populated matrix cell', (area) => {
    const populated = matrix.cells.filter((c) => c.area === area && !c.emptyInCorpus);
    expect(populated.length, `no populated cells in "${area}"`).toBeGreaterThan(0);
  });

  /**
   * The band contrasts a populated cell against an empty one, so scaffolding has to supply
   * both. An area that filled up completely would break the comparison, not just thin it.
   */
  it('scaffolding still has an empty cell to contrast against', () => {
    const empty = matrix.cells.filter((c) => c.area === 'scaffolding' && c.emptyInCorpus);
    expect(empty.length, 'scaffolding has no empty cell left to contrast against').toBeGreaterThan(0);
  });
});
