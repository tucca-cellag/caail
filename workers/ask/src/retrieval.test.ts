/**
 * Retrieval: the named entries first, the nearest by meaning after, eight in all,
 * and only entries an answer may cite.
 */
import { describe, expect, it } from 'vitest';
import { retrieve, type IndexBinding, type RetrievedEntry, type StoredVector } from './retrieval.ts';
import { CORPUS_RECORD_ID, ENTRY_NAMESPACE, TOP_K } from './settings.ts';
import { vectorId } from './ids.ts';
import { ORIGIN, defaultAi } from './test-env.ts';

const entry = (n: number): RetrievedEntry => ({
  id: `paper:${n}`,
  kind: 'paper',
  name: `Paper ${n}`,
  link: `${ORIGIN}/papers/explorer/?item=paper:${n}`,
  text: `Paper ${n}`,
});

function index(nearest: StoredVector[], stored: StoredVector[] = []) {
  const queries: unknown[] = [];
  const binding: IndexBinding = {
    query: async (_vector, options) => (queries.push(options), { matches: nearest.map((v, n) => ({ ...v, score: 1 - n / 100 })) }),
    getByIds: async (ids) => stored.filter((v) => ids.includes(v.id)),
  };
  return { binding, queries };
}

const stored = async (e: RetrievedEntry): Promise<StoredVector> => ({ id: await vectorId(e.id), metadata: { ...e } });
const signal = new AbortController().signal;

describe('retrieval', () => {
  it('takes the nearest TOP_K from the entries namespace, with their metadata', async () => {
    const nearest = await Promise.all(Array.from({ length: TOP_K + 4 }, (_, n) => stored(entry(n))));
    const { binding, queries } = index(nearest);
    const found = await retrieve('q', { AI: { run: defaultAi }, INDEX: binding, ALLOWED_ORIGIN: ORIGIN }, { match: () => [] }, signal);

    expect(found.map((e) => e.id)).toEqual(Array.from({ length: TOP_K }, (_, n) => `paper:${n}`));
    expect(queries).toEqual([{ topK: TOP_K, namespace: ENTRY_NAMESPACE, returnMetadata: 'all' }]);
  });

  it('puts named entries first and does not repeat one that is also near', async () => {
    const nearest = await Promise.all([1, 2, 3].map((n) => stored(entry(n))));
    const named = await Promise.all([9, 2].map((n) => stored(entry(n))));
    const { binding } = index(nearest, named);
    const found = await retrieve(
      'q',
      { AI: { run: defaultAi }, INDEX: binding, ALLOWED_ORIGIN: ORIGIN },
      { match: () => ['paper:9', 'paper:2'] },
      signal,
    );

    expect(found.map((e) => e.id)).toEqual(['paper:9', 'paper:2', 'paper:1', 'paper:3']);
  });

  it('skips a named entry the index does not hold', async () => {
    const { binding } = index([await stored(entry(1))]);
    const found = await retrieve('q', { AI: { run: defaultAi }, INDEX: binding, ALLOWED_ORIGIN: ORIGIN }, { match: () => ['paper:404'] }, signal);

    expect(found.map((e) => e.id)).toEqual(['paper:1']);
  });

  it.each([
    ['the corpus record', { id: CORPUS_RECORD_ID, metadata: { corpusDate: '2026-11-14' } }],
    ['an entry whose link is off the site', { id: 'x', metadata: { ...entry(7), link: 'https://elsewhere.example/7' } }],
    ['an entry whose link only starts like the site', { id: 'x', metadata: { ...entry(7), link: `${ORIGIN}.evil.example/7` } }],
    ['an entry missing its text', { id: 'x', metadata: { ...entry(7), text: '' } }],
    ['a vector with no metadata', { id: 'x' }],
  ])('never offers %s', async (_label, vector) => {
    const { binding } = index([vector as StoredVector, await stored(entry(1))]);
    const found = await retrieve('q', { AI: { run: defaultAi }, INDEX: binding, ALLOWED_ORIGIN: ORIGIN }, { match: () => [] }, signal);

    expect(found.map((e) => e.id)).toEqual(['paper:1']);
  });
});
