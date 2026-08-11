/**
 * Tests for the events collector Worker.
 *
 * These run inside the site's vitest project (see site/vitest.config.ts) rather
 * than a second npm project of their own. The Worker is a single dependency-free
 * module whose only platform contact is `Request`/`Response`, both native in
 * Node 22, so a workerd pool would buy fidelity this handler cannot use, at the
 * price of a second test runner and a second CI job, which is how a suite ends
 * up not running at all.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeQuery as siteNormalizeQuery } from '../../../site/src/lib/analytics.ts';
import worker, { type Env, normalizeQuery } from './index.ts';

const ORIGIN = 'https://tucca-cellag.github.io';

interface Recorder {
  env: Env;
  /** Points handed to Analytics Engine, in order. */
  written: { blobs?: string[]; doubles?: number[]; indexes?: string[] }[];
  /** Keys the handler passed to the rate limiter, in order. */
  limitKeys: string[];
}

/** An Env whose two bindings record what the handler did to them. */
function recorder({ allow = true }: { allow?: boolean } = {}): Recorder {
  const written: Recorder['written'] = [];
  const limitKeys: string[] = [];
  return {
    written,
    limitKeys,
    env: {
      EVENTS: { writeDataPoint: (point) => void written.push(point) },
      ALLOWED_ORIGIN: ORIGIN,
      RATE_LIMITER: {
        limit: async ({ key }) => {
          limitKeys.push(key);
          return { success: allow };
        },
      },
    },
  };
}

