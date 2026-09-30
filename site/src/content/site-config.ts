/**
 * Where the site deploys. `astro.config.mjs` reads `site` and `base` from here,
 * and so does anything else that needs an absolute URL (the agent API), so the
 * two cannot disagree. Pure: no imports, safe for the parser and the config.
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
