/**
 * Where the site deploys. `astro.config.mjs` reads `site` and `base` from here,
 * and so does anything else that needs an absolute URL (the agent API), so the
 * two cannot disagree. Pure: no imports, safe for the parser and the config.
 */

/** The deployed origin (no trailing slash). */
export const SITE_ORIGIN = 'https://tucca-cellag.github.io';

/** The path the site is served under (no trailing slash). */
export const SITE_BASE = '/caail';

/** Origin + base, with a trailing slash: the site root as an absolute URL. */
export const SITE_URL = `${SITE_ORIGIN}${SITE_BASE}/`;
