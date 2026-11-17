// The config `vitest-reporter.test.ts` runs the fixtures with: those modules only, and the
// fixture register's reporter only, so what it prints is the register's report. Its cache
// goes to the temporary directory that test names, or one of the system's when run by hand,
// so no node_modules is created inside the source tree.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: process.env.CAAIL_REPORTER_FIXTURE_CACHE ?? join(tmpdir(), 'caail-reporter-fixture'),
  test: {
    include: ['*.fixture.ts'],
    environment: 'node',
    reporters: ['./reporter.ts'],
  },
});
