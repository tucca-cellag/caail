/**
 * analytics.ts — pure helpers for CAAIL's two usage events: outbound resource
 * clicks and site searches. The DOM wiring lives in Analytics.astro; the logic
 * lives here because vitest runs in node, so keeping it DOM-free makes it
 * directly testable (same split as topic-chips.ts).
 *
 * Backend-agnostic on purpose. `resolveSink` looks for an analytics tag on the
 * global at call time and returns null when none is present, so this layer can
 * land now and start emitting the moment CAAIL is added to Tufts' existing GA4 /
 * GTM container — with no edit to this file or its callers. Until then every
 * call is a no-op that costs one property lookup.
 *
 * What each event discloses is documented for readers in
 * src/content/docs/privacy.mdx; keep the two in step.
 */

/** Event payloads stay flat and primitive — GA4 drops nested objects. */
export type EventProps = Record<string, string | number | boolean>;

/** A destination for events. GA4's `gtag` and GTM's `dataLayer` both fit. */
export type Sink = (name: string, props: EventProps) => void;

/** The globals we probe for. Structural, so tests can pass a plain object. */
export interface AnalyticsGlobals {
  /** GA4's global tag, present when gtag.js has loaded. */
  gtag?: (command: string, name: string, props: EventProps) => void;
  /** GTM's queue. Present whenever a container is installed, gtag.js or not. */
  dataLayer?: { push: (payload: Record<string, unknown>) => void };
  /** For the first-party beacon. Queued by the browser, survives navigation. */
  navigator?: { sendBeacon?: (url: string, data?: string) => boolean };
  /** Fallback transport where `sendBeacon` is absent or refuses the payload. */
  fetch?: (input: string, init?: Record<string, unknown>) => unknown;
}

/**
 * Marks a subtree whose outbound links must have named query parameters dropped
 * before recording. The attribute's VALUE is the space-separated list.
 *
 * Declared here rather than beside the page that needs it, and that placement is
 * the whole point: `Analytics.astro` is mounted from the footer, so it loads on
 * every page including the Lighthouse-gated landing page. Importing this
 * constant from `report-compose.ts` made Rollup emit a 1.6 KB chunk carrying the
 * entire correction composer — `composeBody`, the note bounding, the DOI
 * regex — as a second waterfall hop on all 52 pages, to read one string. This
 * module is already a dependency of the analytics script, so putting it here
 * costs nothing.
 */
export const NO_QUERY_ANALYTICS_ATTR = 'data-analytics-drop-params';

/** Longest search query we will record. Long strings are pasted text, not queries. */
const MAX_QUERY_LEN = 80;

/** Digits in a letterless query before we treat it as an identifier and drop it. */
const MIN_BARE_ID_DIGITS = 7;

/** Outbound links we classify, so "DOI resolutions" can be counted apart from repo visits. */
const DOMAIN_KINDS: Record<string, OutboundKind> = {
  'doi.org': 'doi',
  'dx.doi.org': 'doi',
  'github.com': 'repo',
  'gitlab.com': 'repo',
  'bitbucket.org': 'repo',
};

/** What sort of resource an outbound link points at. */
export type OutboundKind = 'doi' | 'repo' | 'external';

/** A resolved outbound-click event, ready to hand to a {@link Sink}. */
export interface OutboundEvent {
  /** Absolute destination URL, fragment stripped. */
  url: string;
  /** Destination hostname, lowercased and `www.`-stripped, for grouping. */
  domain: string;
  /** Coarse resource class — see {@link OutboundKind}. */
  kind: OutboundKind;
}

/**
 * Post events to an endpoint we run ourselves.
 *
 * `sendBeacon` is the right transport: the browser owns the request once it is
 * queued, so it survives the page being navigated away or closed, which is
 * exactly when an outbound click fires. It is also fire-and-forget, so a slow or
 * dead endpoint cannot delay a navigation.
 *
 * The payload goes as a plain string rather than a JSON blob, and the fetch
 * fallback declares `text/plain`, because `application/json` is not a
 * CORS-safelisted content type and would trigger a preflight OPTIONS on every
 * event. The receiver parses the body itself.
 *
 * Every failure mode is swallowed. Measurement must never be able to break the
 * page it is measuring.
 */
function beaconSink(scope: AnalyticsGlobals, url: string): Sink {
  return (name, props) => {
    const body = JSON.stringify({ name, props, ts: Date.now() });
    try {
      const send = scope.navigator?.sendBeacon;
      // sendBeacon returns false when the payload exceeds the browser's queue
      // budget, and is absent entirely in older Safari. Either way, fall through
      // rather than dropping the event.
      if (typeof send === 'function' && send.call(scope.navigator, url, body)) return;
      // `.catch` matters: a rejected fetch escapes the surrounding try, which
      // only catches synchronous throws, and would surface as an unhandled
      // rejection in the console of every visitor whose network hiccups.
      const sent = scope.fetch?.(url, {
        method: 'POST',
        body,
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      });
      if (sent && typeof (sent as Promise<unknown>).catch === 'function') {
        (sent as Promise<unknown>).catch(() => {});
      }
    } catch {
      /* offline, blocked by an extension, or CSP-refused: nothing to do */
    }
  };
}

