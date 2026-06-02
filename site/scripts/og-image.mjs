/**
 * og-image.mjs — generates the site-wide social card `public/og.png` (1200×630).
 *
 * Run once (and whenever the brand changes): `node scripts/og-image.mjs`.
 * The PNG is committed as a static asset, so the build never depends on this
 * script or on resvg at build time. On-brand per DESIGN.md §8: Tufts navy
 * field, the CAAIL wordmark + tagline, the stirred-tank bioreactor motif from
 * the homepage hero, and a row of the Okabe–Ito research-area dots — no Tufts
 * logo or seal, and no third-party (e.g. Starlight) artwork.
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/og.png', import.meta.url));

// The 7 Okabe–Ito research-area colors (from tokens.css / DESIGN.md §2).
const AREA = ['#0072B2', '#009E73', '#E69F00', '#56B4E9', '#D55E00', '#CC79A7', '#917800'];
const dots = AREA.map((c, i) => `<circle cx="${104 + i * 52}" cy="556" r="15" fill="${c}" />`).join('');

// Static, recolored-for-dark version of the hero bioreactor (viewBox 300×340):
// white vessel/shaft, light-blue liquid + sparged bubbles, meat-red suspended cells.
const BIOREACTOR = `
  <rect x="62" y="74" width="176" height="214" rx="30" fill="rgba(255,255,255,0.04)" stroke="#ffffff" stroke-width="3"/>
  <rect x="118" y="40" width="64" height="26" rx="6" fill="#ffffff"/>
  <line x1="150" y1="66" x2="150" y2="225" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>
  <rect x="62" y="150" width="176" height="138" rx="26" fill="rgba(157,182,221,0.18)"/>
  <ellipse cx="150" cy="225" rx="34" ry="7" fill="rgba(255,255,255,0.55)"/>
  <circle cx="150" cy="225" r="5" fill="#ffffff"/>
  <circle cx="100" cy="190" r="7" fill="#E0563B"/>
  <circle cx="205" cy="225" r="9" fill="#E0563B"/>
  <circle cx="120" cy="255" r="6" fill="#E0563B"/>
  <circle cx="140" cy="272" r="4" fill="rgba(157,182,221,0.6)"/>
  <circle cx="170" cy="252" r="5" fill="rgba(157,182,221,0.6)"/>
  <circle cx="132" cy="198" r="3.5" fill="rgba(157,182,221,0.6)"/>
  <circle cx="182" cy="238" r="3" fill="rgba(157,182,221,0.6)"/>
  <circle cx="115" cy="235" r="3.5" fill="rgba(157,182,221,0.6)"/>`;

const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#002E6D"/>
      <stop offset="1" stop-color="#013A86"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <!-- diagonal accent band echoing the hero stripe -->
  <rect x="-100" y="110" width="1500" height="90" transform="rotate(-9 600 315)" fill="#ffffff" opacity="0.05"/>
  <!-- bioreactor motif, right side, vertically centered -->
  <g transform="translate(815 95) scale(1.25)">${BIOREACTOR}</g>
  <!-- eyebrow -->
  <text x="100" y="128" font-family="${FONT}" font-size="30" font-weight="700" letter-spacing="6" fill="#9DB6DD">CELLULAR AGRICULTURE × AI</text>
  <!-- wordmark -->
  <text x="96" y="320" font-family="${FONT}" font-size="200" font-weight="800" letter-spacing="-4" fill="#ffffff">CAAIL</text>
  <!-- tagline (kept clear of the bioreactor on the right) -->
  <text x="100" y="408" font-family="${FONT}" font-size="38" font-weight="500" fill="#C9D7EC">The curated library at the</text>
  <text x="100" y="456" font-family="${FONT}" font-size="38" font-weight="500" fill="#C9D7EC">intersection of cellular</text>
  <text x="100" y="504" font-family="${FONT}" font-size="38" font-weight="500" fill="#C9D7EC">agriculture and AI.</text>
  <!-- research-area color dots -->
  ${dots}
  <text x="${104 + 7 * 52 + 8}" y="566" font-family="${FONT}" font-size="24" font-weight="600" fill="#7E9BC9">papers · software · databases · datasets</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica Neue' },
}).render().asPng();

writeFileSync(OUT, png);
console.log(`og-image: wrote ${OUT} (${png.length} bytes)`);
