import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dedicatedLink, sectionAnchors, SECTION_ROUTES } from './dedicated-links.ts';
import { siteSlug } from '../src/lib/heading-slug.ts';
import { githubSlug } from './github-slug.ts';
import { buildTalksModel } from './parser/talks.js';
import { buildPrimersModel, PRIMER_SOURCES, rewritePrimerUrl } from './parser/primers.js';
import { rewriteCaailLinks } from './remark/rewrite-caail-links.ts';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Root } from 'mdast';

describe('githubSlug', () => {
  // Expected values are the anchors GitHub renders for these Talks.md headings.
  it('matches GitHub for punctuation-heavy headings', () => {
    expect(githubSlug('AI Agents & Foundation Models for Biology')).toBe('ai-agents--foundation-models-for-biology');
    expect(githubSlug('Applied AI/ML for Cellular Agriculture')).toBe('applied-aiml-for-cellular-agriculture');
  });
  it('matches GitHub on Unicode number classes a hand-written rule got wrong', () => {
    // github-slugger drops subscripts, superscripts and vulgar fractions.
    expect(githubSlug('Café — CO₂')).toBe('café--co');
    expect(githubSlug('E² scaling')).toBe('e-scaling');
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
  });

  it('throws on an anchor GitHub cannot resolve, on a fully mapped route', () => {
    // Talks and the primers render one id per ## section and nothing else, so a
    // miss is a link broken at the source: fail the build.
    expect(() => dedicatedLink('Talks.md', 'no-such-section')).toThrow(/not a GitHub anchor of Talks\.md/);
    expect(() => dedicatedLink('Primers/AI.md', 'no-such-section')).toThrow(/not a GitHub anchor/);
    // The site's single-dash id works on /talks/ but is dead on GitHub, which is
    // where the canonical Markdown is read first, so it is rejected too.
    expect(() => dedicatedLink('Talks.md', 'ai-agents-foundation-models-for-biology')).toThrow(/not a GitHub anchor/);
  });

  it('translates a GitHub Talks anchor to the id /talks/ renders', () => {
    expect(dedicatedLink('Talks.md', 'ai-agents--foundation-models-for-biology'))
      .toBe('/talks/#ai-agents-foundation-models-for-biology');
    expect(dedicatedLink('Talks.md', 'applied-aiml-for-cellular-agriculture'))
      .toBe('/talks/#applied-ai-ml-for-cellular-agriculture');
  });

  it('keeps a valid anchor to a heading the route renders no id for on GitHub', () => {
    // Talks.md's H1 "Talks & Videos" is a real GitHub anchor, but /talks/ gives
    // only its ## sections ids: fall back to the blob, do not fail the build.
    expect(dedicatedLink('Talks.md', 'talks--videos')).toBeUndefined();
  });

  it('suffixes a repeated GitHub slug the way GitHub does', () => {
    // "AI/ML Talks" and "AIML Talks" both slug to aiml-talks on GitHub, which
    // anchors the second as aiml-talks-1; their site ids differ, so both link.
    const map = sectionAnchors('X.md', [
      { depth: 2, text: 'AI/ML Talks' },
      { depth: 2, text: 'AIML Talks' },
    ]);
    expect(map.get('aiml-talks')).toBe('ai-ml-talks');
    expect(map.get('aiml-talks-1')).toBe('aiml-talks');
  });

  it('skips a suffix an earlier heading already claimed, as github-slugger does', () => {
    // GitHub: Demos → demos, Demos → demos-1, "Demos 1" → demos-1 is taken → demos-1-1.
    const map = sectionAnchors('X.md', [
      { depth: 3, text: 'Demos' },
      { depth: 3, text: 'Demos' },
      { depth: 3, text: 'Demos 1' },
    ]);
    expect([...map.keys()]).toEqual(['demos', 'demos-1', 'demos-1-1']);
    // And a generated suffix skips one a heading's own text claimed earlier:
    // "Demos 1" → demos-1, Demos → demos, Demos → demos-1 is taken → demos-2.
    const skip = sectionAnchors('X.md', [
      { depth: 3, text: 'Demos 1' },
      { depth: 3, text: 'Demos' },
      { depth: 3, text: 'Demos' },
    ]);
    expect([...skip.keys()]).toEqual(['demos-1', 'demos', 'demos-2']);
  });

  it('keys a heading by GitHub\'s rendered text but targets the id the site renders', () => {
    // GitHub slugs the rendered text: inline HTML and image alt text removed, the
    // space before them kept ("Demos " → demos-). sectionsAfter keeps the HTML, so
    // TalksList renders siteSlug('Demos <img src="x.svg">').
    const root = mkdtempSync(join(tmpdir(), 'caail-dl-'));
    try {
      writeFileSync(
        join(root, 'Talks.md'),
        '# T\n\n## Demos <img src="x.svg">\n\n## Foundation models ![new](badge.svg)\n',
      );
      expect(dedicatedLink('Talks.md', 'demos-', root)).toBe(`/talks/#${siteSlug('Demos <img src="x.svg">')}`);
      expect(() => dedicatedLink('Talks.md', 'demos', root)).toThrow(/not a GitHub anchor/);
      // the site id keeps the alt text, as sectionsAfter's heading text does
      expect(dedicatedLink('Talks.md', 'foundation-models-', root)).toBe('/talks/#foundation-models-new');
      expect(() => dedicatedLink('Talks.md', 'foundation-models-new', root)).toThrow(/not a GitHub anchor/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts anchors GitHub resolves beyond top-level headings', () => {
    // A heading nested in a list, and an explicit <a id>: valid on GitHub, no site
    // id on /talks/, so they keep the blob rather than failing the build.
    const root = mkdtempSync(join(tmpdir(), 'caail-dl-'));
    try {
      writeFileSync(
        join(root, 'Talks.md'),
        '# T\n\n## Real\n\n- item\n\n  ## Nested\n\n<a id="featured"></a>\n\n<span data-id="decoy"></span>\n',
      );
      // a nested ## is a GitHub anchor but not a rendered section: blob, not a dead site id
      expect(dedicatedLink('Talks.md', 'nested', root)).toBeUndefined();
      expect(dedicatedLink('Talks.md', 'featured', root)).toBeUndefined();
      // data-id is not an anchor GitHub resolves, so it is a broken link like any other
      expect(() => dedicatedLink('Talks.md', 'decoy', root)).toThrow(/not a GitHub anchor/);
      expect(() => dedicatedLink('Talks.md', 'absent', root)).toThrow(/not a GitHub anchor/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls back to the blob when the repo root has no such file', () => {
    const root = mkdtempSync(join(tmpdir(), 'caail-dl-'));
    try {
      expect(dedicatedLink('Talks.md', 'anything', root)).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('checks every primer the parser builds', () => {
    // SECTION_ROUTES is kept by hand; a primer missing from it would silently lose
    // anchor checking.
    for (const { file } of PRIMER_SOURCES) expect(SECTION_ROUTES.has(file), file).toBe(true);
  });

  it('refuses two sections that would render one site id', () => {
    // Different GitHub anchors, same single-dash site id: a duplicate id on the page.
    expect(() =>
      sectionAnchors('X.md', [
        { depth: 2, text: 'AI/ML Talks' },
        { depth: 2, text: 'AI ML Talks' },
      ]),
    ).toThrow(/both render the site id "#ai-ml-talks"/);
  });

  it('reads headings from the repo root it is given', () => {
    const root = mkdtempSync(join(tmpdir(), 'caail-dl-'));
    try {
      writeFileSync(join(root, 'Talks.md'), '# T\n\n## Fixture Only Section\n');
      expect(dedicatedLink('Talks.md', 'fixture-only-section', root)).toBe('/talks/#fixture-only-section');
      expect(() => dedicatedLink('Talks.md', 'ai-agents--foundation-models-for-biology', root)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('matches anchors the way GitHub does: case-insensitive and percent-decoded', () => {
    expect(dedicatedLink('Talks.md', 'Applied-AIML-for-Cellular-Agriculture'))
      .toBe('/talks/#applied-ai-ml-for-cellular-agriculture');
    expect(dedicatedLink('Talks.md', 'applied-aiml-for-cellular%2Dagriculture'))
      .toBe('/talks/#applied-ai-ml-for-cellular-agriculture');
  });

  it('resolves every primer section from its GitHub anchor, as an on-site link', () => {
    // PrimerHub renders <section id={slug(heading)}> for each parsed section. The
    // map reads the files' ## headings directly (primers.ts imports this module),
    // so this pins the two to the same set.
    const files = { 'cell-ag': 'Primers/CellAg.md', ai: 'Primers/AI.md' } as const;
    for (const primer of buildPrimersModel().primers) {
      const file = files[primer.slug as keyof typeof files];
      for (const { heading } of primer.sections) {
        expect(dedicatedLink(file, githubSlug(heading)), heading)
          .toBe(`/primers/${primer.slug}/#${siteSlug(heading)}`);
      }
    }
    // a sibling-primer deep link stays internal rather than becoming a blob
    const first = buildPrimersModel().primers.find((p) => p.slug === 'ai')!.sections[0].heading;
    expect(rewritePrimerUrl(`./AI.md#${githubSlug(first)}`, 'Primers')).toEqual({
      url: `/caail/primers/ai/#${siteSlug(first)}`,
      internal: true,
    });
    // a same-page link to a real heading the hub gives no id (the H1) → its GitHub view
    expect(rewritePrimerUrl('#ai-for-cell-ag-researchers', 'Primers', { sourceFile: 'Primers/AI.md' })).toEqual({
      url: 'https://github.com/tucca-cellag/caail/blob/main/Primers/AI.md#ai-for-cell-ag-researchers',
      internal: false,
    });
    // a bare "#" stays a no-op, not a jump to the site root
    expect(rewritePrimerUrl('#', 'Primers', { sourceFile: 'Primers/AI.md' })).toEqual({ url: '#', internal: true });
    // a same-page fragment in GitHub form is translated to the id PrimerHub renders
    expect(rewritePrimerUrl(`#${githubSlug(first)}`, 'Primers', { sourceFile: 'Primers/AI.md' })).toEqual({
      url: `#${siteSlug(first)}`,
      internal: true,
    });
  });

  it('names the file holding a bad link, not just the file it points at', () => {
    const tree = unified().use(remarkParse).parse('[x](./Talks.md#no-such-section)') as Root;
    expect(() => rewriteCaailLinks({ base: '/caail', sourcePath: 'Software.md' })(tree)).toThrow(
      /^Software\.md: .*Talks\.md#no-such-section/,
    );
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
