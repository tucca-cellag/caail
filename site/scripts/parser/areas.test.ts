/**
 * areas.test.ts — tests for the research-area column registry.
 *
 * TDD: these were written before areas.ts existed.
 */

import { describe, it, expect } from 'vitest';
import { AREAS, areaKeyForLabel } from './areas';

describe('AREAS registry', () => {
  it('has exactly 6 entries', () => {
    expect(AREAS).toHaveLength(6);
  });

  it('entries are in matrix column order with correct keys and labels', () => {
    expect(AREAS).toEqual([
      { key: 'media',       label: 'Media Optimization' },
      { key: 'cell',        label: 'Cellular Engineering' },
      { key: 'bioprocess',  label: 'Bioprocess & Scale-Up' },
      { key: 'scaffolding', label: 'Scaffolding' },
      { key: 'sensory',     label: 'Sensory Prediction' },
      { key: 'tooling',     label: 'AI Tooling / Methodology' },
    ]);
  });

  it('keys exactly match the --caail-area-* CSS token names', () => {
    const expectedKeys = ['media', 'cell', 'bioprocess', 'scaffolding', 'sensory', 'tooling'];
    expect(AREAS.map((a) => a.key)).toEqual(expectedKeys);
  });
});

describe('areaKeyForLabel', () => {
  it('resolves each verbatim label to its key', () => {
    expect(areaKeyForLabel('Media Optimization')).toBe('media');
    expect(areaKeyForLabel('Cellular Engineering')).toBe('cell');
    expect(areaKeyForLabel('Bioprocess & Scale-Up')).toBe('bioprocess');
    expect(areaKeyForLabel('Scaffolding')).toBe('scaffolding');
    expect(areaKeyForLabel('Sensory Prediction')).toBe('sensory');
    expect(areaKeyForLabel('AI Tooling / Methodology')).toBe('tooling');
  });

  // CAAIL-164: the column was retired because its definition duplicated the
  // `Benchmarks & Evaluation Frameworks` method row, which survives. A stale
  // Papers.md header carrying the old label must resolve to null (and so WARN)
  // rather than silently reviving the column.
  it('returns null for the retired AI Evaluation & Benchmarking column', () => {
    expect(areaKeyForLabel('AI Evaluation & Benchmarking')).toBeNull();
  });

  it('trims surrounding whitespace before matching', () => {
    expect(areaKeyForLabel('  Media Optimization  ')).toBe('media');
  });

  it('returns null for wrong case (no case-folding)', () => {
    // 'Bioprocess & Scale-Up' is correct; 'Bioprocess & Scale-up' is not
    expect(areaKeyForLabel('Bioprocess & Scale-up')).toBeNull();
  });

  it('returns null for completely unknown labels', () => {
    expect(areaKeyForLabel('Totally Unknown Area')).toBeNull();
  });

  it('never throws on unknown input', () => {
    expect(() => areaKeyForLabel('not a real area')).not.toThrow();
  });
});
