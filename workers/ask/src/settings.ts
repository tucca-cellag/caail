/**
 * Settings the Worker and the index build share. Both sides of the index read them
 * from here, so a question is embedded and searched the way the entries were.
 *
 * Pure, with no imports: the index build runs this file under Node's own type
 * stripping, and the Worker bundles it.
 */

/** How many entries one answer is built from. */
export const TOP_K = 8;

/**
 * The most of those that can be entries the question names outright (lookup.ts).
 * The rest are left to meaning, so a question naming many entries still gets
 * the nearest matches.
 */
export const MAX_NAMED = Math.floor(TOP_K / 2);

/**
 * The embedding model, for the entries and for each question alike. Changing it
 * means rebuilding the index: vectors from two models are not comparable, so the
 * corpus record stores the model it was built with and the GET reports it.
 */
export const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m';

/** What EMBEDDING_MODEL returns, and what the index is created with. */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * EmbeddingGemma's retrieval prompts, as Google's EmbeddingGemma documentation
 * gives them: a question is embedded as a search query, and an entry as a
 * document with its title. Workers AI's model page documents only a raw `text`
 * input and does not say it adds a prompt, so both sides add them here. Like the
 * model, they are part of how the index was built, so the corpus record stores
 * EMBEDDING_PROMPTS beside EMBEDDING_MODEL and a mismatch means a rebuild.
 */
const QUERY_PROMPT = 'task: search result | query: ';

/** The text embedded for a question. */
export function queryInput(question: string): string {
  return `${QUERY_PROMPT}${question}`;
}

/** The text embedded for an entry: its title, then its text. */
export function documentInput(title: string, text: string): string {
  return `title: ${title} | text: ${text}`;
}

/** Both prompts in one string, recorded in the corpus record. */
export const EMBEDDING_PROMPTS = `${queryInput('{query}')} / ${documentInput('{title}', '{text}')}`;

/** The Vectorize index. wrangler.toml binds it by this name (pinned by config.test.ts). */
export const INDEX_NAME = 'caail-ask';

/** Every entry lives in this namespace, and every query is confined to it. */
export const ENTRY_NAMESPACE = 'entries';

/**
 * The corpus record: one vector, outside ENTRY_NAMESPACE so no query can return
 * it, whose metadata says which corpus the index was built from.
 */
export const META_NAMESPACE = 'meta';
export const CORPUS_RECORD_ID = 'corpus';

/**
 * How long an instance trusts that the index matches how it embeds a question
 * before reading the corpus record again. A rebuild with another model or other
 * prompts is done by hand and the redeploy follows it, so a warm instance needs
 * to notice within minutes, not at once. Five minutes is one read of the record
 * per instance per five minutes at most, which a question rate in the hundreds
 * a day barely notices, and it bounds the time a warm instance answers from a
 * mismatched index.
 */
export const INDEX_RECHECK_MS = 5 * 60_000;

/**
 * How long one request may take before the Worker gives up with a 503. For a
 * question it runs from before the body is read, so a body trickled slowly or
 * never finished is bounded too, through the index check, retrieval and the
 * model. For a GET it bounds the index read. The widget sets no timeout of its
 * own, so this is the only bound a reader waits under.
 */
export const REQUEST_DEADLINE_MS = 25_000;

/**
 * The largest request body read. The word limit does not bound length (one
 * "word" can be any size), and both the embedding and the model are charged by
 * input, so the body is capped in bytes before it is parsed. 200 words of 80
 * bytes each fit.
 */
export const MAX_BODY_BYTES = 16_384;
