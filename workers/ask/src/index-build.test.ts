/**
 * The index build, against stand-ins for Cloudflare: never against the real API.
 *
 * Two layers are tested. `runBuild` against a recording CloudflareApi, for the
 * order of the steps and that a failure writes nothing. Then the same build
 * through `restApi` against a fake HTTP API, which is what holds the request
 * count the plan prints to the requests a run actually sends.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DELETE_BATCH,
  EMBED_BATCH,
  METADATA_LIMIT_BYTES,
  UPSERT_BATCH,
  corpusRecord,
  describePlan,
  planBuild,
  requestCounts,
  restApi,
  runBuild,
  totalRequests,
  type CloudflareApi,
  type IndexVector,
} from './index-build.ts';
import { buildCorpus, type ApiFiles } from './corpus.ts';
import { CORPUS_RECORD_ID, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, ENTRY_NAMESPACE, INDEX_NAME, META_NAMESPACE } from './settings.ts';

const apiFile = (name: string) => JSON.parse(readFileSync(new URL(`../../../site/public/api/${name}`, import.meta.url), 'utf8'));
const api: ApiFiles = {
  index: apiFile('index.json'),
  catalog: apiFile('catalog.json'),
  papers: apiFile('papers.json'),
  datasets: apiFile('datasets.json'),
  taxonomy: apiFile('taxonomy.json'),
  reports: apiFile('reports.json'),
};
const plan = await planBuild(api);

const vector = () => Array<number>(EMBEDDING_DIMENSIONS).fill(0.03);

/** A recording CloudflareApi. `index` is what getIndex reports; `existing` is what listing returns. */
function recordingApi(
  options: {
    index?: { dimensions: number; metric: string } | null;
    existing?: string[];
    embed?: CloudflareApi['embed'];
    failUpsert?: boolean;
    failDelete?: boolean;
  } = {},
) {
  const steps: string[] = [];
  const embedded: string[] = [];
  const upserted: IndexVector[][] = [];
  const deleted: string[][] = [];
  const cf: CloudflareApi = {
    getIndex: async () => (steps.push('getIndex'), options.index === undefined ? null : options.index),
    createIndex: async () => void steps.push('createIndex'),
    embed: options.embed ?? (async (texts) => (steps.push('embed'), embedded.push(...texts), texts.map(vector))),
    listVectorIds: async () => (steps.push('list'), options.existing ?? []),
    upsert: async (vectors) => {
      steps.push('upsert');
      if (options.failUpsert) throw new Error('index build: upserting vectors failed (HTTP 500)');
      upserted.push(vectors);
      return `m-up-${upserted.length}`;
    },
    deleteByIds: async (ids) => {
      steps.push('delete');
      if (options.failDelete) throw new Error('index build: deleting vectors failed (HTTP 500)');
      deleted.push(ids);
      return `m-del-${deleted.length}`;
    },
  };
  return { cf, steps, upserted, deleted, embedded };
}

const EXISTING = { dimensions: EMBEDDING_DIMENSIONS, metric: 'cosine' };
const writes = (steps: string[]) => steps.filter((step) => ['createIndex', 'upsert', 'delete'].includes(step));

