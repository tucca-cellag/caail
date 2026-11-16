/**
 * The module `vitest-reporter.test.ts` has the installed vitest run, so the reporter is
 * checked against how vitest really reports a failure rather than against a stand-in.
 *
 * Named `.fixture.ts`, not `.test.ts`, so the suite's own run never collects it: every
 * failure below is deliberate. Each suite is one way a module can fail, and
 * `reporter.ts` beside it registers each by name. The hooks that time out are given a
 * budget far below what they wait for, so they fail at once and the run stays fast.
 */
import { beforeAll, describe, expect, it } from 'vitest';

/** A hook that overruns `budget`, the shape of a suite-level fixture hook under load. */
const overrun = (budget: number) => beforeAll(() => new Promise((resolve) => setTimeout(resolve, 1_000)), budget);

describe('a suite whose own hook times out', () => {
  overrun(10);
  it('is skipped, not failed', () => {});
});

describe('a suite whose own hook throws', () => {
  // What a hook does on a real defect, such as a build it runs rejecting its input.
  beforeAll(() => {
    throw new Error('the hook throws');
  });
  it('is skipped as well', () => {});
});

describe('a suite whose test fails', () => {
  it('fails an assertion', () => {
    expect(1).toBe(2);
  });
});

describe('a parent suite', () => {
  describe('a nested suite whose own hook times out', () => {
    overrun(10);
    it('is skipped too', () => {});
  });
});
