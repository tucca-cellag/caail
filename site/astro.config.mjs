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
 * Per-file remark wrapper that applies link-rewrite and H1-strip to canonical
 * prose pages only (ResearchAreas/*, Datasets/*, CONTRIBUTING.md).
 * In-repo Starlight MDX (index.mdx, papers/explorer.mdx) are skipped.
 */
function caailProseRemark() {
  return (tree, file) => {
    // file.history[0] and file.path both carry the absolute FS path.
    const abs = file?.history?.[0] ?? file?.path ?? '';
    if (!abs || !abs.startsWith(REPO_ROOT)) return;
    const sourcePath = abs.slice(REPO_ROOT.length); // e.g. "Datasets/Cow.md"
    // Guard: only act on canonical prose directories / CONTRIBUTING.md.
    const isProse =
      /^(ResearchAreas|Datasets)\//.test(sourcePath) || sourcePath === 'CONTRIBUTING.md';
    if (!isProse) return;
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
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/tucca-cellag/caail' },
      ],
      sidebar: [
        { label: 'Home', link: '/' },
        { label: 'Papers', items: [
          { label: 'Explorer', link: '/papers/explorer/' },
          { label: 'Citation Network', link: '/papers/network/' },
        ] },
        { label: 'Software', link: '/software/' },
        { label: 'Databases', link: '/databases/' },
        { label: 'Datasets (by species)', items: groupItems('datasets') },
        { label: 'Research Areas', items: groupItems('research-areas') },
        { label: 'Talks & Videos', link: '/talks/' },
        { label: 'By the Numbers', link: '/by-the-numbers/' },
        { label: 'Contributing', link: '/contributing/' },
        { label: 'About', link: '/about/' },
      ],
      customCss: [
        './src/styles/fonts.css',
        './src/styles/tokens.css',
        './src/styles/starlight-overrides.css',
      ],
      components: {
        // Horizontal primary nav next to the wordmark (trimgalore-style).
        SiteTitle: './src/components/SiteTitle.astro',
        // Override Starlight's built-in Hero with an empty component so that
        // setting `hero: {}` in index.mdx suppresses the auto <PageTitle> h1
        // without injecting Starlight's own hero UI above our custom Hero.
        Hero: './src/components/StarlightHeroOverride.astro',
        Footer: './src/components/Footer.astro',
      },
    }),
    preact(),
    icon({ include: { ph: ['*'] } }),
  ],
});
