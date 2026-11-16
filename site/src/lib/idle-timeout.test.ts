/**
 * idle-timeout.test.ts: every idle wait under site/src is bounded by `IDLE_TIMEOUT_MS`, and that
 * value is the delay Astro's idle directive already uses where a browser has no
 * `requestIdleCallback` (tucca-cellag/caail-planning#604).
 *
 * The bound fixed a bug of one shape at each place it occurred, so the scan below is what stops
 * the next idle wait reintroducing it: a page that never goes idle never ran an unbounded one.
 * The delay lives inside Astro, so the parity checks read the installed directive, both the
 * source module and the minified copy pages inline, and fail if either stops matching.
 *
 * The scan counts tokens rather than parsing the code around them. Every `client:idle` must be
 * written `client:idle={{ timeout: IDLE_TIMEOUT_MS }}`, and `requestIdleCallback` may appear only
 * inside `onIdle` in `idle-timeout.ts`, the bounded way to ask for one. A token written as a
 * Markdown code span, directly after a backtick, is let through where it can only be words: on
 * a comment line in script, and on a prose line of Markdown. In code the same backtick opens a
 * template literal, which can become running code (`set:html`, `new Function`), so it is held
 * to the rules like any other token. A pattern that parses the tag or the call around a token
 * misses a `>` inside the tag, an
 * optional call and an alias, and fails a correct call with an inline arrow callback. Counting
 * tokens can only err loudly, on code that is correct but spelled differently, which is the
 * direction a guard should err in.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IDLE_TIMEOUT_MS, onIdle } from './idle-timeout';

const require = createRequire(import.meta.url);
const ASTRO_CLIENT = join(dirname(require.resolve('astro/package.json')), 'dist', 'runtime', 'client');
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The one module allowed to ask the browser for an idle callback, relative to `SRC`. */
const HELPER = 'lib/idle-timeout.ts';

/** Whether a file named `name` is one an island directive or an idle callback could sit in, tests excepted. */
function isScanned(name: string): boolean {
  return /\.(astro|mdx|md|[cm]?[jt]sx?)$/.test(name) && !/\.test\.[cm]?[jt]sx?$/.test(name);
}

/** The scanned files under `dir`. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return isScanned(name) ? [path] : [];
  });
}

/** The one way an island may be written idle. */
const BOUNDED_DIRECTIVE = 'client:idle={{ timeout: IDLE_TIMEOUT_MS }}';

/** How a file's text is read: as script with comments in it, or as Markdown prose with code in it. */
type Kind = 'script' | 'prose';

/** `.md` and `.mdx` are prose; script files and `.astro` (frontmatter, template, `<script>`) are script. */
function kindOf(name: string): Kind {
  return /\.mdx?$/.test(name) ? 'prose' : 'script';
}

/**
 * Whether a code-span mention on `line` can only be words, so is let through.
 *
 * In script, a line that is a comment: it starts with `//`, `/*` or a JSDoc `*`. A comment
 * trailing code on the same line is not told apart from the code, so a mention there fails,
 * loudly. In prose, a line with no ESM, JSX, expression or attribute on it: one starting with
 * `import` or `export`, or holding any of `{ } = < >`, may be code, so it does not qualify.
 */
function mentionsAllowed(line: string, kind: Kind): boolean {
  const text = line.trim();
  if (kind === 'script') return /^(\/\/|\/\*|\*)/.test(text);
  return !/^(import|export)\b/.test(text) && !/[{}=<>]/.test(text);
}

/** Where `onIdle` is declared: the one span of code that may ask for an idle callback. */
const ON_IDLE_DECLARATION = 'export function onIdle(';

/**
 * The span of `source` from `onIdle`'s declaration to the brace that closes its body, matched by
 * counting braces from the first one after the declaration, or none. The helper may name
 * `requestIdleCallback` exactly once, inside it; any other code token of it, in the helper as in
 * any other file, is an offence. That `onIdle` asks with the bound is the `onIdle` tests' job,
 * below.
 */
