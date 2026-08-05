import { defineConfig } from '@playwright/test';

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

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: `pnpm preview --port ${PORT}`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: BASE },
});
