/**
 * og-image.mjs — generates the site-wide social card `public/og.png` (1200×630).
 *
 * Run once (and whenever the brand changes): `node scripts/og-image.mjs`.
 * The PNG is committed as a static asset, so the build never depends on this
 * script or on resvg at build time. On-brand per DESIGN.md §8: Tufts navy
 * field, the favicon sparkle mark, the CAAIL wordmark + tagline, and a row of
 * the Okabe–Ito research-area dots — no Tufts logo or seal.
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/og.png', import.meta.url));

// Tufts navy + the 7 Okabe–Ito research-area colors (from tokens.css / DESIGN.md §2).
const NAVY = '#002E6D';
const AREA = ['#0072B2', '#009E73', '#E69F00', '#56B4E9', '#D55E00', '#CC79A7', '#917800'];

// The favicon sparkle mark (viewBox 0 0 128 128), recolored white.
const MARK = `M81 36 64 0 47 36l-1 2-9-10a6 6 0 0 0-9 9l10 10h-2L0 64l36 17h2L28 91a6 6 0 1 0 9 9l9-10 1 2 17 36 17-36v-2l9 10a6 6 0 1 0 9-9l-9-9 2-1 36-17-36-17-2-1 9-9a6 6 0 1 0-9-9l-9 10v-2Zm-17 2-2 5c-4 8-11 15-19 19l-5 2 5 2c8 4 15 11 19 19l2 5 2-5c4-8 11-15 19-19l5-2-5-2c-8-4-15-11-19-19l-2-5Z`;

const dots = AREA.map((c, i) => `<circle cx="${104 + i * 52}" cy="556" r="15" fill="${c}" />`).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#002E6D"/>
      <stop offset="1" stop-color="#013A86"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <!-- diagonal accent band echoing the hero stripe -->
  <rect x="-100" y="120" width="1500" height="90" transform="rotate(-9 600 315)" fill="#ffffff" opacity="0.05"/>
  <!-- favicon sparkle mark, top-right, white -->
  <g transform="translate(960 70) scale(1.4)" fill="#ffffff" opacity="0.92"><path fill-rule="evenodd" clip-rule="evenodd" d="${MARK}"/></g>
  <!-- eyebrow -->
  <text x="100" y="150" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="6" fill="#9DB6DD">CELLULAR AGRICULTURE × AI</text>
  <!-- wordmark -->
  <text x="96" y="350" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="200" font-weight="800" letter-spacing="-4" fill="#ffffff">CAAIL</text>
  <!-- tagline -->
  <text x="100" y="430" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="40" font-weight="500" fill="#C9D7EC">The curated library at the intersection of</text>
  <text x="100" y="482" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="40" font-weight="500" fill="#C9D7EC">cellular agriculture and artificial intelligence.</text>
  <!-- research-area color dots -->
  ${dots}
  <text x="${104 + 7 * 52 + 8}" y="566" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="24" font-weight="600" fill="#7E9BC9">papers · software · databases · datasets</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica Neue' },
}).render().asPng();

writeFileSync(OUT, png);
console.log(`og-image: wrote ${OUT} (${png.length} bytes)`);
