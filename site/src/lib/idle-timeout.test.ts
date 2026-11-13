/**
 * idle-timeout.test.ts: `IDLE_TIMEOUT_MS` is set to the delay Astro's idle directive already
 * uses where a browser has no `requestIdleCallback`, so bounding `client:idle` never delays such
 * a browser's islands (tucca-cellag/caail-planning#604). That delay lives inside Astro, so this
 * reads the installed directive and fails if it stops matching, after an upgrade say, rather
 * than leaving the reason in idle-timeout.ts silently false.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { IDLE_TIMEOUT_MS } from './idle-timeout';

const require = createRequire(import.meta.url);
const ASTRO = dirname(require.resolve('astro/package.json'));
const IDLE_DIRECTIVE = join(ASTRO, 'dist', 'runtime', 'client', 'idle.js');

describe('IDLE_TIMEOUT_MS (tucca-cellag/caail-planning#604)', () => {
  it("equals the delay Astro's idle directive falls back to without requestIdleCallback", () => {
    const source = readFileSync(IDLE_DIRECTIVE, 'utf-8');
    const fallback = /setTimeout\(\s*cb\s*,\s*idleOptions\.timeout\s*\|\|\s*(\d+)\s*\)/.exec(source);
    expect(fallback, `no "setTimeout(cb, idleOptions.timeout || N)" fallback in ${IDLE_DIRECTIVE}`).not.toBeNull();
    expect(IDLE_TIMEOUT_MS).toBe(Number(fallback![1]));
  });
});
