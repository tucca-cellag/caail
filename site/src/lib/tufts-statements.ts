/**
 * The statements every Tufts web page carries, in one place.
 *
 * `Footer.astro` renders them on every page, and `e2e/tufts-statements.spec.ts`
 * asserts the rendered footer against its own copy of each required wording, so a
 * change here that drifts from Tufts' text fails there.
 *
 * Each wording comes from the Tufts page named beside it, as read on 2026-11-22.
 * Those pages are the authority: when one changes, change this module to match it,
 * not the other way round.
 */

/**
 * Tufts' Digital Accessibility Policy (2022 revision) asks every page to show an
 * accessibility statement or a link to the policy, with a contact for "the designated
 * responsible position or positions ... (instead of individuals, who often change
 * positions or duties)". It supplies the template this follows, naming the unit and
 * the position.
 */
export const ACCESSIBILITY_POLICY_URL = 'https://access.tufts.edu/digital-accessibility-policy';
export const ACCESSIBILITY_UNIT = 'Tufts University Center for Cellular Agriculture';
export const ACCESSIBILITY_CONTACT = 'cellag@tufts.edu';

/**
 * Tufts' Policy on Co-Branding on Websites: this sentence "must accompany all links to
 * sites outside the Tufts.edu domain". It is about each linked site, so it follows a
 * lead-in saying so: standing alone in CAAIL's own footer, "This site" would read as
 * CAAIL disclaiming its tie to Tufts.
 */
export const OUTSIDE_LINK_LEAD = 'Links to sites outside tufts.edu:';
export const OUTSIDE_LINK_SENTENCE =
  'This site or any product or service provided by the site is not affiliated with or endorsed by Tufts University.';

/** Linked to from every Tufts page read; the privacy statement is tucca-cellag/caail-planning#399's subject. */
export const TUFTS_PRIVACY_URL = 'https://www.tufts.edu/about/privacy';
export const NON_DISCRIMINATION_URL =
  'https://oeo.tufts.edu/policies-procedures/non-discrimination-statement/';

/**
 * The copyright holder: Tufts University, as every Tufts page read gives it, and the
 * contributors, who keep copyright in what they contribute (CONTRIBUTING.md offers a
 * contribution under the licence rather than assigning it). LICENSE and README.md name
 * the same holder, and `tufts-statements.test.ts` fails if either drifts from this.
 */
export const COPYRIGHT_HOLDER = 'Tufts University and CAAIL contributors';

/**
 * The year on the copyright line: the build's, in UTC, so it is never typed and the
 * page states the year it was built in.
 */
export const copyrightYear = (now: Date = new Date()): number => now.getUTCFullYear();
