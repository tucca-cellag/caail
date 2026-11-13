/**
 * fetch-zenodo-types.test.ts: what the opt-in fetch writes into the committed
 * `zenodo-types.json`, which the parse refuses to run without
 * (tucca-cellag/caail-planning#760). The network is stubbed.
 */
import { describe, it, expect } from 'vitest';

import { fetchZenodoTypes, type ZenodoFetch } from './fetch-zenodo-types.js';

/** A stub that answers each record id from `answers`: a resource type, an HTTP status, or a thrown error. */
function stub(answers: Record<string, { type: string; subtype?: string } | number | Error | 'not json'>): ZenodoFetch {
  return async (url) => {
    const id = url.split('/').at(-1)!;
    const a = answers[id];
    if (a instanceof Error) throw a;
    if (typeof a === 'number') return { ok: false, status: a, statusText: 'nope', json: async () => ({}) };
    if (a === 'not json') return { ok: true, status: 200, statusText: 'OK', json: async () => { throw new SyntaxError('Unexpected token <'); } };
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ metadata: { resource_type: a } }) };
  };
}
const quiet = { sleep: async () => {}, log: () => {} };
const A = '10.5281/zenodo.1';
const B = '10.5281/zenodo.2';
const C = '10.5281/zenodo.3';

describe('fetchZenodoTypes (tucca-cellag/caail-planning#760)', () => {
  it('records each DOI\'s resource type, with its subtype where the record gives one', async () => {
    const r = await fetchZenodoTypes([A, B], {}, { fetchImpl: stub({ 1: { type: 'dataset' }, 2: { type: 'publication', subtype: 'report' } }), ...quiet });
    expect(r.types).toEqual({ [A]: { type: 'dataset' }, [B]: { type: 'publication', subtype: 'report' } });
    expect(r.failed).toEqual([]);
  });

  it('keeps a DOI\'s earlier entry and goes on when its request fails or its body is not JSON', async () => {
    const known = { [A]: { type: 'dataset' }, [B]: { type: 'software' } };
    const r = await fetchZenodoTypes([A, B, C], known, {
      fetchImpl: stub({ 1: new Error('ECONNRESET'), 2: 'not json', 3: { type: 'poster' } }), ...quiet,
    });
    expect(r.types).toEqual({ [A]: { type: 'dataset' }, [B]: { type: 'software' }, [C]: { type: 'poster' } });
    expect(r.failed).toEqual([`${A}: ECONNRESET`, `${B}: Unexpected token <`]);
  });

  it('stops on a 429 or 503, keeps what it knows for the rest, and names every DOI it did not fetch', async () => {
    for (const status of [429, 503]) {
      const r = await fetchZenodoTypes([A, B, C], { [C]: { type: 'dataset' } }, { fetchImpl: stub({ 1: { type: 'dataset' }, 2: status, 3: { type: 'poster' } }), ...quiet });
      expect(r.types, String(status)).toEqual({ [A]: { type: 'dataset' }, [C]: { type: 'dataset' } });
      expect(r.failed, String(status)).toEqual([`${B}: HTTP ${status}, so the run stopped here`, `${C}: not tried after the stop`]);
    }
  });

  it('reports a Zenodo DOI that is no record DOI, which it cannot ask for', async () => {
    const r = await fetchZenodoTypes(['10.5281/zenodo.12.v2'], {}, { fetchImpl: stub({}), ...quiet });
    expect(r.types).toEqual({});
    expect(r.failed).toEqual(['10.5281/zenodo.12.v2: not a zenodo.<record> DOI, so there is no record id to ask for']);
  });
});
