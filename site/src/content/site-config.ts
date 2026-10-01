/**
 * Where the site deploys, and the addresses it used to deploy at. `astro.config.mjs`
 * reads `site` and `base` from here, and so does anything else that needs an
 * absolute URL (the agent API), so the two cannot disagree. Also the Google Search
 * Console verification tokens the page head carries. Pure: no imports, safe for the
 * parser and the config.
 */

/** The deployed origin (no trailing slash). */
export const SITE_ORIGIN = 'https://caail.tufts.edu';

/**
 * The path the site is served under (no trailing slash). Empty at a domain root:
 * `'/'` would break the contract, since code builds `${SITE_BASE}/favicon.ico`.
 */
export const SITE_BASE = '';

/** Origin + base, with a trailing slash: the site root as an absolute URL. */
export const SITE_URL = `${SITE_ORIGIN}${SITE_BASE}/`;

/**
 * Where the site used to deploy. After a move, a leftover copy of a retired value
 * is the thing to catch, and a check against the current value alone cannot see
 * it: at a domain root the current base is empty, so every root-relative path is
 * "inside" it and a stale `/caail/` link would pass. Read by the site-config sweep
 * and by the agent API's href guard. Append on every move; never remove an entry.
 */
export const RETIRED_ORIGINS: readonly string[] = ['https://tucca-cellag.github.io'];
export const RETIRED_BASES: readonly string[] = ['/caail'];

/**
 * Whether a root-relative path lies under `base`: the base itself, or the base
 * followed by `/`, `?` or `#`. A bare prefix test would also accept `/caailx`, and
 * testing for `${base}/` alone misses `/caail?t=x` and `/caail#matrix`.
 */
export function isUnderBase(path: string, base: string): boolean {
  return path.startsWith(base) && (path.length === base.length || '/?#'.includes(path[base.length]));
}

/**
 * Google Search Console verification tokens, one meta tag each (astro.config.mjs
 * emits them). Each entry's comment says which account it belongs to.
 *
 * For the tag method Search Console reads "the page to which a non-logged-in user is
 * redirected when visiting the URL that defines your property". Google states its
 * rule against following redirects to another domain for the HTML-file method, and
 * recommends the tag method for a site that redirects all its traffic elsewhere. So
 * the old address's property is probably still verified through the redirect to this
 * site; that is inferred, not stated, so confirm it in Search Console before relying
 * on it.
 *
 * Google documents a tag only as tied to its user, so for a new property or account
 * use the token Search Console shows rather than assuming an existing one carries over.
 *
 * Before removing the setup account's entry, check that account's properties in
 * Search Console: it verified the old address and may verify others.
 */
export const SEARCH_CONSOLE_TOKENS: readonly string[] = [
  'EfjIjiDvU1wMiT-AY61WMslZGzJz5ey4xNqy1ihVgO0', // the account that holds the https://caail.tufts.edu/ URL-prefix property
  'p-AzN61G83Y9JI-9Y_7EmzsfcXDpNbnQto3Wmc3w0NQ', // the setup account, which verified the old address
];
