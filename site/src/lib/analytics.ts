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
}

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
 * The first available analytics sink on `scope`, or null when none is
 * installed. Prefers `gtag` over raw `dataLayer` pushes because gtag applies
 * GA4's own parameter validation; falls back to `dataLayer` so a GTM-only
 * container (no gtag.js) still receives events.
 */
export function resolveSink(scope: AnalyticsGlobals): Sink | null {
  if (typeof scope.gtag === 'function') {
    const gtag = scope.gtag;
    return (name, props) => gtag('event', name, props);
  }
  const layer = scope.dataLayer;
  if (layer && typeof layer.push === 'function') {
    return (name, props) => layer.push({ event: name, ...props });
  }
  return null;
}

/**
 * Classify a clicked link as an outbound resource click, or null when it isn't
 * one (same-origin navigation, a non-web scheme like `mailto:`, or an
 * unparseable href).
 *
 * Query strings are kept, unlike Cloudflare's beacon: an outbound href is
 * content we published from the canonical Markdown, not something the visitor
 * typed, and for deposit links the query string *is* the accession
 * (`…/acc.cgi?acc=GSE12345`). Fragments are dropped as pure noise.
 */
export function outboundEvent(href: string, siteOrigin: string): OutboundEvent | null {
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
