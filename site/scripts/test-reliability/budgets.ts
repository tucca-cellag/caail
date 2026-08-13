/**
 * budgets.ts — the vitest hook and test timeouts, and the reasoning behind them.
 *
 * Single definition, two consumers: `vitest.config.ts` sets the budgets from here and
 * `bench-fixtures.ts` measures against them. A budget typed in the config and a
 * measurement quoted in a comment beside it would be the same defect this repo keeps
 * paying for, so the ratio is computed rather than asserted in prose.
 *
 * ## Why these are raised at all
 *
 * CAAIL-239 is explicit that raising a budget alone is the wrong fix, because it hides
 * how long the fixtures take, and that a raise has to come with the number. Here is
 * the number, and why raising is nevertheless most of the available answer.
 *
 * The five files that time out are the five slowest in the suite. That is not a
 * coincidence: they fail because their fixtures sit closest to the budget, so
 * contention reaches them first. But the expensive work is mostly not shareable:
 *
 *  - `metrics.test.ts`'s hook is ~2.0s, of which ~1.2s is `buildMetricsModel`, the
 *    function the file exists to test. You cannot cache away the unit under test.
 *  - `emit.test.ts` and `mutate.test.ts` re-import a fresh DB and re-parse an emitted
 *    file *per test*. That is the isolation their assertions depend on; memoising it
 *    would trade a timeout for silent cross-test interference.
 *
 * What was shareable is shared (`scripts/parser/corpus-fixture.ts`, ~600ms off
 * `citations.test.ts` and ~300ms off `graph.test.ts`). The rest is real work, and a
 * budget that a healthy run fails under load is measuring the machine rather than the
 * code.
 *
 * ## Where the numbers come from
 *
 * Measured 2026-08-13 on a quiet 10-core machine; `pnpm --dir site bench:fixtures`
 * reprints them and shows the current headroom.
 *
 *  - slowest hook: `metrics.test.ts` beforeAll, ~1.0 to 2.0s
 *  - slowest test: `emit.test.ts` Papers.md round-trip, ~1.4s as vitest reports it
 *
 * Both blew the old 10s / 5s budgets under contention, so a degradation factor of at
 * least 5x and 3.6x is observed rather than hypothesised. The budgets below are ~15x
 * and ~14x the quiet cost. They are chosen to absorb the contention this machine
 * actually produces (load average 53 on 10 cores has been recorded), not to be
 * comfortable.
 *
 * **`bench:fixtures` reports the warm cost and vitest charges the cold one**, so the
 * headroom it prints is an upper bound. It runs each fixture after the module graph is
 * loaded and V8 has warmed, which is why it puts the round-trip near 0.3s where vitest
 * puts the same test near 1.4s on its first execution in a worker. Read the printed
 * headroom as "at least this much", and read a *change* in it as the real signal:
 * warm-to-warm across two runs is a like-for-like comparison even though warm-to-cold
 * is not.
 *
 * **A raise is not a fix and these entries stay on the register.** If `bench:fixtures`
 * shows the headroom shrinking, the fixture got slower and that is the thing to look
 * at. Raising these again without a measurement is how the signal is lost for good.
 */

/**
 * Per-hook budget. Vitest's default is 10s, which `metrics.test.ts` and
 * `seed.test.ts` exceeded under contention while doing ~2.0s and ~2.3s of work.
 */
export const HOOK_TIMEOUT_MS = 30_000;

/**
 * Per-test budget. Vitest's default is 5s, which `emit.test.ts` and `mutate.test.ts`
 * exceeded under contention while their slowest tests do ~1.4s of work.
 */
export const TEST_TIMEOUT_MS = 20_000;
