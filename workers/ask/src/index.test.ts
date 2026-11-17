/**
 * Tests for the Ask CAAIL Worker's handler.
 *
 * These run inside the site's vitest project (site/vitest.config.ts), as the
 * events Worker's do, against recording stand-ins for the bindings
 * (test-env.ts). They pin the handler's order, each way it refuses or fails,
 * and what an answered question returns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import eventsWorker from '../../events/src/index.ts';
import { CORPUS_RECORD_ID, EMBEDDING_MODEL, INDEX_RECHECK_MS, MAX_BODY_BYTES, REQUEST_DEADLINE_MS } from './settings.ts';
import { WORD_LIMIT } from './words.ts';
import { MAX_TOKENS, SYSTEM_PROMPT, TEMPERATURE } from './model.ts';
import { vectorId } from './ids.ts';
import { bundledLookup } from './bundled-lookup.ts';
import datasetsFile from '../../../site/public/api/datasets.json';
import {
  ANSWER,
  ENTRIES,
  MODEL,
  ORIGIN,
  ask,
  captureLogs,
  chatOutput,
  corpusRecordFor,
  defaultAi,
  embeddingOutput,
  handlerWith,
  harness,
} from './test-env.ts';

const QUESTION = { query: 'which tools predict protein structure?' };
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  logs = captureLogs();
});
afterEach(() => {
  logs.restore();
  vi.useRealTimers();
});

// Built when the module loads, which is the Worker's startup, so no request,
// refused or answered, pays for building it.
describe('the bundled lookup', () => {
  it('is a built lookup at load, not a function a request calls', () => {
    const row = datasetsFile.inventory.find((r) => r.accession !== null);
    expect(typeof bundledLookup, 'the bundled lookup is built on a request').toBe('object');
    expect(bundledLookup.match(`Which dataset is ${row?.accession}?`)).toContain(row?.id);
  });
});

describe('handler order', () => {
  it('answers a preflight 204 and spends no budget on it', async () => {
    const spy = harness();
    const res = await handlerWith().fetch(new Request('https://ask.example/', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), spy.env, spy.ctx);

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    expect(spy.limitKeys).toEqual([]);
  });

  it.each(['PUT', 'DELETE', 'PATCH', 'HEAD'])('refuses %s with 405 and spends no budget on it', async (method) => {
    const spy = harness();
    const res = await handlerWith().fetch(new Request('https://ask.example/', { method }), spy.env, spy.ctx);

    expect(res.status).toBe(405);
    expect(spy.limitKeys).toEqual([]);
    expect(spy.aiCalls).toEqual([]);
  });

  it('checks the rate limit before reading the body', async () => {
    const spy = harness({ allow: false });
    const res = await handlerWith().fetch(ask('not json at all'), spy.env, spy.ctx);

    // A 400 here would mean the body was read first.
    expect(res.status).toBe(429);
    expect(spy.limitKeys).toHaveLength(1);
    expect(spy.aiCalls).toEqual([]);
    expect(spy.written).toEqual([]);
  });

  it('checks the rate limit before the Origin', async () => {
    const spy = harness({ allow: false });
    const res = await handlerWith().fetch(ask(QUESTION, { Origin: 'https://evil.example' }), spy.env, spy.ctx);

    expect(res.status).toBe(429);
  });

  it('refuses a foreign Origin with 403, charged, before the body is read', async () => {
    const spy = harness();
    const res = await handlerWith().fetch(ask('not json at all', { Origin: 'https://evil.example' }), spy.env, spy.ctx);

    expect(res.status).toBe(403);
    expect(spy.limitKeys).toHaveLength(1);
    expect(spy.aiCalls).toEqual([]);
  });

  it('admits a request with no Origin, as a non-browser caller sends', async () => {
    const spy = harness();
    const res = await handlerWith().fetch(
      new Request('https://ask.example/', { method: 'POST', body: JSON.stringify(QUESTION) }),
      spy.env,
      spy.ctx,
    );

    expect(res.status).toBe(200);
  });

  it.each([
    ['not JSON', 'not json at all'],
    ['a bare literal', 'null'],
    ['an array', '[{"query":"x"}]'],
    ['no query', '{}'],
    ['a numeric query', '{"query":42}'],
    ['a query object', '{"query":{"text":"x"}}'],
  ])('refuses %s with 400 and calls nothing', async (_label, body) => {
    const spy = harness();
    const res = await handlerWith().fetch(ask(body), spy.env, spy.ctx);

    expect(res.status).toBe(400);
    expect(spy.aiCalls).toEqual([]);
    expect(spy.written).toEqual([]);
  });

  it.each([
    ['an empty question', ''],
    ['a blank question', ' \n\t '],
    ['one word over the limit', words(WORD_LIMIT + 1)],
  ])('refuses %s with 400 and calls nothing', async (_label, query) => {
    const spy = harness();
    const res = await handlerWith().fetch(ask({ query }), spy.env, spy.ctx);

    expect(res.status).toBe(400);
    expect(spy.aiCalls).toEqual([]);
  });

  it.each([
    ['one word', 'scaffolding'],
    ['the word limit exactly', words(WORD_LIMIT)],
  ])('answers %s', async (_label, query) => {
    const spy = harness();
    const res = await handlerWith().fetch(ask({ query }), spy.env, spy.ctx);

    expect(res.status).toBe(200);
  });

  it('refuses a body over the byte cap with 413, unparsed', async () => {
    const spy = harness();
    const res = await handlerWith().fetch(ask({ query: 'x'.repeat(MAX_BODY_BYTES) }), spy.env, spy.ctx);

    expect(res.status).toBe(413);
    expect(spy.aiCalls).toEqual([]);
  });

  // Cancelling the rest of an oversized body is housekeeping: a cancel that
  // fails must not turn the 413 into a body-read failure.
  it('still refuses an oversized body with 413 when cancelling the rest of it fails', async () => {
    const spy = harness();
    const chunk = new TextEncoder().encode('x'.repeat(1024));
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
      cancel() {
        return Promise.reject(new Error('cancel failed'));
      },
    });
    const request = new Request('https://ask.example/', {
      method: 'POST',
      headers: { Origin: ORIGIN },
      body,
      // @ts-expect-error Node's fetch needs this to send a stream body.
      duplex: 'half',
    });
    const res = await handlerWith().fetch(request, spy.env, spy.ctx);

    expect(res.status).toBe(413);
    expect(logs.lines).toEqual([]);
  });

  it('refuses an oversized body that declares no length', async () => {
    const spy = harness();
    const big = new TextEncoder().encode(JSON.stringify({ query: 'x'.repeat(MAX_BODY_BYTES) }));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < big.length; i += 1024) controller.enqueue(big.slice(i, i + 1024));
        controller.close();
      },
    });
    const request = new Request('https://ask.example/', {
      method: 'POST',
      headers: { Origin: ORIGIN },
      body: stream,
      // @ts-expect-error Node's fetch needs this to send a stream body.
      duplex: 'half',
    });
    const res = await handlerWith().fetch(request, spy.env, spy.ctx);

    expect(res.status).toBe(413);
    expect(spy.aiCalls).toEqual([]);
  });
});

describe('an answered question', () => {
  it('returns the answer as JSON, with CORS', async () => {
    const spy = harness();
    const res = await handlerWith().fetch(ask(QUESTION), spy.env, spy.ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(await res.json()).toEqual({ answer: ANSWER });
  });

  it('embeds the question, then asks the configured model with the entries, the prompt and explicit settings', async () => {
    const spy = harness();
    await handlerWith().fetch(ask(QUESTION), spy.env, spy.ctx);

    expect(spy.aiCalls.map((call) => call.model)).toEqual([EMBEDDING_MODEL, MODEL]);
    // EmbeddingGemma's search-query prompt, as Google's EmbeddingGemma docs give it.
    expect(spy.aiCalls[0].inputs).toEqual({ text: [`task: search result | query: ${QUESTION.query}`] });
    const { inputs } = spy.aiCalls[1];
    expect(inputs.max_tokens).toBe(MAX_TOKENS);
    expect(inputs.temperature).toBe(TEMPERATURE);
    const [system, user] = inputs.messages as { role: string; content: string }[];
    expect(system).toEqual({ role: 'system', content: SYSTEM_PROMPT });
    expect(user.role).toBe('user');
    for (const entry of ENTRIES) expect(user.content).toContain(`Link: ${entry.link}`);
    expect(user.content).toContain(`Question: ${QUESTION.query}`);
  });

  it('answers from site entries under another allowed origin', async () => {
    const spy = harness();
    spy.env.ALLOWED_ORIGIN = 'http://localhost:4321';
    const res = await handlerWith().fetch(ask(QUESTION, { Origin: 'http://localhost:4321' }), spy.env, spy.ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answer: ANSWER });
  });

  it('reads the model from configuration', async () => {
    const spy = harness();
    spy.env.MODEL_ID = '@cf/test/another-model';
    await handlerWith().fetch(ask(QUESTION), spy.env, spy.ctx);

    expect(spy.aiCalls[1].model).toBe('@cf/test/another-model');
  });

  // An AI Gateway logs prompts and responses by default; the call carries only
  // the deadline's abort signal.
  it('passes no gateway or other option to Workers AI', async () => {
    const spy = harness();
    await handlerWith().fetch(ask(QUESTION), spy.env, spy.ctx);

    for (const call of spy.aiCalls) expect(Object.keys(call.options ?? {})).toEqual(['signal']);
  });

  it('cites absolute site links and records the entries it cited', async () => {
    const both = `See [AlphaFold](${ENTRIES[0].link}) and [the chicken deposit](${ENTRIES[2].link}).`;
    const spy = harness({ ai: async (model) => (model === EMBEDDING_MODEL ? embeddingOutput() : chatOutput(both)) });
    const res = await handlerWith().fetch(ask(QUESTION), spy.env, spy.ctx);
    await Promise.all(spy.waited);

    const { answer } = (await res.json()) as { answer: string };
    expect(answer.match(/https?:\/\/[^\s)]+/g)?.every((url) => url.startsWith(`${ORIGIN}/`))).toBe(true);
    expect(spy.written[0].blobs[2]).toBe('sw:alphafold ds:gse169291');
  });

  it('puts an entry the question names first, fetched from the index by id', async () => {
    const spy = harness();
    const named = { match: () => [ENTRIES[2].id] };
    await handlerWith(named).fetch(ask(QUESTION), spy.env, spy.ctx);

    // The corpus record first (the index check), then the named entry.
    expect(spy.fetchedIds).toEqual([[CORPUS_RECORD_ID], [await vectorId(ENTRIES[2].id)]]);
    const user = (spy.aiCalls[1].inputs.messages as { content: string }[])[1].content;
    expect(user.indexOf(ENTRIES[2].link)).toBeLessThan(user.indexOf(ENTRIES[0].link));
    expect(user.match(/^Entry \d+$/gm)).toHaveLength(ENTRIES.length);
  });

  it('writes no log line', async () => {
    const spy = harness();
    await handlerWith().fetch(ask(QUESTION), spy.env, spy.ctx);
    await Promise.all(spy.waited);

    expect(logs.lines).toEqual([]);
  });
});

/**
 * Each failure: the status the widget turns into its message, exactly one log
 * line naming the error, nothing from the request in it, and no record.
 */
