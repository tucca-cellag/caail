/**
 * corpus-date-format.ts: the form a corpus date takes, in a module that imports nothing.
 *
 * `readCorpusDate` (`agent-api.ts`) returns a date in this form and `corpusDateNote`
 * (`llms-corpus-date.ts`) refuses any other. It lives here rather than in `agent-api.ts` so that
 * `llms-corpus-date.ts`, and the URL test in `site-config.test.ts` that imports it, do not load
 * the agent API and the OpenAPI validator behind it to read one regex.
 */

/** The form a corpus date takes, `YYYY-MM-DD`, as `readCorpusDate` returns it. */
export const CORPUS_DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
