import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards against re-introducing the Firefox homepage scroll jank.
 *
 * A CSS gradient whose stops are oklch/oklab — written literally, produced by
 * `color-mix(in oklab, …)`, or pulled in via one of this project's OKLch design
 * tokens — interpolates in oklab (CSS Color 4). Firefox performs that
 * interpolation per-pixel on the CPU rather than on the GPU, so a large gradient
 * that repaints during scroll costs real frame time; the cost scales with the
 * painted area. Chromium caches the rasterization, so the symptom is
 * Firefox-only and easy to miss.
 *
 * That is what happened to `.hero-stripe`: a full-bleed (100vw) rotated band
 * whose stops came from `color-mix(in oklab, …)`. Scrolling the homepage janked
 * in Firefox and got worse as the window widened. The fix was to give it sRGB
 * stops, which take the GPU path.
 *
 * A frame-timing test would not catch this — headless and headed Playwright
 * Firefox both scrolled at a clean 60fps while a real Firefox janked badly. So
 * this is a static check instead: find every gradient that interpolates in
 * oklab and require the set to match a reviewed inventory.
 */

// src/lib -> src -> site
const SITE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCAN_DIRS = ['src/components', 'src/styles'];

/**
 * Known oklab-interpolating gradients, by file, with how many that file has.
 *
 * These are small or text-sized and none has been reported as costly, so they
 * are recorded rather than rewritten. If you add a gradient built from OKLch
 * tokens or color-mix(), this test fails: either give it sRGB stops (required
 * for anything large, full-bleed, animated, or repainted during scroll) or add
 * it here with a note saying why it is safe.
 */
const KNOWN_OKLAB_GRADIENTS: Record<string, number> = {
  // .h-title — the "Cell Ag × AI" hero wordmark, clipped to text.
  'src/components/Hero.astro': 1,
  // .md-row.stub .md-fill.species — a small hatched bar on /by-the-numbers/.
  'src/components/MetricsDashboard.astro': 1,
  // a.site-title — the header wordmark's sweep, clipped to text.
  'src/styles/starlight-overrides.css': 1,
};

/** Custom properties in tokens.css authored in a wide-gamut space. */
function wideGamutTokens(): Set<string> {
  const css = readFileSync(join(SITE_ROOT, 'src/styles/tokens.css'), 'utf-8');
  const names = new Set<string>();
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    if (/\b(oklch|oklab)\(/i.test(m[2])) names.add(m[1]);
  }
  return names;
}

/** Every .astro/.css file under the scanned directories, recursively. */
function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(astro|css)$/.test(e.name)) out.push(full);
    }
  };
  for (const d of SCAN_DIRS) walk(join(SITE_ROOT, d));
  return out;
}

/**
 * Extract each gradient's argument text, respecting nested parentheses.
 *
 * `re.lastIndex` is advanced past the whole gradient after each match, so a
 * nested gradient is counted once as part of its parent rather than twice.
 */
function gradientArgs(css: string): string[] {
  const found: string[] = [];
  const re = /(?:repeating-)?(?:linear|radial|conic)-gradient\(/gi;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '(') depth++;
      else if (css[i] === ')') depth--;
    }
    found.push(css.slice(start, i - 1));
    re.lastIndex = i;
  }
  return found;
}

/** Repo-relative, POSIX-separated, so the inventory keys match on any platform. */
function posixRelative(file: string): string {
  return relative(SITE_ROOT, file).split(sep).join('/');
}

describe('gradient colour space (Firefox paint cost)', () => {
  const tokens = wideGamutTokens();

  it('finds the OKLch tokens it needs to reason about', () => {
    // Sanity: if tokens.css stops being OKLch-authored this guard is inert,
    // and silently passing would be worse than failing.
    expect(tokens.size).toBeGreaterThan(5);
    expect(tokens.has('--caail-primary')).toBe(true);
    expect(tokens.has('--caail-link')).toBe(true);
  });

  it('introduces no new oklab-interpolating gradients', () => {
    const found: Record<string, number> = {};
    for (const file of sources()) {
      const css = readFileSync(file, 'utf-8');
      const hits = gradientArgs(css).filter(
        (args) =>
          /\b(color-mix|oklch|oklab)\(/i.test(args) ||
          [...tokens].some((t) => args.includes(`var(${t})`)),
      );
      if (hits.length > 0) found[posixRelative(file)] = hits.length;
    }
    expect(found).toEqual(KNOWN_OKLAB_GRADIENTS);
  });

  it('keeps the hero stripe stops in sRGB', () => {
    const tokensCss = readFileSync(join(SITE_ROOT, 'src/styles/tokens.css'), 'utf-8');
    const stops = [...tokensCss.matchAll(/--caail-hero-stripe-(?:from|to)\s*:\s*([^;]+);/g)].map(
      (m) => m[1].trim(),
    );
    // One pair per theme (light + dark).
    expect(stops).toHaveLength(4);
    for (const stop of stops) {
      expect(stop, `hero stripe stop must be sRGB, got: ${stop}`).toMatch(/^rgba?\(/);
    }
  });

  it('builds the hero stripe gradient from those tokens, not inline colours', () => {
    const hero = readFileSync(join(SITE_ROOT, 'src/components/Hero.astro'), 'utf-8');
    const at = hero.indexOf('.hero-stripe::before');
    // Asserted separately so a renamed selector fails with "the rule moved"
    // rather than a confusing empty-gradient mismatch further down.
    expect(at, 'Hero.astro no longer has a .hero-stripe::before rule').toBeGreaterThan(-1);
    const gradient = gradientArgs(hero.slice(at))[0] ?? '';
    expect(gradient).toContain('--caail-hero-stripe-from');
    expect(gradient).toContain('--caail-hero-stripe-to');
    expect(gradient).not.toMatch(/\b(color-mix|oklch|oklab)\(/i);
  });
});
