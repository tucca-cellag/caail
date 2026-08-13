// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import preact from '@astrojs/preact';
import icon from 'astro-icon';
import { fileURLToPath } from 'node:url';
import { stripLeadingH1 } from './scripts/remark/strip-leading-h1.ts';
import { rewriteCaailLinks } from './scripts/remark/rewrite-caail-links.ts';
import { datasetCards, loadDatasetEntriesByPage } from './scripts/remark/dataset-cards.ts';
import { CAAIL_PAGES } from './src/content/caail-pages.ts';

// astro.config.mjs lives in site/ — one level up is the repo root (trailing slash)
const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const BASE = '/caail';
// The deployed origin. `site:` below and the analytics origin guard both read
// it, so the guard cannot drift from where the site actually deploys — if this
// ever moves to a TUCCA-owned domain, the beacon follows it in the same edit.
const SITE = 'https://tucca-cellag.github.io';
const ANALYTICS_HOST = new URL(SITE).hostname;

// Curated dataset entries (datasets.json), grouped by page, loaded once for the
// dataset-card transform. Empty when parse hasn't run yet (transform is then a no-op).
const DATASET_ENTRIES_BY_PAGE = loadDatasetEntriesByPage();

/**
 * Per-file remark wrapper that applies link-rewrite and H1-strip to the
 * canonical prose pages the site renders. A file qualifies iff it has a
 * `CAAIL_PAGES` entry — the same map the loader uses to decide what to render —
 * so the guard can't drift from the rendered set. In-repo Starlight MDX
 * (site/src/content/docs/**) maps to a non-page id and is skipped.
 */
function caailProseRemark() {
  return (tree, file) => {
    // file.history[0] and file.path both carry the absolute FS path.
    const abs = file?.history?.[0] ?? file?.path ?? '';
    if (!abs || !abs.startsWith(REPO_ROOT)) return;
    const sourcePath = abs.slice(REPO_ROOT.length); // e.g. "Datasets/Cow.md"
    // A canonical prose page iff the loader renders it (has a CAAIL_PAGES
    // entry). Deriving the guard from that map instead of a hardcoded allowlist
    // keeps the two in lockstep, so a newly added prose page can't silently miss
    // link-rewrite / H1-strip (the bug that left /taxonomy/ untransformed).
    if (!CAAIL_PAGES.byId(CAAIL_PAGES.idForSourcePath(sourcePath))) return;
    rewriteCaailLinks({ base: BASE, sourcePath })(tree);
    stripLeadingH1()(tree);
    // Datasets/ pages: wrap the curated `### …` entries into tagged cards.
    datasetCards({ sourcePath, entriesByPage: DATASET_ENTRIES_BY_PAGE })(tree);
  };
}

// ---------------------------------------------------------------------------
// Build sidebar from the curated map
// ---------------------------------------------------------------------------

/**
 * Return sidebar items for a given group, sorted by order.
 * Links use the `/<id>/` pattern (base is prepended by Starlight from the
 * configured `base` option — Starlight's `link` values are relative to base).
 */
function groupItems(group) {
  return CAAIL_PAGES.all()
    .filter((p) => p.group === group)
    .sort((a, b) => a.order - b.order)
    .map((p) => ({ label: p.sidebarLabel, link: `/${p.id}/` }));
}

