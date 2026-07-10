/**
 * licenses.ts — shared license → tier classifier and tier metadata.
 *
 * A single source of truth consumed by three surfaces so their colors and
 * groupings can't drift:
 *   - CatalogBrowser.tsx — the per-card license badge
 *   - MetricsDashboard.astro — the license-distribution panel
 *   - scripts/parser/metrics.ts — the per-tier / per-area counts in metrics.json
 *
 * A license "tag" here is a coarse TRIAGE signal (permissive / copyleft /
 * restricted / unknown), not a substitute for the actual license text — see the
 * AI-agent note atop Software.md / Databases.md. `license` values are SPDX-ish
 * tokens: GitHub-detected `spdx_id`s (MIT, Apache-2.0, GPL-3.0, …) or a curator's
 * manual `License:` line (e.g. "Non-commercial", "Proprietary").
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
    blurb: 'MIT / Apache / BSD-style — broad reuse, including commercial.',
  },
  copyleft: {
    label: 'Copyleft',
    blurb: 'GPL / MPL-style — reuse allowed, but derivatives inherit the license.',
  },
  restricted: {
    label: 'Restricted',
    blurb:
      'Non-commercial, academic-only, or proprietary — check terms before commercial cell-ag use.',
  },
  unknown: {
    label: 'Unknown',
    blurb: 'No license detected — verify at the source before relying on it.',
  },
};

/**
 * Classify a license token into a coarse tier. `null`/empty → `unknown`.
 *
 * Order matters: restricted signals (NC / non-commercial / proprietary) are
 * checked before copyleft, and copyleft (GPL / share-alike) before permissive,
 * so a compound Creative Commons token resolves to its strongest restriction
 * (CC-BY-NC-SA → restricted, CC-BY-SA → copyleft, CC-BY → permissive).
 */
export function licenseTier(license: string | null | undefined): LicenseTier {
  if (!license) return 'unknown';
  const s = license.trim().toUpperCase();
  if (!s) return 'unknown';

  // Restricted: non-commercial, academic-only, proprietary, all-rights-reserved,
  // or a "Commons Clause" rider (forbids selling — overrides the base license).
  if (
    /NON[\s-]?COMMERCIAL|(^|[\s-])NC([\s-]|$)|PROPRIETARY|ACADEMIC|ALL[\s-]RIGHTS[\s-]RESERVED|COMMONS[\s-]CLAUSE|\bCUSTOM\b/.test(
      s,
    )
  )
    return 'restricted';

  // Copyleft / weak-copyleft / share-alike.
  if (/GPL|MPL|EPL|EUPL|CDDL|OSL|CECILL|(^|[\s-])SA([\s-]|$)|SHARE[\s-]?ALIKE/.test(s))
    return 'copyleft';

  // Permissive: MIT/Apache/BSD family, ISC, CC0/public-domain, CC-BY (no NC/SA),
  // plus common lax OSI licenses (Artistic-2.0, MS-PL).
  if (
    /\bMIT\b|MIT-0|APACHE|BSD|ISC|CC0|UNLICENSE|WTFPL|ZLIB|0BSD|BOOST|\bBSL\b|POSTGRESQL|PYTHON|ARTISTIC|MS-PL|CC-BY/.test(
      s,
    )
  )
    return 'permissive';

  return 'unknown';
}
