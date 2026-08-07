import { describe, it, expect, vi } from 'vitest';
import { resolveSink, outboundEvent, normalizeQuery, parseResultCount } from './analytics';

const ORIGIN = 'https://tucca-cellag.github.io/caail/';

describe('resolveSink', () => {
  it('returns null when no analytics tag is installed', () => {
    expect(resolveSink({})).toBeNull();
  });

  it('prefers gtag and forwards as a GA4 event', () => {
    const gtag = vi.fn();
    resolveSink({ gtag })!('outbound_click', { kind: 'doi' });
    expect(gtag).toHaveBeenCalledWith('event', 'outbound_click', { kind: 'doi' });
  });

  it('falls back to a dataLayer push for a GTM-only container', () => {
    const push = vi.fn();
    resolveSink({ dataLayer: { push } })!('outbound_click', { kind: 'repo' });
    expect(push).toHaveBeenCalledWith({ event: 'outbound_click', kind: 'repo' });
  });

  it('ignores a non-callable gtag rather than throwing', () => {
    expect(resolveSink({ gtag: undefined })).toBeNull();
  });

  // --- the first-party beacon ----------------------------------------------
  // A vendor tag is not the only possible destination, and the two we would
  // otherwise reach for (GA4, GTM) both set cookies, which would force a consent
  // banner. This branch posts to an endpoint we run, so the events can collect
  // without one.

  it('posts to the beacon endpoint when no tag is installed', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    resolveSink({ navigator: { sendBeacon } }, 'https://ev.example/e')!('search', {
      search_term: 'bioprocess',
      result_count: 36,
    });
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, payload] = sendBeacon.mock.calls[0];
    expect(url).toBe('https://ev.example/e');
    expect(JSON.parse(payload as string)).toMatchObject({
      name: 'search',
      props: { search_term: 'bioprocess', result_count: 36 },
    });
  });

  it('still prefers a real tag over the beacon when both are available', () => {
    const gtag = vi.fn();
    const sendBeacon = vi.fn();
    resolveSink({ gtag, navigator: { sendBeacon } }, 'https://ev.example/e')!('search', {});
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('returns null when the beacon endpoint is unconfigured', () => {
    expect(resolveSink({ navigator: { sendBeacon: vi.fn() } })).toBeNull();
    expect(resolveSink({ navigator: { sendBeacon: vi.fn() } }, '')).toBeNull();
  });

  // sendBeacon is absent in older Safari and returns false when the payload
  // exceeds the browser's queue budget. Dropping the event in either case would
  // silently under-count exactly the heavy sessions worth hearing about.
  it('falls back to keepalive fetch when sendBeacon is missing or refuses', () => {
    const fetchFn = vi.fn();
    resolveSink({ fetch: fetchFn }, 'https://ev.example/e')!('search', { a: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: 'POST', keepalive: true });

    const refusing = vi.fn().mockReturnValue(false);
    const fetch2 = vi.fn();
    resolveSink({ navigator: { sendBeacon: refusing }, fetch: fetch2 }, 'https://ev.example/e')!(
      'search',
      { a: 1 },
    );
    expect(refusing).toHaveBeenCalledTimes(1);
    expect(fetch2).toHaveBeenCalledTimes(1);
  });

  it('never throws when the endpoint is unreachable', () => {
    const boom = vi.fn(() => {
      throw new Error('offline');
    });
    expect(() =>
      resolveSink({ navigator: { sendBeacon: boom } }, 'https://ev.example/e')!('search', {}),
    ).not.toThrow();
  });
});

