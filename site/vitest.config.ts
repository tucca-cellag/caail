import { defineConfig } from 'vitest/config';
import { HOOK_TIMEOUT_MS, TEST_TIMEOUT_MS } from './scripts/test-reliability/budgets.js';

export default defineConfig({
  test: {
    // Imported rather than typed here, so the measurement in budgets.ts and the number
    // vitest enforces cannot drift apart. `pnpm bench:fixtures` prints the current
    // headroom against these. Raising a budget is not a fix and does not retire a
    // register entry; see budgets.ts for why it is nevertheless most of the answer.
    hookTimeout: HOOK_TIMEOUT_MS,
    testTimeout: TEST_TIMEOUT_MS,
    include: [
      'scripts/**/*.test.ts',
      'src/content/**/*.test.ts',
      'src/lib/**/*.test.ts',
      // The events collector Worker lives outside site/ but has no vitest
      // project of its own, so it runs here. A second test runner and a second
      // CI job is how a suite quietly stops being run; one
      // `pnpm --dir site test` covers everything. The Worker's search redaction
      // is a copy of the one in src/lib/analytics.ts, so its parity test needs
      // both in one run anyway.
      //
      // Spelled `*/src/**` rather than `**`: the default `**/node_modules/**`
      // exclude does not match across the leading `../`, so a broad glob
      // collects wrangler's own bundled template tests out of the Worker's
      // node_modules and the run fails on `describe is not defined`.
      '../workers/*/src/**/*.test.ts',
    ],
    environment: 'node',
    // After a red run, name any failing file that is on the known-unreliable register
    // and print the control that separates its condition from a real defect. Silent on
    // a green run and on a red run with no registered failure, so seeing the block is
    // itself the signal. See scripts/test-reliability/register.ts.
    //
    // `--reporter` on the command line REPLACES this list rather than adding to it, so
    // `vitest run --reporter=dot` runs without the register. Vitest has no "extra
    // reporter" option, so this cannot be defended in config. It is stated here rather
    // than left to be rediscovered, because a guard that is silently off while
    // appearing to be on is the failure this whole register is about. CI runs bare
    // `pnpm --dir site test`, so CI is covered.
    reporters: ['default', './scripts/test-reliability/vitest-reporter.ts'],
  },
});
