// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import preact from '@astrojs/preact';
import icon from 'astro-icon';

export default defineConfig({
  site: 'https://tucca-cellag.github.io',
  base: '/caail',
  integrations: [
    starlight({
      title: 'CAAIL',
      description:
        'The curated library at the intersection of cellular agriculture and AI.',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/tucca-cellag/caail' },
      ],
      sidebar: [
        { label: 'Home', link: '/' },
        { label: 'Papers', items: [{ label: 'Explorer', link: '/papers/explorer/' }] },
      ],
    }),
    preact(),
    icon({ include: { ph: ['*'] } }),
  ],
});