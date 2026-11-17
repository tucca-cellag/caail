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
 *   4. GET reports which corpus the index was built from, beside the one this
 *      deploy bundles (`corpusStatus`).
 *   5. POST, under one deadline from here on: a body over MAX_BODY_BYTES is 413,
 *      a body that is not `{ query: string }` is 400, and so is a question
 *      outside the word limit.
 *   6. A check that the index was built the way questions are embedded, then
 *      retrieval, then the model.
 */
import {
  CORPUS_RECORD_ID,
  INDEX_RECHECK_MS,
  MAX_BODY_BYTES,
  REQUEST_DEADLINE_MS,
  builtWithTheseSettings,
} from './settings.ts';
import { WORD_LIMIT, wordCount } from './words.ts';
import { bundledCorpusDate, bundledLookup } from './bundled-lookup.ts';
import { retrieve, type AiBinding, type IndexBinding, type StoredVector } from './retrieval.ts';
import { answerText, citedEntryIds, modelInput } from './model.ts';
import { questionRecord, type RecordPoint } from './record.ts';
import type { Lookup } from './lookup.ts';
import { callWorkersAi, workersAiCode } from './workers-ai.ts';

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

/**
 * Workers AI's own 429s: 3036, the account's daily free allocation used up, and
 * 3040, capacity. Passed on as 429 so the widget shows its quota message rather
 * than a generic error.
 */
const WORKERS_AI_LIMITS = new Set([3036, 3040]);

/**
 * The body, or null once it passes `max` bytes; the rest is never read. Reading
 * stops, and the body is cancelled, when `signal` aborts.
 */