function onIdleSpan(source: string): { from: number; to: number } | undefined {
  const from = source.indexOf(ON_IDLE_DECLARATION);
  const open = from < 0 ? -1 : source.indexOf('{', from);
  if (open < 0) return undefined;
  let depth = 0;
  for (let at = open; at < source.length; at++) {
    if (source[at] === '{') depth++;
    else if (source[at] === '}' && --depth === 0) return { from, to: at };
  }
  return undefined;
}

/**
 * The idle tokens in `source` that break the rules above, each as `line: why`, and how many
 * bounded idle waits it holds: islands written as `BOUNDED_DIRECTIVE`, and `onIdle` calls.
 * `kind` says how to read the file (`kindOf`); `isHelper` is for `idle-timeout.ts`, whose
 * `onIdle` may name `requestIdleCallback`.
 */
function idleWaits(
  source: string,
  { kind = 'script', isHelper = false }: { kind?: Kind; isHelper?: boolean } = {},
): { offences: string[]; bounded: number } {
  const offences: string[] = [];
  let bounded = 0;
  const lineOf = (at: number) => source.slice(0, at).split('\n').length;
  const lineAt = (at: number) => {
    const end = source.indexOf('\n', at);
    return source.slice(source.lastIndexOf('\n', at) + 1, end < 0 ? source.length : end);
  };
  const inCodeSpan = (at: number) => source[at - 1] === '`' && mentionsAllowed(lineAt(at), kind);
  const span = isHelper ? onIdleSpan(source) : undefined;
  const inOnIdle = (at: number) => span !== undefined && at > span.from && at < span.to;
  for (const { index } of source.matchAll(/client:idle/g)) {
    if (inCodeSpan(index)) continue;
    if (source.startsWith(BOUNDED_DIRECTIVE, index)) bounded++;
    else offences.push(`${lineOf(index)}: client:idle not written ${BOUNDED_DIRECTIVE}`);
  }
  const inside: number[] = [];
  for (const { index } of source.matchAll(/requestIdleCallback/g)) {
    if (inCodeSpan(index)) continue;
    if (inOnIdle(index)) inside.push(index);
    else offences.push(`${lineOf(index)}: requestIdleCallback outside onIdle in ${HELPER}; defer the work with onIdle`);
  }
  if (isHelper && inside.length !== 1) {
    offences.push(`${span ? lineOf(span.from) : 0}: onIdle names requestIdleCallback ${inside.length} times, not once`);
  }
  for (const { index } of source.matchAll(/\bonIdle\(/g)) if (!inCodeSpan(index) && !inOnIdle(index)) bounded++;
  return { offences, bounded };
}

/** The fallback delay in a copy of Astro's idle directive, read by `pattern`. */
function fallbackDelay(file: string, pattern: RegExp): number {
  const match = pattern.exec(readFileSync(join(ASTRO_CLIENT, file), 'utf-8'));
  expect(match, `no "setTimeout(cb, ….timeout || N)" fallback in ${file}`).not.toBeNull();
  return Number(match![1]);
}

describe('IDLE_TIMEOUT_MS (tucca-cellag/caail-planning#604)', () => {
  it("equals the delay Astro's idle directive falls back to without requestIdleCallback, in its source", () => {
    expect(IDLE_TIMEOUT_MS).toBe(fallbackDelay('idle.js', /setTimeout\(\s*cb\s*,\s*idleOptions\.timeout\s*\|\|\s*(\d+)\s*\)/));
  });

  it('equals it in the minified directive pages inline, the copy a browser runs', () => {
    expect(IDLE_TIMEOUT_MS).toBe(fallbackDelay('idle.prebuilt.js', /setTimeout\(\s*\w+\s*,\s*\w+\.timeout\s*\|\|\s*(\d+)\s*\)/));
  });

  it('bounds every idle wait under site/src, and finds the ones it bounds', () => {
    const offences: string[] = [];
    let bounded = 0;
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).replaceAll('\\', '/');
      const waits = idleWaits(readFileSync(file, 'utf-8'), { kind: kindOf(rel), isHelper: rel === HELPER });
      bounded += waits.bounded;
      offences.push(...waits.offences.map((offence) => `${rel}:${offence}`));
    }
    expect(offences, 'an idle wait with no IDLE_TIMEOUT_MS bound never runs on a page that never goes idle').toEqual([]);
    // The chat widget, the citation network and the search-event wiring: a scan that read nothing would pass above.
    expect(bounded).toBeGreaterThanOrEqual(3);
  });

  it('scans script of every kind, and no test', () => {
    for (const name of ['a.astro', 'a.mdx', 'a.md', 'a.ts', 'a.tsx', 'a.js', 'a.jsx', 'a.mjs', 'a.cjs', 'a.mts']) {
      expect(isScanned(name), name).toBe(true);
    }
    for (const name of ['a.test.ts', 'a.test.tsx', 'a.test.js', 'a.test.mjs', 'a.css', 'a.json']) {
      expect(isScanned(name), name).toBe(false);
    }
  });

  it('flags an island not written with the bound, wherever the tag puts it', () => {
    const offences = (source: string) => idleWaits(source).offences.length;
    expect(offences('<NetworkGraph client:idle />')).toBe(1);
    expect(offences('<Widget client:idle={{ timeout: 500 }} />')).toBe(1);
    expect(offences('<Widget client:idle={{timeout: IDLE_TIMEOUT_MS}} />')).toBe(1);
    // A `>` inside the tag, before the directive.
    expect(offences('<Foo label="a > b" client:idle />')).toBe(1);
    expect(offences('<Foo test={a > b} client:idle={{ timeout: 500 }} />')).toBe(1);
  });

  it('flags any idle callback asked for outside the helper, bounded or not', () => {
    const offences = (source: string) => idleWaits(source).offences.length;
    expect(offences('requestIdleCallback(() => go())')).toBe(1);
    expect(offences('window.requestIdleCallback?.(cb)')).toBe(1);
    expect(offences('const later = window.requestIdleCallback; later(cb, { timeout: IDLE_TIMEOUT_MS })')).toBe(1);
    expect(offences('window.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS })')).toBe(1);
    // In prose too, unless it is written as a code span.
    expect(offences('// hydrates once requestIdleCallback fires')).toBe(1);
  });

  it('passes a bounded island, an onIdle call and a code-span mention in words, and counts the waits', () => {
    expect(idleWaits('<Widget client:idle={{ timeout: IDLE_TIMEOUT_MS }} />')).toEqual({ offences: [], bounded: 1 });
    expect(idleWaits('<Foo label="a > b" client:idle={{ timeout: IDLE_TIMEOUT_MS }} />')).toEqual({ offences: [], bounded: 1 });
    expect(idleWaits('onIdle(() => watchSearch());')).toEqual({ offences: [], bounded: 1 });
    const none = { offences: [], bounded: 0 };
    // A comment in script, in the three ways this repo writes one.
    expect(idleWaits('      // the graph, after `client:idle` has already mounted cytoscape.')).toEqual(none);
    expect(idleWaits(' * and therefore present but inert until `client:idle` hydration attached its')).toEqual(none);
    expect(idleWaits('/* as `requestIdleCallback` allows */')).toEqual(none);
    // A prose line of Markdown.
    expect(idleWaits('hydrates after `client:idle` runs, as `requestIdleCallback` allows', { kind: 'prose' })).toEqual(none);
  });

  it('flags a code-span mention where the backtick opens a template literal in code', () => {
    const offences = (source: string, kind: Kind = 'script') => idleWaits(source, { kind }).offences.length;
    expect(offences('<script set:html={`requestIdleCallback(go)`} />')).toBe(1);
    expect(offences('const run = new Function(`requestIdleCallback(go)`);')).toBe(1);
    expect(offences('hydrates after `client:idle` runs, as `requestIdleCallback` allows')).toBe(2);
    // A comment trailing code is not told apart from the code.
    expect(offences('go(); // as `requestIdleCallback` allows')).toBe(1);
    // In Markdown, a line with JSX, an expression or ESM on it may be code.
    expect(offences('<Fragment set:html={`requestIdleCallback(go)`} />', 'prose')).toBe(1);
    expect(offences('  html={`requestIdleCallback(go)`}', 'prose')).toBe(1);
    expect(offences('const run = `requestIdleCallback(go)`;', 'prose')).toBe(1);
    expect(offences('export const run = `requestIdleCallback`', 'prose')).toBe(1);
  });

  it('reads .md and .mdx as prose, and everything else it scans as script', () => {
    expect(['a.md', 'a.mdx'].map(kindOf)).toEqual(['prose', 'prose']);
    expect(['a.astro', 'a.ts', 'a.tsx', 'a.mjs'].map(kindOf)).toEqual(['script', 'script', 'script', 'script']);
  });

  it("lets onIdle ask for an idle callback, with an inline arrow callback or not", () => {
    const helper = (body: string) =>
      idleWaits(`${ON_IDLE_DECLARATION}cb: () => void): void {\n${body}\n}\n`, { isHelper: true }).offences;
    expect(helper('  globalThis.requestIdleCallback(() => cb(), { timeout: IDLE_TIMEOUT_MS });')).toEqual([]);
    expect(helper('  globalThis.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS });')).toEqual([]);
  });

  it('flags an idle callback after a one-line onIdle, and onIdle naming it twice', () => {
    const helper = (source: string) => idleWaits(source, { isHelper: true }).offences;
    const oneLine = `${ON_IDLE_DECLARATION}cb: () => void): void { globalThis.requestIdleCallback?.(cb, { timeout: IDLE_TIMEOUT_MS }); }\n`;
    expect(helper(oneLine)).toEqual([]);
    expect(helper(`${oneLine}export function idleNow(cb: () => void): void {\n  globalThis.requestIdleCallback(cb);\n}\n`)).toEqual([
      `3: requestIdleCallback outside onIdle in ${HELPER}; defer the work with onIdle`,
    ]);
    const twice = `${ON_IDLE_DECLARATION}cb: () => void): void {\n  if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS });\n}\n`;
    expect(helper(twice)).toEqual(['1: onIdle names requestIdleCallback 2 times, not once']);
  });

  it('flags any other idle callback in the helper, and every one when onIdle is not there', () => {
    const onIdle = `${ON_IDLE_DECLARATION}cb: () => void): void {\n  globalThis.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS });\n}\n`;
    const helper = (source: string) => idleWaits(source, { isHelper: true }).offences;
    expect(helper(`${onIdle}export const later = (cb) => globalThis.requestIdleCallback(cb);\n`)).toHaveLength(1);
    expect(helper(`const early = globalThis.requestIdleCallback;\n${onIdle}`)).toHaveLength(1);
    // No onIdle: the call is outside it, and onIdle names it no times.
    expect(helper('export function idleSoon(cb) {\n  globalThis.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS });\n}\n')).toEqual([
      `2: requestIdleCallback outside onIdle in ${HELPER}; defer the work with onIdle`,
      '0: onIdle names requestIdleCallback 0 times, not once',
    ]);
    // Its islands are held to the same rule as any other file's.
    expect(helper(`<NetworkGraph client:idle />\n${onIdle}`)).toEqual([`1: client:idle not written ${BOUNDED_DIRECTIVE}`]);
  });

  it('names the line and the rule an offence breaks', () => {
    expect(idleWaits('one\n<Foo client:idle />\nrequestIdleCallback(cb)').offences).toEqual([
      `2: client:idle not written ${BOUNDED_DIRECTIVE}`,
      `3: requestIdleCallback outside onIdle in ${HELPER}; defer the work with onIdle`,
    ]);
  });
});

describe('onIdle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('asks for one idle callback, bounded by IDLE_TIMEOUT_MS, that runs the callback', () => {
    // Checked by what the callback it hands over does, not by identity, so wrapping the
    // callback in an arrow stays correct.
    const asked: { run: () => void; options: unknown }[] = [];
    vi.stubGlobal('requestIdleCallback', (run: () => void, options: unknown) => asked.push({ run, options }));
    let ran = 0;
    onIdle(() => ran++);
    expect(asked.map(({ options }) => options)).toEqual([{ timeout: IDLE_TIMEOUT_MS }]);
    expect(ran).toBe(0);
    asked[0]!.run();
    expect(ran).toBe(1);
  });

  it('runs the callback on a 1 ms timer in a browser with no idle callback', () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();
    let ran = 0;
    onIdle(() => ran++);
    vi.advanceTimersByTime(0);
    expect(ran).toBe(0);
    vi.advanceTimersByTime(1);
    expect(ran).toBe(1);
  });
});
