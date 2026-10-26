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
 * Empty, and meant to stay empty: every gradient takes sRGB stops, from the
 * `-srgb` copies of the OKLch tokens in tokens.css. If you add a gradient built
 * from OKLch tokens or color-mix(), this test fails. Give it sRGB stops rather
 * than an entry here.
 */
const KNOWN_OKLAB_GRADIENTS: Record<string, number> = {};

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

/**
 * sRGB tokens that copy an OKLch token, as [copy, source, alpha]. The copies
 * exist only so gradients can take sRGB stops; their numbers are typed by hand
 * beside the OKLch values they stand for, so the test below recomputes each one
 * rather than trusting the comment that says to keep them in step.
 */
const SRGB_COPIES: Array<[string, string, number]> = [
  ['--caail-primary-srgb', '--caail-primary', 1],
  ['--caail-link-srgb', '--caail-link', 1],
  ['--caail-stub-hatch', '--caail-accent', 0.35],
  ['--caail-hero-stripe-from', '--caail-link', 0.24],
  ['--caail-hero-stripe-to', '--caail-primary', 0.16],
];

/** OKLch to gamma-encoded sRGB channels on 0-255, by Ottosson's OKLab matrices. */
function oklchToSrgb255(l: number, c: number, hueDeg: number): number[] {
  const a = c * Math.cos((hueDeg * Math.PI) / 180);
  const b = c * Math.sin((hueDeg * Math.PI) / 180);
  const lms = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((v) => v ** 3);
  const linear = [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ];
  return linear.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  });
}

/** Custom properties declared in one block of CSS. */
function declarations(block: string): Map<string, string> {
  return new Map([...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((m) => [m[1], m[2].trim()]));
}

/** tokens.css's light values, and its dark values with the light ones they do not override. */
function themes(): Record<'light' | 'dark', Map<string, string>> {
  const css = readFileSync(join(SITE_ROOT, 'src/styles/tokens.css'), 'utf-8');
  const darkAt = css.indexOf(":root[data-theme='dark']");
  const light = declarations(css.slice(0, darkAt));
  const dark = declarations(css.slice(darkAt, css.indexOf('}', darkAt)));
  return { light, dark: new Map([...light, ...dark]) };
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

  it('keeps every sRGB copy equal to the OKLch token it copies, in both themes', () => {
    const wrong: string[] = [];
    for (const [theme, tokensIn] of Object.entries(themes())) {
      for (const [copy, source, alpha] of SRGB_COPIES) {
        const src = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(tokensIn.get(source) ?? '');
        const got = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(tokensIn.get(copy) ?? '');
        if (!src || !got) {
          wrong.push(`${theme} ${copy}: ${tokensIn.get(copy)} does not parse against ${source}: ${tokensIn.get(source)}`);
          continue;
        }
        const want = oklchToSrgb255(Number(src[1]) / 100, Number(src[2]), Number(src[3])).map(Math.round);
        const have = [Number(got[1]), Number(got[2]), Number(got[3])];
        const haveAlpha = got[4] === undefined ? 1 : Number(got[4]);
        if (have.join() !== want.join() || haveAlpha !== alpha) {
          wrong.push(`${theme} ${copy}: ${have} at ${haveAlpha}, but ${source} is ${want} at ${alpha}`);
        }
      }
    }
    expect(wrong).toEqual([]);
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
