import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Root } from 'mdast';
import { datasetCards, type DatasetCardEntry } from './dataset-cards.ts';

const ATLAS: DatasetCardEntry = {
  name: 'ChickenGTEx-Portal',
  kind: 'atlas',
  anchor: 'ds-chickengtex-portal',
  topics: [{ slug: 'single-cell-atlases', label: 'Single-cell atlases', theme: 'cell-lines-engineering' }],
};
const GEM: DatasetCardEntry = { name: 'iES1300', kind: 'gem', anchor: 'ds-ies1300', topics: [] };

const MD = `## Featured atlases

### [ChickenGTEx-Portal](https://chicken.farmgtex.org/)

Chicken sub-portal of FarmGTEx.

## Genome-scale metabolic models

### iES1300 — *Gallus gallus* (chicken)

A curated GEM.

## Complete data inventory

| Accession | Title |
|---|---|
| GSE1 | x |
`;

function run(md: string, sourcePath: string, entries: DatasetCardEntry[], page = 'Chicken') {
  const tree = unified().use(remarkParse).parse(md) as Root;
  datasetCards({ sourcePath, entriesByPage: new Map([[page, entries]]) })(tree);
  return (tree.children as any[]);
}
const html = (kids: any[]) => kids.filter((n) => n.type === 'html').map((n) => n.value);

describe('datasetCards', () => {
  it('wraps a featured atlas H3 in a kind-tagged card with the ds- anchor id', () => {
    const h = html(run(MD, 'Datasets/Chicken.md', [ATLAS, GEM]));
    expect(h).toContain('<article class="ds-card ds-card--atlas" id="ds-chickengtex-portal">');
    expect(h).toContain('</article>');
  });

  it('injects topic chips matching the TopicChips markup (class, data-theme, hub href)', () => {
    const h = html(run(MD, 'Datasets/Chicken.md', [ATLAS, GEM]));
    const chips = h.find((v) => v.includes('topic-chips'));
    expect(chips).toBeDefined();
    expect(chips).toContain('class="topic-chips not-content"');
    expect(chips).toContain('data-theme="cell-lines-engineering"');
    expect(chips).toContain('href="/caail/topics/?t=single-cell-atlases"');
  });

  it('keeps the H3 heading node between the card open and close', () => {
    const kids = run(MD, 'Datasets/Chicken.md', [ATLAS, GEM]);
    const openIdx = kids.findIndex((n) => n.type === 'html' && n.value.includes('id="ds-chickengtex-portal"'));
    const headingIdx = kids.findIndex((n) => n.type === 'heading' && n.depth === 3);
    const closeIdx = kids.findIndex((n) => n.type === 'html' && n.value === '</article>');
    expect(openIdx).toBeGreaterThanOrEqual(0);
    expect(headingIdx).toBe(openIdx + 1);
    expect(closeIdx).toBeGreaterThan(headingIdx);
  });

  it('emits no chip <ul> for an entry with no topics', () => {
    const kids = run('## Genome-scale metabolic models\n\n### iES1300 — *Gallus gallus* (chicken)\n\nA GEM.\n', 'Datasets/Chicken.md', [GEM]);
    expect(html(kids).some((v) => v.includes('topic-chips'))).toBe(false);
    expect(html(kids)).toContain('<article class="ds-card ds-card--gem" id="ds-ies1300">');
  });

  it('never wraps content under `## Complete data inventory`', () => {
    const kids = run(MD, 'Datasets/Chicken.md', [ATLAS, GEM]);
    // exactly two cards were opened (atlas + GEM) — the inventory section has no H3
    expect(html(kids).filter((v) => v.startsWith('<article')).length).toBe(2);
    // no card opens after the inventory H2 heading
    const invIdx = kids.findIndex((n) => n.type === 'heading' && n.depth === 2 && /Complete data inventory/.test(n.children?.[0]?.value ?? ''));
    expect(invIdx).toBeGreaterThan(0);
    expect(kids.slice(invIdx).some((n) => n.type === 'html' && n.value.startsWith('<article'))).toBe(false);
  });

  it('pulls nested H4 sub-sections INTO the parent card (not stranded after </article>)', () => {
    // Regression: an umbrella H3 (Arc Virtual Cell Atlas) with two `#### …` sub-sections
    // before the next H3. The body loop must stop only at H2/H3, so the H4s render inside
    // the parent card — stopping at any heading left them after the closing </article>.
    const md = `## Single-cell corpora

### Arc Virtual Cell Atlas

Umbrella prose.

#### [Tahoe-100M](https://example.com/tahoe)

Tahoe body.

#### [scBaseCount](https://example.com/scbase)

scBaseCount body.

### [Parse Biosciences 10M](https://example.com/parse)

Parse body.
`;
    const ARC: DatasetCardEntry = { name: 'Arc Virtual Cell Atlas', kind: 'atlas', anchor: 'ds-arc-virtual-cell-atlas', topics: [] };
    const PARSE: DatasetCardEntry = { name: 'Parse Biosciences 10M', kind: 'atlas', anchor: 'ds-parse-biosciences-10m', topics: [] };
    const kids = run(md, 'Datasets/HumanReference.md', [ARC, PARSE], 'HumanReference');
    const openIdx = kids.findIndex((n) => n.type === 'html' && n.value.includes('id="ds-arc-virtual-cell-atlas"'));
    const closeIdx = kids.findIndex((n, i) => i > openIdx && n.type === 'html' && n.value === '</article>');
    expect(openIdx).toBeGreaterThanOrEqual(0);
    // Both H4 sub-sections sit BETWEEN the Arc card's open and close.
    const h4Idxs = kids.map((n, i) => ({ n, i })).filter(({ n }) => n.type === 'heading' && n.depth === 4).map(({ i }) => i);
    expect(h4Idxs.length).toBe(2);
    expect(h4Idxs.every((i) => i > openIdx && i < closeIdx)).toBe(true);
    // Exactly two cards (Arc + Parse) — the H4s did not open their own cards.
    expect(html(kids).filter((v) => v.startsWith('<article')).length).toBe(2);
  });

  it('is a no-op for a non-Datasets page', () => {
    const kids = run(MD, 'Software.md', [ATLAS, GEM]);
    expect(html(kids).length).toBe(0);
  });

  it('is a no-op when the page has no curated entries', () => {
    const kids = run(MD, 'Datasets/Cow.md', [ATLAS, GEM], 'Chicken'); // entries keyed on Chicken, page=Cow
    expect(html(kids).length).toBe(0);
  });
});
