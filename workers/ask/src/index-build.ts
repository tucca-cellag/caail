/**
 * Building the Vectorize index from the committed API, run by hand after a
 * corpus change (scripts/build-index.ts).
 *
 * The build is split in two so it can be approved before it runs. `planBuild`
 * makes the documents and the vectors' metadata and sends nothing; `describePlan`
 * says, request by request, what a run will send. `runBuild` sends it, through a
 * `CloudflareApi`, which the tests replace with a stub; `restApi` is the real one,
 * over Cloudflare's REST API.
 *
 * A run fails closed. Every document is embedded and checked before anything is
 * written, so a failed embedding leaves the index as it was. The writes then go
 * in an order where any failure leaves an index the Worker either uses correctly
 * or refuses:
 *   1. When the index's corpus record was written with other embedding settings,
 *      or cannot be read, it is first replaced with a record no Worker accepts,
 *      since the entries about to be written are embedded another way, and a
 *      Worker still on the old settings would otherwise read the old record and
 *      query them the old way.
 *   2. The entries.
 *   3. The corpus record, in a write of its own, which is what the Worker checks
 *      and the GET reports, so it names a build only once every entry was
 *      accepted.
 *   4. Only then the deletes of entries that have left the corpus.
 * A failure part way leaves extra entries, never missing ones, under either the
 * old record (same settings) or the refusing one (changed settings).
 */
import { buildCorpus, corpusDateOf, type ApiFiles, type CorpusEntry } from './corpus.ts';
import { vectorId } from './ids.ts';
import {
  CORPUS_RECORD_ID,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EMBEDDING_PROMPTS,
  ENTRY_NAMESPACE,
  INDEX_NAME,
  META_NAMESPACE,
  documentInput,
} from './settings.ts';

/** Documents per embedding request. */
export const EMBED_BATCH = 100;
/** Vectors per upsert request. */
export const UPSERT_BATCH = 1_000;
/** Vector ids per list request, the most the list endpoint returns. */
export const LIST_PAGE = 1_000;
/** Vector ids per delete request. */
export const DELETE_BATCH = 1_000;
/** Vectorize's cap on one vector's metadata. */
export const METADATA_LIMIT_BYTES = 10_240;

export const INDEX_METRIC = 'cosine';

export interface IndexVector {
  id: string;
  namespace: string;
  values: number[];
  metadata: Record<string, string | number>;
}

export interface PlannedEntry {
  vectorId: string;
  entry: CorpusEntry;
}

export interface BuildPlan {
  corpusDate: string;
  entries: PlannedEntry[];
}

