/**
 * structured-data.ts — per-route schema.org JSON-LD builders.
 *
 * The site-wide `Organization` + `WebSite` graph lives in astro.config.mjs and
 * is emitted on every page. This module adds the *per-page* structured data that
 * answer engines and Google rich results consume: a `BreadcrumbList` on every
 * nested page, and a `CollectionPage` whose `mainEntity` enumerates the catalog
 * (software → SoftwareApplication, databases/datasets → Dataset, papers →
 * ScholarlyArticle, talks → VideoObject). Items link out via `url`/`sameAs` to
 * the canonical external source — CAAIL is a catalog/navigation layer, so a
 * CollectionPage of externally-hosted items is the honest framing.
 *
 * `pageJsonLd()` is the single entry point: pure, build-time, and unit-tested
 * against the parser's JSON output. `Head.astro` calls it and serialises the
 * result into one `application/ld+json` <script>.
 */
import catalog from '../content/data/catalog.json';
import papers from '../content/data/papers.json';
import talks from '../content/data/talks.json';

// ---------------------------------------------------------------------------
// Identity constants — must match astro.config.mjs (site + base + WebSite @id).
// ---------------------------------------------------------------------------

const ORIGIN = 'https://tucca-cellag.github.io';
const BASE = '/caail';
const WEBSITE_ID = `${ORIGIN}${BASE}/#website`;

/** A schema.org node without its own `@context` (it rides the top-level @graph). */
type Node = Record<string, unknown>;

// ---------------------------------------------------------------------------
// URL + route helpers
// ---------------------------------------------------------------------------

/** Absolute URL for a site pathname (which may or may not include the base). */
function absolute(pathname: string): string {
  const p = pathname.startsWith(ORIGIN) ? pathname.slice(ORIGIN.length) : pathname;
  const withBase = p.startsWith(BASE) ? p : `${BASE}${p.startsWith('/') ? '' : '/'}${p}`;
  return `${ORIGIN}${withBase}`;
}

/** Route segments below the base, e.g. '/caail/datasets/cow/' → ['datasets','cow']. */
export function routeSegments(pathname: string): string[] {
  const p = pathname.startsWith(ORIGIN) ? pathname.slice(ORIGIN.length) : pathname;
  const belowBase = p.startsWith(BASE) ? p.slice(BASE.length) : p;
  return belowBase.split('/').filter(Boolean);
}

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------

/** First-segment → human label for the breadcrumb's section crumb. */
const SECTION_LABELS: Record<string, string> = {
  papers: 'Papers',
  software: 'Software',
  databases: 'Databases',
  datasets: 'Datasets',
  'research-areas': 'Research Areas',
  talks: 'Talks & Videos',
  'other-resources': 'Other Resources',
  'by-the-numbers': 'By the Numbers',
  contributing: 'Contributing',
  about: 'About',
};

/** Section landing routes that actually exist (so the crumb can carry a URL). */
const SECTION_LANDING: Record<string, string> = {
  papers: '/papers/explorer/',
  datasets: '/datasets/readme/',
};

/**
 * Build a BreadcrumbList for a nested page. Home › Section › Page, where the
 * Section crumb only carries a URL when a real landing route exists. Returns
 * `null` for the home page or unknown single segments with no section label.
 */
export function breadcrumbList(pathname: string, title: string): Node | null {
  const segs = routeSegments(pathname);
  if (segs.length === 0) return null; // home

  const items: Node[] = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}${BASE}/` },
  ];

  const sectionLabel = SECTION_LABELS[segs[0]];
  if (segs.length >= 2 && sectionLabel) {
    // Two-level route: add the section crumb, then the page.
    const landing = SECTION_LANDING[segs[0]];
    items.push({
      '@type': 'ListItem',
      position: 2,
      name: sectionLabel,
      ...(landing ? { item: `${ORIGIN}${BASE}${landing}` } : {}),
    });
    items.push({ '@type': 'ListItem', position: 3, name: title, item: absolute(pathname) });
  } else {
    // Single-level route: Home › Page (use the page title).
    items.push({ '@type': 'ListItem', position: 2, name: title, item: absolute(pathname) });
  }

  return { '@type': 'BreadcrumbList', itemListElement: items };
}

// ---------------------------------------------------------------------------
// CollectionPage + ItemList builders
// ---------------------------------------------------------------------------

/** Wrap enumerated items in a CollectionPage that is part of the WebSite. */
function collectionPage(pageUrl: string, name: string, items: Node[]): Node {
  return {
    '@type': 'CollectionPage',
    '@id': `${pageUrl}#page`,
    url: pageUrl,
    name,
    isPartOf: { '@id': WEBSITE_ID },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item,
      })),
    },
  };
}

