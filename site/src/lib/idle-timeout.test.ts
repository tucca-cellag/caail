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
 * Markdown code span, directly after a backtick, is prose naming it and is let through. A
 * pattern that parses the tag or the call around a token misses a `>` inside the tag, an
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

/** Where `onIdle` is declared: the one span of code that may ask for an idle callback. */
const ON_IDLE_DECLARATION = 'export function onIdle(';

/**
 * The span of `source` from `onIdle`'s declaration to the `}` that closes it at the start of a
 * line, or none. Only `requestIdleCallback` inside it is exempt; elsewhere in the helper, as in
 * any other file, a code token of it is an offence. That `onIdle` itself asks with the bound is
 * the `onIdle` tests' job, below.
 */
function onIdleSpan(source: string): { from: number; to: number } | undefined {
  const from = source.indexOf(ON_IDLE_DECLARATION);
  const to = from < 0 ? -1 : source.indexOf('\n}', from);
  return to < 0 ? undefined : { from, to };
}

/**
 * The idle tokens in `source` that break the rules above, each as `line: why`, and how many
 * bounded idle waits it holds: islands written as `BOUNDED_DIRECTIVE`, and `onIdle` calls.
 * `isHelper` is for `idle-timeout.ts`, whose `onIdle` may name `requestIdleCallback`.
 */
function idleWaits(source: string, isHelper = false): { offences: string[]; bounded: number } {
  const offences: string[] = [];
  let bounded = 0;
  const lineOf = (at: number) => source.slice(0, at).split('\n').length;
  const inCodeSpan = (at: number) => source[at - 1] === '`';
  const span = isHelper ? onIdleSpan(source) : undefined;
  const inOnIdle = (at: number) => span !== undefined && at > span.from && at < span.to;
  for (const { index } of source.matchAll(/client:idle/g)) {
    if (inCodeSpan(index)) continue;
    if (source.startsWith(BOUNDED_DIRECTIVE, index)) bounded++;
    else offences.push(`${lineOf(index)}: client:idle not written ${BOUNDED_DIRECTIVE}`);
  }
  for (const { index } of source.matchAll(/requestIdleCallback/g)) {
    if (inCodeSpan(index) || inOnIdle(index)) continue;
    offences.push(`${lineOf(index)}: requestIdleCallback outside onIdle in ${HELPER}; defer the work with onIdle`);
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
      const waits = idleWaits(readFileSync(file, 'utf-8'), rel === HELPER);
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

  it('passes a bounded island, an onIdle call and a code-span mention, and counts the waits', () => {
    expect(idleWaits('<Widget client:idle={{ timeout: IDLE_TIMEOUT_MS }} />')).toEqual({ offences: [], bounded: 1 });
    expect(idleWaits('<Foo label="a > b" client:idle={{ timeout: IDLE_TIMEOUT_MS }} />')).toEqual({ offences: [], bounded: 1 });
    expect(idleWaits('onIdle(() => watchSearch());')).toEqual({ offences: [], bounded: 1 });
    expect(idleWaits('hydrates after `client:idle` runs, as `requestIdleCallback` allows')).toEqual({ offences: [], bounded: 0 });
  });

  it("lets onIdle ask for an idle callback, with an inline arrow callback or not", () => {
    const helper = (body: string) => idleWaits(`${ON_IDLE_DECLARATION}cb: () => void): void {\n${body}\n}\n`, true).offences;
    expect(helper('  globalThis.requestIdleCallback(() => cb(), { timeout: IDLE_TIMEOUT_MS });')).toEqual([]);
    expect(helper('  globalThis.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS });')).toEqual([]);
  });

  it('flags any other idle callback in the helper, and every one when onIdle is not there', () => {
    const onIdle = `${ON_IDLE_DECLARATION}cb: () => void): void {\n  globalThis.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS });\n}\n`;
    const helper = (source: string) => idleWaits(source, true).offences;
    expect(helper(`${onIdle}export const later = (cb) => globalThis.requestIdleCallback(cb);\n`)).toHaveLength(1);
    expect(helper(`const early = globalThis.requestIdleCallback;\n${onIdle}`)).toHaveLength(1);
    expect(helper('export function idleSoon(cb) {\n  globalThis.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS });\n}\n')).toHaveLength(1);
    // Its islands are held to the same rule as any other file's.
    expect(helper('<NetworkGraph client:idle />')).toHaveLength(1);
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
