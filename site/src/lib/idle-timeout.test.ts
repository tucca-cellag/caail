/**
 * idle-timeout.test.ts: every idle wait under site/src is bounded by `IDLE_TIMEOUT_MS`, and that
 * value is the delay Astro's idle directive already uses where a browser has no
 * `requestIdleCallback` (tucca-cellag/caail-planning#604).
 *
 * The bound fixed a bug of one shape at each place it occurred, so the scan below is what stops
 * the next idle wait reintroducing it: a page that never goes idle never ran an unbounded one.
 * The delay lives inside Astro, so the parity checks read the installed directive, both the
 * source module and the minified copy pages inline, and fail if either stops matching.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { IDLE_TIMEOUT_MS } from './idle-timeout';

const require = createRequire(import.meta.url);
const ASTRO_CLIENT = join(dirname(require.resolve('astro/package.json')), 'dist', 'runtime', 'client');
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Source files under `dir` an island directive or an idle callback could sit in, tests excepted. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(astro|mdx|md|ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** A component's `client:idle` directive, bounded by the shared constant or not. */
const IDLE_DIRECTIVE = /<[A-Za-z][\w.]*\b[^<>]*?\sclient:idle\b/g;
const BOUNDED_DIRECTIVE = /<[A-Za-z][\w.]*\b[^<>]*?\sclient:idle=\{\{ timeout: IDLE_TIMEOUT_MS \}\}/g;
/** A `requestIdleCallback(` call, bounded by the shared constant or not. */
const IDLE_CALL = /requestIdleCallback\(/g;
const BOUNDED_CALL = /requestIdleCallback\([^)]*\btimeout: IDLE_TIMEOUT_MS\b/g;

/** The idle waits in `source` that the shared constant does not bound, and how many it does. */
function idleWaits(source: string): { unbounded: number; bounded: number } {
  const count = (re: RegExp) => [...source.matchAll(re)].length;
  const bounded = count(BOUNDED_DIRECTIVE) + count(BOUNDED_CALL);
  return { unbounded: count(IDLE_DIRECTIVE) + count(IDLE_CALL) - bounded, bounded };
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
    const unbounded: string[] = [];
    let bounded = 0;
    for (const file of sourceFiles(SRC)) {
      const waits = idleWaits(readFileSync(file, 'utf-8'));
      bounded += waits.bounded;
      if (waits.unbounded > 0) unbounded.push(`${relative(SRC, file)}: ${waits.unbounded}`);
    }
    expect(unbounded, 'an idle wait with no IDLE_TIMEOUT_MS bound never runs on a page that never goes idle').toEqual([]);
    // The chat widget, the citation network and the search-event wiring: a scan that read nothing would pass above.
    expect(bounded).toBeGreaterThanOrEqual(3);
  });

  it('flags an unbounded or differently bounded wait, and not a bounded one or a mention in prose', () => {
    expect(idleWaits('<NetworkGraph client:idle />')).toEqual({ unbounded: 1, bounded: 0 });
    expect(idleWaits('<Widget client:idle={{ timeout: 500 }} />')).toEqual({ unbounded: 1, bounded: 0 });
    expect(idleWaits('requestIdleCallback(() => go())')).toEqual({ unbounded: 1, bounded: 0 });
    expect(idleWaits('<Widget client:idle={{ timeout: IDLE_TIMEOUT_MS }} />')).toEqual({ unbounded: 0, bounded: 1 });
    expect(idleWaits('window.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS })')).toEqual({ unbounded: 0, bounded: 1 });
    expect(idleWaits('hydrates after `client:idle` runs, as `requestIdleCallback` allows')).toEqual({ unbounded: 0, bounded: 0 });
  });
});
