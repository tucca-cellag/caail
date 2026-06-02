import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { rewriteCaailLinks } from './rewrite-caail-links.ts';
import type { Root } from 'mdast';

function urls(md: string, sourcePath: string): string[] {
  const tree = unified().use(remarkParse).parse(md) as Root;
  rewriteCaailLinks({ base: '/caail', sourcePath })(tree);
  const out: string[] = [];
  visit(tree, 'link', (n: any) => out.push(n.url));
  return out;
}

describe('rewriteCaailLinks', () => {
  it('rewrites a link to a rendered page to its site route', () => {
    expect(urls('[Pig](./Pig.md)', 'Datasets/Cow.md')).toEqual(['/caail/datasets/pig/']);
  });
  it('rewrites a ResearchAreas cross-link from a Datasets page', () => {
    expect(urls('[Bioprocess](../ResearchAreas/Bioprocess.md)', 'Datasets/Cow.md')).toEqual(['/caail/research-areas/bioprocess/']);
  });
  it('falls back to GitHub for a deferred target (Software.md) with anchor', () => {
    expect(urls('[x](../Software.md#causalbench)', 'Datasets/Cow.md'))
      .toEqual(['https://github.com/tucca-cellag/caail/blob/main/Software.md#causalbench']);
  });
  it('falls back to GitHub for a Papers.md reference anchor', () => {
    expect(urls('[ref](../Papers.md#50)', 'ResearchAreas/Bioprocess.md'))
      .toEqual(['https://github.com/tucca-cellag/caail/blob/main/Papers.md#50']);
  });
  it('falls back to GitHub for a missing file', () => {
    expect(urls('[x](./ResearchAreas/ProteinDesign.md)', 'CONTRIBUTING.md'))
      .toEqual(['https://github.com/tucca-cellag/caail/blob/main/ResearchAreas/ProteinDesign.md']);
  });
  it('leaves external links untouched', () => {
    expect(urls('[x](https://example.com/a)', 'Datasets/Cow.md')).toEqual(['https://example.com/a']);
  });
  it('leaves intra-page anchors untouched', () => {
    expect(urls('[x](#section)', 'Datasets/Cow.md')).toEqual(['#section']);
  });

  // ── Extra cases ────────────────────────────────────────────────────────────
  it('leaves mailto: links untouched', () => {
    expect(urls('[mail](mailto:hello@example.com)', 'Datasets/Cow.md'))
      .toEqual(['mailto:hello@example.com']);
  });
  it('leaves protocol-relative links untouched', () => {
    expect(urls('[x](//cdn.example.com/a.js)', 'Datasets/Cow.md'))
      .toEqual(['//cdn.example.com/a.js']);
  });
  it('rewrites a ./README.md link from inside Datasets/ to the mapped index page', () => {
    expect(urls('[Index](./README.md)', 'Datasets/Cow.md'))
      .toEqual(['/caail/datasets/readme/']);
  });
  it('drops a cross-file anchor when the target is a rendered page', () => {
    expect(urls('[Pig atlases](./Pig.md#featured-atlases)', 'Datasets/Cow.md'))
      .toEqual(['/caail/datasets/pig/']);
  });
});
