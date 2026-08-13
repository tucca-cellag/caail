import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { defineConfig } from '@playwright/test';
import { preflight } from './scripts/e2e-preflight';

/**
 * Preview port, overridable via CAAIL_E2E_PORT.
 *
 * `reuseExistingServer` means a local run ATTACHES to whatever already listens on
 * this port instead of starting its own. With more than one worktree checked out
 * (the normal way work happens here), a fixed port lets one worktree's e2e run
 * silently validate another worktree's build — green tests, wrong tree. Give each
 * worktree its own port to keep runs honest:
 *
 *   CAAIL_E2E_PORT=4325 pnpm test:e2e
 */
const RAW_PORT = process.env.CAAIL_E2E_PORT;
// `??` alone would let CAAIL_E2E_PORT="" through as Number("") === 0, and a typo through
// as NaN, either of which yields an unusable base URL and a confusing connection error.
const PORT = RAW_PORT === undefined || RAW_PORT === '' ? 4321 : Number(RAW_PORT);
if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error(`CAAIL_E2E_PORT must be a valid port number, got ${JSON.stringify(RAW_PORT)}`);
}
const BASE = `http://localhost:${PORT}/caail/`;

const REUSE_EXISTING_SERVER = !process.env.CI;

/**
 * Preflight runs HERE, during config evaluation, and not in a `globalSetup` file.
 *
 * Playwright composes startup as `[removeOutputDirs, ...pluginSetup, ...globalSetup]`
 * and registers `webServer` as a plugin, so by the time `globalSetup` runs the
 * preview server is already listening. A port check there would fire on every run,
 * against Playwright's own server. Config evaluation is the only phase strictly
 * earlier than that. See scripts/e2e-preflight.ts for the two failure modes.
 *
 * `preflight` rather than `runPreflight` because Playwright re-evaluates this
 * file in every worker process, and workers start after the web server — so an
 * unguarded port probe would hit that same trap from the other side. It skips the
 * port probe in workers and still checks the build artifacts on every evaluation.
 */
const preflightFailure = preflight({
  distDir: join(dirname(fileURLToPath(import.meta.url)), 'dist'),
  port: PORT,
  reuseExistingServer: REUSE_EXISTING_SERVER,
  allowExistingServer: process.env.CAAIL_E2E_ALLOW_EXISTING_SERVER === '1',
});
if (preflightFailure) throw new Error(preflightFailure);

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: `pnpm preview --port ${PORT}`,
    url: BASE,
    reuseExistingServer: REUSE_EXISTING_SERVER,
    timeout: 120_000,
  },
  use: { baseURL: BASE },
});
