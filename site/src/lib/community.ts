/**
 * community.ts — the CAAIL community hub's two shared constants.
 *
 * THE TWO-PLACE RULE
 * ------------------
 * The Slack shared invite is written out in exactly two files: canonical
 * `Community.md` (the hub page itself, hand-authored) and this module. Every
 * other surface — the header social icon, the footer, the homepage band, the
 * README badge, CONTRIBUTING.md, the issue-template config — points at
 * `/community/` instead, so rotating the invite is a two-file change rather
 * than a hunt across the repo.
 *
 * That rule is not a convention you have to remember: `community.test.ts`
 * asserts both halves of it (this constant matches what `Community.md` ships,
 * and `join.slack.com` appears nowhere else under `site/`). Paste the invite
 * into a component and the suite goes red.
 */

/** The Slack shared invite. Set to never expire. */
export const SLACK_INVITE_URL =
  'https://join.slack.com/t/caail/shared_invite/zt-46315p5eq-M2_jxf2cblnv7KC0TwICRA';

/**
 * Base-relative route of the community hub, for in-site links.
 *
 * Callers prepend `import.meta.env.BASE_URL` themselves (the `.astro`
 * convention in this repo is `const base = import.meta.env.BASE_URL.replace(/\/$/, '')`),
 * so this stays a bare path and never bakes in the `/caail` prefix.
 */
export const COMMUNITY_PATH = '/community/';
