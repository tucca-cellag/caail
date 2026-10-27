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
 * this is a static check instead: find every gradient that does not interpolate
 * in sRGB, and require there to be none.
 *
 * The file also checks every hex written beside an OKLch token, in tokens.css
 * and DESIGN.md, because it holds the OKLch-to-sRGB conversion that needs.
 */

// src/lib -> src -> site
const SITE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** Where a gradient can be written. Test files are skipped: their fixtures hold gradients on purpose. */
const SCAN_DIRS = ['src', 'public', 'scripts'];
/** Single files outside SCAN_DIRS that can carry a style: the config writes the page head. */
const SCAN_FILES = ['astro.config.mjs'];

/**
 * A colour not known to be legacy sRGB: a wide-gamut colour function;
 * currentColor, which takes the element's `color` (here usually an OKLch
 * token); or a token whose name is computed, such as `var(--caail-area-${key})`.
 * Neither of the last two can be read statically. A gradient that names no
 * interpolation space interpolates in sRGB only when every stop is a legacy
 * colour (hex, a name, rgb(), hsl(), hwb()); one stop written any of these ways
 * makes it OKLab.
 */
const WIDE_GAMUT = /\b(oklch|oklab|lch|lab|color|color-mix)\(|\bcurrentcolor\b|var\(\s*--[\w-]*\$\{/i;

/**
 * A gradient naming its own interpolation space, other than sRGB:
 * `in oklch`, `in display-p3`, `in srgb-linear`. An explicit space replaces the
 * default the stops would set, so hex stops do not keep such a gradient in sRGB,
 * and sRGB is the one space known to take Firefox's fast path. `in srgb` is
 * passed, but it does not excuse wide-gamut stops: whether Firefox takes its
 * fast path for those is unverified.
 */
const NON_SRGB_SPACE = /\bin\s+(?!srgb(?![\w-]))[a-z]/i;

/** The custom properties a piece of CSS reads through var(), fallbacks included. */
function tokensRead(text: string): string[] {
  return [...text.matchAll(/var\(\s*(--[\w-]+)/gi)].map((m) => m[1]);
}

/** CSS with its comments removed, so neither a commented-out rule nor a brace in prose is read. */
function stripCssComments(css: string): string {
  // A quoted string is matched first and kept, so a `/*` inside one opens nothing.
  return css.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\/\*[\s\S]*?\*\//g, (_, quoted?: string) => quoted ?? '');
}

/**
 * A source's text as the scan reads it. Comments are removed only where they
 * are CSS comments: a .css file, and an .astro file's <style> blocks. Script is
 * read whole, because a `/*` in a string there (a glob, say) would open a
 * comment that is not one and hide the code after it. A commented-out gradient
 * in script is flagged rather than hidden, which is the safe way to be wrong.
 */
function scannable(file: string, text: string): string {
  if (file.endsWith('.css')) return stripCssComments(text);
  if (file.endsWith('.astro')) {
    return text.replace(
      /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
      (_, open: string, css: string, close: string) => open + stripCssComments(css) + close,
    );
  }
  return text;
}

/**
 * Every custom-property declaration in a source's scannable text, in order,
 * then each `@property` rule's initial value. The name has to follow a boundary
 * (the start, whitespace, `;`, `{` or the quote opening an inline style), so a
 * selector such as `.badge--on:before {` is not read as one. The boundary is
 * looked behind rather than matched, so `--a:#fff;--b:…` yields both. A value
 * holds no brace and ends at the first semicolon, closing brace or quote, or at
 * the end of the text, so an inline style ends at its own closing quote. A
 * value that itself holds a quote (a font list) is cut short there, which no
 * colour does.
 */
function declarationList(text: string): Array<[string, string]> {
  const plain = [...text.matchAll(/(?<=^|[\s;{"'`])(--[\w-]+)\s*:\s*([^;{}]+?)\s*(?=[;}"'`]|$)/gi)];
  const registered = [...text.matchAll(/@property\s+(--[\w-]+)\s*\{[^}]*?initial-value\s*:\s*([^;}]+)/gi)];
  return [...plain, ...registered].map((m) => [m[1], m[2].trim()]);
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
  const names = new Set<string>();
  const reads = new Map<string, string[]>();
  for (const text of texts) {
    for (const [name, value] of declarationList(text)) {
      if (WIDE_GAMUT.test(value)) names.add(name);
      reads.set(name, [...(reads.get(name) ?? []), ...tokensRead(value)]);
    }
  }
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, read] of reads) {
      if (!names.has(name) && read.some((t) => names.has(t))) {
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

/** True when one gradient's argument text interpolates outside sRGB. */
function isOklab(args: string, tokens: Set<string>): boolean {
  return WIDE_GAMUT.test(args) || NON_SRGB_SPACE.test(args) || tokensRead(args).some((t) => tokens.has(t));
}

/** The gradients in a source's scannable text that interpolate outside sRGB. */
function oklabGradients(text: string, tokens: Set<string>): string[] {
  return gradientArgs(text).filter((args) => isOklab(args, tokens));
}

let sourcesCache: Array<[string, string]> | undefined;

/**
 * Every .astro, .css, script (.js, .jsx, .mjs, .ts, .tsx), .md and .mdx file
 * under SCAN_DIRS, test files aside, and every file in SCAN_FILES, with its
 * scannable text, read once. Generated JSON holds no styles and is not read.
 */
function sources(): Array<[string, string]> {
  if (sourcesCache) return sourcesCache;
  const out: Array<[string, string]> = [];
  const read = (full: string) => out.push([full, scannable(full, readFileSync(full, 'utf-8'))]);
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(astro|css|m?[jt]sx?|mdx?)$/.test(e.name) && !/\.test\.m?[jt]sx?$/.test(e.name)) read(full);
    }
  };
  for (const d of SCAN_DIRS) walk(join(SITE_ROOT, d));
  for (const f of SCAN_FILES) read(join(SITE_ROOT, f));
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

/**
 * A token's OKLch value as the coordinates oklchToSrgb255 takes, or undefined
 * when it is not in the `oklch(L% C H)` form every token here uses. Every
 * caller reports undefined as a failure, so another valid form (a unitless L,
 * a `deg` hue, an alpha) fails loudly instead of going unchecked.
 */
function parseOklch(value: string): [number, number, number] | undefined {
  const m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value.trim());
  return m ? [Number(m[1]) / 100, Number(m[2]), Number(m[3])] : undefined;
}

/**
 * Slack on each linear-light channel before a colour counts as outside sRGB, so
 * the rounding in a token's typed digits does not push an edge colour out.
 */
const GAMUT_SLACK = 1e-4;

/**
 * OKLch to gamma-encoded sRGB channels on 0-255, by Ottosson's OKLab matrices,
 * or undefined for a colour outside sRGB. No sRGB copy can equal such a colour,
 * and clipping it would hand the copy test a value it then calls equal.
 */
function oklchToSrgb255(l: number, c: number, hueDeg: number): number[] | undefined {
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
  if (linear.some((v) => v < -GAMUT_SLACK || v > 1 + GAMUT_SLACK)) return undefined;
  return linear.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  });
}

/** Each top-level block of a stylesheet, as its selector or at-rule prelude and its body, nested blocks kept. */
function topLevelBlocks(css: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let depth = 0;
  let from = 0;
  let open = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0) open = i;
      depth++;
    } else if (css[i] === '}' && depth > 0 && --depth === 0) {
      out.push([css.slice(from, open).trim(), css.slice(open + 1, i)]);
      from = i + 1;
    }
  }
  return out;
}

const THEME_SELECTORS = { light: ':root', dark: ":root[data-theme='dark']" };

let tokenThemesCache: Record<'light' | 'dark', Map<string, string>> | undefined;

/**
 * A token sheet's light values, from its one `:root` block, and its dark values,
 * from its one dark block, with the light ones they do not override. Any other
 * block is left to the test that keeps copies and sources out of it. With no
 * sheet given it reads tokens.css, once.
 */
function themes(css?: string): Record<'light' | 'dark', Map<string, string>> {
  if (css === undefined) {
    return (tokenThemesCache ??= themes(stripCssComments(readFileSync(join(SITE_ROOT, 'src/styles/tokens.css'), 'utf-8'))));
  }
  const blocks = topLevelBlocks(css);
  const block = (selector: string) => {
    const found = blocks.filter(([s]) => s === selector);
    if (found.length !== 1) throw new Error(`the token sheet has ${found.length} ${selector} blocks; the copy check reads exactly one`);
    return declarations(found[0][1]);
  };
  const light = block(THEME_SELECTORS.light);
  const dark = block(THEME_SELECTORS.dark);
  if (light.size === 0 || dark.size === 0) throw new Error('the token sheet: a theme block declared no tokens');
  return { light, dark: new Map([...light, ...dark]) };
}

/** Repo-relative, POSIX-separated, so a failure names a file the same way on any platform. */
function posixRelative(file: string): string {
  return relative(SITE_ROOT, file).split(sep).join('/');
}

describe('the detector, on fixtures', () => {
  const tokens = wideGamutTokens([
    ':root { --link: oklch(52% 0.11 256); --plain: #3172ae; }',
    ':root { --alias: var(--link); --alias2: var( --alias, red ); }',
    '.badge--on:before { color: red; } /* --commented: oklch(1 0 0); */',
    ':root{--compact:#fff;--packed:oklch(50% 0.1 200);}',
    '.x { --unterminated: oklch(52% 0.11 256) }',
    ':root { --under_score: oklch(52% 0.11 256); }',
    '<div style="--inline:oklch(50% 0.1 200)"></div>',
    '<div style="--inline2: oklch(1 0 0)" class="a">{foo}</div>',
    '@property --registered { syntax: "<color>"; inherits: false; initial-value: oklch(50% 0.1 200); }',
  ].map((css) => scannable('fixture.css', css)));

  it('resolves wide-gamut tokens through aliases, and reads no selector or comment as one', () => {
    expect([...tokens].sort()).toEqual([
      '--alias',
      '--alias2',
      '--inline',
      '--inline2',
      '--link',
      '--packed',
      '--registered',
      '--under_score',
      '--unterminated',
    ]);
  });

  it.each([
    ['a wide-gamut token', 'linear-gradient(90deg, var(--link), #fff)'],
    ['a token read with spaces', 'linear-gradient(var( --link ), #fff)'],
    ['a token read with a fallback', 'linear-gradient(var(--link, #3172ae), #fff)'],
    ['an alias of a wide-gamut token', 'linear-gradient(var(--alias2), #fff)'],
    ['a token with an underscore in its name', 'linear-gradient(var(--under_score), #fff)'],
    ['a currentColor stop', 'linear-gradient(currentColor, transparent)'],
    ['a token whose name is computed', 'linear-gradient(90deg, var(--caail-area-${key}), transparent)'],
    ['an oklch() stop', 'linear-gradient(oklch(52% 0.11 256), #fff)'],
    ['a lab() stop', 'linear-gradient(lab(50% 20 30), #fff)'],
    ['an lch() stop', 'linear-gradient(lch(50% 20 30), #fff)'],
    ['a color() stop', 'linear-gradient(color(display-p3 1 0 0), #fff)'],
    ['a color-mix() stop', 'repeating-linear-gradient(45deg, color-mix(in oklab, red 35%, transparent), transparent 6px)'],
    ['hex stops in an OKLch space', 'linear-gradient(in oklch 90deg, #002e6d, #3172ae)'],
    ['hex stops in linear sRGB', 'linear-gradient(in srgb-linear, #002e6d, #3172ae)'],
  ])('flags a gradient built from %s', (_, css) => {
    expect(oklabGradients(scannable('fixture.css', css), tokens)).toHaveLength(1);
  });

  it.each([
    ['a `/*` in a CSS string', 'fixture.css', 'a::after { content: "/*"; background: linear-gradient(var(--link), #fff); } /* end */'],
    ['a glob string in script', 'fixture.ts', "const glob = '**/*.md';\nconst bg = 'linear-gradient(var(--link), #fff)';\n/** a doc comment */"],
  ])('still flags a gradient that follows %s', (_, file, text) => {
    expect(oklabGradients(scannable(file, text), tokens)).toHaveLength(1);
  });

  it.each([
    ['sRGB token copies', 'linear-gradient(90deg, var(--link-srgb), var(--plain))'],
    ['hex and rgb() stops', 'linear-gradient(#002e6d, rgb(59, 106, 167))'],
    ['hex stops in an sRGB space', 'linear-gradient(in srgb 90deg, #002e6d, #3172ae)'],
    ['a gradient inside a comment', '/* linear-gradient(var(--link), #fff) */'],
  ])('passes a gradient built from %s', (_, css) => {
    expect(oklabGradients(scannable('fixture.css', css), tokens)).toEqual([]);
  });
});

describe('reading the two theme blocks of a token sheet', () => {
  const dark = ":root[data-theme='dark'] { --b: rgb(4, 5, 6); }";

  it('takes light values from the :root block alone, not from an @media block before the dark one', () => {
    const { light } = themes(`:root { --a: rgb(1, 2, 3); } @media (prefers-contrast: more) { :root { --a: rgb(9, 9, 9); } } ${dark}`);
    expect(light.get('--a')).toBe('rgb(1, 2, 3)');
  });

  it('refuses a second dark block rather than reading only the first', () => {
    expect(() => themes(`:root { --a: rgb(1, 2, 3); } ${dark} ${dark}`)).toThrow(/2 :root\[data-theme='dark'\] blocks/);
  });
});

describe('the OKLch to sRGB conversion', () => {
  it('renders sRGB red from its OKLch coordinates', () => {
    expect(oklchToSrgb255(0.62796, 0.25768, 29.2339)?.map(Math.round)).toEqual([255, 0, 0]);
  });

  it('refuses a colour outside sRGB rather than clipping it into a copy', () => {
    expect(oklchToSrgb255(0.7, 0.4, 150)).toBeUndefined();
  });
});

describe('gradient colour space (Firefox paint cost)', () => {
  let wideCache: Set<string> | undefined;
  const tokens = () => (wideCache ??= wideGamutTokens(sources().map(([, text]) => text)));

  it('finds the OKLch tokens it needs to reason about, aliases included', () => {
    // Sanity: if tokens.css stops being OKLch-authored this guard is inert,
    // and silently passing would be worse than failing.
    const found = tokens();
    expect(found.size).toBeGreaterThan(5);
    expect(found.has('--caail-primary')).toBe(true);
    expect(found.has('--caail-link')).toBe(true);
    expect(found.has('--sl-color-accent')).toBe(true);
  });

  it('interpolates every gradient in sRGB', () => {
    // Every gradient takes sRGB stops, from the copies in SRGB_COPIES. One built
    // from a wide-gamut colour, from color-mix(), from a token CSS declares as
    // one (directly or through var() aliases), or naming a space other than
    // sRGB, fails here: give it sRGB stops. A colour a script sets at runtime is
    // not seen: --chip, set inline from theme-colors.ts, is caught only because
    // the stylesheets declare its default as an OKLch token.
    const wide = tokens();
    const found: Record<string, number> = {};
    for (const [file, text] of sources()) {
      const hits = oklabGradients(text, wide);
      if (hits.length > 0) found[posixRelative(file)] = hits.length;
    }
    expect(found).toEqual({});
  });

  it("declares every copy, and the token it copies, in tokens.css's theme blocks alone", () => {
    // The equality check below reads those two blocks, so a copy or a source
    // redeclared anywhere else, another block of tokens.css included, would
    // drift from it unseen.
    const watched = new Set(SRGB_COPIES.flatMap(([copy, source]) => [copy, source]));
    const theming = new Set(Object.values(THEME_SELECTORS));
    const elsewhere: string[] = [];
    for (const [file, text] of sources()) {
      const where = posixRelative(file);
      const outside =
        where === 'src/styles/tokens.css'
          ? topLevelBlocks(text).filter(([selector]) => !theming.has(selector)).map(([selector, body]) => `${selector} {${body}}`).join('\n')
          : text;
      for (const [name] of declarationList(outside)) if (watched.has(name)) elsewhere.push(`${where}: ${name}`);
    }
    expect(elsewhere).toEqual([]);
  });

  it('lists every sRGB copy, in tokens.css or anywhere else, as a checked one', () => {
    // A copy is found by its form or its name: in tokens.css, an rgb()/rgba()
    // value; anywhere scanned, a name ending -srgb in any format. The equality
    // check below parses rgb()/rgba() only, so that is the form a copy takes. A
    // hex value under another name is not recognised as a copy at all (the area
    // palette is hex on purpose, and copies nothing), and an rgba() outside
    // tokens.css is an ordinary colour, such as a shadow.
    const listed = new Set(SRGB_COPIES.map(([copy]) => copy));
    const unlisted = new Set<string>();
    for (const tokensIn of Object.values(themes())) {
      for (const [name, value] of tokensIn) {
        if ((/^rgba?\(/.test(value) || name.endsWith('-srgb')) && !listed.has(name)) unlisted.add(name);
      }
    }
    for (const [file, text] of sources()) {
      for (const [name] of declarationList(text)) {
        if (name.endsWith('-srgb') && !listed.has(name)) unlisted.add(`${posixRelative(file)}: ${name}`);
      }
    }
    expect([...unlisted]).toEqual([]);
  });

  it('keeps every sRGB copy equal to the OKLch token it copies, in both themes', () => {
    const wrong: string[] = [];
    for (const [theme, tokensIn] of Object.entries(themes())) {
      for (const [copy, source, alpha] of SRGB_COPIES) {
        const src = parseOklch(tokensIn.get(source) ?? '');
        const got = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(tokensIn.get(copy) ?? '');
        if (!src || !got) {
          wrong.push(`${theme} ${copy}: ${tokensIn.get(copy)} does not parse against ${source}: ${tokensIn.get(source)}`);
          continue;
        }
        const rendered = oklchToSrgb255(...src);
        if (!rendered) {
          wrong.push(`${theme} ${copy}: ${source} is ${tokensIn.get(source)}, outside sRGB, so no sRGB copy can equal it`);
          continue;
        }
        const want = rendered.map(Math.round);
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
    const hero = scannable('Hero.astro', readFileSync(join(SITE_ROOT, 'src/components/Hero.astro'), 'utf-8'));
    const at = hero.indexOf('.hero-stripe::before');
    // Asserted separately so a renamed selector fails with "the rule moved"
    // rather than a confusing empty-gradient mismatch further down.
    expect(at, 'Hero.astro no longer has a .hero-stripe::before rule').toBeGreaterThan(-1);
    const gradient = gradientArgs(hero.slice(at))[0] ?? '';
    expect(gradient).toContain('--caail-hero-stripe-from');
    expect(gradient).toContain('--caail-hero-stripe-to');
    expect(isOklab(gradient, tokens()), `the hero stripe interpolates outside sRGB: ${gradient}`).toBe(false);
  });
});

describe('the hex written beside each OKLch token', () => {
  // A hex typed beside an OKLch value is a second copy of it, so each is
  // recomputed here. The first hex in a token's comment is its sRGB rendering;
  // a later one is a different fact and is not checked. A token outside sRGB
  // has no single rendering (an sRGB screen maps it, a P3 one paints it), so it
  // carries no hex: bring it into sRGB or leave the hex out. A ~ is refused too,
  // since every hex this check accepts is the token's rendering, not near it.
  const hex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

  it('matches the rendering in each tokens.css comment', () => {
    const raw = readFileSync(join(SITE_ROOT, 'src/styles/tokens.css'), 'utf-8');
    const wrong: string[] = [];
    const read = new Set<number>();
    for (const m of raw.matchAll(/(--[\w-]+)\s*:\s*(oklch\([^)]*\))\s*;[ \t]*\/\*(.*?)\*\//g)) {
      const written = /(~?)(#[0-9a-f]{3,8})\b/i.exec(m[3]);
      if (!written) continue;
      const line = raw.slice(0, m.index).split('\n').length;
      read.add(line);
      if (written[2].length !== 7) {
        wrong.push(`line ${line} ${m[1]}: write ${written[2]} as a six-digit hex, the form this check compares`);
        continue;
      }
      const src = parseOklch(m[2]);
      if (!src) {
        wrong.push(`line ${line} ${m[1]}: ${m[2]} is not in the oklch(L% C H) form this check reads`);
        continue;
      }
      const rendered = oklchToSrgb255(...src);
      if (!rendered) {
        wrong.push(`line ${line} ${m[1]}: ${m[2]} is outside sRGB, so no hex can be written beside it`);
      } else if (written[1] || written[2].toUpperCase() !== hex(rendered)) {
        wrong.push(`line ${line} ${m[1]}: the comment says ${written[0]}, the token renders ${hex(rendered)}`);
      }
    }
    // A hex beside an OKLch token in any other shape (the comment before the
    // semicolon, no semicolon) is reported rather than passed over unread.
    for (const [i, text] of raw.split('\n').entries()) {
      if (/--[\w-]+\s*:\s*oklch\(/i.test(text) && /#[0-9a-f]{3,8}\b/i.test(text) && !read.has(i + 1)) {
        wrong.push(`line ${i + 1}: an OKLch token with a hex this check cannot read; write it as --name: oklch(…); /* #hex */`);
      }
    }
    expect(read.size, 'no hex comments found, so nothing was checked').toBeGreaterThan(10);
    expect(wrong).toEqual([]);
  });

  it("matches the light value in DESIGN.md's token tables and density ramp", () => {
    const design = readFileSync(join(SITE_ROOT, '../DESIGN.md'), 'utf-8');
    const { light } = themes();
    // A hex is compared with the token's own hex (the palette written in hex)
    // or its sRGB rendering; an oklch() is compared as written. A token that
    // gives neither answers with a description, which no hex equals.
    const actual = (name: string, written: string): string => {
      const value = light.get(name) ?? `nothing (no ${name})`;
      if (!written.startsWith('#')) return value;
      if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
      const src = parseOklch(value);
      const rendered = src && oklchToSrgb255(...src);
      return rendered ? hex(rendered) : `${value}, which has no single sRGB hex`;
    };
    const pairs: Array<[string, string]> = [];
    for (const m of design.matchAll(/^\|[^\n]*?`(--caail-[\w-]+)`[^\n]*?`(#[0-9a-f]{6}|oklch\([^)]*\))`/gim)) {
      pairs.push([m[1], m[2]]);
    }
    const ramp = /`--caail-density-0\.\.\d` \(`([^`]+)`\)/.exec(design);
    expect(ramp, 'DESIGN.md no longer gives the density ramp in the form this test reads').not.toBeNull();
    for (const [i, written] of (ramp?.[1].match(/#[0-9a-f]{6}/gi) ?? []).entries()) pairs.push([`--caail-density-${i}`, written]);
    expect(pairs.length, 'too few token values found in DESIGN.md, so the reader has drifted').toBeGreaterThan(15);
    const wrong = pairs
      .filter(([name, written]) => actual(name, written) !== (written.startsWith('#') ? written.toUpperCase() : written))
      .map(([name, written]) => `${name}: DESIGN.md says ${written}, tokens.css gives ${actual(name, written)}`);
    expect(wrong).toEqual([]);
  });
});