describe('failures', () => {
  const PRIVATE = { query: 'my unpublished process detail ZQX-SECRET' };
  const HEADERS = { 'CF-Connecting-IP': '203.0.113.99' };

  async function fails(spy: ReturnType<typeof harness>, run: () => Promise<Response>) {
    const res = await run();
    await Promise.all(spy.waited);
    expect(spy.written, 'a failed request wrote a question record').toEqual([]);
    expect(logs.lines, 'a failure writes exactly one log line').toHaveLength(1);
    const line = logs.lines[0];
    expect(line, 'the log line carries the question').not.toContain('ZQX-SECRET');
    expect(line, 'the log line carries the address').not.toContain('203.0.113.99');
    return { status: res.status, logged: JSON.parse(line) as { error: string; code?: number } };
  }

  /** Start a request and run the clock to the deadline; say whether the handler has answered. */
  async function atDeadline(run: () => Promise<Response>) {
    let settled = false;
    const pending = run().finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);
    expect(settled, 'the handler was still waiting at the deadline').toBe(true);
    return pending;
  }

  /** A POST whose body arrives as `chunks`, each after `delayMs`, closed only if `close`. */
  function trickled(chunks: string[], { delayMs, close }: { delayMs: number; close: boolean }): Request {
    const encoder = new TextEncoder();
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        return new Promise<void>((resolve) => {
          if (sent === chunks.length) {
            if (close) controller.close();
            return; // Never settles when the body is left open: the next read waits for ever.
          }
          setTimeout(() => {
            controller.enqueue(encoder.encode(chunks[sent++]));
            resolve();
          }, delayMs);
        });
      },
    });
    return new Request('https://ask.example/', {
      method: 'POST',
      headers: { Origin: ORIGIN },
      body,
      // @ts-expect-error Node's fetch needs this to send a stream body.
      duplex: 'half',
    });
  }

  // The deadline starts before the body is read, so a caller trickling a body,
  // or never finishing one, cannot hold a request open without bound.
  it('cuts off a body that never ends at the deadline', async () => {
    vi.useFakeTimers();
    const spy = harness();
    const { status, logged } = await fails(spy, () =>
      atDeadline(() => handlerWith().fetch(trickled(['{"query":"never fin'], { delayMs: 10, close: false }), spy.env, spy.ctx)),
    );

    expect(status).toBe(503);
    expect(logged).toEqual({ error: 'deadline' });
    expect(spy.aiCalls).toEqual([]);
  });

  // A body that breaks mid-read (the client went away, or sent a broken upload)
  // is the client's failure, not the service's: a 400 logged as its own error,
  // so it never reads as Workers AI or Vectorize failing.
  it('answers a body that breaks mid-read with 400, logged as its own error', async () => {
    const spy = harness();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"query":"which tools'));
        controller.error(new Error('connection reset by peer'));
      },
    });
    const request = new Request('https://ask.example/', {
      method: 'POST',
      headers: { Origin: ORIGIN },
      body,
      // @ts-expect-error Node's fetch needs this to send a stream body.
      duplex: 'half',
    });
    const { status, logged } = await fails(spy, () => handlerWith().fetch(request, spy.env, spy.ctx));

    expect(status).toBe(400);
    expect(logged).toEqual({ error: 'body_read_failed' });
    expect(spy.aiCalls).toEqual([]);
  });

  it('answers a slow body that arrives inside the deadline', async () => {
    vi.useFakeTimers();
    const spy = harness();
    const chunks = ['{"query":"which tools ', 'predict protein ', 'structure?"}'];
    const pending = handlerWith().fetch(trickled(chunks, { delayMs: 1_000, close: true }), spy.env, spy.ctx);
    await vi.advanceTimersByTimeAsync(chunks.length * 1_000 + 10);

    expect((await pending).status).toBe(200);
  });

  it('returns 503 when the model runs past the deadline', async () => {
    vi.useFakeTimers();
    const spy = harness({ ai: (model, inputs, opts) => (model === EMBEDDING_MODEL ? defaultAi(model, inputs, opts) : new Promise(() => {})) });
    const { status, logged } = await fails(spy, () => atDeadline(() => handlerWith().fetch(ask(PRIVATE, HEADERS), spy.env, spy.ctx)));

    expect(status).toBe(503);
    expect(logged).toEqual({ error: 'deadline' });
  });

  it('aborts the model call itself at the deadline', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const spy = harness({
      ai: (model, inputs, opts) => {
        if (model === EMBEDDING_MODEL) return defaultAi(model, inputs, opts);
        signal = opts?.signal;
        return new Promise(() => {});
      },
    });
    const pending = handlerWith().fetch(ask(QUESTION), spy.env, spy.ctx);
    await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(signal?.aborted, 'the model call was not aborted at the deadline').toBe(true);
    // Settle the request so it does not outlive the test.
    await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);
    await Promise.race([pending, Promise.resolve()]);
  });

  it('does not give up on a model that answers just inside the deadline', async () => {
    vi.useFakeTimers();
    const spy = harness({
      ai: (model, inputs, opts) =>
        model === EMBEDDING_MODEL
          ? defaultAi(model, inputs, opts)
          : new Promise((resolve) => setTimeout(() => resolve(chatOutput(ANSWER)), REQUEST_DEADLINE_MS - 100)),
    });
    const pending = handlerWith().fetch(ask(QUESTION), spy.env, spy.ctx);
    await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS - 100);

    expect((await pending).status).toBe(200);
  });

  it.each([
    [3036, 'You have used up your daily free allocation of 10,000 neurons.'],
    [3040, 'Capacity temporarily exceeded, please try again.'],
  ])('passes Workers AI %i on as 429', async (code, message) => {
    const spy = harness({
      ai: async (model, inputs, opts) => {
        if (model === EMBEDDING_MODEL) return defaultAi(model, inputs, opts);
        throw new Error(`${code}: ${message}`);
      },
    });
    const { status, logged } = await fails(spy, () => handlerWith().fetch(ask(PRIVATE, HEADERS), spy.env, spy.ctx));

    expect(status).toBe(429);
    expect(logged).toEqual({ error: 'workers_ai_limit', code });
  });

  it('passes a Workers AI limit on the embedding call on as 429 too', async () => {
    const spy = harness({
      ai: async () => {
        throw new Error('3036: You have used up your daily free allocation of 10,000 neurons.');
      },
    });
    const { status } = await fails(spy, () => handlerWith().fetch(ask(PRIVATE, HEADERS), spy.env, spy.ctx));

    expect(status).toBe(429);
  });

  // The other direction: an error that is not a Workers AI limit is not a 429,
  // or the widget would tell a reader to wait out a quota that is not the cause.
  it.each([
    ['another Workers AI error', new Error('5007: No such model @cf/test/model or task'), { error: 'upstream_failure', code: 5007 }],
    ['an error with no code', new Error('socket hang up'), { error: 'upstream_failure' }],
  ])('returns 503 for %s', async (_label, error, expected) => {
    const spy = harness({
      ai: async (model, inputs, opts) => {
        if (model === EMBEDDING_MODEL) return defaultAi(model, inputs, opts);
        throw error;
      },
    });
    const { status, logged } = await fails(spy, () => handlerWith().fetch(ask(PRIVATE, HEADERS), spy.env, spy.ctx));

    expect(status).toBe(503);
    expect(logged).toEqual(expected);
  });

  // A code is read only from a Workers AI call's own error, so a number in any
  // other message is never taken for a quota.
  it('returns 503, not 429, for an index error whose message holds 3040', async () => {
    const spy = harness({
      query: async () => {
        throw new Error('vectorize query failed after 3040 ms');
      },
    });
    const { status, logged } = await fails(spy, () => handlerWith().fetch(ask(PRIVATE, HEADERS), spy.env, spy.ctx));

    expect(status).toBe(503);
    expect(logged).toEqual({ error: 'upstream_failure' });
  });

  it('returns 503, not 429, for a model error that only mentions 3040 in passing', async () => {
    const spy = harness({
      ai: async (model, inputs, opts) => {
        if (model === EMBEDDING_MODEL) return defaultAi(model, inputs, opts);
        throw new Error('upstream connection reset after 3040 ms');
      },
    });
    const { status, logged } = await fails(spy, () => handlerWith().fetch(ask(PRIVATE, HEADERS), spy.env, spy.ctx));

    expect(status).toBe(503);
    expect(logged).toEqual({ error: 'upstream_failure' });
  });

  it.each([
    ['a structured code field', Object.assign(new Error('capacity'), { code: 3040 }), 3040],
    ['a structured code as a string', Object.assign(new Error('allocation'), { code: '3036' }), 3036],
    ['the documented capacity message alone', new Error('Capacity temporarily exceeded, please try again.'), 3040],
    ['the documented allocation message alone', new Error('You have used up your daily free allocation of 10,000 neurons.'), 3036],
  ])('passes a Workers AI limit given as %s on as 429', async (_label, error, code) => {
    const spy = harness({
      ai: async (model, inputs, opts) => {
        if (model === EMBEDDING_MODEL) return defaultAi(model, inputs, opts);
        throw error;
      },
    });
    const { status, logged } = await fails(spy, () => handlerWith().fetch(ask(PRIVATE, HEADERS), spy.env, spy.ctx));

    expect(status).toBe(429);
    expect(logged).toEqual({ error: 'workers_ai_limit', code });
  });

  it('logs no code for a failed index fetch, whatever its message', async () => {
    const spy = harness({
      getByIds: async (ids) => {
        if (ids.includes(CORPUS_RECORD_ID)) return [corpusRecordFor()];
        throw new Error('3036 vectors could not be read');
      },
    });
    const res = await handlerWith({ match: () => [ENTRIES[2].id] }).fetch(ask(QUESTION), spy.env, spy.ctx);

    expect(res.status).toBe(200);
    expect(logs.lines.map((line) => JSON.parse(line))).toEqual([{ error: 'named_retrieval_failed' }]);
  });

  it('returns 503 when the index fails', async () => {
    const spy = harness({
      query: async () => {
        throw new Error('vectorize unavailable');
      },
    });
    const { status, logged } = await fails(spy, () => handlerWith().fetch(ask(PRIVATE, HEADERS), spy.env, spy.ctx));

    expect(status).toBe(503);
    expect(logged).toEqual({ error: 'upstream_failure' });
  });

  it('returns 503 when the index holds no entries', async () => {
    const spy = harness({ entries: [] });
    const { status, logged } = await fails(spy, () => handlerWith().fetch(ask(PRIVATE, HEADERS), spy.env, spy.ctx));

    expect(status).toBe(503);
    expect(logged).toEqual({ error: 'index_empty' });
  });

  it('returns 503 when the embedding has the wrong shape', async () => {
    const spy = harness({ ai: async () => ({ shape: [1, 3], data: [[0.1, 0.2, 0.3]] }) });
    const { status } = await fails(spy, () => handlerWith().fetch(ask(PRIVATE, HEADERS), spy.env, spy.ctx));

    expect(status).toBe(503);
  });

  it('returns 503 when the model answers with nothing', async () => {
    const spy = harness({ ai: async (model) => (model === EMBEDDING_MODEL ? embeddingOutput() : chatOutput('   ')) });
    const { status, logged } = await fails(spy, () => handlerWith().fetch(ask(PRIVATE, HEADERS), spy.env, spy.ctx));

    expect(status).toBe(503);
    expect(logged).toEqual({ error: 'empty_answer' });
  });

  it('logs a refused request, and records nothing for it', async () => {
    const spy = harness({ allow: false });
    const { status, logged } = await fails(spy, () => handlerWith().fetch(ask(PRIVATE, HEADERS), spy.env, spy.ctx));

    expect(status).toBe(429);
    expect(logged).toEqual({ error: 'rate_limited' });
  });

  it('logs a record Analytics Engine refused, after answering', async () => {
    const spy = harness({
      writeDataPoint: () => {
        throw new Error('refused');
      },
    });
    const res = await handlerWith().fetch(ask(QUESTION), spy.env, spy.ctx);
    await Promise.all(spy.waited);

    expect(res.status).toBe(200);
    expect(logs.lines.map((line) => JSON.parse(line))).toEqual([{ error: 'record_not_written' }]);
  });
});