async function readCapped(request: Request, max: number, signal: AbortSignal): Promise<string | null> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  signal.addEventListener('abort', () => void reader.cancel().catch(() => {}), { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      // Not awaited, and its failure swallowed, as on the abort path: the rest of
      // the body is unwanted either way, and a cancel that rejects must not turn
      // the 413 into a body-read failure.
      void reader.cancel().catch(() => {});
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
 * One request's deadline: its signal aborts after REQUEST_DEADLINE_MS. Call
 * clear() when done.
 *
 * What the signal does to a Workers AI call: the binding (workerd 1.20261019.1,
 * the version wrangler 4.151.3 installs) puts `options.signal` on its own
 * request to the Workers AI endpoint, so at the deadline that request is
 * cancelled and the Worker stops waiting. Whether Workers AI then stops the
 * inference, and stops charging for it, is not documented: a call cut off at
 * the deadline may still run to completion and still count against the daily
 * allocation.
 */
function startDeadline(): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_DEADLINE_MS);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

type CorpusRecordRead =
  | { status: 'match'; meta: Record<string, unknown> }
  | { status: 'mismatch' }
  | { status: 'missing' }
  | { status: 'failed'; error: unknown };

/**
 * The index's corpus record, read under `signal`, and whether the index was
 * built the way this Worker embeds a question: the record's model and prompts
 * against EMBEDDING_MODEL and EMBEDDING_PROMPTS. A question embedded one way and
 * searched against entries embedded another finds unrelated entries and raises
 * no error, so a mismatch has to be looked for. The GET and the question path
 * both read the record here, so the live check and the questions agree on it.
 * The GET alone also compares the corpus dates (`corpusStatus`).
 */
async function readCorpusRecord(env: Env, signal: AbortSignal): Promise<CorpusRecordRead> {
  let record: StoredVector | undefined;
  try {
    [record] = await racing(env.INDEX.getByIds([CORPUS_RECORD_ID]), signal);
  } catch (error) {
    return { status: 'failed', error };
  }
  const meta = record?.metadata ?? {};
  if (typeof meta.corpusDate !== 'string') return { status: 'missing' };
  if (!builtWithTheseSettings(meta)) return { status: 'mismatch' };
  return { status: 'match', meta };
}

/** What a read that is not a match is logged and answered as. */
function corpusRecordError(read: Exclude<CorpusRecordRead, { status: 'match' }>, signal: AbortSignal): string {
  if (read.status === 'mismatch') return 'index_embedding_mismatch';
  if (read.status === 'missing') return 'index_not_built';
  return signal.aborted ? 'deadline' : 'index_unavailable';
}

/**
 * GET: which corpus the index was built from, beside the one this deploy
 * bundles, so a live check can compare both with api/index.json. It answers 200
 * only for an index the questions would use, built from the corpus this deploy
 * holds, and otherwise 503 naming why, so a live check never reports healthy an
 * index every question refuses.
 *
 * The dates differ between a content change and its redeploy and rebuild, which
 * are both done by hand. Until both land, the deployed-corpus filter drops every
 * entry only one side holds, so the GET says so. A question is still answered
 * (`answer`): the filter keeps that answer to entries both sides hold, so it can
 * miss a new entry but never cite one the deploy lacks, and refusing would take
 * Ask offline on every content change. An index embedded another way is refused
 * by both, since it returns unrelated entries with no error.
 */
async function corpusStatus(env: Env, cors: CorsHeaders, deployedCorpusDate: string): Promise<Response> {
  const deadline = startDeadline();
  try {
    const read = await readCorpusRecord(env, deadline.signal);
    if (read.status !== 'match') {
      const error = corpusRecordError(read, deadline.signal);
      logFailure(error);
      return json({ error }, 503, cors);
    }
    const { corpusDate, embeddingModel, documents } = read.meta;
    if (corpusDate !== deployedCorpusDate) {
      const error = 'index_corpus_date_mismatch';
      logFailure(error);
      return json({ error, corpusDate, bundledCorpusDate: deployedCorpusDate }, 503, cors);
    }
    return json({ corpusDate, bundledCorpusDate: deployedCorpusDate, embeddingModel, documents }, 200, cors);
  } finally {
    deadline.clear();
  }
}

/**
 * Per instance: when the index was last seen to match, or null. A match is
 * trusted for INDEX_RECHECK_MS and then read again, so a warm instance notices
 * a later rebuild with another model or prompts. A mismatch, or no record, is
 * never kept, so each question after it reads the record again and a rebuild
 * is noticed without a redeploy.
 */
interface InstanceState {
  indexMatchedAt: number | null;
}

async function answer(
  request: Request,
  env: Env,
  lookup: Lookup,
  instance: InstanceState,
  cors: CorsHeaders,
): Promise<Response> {
  // Started before the body is read, so a body trickled slowly, or never
  // finished, is cut off at the deadline like everything after it.
  const deadline = startDeadline();
  try {
    let raw: string | null;
    try {
      raw = await racing(readCapped(request, MAX_BODY_BYTES, deadline.signal), deadline.signal);
    } catch (err) {
      if (deadline.signal.aborted) throw err;
      // The body broke mid-read: the client went away or sent a broken upload.
      // That is the client's failure, so a 400 with a line of its own, never
      // the upstream_failure that means Workers AI or Vectorize failed.
      logFailure('body_read_failed');
      return text('bad request', 400, cors);
    }
    if (raw === null) return text('payload too large', 413, cors);
    const question = queryOf(raw);
    if (question === null) return text('bad request', 400, cors);
    const words = wordCount(question);
    if (words < 1 || words > WORD_LIMIT) return text('bad request', 400, cors);

    const checkedAt = instance.indexMatchedAt;
    if (checkedAt === null || Date.now() - checkedAt >= INDEX_RECHECK_MS) {
      const read = await readCorpusRecord(env, deadline.signal);
      if (read.status !== 'match') {
        instance.indexMatchedAt = null;
        logFailure(corpusRecordError(read, deadline.signal));
        return text('service unavailable', 503, cors);
      }
      instance.indexMatchedAt = Date.now();
    }

    const { entries, failed, returned } = await racing(retrieve(question, env, lookup, deadline.signal), deadline.signal);
    // One half failed and the other answered: a degraded answer, not a failure,
    // but the only trace of it, since invocation logs are off.
    if (failed) logFailure(`${failed.half}_retrieval_failed`, workersAiCode(failed.error));
    if (entries.length === 0) {
      // An index that returned nothing is empty. One that returned vectors, none
      // of them an entry this deploy holds or links to the site, disagrees with
      // the deploy: built from another corpus, or not yet rebuilt or redeployed.
      logFailure(returned === 0 ? 'index_empty' : 'index_disagrees_with_deploy');
      return text('service unavailable', 503, cors);
    }
    const output = await racing(
      callWorkersAi(env.AI, env.MODEL_ID, modelInput(env.MODEL_ID, entries, question), { signal: deadline.signal }),
      deadline.signal,
    );
    const reply = answerText(output);
    if (reply === null) {
      logFailure('empty_answer');
      return text('service unavailable', 503, cors);
    }

    // The record is built from these five values and nothing else, after the
    // answer exists. writeDataPoint returns at once and the runtime writes the
    // point in the background, so the write does not delay the answer and needs
    // no ctx.waitUntil; a write that throws is logged and the answer still goes.
    const point = questionRecord({
      question,
      answer: reply,
      citedIds: citedEntryIds(reply, entries),
      modelId: env.MODEL_ID,
      time: Date.now(),
    });
    try {
      env.RECORDS.writeDataPoint(point);
    } catch {
      logFailure('record_not_written');
    }
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
    deadline.clear();
  }
}

/**
 * The handler, with its lookup and the corpus date it was bundled with
 * supplied, so a test can give it its own.
 */
export function createHandler(lookup: Lookup = bundledLookup, deployedCorpusDate: string = bundledCorpusDate) {
  const instance: InstanceState = { indexMatchedAt: null };
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
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

      if (request.method === 'GET') return corpusStatus(env, cors, deployedCorpusDate);
      return answer(request, env, lookup, instance, cors);
    },
  };
}

export default createHandler();
