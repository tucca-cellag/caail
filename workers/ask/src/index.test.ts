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
import { ANSWER_DEADLINE_MS, EMBEDDING_MODEL, MAX_BODY_BYTES } from './settings.ts';
import { WORD_LIMIT } from './words.ts';
import { MAX_TOKENS, SYSTEM_PROMPT, TEMPERATURE } from './model.ts';
import { vectorId } from './ids.ts';
import {
  ANSWER,
  ENTRIES,
  MODEL,
  ORIGIN,
  ask,
  captureLogs,
  chatOutput,
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
    expect(spy.aiCalls[0].inputs).toEqual({ text: [QUESTION.query] });
    const { inputs } = spy.aiCalls[1];
    expect(inputs.max_tokens).toBe(MAX_TOKENS);
    expect(inputs.temperature).toBe(TEMPERATURE);
    const [system, user] = inputs.messages as { role: string; content: string }[];
    expect(system).toEqual({ role: 'system', content: SYSTEM_PROMPT });
    expect(user.role).toBe('user');
    for (const entry of ENTRIES) expect(user.content).toContain(`Link: ${entry.link}`);
    expect(user.content).toContain(`Question: ${QUESTION.query}`);
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

    expect(spy.fetchedIds).toEqual([[await vectorId(ENTRIES[2].id)]]);
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
    await vi.advanceTimersByTimeAsync(ANSWER_DEADLINE_MS);
    expect(settled, 'the handler was still waiting on the model at the deadline').toBe(true);
    return pending;
  }

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
    await vi.advanceTimersByTimeAsync(ANSWER_DEADLINE_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(signal?.aborted, 'the model call was not aborted at the deadline').toBe(true);
    // Settle the request so it does not outlive the test.
    await vi.advanceTimersByTimeAsync(ANSWER_DEADLINE_MS);
    await Promise.race([pending, Promise.resolve()]);
  });

  it('does not give up on a model that answers just inside the deadline', async () => {
    vi.useFakeTimers();
    const spy = harness({
      ai: (model, inputs, opts) =>
        model === EMBEDDING_MODEL
          ? defaultAi(model, inputs, opts)
          : new Promise((resolve) => setTimeout(() => resolve(chatOutput(ANSWER)), ANSWER_DEADLINE_MS - 100)),
    });
    const pending = handlerWith().fetch(ask(QUESTION), spy.env, spy.ctx);
    await vi.advanceTimersByTimeAsync(ANSWER_DEADLINE_MS - 100);

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

  it('returns 503 when the index has no corpus record', async () => {
    const spy = harness({ corpusRecord: null });
    const res = await handlerWith().fetch(get(), spy.env, spy.ctx);

    expect(res.status).toBe(503);
    expect(logs.lines.map((line) => JSON.parse(line))).toEqual([{ error: 'index_not_built' }]);
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
