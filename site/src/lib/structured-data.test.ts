/**
 * structured-data.test.ts — the per-route JSON-LD builders.
 *
 * Asserts shape, WebSite linkage, and that enumerated item counts track the
 * parser's JSON output (so the structured data can't silently drift from the
 * catalog it describes), plus breadcrumb behaviour for nested vs single-level
 * routes.
 */
import { describe, it, expect } from 'vitest';

import catalog from '../content/data/catalog.json';
import papers from '../content/data/papers.json';
import talks from '../content/data/talks.json';
import {
  pageJsonLd,
  breadcrumbList,
  softwareItems,
  databaseItems,
  paperItems,
  videoItems,
} from './structured-data.js';

const WEBSITE_ID = 'https://tucca-cellag.github.io/caail/#website';

/** Pull the first @graph node of a given @type from a pageJsonLd() result. */
function node(graph: ReturnType<typeof pageJsonLd>, type: string): any {
  const arr = (graph as any)?.['@graph'] ?? [];
  return arr.find((n: any) => n['@type'] === type);
}

const videoCount = talks.sections.reduce(
  (n, s) => n + s.items.filter((i) => i.kind === 'video' && i.videoId).length,
  0,
);

describe('pageJsonLd — routing', () => {
  it('returns null on the home page (global graph already covers it)', () => {
    expect(pageJsonLd('/caail/', 'CAAIL')).toBeNull();
  });

  it('wraps everything in a schema.org @graph', () => {
    const g = pageJsonLd('/caail/software/', 'Software');
    expect((g as any)['@context']).toBe('https://schema.org');
    expect(Array.isArray((g as any)['@graph'])).toBe(true);
  });

  it('emits valid, serialisable JSON for every route shape', () => {
    for (const [path, title] of [
      ['/caail/software/', 'Software'],
      ['/caail/databases/', 'Databases'],
      ['/caail/papers/explorer/', 'Papers'],
      ['/caail/papers/network/', 'Citation Network'],
      ['/caail/talks/', 'Talks & Videos'],
      ['/caail/primers/cell-ag/', 'Cellular Agriculture for AI Researchers'],
      ['/caail/primers/ai/', 'AI for Cell-Ag Researchers'],
      ['/caail/datasets/cow/', 'Cow / Bos taurus'],
      ['/caail/research-areas/bioprocess/', 'Bioprocess & Scale-Up'],
      ['/caail/about/', 'About'],
    ] as const) {
      const g = pageJsonLd(path, title);
      expect(() => JSON.stringify(g)).not.toThrow();
      // Every page-type entity is part of the WebSite.
      const page = node(g, 'CollectionPage');
      expect(page.isPartOf['@id']).toBe(WEBSITE_ID);
    }
  });
});

describe('pageJsonLd — catalog enumeration tracks the data', () => {
  it('software → one SoftwareApplication per catalog entry', () => {
    const g = pageJsonLd('/caail/software/', 'Software');
    const list = node(g, 'CollectionPage').mainEntity;
    expect(list['@type']).toBe('ItemList');
    expect(list.numberOfItems).toBe(catalog.software.length);
    expect(list.itemListElement).toHaveLength(catalog.software.length);
    expect(list.itemListElement[0].item['@type']).toBe('SoftwareApplication');
  });

  it('databases → one Dataset per catalog entry', () => {
    const g = pageJsonLd('/caail/databases/', 'Databases');
    const list = node(g, 'CollectionPage').mainEntity;
    expect(list.numberOfItems).toBe(catalog.databases.length);
    expect(list.itemListElement[0].item['@type']).toBe('Dataset');
  });

  it('papers/explorer → one ScholarlyArticle per reference', () => {
    const g = pageJsonLd('/caail/papers/explorer/', 'Papers');
    const list = node(g, 'CollectionPage').mainEntity;
    expect(list.numberOfItems).toBe(papers.references.length);
    expect(list.itemListElement[0].item['@type']).toBe('ScholarlyArticle');
  });

  it('talks → one VideoObject per video item', () => {
    const g = pageJsonLd('/caail/talks/', 'Talks & Videos');
    const list = node(g, 'CollectionPage').mainEntity;
    expect(list.numberOfItems).toBe(videoCount);
    if (videoCount > 0) expect(list.itemListElement[0].item['@type']).toBe('VideoObject');
  });

  it('prose pages get a plain CollectionPage (no enumerated list)', () => {
    const g = pageJsonLd('/caail/datasets/cow/', 'Cow / Bos taurus');
    expect(node(g, 'CollectionPage').mainEntity).toBeUndefined();
  });
});

describe('builder field shape', () => {
  it('ScholarlyArticle carries DOI identifier + sameAs when a DOI exists', () => {
    const withDoi = (paperItems() as any[]).find((p) => p.sameAs);
    expect(withDoi.sameAs).toMatch(/^https:\/\/doi\.org\//);
    expect(withDoi.identifier.propertyID).toBe('DOI');
  });

  it('SoftwareApplication carries name + url + category', () => {
    const s = softwareItems()[0] as any;
    expect(s.name).toBeTruthy();
    expect(s.url).toBeTruthy();
    expect(s.applicationCategory).toBeTruthy();
  });

  it('Dataset carries name + url', () => {
    const d = databaseItems()[0] as any;
    expect(d['@type']).toBe('Dataset');
    expect(d.url).toBeTruthy();
  });

  it('VideoObject carries an embed URL', () => {
    if (videoCount === 0) return;
    const v = videoItems()[0] as any;
    expect(v.embedUrl).toMatch(/youtube\.com\/embed\//);
  });
});

describe('breadcrumbList', () => {
  it('is null on the home page', () => {
    expect(breadcrumbList('/caail/', 'CAAIL')).toBeNull();
  });

  it('single-level route → Home › Page', () => {
    const bc = breadcrumbList('/caail/software/', 'Software') as any;
    expect(bc['@type']).toBe('BreadcrumbList');
    expect(bc.itemListElement).toHaveLength(2);
    expect(bc.itemListElement[0].name).toBe('Home');
    expect(bc.itemListElement[1].name).toBe('Software');
  });

  it('two-level route with a landing section carries the section URL', () => {
    const bc = breadcrumbList('/caail/datasets/cow/', 'Cow / Bos taurus') as any;
    expect(bc.itemListElement).toHaveLength(3);
    expect(bc.itemListElement[1].name).toBe('Datasets');
    expect(bc.itemListElement[1].item).toBe('https://tucca-cellag.github.io/caail/datasets/readme/');
    expect(bc.itemListElement[2].name).toBe('Cow / Bos taurus');
  });

  it('two-level route without a landing section omits the section URL', () => {
    const bc = breadcrumbList('/caail/research-areas/bioprocess/', 'Bioprocess & Scale-Up') as any;
    expect(bc.itemListElement[1].name).toBe('Research Areas');
    expect(bc.itemListElement[1].item).toBeUndefined();
  });

  it('primer route → Home › Primers › Page (no section landing URL)', () => {
    const bc = breadcrumbList('/caail/primers/cell-ag/', 'Cellular Agriculture for AI Researchers') as any;
    expect(bc.itemListElement).toHaveLength(3);
    expect(bc.itemListElement[1].name).toBe('Primers');
    expect(bc.itemListElement[1].item).toBeUndefined();
    expect(bc.itemListElement[2].name).toBe('Cellular Agriculture for AI Researchers');
  });
});
