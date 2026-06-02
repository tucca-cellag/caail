import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'pnpm preview --port 4321',
    url: 'http://localhost:4321/caail/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: 'http://localhost:4321/caail/' },
});
