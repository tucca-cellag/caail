/**
 * The question record keeps five things and nothing about the person asking.
 * These tests hold it to both halves: that it carries no address or header, and
 * that every field fits, so Analytics Engine never refuses one.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ANSWER_BYTES,
  BLOB_LIMIT_BYTES,
  CITED_BYTES,
  MODEL_BYTES,
  QUESTION_BYTES,
  byteLength,
  clipBytes,
  questionRecord,
} from './record.ts';
import { ANSWER, ENTRIES, MODEL, ORIGIN, ask, captureLogs, handlerWith, harness } from './test-env.ts';

const blobBytes = (blobs: string[]) => blobs.reduce((sum, blob) => sum + byteLength(blob), 0);

describe('what the record holds', () => {
  let logs: ReturnType<typeof captureLogs>;
  beforeEach(() => {
    logs = captureLogs();
  });
  afterEach(() => logs.restore());

  // Every value a request could identify someone by, each distinctive enough to
  // be found anywhere in the record.
  const IDENTIFYING: Record<string, string> = {
    'CF-Connecting-IP': '203.0.113.77',
    'X-Forwarded-For': '198.51.100.23',
    'X-Real-IP': '192.0.2.41',
    'True-Client-IP': '2001:db8:feed:beef::9',
    'CF-IPCountry': 'ZZ-COUNTRY-MARK',
    'CF-Ray': 'ray-mark-8f2c1a',
    'User-Agent': 'UserAgentMark/9.9',
    Referer: `${ORIGIN}/referer-mark/`,
    Cookie: 'session=cookie-mark',
    'Accept-Language': 'xx-LANGMARK',
  };

  it('carries no address and no header from the request', async () => {
    const spy = harness();
    const res = await handlerWith().fetch(ask({ query: 'which tools predict protein structure?' }, IDENTIFYING), spy.env, spy.ctx);
    await Promise.all(spy.waited);

    expect(res.status).toBe(200);
    expect(spy.written).toHaveLength(1);
    const serialized = JSON.stringify(spy.written[0]);
    for (const value of Object.values(IDENTIFYING)) expect(serialized).not.toContain(value);
    // Nor in what was logged.
    for (const value of Object.values(IDENTIFYING)) expect(logs.lines.join('\n')).not.toContain(value);
  });

  it('holds the question, the answer, the cited ids, the model and the time, and nothing else', async () => {
    const spy = harness();
    const before = Date.now();
    await handlerWith().fetch(ask({ query: 'which tools predict protein structure?' }), spy.env, spy.ctx);
    await Promise.all(spy.waited);

    const [point] = spy.written;
    expect(Object.keys(point).sort()).toEqual(['blobs', 'doubles', 'indexes']);
    expect(point.indexes).toEqual(['ask']);
    expect(point.blobs).toEqual(['which tools predict protein structure?', ANSWER, ENTRIES[0].id, MODEL]);
    expect(point.doubles).toHaveLength(1);
    expect(point.doubles[0]).toBeGreaterThanOrEqual(before);
    expect(point.doubles[0]).toBeLessThanOrEqual(Date.now());
  });

  it('is written through ctx.waitUntil, not before the response', async () => {
    const spy = harness();
    await handlerWith().fetch(ask({ query: 'which tools predict protein structure?' }), spy.env, spy.ctx);

    expect(spy.waited).toHaveLength(1);
    await Promise.all(spy.waited);
    expect(spy.written).toHaveLength(1);
  });
});

describe('every field fits', () => {
  it('keeps the budgets inside the limit', () => {
    expect(QUESTION_BYTES + ANSWER_BYTES + CITED_BYTES + MODEL_BYTES).toBeLessThanOrEqual(BLOB_LIMIT_BYTES);
    expect(ANSWER_BYTES).toBeGreaterThan(0);
  });

  it('leaves an ordinary record untouched', () => {
    const input = { question: 'q', answer: 'a', citedIds: ['sw:a', 'paper:1'], modelId: MODEL, time: 1 };
    expect(questionRecord(input).blobs).toEqual(['q', 'a', 'sw:a paper:1', MODEL]);
  });

  // The worst case: every field far over its budget, in characters of every
  // UTF-8 width, so a cut that splits a character or overruns would show.
  it.each([
    ['ASCII', 'x'],
    ['two-byte', 'é'],
    ['three-byte', '多'],
    ['four-byte', '🧫'],
  ])('cuts %s text to fit without splitting a character', (_label, char) => {
    const huge = char.repeat(20_000);
    const point = questionRecord({
      question: huge,
      answer: huge,
      citedIds: Array.from({ length: 500 }, (_, i) => `ds:${char.repeat(10)}-${i}`),
      modelId: huge,
      time: 1,
    });
    const [question, answer, cited, model] = point.blobs;

    expect(blobBytes(point.blobs)).toBeLessThanOrEqual(BLOB_LIMIT_BYTES);
    expect(byteLength(question)).toBeLessThanOrEqual(QUESTION_BYTES);
    expect(byteLength(answer)).toBeLessThanOrEqual(ANSWER_BYTES);
    expect(byteLength(cited)).toBeLessThanOrEqual(CITED_BYTES);
    expect(byteLength(model)).toBeLessThanOrEqual(MODEL_BYTES);
    for (const blob of point.blobs) {
      expect(blob).not.toContain('�');
      expect([...blob].every((c) => c === char || /[ds:\-\d ]/.test(c))).toBe(true);
    }
    // Cut to the budget, not short of it by more than one character.
    expect(QUESTION_BYTES - byteLength(question)).toBeLessThan(byteLength(char));
  });

  it('keeps whole cited ids only', () => {
    const ids = Array.from({ length: 300 }, (_, i) => `paper:${i}`);
    const cited = questionRecord({ question: '', answer: '', citedIds: ids, modelId: '', time: 0 }).blobs[2];

    expect(byteLength(cited)).toBeLessThanOrEqual(CITED_BYTES);
    expect(cited.split(' ').every((id) => ids.includes(id))).toBe(true);
  });

  it('clips at a character boundary', () => {
    expect(clipBytes('aé', 2)).toBe('a');
    expect(clipBytes('aé', 3)).toBe('aé');
  });
});
