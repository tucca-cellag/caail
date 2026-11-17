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
 * written, so a failed embedding leaves the index as it was. The corpus record,
 * which is what the Worker's GET reports, is the last vector of the last write,
 * so it names the new corpus only once everything before it was accepted.
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

/** How many requests each step sends. `existing` is the vector count already in the index, if any. */
export function requestCounts(plan: BuildPlan, state: { indexExists: boolean; existing: number; stale: number }) {
  const vectors = plan.entries.length + 1;
  return {
    getIndex: 1,
    createIndex: state.indexExists ? 0 : 1,
    embed: Math.ceil(plan.entries.length / EMBED_BATCH),
    // A new index is known to be empty, so it is not listed.
    list: state.indexExists ? Math.max(1, Math.ceil(state.existing / LIST_PAGE)) : 0,
    delete: Math.ceil(state.stale / DELETE_BATCH),
    upsert: Math.ceil(vectors / UPSERT_BATCH),
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
  const vectors = plan.entries.length + 1;
  return [
    `Corpus date: ${plan.corpusDate}`,
    `Documents: ${plan.entries.length} (${[...byKind].map(([kind, n]) => `${kind} ${n}`).join(', ')})`,
    `Vectors written: ${vectors} (the documents and the corpus record)`,
    `Index: ${INDEX_NAME}, ${EMBEDDING_DIMENSIONS} dimensions, ${INDEX_METRIC}; embedding model ${EMBEDDING_MODEL}`,
    '',
    'Requests a run sends to Cloudflare, in order:',
    `  1 GET the index's configuration`,
    `  ${fresh.embed} POST to Workers AI, embedding up to ${EMBED_BATCH} documents each (nothing is written if one fails)`,
    `  1 POST to create the index, only when it does not exist and --create-index is given`,
    `  1 or more GET listing the index's vector ids (${LIST_PAGE} per request), only when the index already existed`,
    `  0 or more POST deleting vectors whose item has left the corpus (${DELETE_BATCH} per request)`,
    `  ${fresh.upsert} POST upserting the ${vectors} vectors (${UPSERT_BATCH} per request; the corpus record last)`,
    '',
    `Total into a new index: ${totalRequests(fresh)}. Total rebuilding an index already holding this corpus: ${totalRequests(rebuild)}.`,
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

  const mutationIds: string[] = [];
  for (const batch of chunks(stale, DELETE_BATCH)) mutationIds.push(await cf.deleteByIds(batch));
  for (const batch of chunks([...vectors, corpusRecord(plan)], UPSERT_BATCH)) mutationIds.push(await cf.upsert(batch));

  return { created: !index, written: vectors.length + 1, deleted: stale.length, mutationIds };
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

  async function call<T>(step: string, url: string, init: RequestInit = {}, allow404 = false): Promise<T | null> {
    const response = await send(url, {
      ...init,
      headers: { Authorization: `Bearer ${options.apiToken}`, ...(init.headers ?? {}) },
    });
    if (allow404 && response.status === 404) return null;
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
    async getIndex() {
      const result = await call<{ config?: { dimensions?: number; metric?: string } }>('reading the index', indexUrl, {}, true);
      if (!result) return null;
      return { dimensions: Number(result.config?.dimensions), metric: String(result.config?.metric) };
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
