/**
 * CAAIL events collector.
 *
 * Receives the two usage events the site emits (site searches and outbound
 * resource clicks) and writes them to Workers Analytics Engine. It exists so
 * those events can collect without a cookie: the alternatives we would otherwise
 * reach for, GA4 and GTM, both set first-party cookies, which under ePrivacy
 * requires consent, and a consent banner is a high price for two counters on a
 * reference library.
 *
 * Deliberately minimal. It stores no identifier, sets no cookie, and writes no
 * part of the client IP address to the dataset. The address is read once per
 * request, as the rate limiter's counter key, and is neither stored nor
 * recoverable from what the dataset holds. Analytics Engine's own sampling is
 * the only aggregation applied.
 *
 * What it accepts is documented for readers in site/src/content/docs/privacy.mdx.
 * Keep the two in step: a field added here that is not described there is an
 * undisclosed collection.
 */

export interface Env {
  /** Workers Analytics Engine dataset binding. */
  EVENTS: { writeDataPoint: (point: AnalyticsEnginePoint) => void };
  /** Exact origin allowed to post, e.g. https://tucca-cellag.github.io */
  ALLOWED_ORIGIN: string;
  /**
   * Cloudflare rate limiting binding, configured in wrangler.toml. Typed
   * structurally rather than as workers-types' `RateLimit` for the same reason
   * as {@link AnalyticsEnginePoint}: this module compiles and tests with no
   * ambient platform types, and the surface it uses is one method.
   */
  RATE_LIMITER: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
}

interface AnalyticsEnginePoint {
  blobs?: string[];
  doubles?: number[];
  indexes?: string[];
}

/** The only event names we store. Anything else is dropped without comment. */
const ALLOWED_EVENTS = new Set(['search', 'outbound_click']);

/** Mirrors MAX_QUERY_LEN in site/src/lib/analytics.ts. */
const MAX_QUERY_LEN = 80;
const MIN_BARE_ID_DIGITS = 7;

/**
 * The first four groups of an IPv6 address: its /64, the unit a rate limit
 * should count.
 *
 * A /64 is the smallest block routinely delegated to one customer, so keying on
 * the whole address would not be a loose limit, it would be no limit: an
 * attacker on a single ordinary connection could put every request in a bucket
 * of its own. (Keying by /64 shrinks that supply rather than removing it. A
 * residential customer is often given a /56 or a /48, which is 256 or 65,536
 * distinct /64s. See wrangler.toml for what the cap does and does not buy.)
 *
 * One address has many spellings, and the naive `split(':').slice(0, 4)` files
 * them separately, handing back the bypass it looks like it closes:
 * `2001:db8::1` and `2001:db8::2` share a /64 but differ in their first four
 * colon-separated tokens. So a compressed address has its elided zero groups
 * restored *before* the first four are taken, and leading zeros and case are
 * normalised. `index.test.ts` pins one key per spelling.
 *
 * What this deliberately does not do, because none of it can arrive in
 * `CF-Connecting-IP` (the edge sets a bare address, and sets IPv4 as a dotted
 * quad): it does not expand an address that has no `::` and fewer than eight
 * groups, does not count an embedded IPv4 tail as the two groups it represents,
 * and does not strip brackets or a port. Each of those keys oddly rather than
 * dangerously. Malformed input with more than one `::` is keyed whole, which is
 * the strict direction: it groups, never splits.
 */
function ipv6Prefix64(address: string): string {
  const halves = address.split('::');
  if (halves.length > 2) return address.toLowerCase(); // Malformed; key it whole.
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const elided = halves.length === 2 ? Math.max(0, 8 - left.length - right.length) : 0;
  const groups = [...left, ...Array<string>(elided).fill('0'), ...right];
  return groups
    .slice(0, 4)
    .map((group) => (group.replace(/^0+/, '') || '0').toLowerCase())
    .join(':');
}

/**
 * The bucket a request is counted against.
 *
 * `CF-Connecting-IP` is set by the edge and cannot be spoofed by the caller. A
 * client-supplied header could be, which would hand every attacker an unlimited
 * supply of fresh buckets.
 *
 * IPv4 is counted whole: an address is scarce enough that holding many is a real
 * cost, and grouping by /24 would put a small ISP's readers in one bucket for no
 * gain. IPv6 is counted by /64, for the opposite reason (see
 * {@link ipv6Prefix64}).
 *
 * Cloudflare's own guidance discourages IP as a rate limit key at all, because a
 * campus NAT or a privacy proxy puts many readers behind one address. That
 * argument bites when the limit is tight enough for normal use to reach it,
 * which is why the configured limit sits far above what a reader generates (see
 * wrangler.toml) rather than near it.
 *
 * A request arriving without the header shares one bucket with every other such
 * request. That is deliberately the strictest treatment, not the loosest:
 * `?? crypto.randomUUID()` would read as a harmless fallback and would in fact
 * be a bypass anyone could take by stripping a header.
 */
