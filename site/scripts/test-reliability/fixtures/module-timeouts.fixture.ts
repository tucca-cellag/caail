/**
 * A module whose only failure is a top-level hook timing out, which vitest records as the
 * module's own error and skips everything under it: how a whole-module entry's file fails
 * under load. See `suite-failures.fixture.ts` beside it.
 */
import { beforeAll, describe, it } from 'vitest';

beforeAll(() => new Promise((resolve) => setTimeout(resolve, 1_000)), 10);

describe('a suite under the hook', () => {
  it('is skipped', () => {});
});

it('is skipped as well', () => {});