/**
 * A question is embedded with EMBEDDING_MODEL and EMBEDDING_PROMPTS, and is only
 * comparable with entries embedded the same way. The corpus record says how the
 * index was built; an index built otherwise would answer from unrelated entries
 * with no error, so the POST path checks it first.
 */
describe('the index was built the way questions are embedded', () => {
  const MISMATCHES = [
    ['another embedding model', corpusRecordFor({ embeddingModel: '@cf/test/older-embedding' })],
    ['other embedding prompts', corpusRecordFor({ embeddingPrompts: 'none' })],
    ['no recorded prompts, as an index built before them has', corpusRecordFor({ embeddingPrompts: undefined })],
  ] as const;

  it.each(MISMATCHES)('refuses an index built with %s', async (_label, record) => {
    const spy = harness({ corpusRecord: record });
    const res = await handlerWith().fetch(ask(QUESTION), spy.env, spy.ctx);
    await Promise.all(spy.waited);

    expect(res.status).toBe(503);
    expect(spy.aiCalls, 'a question was embedded or answered against a mismatched index').toEqual([]);
    expect(spy.written).toEqual([]);
    expect(logs.lines.map((line) => JSON.parse(line))).toEqual([{ error: 'index_embedding_mismatch' }]);
  });

  it('refuses an index with no corpus record', async () => {
    const spy = harness({ corpusRecord: null });
    const res = await handlerWith().fetch(ask(QUESTION), spy.env, spy.ctx);

    expect(res.status).toBe(503);
    expect(spy.aiCalls).toEqual([]);
    expect(logs.lines.map((line) => JSON.parse(line))).toEqual([{ error: 'index_not_built' }]);
  });

  it('reads the corpus record once per instance once it matches', async () => {
    const spy = harness();
    const handler = handlerWith();
    await handler.fetch(ask(QUESTION), spy.env, spy.ctx);
    await handler.fetch(ask(QUESTION), spy.env, spy.ctx);

    expect(spy.fetchedIds.filter((ids) => ids.includes(CORPUS_RECORD_ID))).toHaveLength(1);
  });

  // A warm instance that has seen a match must still notice a later rebuild with
  // another model or prompts: it trusts the match for INDEX_RECHECK_MS, then
  // reads the record again.
  it('catches a mismatch that appears after a match once the interval has passed, and not before', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    const record = corpusRecordFor();
    const spy = harness({ corpusRecord: record });
    const handler = handlerWith();
    expect((await handler.fetch(ask(QUESTION), spy.env, spy.ctx)).status).toBe(200);

    record.metadata = corpusRecordFor({ embeddingModel: '@cf/test/newer-embedding' }).metadata;
    vi.setSystemTime(1_000_000 + INDEX_RECHECK_MS - 1);
    expect((await handler.fetch(ask(QUESTION), spy.env, spy.ctx)).status, 'the record was read again inside the interval').toBe(200);

    vi.setSystemTime(1_000_000 + INDEX_RECHECK_MS);
    expect((await handler.fetch(ask(QUESTION), spy.env, spy.ctx)).status, 'the record was not read again once the interval passed').toBe(503);
    expect(logs.lines.map((line) => JSON.parse(line))).toEqual([{ error: 'index_embedding_mismatch' }]);
  });

  it('reads it again after a mismatch, so a rebuild is noticed without a redeploy', async () => {
    const record = corpusRecordFor({ embeddingModel: '@cf/test/older-embedding' });
    const spy = harness({ corpusRecord: record });
    const handler = handlerWith();
    expect((await handler.fetch(ask(QUESTION), spy.env, spy.ctx)).status).toBe(503);

    record.metadata = corpusRecordFor().metadata;
    expect((await handler.fetch(ask(QUESTION), spy.env, spy.ctx)).status).toBe(200);
  });
});