describe('outboundEvent', () => {
  it('classifies a DOI link', () => {
    expect(outboundEvent('https://doi.org/10.1038/s41586-024-1', ORIGIN)).toEqual({
      url: 'https://doi.org/10.1038/s41586-024-1',
      domain: 'doi.org',
      kind: 'doi',
    });
  });

  it('classifies a repo link and strips www.', () => {
    expect(outboundEvent('https://www.github.com/tucca-cellag/caail', ORIGIN)?.kind).toBe('repo');
    expect(outboundEvent('https://www.github.com/tucca-cellag/caail', ORIGIN)?.domain).toBe('github.com');
  });

  it('falls back to external for anything else', () => {
    expect(outboundEvent('https://www.ebi.ac.uk/ena', ORIGIN)?.kind).toBe('external');
  });

  it('returns null for same-origin links, including relative ones', () => {
    expect(outboundEvent('/caail/papers/explorer/', ORIGIN)).toBeNull();
    expect(outboundEvent('https://tucca-cellag.github.io/caail/software/', ORIGIN)).toBeNull();
  });

  it('returns null for non-web schemes', () => {
    expect(outboundEvent('mailto:dataprivacy@tufts.edu', ORIGIN)).toBeNull();
    expect(outboundEvent('tel:+16176270000', ORIGIN)).toBeNull();
  });

  it('returns null for an unparseable href', () => {
    expect(outboundEvent('', ORIGIN)).toBeNull();
    expect(outboundEvent('http://', ORIGIN)).toBeNull();
  });

  it('keeps the query string, because for deposit links it carries the accession', () => {
    const e = outboundEvent('https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE123456', ORIGIN);
    expect(e?.url).toBe('https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE123456');
  });

  it('strips the fragment', () => {
    expect(outboundEvent('https://example.org/paper#section-3', ORIGIN)?.url).toBe('https://example.org/paper');
  });
});

describe('normalizeQuery', () => {
  it('trims, collapses whitespace and lowercases', () => {
    expect(normalizeQuery('  Serum-Free   Media ')).toBe('serum-free media');
  });

  it('rejects queries shorter than two characters', () => {
    expect(normalizeQuery('a')).toBeNull();
    expect(normalizeQuery('   ')).toBeNull();
  });

  it('rejects anything holding an @, so a pasted address is never recorded', () => {
    expect(normalizeQuery('someone@example.com')).toBeNull();
  });

  it('rejects pasted prose beyond the length cap', () => {
    expect(normalizeQuery('x'.repeat(81))).toBeNull();
    expect(normalizeQuery('x'.repeat(80))).toBe('x'.repeat(80));
  });

  it('rejects letterless digit strings that look like a phone number or SSN', () => {
    expect(normalizeQuery('6176270000')).toBeNull();
    expect(normalizeQuery('123-45-6789')).toBeNull();
  });

  it('keeps accessions and DOIs, which are exactly what this corpus is searched for', () => {
    expect(normalizeQuery('GSE123456')).toBe('gse123456');
    expect(normalizeQuery('10.1038/s41586-024-1')).toBe('10.1038/s41586-024-1');
    expect(normalizeQuery('CHO cell line K1')).toBe('cho cell line k1');
  });

  it('keeps a short letterless number, which carries no identifying value', () => {
    expect(normalizeQuery('10.1038')).toBe('10.1038');
  });
});

describe('parseResultCount', () => {
  it('reads the true total from the summary line, not the paginated DOM', () => {
    // Pagefind renders 5 but matches 47; recording 5 would make every broad
    // search look identical to a narrow one.
    expect(parseResultCount('47 results for cell', 5)).toBe(47);
  });

  it('handles the singular form', () => {
    expect(parseResultCount('1 result for xyzzy', 1)).toBe(1);
  });

  it('handles a thousands separator', () => {
    expect(parseResultCount('1,204 results for a', 5)).toBe(1204);
  });

  it('is not fooled by a numeric search term', () => {
    expect(parseResultCount('3 results for 2024', 3)).toBe(3);
  });

  it('falls back to the rendered count when the summary is absent or unparseable', () => {
    expect(parseResultCount(null, 4)).toBe(4);
    expect(parseResultCount(undefined, 4)).toBe(4);
    expect(parseResultCount('no results', 0)).toBe(0);
  });
});
