// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import preact from '@astrojs/preact';
import icon from 'astro-icon';
import { fileURLToPath } from 'node:url';
import { stripLeadingH1 } from './scripts/remark/strip-leading-h1.ts';
import { rewriteCaailLinks } from './scripts/remark/rewrite-caail-links.ts';
import { CAAIL_PAGES } from './src/content/caail-pages.ts';

// astro.config.mjs lives in site/ — one level up is the repo root (trailing slash)
const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const BASE = '/caail';

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
  site: 'https://tucca-cellag.github.io',
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
                name: 'CAAIL — Cellular Agriculture AI Library',
                url: 'https://tucca-cellag.github.io/caail/',
                description:
                  'A curated, openly-licensed library at the intersection of cellular agriculture and artificial intelligence — peer-reviewed papers, open-source software, databases, and per-species datasets.',
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
        // `defer` so the beacon loads after paint and doesn't dent the
        // Lighthouse performance budget (docs.yml gates Performance ≥0.90).
        // The beacon only reports for the site configured under this token.
        {
          tag: 'script',
          attrs: {
            defer: true,
            src: 'https://static.cloudflareinsights.com/beacon.min.js',
            'data-cf-beacon': '{"token": "a815722483f84116b51e8120158aaea3"}',
          },
        },
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/tucca-cellag/caail' },
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
        ] },
        { label: 'Software', link: '/software/' },
        { label: 'Databases', link: '/databases/' },
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
        { label: 'How to Cite', link: '/cite/' },
        { label: 'About', link: '/about/' },
      ],
      customCss: [
        './src/styles/fonts.css',
        './src/styles/tokens.css',
        './src/styles/starlight-overrides.css',
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