/** A bare CollectionPage with no enumerated items (prose / viz pages). */
function plainCollectionPage(pageUrl: string, name: string): Node {
  return {
    '@type': 'CollectionPage',
    '@id': `${pageUrl}#page`,
    url: pageUrl,
    name,
    isPartOf: { '@id': WEBSITE_ID },
  };
}

export function softwareItems(): Node[] {
  return catalog.software.map((e) => ({
    '@type': 'SoftwareApplication',
    name: e.name,
    url: e.url,
    applicationCategory: e.group,
    ...(e.summary ? { description: e.summary } : {}),
  }));
}

export function databaseItems(): Node[] {
  return catalog.databases.map((e) => ({
    '@type': 'Dataset',
    name: e.name,
    url: e.url,
    ...(e.summary ? { description: e.summary } : {}),
  }));
}

export function paperItems(): Node[] {
  return papers.references.map((r) => {
    const doiUrl = r.doi ? `https://doi.org/${r.doi}` : null;
    return {
      '@type': 'ScholarlyArticle',
      headline: r.title,
      ...(r.authors && r.authors.length
        ? { author: r.authors.map((name) => ({ '@type': 'Person', name })) }
        : {}),
      ...(r.year ? { datePublished: String(r.year) } : {}),
      ...(r.journal ? { isPartOf: { '@type': 'Periodical', name: r.journal } } : {}),
      ...(doiUrl
        ? {
            identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: r.doi },
            sameAs: doiUrl,
            url: doiUrl,
          }
        : {}),
    };
  });
}

export function videoItems(): Node[] {
  const out: Node[] = [];
  for (const section of talks.sections) {
    for (const item of section.items) {
      if (item.kind !== 'video' || !item.videoId) continue;
      out.push({
        '@type': 'VideoObject',
        name: item.title,
        url: item.url,
        embedUrl: `https://www.youtube.com/embed/${item.videoId}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

/**
 * Build the per-route JSON-LD @graph for a page, or `null` when there's nothing
 * to add beyond the site-wide Organization+WebSite (the home page).
 *
 * @param pathname  Astro.url.pathname (includes the base, e.g. '/caail/software/').
 * @param title     The page's <title> / Starlight entry title (for breadcrumbs).
 */
export function pageJsonLd(pathname: string, title: string): Node | null {
  const segs = routeSegments(pathname);
  if (segs.length === 0) return null; // home — global graph already covers it.

  const pageUrl = absolute(pathname);
  const graph: Node[] = [];

  // Page-type entity.
  if (segs.length === 1 && segs[0] === 'software') {
    graph.push(collectionPage(pageUrl, 'Software', softwareItems()));
  } else if (segs.length === 1 && segs[0] === 'databases') {
    graph.push(collectionPage(pageUrl, 'Databases', databaseItems()));
  } else if (segs[0] === 'papers' && segs[1] === 'explorer') {
    graph.push(collectionPage(pageUrl, 'Papers', paperItems()));
  } else if (segs[0] === 'talks') {
    graph.push(collectionPage(pageUrl, 'Talks & Videos', videoItems()));
  } else {
    // Prose / viz pages (datasets/*, research-areas/*, papers/network, about,
    // contributing, other-resources, by-the-numbers): a plain CollectionPage.
    graph.push(plainCollectionPage(pageUrl, title));
  }

  // Breadcrumbs on every non-home page.
  const crumbs = breadcrumbList(pathname, title);
  if (crumbs) graph.push(crumbs);

  return { '@context': 'https://schema.org', '@graph': graph };
}
