import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['scripts/**/*.test.ts', 'src/content/**/*.test.ts'], environment: 'node' },
});
