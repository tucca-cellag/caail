/**
 * citation-bands.test.ts — the shared citation-count → band classifier.
 *
 * Mirrors licenses.test.ts. The point of this file is that the /citations/ hub and
 * the By the Numbers panel both call `citationBand`, so a boundary change here is a
 * change to both surfaces at once.
 */

import { describe, it, expect } from 'vitest';
import { CITATION_BANDS, BAND_META, citationBand, type CitationBand } from './citation-bands';

describe('citationBand', () => {
  it('classifies each band at its centre', () => {
    expect(citationBand(5_000)).toBe('1000plus');
    expect(citationBand(500)).toBe('100to999');
    expect(citationBand(50)).toBe('10to99');
    expect(citationBand(3)).toBe('under10');
  });

  it('puts every boundary in the higher band', () => {
    expect(citationBand(1000)).toBe('1000plus');
    expect(citationBand(999)).toBe('100to999');
    expect(citationBand(100)).toBe('100to999');
    expect(citationBand(99)).toBe('10to99');
    expect(citationBand(10)).toBe('10to99');
    expect(citationBand(9)).toBe('under10');
  });

  it('treats zero as under10, not as unbanded', () => {
    // a real 0 from OpenAlex is "indexed, never cited" — a citation level.
    // "not indexed" is represented by a null count and excluded upstream.
    expect(citationBand(0)).toBe('under10');
  });

  it('is total: a nonsensical negative count degrades rather than throwing', () => {
    expect(() => citationBand(-1)).not.toThrow();
    expect(citationBand(-1)).toBe('under10');
  });

  it('assigns every band exactly one membership across a wide sweep', () => {
    for (const n of [0, 1, 9, 10, 42, 99, 100, 500, 999, 1000, 12345]) {
      const matches = CITATION_BANDS.filter((b) => BAND_META[b].test(n));
      expect(matches).toHaveLength(1);
      expect(citationBand(n)).toBe(matches[0]);
    }
  });

  it('BAND_META is complete and ordered most-cited first', () => {
    expect(CITATION_BANDS).toEqual(['1000plus', '100to999', '10to99', 'under10']);
    for (const b of CITATION_BANDS) {
      const meta = BAND_META[b as CitationBand];
      expect(meta.label.trim()).not.toBe('');
      expect(meta.blurb.trim()).not.toBe('');
    }
  });
});
