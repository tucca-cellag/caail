/** @jsxImportSource preact */
/**
 * ReportLink — the per-card "report an issue with this entry" affordance.
 *
 * It carries the entry's frozen item id to /report/, which is the whole reason the
 * control exists: a correction naming `paper:214` points at one row, where a correction
 * naming "one of the scaffolding papers" is a search before it is a fix.
 *
 * The link goes to CAAIL's own report page rather than straight to GitHub, so a reader
 * without a GitHub account meets the alternatives instead of a sign-in wall. It renders
 * nothing when the id is missing, so an entry the DB does not know about cannot produce
 * an unanchored report (the parser fails the build on that case anyway).
 *
 * Presentational; styling is in ../styles/report-link.css (global, so the raw-HTML
 * dataset-card twin emitted by the dataset-cards remark shares it).
 */
import { isItemId, reportHref } from '../lib/report';

const BASE = import.meta.env.BASE_URL;

export default function ReportLink({ itemId, label }: { itemId: string | null; label: string }) {
  // Gated on the grammar, not merely on presence, so this agrees with its raw-HTML twin
  // in dataset-cards.ts. A malformed id would be harmless here (Preact escapes the
  // attribute, reportHref encodes it) but it would render a wrong link on catalog cards
  // while vanishing on dataset cards, and a rule that holds on one surface and not the
  // other is the kind of divergence nothing would catch.
  if (!isItemId(itemId)) return null;
  return (
    <a
      class="report-link"
      href={reportHref(BASE, itemId)}
      // The visible text repeats on every card, so the accessible name names the entry.
      // It opens with the visible string, which is what WCAG's label-in-name requires.
      aria-label={`Report an issue with ${label}`}
      title={`Report an issue with this entry (${itemId})`}
      // Chrome, not content. Without this the phrase enters the Pagefind index 139 times
      // on /software/ alone, so the page would rank for "report" and "issue" on a control
      // that repeats per card rather than on anything it is actually about.
      data-pagefind-ignore
    >
      Report an issue
    </a>
  );
}
