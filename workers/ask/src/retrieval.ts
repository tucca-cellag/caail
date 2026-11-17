/**
 * Retrieval: the entries one answer is built from.
 *
 * The entries a question names outright (lookup.ts) come first, fetched from
 * the index by id, at most MAX_NAMED of them; the nearest entries by meaning
 * fill the rest, up to TOP_K.
 * Every entry is read back from the index's own metadata, so the model sees the
 * text that was embedded, whichever corpus the Worker was deployed with.
 */
import { SITE_URL } from '../../../site/src/content/site-config.ts';
import {
  CORPUS_RECORD_ID,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  ENTRY_NAMESPACE,
  MAX_NAMED,
  TOP_K,
  queryInput,
} from './settings.ts';
import { vectorId } from './ids.ts';
import { callWorkersAi } from './workers-ai.ts';
import type { Lookup } from './lookup.ts';

/**
 * The Workers AI binding, typed structurally for the same reason as `Env` in
 * workers/events: the surface used here is one method.
 */
export interface AiBinding {
  run(model: string, inputs: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>;
}

export interface StoredVector {
  id: string;
  namespace?: string;
  metadata?: Record<string, unknown>;
}

/** The Vectorize binding: the two calls the Worker makes. */
export interface IndexBinding {
  query(
    vector: number[],
    options: { topK: number; namespace: string; returnMetadata: 'all' },
  ): Promise<{ matches: (StoredVector & { score: number })[] }>;
  getByIds(ids: string[]): Promise<StoredVector[]>;
}

/** An entry as the index stores it (corpus.ts writes the same five fields). */
export interface RetrievedEntry {
  id: string;
  kind: string;
  name: string;
  link: string;
  text: string;
}

/**
 * An entry from a vector's metadata, or null when the metadata is not an entry's.
 * The corpus record fails here (it has no link), and so does any entry whose link
 * is not on the site, so an answer can only ever be offered site links to cite.
 *
 * "On the site" is SITE_URL, the one definition the corpus builds links from,
 * not ALLOWED_ORIGIN: that names who may call the Worker, which a development
 * Worker sets to a local origin while it still answers from site entries.
 */
function entryOf(vector: StoredVector): RetrievedEntry | null {
  const meta = vector.metadata ?? {};
  const { id, kind, name, link, text } = meta;
  if (vector.id === CORPUS_RECORD_ID) return null;
  if (![id, kind, name, link, text].every((field) => typeof field === 'string' && field.length > 0)) return null;
  if (!(link as string).startsWith(SITE_URL)) return null;
  return { id, kind, name, link, text } as RetrievedEntry;
}

/** The question's embedding, as a search query, checked for the shape the index was built with. */
async function embed(ai: AiBinding, question: string, signal: AbortSignal): Promise<number[]> {
  const output = (await callWorkersAi(ai, EMBEDDING_MODEL, { text: [queryInput(question)] }, { signal })) as { data?: unknown };
  const vector = Array.isArray(output?.data) ? output.data[0] : undefined;
  if (
    !Array.isArray(vector) ||
    vector.length !== EMBEDDING_DIMENSIONS ||
    !vector.every((value) => typeof value === 'number' && Number.isFinite(value))
  ) {
    throw new Error('embedding_shape');
  }
  return vector;
}

async function named(index: IndexBinding, itemIds: string[]): Promise<RetrievedEntry[]> {
  if (itemIds.length === 0) return [];
  const vectors = await index.getByIds(await Promise.all(itemIds.map(vectorId)));
  const byId = new Map<string, RetrievedEntry>();
  for (const vector of vectors) {
    const entry = entryOf(vector);
    if (entry) byId.set(entry.id, entry);
  }
  // In the lookup's order, which ranks the strongest identifiers first.
  return itemIds.map((id) => byId.get(id)).filter((entry): entry is RetrievedEntry => entry !== undefined);
}

export interface Retrieval {
  entries: RetrievedEntry[];
  /** The half that failed while the other answered, and why; null when both worked. */
  failed: { half: 'named' | 'nearest'; error: unknown } | null;
}

/**
 * The two halves run side by side, and one failing does not throw away what the
 * other found. A failure with nothing found by the other half (both failed, or
 * the question named nothing) throws, with the nearest half's error when it
 * failed: that half alone calls Workers AI, so only its error can be a Workers
 * AI limit, which the handler passes on as a 429.
 */
export async function retrieve(
  question: string,
  env: { AI: AiBinding; INDEX: IndexBinding },
  lookup: Lookup,
  signal: AbortSignal,
): Promise<Retrieval> {
  const [boosted, nearest] = await Promise.allSettled([
    named(env.INDEX, lookup.match(question).slice(0, MAX_NAMED)),
    embed(env.AI, question, signal).then((vector) =>
      env.INDEX.query(vector, { topK: TOP_K, namespace: ENTRY_NAMESPACE, returnMetadata: 'all' }),
    ),
  ]);
  const entries: RetrievedEntry[] = boosted.status === 'fulfilled' ? [...boosted.value] : [];
  if (nearest.status === 'fulfilled') {
    for (const match of nearest.value.matches) {
      const entry = entryOf(match);
      if (entry && !entries.some((held) => held.id === entry.id)) entries.push(entry);
    }
  }
  const failed: Retrieval['failed'] =
    nearest.status === 'rejected'
      ? { half: 'nearest', error: nearest.reason }
      : boosted.status === 'rejected'
        ? { half: 'named', error: boosted.reason }
        : null;
  if (failed && entries.length === 0) throw failed.error;
  return { entries: entries.slice(0, TOP_K), failed };
}