function limitKey(request: Request): string {
  const address = request.headers.get('CF-Connecting-IP');
  if (!address) return 'unknown';
  return address.includes(':') ? ipv6Prefix64(address) : address;
}

/**
 * Re-apply the client's search redaction here.
 *
 * The client already drops addresses, pasted prose and bare identifiers, but the
 * client is not a trust boundary: anyone can post to this endpoint directly. The
 * rule that protects a visitor has to hold on the side they do not control.
 * Kept deliberately identical to the site's normalizeQuery, and exported so the
 * two are held to that by a differential test (src/index.test.ts) rather than by
 * this sentence.
 */
export function normalizeQuery(raw: string): string | null {
  const q = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  if (q.length < 2 || q.length > MAX_QUERY_LEN) return null;
  if (q.includes('@')) return null;
  const alnum = q.replace(/[^a-z0-9]/g, '');
  if (!/[a-z]/.test(alnum) && (alnum.match(/\d/g) ?? []).length >= MIN_BARE_ID_DIGITS) return null;
  return q;
}

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });

    // Bound the volume one caller can contribute.
    //
    // Everything below this line bounds the *content* of a data point: the event
    // name must be in an enum, the resource kind must be in an enum, the search
    // term is re-redacted, the strings are truncated. None of that bounds how
    // many points a caller can add, and an aggregate anyone can move at will
    // measures nothing, which would defeat the only reason this endpoint exists
    // in place of a cookie-setting vendor tag.
    //
    // First of the POST checks, so every path that gets this far is charged: the
    // body is not read yet (a refused caller cannot make us buffer a megabyte of
    // JSON), a rejected Origin is charged, and so is an unrecognised event name.
    // A dropped event still consumed a request, and any path left uncharged is a
    // free channel.
    //
    // No try/catch. If the binding is missing or the limiter throws, this
    // handler 500s and writes nothing, which is the correct direction to fail:
    // a lost data point is recoverable, a polluted dataset is not.
    const { success } = await env.RATE_LIMITER.limit({ key: limitKey(request) });
    if (!success) {
      return new Response('too many requests', { status: 429, headers: cors });
    }

    // Reject cross-site posts. Not a security boundary (Origin is spoofable off
    // a browser) but it keeps casual noise out of the dataset.
    const origin = request.headers.get('Origin');
    if (origin && origin !== env.ALLOWED_ORIGIN) {
      return new Response('forbidden', { status: 403, headers: cors });
    }

    let body: { name?: unknown; props?: unknown };
    try {
      const parsed: unknown = JSON.parse(await request.text());
      // `JSON.parse` accepts bare literals, so a body of `null` parses fine and
      // then throws on the first property access — outside this catch. Reject
      // anything that is not an object here rather than downstream.
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return new Response('bad request', { status: 400, headers: cors });
      }
      body = parsed as { name?: unknown; props?: unknown };
    } catch {
      return new Response('bad request', { status: 400, headers: cors });
    }

    const name = typeof body.name === 'string' ? body.name : '';
    if (!ALLOWED_EVENTS.has(name)) {
      // 204 rather than 400: a rejected event is not the caller's problem to
      // fix, and the client is fire-and-forget so it will never read this.
      return new Response(null, { status: 204, headers: cors });
    }

    const props = (body.props ?? {}) as Record<string, unknown>;

    if (name === 'search') {
      const term = typeof props.search_term === 'string' ? normalizeQuery(props.search_term) : null;
      if (!term) return new Response(null, { status: 204, headers: cors });
      const count = Number(props.result_count);
      env.EVENTS.writeDataPoint({
        indexes: ['search'],
        blobs: ['search', term],
        doubles: [Number.isFinite(count) ? count : -1],
      });
    } else {
      // Constrained to the enum for the same reason the search term is
      // re-redacted here: anyone can post directly, and an unbounded string
      // would let a caller write arbitrary values into the dataset.
      const raw = props.resource_kind;
      const kind = raw === 'doi' || raw === 'repo' ? raw : 'external';
      const domain = typeof props.link_domain === 'string' ? props.link_domain.slice(0, 253) : '';
      const url = typeof props.link_url === 'string' ? props.link_url.slice(0, 2048) : '';
      env.EVENTS.writeDataPoint({
        indexes: ['outbound_click'],
        blobs: ['outbound_click', kind, domain, url],
        doubles: [1],
      });
    }

    return new Response(null, { status: 204, headers: cors });
  },
};
