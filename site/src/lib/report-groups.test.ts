import { describe, it, expect } from 'vitest';
import { assertUniqueAnchors, reportGroups, reportSections, seriesAnchor } from './report-groups';

describe('seriesAnchor', () => {
  it('namespaces a recurring series by its slug', () => {
    expect(seriesAnchor({ id: 'report:gfi-soti-cm-2026', seriesSlug: 'gfi-soti-cultivated-meat' }))
      .toBe('series-gfi-soti-cultivated-meat');
  });

  it('keeps the live one-off anchor format (bookmarks depend on it)', () => {
    expect(seriesAnchor({ id: 'report:rethink-priorities-ai-and-cultivated-meat-2026', seriesSlug: null }))
      .toBe('series-report-rethink-priorities-ai-and-cultivated-meat-2026');
  });

  it('rejects a series slug in the one-off namespace instead of colliding', () => {
    // Without the guard this would equal the one-off anchor for report:x.
    expect(() => seriesAnchor({ id: 'report:a', seriesSlug: 'report-x' })).toThrow(/report-/);
    expect(() => seriesAnchor({ id: 'report:a', seriesSlug: 'Report_X' })).toThrow(/report-/);
  });

  it('rejects a series slug that slugifies to nothing, which would give "series-"', () => {
    expect(() => seriesAnchor({ id: 'report:a', seriesSlug: '--' })).toThrow(/slugifies to nothing/);
  });

  it('rejects an empty series slug, which would merge unrelated reports', () => {
    expect(() => seriesAnchor({ id: 'report:a', seriesSlug: '' })).toThrow(/empty seriesSlug/);
  });
});

describe('assertUniqueAnchors', () => {
  it('throws when two series fold to one anchor', () => {
    expect(() => assertUniqueAnchors([{ slug: 'series-a-b' }, { slug: 'series-a-b' }])).toThrow(/duplicate/);
  });
  it('passes distinct anchors', () => {
    expect(() => assertUniqueAnchors([{ slug: 'series-a' }, { slug: 'series-b' }])).not.toThrow();
  });
});

describe('reportGroups over the committed data', () => {
  it('builds without tripping either guard', () => {
    expect(reportSections().length).toBeGreaterThan(0);
  });

  it('strips the edition label from every series name', () => {
    for (const g of reportGroups()) {
      expect(g.label.endsWith(` ${g.current.editionLabel}`), g.current.title).toBe(false);
      expect(g.label.length).toBeGreaterThan(0);
    }
  });
});
