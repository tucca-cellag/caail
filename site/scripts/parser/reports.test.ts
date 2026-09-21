/**
 * reports.test.ts (parser) — buildReportsModel folds the committed reports NDJSON into
 * the reports.json model (CAAIL-363). Reads the real committed NDJSON, so it also asserts
 * the one seeded record survives the DB -> NDJSON -> model path end to end.
 */

import { describe, it, expect } from 'vitest';
import { buildReportsModel } from './reports.js';
import { ReportsDataSchema } from './types.js';

describe('buildReportsModel', () => {
  const model = buildReportsModel();

  it('validates against ReportsDataSchema', () => {
    expect(() => ReportsDataSchema.parse(model)).not.toThrow();
  });

  it('carries the committed field-report record(s)', () => {
    expect(model.reports.length).toBeGreaterThanOrEqual(1);
    const gfi = model.reports.find((r) => r.id === 'report:gfi-state-of-the-industry');
    expect(gfi).toBeDefined();
    expect(gfi!.title).toBe('GFI State of the Industry');
    expect(gfi!.url).toBe('https://gfi.org/resource/state-of-the-industry-downloads/');
  });

  it('every record has an array of topic refs (empty is valid in the skeleton)', () => {
    for (const r of model.reports) expect(Array.isArray(r.topics)).toBe(true);
  });
});
