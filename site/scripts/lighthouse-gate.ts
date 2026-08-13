/**
 * lighthouse-gate.ts — derive, in one place, what the Lighthouse gate actually does.
 *
 * `lighthouserc.json` is the only thing that decides whether a deploy is blocked, and
 * both `CLAUDE.md` files describe that decision in prose an agent reads before shipping.
 * Those two drifted: they called the **performance** gate blocking, and it has been
 * `warn`-level since `e627e97 ci(site): stop flaky Lighthouse perf from blocking the
 * deploy`. They also said performance applied to the landing page only, when the
 * assertion matrix matches `.*`, which is both collected URLs. The `docs.yml` step was
 * even *named* "perf landing-only", so the wrong claim was in three places.
 *
 * That is this repo's most expensive recurring shape: a hand-typed fact beside the
 * machine-readable file that owns it, with nothing checking they agree. The remedy the
 * gotcha prescribes is to derive the value or add a check that fails when the two
 * disagree, and prose saying "keep these in sync" is explicitly not enough.
 *
 * So the sentence is generated here and asserted verbatim in the docs by
 * `lighthouse-gate.test.ts`. Changing `lighthouserc.json` fails that test with the new
 * sentence to paste, which makes the docs impossible to leave stale rather than merely
 * discouraged from being so.
 *
 * **Why it matters more than an ordinary doc nit.** An agent reading either file
 * believes a performance regression cannot reach production, so it will neither check
 * the score after a deploy nor treat a perf warning as actionable. `caail-pr-wrapup`
 * inherits that belief: its Gotchas table says "If Lighthouse fails, stop", which for
 * performance describes an event that does not occur.
 */

import { readFileSync } from 'node:fs';

/** lhci exits non-zero only on `error`, so that word is the whole difference. */
export type AssertionLevel = 'error' | 'warn' | 'off';

export interface CategoryGate {
  /** e.g. `accessibility`, taken from the `categories:<name>` assertion key. */
  category: string;
  level: AssertionLevel;
  minScore: number;
  /** The `matchingUrlPattern` the assertion is filed under. */
  urlPattern: string;
}

export interface LighthouseGate {
  /** Every collected URL, in config order. */
  urls: string[];
  gates: CategoryGate[];
}

/**
 * Read the gate out of `lighthouserc.json`.
 *
 * Deliberately narrow: it understands the `assertMatrix` shape this repo uses and
 * throws on anything else rather than guessing. A parser that quietly returned an
 * empty gate would let the docs assert nothing and pass, which is the failure mode
 * being fixed.
 */
export function readLighthouseGate(configPath: string): LighthouseGate {
  const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  const ci = raw.ci as Record<string, unknown> | undefined;
  const collect = ci?.collect as { url?: string[] } | undefined;
  const matrix = (ci?.assert as { assertMatrix?: unknown } | undefined)?.assertMatrix;

  if (!Array.isArray(collect?.url) || collect.url.length === 0) {
    throw new Error('lighthouserc.json: expected ci.collect.url to be a non-empty array');
  }
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error('lighthouserc.json: expected ci.assert.assertMatrix to be a non-empty array');
  }

  const gates: CategoryGate[] = [];
  for (const entry of matrix as {
    matchingUrlPattern?: string;
    assertions?: Record<string, [string, { minScore?: number }]>;
  }[]) {
    const urlPattern = entry.matchingUrlPattern ?? '.*';
    for (const [key, value] of Object.entries(entry.assertions ?? {})) {
      if (!key.startsWith('categories:')) continue;
      const [level, options] = value;
      if (level !== 'error' && level !== 'warn' && level !== 'off') {
        throw new Error(`lighthouserc.json: unknown assertion level ${JSON.stringify(level)}`);
      }
      gates.push({
        category: key.slice('categories:'.length),
        level,
        minScore: options?.minScore ?? 0,
        urlPattern,
      });
    }
  }
  if (gates.length === 0) {
    throw new Error('lighthouserc.json: no categories:* assertions found');
  }
  return { urls: collect.url, gates };
}

/** `0.9` reads as `≥0.90` in the docs; keep the two spellings from diverging. */
function score(minScore: number): string {
  return `≥${minScore.toFixed(2)}`;
}

/**
 * How many URLs an assertion covers, in words.
 *
 * `.*` is every collected URL, and saying "both" rather than naming them keeps the
 * sentence stable when a third URL is added while still being checkable.
 */
function scope(urlPattern: string, urlCount: number): string {
  if (urlPattern === '.*') return urlCount === 1 ? 'the one collected URL' : `all ${urlCount} collected URLs`;
  return `URLs matching ${urlPattern}`;
}

/**
 * The sentence both `CLAUDE.md` files must contain verbatim.
 *
 * Ordered `error` first, because what blocks a deploy is the thing a reader needs from
 * this sentence; the warn-level entries are context. Within a level, config order.
 */
export function describeLighthouseGate(gate: LighthouseGate): string {
  const rank: Record<AssertionLevel, number> = { error: 0, warn: 1, off: 2 };
  const ordered = [...gate.gates].sort((a, b) => rank[a.level] - rank[b.level]);
  const phrase = (g: CategoryGate): string => {
    const name = g.category.charAt(0).toUpperCase() + g.category.slice(1);
    const verb = g.level === 'error' ? 'blocking' : g.level === 'warn' ? 'warn-level (does NOT block)' : 'off';
    return `${verb} ${name} ${score(g.minScore)} on ${scope(g.urlPattern, gate.urls.length)}`;
  };
  return ordered.map(phrase).join(', ');
}
