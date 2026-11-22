/**
 * The Tufts lockup's clear space, in one place.
 *
 * Tufts' logo guidelines: "A mandatory "clear space" around the logo equal to the
 * height of the capital "T" (cap height) must be incorporated into any design using
 * the logo", and the lockup guidelines extend every logo rule to lockups
 * (brand.tufts.edu/guidelines/logos and /lockups, read 2026-11-22).
 *
 * The official PNGs are cropped to the artwork, so none of that space is in the file:
 * `TuccaLockup.astro` adds it as padding, and the e2e suite checks nothing intrudes.
 */

/** The official lockup's pixel height (`cca-horiz-*.png` are 1093 x 169). */
export const LOCKUP_ASSET_HEIGHT = 169;

/**
 * The wordmark's capital "T", top of the crossbar to the foot of the stem, in the
 * asset's own pixels. Measured from the PNGs, not typed from a guide:
 * `tucca-lockup.test.ts` re-measures both assets and fails if this drifts from them.
 */
export const LOCKUP_T_CAP_HEIGHT = 115;

/** The clear space for a lockup drawn `heightPx` tall: the T's cap height at that size. */
export const lockupClearSpace = (heightPx: number): number =>
  (heightPx * LOCKUP_T_CAP_HEIGHT) / LOCKUP_ASSET_HEIGHT;
