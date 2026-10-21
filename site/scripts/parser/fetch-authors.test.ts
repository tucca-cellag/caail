/**
 * fetch-authors.test.ts: the registry lookups behind author-cache.json, against a
 * stubbed network, plus the committed cache itself.
 */

import { readFileSync } from 'node:fs';

import { describe, it, expect } from 'vitest';

import { AUTHOR_CACHE_PATH, loadAuthorCache, uncachedDois, type AuthorCache } from './authors.js';
import { corpusPapers } from './corpus-fixture.js';
import { bareOrcid, fetchAuthorCache, serializeAuthorCache, type FetchLike } from './fetch-authors.js';

const ok = (body: unknown) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });
const notFound = { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };

/**
 * A stub answering both registries: batch queries from fixed bodies, single lookups from
 * `singles` keyed by URL (404 otherwise). Records every URL asked.
 */
function stubRegistries(crossref: unknown, datacite: unknown, singles: Record<string, unknown> = {}) {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    if (url.startsWith('https://api.crossref.org/works?')) return ok(crossref);
    if (url.startsWith('https://api.datacite.org/dois?')) return ok(datacite);
    return url in singles ? ok(singles[url]) : notFound;
  };
  return { urls, fetchImpl };
}

const shuli = { source: 'crossref' as const, authors: [{ given: 'Shuli', family: 'Liu', orcid: null }] };
const previousWith = (works: AuthorCache['works']): AuthorCache => ({ generatedAt: '2026-01-01T00:00:00.000Z', works });
const none = { source: 'none' as const, authors: [] };

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
      'total-results': 2,
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
    meta: { total: 1 },
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

  it('takes Crossref first, asks DataCite for the rest, then each DOI still missing on its own', async () => {
    const { urls, fetchImpl } = stubRegistries(crossref, datacite);
    const cache = await fetchAuthorCache(
      ['https://doi.org/10.1126/science.adz4351', '10.48550/arXiv.1706.03762', '10.1/nowhere', null],
      { fetchImpl, delayMs: 0, now: '2026-10-20T00:00:00.000Z' },
    );
    expect(cache).toEqual({
      generatedAt: '2026-10-20T00:00:00.000Z',
      works: {
        '10.1/nowhere': none, // neither registry holds it, so it is recorded as none
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
    expect(urls.map((u) => decodeURIComponent(u))).toEqual([
      expect.stringContaining('doi:10.1/nowhere,doi:10.1126/science.adz4351,doi:10.48550/arxiv.1706.03762'),
      // DataCite is asked only for what Crossref did not return, which excludes Biomni.
      expect.stringMatching(/^https:\/\/api\.datacite\.org\/dois\?query=doi:\("10\.1\/nowhere"\+OR\+"10\.48550/),
      'https://api.crossref.org/works/10.1/nowhere',
      'https://api.datacite.org/dois/10.1/nowhere',
    ]);
  });

  it('asks DataCite for a DOI Crossref returned with no named authors, and takes its names', async () => {
    const orgOnly = { message: { 'total-results': 1, items: [{ DOI: '10.1/x', author: [{ name: 'A Consortium' }] }] } };
    const named = {
      meta: { total: 1 },
      data: [{ id: '10.1/x', attributes: { creators: [{ givenName: 'Shuli', familyName: 'Liu' }] } }],
    };
    const { fetchImpl } = stubRegistries(orgOnly, named);
    const cache = await fetchAuthorCache(['10.1/x'], { fetchImpl, delayMs: 0 });
    expect(cache.works['10.1/x']).toEqual({ source: 'datacite', authors: [{ given: 'Shuli', family: 'Liu', orcid: null }] });
  });

  it('keeps the previous record for a DOI the registries leave out of a run, and says so', async () => {
    const { fetchImpl } = stubRegistries({ message: { items: [] } }, { data: [] });
    const logs: string[] = [];
    const cache = await fetchAuthorCache(['10.1/kept', '10.1/never'], {
      fetchImpl,
      delayMs: 0,
      log: (m) => logs.push(m),
      previous: previousWith({ '10.1/kept': shuli, '10.1/dropped-from-corpus': shuli }),
    });
    expect(cache.works).toEqual({ '10.1/kept': shuli, '10.1/never': none });
    expect(logs).toContain('not returned this run, so the previous record is kept: 10.1/kept');
    expect(logs).toContain('no registry holds these, recorded as none (check each DOI): 10.1/never');
  });

  it('keeps the previous record when a registry returns the DOI with no named authors', async () => {
    const empty = { message: { items: [{ DOI: '10.1/emptied', author: [{ name: 'A Consortium' }] }] } };
    const { fetchImpl } = stubRegistries(empty, { data: [] });
    const logs: string[] = [];
    const cache = await fetchAuthorCache(['10.1/emptied'], {
      fetchImpl,
      delayMs: 0,
      log: (m) => logs.push(m),
      previous: previousWith({ '10.1/emptied': shuli }),
    });
    expect(cache.works['10.1/emptied']).toEqual(shuli);
    expect(logs).toContain('returned with no named authors, so the previous record is kept: 10.1/emptied');
  });

  it('looks a DOI no batch query can carry up on its own instead of failing the run', async () => {
    const single = { message: { DOI: '10.1/a,b', author: [{ given: 'Ann', family: 'Lee' }] } };
    const { urls, fetchImpl } = stubRegistries(crossref, datacite, {
      'https://api.crossref.org/works/10.1%2Fa%2Cb': single,
    });
    const cache = await fetchAuthorCache(['10.1/a,b'], { fetchImpl, delayMs: 0 });
    expect(cache.works['10.1/a,b']).toEqual({ source: 'crossref', authors: [{ given: 'Ann', family: 'Lee', orcid: null }] });
    expect(urls).toEqual(['https://api.crossref.org/works/10.1%2Fa%2Cb']);
  });

  it('splits a DataCite person who carries only a name at its comma', async () => {
    const nameOnly = {
      meta: { total: 1 },
      data: [
        {
          id: '10.48550/arxiv.2501.00001',
          attributes: { creators: [{ name: 'Liu, Sherry', nameType: 'Personal' }, { name: 'Plato', nameType: 'Personal' }] },
        },
      ],
    };
    const { fetchImpl } = stubRegistries({ message: { items: [] } }, nameOnly);
    const cache = await fetchAuthorCache(['10.48550/arxiv.2501.00001'], { fetchImpl, delayMs: 0 });
    expect(cache.works['10.48550/arxiv.2501.00001']?.authors).toEqual([{ given: 'Sherry', family: 'Liu', orcid: null }]);
  });

  it('throws when a batch reports more matches than one page holds, so none is silently cut', async () => {
    const { fetchImpl } = stubRegistries({ message: { 'total-results': 51, items: [] } }, { data: [] });
    await expect(fetchAuthorCache(['10.1/a'], { fetchImpl, delayMs: 0 })).rejects.toThrow(
      'Crossref batch 1/1: 51 matches for 1 DOIs, more than one page of 50 holds',
    );
  });

  it('throws on a non-OK response, naming the batch, so nothing partial is written', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 503, statusText: 'Busy', json: async () => ({}) });
    await expect(fetchAuthorCache(['10.1/a'], { fetchImpl, delayMs: 0 })).rejects.toThrow(
      'Crossref batch 1/1: HTTP 503 Busy',
    );
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
    expect(JSON.parse(text)).toEqual(cache);
    const workLines = text.split('\n').filter((l) => l.startsWith('    "10.'));
    expect(workLines.map((l) => l.trim().slice(1, 7))).toEqual(['10.1/a', '10.2/b']);
  });
});

describe('the committed author-cache.json', () => {
  const cache = loadAuthorCache()!;

  it('loads and validates', () => {
    expect(cache).not.toBeNull();
  });

  it('covers every paper with a DOI, so none falls back to name-only joins unnoticed', () => {
    expect(
      uncachedDois(cache, corpusPapers().references),
      'papers with a DOI but no author record: run `pnpm --dir site fetch:authors` and commit author-cache.json',
    ).toEqual([]);
  });

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
