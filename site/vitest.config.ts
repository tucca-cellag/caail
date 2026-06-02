import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts', 'src/content/**/*.test.ts', 'src/lib/**/*.test.ts'],
    environment: 'node',
  },
});
