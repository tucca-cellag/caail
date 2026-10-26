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
/** Where a gradient can be written. Test files are skipped: their fixtures hold gradients on purpose. */
const SCAN_DIRS = ['src/components', 'src/styles', 'src/lib'];

/**
 * Known oklab-interpolating gradients, by file, with how many that file has.
 *
 * Empty, and meant to stay empty: every gradient takes sRGB stops, from the
 * copies of the OKLch tokens listed in SRGB_COPIES below. If you add a gradient
 * built from a wide-gamut colour, from a token that resolves to one, or from
 * color-mix(), this test fails. Give it sRGB stops rather than an entry here.
 */
const KNOWN_OKLAB_GRADIENTS: Record<string, number> = {};

/**
 * A colour function that is not legacy sRGB. CSS Images 4 interpolates a
 * gradient in sRGB only when every stop is a legacy colour (hex, a name, rgb(),
 * hsl(), hwb()); one stop written any of these ways makes it OKLab.
 */
const WIDE_GAMUT = /\b(oklch|oklab|lch|lab|color|color-mix)\(/i;

/** True when `text` reads the custom property `name`, spaces or a fallback included. */
function usesToken(text: string, name: string): boolean {
  return new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(text);
}

/** CSS with its comments removed, so neither a commented-out rule nor a brace in prose is read. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Every custom-property declaration in a piece of CSS, in order. The name has
 * to follow a boundary, so a selector such as `.badge--on:before {` is not
 * read as one, and the value stops at a semicolon and holds no brace.
 */
function declarationList(css: string): Array<[string, string]> {
  return [...stripComments(css).matchAll(/(?:^|[\s;{])(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)].map((m) => [
    m[1],
    m[2].trim(),
  ]);
}

/** The custom properties a piece of CSS declares, the last declaration winning. */
function declarations(css: string): Map<string, string> {
  return new Map(declarationList(css));
}

/**
 * Custom properties that resolve to a wide-gamut colour, given the files that
 * declare them: written in a wide-gamut function, or reading such a property,
 * transitively. `--sl-color-accent: var(--caail-link)` is as OKLab as
 * `--caail-link` itself, so a gradient built from the alias is caught.
 */
function wideGamutTokens(texts: string[]): Set<string> {
  const declared = new Map<string, string>();
  for (const text of texts) {
    for (const [name, value] of declarationList(text)) declared.set(name, `${declared.get(name) ?? ''} ${value}`);
  }
  const names = new Set([...declared].filter(([, value]) => WIDE_GAMUT.test(value)).map(([name]) => name));
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, value] of declared) {
      if (!names.has(name) && [...names].some((t) => usesToken(value, t))) {
        names.add(name);
        grew = true;
      }
    }
  }
  return names;
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

/** The gradients in a piece of CSS or code that interpolate in OKLab. */
function oklabGradients(text: string, tokens: Set<string>): string[] {
  return gradientArgs(stripComments(text)).filter(
    (args) => WIDE_GAMUT.test(args) || [...tokens].some((t) => usesToken(args, t)),
  );
}

let sourcesCache: Array<[string, string]> | undefined;

/** Every .astro, .css, .ts and .tsx file under SCAN_DIRS, test files aside, with its text, read once. */
function sources(): Array<[string, string]> {
  if (sourcesCache) return sourcesCache;
  const out: Array<[string, string]> = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(astro|css|tsx?)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        out.push([full, readFileSync(full, 'utf-8')]);
      }
    }
  };
  for (const d of SCAN_DIRS) walk(join(SITE_ROOT, d));
  sourcesCache = out;
  return out;
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

/** tokens.css's light values, and its dark values with the light ones they do not override. */
function themes(): Record<'light' | 'dark', Map<string, string>> {
  const css = stripComments(readFileSync(join(SITE_ROOT, 'src/styles/tokens.css'), 'utf-8'));
  const darkAt = css.indexOf(":root[data-theme='dark']");
  if (darkAt < 0) throw new Error("tokens.css has no :root[data-theme='dark'] block, so the dark theme is unchecked");
  const light = declarations(css.slice(0, darkAt));
  const dark = declarations(css.slice(darkAt, css.indexOf('}', darkAt)));
  if (light.size === 0 || dark.size === 0) throw new Error('tokens.css: a theme block declared no tokens');
  return { light, dark: new Map([...light, ...dark]) };
}

