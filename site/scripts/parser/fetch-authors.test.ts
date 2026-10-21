/**
 * fetch-authors.test.ts: the registry lookups behind author-cache.json, against a
 * stubbed network, plus the committed cache itself.
 */

import { readFileSync } from 'node:fs';

import { describe, it, expect } from 'vitest';

import { AUTHOR_CACHE_PATH, AuthorCacheSchema } from './authors.js';
import { bareOrcid, fetchAuthorCache, serializeAuthorCache, type FetchLike } from './fetch-authors.js';

const ok = (body: unknown) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });

/** A stub that answers Crossref and DataCite from fixed bodies and records every URL asked. */
function stubRegistries(crossref: unknown, datacite: unknown) {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    return ok(url.startsWith('https://api.crossref.org/') ? crossref : datacite);
  };
  return { urls, fetchImpl };
}

describe('bareOrcid', () => {
  it('reduces every URL form to the bare iD, upper-casing the check digit', () => {
    expect(bareOrcid('https://orcid.org/0009-0002-8795-5215')).toBe('0009-0002-8795-5215');
    expect(bareOrcid('http://orcid.org/0000-0002-1694-233x')).toBe('0000-0002-1694-233X');
    expect(bareOrcid(undefined)).toBeNull();
    expect(bareOrcid('not an orcid')).toBeNull();
  });
});

describe('fetchAuthorCache', () => {
  const crossref = {
    message: {
      items: [
        {
          DOI: '10.1126/SCIENCE.ADZ4351',
          author: [
            { given: 'Sherry', family: 'Liu', ORCID: 'https://orcid.org/0009-0002-8795-5215' },
            { name: 'FarmGTEx Consortium' }, // an organization: dropped
          ],
        },
        { DOI: '10.9/not-requested', author: [{ given: 'X', family: 'Y' }] },
      ],
    },
  };
  const datacite = {
    data: [
      {
        id: '10.48550/arxiv.1706.03762',
        attributes: {
          creators: [
            { givenName: 'Ashish', familyName: 'Vaswani', nameType: 'Personal' },
            { name: 'Google', nameType: 'Organizational' }, // dropped
          ],
        },
      },
    ],
  };

  it('takes Crossref first, asks DataCite only for the rest, and keys by bare lowercase DOI', async () => {
    const { urls, fetchImpl } = stubRegistries(crossref, datacite);
    const cache = await fetchAuthorCache(
      ['https://doi.org/10.1126/science.adz4351', '10.48550/arXiv.1706.03762', '10.1/nowhere', null],
      { fetchImpl, delayMs: 0, now: '2026-10-20T00:00:00.000Z' },
    );
    expect(cache).toEqual({
      generatedAt: '2026-10-20T00:00:00.000Z',
      works: {
        '10.1126/science.adz4351': {
          source: 'crossref',
          authors: [{ given: 'Sherry', family: 'Liu', orcid: '0009-0002-8795-5215' }],
        },
        '10.48550/arxiv.1706.03762': {
          source: 'datacite',
          authors: [{ given: 'Ashish', family: 'Vaswani', orcid: null }],
        },
      },
    });
    expect(urls).toHaveLength(2);
    expect(decodeURIComponent(urls[0])).toContain('doi:10.1/nowhere,doi:10.1126/science.adz4351');
    // DataCite is asked only for what Crossref did not return, which excludes Biomni.
    expect(decodeURIComponent(urls[1])).not.toContain('adz4351');
    expect(decodeURIComponent(urls[1])).toContain('"10.48550/arxiv.1706.03762"');
  });

  it('keeps the previous record for a DOI the registries leave out of a run, and says so', async () => {
    const { fetchImpl } = stubRegistries({ message: { items: [] } }, { data: [] });
    const kept = { source: 'crossref' as const, authors: [{ given: 'Shuli', family: 'Liu', orcid: null }] };
    const logs: string[] = [];
    const cache = await fetchAuthorCache(['10.1/kept', '10.1/never'], {
      fetchImpl,
      delayMs: 0,
      log: (m) => logs.push(m),
      previous: { generatedAt: '2026-01-01T00:00:00.000Z', works: { '10.1/kept': kept, '10.1/dropped-from-corpus': kept } },
    });
    expect(cache.works).toEqual({ '10.1/kept': kept });
    expect(logs).toContain('not returned this run, so the previous record is kept: 10.1/kept');
    expect(logs).toContain('no record in either registry: 10.1/never');
  });

  it('throws on a non-OK response, naming the batch, so nothing partial is written', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 503, statusText: 'Busy', json: async () => ({}) });
    await expect(fetchAuthorCache(['10.1/a'], { fetchImpl, delayMs: 0 })).rejects.toThrow(
      'Crossref batch 1/1: HTTP 503 Busy',
    );
  });

  it('refuses a DOI that a batch query cannot carry', async () => {
    const { fetchImpl } = stubRegistries(crossref, datacite);
    await expect(fetchAuthorCache(['10.1/a,b'], { fetchImpl, delayMs: 0 })).rejects.toThrow('cannot batch');
  });
});

describe('serializeAuthorCache', () => {
  it('writes one paper per line and reads back to the same cache', () => {
    const cache = {
      generatedAt: '2026-10-20T00:00:00.000Z',
      works: {
        '10.2/b': { source: 'datacite' as const, authors: [] },
        '10.1/a': { source: 'crossref' as const, authors: [{ given: 'Shuli', family: 'Liu', orcid: null }] },
      },
    };
    const text = serializeAuthorCache(cache);
    expect(AuthorCacheSchema.parse(JSON.parse(text))).toEqual(cache);
    const workLines = text.split('\n').filter((l) => l.startsWith('    "10.'));
    expect(workLines.map((l) => l.trim().slice(1, 7))).toEqual(['10.1/a', '10.2/b']);
  });
});

describe('the committed author-cache.json', () => {
  const cache = AuthorCacheSchema.parse(JSON.parse(readFileSync(AUTHOR_CACHE_PATH, 'utf-8')));

  it('is written in the committed one-paper-per-line form', () => {
    expect(readFileSync(AUTHOR_CACHE_PATH, 'utf-8')).toBe(serializeAuthorCache(cache));
  });

  it('records the two people behind "Liu, S." in tucca-cellag/caail-planning#552', () => {
    const liu = (doi: string) => cache.works[doi]?.authors.filter((a) => a.family === 'Liu' && a.given?.startsWith('S'));
    expect(liu('10.1126/science.adz4351')?.map((a) => a.given)).toEqual(['Sherry']);
    for (const farmGtex of ['10.1038/s41588-025-02121-5', '10.1038/s41588-023-01585-7', '10.1093/nsr/nwaf048', '10.1038/s41588-022-01153-5']) {
      expect(liu(farmGtex)?.map((a) => a.given)).toEqual(['Shuli']);
    }
  });
});
