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
 * deliberately narrow — the shape below matches every non-`topic:` id committed to
 * `site/db/ndjson/items.ndjson` and nothing else. `topic:` ids are rejected on
 * purpose: a theme is not a reportable entry. (No count is written here. `report.test.ts`
 * derives both populations from that file, so a figure in this comment would be one more
 * hand-typed number beside a derived one, and the way it would fail is someone reading a
 * total, counting the rejected ids as missing, and widening the grammar to "fix" it.)
 * Callers that render an id must
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

/** True when `value` is a well-formed frozen item id. The gate on every untrusted `?item=`. */
export function isItemId(value: unknown): value is string {
  return typeof value === 'string' && ITEM_ID_RE.test(value);
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
 *
 * `body` is the composed report (see ./report-compose.ts) and lands in the template's
 * `details` textarea. Omitted when empty, so the CAAIL-255 behaviour — a bare anchored
 * form — is exactly what a caller that passes no body still gets.
 *
 * WHAT IS DELIBERATELY NOT SET HERE: `reason`. The template's `reason` field is a
 * dropdown, and passing its option text as a query parameter does NOT select it — checked
 * against the live form rather than inferred, because GitHub's schema documentation says
 * only that a field's `id` "is the canonical identifier for the field in URL query
 * parameter prefills" and never states how a dropdown encodes its value. Sending a
 * parameter that does nothing would read, to anyone maintaining this, like a working
 * prefill. The error class travels in the composed body instead, where it is stated in
 * the template's own words, and the reader picks the dropdown themselves — which is why
 * the page says so rather than promising a single click.
 */
export function correctionIssueUrl(itemId: string | null, body?: string | null): string {
  const q = new URLSearchParams({ template: CORRECTION_TEMPLATE });
  if (itemId && isItemId(itemId)) {
    q.set('title', `Correction: ${itemId}`);
    q.set('item', itemId);
  }
  if (body) q.set('details', body);
  return `https://github.com/${CAAIL_REPO}/issues/new?${q.toString()}`;
}

/**
 * The email route, with the id already in the subject so it survives the trip.
 *
 * `body` carries the composed report into the mail client, so the account-free route is
 * not left thinner than the GitHub one: a reader without a GitHub account gets the same
 * finished report, already written. Omitted when empty, which keeps the no-body URL
 * byte-identical to what CAAIL-255 shipped.
 *
 * WHY THIS ONE IS NOT BUILT WITH URLSearchParams, UNLIKE {@link correctionIssueUrl}.
 * `mailto:` is RFC 6068, not `application/x-www-form-urlencoded`: it percent-encodes, and
 * a `+` in its query is a LITERAL plus rather than a space. `URLSearchParams` encodes
 * spaces as `+`, so composing this the same way as the GitHub URL would send a conforming
 * mail client a subject line reading "CAAIL+correction:+paper:214" and a body with a plus
 * between every word. Spaces are common in both, so this would be wrong on the first real
 * use rather than in some edge case.
 */
export function correctionMailto(itemId: string | null, body?: string | null): string {
  const subject = itemId && isItemId(itemId) ? `CAAIL correction: ${itemId}` : 'CAAIL correction';
  const fields = [`subject=${encodeURIComponent(subject)}`];
  if (body) fields.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${CORRECTION_EMAIL}?${fields.join('&')}`;
}
