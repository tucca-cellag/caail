/**
 * licenses.ts — shared license → tier classifier and tier metadata.
 *
 * A single source of truth consumed by four surfaces so their colors and groupings
 * can't drift:
 *   - CatalogBrowser.tsx — the per-card corner license badge + the filter facet
 *   - the dataset-cards remark transform — the badge on dataset cards
 *   - LicenseHub.tsx + metrics.ts — the /licenses/ hub + the dashboard panel counts
 *
 * A license "tag" here is a coarse TRIAGE signal (permissive / copyleft / restricted /
 * unknown), NOT a substitute for the actual license/terms — verify at the source before
 * any commercial use. `license` values are SPDX-ish tokens: GitHub-detected `spdx_id`s
 * (MIT, Apache-2.0, GPL-3.0, …), Creative Commons data licenses (CC-BY, CC-BY-NC, …), or
 * a curator's manual string ("Non-commercial", "Controlled access", "Proprietary").
 *
 * One UNIFIED 4-tier axis spans code AND data: CC data licenses map into the same tiers
 * (CC-BY → permissive, CC-BY-SA → copyleft, CC-BY-NC/ND → restricted), and controlled- /
 * managed- / registered-access data (dbGaP, EGA, DUA-gated) → restricted.
 */

export type LicenseTier = 'permissive' | 'copyleft' | 'restricted' | 'unknown';

/** Tiers in display order (permissive → copyleft → restricted → unknown). */
export const LICENSE_TIERS: readonly LicenseTier[] = [
  'permissive',
  'copyleft',
  'restricted',
  'unknown',
];

export interface TierMeta {
  /** Short human label, e.g. "Permissive". */
  label: string;
  /** One-line explanation for the badge tooltip / panel legend. */
  blurb: string;
}

export const TIER_META: Record<LicenseTier, TierMeta> = {
  permissive: {
    label: 'Permissive',
    blurb: 'MIT / Apache / BSD / CC-BY / CC0 — broad reuse, including commercial.',
  },
  copyleft: {
    label: 'Copyleft',
    blurb: 'GPL / MPL / CC-BY-SA — reuse allowed, but derivatives inherit the license.',
  },
  restricted: {
    label: 'Restricted',
    blurb:
      'Non-commercial, academic-only, proprietary, or controlled-access — check terms before commercial cell-ag use.',
  },
  unknown: {
    label: 'Unknown',
    blurb: 'No license/terms detected — verify at the source before relying on it.',
  },
};

/**
 * Classify a license token into a coarse tier. `null`/empty → `unknown`.
 *
 * Order matters: restricted signals (NC / non-commercial / proprietary / controlled-
 * access) are checked before copyleft, and copyleft (GPL / share-alike) before
 * permissive, so a compound Creative Commons token resolves to its strongest
 * restriction (CC-BY-NC-SA → restricted, CC-BY-SA → copyleft, CC-BY → permissive).
 */
export function licenseTier(license: string | null | undefined): LicenseTier {
  if (!license) return 'unknown';
  const s = license.trim().toUpperCase();
  if (!s) return 'unknown';

  // Restricted: non-commercial, academic-only, proprietary, all-rights-reserved, a
  // "Commons Clause" rider (forbids selling — overrides the base license), OR a data
  // access barrier (controlled / managed / registered access, dbGaP, EGA, DUA-gated).
  if (
    /NON[\s-]?COMMERCIAL|(^|[\s-])NC([\s-]|$)|(^|[\s-])ND([\s-]|$)|PROPRIETARY|ACADEMIC|ALL[\s-]RIGHTS[\s-]RESERVED|COMMONS[\s-]CLAUSE|\bCUSTOM\b|CONTROLLED[\s-]?ACCESS|MANAGED[\s-]?ACCESS|REGISTERED[\s-]?ACCESS|ACCESS[\s-]?RESTRICTED|\bDBGAP\b|\bEGA\b|\bDUA\b/.test(
      s,
    )
  )
    return 'restricted';

  // Copyleft / weak-copyleft / share-alike.
  if (/GPL|MPL|EPL|EUPL|CDDL|OSL|CECILL|(^|[\s-])SA([\s-]|$)|SHARE[\s-]?ALIKE/.test(s))
    return 'copyleft';

  // Permissive: MIT/Apache/BSD family, ISC, CC0/public-domain, CC-BY (no NC/SA/ND),
  // plus common lax OSI licenses (Artistic-2.0, MS-PL).
  if (
    /\bMIT\b|MIT-0|APACHE|BSD|ISC|CC0|UNLICENSE|WTFPL|ZLIB|0BSD|BOOST|\bBSL\b|POSTGRESQL|PYTHON|ARTISTIC|MS-PL|CC-BY/.test(
      s,
    )
  )
    return 'permissive';

  return 'unknown';
}
