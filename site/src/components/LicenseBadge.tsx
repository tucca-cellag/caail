/** @jsxImportSource preact */
/**
 * LicenseBadge — the coarse license/access triage badge pinned to a card corner.
 * Tier drives the colour; `manual` provenance renders a dashed outline + a "verify
 * before commercial use" tooltip (vs solid for GitHub-auto). The badge links to the
 * /licenses/ hub filtered to its tier. A card with no license gets no badge.
 *
 * A coarse triage signal, NOT verified terms — always confirm at the source.
 * Presentational; styling is in ../styles/license-badge.css (global, so the raw-HTML
 * dataset-card badges — emitted by the dataset-cards remark — share it).
 */
import { TIER_META, type LicenseTier } from '../lib/licenses';

const BASE = import.meta.env.BASE_URL;

export default function LicenseBadge({
  license,
  licenseSource,
  tier,
}: {
  license: string | null;
  licenseSource: 'auto' | 'manual' | null;
  tier: LicenseTier;
}) {
  if (!license) return null;
  const manual = licenseSource === 'manual';
  const title = manual
    ? `${TIER_META[tier].label} license (curated — not auto-maintained; verify before commercial use). ${TIER_META[tier].blurb}`
    : `${TIER_META[tier].label} license (auto-detected from GitHub). ${TIER_META[tier].blurb}`;
  return (
    <a
      class={`lic-badge lic-badge--${tier}${manual ? ' lic-badge--manual' : ''}`}
      data-tier={tier}
      href={`${BASE.replace(/\/$/, '')}/licenses/?tier=${tier}`}
      title={title}
    >
      {license}
    </a>
  );
}
