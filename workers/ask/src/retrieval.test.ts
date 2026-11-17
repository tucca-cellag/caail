/**
 * Retrieval: the named entries first, the nearest by meaning after, eight in all,
 * and only entries an answer may cite.
 */
import { describe, expect, it } from 'vitest';
import { retrieve, type IndexBinding, type RetrievedEntry, type StoredVector } from './retrieval.ts';
import { CORPUS_RECORD_ID, ENTRY_NAMESPACE, MAX_NAMED, MAX_NAMED_FETCHED, TOP_K } from './settings.ts';
import { vectorId } from './ids.ts';
import { ORIGIN, defaultAi, lookupNaming } from './test-env.ts';

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
const entriesOf = async (...args: Parameters<typeof retrieve>) => (await retrieve(...args)).entries;

describe('retrieval', () => {
  it('takes the nearest TOP_K from the entries namespace, with their metadata', async () => {
    const nearest = await Promise.all(Array.from({ length: TOP_K + 4 }, (_, n) => stored(entry(n))));
    const { binding, queries } = index(nearest);
    const found = await entriesOf('q', { AI: { run: defaultAi }, INDEX: binding, ALLOWED_ORIGIN: ORIGIN }, lookupNaming([]), signal);

    expect(found.map((e) => e.id)).toEqual(Array.from({ length: TOP_K }, (_, n) => `paper:${n}`));
    expect(queries).toEqual([{ topK: TOP_K, namespace: ENTRY_NAMESPACE, returnMetadata: 'all' }]);
  });

  it('puts named entries first and does not repeat one that is also near', async () => {
    const nearest = await Promise.all([1, 2, 3].map((n) => stored(entry(n))));
    const named = await Promise.all([9, 2].map((n) => stored(entry(n))));
    const { binding } = index(nearest, named);
    const found = await entriesOf(
      'q',
      { AI: { run: defaultAi }, INDEX: binding, ALLOWED_ORIGIN: ORIGIN },
      lookupNaming(['paper:9', 'paper:2']),
      signal,
    );

    expect(found.map((e) => e.id)).toEqual(['paper:9', 'paper:2', 'paper:1', 'paper:3']);
  });

  // A question naming many entries must not crowd out every match by meaning.
  it('leaves at least half the places to meaning, however many entries a question names', async () => {
    const named = await Promise.all(Array.from({ length: TOP_K }, (_, n) => stored(entry(100 + n))));
    const nearest = await Promise.all(Array.from({ length: TOP_K }, (_, n) => stored(entry(n))));
    const { binding } = index(nearest, named);
    const namedIds = named.map((v) => (v.metadata as unknown as RetrievedEntry).id);
    const found = await entriesOf('q', { AI: { run: defaultAi }, INDEX: binding, ALLOWED_ORIGIN: ORIGIN }, lookupNaming(namedIds), signal);

    const byName = found.filter((e) => namedIds.includes(e.id));
    expect(found).toHaveLength(TOP_K);
    expect(found.length - byName.length, 'entries found by meaning').toBeGreaterThanOrEqual(TOP_K / 2);
    expect(byName.length, 'entries found by name').toBeGreaterThan(0);
    // The named entries still come first.
    expect(found.slice(0, byName.length)).toEqual(byName);
  });

  // Which origin may call the Worker (CORS) is not which links are the site's: a
  // development Worker that allows a local origin still answers from site entries.
  it('keeps site entries whatever origin the Worker allows to call it', async () => {
    const { binding } = index([await stored(entry(1))], [await stored(entry(2))]);
    const found = await entriesOf(
      'q',
      { AI: { run: defaultAi }, INDEX: binding, ALLOWED_ORIGIN: 'http://localhost:4321' },
      lookupNaming(['paper:2']),
      signal,
    );

    expect(found.map((e) => e.id)).toEqual(['paper:2', 'paper:1']);
  });

  /**
   * The index can hold entries the corpus no longer does, when a rebuild's
   * deletes failed or have not landed. The Worker bundles the corpus it was
   * deployed with, so an entry outside it is dropped from either half, whatever
   * order the build wrote in.
   */
  it('drops an entry the deployed corpus does not hold, from either half, and keeps one it does', async () => {
    const removed = entry(99);
    const current = entry(1);
    const { binding } = index([await stored(removed), await stored(current)], [await stored(removed)]);
    const lookup = lookupNaming([removed.id], (id) => id !== removed.id);
    const found = await entriesOf('q', { AI: { run: defaultAi }, INDEX: binding, ALLOWED_ORIGIN: ORIGIN }, lookup, signal);

    expect(found.map((e) => e.id), 'an entry the corpus no longer holds was offered to the model').toEqual([current.id]);
  });

  // A search by meaning that works and finds nothing does not empty the
  // result: the entries the question names are still the answer's entries.
  it('answers from the named entries when the search by meaning finds nothing', async () => {
    const { binding } = index([], [await stored(entry(2))]);
    const result = await retrieve('q', { AI: { run: defaultAi }, INDEX: binding }, lookupNaming(['paper:2']), signal);

    expect(result.entries.map((e) => e.id), 'the named entries were dropped').toEqual(['paper:2']);
    expect(result.failed).toBeNull();
  });

  /**
   * Between a deploy that adds entries and the rebuild that indexes them, the
   * strongest names a question holds can be ones the index lacks. They give
   * their places to the next named entries it holds, and the cap still holds.
   */
  it('keeps MAX_NAMED named entries the index holds when the top-ranked names are missing from it', async () => {
    const missing = Array.from({ length: MAX_NAMED - 1 }, (_, n) => `paper:${400 + n}`);
    const held = Array.from({ length: MAX_NAMED + 1 }, (_, n) => entry(100 + n));
    const nearest = await Promise.all(Array.from({ length: TOP_K }, (_, n) => stored(entry(n))));
    const { binding } = index(nearest, await Promise.all(held.map(stored)));
    const namedIds = [...missing, ...held.map((e) => e.id)];
    expect(namedIds).toHaveLength(MAX_NAMED_FETCHED);
    const found = await entriesOf('q', { AI: { run: defaultAi }, INDEX: binding }, lookupNaming(namedIds), signal);

    const byName = found.filter((e) => namedIds.includes(e.id)).map((e) => e.id);
    expect(byName, 'the named entries the index holds').toEqual(held.slice(0, MAX_NAMED).map((e) => e.id));
    expect(found.slice(0, MAX_NAMED).map((e) => e.id), 'named entries come first').toEqual(byName);
    expect(found).toHaveLength(TOP_K);
  });

  it('skips a named entry the index does not hold', async () => {
    const { binding } = index([await stored(entry(1))]);
    const found = await entriesOf('q', { AI: { run: defaultAi }, INDEX: binding, ALLOWED_ORIGIN: ORIGIN }, lookupNaming(['paper:404']), signal);

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
    const found = await entriesOf('q', { AI: { run: defaultAi }, INDEX: binding, ALLOWED_ORIGIN: ORIGIN }, lookupNaming([]), signal);

    expect(found.map((e) => e.id)).toEqual(['paper:1']);
  });
});
