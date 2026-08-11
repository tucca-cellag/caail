import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
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
  },
});
