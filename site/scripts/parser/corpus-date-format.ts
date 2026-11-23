/**
 * corpus-date-format.ts: the form a corpus date takes, in a module that imports nothing.
 *
 * The corpus stamp (`site/scripts/db/corpus-stamp.ts`) stores a date in this form,
 * `readCorpusDate` (`agent-api.ts`) returns it, `CorpusDateSchema` (`types.ts`) validates every
 * API payload against it, and `corpusDateNote` (`llms-corpus-date.ts`) refuses any other. It
 * lives here rather than in `agent-api.ts` so that `llms-corpus-date.ts`, and the URL test in
 * `site-config.test.ts` that imports it, do not load the agent API and the OpenAPI validator
 * behind it to read one regex.
 */

/** The form a corpus date takes, `YYYY-MM-DD`, as `readCorpusDate` returns it. */
export const CORPUS_DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What a corpus date dates, in the reader's words: every table the corpus stamp hashes, which is
 * every table in `TABLES_PK` (`site/scripts/db/lib.ts`). `versionNote` in `index.json`, the OpenAPI
 * description and the llms files' corpus-date line all say it through these two constants, never in
 * a copy of their own (tucca-cellag/caail-planning#153 decision 2), and `corpus-date-format.test.ts`
 * fails when a table is added that no word here covers.
 */
export const CORPUS_DATE_COVERS =
  "CAAIL's catalog records (the papers, software, databases, datasets and field reports, the studies " +
  'whose data are shared only on request, and the topics and matrix axes they are filed under)';

/** What a corpus date does not date: served data stamped from somewhere other than the NDJSON. */
export const CORPUS_DATE_EXCLUDES = 'other served data, such as citation counts or the taxonomy definitions';