/**
 * Retrieval has two halves, the entries the question names (fetched by id) and
 * the nearest by meaning (embedding, then query). One failing must not throw
 * away what the other found; only both failing is a failure.
 */
describe('one half of retrieval failing', () => {
  const named = { match: () => [ENTRIES[2].id] };
  const fetchFails = async (ids: string[]) => {
    if (ids.includes(CORPUS_RECORD_ID)) return [corpusRecordFor()];
    throw new Error('vectorize unavailable');
  };
  const embeddingFails = (error: Error) => async (model: string) => {
    if (model === EMBEDDING_MODEL) throw error;
    return chatOutput(ANSWER);
  };
  const logged = () => logs.lines.map((line) => JSON.parse(line) as { error: string; code?: number });

  it('answers from the nearest entries when fetching the named ones fails', async () => {
    const spy = harness({ getByIds: fetchFails });
    const res = await handlerWith(named).fetch(ask(QUESTION), spy.env, spy.ctx);
    await Promise.all(spy.waited);

    expect(res.status).toBe(200);
    const user = (spy.aiCalls.at(-1)?.inputs.messages as { content: string }[])[1].content;
    for (const entry of ENTRIES) expect(user).toContain(entry.link);
    expect(spy.written).toHaveLength(1);
    expect(logged()).toEqual([{ error: 'named_retrieval_failed' }]);
  });

  it('answers from the named entries when the embedding fails', async () => {
    const spy = harness({ ai: embeddingFails(new Error('socket hang up')) });
    const res = await handlerWith(named).fetch(ask(QUESTION), spy.env, spy.ctx);
    await Promise.all(spy.waited);

    expect(res.status).toBe(200);
    const user = (spy.aiCalls.at(-1)?.inputs.messages as { content: string }[])[1].content;
    expect(user).toContain(ENTRIES[2].link);
    expect(user).not.toContain(ENTRIES[0].link);
    expect(logged()).toEqual([{ error: 'nearest_retrieval_failed' }]);
  });

  it('names the Workers AI code when the embedding half fails on a limit but the named half answers', async () => {
    const spy = harness({ ai: embeddingFails(new Error('3036: daily free allocation used up')) });
    const res = await handlerWith(named).fetch(ask(QUESTION), spy.env, spy.ctx);

    expect(res.status).toBe(200);
    expect(logged()).toEqual([{ error: 'nearest_retrieval_failed', code: 3036 }]);
  });

  // The search by meaning worked and found nothing: an empty index, which is
  // what the log should say, after the half that failed.
  it('logs the failed half and then index_empty when the other half worked and found nothing', async () => {
    const spy = harness({ getByIds: fetchFails, query: async () => ({ matches: [] }) });
    const res = await handlerWith(named).fetch(ask(QUESTION), spy.env, spy.ctx);

    expect(res.status).toBe(503);
    expect(logged()).toEqual([{ error: 'named_retrieval_failed' }, { error: 'index_empty' }]);
  });

  it('is a 503 when both halves fail', async () => {
    const spy = harness({ getByIds: fetchFails, ai: embeddingFails(new Error('socket hang up')) });
    const res = await handlerWith(named).fetch(ask(QUESTION), spy.env, spy.ctx);
    await Promise.all(spy.waited);

    expect(res.status).toBe(503);
    expect(spy.written).toEqual([]);
    expect(logged()).toEqual([{ error: 'upstream_failure' }]);
  });

  it('is still a 429 when both halves fail and the embedding failed on a Workers AI limit', async () => {
    const spy = harness({ getByIds: fetchFails, ai: embeddingFails(new Error('3040: Capacity temporarily exceeded')) });
    const res = await handlerWith(named).fetch(ask(QUESTION), spy.env, spy.ctx);

    expect(res.status).toBe(429);
    expect(logged()).toEqual([{ error: 'workers_ai_limit', code: 3040 }]);
  });
});

