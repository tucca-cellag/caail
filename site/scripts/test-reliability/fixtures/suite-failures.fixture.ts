/**
 * The module `vitest-reporter.test.ts` has the installed vitest run, so the reporter is
 * checked against how vitest really reports a failure rather than against a stand-in.
 *
 * Named `.fixture.ts`, not `.test.ts`, so the suite's own run never collects it: every
 * failure below is deliberate. Each suite or test is one way a module can fail, and
 * `reporter.ts` beside it registers each by name. Whatever times out is given a budget far
 * below what it waits for, so it fails at once and the run stays fast.
 */
import { beforeAll, describe, expect, it } from 'vitest';

/** A wait that overruns any budget given below, the shape of fixture work under load. */
const overrun = () => new Promise((resolve) => setTimeout(resolve, 1_000));

describe('a suite whose own hook times out', () => {
  beforeAll(overrun, 10);
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
    expect(['a planted offender']).toEqual([]);
  });
});

it('runs past its budget', overrun, 10);

describe('a parent suite', () => {
  describe('a nested suite whose own hook times out', () => {
    beforeAll(overrun, 10);
    it('is skipped too', () => {});
  });
});
