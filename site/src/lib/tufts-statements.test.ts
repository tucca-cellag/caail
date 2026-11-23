import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COPYRIGHT_HOLDER } from './tufts-statements';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), 'utf8');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('the copyright holder', () => {
  // The footer, LICENSE and the README each name the holder; this keeps the three one.
  it('is the one LICENSE names', () => {
    expect(read('LICENSE')).toMatch(new RegExp(`^Copyright \\(c\\) \\d{4} ${escape(COPYRIGHT_HOLDER)}$`, 'm'));
  });

  it("is the one README.md's copyright line names", () => {
    expect(read('README.md')).toMatch(new RegExp(`^&copy; \\d{4} ${escape(COPYRIGHT_HOLDER)}\\.$`, 'm'));
  });
});