/** Repo-relative, POSIX-separated, so the inventory keys match on any platform. */
function posixRelative(file: string): string {
  return relative(SITE_ROOT, file).split(sep).join('/');
}

describe('the detector, on fixtures', () => {
  const tokens = wideGamutTokens([
    ':root { --link: oklch(52% 0.11 256); --plain: #3172ae; }',
    ':root { --alias: var(--link); --alias2: var( --alias, red ); }',
    '.badge--on:before { color: red; } /* --commented: oklch(1 0 0); */',
  ]);

  it('resolves wide-gamut tokens through aliases, and reads no selector or comment as one', () => {
    expect([...tokens].sort()).toEqual(['--alias', '--alias2', '--link']);
  });

  it.each([
    ['a wide-gamut token', 'linear-gradient(90deg, var(--link), #fff)'],
    ['a token read with spaces', 'linear-gradient(var( --link ), #fff)'],
    ['a token read with a fallback', 'linear-gradient(var(--link, #3172ae), #fff)'],
    ['an alias of a wide-gamut token', 'linear-gradient(var(--alias2), #fff)'],
    ['an oklch() stop', 'linear-gradient(oklch(52% 0.11 256), #fff)'],
    ['a lab() stop', 'linear-gradient(lab(50% 20 30), #fff)'],
    ['an lch() stop', 'linear-gradient(lch(50% 20 30), #fff)'],
    ['a color() stop', 'linear-gradient(color(display-p3 1 0 0), #fff)'],
    ['a color-mix() stop', 'repeating-linear-gradient(45deg, color-mix(in oklab, red 35%, transparent), transparent 6px)'],
  ])('flags a gradient built from %s', (_, css) => {
    expect(oklabGradients(css, tokens)).toHaveLength(1);
  });

  it.each([
    ['sRGB token copies', 'linear-gradient(90deg, var(--link-srgb), var(--plain))'],
    ['hex and rgb() stops', 'linear-gradient(#002e6d, rgb(59, 106, 167))'],
    ['a gradient inside a comment', '/* linear-gradient(var(--link), #fff) */'],
  ])('passes a gradient built from %s', (_, css) => {
    expect(oklabGradients(css, tokens)).toEqual([]);
  });
});

describe('gradient colour space (Firefox paint cost)', () => {
  const tokens = () => wideGamutTokens(sources().map(([, text]) => text));

  it('finds the OKLch tokens it needs to reason about, aliases included', () => {
    // Sanity: if tokens.css stops being OKLch-authored this guard is inert,
    // and silently passing would be worse than failing.
    const found = tokens();
    expect(found.size).toBeGreaterThan(5);
    expect(found.has('--caail-primary')).toBe(true);
    expect(found.has('--caail-link')).toBe(true);
    expect(found.has('--sl-color-accent')).toBe(true);
  });

  it('introduces no new oklab-interpolating gradients', () => {
    const wide = tokens();
    const found: Record<string, number> = {};
    for (const [file, text] of sources()) {
      const hits = oklabGradients(text, wide);
      if (hits.length > 0) found[posixRelative(file)] = hits.length;
    }
    expect(found).toEqual(KNOWN_OKLAB_GRADIENTS);
  });

  it('lists every sRGB token in tokens.css as a checked copy', () => {
    // An rgb()/rgba() token, or one named as a copy whatever its format, so a
    // copy written in hex cannot skip the conversion check.
    const listed = new Set(SRGB_COPIES.map(([copy]) => copy));
    const unlisted = new Set<string>();
    for (const tokensIn of Object.values(themes())) {
      for (const [name, value] of tokensIn) {
        if ((/^rgba?\(/.test(value) || name.endsWith('-srgb')) && !listed.has(name)) unlisted.add(name);
      }
    }
    expect([...unlisted]).toEqual([]);
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