/**
 * The first available analytics sink on `scope`, or null when none is
 * installed. Prefers `gtag` over raw `dataLayer` pushes because gtag applies
 * GA4's own parameter validation; falls back to `dataLayer` so a GTM-only
 * container (no gtag.js) still receives events; falls back again to a
 * first-party beacon when `beaconUrl` is configured.
 *
 * The beacon is last because a vendor tag, if one is ever installed, is the more
 * capable destination. It exists because the two vendor tags we would otherwise
 * reach for both set cookies, which under ePrivacy requires consent, and a
 * consent banner is a high price for two counters on a reference library.
 */
export function resolveSink(scope: AnalyticsGlobals, beaconUrl?: string): Sink | null {
  if (typeof scope.gtag === 'function') {
    const gtag = scope.gtag;
    return (name, props) => gtag('event', name, props);
  }
  const layer = scope.dataLayer;
  if (layer && typeof layer.push === 'function') {
    return (name, props) => layer.push({ event: name, ...props });
  }
  if (beaconUrl) return beaconSink(scope, beaconUrl);
  return null;
}

/**
 * Classify a clicked link as an outbound resource click, or null when it isn't
 * one (same-origin navigation, a non-web scheme like `mailto:`, or an
 * unparseable href).
 *
 * Query strings are kept by default, unlike Cloudflare's beacon: an outbound
 * href is content we published from the canonical Markdown, not something the
 * visitor typed, and for deposit links the query string *is* the accession
 * (`…/acc.cgi?acc=GSE12345`). Fragments are dropped as pure noise.
 *
 * `dropParams` is for the one place that premise fails. /report/'s composer puts
 * the reader's own answers, free-text note included, into the GitHub link's
 * query, so recording that href verbatim would post visitor-authored content to
 * the collector — while the privacy page says search text is the only free text
 * collected. Which parameters those are is the caller's business, not this
 * function's; ReportRoutes.astro names them from the URL builder.
 *
 * NAMED PARAMETERS, not the whole query. Dropping the query wholesale also threw
 * away `item=`, which is the only per-entry attribution this site has on that
 * route: page views cannot supply it, because the Cloudflare beacon discards
 * query strings, so the outbound event is the entire signal. Removing the
 * reader's text is required; removing the entry id was collateral, and it
 * contradicted a comment in ReportRoutes.astro that still promised the signal.
 * The caller names what is sensitive, so this function needs to know nothing
 * about any route.
 */
export function outboundEvent(
  href: string,
  siteOrigin: string,
  dropParams: readonly string[] = [],
): OutboundEvent | null {
  let url: URL;
  try {
    url = new URL(href, siteOrigin);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.origin === new URL(siteOrigin).origin) return null;

  const domain = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';
  for (const name of dropParams) url.searchParams.delete(name);
  return { url: url.toString(), domain, kind: DOMAIN_KINDS[domain] ?? 'external' };
}

/**
 * Normalise a search query for recording, or null when it should not be
 * recorded at all.
 *
 * A search box is the one place a visitor types free text, so this is the only
 * user-authored data CAAIL would collect — it gets the tightest handling in the
 * codebase. We drop anything holding an `@` (pasted addresses), anything long
 * enough to be pasted prose rather than a query, and anything mostly digits (an
 * ID or phone number). Callers additionally record a term once, on settle,
 * rather than per keystroke.
 */
export function normalizeQuery(raw: string): string | null {
  const q = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  if (q.length < 2) return null;
  if (q.length > MAX_QUERY_LEN) return null;
  if (q.includes('@')) return null;
  // Reject identifier-shaped input: digits with no letters anywhere, long
  // enough to be a phone number or an SSN. An earlier "mostly digits" rule
  // dropped `gse123456` and `10.1038/s41586` too, which are precisely the
  // queries this corpus most needs to hear about. Accessions and DOIs carry
  // letters; phone numbers do not.
  const alnum = q.replace(/[^a-z0-9]/g, '');
  if (!/[a-z]/.test(alnum) && (alnum.match(/\d/g) ?? []).length >= MIN_BARE_ID_DIGITS) return null;
  return q;
}

/**
 * The true number of matches for a search, given Pagefind's summary line and
 * the number of results currently in the DOM.
 *
 * Pagefind's default UI paginates at `pageSize ?? 5` and this repo sets no
 * override, so counting rendered `.pagefind-ui__result` nodes tops out at five:
 * "cell" renders 5 but genuinely matches 47. That would make every broad search
 * indistinguishable from a narrow one and defeat the point of recording a count
 * at all. The summary line ("47 results for cell") carries the real total, so we
 * read the leading integer from it and fall back to the DOM count when it is
 * absent or unparseable.
 */
export function parseResultCount(messageText: string | null | undefined, renderedCount: number): number {
  const match = messageText?.match(/\d[\d,]*/);
  if (!match) return renderedCount;
  const total = Number.parseInt(match[0].replace(/,/g, ''), 10);
  return Number.isFinite(total) ? total : renderedCount;
}
