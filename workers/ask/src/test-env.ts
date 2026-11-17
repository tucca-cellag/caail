/**
 * A recording stand-in for the Worker's bindings, for the handler tests. Each
 * binding records what the handler did to it, and each test overrides only the
 * binding its case is about.
 *
 * The binding names here are the wrangler.toml names. That is what makes a
 * code-side rename fail every handler test, while config.test.ts catches a
 * config-side one (the same split the events Worker's tests describe).
 */
import { vi } from 'vitest';
import { createHandler, type Context, type Env } from './index.ts';
import { CORPUS_RECORD_ID, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, EMBEDDING_PROMPTS } from './settings.ts';
import { vectorId } from './ids.ts';
import type { Lookup } from './lookup.ts';
import type { RetrievedEntry, StoredVector } from './retrieval.ts';
import type { RecordPoint } from './record.ts';

export const ORIGIN = 'https://caail.tufts.edu';
export const MODEL = '@cf/test/model';

export const ENTRIES: RetrievedEntry[] = [
  {
    id: 'sw:alphafold',
    kind: 'software',
    name: 'AlphaFold',
    link: `${ORIGIN}/software/#alphafold`,
    text: 'AlphaFold\nSoftware listed under "Media Optimization & Cell Line Engineering".',
  },
  {
    id: 'paper:1',
    kind: 'paper',
    name: 'Toward sustainable culture media',
    link: `${ORIGIN}/papers/explorer/?item=paper:1`,
    text: 'Toward sustainable culture media\nPaper (primary research): Nikkhah, A. et al., 2023.',
  },
  {
    id: 'ds:gse169291',
    kind: 'dataset',
    name: 'Spontaneous immortalization of chicken fibroblasts',
    link: `${ORIGIN}/datasets/chicken/?item=ds:gse169291#complete-data-inventory`,
    text: 'Spontaneous immortalization of chicken fibroblasts\nAccession: GSE169291',
  },
];

export const ANSWER = `AlphaFold predicts protein structure ([AlphaFold](${ENTRIES[0].link})).`;

export type AiRun = (model: string, inputs: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>;

export interface Harness {
  env: Env;
  ctx: Context;
  /** Records handed to Analytics Engine, in order. */
  written: RecordPoint[];
  /** Keys passed to the rate limiter, in order. */
  limitKeys: string[];
  /** Calls to Workers AI, in order. */
  aiCalls: { model: string; inputs: Record<string, unknown>; options?: { signal?: AbortSignal } }[];
  /** Promises handed to ctx.waitUntil, so a test can await them. */
  waited: Promise<unknown>[];
  /** Ids asked of the index's getByIds, in order. */
  fetchedIds: string[][];
}

const unitVector = () => Array<number>(EMBEDDING_DIMENSIONS).fill(1 / Math.sqrt(EMBEDDING_DIMENSIONS));

export const embeddingOutput = () => ({ shape: [1, EMBEDDING_DIMENSIONS], data: [unitVector()] });

export const chatOutput = (content: string) => ({
  id: 'x',
  object: 'chat.completion',
  created: 0,
  model: MODEL,
  choices: [{ index: 0, message: { role: 'assistant', content, refusal: null }, finish_reason: 'stop', logprobs: null }],
});

/** A corpus record as the index build writes it, with any field overridden. */
export function corpusRecordFor(overrides: Record<string, unknown> = {}): StoredVector {
  return {
    id: CORPUS_RECORD_ID,
    namespace: 'meta',
    metadata: { corpusDate: '2026-11-14', embeddingModel: EMBEDDING_MODEL, embeddingPrompts: EMBEDDING_PROMPTS, documents: 907, ...overrides },
  };
}

/** The default model: embeddings for the embedding model, ANSWER for any other. */
export const defaultAi: AiRun = async (model) => (model === EMBEDDING_MODEL ? embeddingOutput() : chatOutput(ANSWER));

export function harness(
  options: {
    allow?: boolean;
    ai?: AiRun;
    entries?: RetrievedEntry[];
    corpusRecord?: StoredVector | null;
    query?: () => Promise<{ matches: (StoredVector & { score: number })[] }>;
    getByIds?: (ids: string[]) => Promise<StoredVector[]>;
    writeDataPoint?: (point: RecordPoint) => void;
  } = {},
): Harness {
  const { allow = true, ai = defaultAi, entries = ENTRIES } = options;
  const written: RecordPoint[] = [];
  const limitKeys: string[] = [];
  const aiCalls: Harness['aiCalls'] = [];
  const waited: Promise<unknown>[] = [];
  const fetchedIds: string[][] = [];
  const record =
    options.corpusRecord === undefined
      ? corpusRecordFor()
      : options.corpusRecord;

  const env: Env = {
    AI: {
      run: async (model, inputs, opts) => {
        aiCalls.push({ model, inputs, options: opts });
        return ai(model, inputs, opts);
      },
    },
    INDEX: {
      query:
        options.query ??
        (async () => ({
          matches: entries.map((entry, n) => ({ id: `v${n}`, score: 0.9 - n / 100, metadata: { ...entry } })),
        })),
      getByIds:
        options.getByIds ??
        (async (ids) => {
          fetchedIds.push(ids);
          // The corpus record alone is answered without hashing: hashing is real
          // asynchronous work that a test on a fake clock does not wait for.
          const byVector = new Map<string, StoredVector>();
          if (record) byVector.set(CORPUS_RECORD_ID, record);
          if (ids.some((id) => id !== CORPUS_RECORD_ID)) {
            for (const entry of entries) byVector.set(await vectorId(entry.id), { id: await vectorId(entry.id), metadata: { ...entry } });
          }
          return ids.map((id) => byVector.get(id)).filter((v): v is StoredVector => v !== undefined);
        }),
    },
    RECORDS: { writeDataPoint: options.writeDataPoint ?? ((point) => void written.push(point)) },
    RATE_LIMITER: {
      limit: async ({ key }) => {
        limitKeys.push(key);
        return { success: allow };
      },
    },
    ALLOWED_ORIGIN: ORIGIN,
    MODEL_ID: MODEL,
  };
  const ctx: Context = { waitUntil: (promise) => void waited.push(promise) };
  return { env, ctx, written, limitKeys, aiCalls, waited, fetchedIds };
}

/** A lookup that names nothing, so a test sees retrieval by meaning alone. */
export const noLookup: Lookup = { match: () => [] };

export const handlerWith = (lookup: Lookup = noLookup) => createHandler(lookup);

/** A well-formed question post, so each test varies only the thing it is about. */
export function ask(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://ask.example/', {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Every line the handler logged, through any console method. */
export function captureLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' '))),
  );
  return { lines, restore: () => spies.forEach((spy) => spy.mockRestore()) };
}