describe('the plan', () => {
  it('has one entry per corpus document, each under a unique vector id Vectorize accepts', () => {
    expect(plan.entries.map((planned) => planned.entry)).toEqual(buildCorpus(api));
    const ids = plan.entries.map((planned) => planned.vectorId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(new TextEncoder().encode(id).length).toBeLessThanOrEqual(64);
    expect(ids).not.toContain(CORPUS_RECORD_ID);
  });

  it('keeps every entry\'s metadata inside Vectorize\'s limit', () => {
    for (const { entry } of plan.entries) {
      expect(new TextEncoder().encode(JSON.stringify(entry)).length).toBeLessThanOrEqual(METADATA_LIMIT_BYTES);
    }
  });

  it('records the corpus date, the embedding model and the count in a vector outside the entries namespace', () => {
    const record = corpusRecord(plan);
    expect(record.id).toBe(CORPUS_RECORD_ID);
    expect(record.namespace).toBe(META_NAMESPACE);
    expect(record.namespace).not.toBe(ENTRY_NAMESPACE);
    expect(record.values).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(record.metadata).toMatchObject({ corpusDate: api.index.corpusDate, embeddingModel: EMBEDDING_MODEL, documents: plan.entries.length });
  });

  it('prints the request totals it computes', () => {
    const text = describePlan(plan);
    const fresh = totalRequests(requestCounts(plan, { indexExists: false, existing: 0, stale: 0 }));
    expect(text).toContain(`Total into a new index: ${fresh}.`);
    expect(text).toContain(`Documents: ${plan.entries.length} `);
    expect(text).toContain(`Corpus date: ${api.index.corpusDate}`);
  });
});

describe('a run', () => {
  it('into a new index: embeds everything, then creates, then writes, the corpus record last', async () => {
    const { cf, steps, upserted } = recordingApi({ index: null });
    const result = await runBuild(plan, cf, { createIndex: true });

    const embeds = Math.ceil(plan.entries.length / EMBED_BATCH);
    // The entries, then the corpus record in a write of its own.
    expect(steps).toEqual(['getIndex', ...Array(embeds).fill('embed'), 'createIndex', ...Array(Math.ceil(plan.entries.length / UPSERT_BATCH) + 1).fill('upsert')]);
    expect(upserted.at(-1)?.map((v) => v.id)).toEqual([CORPUS_RECORD_ID]);
    const all = upserted.flat();
    expect(all).toHaveLength(plan.entries.length + 1);
    expect(all.at(-1)?.id).toBe(CORPUS_RECORD_ID);
    expect(all.slice(0, -1).every((v) => v.namespace === ENTRY_NAMESPACE)).toBe(true);
    expect(all[0].metadata).toEqual({ ...plan.entries[0].entry });
    expect(result).toMatchObject({ created: true, written: plan.entries.length + 1, deleted: 0 });
  });

  // EmbeddingGemma's document prompt, titled, as Google's EmbeddingGemma docs give
  // it; the question side uses the query prompt (index.test.ts).
  it('embeds each entry as a titled document, never with the query prompt', async () => {
    const { cf, embedded } = recordingApi({ index: null });
    await runBuild(plan, cf, { createIndex: true });

    expect(embedded).toHaveLength(plan.entries.length);
    plan.entries.forEach(({ entry }, n) => {
      const body = entry.text.slice(entry.name.length + 1);
      expect(embedded[n]).toBe(`title: ${entry.name} | text: ${body}`);
    });
    expect(embedded.some((text) => text.includes('task: search result'))).toBe(false);
  });

  it('records the prompts beside the model in the corpus record', () => {
    expect(corpusRecord(plan).metadata.embeddingPrompts).toBe('task: search result | query: {query} / title: {title} | text: {text}');
  });

  it('will not create an index unless told to, and sends nothing past the check', async () => {
    const { cf, steps } = recordingApi({ index: null });
    await expect(runBuild(plan, cf, { createIndex: false })).rejects.toThrow(/--create-index/);
    expect(steps).toEqual(['getIndex']);
  });

  it('refuses an index of the wrong shape, writing nothing', async () => {
    const { cf, steps } = recordingApi({ index: { dimensions: 384, metric: 'cosine' } });
    await expect(runBuild(plan, cf, { createIndex: true })).rejects.toThrow(/384 dimensions/);
    expect(writes(steps)).toEqual([]);
  });

  it('deletes what has left the corpus, keeping the corpus record and every current entry', async () => {
    const current = plan.entries.slice(0, 3).map((planned) => planned.vectorId);
    const { cf, steps, deleted } = recordingApi({ index: EXISTING, existing: [...current, CORPUS_RECORD_ID, 'gone-1', 'gone-2'] });
    const result = await runBuild(plan, cf, { createIndex: false });

    expect(deleted).toEqual([['gone-1', 'gone-2']]);
    expect(result.deleted).toBe(2);
    // Deletes come last, after every entry and the corpus record were written, so
    // a failure leaves extra entries, never missing ones.
    expect(steps.indexOf('delete')).toBeGreaterThan(steps.lastIndexOf('upsert'));
  });

  it('deletes nothing and writes no corpus record when upserting the entries fails', async () => {
    const { cf, steps, upserted, deleted } = recordingApi({ index: EXISTING, existing: [CORPUS_RECORD_ID, 'gone-1'], failUpsert: true });
    await expect(runBuild(plan, cf, { createIndex: false })).rejects.toThrow(/upserting vectors failed/);

    expect(deleted, 'stale vectors were deleted after a failed upsert').toEqual([]);
    expect(steps).not.toContain('delete');
    expect(upserted.flat().some((v) => v.id === CORPUS_RECORD_ID), 'the corpus record was written for a build that did not land').toBe(false);
  });

  it('reports a failed delete after the entries and the corpus record were written', async () => {
    const { cf, upserted } = recordingApi({ index: EXISTING, existing: [CORPUS_RECORD_ID, 'gone-1'], failDelete: true });
    await expect(runBuild(plan, cf, { createIndex: false })).rejects.toThrow(/deleting vectors failed/);

    const written = upserted.flat();
    expect(written).toHaveLength(plan.entries.length + 1);
    expect(written.at(-1)?.id).toBe(CORPUS_RECORD_ID);
  });

  it.each([
    ['an embedding request fails', async () => Promise.reject(new Error('embedding failed'))],
    ['an embedding has the wrong dimensions', async (texts: string[]) => texts.map(() => [0.1, 0.2])],
    ['fewer embeddings come back than were asked for', async (texts: string[]) => texts.slice(1).map(vector)],
    ['an embedding is not finite', async (texts: string[]) => texts.map(() => Array(EMBEDDING_DIMENSIONS).fill(Number.NaN))],
  ])('writes nothing when %s', async (_label, embed) => {
    for (const index of [null, EXISTING]) {
      const { cf, steps } = recordingApi({ index, embed });
      await expect(runBuild(plan, cf, { createIndex: true })).rejects.toThrow();
      expect(writes(steps)).toEqual([]);
    }
  });
});

/**
 * A fake of the REST endpoints the build calls. It answers as Cloudflare's
 * envelope does, records every request, and can be told to fail one step.
 */
function fakeRest(options: { indexExists: boolean; existing?: string[]; failUpsert?: boolean; listFails?: boolean }) {
  const ACCOUNT = 'acct-fixture';
  const TOKEN = 'token-fixture-do-not-leak';
  const calls: { method: string; path: string; search: string; contentType: string; authorization: string; body: string }[] = [];
  const ok = (result: unknown) => new Response(JSON.stringify({ success: true, errors: [], result }), { status: 200 });
  const fail = (status: number, code: number, message: string) =>
    new Response(JSON.stringify({ success: false, errors: [{ code, message }] }), { status });

  const fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    const body = typeof init.body === 'string' ? init.body : '';
    const prefix = `/client/v4/accounts/${ACCOUNT}`;
    const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : `UNEXPECTED ${url.pathname}`;
    const method = init.method ?? 'GET';
    calls.push({ method, path, search: url.search, contentType: headers.get('Content-Type') ?? '', authorization: headers.get('Authorization') ?? '', body });

    const indexPath = `/vectorize/v2/indexes/${INDEX_NAME}`;
    // The documented list of indexes, which also holds one the build must not mistake for its own.
    if (method === 'GET' && path === '/vectorize/v2/indexes') {
      if (options.listFails) return fail(500, 1000, 'list unavailable');
      const ours = { name: INDEX_NAME, config: { dimensions: EMBEDDING_DIMENSIONS, metric: 'cosine' } };
      return ok([{ name: 'another-index', config: { dimensions: 384, metric: 'euclidean' } }, ...(options.indexExists ? [ours] : [])]);
    }
    // The single-index read, whose answer for a missing index is undocumented:
    // the build must not depend on it, so it always answers 404 here.
    if (method === 'GET' && path === indexPath) return fail(404, 3000, 'index not found');
    if (method === 'POST' && path === '/vectorize/v2/indexes') return ok({ name: INDEX_NAME });
    if (method === 'POST' && path === `/ai/run/${EMBEDDING_MODEL}`) {
      const { text } = JSON.parse(body) as { text: string[] };
      return ok({ shape: [text.length, EMBEDDING_DIMENSIONS], data: text.map(vector) });
    }
    if (method === 'GET' && path === `${indexPath}/list`) {
      const count = Number(url.searchParams.get('count'));
      const start = Number(url.searchParams.get('cursor') ?? 0);
      const ids = options.existing ?? [];
      const page = ids.slice(start, start + count);
      const more = start + count < ids.length;
      return ok({ count: page.length, totalCount: ids.length, isTruncated: more, nextCursor: more ? String(start + count) : null, vectors: page.map((id) => ({ id })) });
    }
    if (method === 'POST' && path === `${indexPath}/upsert`) {
      return options.failUpsert ? fail(500, 1000, 'upsert refused') : ok({ mutationId: `m${calls.length}` });
    }
    if (method === 'POST' && path === `${indexPath}/delete_by_ids`) return ok({ mutationId: `m${calls.length}` });
    return fail(400, 9999, `no such fake route ${method} ${path}`);
  }) as typeof globalThis.fetch;

  return { api: restApi({ accountId: ACCOUNT, apiToken: TOKEN, fetch }), calls, TOKEN };
}

