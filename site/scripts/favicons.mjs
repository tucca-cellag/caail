/**
 * favicons.mjs — generates the raster favicon package + web manifest from the
 * single source-of-truth glyph in `public/favicon.svg` (the bioreactor mark).
 *
 * Run once (and whenever the mark changes): `node scripts/favicons.mjs`.
 * Outputs are committed static assets, so the build never depends on this
 * script. Rasters can't honor `prefers-color-scheme`, so every raster is a
 * WHITE glyph on a navy field — visible on both light and dark tab bars.
 */
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pub = (f) => fileURLToPath(new URL(`../public/${f}`, import.meta.url));
const NAVY = '#002E6D';

// Extract the glyph markup (128×128 space) from favicon.svg, recolored white —
// reused, not re-drawn, so the raster icons can't drift from the SVG.
const glyph = readFileSync(pub('favicon.svg'), 'utf8')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/, '')
  .replace(/currentColor/g, '#ffffff')
  .trim();

/** White glyph on a navy field at `size` px, with `padding` px safe-zone margin. */
function icon(size, padding, radius = 0) {
  const s = (size - 2 * padding) / 128;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${NAVY}"/>
  <g transform="translate(${padding} ${padding}) scale(${s})">${glyph}</g>
</svg>`;
}
const png = (size, padding, radius) =>
  new Resvg(icon(size, padding, radius), { fitTo: { mode: 'width', value: size } }).render().asPng();

// favicon.ico — 16 + 32 px, slightly rounded square.
const ico = await pngToIco([png(32, 3, 6), png(16, 1.5, 3)]);
writeFileSync(pub('favicon.ico'), ico);

// apple-touch-icon — 180×180; iOS rounds the corners, so square bg + safe margin.
writeFileSync(pub('apple-touch-icon.png'), png(180, 30, 0));

// Maskable manifest icons — full-bleed navy, generous safe zone (Android masks).
writeFileSync(pub('icon-192.png'), png(192, 38, 0));
writeFileSync(pub('icon-512.png'), png(512, 100, 0));

writeFileSync(
  pub('site.webmanifest'),
  JSON.stringify(
    {
      name: 'CAAIL — Cellular Agriculture AI Library',
      short_name: 'CAAIL',
      description: 'The curated library at the intersection of cellular agriculture and AI.',
      icons: [
        { src: '/caail/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/caail/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
      theme_color: '#002E6D',
      background_color: '#002E6D',
      display: 'minimal-ui',
      start_url: '/caail/',
      scope: '/caail/',
    },
    null,
    2,
  ) + '\n',
);

console.log('favicons: wrote favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, site.webmanifest');
