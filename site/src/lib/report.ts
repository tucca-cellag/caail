/**
 * report.ts — the "report an issue with this entry" route, in one place.
 *
 * WHY THE FROZEN ITEM ID IS THE WHOLE POINT
 * -----------------------------------------
 * CAAIL assigns every catalogued item a namespaced id (`paper:214`, `sw:cellpose`,
 * `db:string`, `ds:chickengtex-portal`) once, and never changes it. A correction
 * carrying that id drops straight into the `caail-db-authoring` flow; a correction
 * carrying a page URL and a description is a search task before it is a fix. So the
 * id travels through every route offered here — the prefilled GitHub issue, the
 * email subject line, and the copyable text on the report page itself.
 *
 * WHY THE ID IS VALIDATED RATHER THAN TRUSTED
 * -------------------------------------------
 * `/report/` is a static page on GitHub Pages, so it reads `?item=` in the browser:
 * an attacker controls that string. {@link isItemId} is the gate, and it is
 * deliberately narrow — the shape below matches all 882 ids committed to
 * `site/db/ndjson/items.ndjson` and nothing else. Callers that render an id must
 * still assign it through `textContent` / `href` rather than `innerHTML`; validation
 * is the belt, that is the braces.
 */

/** The public repository every correction route points at. */
export const CAAIL_REPO = 'tucca-cellag/caail';

/** Issue-form template filename that {@link correctionIssueUrl} prefills. */
export const CORRECTION_TEMPLATE = 'entry-correction.yml';

/** Base-relative route of the report page. Callers prepend `BASE_URL` themselves. */
export const REPORT_PATH = '/report/';

/**
 * Where an email correction goes when the reader has no GitHub account.
 *
 * Published deliberately: the account requirement is the real exclusion for CAAIL's
 * audience, and a bench scientist is meaningfully less likely to hold one than a
 * software reader. The cost is that a public `mailto:` is scrapable.
 */
export const CORRECTION_EMAIL = 'benjamin.bromberg@tufts.edu';

/**
 * The frozen-id grammar.
 *
 * `paper:` ids are positive integers (public anchors people bookmark). The other three
 * namespaces are slugs over `[a-z0-9-]`, opening on an alphanumeric. The 120-char body
 * bound clears the longest committed id (101 chars) with room to spare while keeping a
 * hostile `?item=` from reaching a URL or the DOM at any length worth worrying about.
 */
const ITEM_ID_RE = /^(?:paper:[1-9][0-9]{0,6}|(?:sw|db|ds):[a-z0-9][a-z0-9-]{0,119})$/;

/** The four content types a report can be filed against. */
export type ItemKind = 'paper' | 'software' | 'database' | 'dataset';

const KIND_BY_PREFIX: Record<string, ItemKind> = {
  paper: 'paper',
  sw: 'software',
  db: 'database',
  ds: 'dataset',
};

/** Reader-facing noun per kind, for link labels and page copy. */
export const KIND_NOUN: Record<ItemKind, string> = {
  paper: 'paper',
  software: 'software tool',
  database: 'database',
  dataset: 'dataset entry',
};

/** True when `value` is a well-formed frozen item id. The gate on every untrusted `?item=`. */
export function isItemId(value: unknown): value is string {
  return typeof value === 'string' && ITEM_ID_RE.test(value);
}

/** The content type an id belongs to, or null when the id is malformed. */
export function itemKind(id: string): ItemKind | null {
  if (!isItemId(id)) return null;
  return KIND_BY_PREFIX[id.slice(0, id.indexOf(':'))] ?? null;
}

/**
 * Link to the report page for one entry.
 *
 * `base` is `BASE_URL`, which is `"/caail/"` in `.astro` files but `"/caail"` inside a
 * Preact island — normalised here so callers need not remember which they are in.
 */
export function reportHref(base: string, itemId: string): string {
  const root = (base || '/').replace(/\/$/, '');
  return `${root}${REPORT_PATH}?item=${encodeURIComponent(itemId)}`;
}

/**
 * The prefilled GitHub issue-form URL.
 *
 * GitHub prefills an issue form's fields from query params keyed by the field's `id` in
 * the template, so `item=` lands in the template's `item` input. A null id yields the
 * bare template — still useful, just unanchored.
 */
export function correctionIssueUrl(itemId: string | null): string {
  const q = new URLSearchParams({ template: CORRECTION_TEMPLATE });
  if (itemId && isItemId(itemId)) {
    q.set('title', `Correction: ${itemId}`);
    q.set('item', itemId);
  }
  return `https://github.com/${CAAIL_REPO}/issues/new?${q.toString()}`;
}

/** The email route, with the id already in the subject so it survives the trip. */
export function correctionMailto(itemId: string | null): string {
  const subject = itemId && isItemId(itemId) ? `CAAIL correction: ${itemId}` : 'CAAIL correction';
  return `mailto:${CORRECTION_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
