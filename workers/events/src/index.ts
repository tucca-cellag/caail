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
 * Deliberately minimal. It stores no identifier, sets no cookie, and does not
 * record the client IP address. Analytics Engine's own sampling is the only
 * aggregation applied.
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
 * Re-apply the client's search redaction here.
 *
 * The client already drops addresses, pasted prose and bare identifiers, but the
 * client is not a trust boundary: anyone can post to this endpoint directly. The
 * rule that protects a visitor has to hold on the side they do not control.
 * Kept deliberately identical to normalizeQuery so the two can be diffed by eye.
 */
function normalizeQuery(raw: string): string | null {
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

    // Reject cross-site posts. Not a security boundary (Origin is spoofable off
    // a browser) but it keeps casual noise out of the dataset.
    const origin = request.headers.get('Origin');
    if (origin && origin !== env.ALLOWED_ORIGIN) {
      return new Response('forbidden', { status: 403, headers: cors });
    }

    let body: { name?: unknown; props?: unknown };
    try {
      body = JSON.parse(await request.text());
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
      const kind = typeof props.resource_kind === 'string' ? props.resource_kind : 'external';
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
