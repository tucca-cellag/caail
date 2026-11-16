// The config `vitest-reporter.test.ts` runs the fixture with: that module only, and the
// fixture register's reporter only, so what it prints is the register's report.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['suite-failures.fixture.ts'],
    environment: 'node',
    reporters: ['./reporter.ts'],
  },
});