export default defineConfig({
  site: SITE,
  base: '/caail',
  markdown: {
    remarkPlugins: [caailProseRemark],
  },
  integrations: [
    starlight({
      title: 'CAAIL',
      description:
        'The curated library at the intersection of cellular agriculture and AI.',
      // Git build-date "Last updated" stamp on doc pages (freshness signal,
      // matching the org-root hub + the Tufts RT guides footer).
      lastUpdated: true,
      head: [
        {
          // No-flash bootstrap for the collapsible nav sidebars: apply the
          // persisted collapse state to <html> before first paint so a
          // collapsed sidebar/TOC never flashes open on load. Paired with
          // NavCollapse.astro (the toggles) and the .caail-navtoggle CSS in
          // starlight-overrides.css.
          tag: 'script',
          content:
            "(()=>{try{var d=document.documentElement,s=localStorage;if(s.getItem('caail-nav-collapsed')==='1')d.setAttribute('data-sidebar-collapsed','');if(s.getItem('caail-toc-collapsed')==='1')d.setAttribute('data-toc-collapsed','');}catch(e){}})();",
        },
        // Site-wide social card (Starlight emits twitter:card=summary_large_image
        // but no image by default). One branded 1200×630 card for every page.
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://tucca-cellag.github.io/caail/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://tucca-cellag.github.io/caail/og.png' } },
        // Structured data: Organization (TUCCA) + WebSite, for search engines
        // and AI answer-engines.
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Organization',
                '@id': 'https://tucca-cellag.github.io/caail/#org',
                name: 'Tufts University Center for Cellular Agriculture (TUCCA)',
                url: 'https://cellularagriculture.tufts.edu/',
                sameAs: ['https://github.com/tucca-cellag'],
              },
              {
                '@type': 'WebSite',
                '@id': 'https://tucca-cellag.github.io/caail/#website',
                name: 'CAAIL: Cellular Agriculture AI Library',
                url: 'https://tucca-cellag.github.io/caail/',
                description:
                  'A curated, openly-licensed library at the intersection of cellular agriculture and artificial intelligence — papers and preprints, open-source software, databases, and per-species datasets.',
                inLanguage: 'en',
                publisher: { '@id': 'https://tucca-cellag.github.io/caail/#org' },
              },
            ],
          }),
        },
        // Raster favicon fallbacks + PWA manifest (Starlight already emits the
        // adaptive SVG icon link). Generated from the bioreactor mark by
        // scripts/favicons.mjs. Hrefs are base-prefixed (head entries are raw).
        { tag: 'link', attrs: { rel: 'icon', href: '/caail/favicon.ico', sizes: '32x32' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/caail/apple-touch-icon.png' } },
        { tag: 'link', attrs: { rel: 'manifest', href: '/caail/site.webmanifest' } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#002E6D' } },
        // Google Search Console ownership verification (URL-prefix property for
        // the /caail/ site). Public token — ships in the page <head>.
        {
          tag: 'meta',
          attrs: {
            name: 'google-site-verification',
            content: 'p-AzN61G83Y9JI-9Y_7EmzsfcXDpNbnQto3Wmc3w0NQ',
          },
        },
        // Cloudflare Web Analytics — cookieless, privacy-light usage stats.
        //
        // Loaded only when the page is being served from the deployed origin, so
        // `pnpm dev`, `pnpm preview` and the Playwright suite record nothing.
        // Without this the measured baseline is partly our own browser, which
        // matters because that baseline is what outreach is measured against.
        //
        // It has to be a *runtime* check, not a build-time one. `preview` and
        // the e2e run serve the very same production build the deploy does, so
        // a build flag cannot tell them apart — and `import.meta.env` is not
        // available in this file at all, since Astro evaluates the config before
        // Vite's env transform (so `import.meta.env.PROD` here reads undefined
        // and would disable analytics everywhere, including production).
        //
        // Cloudflare does also validate the hostname server-side, by postfix
        // match against the site configured under the token, so a localhost
        // beacon is rejected on arrival — "When payload gets sent to the beacon
        // endpoint, we validate the hostname with postfix matching"
        // (https://developers.cloudflare.com/web-analytics/faq/). That is a
        // third party's behaviour rather than ours, and postfix matching is
        // looser than it first reads (a token for example.com also admits
        // fooexample.com), so this guard means we do not send it in the first
        // place rather than trusting them to discard it.
        //
        // Loading cost: a dynamically inserted script is `async`, set here
        // explicitly rather than left implicit. That is a real change from the
        // `defer` this replaces, and marginally worse rather than better —
        // `defer` guarantees execution after parsing, while `async` executes as
        // soon as it arrives and can interrupt parsing. It is accepted because
        // the beacon is small and the alternative reintroduces the defect.
        //
        // Note the Lighthouse gate can no longer see this either way:
        // lighthouserc.json collects from http://localhost:4321/caail/, which is
        // precisely the origin excluded above, so CI now measures a page that
        // never loads the beacon. Its performance number is that much
        // optimistic against what a reader gets, and a beacon-induced
        // regression would have to be caught by hand.
        {
          tag: 'script',
          content:
            `(()=>{if(location.hostname!==${JSON.stringify(ANALYTICS_HOST)})return;` +
            `var s=document.createElement('script');s.async=true;` +
            `s.src='https://static.cloudflareinsights.com/beacon.min.js';` +
            `s.setAttribute('data-cf-beacon','{"token": "a815722483f84116b51e8120158aaea3"}');` +
            `document.head.appendChild(s);})();`,
        },
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/tucca-cellag/caail' },
        // Points at the community page, not the Slack invite itself. Starlight
        // renders social links with a hardcoded `rel="me"` (an identity claim,
        // which a signup endpoint isn't), and the page carries the norms and
        // the code of conduct that a bare join link would skip past. Starlight
        // does NOT base-prefix social hrefs — it emits `href` verbatim — so the
        // `${BASE}` here is required, not redundant.
        { icon: 'slack', label: 'Community on Slack', href: `${BASE}/community/` },
      ],
      sidebar: [
        { label: 'Home', link: '/' },
        { label: 'Primers', items: [
          { label: 'Cellular Agriculture for AI', link: '/primers/cell-ag/' },
          { label: 'AI for Cell-Ag', link: '/primers/ai/' },
        ] },
        { label: 'Papers', items: [
          { label: 'Explorer', link: '/papers/explorer/' },
          { label: 'Citation Network', link: '/papers/network/' },
          { label: 'Reviews & Reference Works', link: '/papers/reviews/' },
        ] },
        { label: 'Software', link: '/software/' },
        { label: 'Databases', link: '/databases/' },
        { label: 'Topics', link: '/topics/' },
        { label: 'Licenses', link: '/licenses/' },
        { label: 'Citations', link: '/citations/' },
        { label: 'Awesome Lists', link: '/awesome-lists/' },
        { label: 'AI Agents & Foundation Models', link: '/ai-agents-foundation-models/' },
        { label: 'Datasets (by species)', items: groupItems('datasets') },
        { label: 'Research Areas', items: groupItems('research-areas') },
        { label: 'Talks & Videos', link: '/talks/' },
        { label: 'Other Resources', link: '/other-resources/' },
        { label: 'Reference Works', link: '/reference-works/' },
        { label: 'Funding & Grants', link: '/funding/' },
        { label: 'By the Numbers', link: '/by-the-numbers/' },
        { label: 'Contributing', link: '/contributing/' },
        { label: 'Community', link: '/community/' },
        { label: 'How to Cite', link: '/cite/' },
        { label: 'About', link: '/about/' },
      ],
      customCss: [
        './src/styles/fonts.css',
        './src/styles/tokens.css',
        './src/styles/starlight-overrides.css',
        // Scroll-reveal primitives (.sr / .sr-d1..5), shared by the homepage bands.
        // Global rather than per-component so one definition governs the timing
        // curve and the no-JS guard everywhere.
        './src/styles/reveal.css',
        // Global so the raw-HTML dataset cards + their topic chips (injected by the
        // dataset-cards remark transform on /datasets/ pages, not a component) style
        // correctly. topic-chips.css otherwise only ships with the TopicChips island.
        './src/styles/topic-chips.css',
        './src/styles/dataset-cards.css',
        // Global so the raw-HTML dataset license badges (dataset-cards remark) and the
        // CatalogBrowser LicenseBadge component share one stylesheet.
        './src/styles/license-badge.css',
        // Same rationale for the "cited by N" OpenAlex badge (CitationBadge component +
        // the raw-HTML dataset citation badges from the dataset-cards remark).
        './src/styles/citation-badge.css',
        // Same rationale again for the per-card "Report an issue" link (ReportLink
        // component + the raw-HTML dataset twin from the dataset-cards remark).
        './src/styles/report-link.css',
      ],
      components: {
        // Append per-route schema.org JSON-LD (CollectionPage + ItemList +
        // BreadcrumbList) after Starlight's default <head>. Builders in
        // src/lib/structured-data.ts; site-wide Organization+WebSite stays above.
        Head: './src/components/Head.astro',
        // Horizontal primary nav next to the wordmark (trimgalore-style).
        SiteTitle: './src/components/SiteTitle.astro',
        // Override Starlight's built-in Hero with an empty component so that
        // setting `hero: {}` in index.mdx suppresses the auto <PageTitle> h1
        // without injecting Starlight's own hero UI above our custom Hero.
        Hero: './src/components/StarlightHeroOverride.astro',
        Footer: './src/components/Footer.astro',
        // Suppress the Previous/Next pagination links site-wide.
        Pagination: './src/components/EmptyPagination.astro',
        // Inject island/component-rendered section headings into the "On This
        // Page" TOC for /software, /databases, /talks, /awesome-lists, and the
        // /primers/* hubs (their headings live in the island, not the Markdown,
        // so Starlight can't collect them natively). Both the right-rail and the
        // mobile widget are overridden because Starlight renders the mobile one
        // first; the shared injection in toc-inject.ts is idempotent. Every
        // other route renders Starlight's default TOC unchanged.
        TableOfContents: './src/components/TableOfContents.astro',
        MobileTableOfContents: './src/components/MobileTableOfContents.astro',
      },
    }),
    preact(),
    icon({ include: { ph: ['*'] } }),
  ],
});
