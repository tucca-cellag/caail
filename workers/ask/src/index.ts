/**
 * Ask CAAIL.
 *
 * Answers a reader's question from the entries CAAIL indexes. It finds the
 * entries the question needs in a Vectorize index built from the published API
 * (retrieval.ts), asks a Workers AI model to answer from those entries alone
 * (model.ts), and returns `{ "answer": <Markdown> }`, citing each entry by its
 * site link. That is the shape the site's widget reads; the widget is unchanged.
 *
 * What it keeps: one record per answered question (record.ts), written to its
 * own Analytics Engine dataset after the answer is built. What it does not keep:
 * the client address, read once as the rate limiter's key and never written; any
 * header; invocation logs, which are off in wrangler.toml because they carry the
 * request. A failure writes one log line naming the error and nothing about the
 * request, and no record.
 *
 * Handler order, which the tests pin:
 *   1. OPTIONS is answered 204; any method but GET and POST is 405.
 *   2. The rate limit, before anything else is read.
 *   3. A foreign Origin is 403.
 *   4. GET reports which corpus the index was built from (`corpusStatus`).
 *   5. POST: a body over MAX_BODY_BYTES is 413, a body that is not
 *      `{ query: string }` is 400, and so is a question outside the word limit.
 *   6. Under one deadline: a check that the index was built the way questions
 *      are embedded (once per instance), then retrieval, then the model.
 */
import { ANSWER_DEADLINE_MS, CORPUS_RECORD_ID, EMBEDDING_MODEL, EMBEDDING_PROMPTS, MAX_BODY_BYTES } from './settings.ts';
import { WORD_LIMIT, wordCount } from './words.ts';
import { bundledLookup } from './bundled-lookup.ts';
import { retrieve, type AiBinding, type IndexBinding, type StoredVector } from './retrieval.ts';
import { answerText, citedEntryIds, modelInput } from './model.ts';
import { questionRecord, type RecordPoint } from './record.ts';
import type { Lookup } from './lookup.ts';

export interface Env {
  AI: AiBinding;
  INDEX: IndexBinding;
  /** The question records' Analytics Engine dataset. */
  RECORDS: { writeDataPoint: (point: RecordPoint) => void };
  /** Cloudflare rate limiting binding, configured in wrangler.toml. */
  RATE_LIMITER: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
  /** Exact origin allowed to call, e.g. https://caail.tufts.edu */
  ALLOWED_ORIGIN: string;
  /** The Workers AI model that answers. Configuration, set in wrangler.toml. */
  MODEL_ID: string;
}

/** The one method of the execution context the handler uses. */
export interface Context {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * The first four groups of an IPv6 address: its /64, the unit a rate limit
 * should count. A copy of the events Worker's, for the same reasons, which its
 * comment there sets out; index.test.ts runs both Workers over one set of
 * addresses and fails when they key one differently.
 */
function ipv6Prefix64(address: string): string {
  const halves = address.split('::');
  if (halves.length > 2) return address.toLowerCase(); // Malformed; key it whole.
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const elided = halves.length === 2 ? Math.max(0, 8 - left.length - right.length) : 0;
  const groups = [...left, ...Array<string>(elided).fill('0'), ...right];
  return groups
    .slice(0, 4)
    .map((group) => (group.replace(/^0+/, '') || '0').toLowerCase())
    .join(':');
}

/**
 * The bucket a request is counted against: the edge-set `CF-Connecting-IP`, by
 * whole IPv4 address or IPv6 /64. A request without it shares one bucket with
 * every other such request, the strict direction, as in the events Worker.
 */
function limitKey(request: Request): string {
  const address = request.headers.get('CF-Connecting-IP');
  if (!address) return 'unknown';
  return address.includes(':') ? ipv6Prefix64(address) : address;
}

/**
 * GET is not among the allowed methods: Allow-Methods answers a preflight, a GET
 * never sends one, and the live check the GET serves is not a browser's.
 */
const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
});

type CorsHeaders = Record<string, string>;

function text(body: string, status: number, cors: CorsHeaders): Response {
  return new Response(body, { status, headers: cors });
}

function json(body: unknown, status: number, cors: CorsHeaders): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * The one log line a failure writes: the error's name, and for an upstream
 * failure the Workers AI code if its message carries one. Never the question,
 * the address, a header or an error message, any of which can carry the request.
 */
function logFailure(error: string, code?: number): void {
  console.error(JSON.stringify(code === undefined ? { error } : { error, code }));
}

/** The Workers AI internal code an error carries, if any (they are 3xxx and 5xxx). */
function workersAiCode(err: unknown): number | undefined {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/\b([35]\d{3})\b/);
  return match ? Number(match[1]) : undefined;
}

/**
 * Workers AI's own 429s: 3036, the account's daily free allocation used up, and
 * 3040, capacity. Passed on as 429 so the widget shows its quota message rather
 * than a generic error.
 */
const WORKERS_AI_LIMITS = new Set([3036, 3040]);

/** The body, or null once it passes `max` bytes; the rest is never read. */
async function readCapped(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** `query` from a body that is exactly a JSON object with a string `query`, else null. */
function queryOf(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const { query } = parsed as { query?: unknown };
  return typeof query === 'string' ? query : null;
}

/**
 * Settles with `promise`, or rejects once `signal` aborts, whichever is first.
 * `promise` is always handled, so one that rejects after losing the race is not
 * an unhandled rejection.
 */
function racing<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('deadline'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    if (signal.aborted) onAbort();
  });
}

/**
 * GET: which corpus the index was built from, read from the index's corpus
 * record, so a live check can compare it with api/index.json.
 */