/** What a build run needs from Cloudflare. */
export interface CloudflareApi {
  /** The index's configuration, or null when there is no index by that name. */
  getIndex(): Promise<{ dimensions: number; metric: string } | null>;
  createIndex(): Promise<void>;
  embed(texts: string[]): Promise<number[][]>;
  /** Every vector id in the index, one request per LIST_PAGE ids. */
  listVectorIds(): Promise<string[]>;
  /** The index's corpus record metadata, or null when it holds none. */
  readCorpusRecord(): Promise<Record<string, unknown> | null>;
  /** Returns the mutation id. */
  upsert(vectors: IndexVector[]): Promise<string>;
  /** Returns the mutation id. */
  deleteByIds(ids: string[]): Promise<string>;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** The documents and their vector ids, checked against Vectorize's limits. Sends nothing. */
export async function planBuild(api: ApiFiles): Promise<BuildPlan> {
  const corpusDate = corpusDateOf(api);
  const corpus = buildCorpus(api);
  const entries = await Promise.all(corpus.map(async (entry) => ({ vectorId: await vectorId(entry.id), entry })));
  const ids = new Set(entries.map((planned) => planned.vectorId));
  if (ids.size !== entries.length || ids.has(CORPUS_RECORD_ID)) {
    throw new Error('index build: two entries hash to one vector id');
  }
  for (const { entry } of entries) {
    if (bytes(entry) > METADATA_LIMIT_BYTES) {
      throw new Error(`index build: ${entry.id}'s metadata is over Vectorize's ${METADATA_LIMIT_BYTES}-byte limit`);
    }
  }
  return { corpusDate, entries };
}

/**
 * The corpus record: a unit vector in its own namespace, which no entry query
 * reaches, carrying the corpus date the Worker's GET reports.
 */
export function corpusRecord(plan: BuildPlan): IndexVector {
  const values = Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  values[0] = 1;
  return {
    id: CORPUS_RECORD_ID,
    namespace: META_NAMESPACE,
    values,
    metadata: {
      corpusDate: plan.corpusDate,
      embeddingModel: EMBEDDING_MODEL,
      embeddingPrompts: EMBEDDING_PROMPTS,
      documents: plan.entries.length,
    },
  };
}

/**
 * A corpus record no Worker accepts: it has no corpus date, so the Worker reads
 * it as an index not yet built. It stands while a rebuild with changed embedding
 * settings writes its entries.
 */
export function refusingRecord(plan: BuildPlan): IndexVector {
  const { corpusDate, ...rest } = corpusRecord(plan).metadata;
  return { ...corpusRecord(plan), metadata: { ...rest, rebuilding: corpusDate } };
}

/** Whether a corpus record was written with this build's embedding settings. */
function sameSettings(record: Record<string, unknown>): boolean {
  return record.embeddingModel === EMBEDDING_MODEL && record.embeddingPrompts === EMBEDDING_PROMPTS;
}

/**
 * How many requests each step sends. `existing` is the vector count already in
 * the index, if any; `settingsChanged`, whether its corpus record was written
 * with other embedding settings (or could not be read).
 */
export function requestCounts(
  plan: BuildPlan,
  state: { indexExists: boolean; existing: number; stale: number; settingsChanged?: boolean },
) {
  return {
    getIndex: 1,
    createIndex: state.indexExists ? 0 : 1,
    embed: Math.ceil(plan.entries.length / EMBED_BATCH),
    // A new index is known to be empty, so it is neither listed nor read.
    list: state.indexExists ? Math.max(1, Math.ceil(state.existing / LIST_PAGE)) : 0,
    readRecord: state.indexExists ? 1 : 0,
    refusingRecord: state.indexExists && state.settingsChanged ? 1 : 0,
    // The entries in batches, then the corpus record in a request of its own.
    upsert: Math.ceil(plan.entries.length / UPSERT_BATCH) + 1,
    delete: Math.ceil(state.stale / DELETE_BATCH),
  };
}

export function totalRequests(counts: ReturnType<typeof requestCounts>): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

/** The plan, for a person to approve: what is indexed, and every request a run sends. */
export function describePlan(plan: BuildPlan): string {
  const byKind = new Map<string, number>();
  for (const { entry } of plan.entries) byKind.set(entry.kind, (byKind.get(entry.kind) ?? 0) + 1);
  const fresh = requestCounts(plan, { indexExists: false, existing: 0, stale: 0 });
  const rebuild = requestCounts(plan, { indexExists: true, existing: plan.entries.length + 1, stale: 0 });
  const changed = requestCounts(plan, { indexExists: true, existing: plan.entries.length + 1, stale: 0, settingsChanged: true });
  const vectors = plan.entries.length + 1;
  return [
    `Corpus date: ${plan.corpusDate}`,
    `Documents: ${plan.entries.length} (${[...byKind].map(([kind, n]) => `${kind} ${n}`).join(', ')})`,
    `Vectors written: ${vectors} (the documents and the corpus record)`,
    `Index: ${INDEX_NAME}, ${EMBEDDING_DIMENSIONS} dimensions, ${INDEX_METRIC}; embedding model ${EMBEDDING_MODEL}`,
    '',
    'Requests a run sends to Cloudflare, in order:',
    `  1 GET the list of indexes, for this index's configuration`,
    `  ${fresh.embed} POST to Workers AI, embedding up to ${EMBED_BATCH} documents each (nothing is written if one fails)`,
    `  1 POST to create the index, only when it does not exist and --create-index is given`,
    `  1 or more GET listing the index's vector ids (${LIST_PAGE} per request), only when the index already existed`,
    `  ${rebuild.readRecord} POST reading the index's corpus record, only when the index already existed`,
    `  ${changed.refusingRecord} POST replacing that record with one the Worker refuses, only when it was written with other embedding settings or could not be read`,
    `  ${fresh.upsert - 1} POST upserting the ${plan.entries.length} entries (${UPSERT_BATCH} per request)`,
    `  1 POST upserting the corpus record, once every entry was accepted`,
    `  0 or more POST deleting vectors whose item has left the corpus (${DELETE_BATCH} per request), last`,
    '',
    `Total into a new index: ${totalRequests(fresh)}.`,
    `Total rebuilding an index that holds this corpus with these settings: ${totalRequests(rebuild)}.`,
    `Total rebuilding an index built with other embedding settings: ${totalRequests(changed)}.`,
  ].join('\n');
}

/** An entry's text after its first line, which is its name and is embedded as the title. */
function bodyOf(entry: CorpusEntry): string {
  return entry.text.startsWith(`${entry.name}\n`) ? entry.text.slice(entry.name.length + 1) : entry.text;
}

function checkEmbeddings(vectors: number[][], expected: number): void {
  if (vectors.length !== expected) throw new Error(`index build: asked for ${expected} embeddings, got ${vectors.length}`);
  for (const vector of vectors) {
    if (vector.length !== EMBEDDING_DIMENSIONS || !vector.every((value) => Number.isFinite(value))) {
      throw new Error(`index build: an embedding is not ${EMBEDDING_DIMENSIONS} finite numbers`);
    }
  }
}

export interface BuildResult {
  created: boolean;
  /** Whether the old corpus record was replaced with a refusing one before the entries were written. */
  refused: boolean;
  written: number;
  deleted: number;
  mutationIds: string[];
}

/** Send the plan. `createIndex` allows creating the index when it does not exist. */
export async function runBuild(plan: BuildPlan, cf: CloudflareApi, options: { createIndex: boolean }): Promise<BuildResult> {
  const index = await cf.getIndex();
  if (index && (index.dimensions !== EMBEDDING_DIMENSIONS || index.metric !== INDEX_METRIC)) {
    throw new Error(
      `index build: ${INDEX_NAME} is ${index.dimensions} dimensions, ${index.metric}; this build needs ${EMBEDDING_DIMENSIONS}, ${INDEX_METRIC}`,
    );
  }
  if (!index && !options.createIndex) {
    throw new Error(`index build: there is no index ${INDEX_NAME}; re-run with --create-index to create it`);
  }

  // Everything is embedded and checked before the first write.
  const vectors: IndexVector[] = [];
  for (const batch of chunks(plan.entries, EMBED_BATCH)) {
    const embedded = await cf.embed(batch.map(({ entry }) => documentInput(entry.name, bodyOf(entry))));
    checkEmbeddings(embedded, batch.length);
    batch.forEach(({ vectorId: id, entry }, n) => {
      vectors.push({ id, namespace: ENTRY_NAMESPACE, values: embedded[n], metadata: { ...entry } });
    });
  }

  if (!index) await cf.createIndex();
  const keep = new Set([...plan.entries.map((planned) => planned.vectorId), CORPUS_RECORD_ID]);
  const stale = index ? (await cf.listVectorIds()).filter((id) => !keep.has(id)) : [];

  // A record written with other settings, or one that cannot be read, is
  // refused before entries embedded another way are written over its own. A new
  // index, or one with no record, the Worker refuses already.
  let refuse = false;
  if (index) {
    try {
      const existing = await cf.readCorpusRecord();
      refuse = existing !== null && !sameSettings(existing);
    } catch {
      refuse = true;
    }
  }

  const mutationIds: string[] = [];
  if (refuse) mutationIds.push(await cf.upsert([refusingRecord(plan)]));
  for (const batch of chunks(vectors, UPSERT_BATCH)) mutationIds.push(await cf.upsert(batch));
  mutationIds.push(await cf.upsert([corpusRecord(plan)]));
  for (const batch of chunks(stale, DELETE_BATCH)) mutationIds.push(await cf.deleteByIds(batch));

  return { created: !index, refused: refuse, written: vectors.length + 1, deleted: stale.length, mutationIds };
}

/** Rounded to float32 precision, which is what Vectorize stores, so the upload is not twice the size it needs to be. */
function compact(values: number[]): number[] {
  return values.map((value) => Number(Math.fround(value).toPrecision(9)));
}

interface Envelope<T> {
  success?: boolean;
  result?: T;
  errors?: { code?: number; message?: string }[];
}

/**
 * The real API, over Cloudflare's REST endpoints. The token is sent only as the
 * Authorization header and is never written out, including in errors, which name
 * the step, the HTTP status and Cloudflare's own error codes and messages.
 */
export function restApi(options: { accountId: string; apiToken: string; fetch?: typeof fetch }): CloudflareApi {
  const send = options.fetch ?? fetch;
  const base = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}`;
  const indexUrl = `${base}/vectorize/v2/indexes/${INDEX_NAME}`;

  async function call<T>(step: string, url: string, init: RequestInit = {}): Promise<T | null> {
    const response = await send(url, {
      ...init,
      headers: { Authorization: `Bearer ${options.apiToken}`, ...(init.headers ?? {}) },
    });
    const body = (await response.json().catch(() => ({}))) as Envelope<T>;
    if (!response.ok || body.success !== true) {
      const errors = (body.errors ?? []).map((e) => `${e.code ?? '?'} ${e.message ?? ''}`.trim()).join('; ');
      throw new Error(`index build: ${step} failed (HTTP ${response.status})${errors ? `: ${errors}` : ''}`);
    }
    return (body.result ?? null) as T | null;
  }

  const jsonInit = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return {
    // Read from the list of indexes, whose response Cloudflare documents (a
    // `result` array of { name, config }), rather than from reading the one
    // index, whose answer when it is missing is not documented.
    async getIndex() {
      const result = await call<{ name?: string; config?: { dimensions?: number; metric?: string } }[]>(
        'reading the index list',
        `${base}/vectorize/v2/indexes`,
      );
      if (!Array.isArray(result)) throw new Error('index build: the index list carried no result array');
      const ours = result.find((index) => index.name === INDEX_NAME);
      if (!ours) return null;
      return { dimensions: Number(ours.config?.dimensions), metric: String(ours.config?.metric) };
    },

    async createIndex() {
      await call(
        'creating the index',
        `${base}/vectorize/v2/indexes`,
        jsonInit('POST', {
          name: INDEX_NAME,
          description: 'Ask CAAIL: one vector per entry in the published API',
          config: { dimensions: EMBEDDING_DIMENSIONS, metric: INDEX_METRIC },
        }),
      );
    },

    async embed(texts) {
      const result = await call<{ data?: number[][] }>(
        'embedding',
        `${base}/ai/run/${EMBEDDING_MODEL}`,
        jsonInit('POST', { text: texts }),
      );
      if (!Array.isArray(result?.data)) throw new Error('index build: an embedding response carried no data');
      return result.data;
    },

    // The response's documented shape is `result.vectors`; a bare array is read
    // too. Anything else throws, which the build takes as a record it cannot
    // read, and so refuses before writing.
    async readCorpusRecord() {
      const result = await call<unknown>('reading the corpus record', `${indexUrl}/get_by_ids`, jsonInit('POST', { ids: [CORPUS_RECORD_ID] }));
      const vectors = Array.isArray(result) ? result : (result as { vectors?: unknown } | null)?.vectors;
      if (!Array.isArray(vectors)) throw new Error('index build: the corpus record read carried no vectors');
      const record = (vectors as { id?: string; metadata?: Record<string, unknown> }[]).find((v) => v.id === CORPUS_RECORD_ID);
      return record?.metadata ?? null;
    },

    async listVectorIds() {
      const ids: string[] = [];
      let cursor: string | undefined;
      for (;;) {
        const query = new URLSearchParams({ count: String(LIST_PAGE), ...(cursor ? { cursor } : {}) });
        const page = await call<{ vectors?: { id: string }[]; isTruncated?: boolean; nextCursor?: string | null }>(
          'listing the index',
          `${indexUrl}/list?${query}`,
        );
        ids.push(...(page?.vectors ?? []).map((vector) => vector.id));
        if (!page?.isTruncated || !page.nextCursor) return ids;
        cursor = page.nextCursor;
      }
    },

    async upsert(vectors) {
      const ndjson = vectors.map((vector) => JSON.stringify({ ...vector, values: compact(vector.values) })).join('\n');
      const result = await call<{ mutationId?: string }>('upserting vectors', `${indexUrl}/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: ndjson,
      });
      return String(result?.mutationId ?? '');
    },

    async deleteByIds(ids) {
      const result = await call<{ mutationId?: string }>('deleting vectors', `${indexUrl}/delete_by_ids`, jsonInit('POST', { ids }));
      return String(result?.mutationId ?? '');
    },
  };
}
