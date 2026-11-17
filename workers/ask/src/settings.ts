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
 * How long retrieval and the model together may take before the Worker gives up
 * with a 503. The widget sets no timeout of its own, so this is the only bound a
 * reader waits under.
 */
export const ANSWER_DEADLINE_MS = 25_000;

/**
 * The largest request body read. The word limit does not bound length (one
 * "word" can be any size), and both the embedding and the model are charged by
 * input, so the body is capped in bytes before it is parsed. 200 words of 80
 * bytes each fit.
 */
export const MAX_BODY_BYTES = 16_384;