/** A well-formed event post, so each test varies only the thing it is about. */
function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://events.example/', {
    method: 'POST',
    headers: { Origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const SEARCH = { name: 'search', props: { search_term: 'scaffolding', result_count: 12 } };

describe('rate limiting', () => {
  it('writes the event when the limiter allows the request', async () => {
    const spy = recorder({ allow: true });
    const res = await worker.fetch(post(SEARCH), spy.env);

    expect(res.status).toBe(204);
    expect(spy.written).toHaveLength(1);
  });

  it('returns 429 and writes nothing when the limiter refuses', async () => {
    const spy = recorder({ allow: false });
    const res = await worker.fetch(post(SEARCH), spy.env);

    expect(res.status).toBe(429);
    expect(spy.written).toEqual([]);
  });

  it('answers a refused request with CORS headers, so the browser does not report an opaque failure', async () => {
    const spy = recorder({ allow: false });
    const res = await worker.fetch(post(SEARCH), spy.env);

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('keys the limit by the connecting IPv4 address, whole', async () => {
    const spy = recorder();
    await worker.fetch(post(SEARCH, { 'CF-Connecting-IP': '203.0.113.7' }), spy.env);

    expect(spy.limitKeys).toEqual(['203.0.113.7']);
  });

  it('gives two IPv4 addresses two buckets, even inside one /24', async () => {
    const spy = recorder();
    await worker.fetch(post(SEARCH, { 'CF-Connecting-IP': '203.0.113.7' }), spy.env);
    await worker.fetch(post(SEARCH, { 'CF-Connecting-IP': '203.0.113.8' }), spy.env);

    expect(new Set(spy.limitKeys).size).toBe(2);
  });

  // The finding that decides whether the cap is a control or a decoration: one
  // ordinary VM is handed a /64, so keying on the whole v6 address hands an
  // attacker 2^64 buckets for free and the limit means nothing.
  it('collapses an IPv6 /64 to one bucket', async () => {
    const spy = recorder();
    for (const ip of [
      '2001:db8:1234:5678::1',
      '2001:db8:1234:5678::2',
      '2001:db8:1234:5678:aaaa:bbbb:cccc:dddd',
    ]) {
      await worker.fetch(post(SEARCH, { 'CF-Connecting-IP': ip }), spy.env);
    }

    expect(new Set(spy.limitKeys).size).toBe(1);
  });

  it('still separates two different IPv6 /64s', async () => {
    const spy = recorder();
    await worker.fetch(post(SEARCH, { 'CF-Connecting-IP': '2001:db8:1234:5678::1' }), spy.env);
    await worker.fetch(post(SEARCH, { 'CF-Connecting-IP': '2001:db8:1234:9999::1' }), spy.env);

    expect(new Set(spy.limitKeys).size).toBe(2);
  });

  // `split(':').slice(0, 4)` passes the /64 test above and fails this one:
  // compressed and expanded spellings of one address truncate differently, so
  // an attacker gets a fresh bucket per spelling.
  it.each([
    ['2001:db8::1', '2001:0db8:0000:0000:0000:0000:0000:0001'],
    ['2001:DB8::1', '2001:db8::1'],
    ['::1', '0:0:0:0:0:0:0:1'],
    ['2001:db8:0:0::5', '2001:db8::5'],
  ])('keys %s and %s identically', async (a, b) => {
    const spy = recorder();
    await worker.fetch(post(SEARCH, { 'CF-Connecting-IP': a }), spy.env);
    await worker.fetch(post(SEARCH, { 'CF-Connecting-IP': b }), spy.env);

    expect(spy.limitKeys[0]).toBe(spy.limitKeys[1]);
  });

  // The edge sends IPv4 as a dotted quad, so this form should never arrive. If
  // it ever does, every such caller shares one bucket. Recorded because the
  // fallback needs to be the strict direction by intent, not by accident.
  it('collapses IPv4-mapped IPv6 into a single bucket', async () => {
    const spy = recorder();
    await worker.fetch(post(SEARCH, { 'CF-Connecting-IP': '::ffff:203.0.113.7' }), spy.env);
    await worker.fetch(post(SEARCH, { 'CF-Connecting-IP': '::ffff:198.51.100.4' }), spy.env);

    expect(new Set(spy.limitKeys).size).toBe(1);
  });

  // The exact key per address shape, so the doc comment on ipv6Prefix64 is
  // checked rather than asserted. A comment claiming behaviour with nothing
  // holding it to that is the defect the root CLAUDE.md ranks first, and an
  // earlier draft of that comment described an expansion step the code skips
  // for one of these inputs.
  it.each([
    // Every spelling of one /64 keys the same, which is the whole point.
    ['2001:db8:1234:5678:0000:0000:0000:0001', '2001:db8:1234:5678'],
    ['2001:db8:1234:5678::1', '2001:db8:1234:5678'],
    ['2001:0DB8:1234:5678::1', '2001:db8:1234:5678'],
    // Leading, trailing and whole-address compression.
    ['::1', '0:0:0:0'],
    ['::', '0:0:0:0'],
    ['2001:db8::', '2001:db8:0:0'],
    ['2001:db8:0:0:0:0:0:0', '2001:db8:0:0'],
    // A zone index rides in group 8 and is sliced off, so it cannot mint buckets.
    ['fe80::1%eth0', 'fe80:0:0:0'],
    ['fe80::1%eth1', 'fe80:0:0:0'],
    // Unreachable from CF-Connecting-IP. Pinned so the comment saying they key
    // oddly rather than dangerously stays honest, and so a future change to the
    // parser has to look at them.
    ['2001:db8', '2001:db8'],
    ['a::b::c', 'a::b::c'],
  ])('keys %s as %s', async (address, expected) => {
    const spy = recorder();
    await worker.fetch(post(SEARCH, { 'CF-Connecting-IP': address }), spy.env);

    expect(spy.limitKeys).toEqual([expected]);
  });

  it('puts every headerless caller in one shared bucket rather than exempting them', async () => {
    const spy = recorder();
    await worker.fetch(post(SEARCH), spy.env);
    await worker.fetch(post(SEARCH), spy.env);

    expect(spy.limitKeys).toEqual(['unknown', 'unknown']);
  });

  it('spends no budget on a preflight', async () => {
    const spy = recorder();
    const res = await worker.fetch(
      new Request('https://events.example/', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
      spy.env,
    );

    expect(res.status).toBe(204);
    expect(spy.limitKeys).toEqual([]);
  });

  it('spends no budget on a non-POST', async () => {
    const spy = recorder();
    const res = await worker.fetch(new Request('https://events.example/'), spy.env);

    expect(res.status).toBe(405);
    expect(spy.limitKeys).toEqual([]);
  });

  it('checks the limit before reading the body, so an oversized post is refused unparsed', async () => {
    const spy = recorder({ allow: false });
    const res = await worker.fetch(post('not json at all'), spy.env);

    // A 400 here would prove the body was parsed first.
    expect(res.status).toBe(429);
    expect(spy.limitKeys).toHaveLength(1);
  });

  it('charges a dropped event to the caller, so junk cannot be posted for free', async () => {
    const spy = recorder();
    const res = await worker.fetch(post({ name: 'not_an_event' }), spy.env);

    expect(res.status).toBe(204);
    expect(spy.written).toEqual([]);
    expect(spy.limitKeys).toHaveLength(1);
  });

  it('charges a post refused for its Origin too', async () => {
    const spy = recorder();
    const res = await worker.fetch(post(SEARCH, { Origin: 'https://evil.example' }), spy.env);

    expect(res.status).toBe(403);
    expect(spy.limitKeys).toHaveLength(1);
  });
});

describe('accepted events', () => {
  it('records a search', async () => {
    const spy = recorder();
    await worker.fetch(post(SEARCH), spy.env);

    expect(spy.written).toEqual([
      { indexes: ['search'], blobs: ['search', 'scaffolding'], doubles: [12] },
    ]);
  });

  it('records an outbound click, constraining the kind to the enum', async () => {
    const spy = recorder();
    await worker.fetch(
      post({
        name: 'outbound_click',
        props: { resource_kind: 'anything-i-like', link_domain: 'doi.org', link_url: 'https://doi.org/10.1/x' },
      }),
      spy.env,
    );

    expect(spy.written).toEqual([
      {
        indexes: ['outbound_click'],
        blobs: ['outbound_click', 'external', 'doi.org', 'https://doi.org/10.1/x'],
        doubles: [1],
      },
    ]);
  });

  it('rejects a post from another origin', async () => {
    const spy = recorder();
    const res = await worker.fetch(post(SEARCH, { Origin: 'https://evil.example' }), spy.env);

    expect(res.status).toBe(403);
    expect(spy.written).toEqual([]);
  });

  it('rejects a body that parses to a bare literal', async () => {
    const spy = recorder();
    const res = await worker.fetch(post('null'), spy.env);

    expect(res.status).toBe(400);
    expect(spy.written).toEqual([]);
  });
});

/**
 * The Worker re-applies the client's search redaction because the client is not
 * a trust boundary. That only holds while the two implementations agree, so this
 * is the check that fails when they stop agreeing. A comment on each copy asking
 * the reader to diff them by eye documents the risk without mitigating it.
 *
 * The corpus pins both duplicated constants at their boundary (80/81 characters,
 * 6/7 bare digits), since an off-by-one in either is the drift most likely to go
 * unnoticed.
 */
describe('normalizeQuery parity with the client', () => {
  const corpus = [
    // Ordinary queries, kept.
    'scaffolding',
    'MEDIA optimization',
    '  spaced   out  ',
    'gse123456',
    '10.1038/s41586',
    'σ-factor',
    // Redacted: too short, too long, an address, a bare identifier.
    '',
    'a',
    'x'.repeat(81),
    'x'.repeat(80),
    'someone@example.com',
    '5551234567',
    '555-123-4567',
    '123456',
    '1234567',
    '12 34 56 7',
    // Boundary cases where the two rules could plausibly diverge.
    '  ',
    'ab',
    '\t\nab\r ',
    'A1',
    '0000000a',
  ];

  it.each(corpus)('agrees on %j', (input) => {
    expect(normalizeQuery(input)).toBe(siteNormalizeQuery(input));
  });
});

/**
 * The seam between the handler and its deployment config.
 *
 * Every binding below is read off `env` at runtime but declared in
 * wrangler.toml, and nothing else connects the two names. `Env` is a hand-written
 * structural type, so a rename still typechecks, and `wrangler deploy --dry-run`
 * validates the config without ever comparing it to the code. A rename therefore
 * deploys clean and then throws on the first request, which for RATE_LIMITER
 * takes the whole collector offline.
 *
 * **The two directions are caught by two different mechanisms, and only one of
 * them is here.** A reviewer read this block in isolation and concluded a
 * code-side rename slips through, so it is worth stating plainly:
 *
 *   - config-side (wrangler.toml renamed, code untouched): caught *here*. The
 *     assertions below stop matching.
 *   - code-side (`Env` and its use renamed, config untouched): caught by every
 *     behavioural test above, because `recorder()` supplies the *wrangler.toml*
 *     names. The handler then reads an absent property and 31 tests fail with
 *     "Cannot read properties of undefined". Verified by doing it.
 *
 * These are presence assertions on literal lines, not a TOML parse. Reformatting
 * the file will fail them; that is the safe direction for a guard, since the
 * alternative is a silent pass.
 */
describe('wrangler.toml declares what the handler reads', () => {
  const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

  it.each([
    ['RATE_LIMITER', /^\s*name\s*=\s*"RATE_LIMITER"\s*$/m],
    ['EVENTS', /^\s*binding\s*=\s*"EVENTS"\s*$/m],
    ['ALLOWED_ORIGIN', /^\s*ALLOWED_ORIGIN\s*=\s*"\S+"\s*$/m],
  ])('declares env.%s', (_name, pattern) => {
    expect(config).toMatch(pattern);
  });

  // Wrangler rejects any other value, so this only front-loads that failure into
  // the suite rather than leaving it to the deploy.
  it('sets a rate limit period the platform accepts', () => {
    expect(config).toMatch(/^\s*period\s*=\s*(10|60)\s*$/m);
  });

  // The 429s are the only record that a refusal happened: rate limiting bindings
  // are not surfaced in the dashboard, and Worker invocation status is not HTTP
  // status. Without this, a reader being suppressed looks exactly like quiet.
  it('keeps observability on, so refusals are visible at all', () => {
    expect(config).toMatch(/^\s*\[observability\]\s*$/m);
    expect(config).toMatch(/^\s*enabled\s*=\s*true\s*$/m);
  });
});
