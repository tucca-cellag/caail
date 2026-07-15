/**
 * fetch-licenses.test.ts — the networked auto-resolver core, exercised with an
 * injected fetch (no network). Proves it records GitHub SPDX, dedupes/skips repos,
 * omits NOASSERTION (never guesses), and throws loudly on a rate-limit.
 */

import { describe, it, expect } from 'vitest';
import { fetchLicenseCache } from './fetch-licenses.js';

const res = (status: number, body: any = {}, remaining = '4999') => ({
  status,
  ok: status >= 200 && status < 300,
  statusText: `HTTP ${status}`,
  headers: { get: (n: string) => (n === 'x-ratelimit-remaining' ? remaining : null) },
  json: async () => body,
});

describe('fetchLicenseCache', () => {
  it('records GitHub SPDX per repo and dedupes', async () => {
    const seen: string[] = [];
    const fetchFn = async (url: string) => {
      seen.push(url);
      return res(200, { license: { spdx_id: 'MIT', name: 'MIT License' } }) as any;
    };
    const cache = await fetchLicenseCache(['a/b', 'a/b', 'c/d'], fetchFn, () => {}, '2026-07-14T00:00:00Z');
    expect(seen.length).toBe(2); // deduped
    expect(cache.repos['a/b'].spdx).toBe('MIT');
    expect(cache.generatedAt).toBe('2026-07-14T00:00:00Z');
  });

  it('skips a 404 and omits NOASSERTION (never guesses)', async () => {
    const fetchFn = async (url: string) => {
      if (url.endsWith('/gone/repo')) return res(404) as any;
      if (url.endsWith('/weird/lic')) return res(200, { license: { spdx_id: 'NOASSERTION' } }) as any;
      return res(200, { license: { spdx_id: 'Apache-2.0', name: 'Apache 2.0' } }) as any;
    };
    const cache = await fetchLicenseCache(['gone/repo', 'weird/lic', 'ok/repo'], fetchFn, () => {});
    expect(cache.repos['gone/repo']).toBeUndefined();
    expect(cache.repos['weird/lic']).toBeUndefined();
    expect(cache.repos['ok/repo'].spdx).toBe('Apache-2.0');
  });

  it('throws on a non-OK (rate-limit) response', async () => {
    const fetchFn = async () => res(403, {}, '0') as any;
    await expect(fetchLicenseCache(['x/y'], fetchFn, () => {})).rejects.toThrow(/rate limit/i);
  });

  it('ignores null/undefined repo keys', async () => {
    const fetchFn = async () => res(200, { license: { spdx_id: 'MIT' } }) as any;
    const cache = await fetchLicenseCache([null, undefined, 'a/b'], fetchFn, () => {});
    expect(Object.keys(cache.repos)).toEqual(['a/b']);
  });

  it('sends the GitHub User-Agent (+ Bearer token when set) on every request', async () => {
    // Regression: the request must carry authHeaders() — a User-Agent-less call gets a
    // 403, and a token-less one hits the 60 req/hr limit. Both silently break the refresh.
    const prev = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'ghtok';
    try {
      const inits: Array<{ headers: Record<string, string> } | undefined> = [];
      const fetchFn = async (_url: string, init?: { headers: Record<string, string> }) => {
        inits.push(init);
        return res(200, { license: { spdx_id: 'MIT' } }) as any;
      };
      await fetchLicenseCache(['a/b'], fetchFn as any, () => {});
      expect(inits).toHaveLength(1);
      expect(inits[0]?.headers['User-Agent']).toBe('CAAIL-licenses');
      expect(inits[0]?.headers.Authorization).toBe('Bearer ghtok');
    } finally {
      if (prev === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = prev;
    }
  });

  it('omits the Authorization header when GITHUB_TOKEN is unset', async () => {
    const prev = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      let seen: { headers: Record<string, string> } | undefined;
      const fetchFn = async (_url: string, init?: { headers: Record<string, string> }) => {
        seen = init;
        return res(200, { license: { spdx_id: 'MIT' } }) as any;
      };
      await fetchLicenseCache(['a/b'], fetchFn as any, () => {});
      expect(seen?.headers['User-Agent']).toBe('CAAIL-licenses');
      expect(seen?.headers.Authorization).toBeUndefined();
    } finally {
      if (prev !== undefined) process.env.GITHUB_TOKEN = prev;
    }
  });
});
