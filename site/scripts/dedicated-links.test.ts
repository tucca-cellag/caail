import { describe, it, expect } from 'vitest';
import { dedicatedLink } from './dedicated-links.ts';
import { githubSlug, siteSlug } from '../src/lib/heading-slug.ts';
import { buildTalksModel } from './parser/talks.js';

describe('githubSlug', () => {
  // Expected values are the anchors GitHub renders for these Talks.md headings.
  it('matches GitHub for punctuation-heavy headings', () => {
    expect(githubSlug('AI Agents & Foundation Models for Biology')).toBe('ai-agents--foundation-models-for-biology');
    expect(githubSlug('Applied AI/ML for Cellular Agriculture')).toBe('applied-aiml-for-cellular-agriculture');
  });
});

describe('dedicatedLink', () => {
  it('resolves a bare link to its route', () => {
    expect(dedicatedLink('FieldReports.md')).toBe('/field-reports/');
    expect(dedicatedLink('Papers.md')).toBe('/papers/explorer/');
  });

  it('returns undefined for a file with no dedicated route', () => {
    expect(dedicatedLink('OtherResources.md')).toBeUndefined();
  });

  it('refuses an anchor the route cannot be shown to render', () => {
    expect(dedicatedLink('Papers.md', '50')).toBeUndefined();
    expect(dedicatedLink('Software.md', 'causalbench')).toBeUndefined();
    expect(dedicatedLink('Talks.md', 'no-such-section')).toBeUndefined();
  });

  it('translates a GitHub Talks anchor to the id /talks/ renders, and accepts the site id', () => {
    expect(dedicatedLink('Talks.md', 'ai-agents--foundation-models-for-biology'))
      .toBe('/talks/#ai-agents-foundation-models-for-biology');
    expect(dedicatedLink('Talks.md', 'applied-ai-ml-for-cellular-agriculture'))
      .toBe('/talks/#applied-ai-ml-for-cellular-agriculture');
  });

  it('resolves every Talks section from its GitHub anchor', () => {
    // TalksList renders <h2 id={slug(heading)}> for each parsed section.
    const sections = buildTalksModel().sections;
    expect(sections.length).toBeGreaterThan(0);
    for (const { heading } of sections) {
      expect(dedicatedLink('Talks.md', githubSlug(heading)), heading).toBe(`/talks/#${siteSlug(heading)}`);
    }
  });
});