async function corpusStatus(env: Env, cors: CorsHeaders): Promise<Response> {
  let record: StoredVector | undefined;
  try {
    [record] = await env.INDEX.getByIds([CORPUS_RECORD_ID]);
  } catch {
    logFailure('index_unavailable');
    return text('service unavailable', 503, cors);
  }
  const meta = record?.metadata ?? {};
  if (typeof meta.corpusDate !== 'string') {
    logFailure('index_not_built');
    return text('service unavailable', 503, cors);
  }
  return json(
    { corpusDate: meta.corpusDate, embeddingModel: meta.embeddingModel, documents: meta.documents },
    200,
    cors,
  );
}

/**
 * Whether the index was built the way this Worker embeds a question: its corpus
 * record's model and prompts against EMBEDDING_MODEL and EMBEDDING_PROMPTS. A
 * question embedded one way and searched against entries embedded another finds
 * unrelated entries and raises no error, so a mismatch has to be looked for.
 */
async function indexBuild(env: Env): Promise<'matches' | 'mismatch' | 'not_built'> {
  const [record] = await env.INDEX.getByIds([CORPUS_RECORD_ID]);
  const meta = record?.metadata ?? {};
  if (typeof meta.corpusDate !== 'string') return 'not_built';
  return meta.embeddingModel === EMBEDDING_MODEL && meta.embeddingPrompts === EMBEDDING_PROMPTS ? 'matches' : 'mismatch';
}

/**
 * Per instance: whether the index has been seen to match. Only a match is kept,
 * so after a mismatch or before a build each question reads the record again,
 * and a rebuild is noticed without a redeploy.
 */
interface InstanceState {
  indexMatches: boolean;
}

async function answer(
  request: Request,
  env: Env,
  ctx: Context,
  lookup: Lookup,
  instance: InstanceState,
  cors: CorsHeaders,
): Promise<Response> {
  const raw = await readCapped(request, MAX_BODY_BYTES);
  if (raw === null) return text('payload too large', 413, cors);
  const question = queryOf(raw);
  if (question === null) return text('bad request', 400, cors);
  const words = wordCount(question);
  if (words < 1 || words > WORD_LIMIT) return text('bad request', 400, cors);

  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), ANSWER_DEADLINE_MS);
  try {
    if (!instance.indexMatches) {
      const build = await racing(indexBuild(env), deadline.signal);
      if (build !== 'matches') {
        logFailure(build === 'mismatch' ? 'index_embedding_mismatch' : 'index_not_built');
        return text('service unavailable', 503, cors);
      }
      instance.indexMatches = true;
    }

    const { entries, failed } = await racing(retrieve(question, env, lookup, deadline.signal), deadline.signal);
    // One half failed and the other answered: a degraded answer, not a failure,
    // but the only trace of it, since invocation logs are off.
    if (failed) logFailure(`${failed.half}_retrieval_failed`, workersAiCode(failed.error));
    if (entries.length === 0) {
      logFailure('index_empty');
      return text('service unavailable', 503, cors);
    }
    const output = await racing(
      env.AI.run(env.MODEL_ID, modelInput(env.MODEL_ID, entries, question), { signal: deadline.signal }),
      deadline.signal,
    );
    const reply = answerText(output);
    if (reply === null) {
      logFailure('empty_answer');
      return text('service unavailable', 503, cors);
    }

    // The record is built from these five values and nothing else, after the
    // answer exists, and written without holding the response back.
    const point = questionRecord({
      question,
      answer: reply,
      citedIds: citedEntryIds(reply, entries),
      modelId: env.MODEL_ID,
      time: Date.now(),
    });
    ctx.waitUntil(
      (async () => {
        try {
          env.RECORDS.writeDataPoint(point);
        } catch {
          logFailure('record_not_written');
        }
      })(),
    );
    return json({ answer: reply }, 200, cors);
  } catch (err) {
    if (deadline.signal.aborted) {
      logFailure('deadline');
      return text('service unavailable', 503, cors);
    }
    const code = workersAiCode(err);
    if (code !== undefined && WORKERS_AI_LIMITS.has(code)) {
      logFailure('workers_ai_limit', code);
      return text('too many requests', 429, cors);
    }
    logFailure('upstream_failure', code);
    return text('service unavailable', 503, cors);
  } finally {
    clearTimeout(timer);
  }
}

/** The handler, with its lookup supplied, so a test can give it one built from fixtures. */
export function createHandler(lookup: Lookup = bundledLookup) {
  const instance: InstanceState = { indexMatches: false };
  return {
    async fetch(request: Request, env: Env, ctx: Context): Promise<Response> {
      const cors = corsHeaders(env.ALLOWED_ORIGIN);

      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (request.method !== 'POST' && request.method !== 'GET') return text('method not allowed', 405, cors);

      // First, for GET and POST alike, so every path that reaches a binding is
      // charged: the body is unread, a foreign Origin is charged, and so is a
      // bad body. Any path left uncharged is a free channel to the model.
      //
      // No try/catch: if the binding is missing or throws, the handler 500s and
      // calls nothing paid for, the safe direction to fail.
      const { success } = await env.RATE_LIMITER.limit({ key: limitKey(request) });
      if (!success) {
        // Invocation logs are off, so without this line a refusal leaves no trace.
        logFailure('rate_limited');
        return text('too many requests', 429, cors);
      }

      // Not a security boundary (Origin is set freely off a browser), but it
      // keeps other sites' pages from spending the quota through a reader's
      // browser. A request with no Origin, such as a live check, passes.
      const origin = request.headers.get('Origin');
      if (origin && origin !== env.ALLOWED_ORIGIN) return text('forbidden', 403, cors);

      if (request.method === 'GET') return corpusStatus(env, cors);
      return answer(request, env, ctx, lookup, instance, cors);
    },
  };
}

export default createHandler();
