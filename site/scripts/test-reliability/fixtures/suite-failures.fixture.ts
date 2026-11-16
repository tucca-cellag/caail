/**
 * The module `vitest-reporter.test.ts` has the installed vitest run, so the reporter is
 * checked against how vitest really reports a failure rather than against a stand-in.
 *
 * Named `.fixture.ts`, not `.test.ts`, so the suite's own run never collects it: every
 * failure below is deliberate. Each suite is one way a module can fail, and
 * `reporter.ts` beside it registers each by name.
 */
import { beforeAll, describe, expect, it } from 'vitest';

describe('a suite whose own hook times out', () => {
  // The shape of a suite-level fixture hook overrunning its budget under load.
  beforeAll(() => new Promise((resolve) => setTimeout(resolve, 1_000)), 10);
  it('is skipped, not failed', () => {});
});

describe('a suite whose test fails', () => {
  it('fails an assertion', () => {
    expect(1).toBe(2);
  });
});

describe('a parent suite', () => {
  describe('a nested suite whose own hook throws', () => {
    beforeAll(() => {
      throw new Error('the nested hook throws');
    });
    it('is skipped as well', () => {});
  });
});