describe('GET: the corpus the index was built from', () => {
  const get = (headers: Record<string, string> = {}) => new Request('https://ask.example/', { headers });

  it('returns the corpus record\'s date', async () => {
    const spy = harness();
    const res = await handlerWith().fetch(get(), spy.env, spy.ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ corpusDate: '2026-11-14', embeddingModel: EMBEDDING_MODEL, documents: 907 });
    expect(spy.aiCalls).toEqual([]);
  });

  it('is rate limited like a question', async () => {
    const spy = harness({ allow: false });
    const res = await handlerWith().fetch(get(), spy.env, spy.ctx);

    expect(res.status).toBe(429);
    expect(spy.limitKeys).toHaveLength(1);
    expect(spy.fetchedIds).toEqual([]);
  });

  it('refuses a foreign Origin and admits the site\'s', async () => {
    const foreign = harness();
    expect((await handlerWith().fetch(get({ Origin: 'https://evil.example' }), foreign.env, foreign.ctx)).status).toBe(403);
    expect(foreign.fetchedIds).toEqual([]);

    const site = harness();
    expect((await handlerWith().fetch(get({ Origin: ORIGIN }), site.env, site.ctx)).status).toBe(200);
  });

  it('gives up on an index read that never returns, at the deadline', async () => {
    vi.useFakeTimers();
    const spy = harness({ getByIds: () => new Promise(() => {}) });
    let settled = false;
    const pending = handlerWith()
      .fetch(get(), spy.env, spy.ctx)
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);

    expect(settled, 'the GET was still waiting on the index at the deadline').toBe(true);
    expect((await pending).status).toBe(503);
    expect(logs.lines.map((line) => JSON.parse(line))).toEqual([{ error: 'deadline' }]);
  });

  it('returns 503 when the index has no corpus record, saying so', async () => {
    const spy = harness({ corpusRecord: null });
    const res = await handlerWith().fetch(get(), spy.env, spy.ctx);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'index_not_built' });
    expect(logs.lines.map((line) => JSON.parse(line))).toEqual([{ error: 'index_not_built' }]);
  });

  // The live check compares the GET's corpus date with api/index.json, so a GET
  // that answered 200 for an index every question refuses would report a broken
  // service as healthy. It applies the question path's own test.
  it.each([
    ['another embedding model', corpusRecordFor({ embeddingModel: '@cf/test/older-embedding' })],
    ['other embedding prompts', corpusRecordFor({ embeddingPrompts: 'none' })],
  ])('returns 503 for an index built with %s, as a question gets, saying so', async (_label, record) => {
    const spy = harness({ corpusRecord: record });
    const res = await handlerWith().fetch(get(), spy.env, spy.ctx);

    expect(res.status, 'the GET reported an index every question refuses as healthy').toBe(503);
    expect(await res.json()).toEqual({ error: 'index_embedding_mismatch' });
    expect(logs.lines.map((line) => JSON.parse(line))).toEqual([{ error: 'index_embedding_mismatch' }]);
  });

  it('returns 503 when the index read fails, saying so', async () => {
    const spy = harness({
      getByIds: async () => {
        throw new Error('vectorize unavailable');
      },
    });
    const res = await handlerWith().fetch(get(), spy.env, spy.ctx);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'index_unavailable' });
  });
});

