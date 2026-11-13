/**
 * fetch-zenodo-types.test.ts: what the opt-in fetch writes into the committed
 * `zenodo-types.json`, which the parse refuses to run without
 * (tucca-cellag/caail-planning#760). The network is stubbed.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { committedZenodoTypes, fetchZenodoTypes, type ZenodoFetch } from './fetch-zenodo-types.js';

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

  it('reports a Zenodo DOI that is no record DOI, which it cannot ask for, naming the way out', async () => {
    const r = await fetchZenodoTypes(['10.5281/zenodo.12.v2'], {}, { fetchImpl: stub({}), ...quiet });
    expect(r.types).toEqual({});
    expect(r.failed).toEqual([
      '10.5281/zenodo.12.v2: not a zenodo.<record> DOI, so there is no record id to ask for; record its type by hand in zenodo-types.json',
    ]);
  });

  it('keeps a type recorded by hand for a DOI it cannot ask for, without reporting it as failed', async () => {
    const known = { '10.5281/zenodo.12.v2': { type: 'publication', subtype: 'report' } };
    const r = await fetchZenodoTypes(['10.5281/zenodo.12.v2'], known, { fetchImpl: stub({}), ...quiet });
    expect(r.types).toEqual(known);
    expect(r.failed).toEqual([]);
  });

  it('on a 404 points at recording the type by hand, and keeps a type already recorded without reporting it', async () => {
    const missing = await fetchZenodoTypes([A], {}, { fetchImpl: stub({ 1: 404 }), ...quiet });
    expect(missing.types).toEqual({});
    expect(missing.failed).toEqual([
      `${A}: HTTP 404, so Zenodo has no record 1 to read; if the DOI is right, record its type by hand in zenodo-types.json`,
    ]);
    const kept = await fetchZenodoTypes([A], { [A]: { type: 'dataset' } }, { fetchImpl: stub({ 1: 404 }), ...quiet });
    expect(kept.types).toEqual({ [A]: { type: 'dataset' } });
    expect(kept.failed).toEqual([]);
  });
});

describe('committedZenodoTypes (tucca-cellag/caail-planning#760)', () => {
  const file = (types: unknown): string => {
    const path = join(mkdtempSync(join(tmpdir(), 'caail-zenodo-committed-')), 'zenodo-types.json');
    writeFileSync(path, JSON.stringify({ types }));
    return path;
  };

  it('keys each committed entry by its bare DOI, keeping its subtype, so a hand-written key is not dropped on the next run', async () => {
    const committed = committedZenodoTypes(file({ 'https://doi.org/10.5281/Zenodo.12.v2': { type: 'publication', subtype: 'report' } }));
    expect(committed).toEqual({ '10.5281/zenodo.12.v2': { type: 'publication', subtype: 'report' } });
    const r = await fetchZenodoTypes(['10.5281/zenodo.12.v2'], committed, { fetchImpl: stub({}), ...quiet });
    expect(r.types).toEqual(committed);
  });

  it('refuses a committed key that is no DOI, or one DOI written twice', () => {
    expect(() => committedZenodoTypes(file({ 'not a doi': { type: 'dataset' } }))).toThrow(/"not a doi" is not a DOI/);
    expect(() => committedZenodoTypes(file({ '10.5281/zenodo.5': { type: 'dataset' }, 'https://doi.org/10.5281/ZENODO.5': { type: 'publication' } })))
      .toThrow(/10\.5281\/zenodo\.5 is recorded twice/);
  });
});
