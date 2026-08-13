/**
 * corpus-fixture.ts — build each real-corpus model at most once per test process.
 *
 * Several test files need the papers / catalog / topics / datasets models as *input*
 * rather than as the thing under test, and some need the same one several times. Each
 * build re-reads and re-parses the canonical Markdown, so a file that calls
 * `buildPapersModel()` four times pays for it four times. These accessors memoise.
 *
 * ## What this is worth, measured
 *
 * On a quiet machine (2026-08-13, `pnpm --dir site bench:fixtures` reprints these):
 *
 *   buildPapersModel   ~300ms      buildTopicsModel     ~5ms
 *   buildCatalogModel  ~430ms      buildDatasetsModel   ~20ms
 *
 * So `citations.test.ts` (four papers builds) and `graph.test.ts` (two) were paying
 * roughly 600ms and 300ms of pure repetition.
 *
 * ## What it is NOT worth, which is the more useful half
 *
 * Vitest isolates the module registry per test *file*, so this memo is per file and
 * shares nothing across them. A file that builds each model once, such as
 * `metrics.test.ts`, gains **nothing** from it. That matters because
 * `metrics.test.ts`'s timing-out hook is what put "share the expensive fixture" on
 * CAAIL-239 in the first place, and sharing does not fix it: of that hook's ~2.0s,
 * ~1.2s is `buildMetricsModel` itself, the function the file exists to test. You
 * cannot cache away the unit under test. The remaining ~750ms is what these
 * accessors can remove, and only if the file built something twice.
 *
 * The same holds for `emit.test.ts` and `mutate.test.ts`, the other two that time
 * out: their cost is re-importing a fresh DB and re-parsing an emitted file *per
 * test*, which is the isolation the assertions depend on. Memoising it would trade a
 * timeout for cross-test interference, which is a worse failure because it is silent.
 *
 * ## Treat the returned models as frozen
 *
 * Callers share one object. Nothing here deep-freezes it, because these models are
 * large and the freeze would cost more than the builds it saves. Every current caller
 * only reads. A test that needs to mutate one should call the builder directly and
 * own its copy.
 */

import { buildPapersModel } from './papers.js';
import { buildCatalogModel } from './catalog.js';
import { buildTopicsModel } from './topics.js';
import { buildDatasetsModel } from './datasets-entries.js';

let papers: ReturnType<typeof buildPapersModel> | undefined;
let catalog: ReturnType<typeof buildCatalogModel> | undefined;
let topics: ReturnType<typeof buildTopicsModel> | undefined;
let datasets: ReturnType<typeof buildDatasetsModel> | undefined;

/**
 * The real `Papers.md` model.
 *
 * `??=` rather than a `!== undefined` check because every builder returns a validated
 * object; none of them can legitimately return `undefined`, so there is no value to
 * distinguish "cached undefined" from "not built yet".
 */
export const corpusPapers = (): ReturnType<typeof buildPapersModel> =>
  (papers ??= buildPapersModel());

/** The real `Software.md` + `Databases.md` model. */
export const corpusCatalog = (): ReturnType<typeof buildCatalogModel> =>
  (catalog ??= buildCatalogModel());

/** The real topics model. */
export const corpusTopics = (): ReturnType<typeof buildTopicsModel> =>
  (topics ??= buildTopicsModel());

/** The real curated-dataset-entries model. */
export const corpusDatasets = (): ReturnType<typeof buildDatasetsModel> =>
  (datasets ??= buildDatasetsModel());

/**
 * Drop the cache. For the accessors' own tests only.
 *
 * Not exported as a `beforeEach` convenience on purpose: a test file that needs a
 * fresh model per test does not want these accessors at all, it wants the builder.
 */
export function resetCorpusFixtureCache(): void {
  papers = undefined;
  catalog = undefined;
  topics = undefined;
  datasets = undefined;
}