describe('the requests a run sends', () => {
  it.each([
    ['into a new index', { indexExists: false }, { indexExists: false, existing: 0, stale: 0 }],
    ['rebuilding an index that holds this corpus', { indexExists: true, current: true }, { indexExists: true, existing: plan.entries.length + 1, stale: 0 }],
    ['rebuilding an index with entries that have left', { indexExists: true, current: true, extra: 1_500 }, { indexExists: true, existing: plan.entries.length + 1 + 1_500, stale: 1_500 }],
  ])('number exactly what the plan counts, %s', async (_label, setup, state) => {
    const existing = setup.indexExists
      ? [...plan.entries.map((planned) => planned.vectorId), CORPUS_RECORD_ID, ...Array.from({ length: (setup as { extra?: number }).extra ?? 0 }, (_, i) => `gone-${i}`)]
      : [];
    const rest = fakeRest({ indexExists: setup.indexExists, existing });
    await runBuild(plan, rest.api, { createIndex: true });

    const counts = requestCounts(plan, state);
    expect(rest.calls).toHaveLength(totalRequests(counts));
    expect(rest.calls.filter((call) => call.path.endsWith('/delete_by_ids'))).toHaveLength(counts.delete);
    expect(rest.calls.filter((call) => call.path.endsWith('/list'))).toHaveLength(counts.list);
    expect(counts.delete).toBe(Math.ceil(state.stale / DELETE_BATCH));
  });

  it('upserts NDJSON lines Vectorize accepts, the corpus record last', async () => {
    const rest = fakeRest({ indexExists: false });
    await runBuild(plan, rest.api, { createIndex: true });

    const upserts = rest.calls.filter((call) => call.path.endsWith('/upsert'));
    expect(upserts.every((call) => call.contentType === 'application/x-ndjson')).toBe(true);
    const lines = upserts.flatMap((call) => call.body.split('\n')).map((line) => JSON.parse(line) as IndexVector);
    expect(lines).toHaveLength(plan.entries.length + 1);
    expect(lines.at(-1)?.id).toBe(CORPUS_RECORD_ID);
    for (const line of lines) {
      expect(line.values).toHaveLength(EMBEDDING_DIMENSIONS);
      expect(Object.keys(line).sort()).toEqual(['id', 'metadata', 'namespace', 'values']);
    }
  });

  // Cloudflare documents the index list's response, and not what reading one
  // missing index returns, so existence is read from the list.
  it('reads whether the index exists from the documented index list', async () => {
    const rest = fakeRest({ indexExists: true, existing: [CORPUS_RECORD_ID] });
    await runBuild(plan, rest.api, { createIndex: true });

    expect(rest.calls.some((call) => call.method === 'GET' && call.path === '/vectorize/v2/indexes')).toBe(true);
    expect(rest.calls.some((call) => call.method === 'POST' && call.path === '/vectorize/v2/indexes'), 'an existing index was created again').toBe(false);
  });

  it('creates the index when the list does not hold it', async () => {
    const rest = fakeRest({ indexExists: false });
    await runBuild(plan, rest.api, { createIndex: true });

    expect(rest.calls.filter((call) => call.method === 'POST' && call.path === '/vectorize/v2/indexes')).toHaveLength(1);
  });

  it('fails closed when the index list cannot be read, writing nothing', async () => {
    const rest = fakeRest({ indexExists: true, listFails: true });
    await expect(runBuild(plan, rest.api, { createIndex: true })).rejects.toThrow(/reading the index list failed/);

    expect(rest.calls.filter((call) => call.method === 'POST')).toEqual([]);
  });

  it('creates the index with the dimensions and metric the Worker queries it with', async () => {
    const rest = fakeRest({ indexExists: false });
    await runBuild(plan, rest.api, { createIndex: true });

    const create = rest.calls.find((call) => call.method === 'POST' && call.path === '/vectorize/v2/indexes');
    expect(JSON.parse(create?.body ?? '{}')).toMatchObject({ name: INDEX_NAME, config: { dimensions: EMBEDDING_DIMENSIONS, metric: 'cosine' } });
  });

  it('sends the token only as the Authorization header, and never in an error', async () => {
    const rest = fakeRest({ indexExists: false, failUpsert: true });
    const error = await runBuild(plan, rest.api, { createIndex: true }).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/upserting vectors failed \(HTTP 500\): 1000 upsert refused/);
    expect((error as Error).message).not.toContain(rest.TOKEN);
    for (const call of rest.calls) {
      expect(call.authorization).toBe(`Bearer ${rest.TOKEN}`);
      expect(`${call.path}${call.search}${call.body}`).not.toContain(rest.TOKEN);
    }
  });
});