/**
 * The rate limit key is a copy of the events Worker's. Both Workers' handlers
 * hand their key to the limiter, so this runs each over one set of addresses and
 * fails when the copies key one differently. The set is the events Worker's own
 * pinned address shapes.
 */
describe('rate limit key parity with the events Worker', () => {
  const ADDRESSES = [
    '203.0.113.7',
    '2001:db8:1234:5678::1',
    '2001:db8:1234:5678:aaaa:bbbb:cccc:dddd',
    '2001:0DB8:1234:5678::1',
    '2001:db8::1',
    '::1',
    '::',
    '2001:db8::',
    'fe80::1%eth0',
    '::ffff:203.0.113.7',
    '2001:db8',
    'a::b::c',
    '',
  ];

  async function eventsKey(address: string): Promise<string> {
    const keys: string[] = [];
    const env = {
      EVENTS: { writeDataPoint: () => {} },
      ALLOWED_ORIGIN: ORIGIN,
      RATE_LIMITER: { limit: async ({ key }: { key: string }) => (keys.push(key), { success: false }) },
    };
    const headers: Record<string, string> = address ? { 'CF-Connecting-IP': address } : {};
    await eventsWorker.fetch(new Request('https://events.example/', { method: 'POST', headers, body: '{}' }), env);
    return keys[0];
  }

  it.each(ADDRESSES.map((address) => [JSON.stringify(address), address]))('keys %s as the events Worker does', async (_label, address) => {
    const spy = harness({ allow: false });
    const headers: Record<string, string> = address ? { 'CF-Connecting-IP': address } : {};
    await handlerWith().fetch(ask(QUESTION, headers), spy.env, spy.ctx);

    expect(spy.limitKeys).toEqual([await eventsKey(address)]);
  });

  it('separates two /64s and joins one', async () => {
    const keys: string[] = [];
    for (const address of ['2001:db8:1:2::1', '2001:db8:1:2::ffff', '2001:db8:1:3::1']) {
      const spy = harness();
      await handlerWith().fetch(ask(QUESTION, { 'CF-Connecting-IP': address }), spy.env, spy.ctx);
      keys.push(...spy.limitKeys);
    }

    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
  });
});
