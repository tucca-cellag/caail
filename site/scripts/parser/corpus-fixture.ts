/**
 * corpus-fixture.ts — build the real corpus model at most once per test process.
 *
 * Several test files need the papers model as *input* rather than as the thing under
 * test, and some need it several times. Each build re-reads and re-parses the
 * canonical Markdown, so a file that calls `buildPapersModel()` four times pays for it
 * four times. This memoises.
 *
 * ## What this is worth, measured
 *
 * On a quiet machine (2026-08-13, `pnpm --dir site bench:fixtures` reprints these):
 *
 *   buildPapersModel  ~180-300ms
 *
 * So `citations.test.ts` (four papers builds) and `graph.test.ts` (two) were paying
 * several hundred milliseconds of pure repetition each.
 *
 * ## What it is NOT worth, which is the more useful half
 *
 * Vitest isolates the module registry per test *file*, so this memo is per file and
 * shares nothing across them. A file that builds the model once, such as
 * `metrics.test.ts`, gains **nothing** from it. That matters because
 * `metrics.test.ts`'s timing-out hook is what put "share the expensive fixture" on
 * CAAIL-239 in the first place, and sharing does not fix it: of that hook's ~2.0s,
 * ~1.2s is `buildMetricsModel` itself, the function the file exists to test. You
 * cannot cache away the unit under test. Only a repeated build is removable, and
 * metrics.test.ts has none.
 *
 * The same holds for `emit.test.ts` and `mutate.test.ts`, the other two that time
 * out: their cost is re-importing a fresh DB and re-parsing an emitted file *per
 * test*, which is the isolation the assertions depend on. Memoising it would trade a
 * timeout for cross-test interference, which is a worse failure because it is silent.
 *
 * ## Treat the returned model as frozen
 *
 * Callers share one object. Nothing here deep-freezes it, because the model is large
 * and the freeze would cost more than the builds it saves. Every current caller only
 * reads: `buildCitationData` and `buildGraphModel` both take the model and derive from
 * it without mutating. A test that needs to mutate one should call the builder
 * directly and own its copy.
 */

import { buildPapersModel } from './papers.js';

let papers: ReturnType<typeof buildPapersModel> | undefined;

/**
 * The real `Papers.md` model, built at most once per process.
 *
 * **Only the papers model gets an accessor**, because it is the only one any file
 * builds twice. Catalog, topics and datasets accessors were written alongside it and
 * removed again: nothing called them, and an unused memo is not free. It ships an API
 * whose shared-object contract no test covers, and it invites the next reader to
 * convert a file that builds once, which saves nothing. Add one when a second call
 * site appears, not before.
 *
 * `??=` rather than a `!== undefined` check because the builder returns a validated
 * object and can never legitimately return `undefined`, so there is nothing to
 * distinguish "cached undefined" from "not built yet".
 */
export const corpusPapers = (): ReturnType<typeof buildPapersModel> =>
  (papers ??= buildPapersModel());
