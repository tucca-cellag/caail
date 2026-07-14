import { describe, it, expect } from 'vitest';
import { chipProps, topicHref } from './topic-chips';

describe('topicHref', () => {
  it('builds the param-routed hub URL, tolerant of a trailing slash in base', () => {
    expect(topicHref('/caail', 'serum-free-media')).toBe('/caail/topics/?t=serum-free-media');
    expect(topicHref('/caail/', 'serum-free-media')).toBe('/caail/topics/?t=serum-free-media');
  });
});

describe('chipProps', () => {
  it('maps each topic ref to a chip with theme + hub href', () => {
    const chips = chipProps('/caail', [{ slug: 'serum-free-media', label: 'Serum-free media', theme: 'media-growth-factors' }]);
    expect(chips).toEqual([{ slug: 'serum-free-media', label: 'Serum-free media', theme: 'media-growth-factors', href: '/caail/topics/?t=serum-free-media' }]);
  });
  it('returns [] for no topics', () => {
    expect(chipProps('/caail', [])).toEqual([]);
  });
});
