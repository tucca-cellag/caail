/** @jsxImportSource preact */
/**
 * HubFilterBar — the active secondary filters on a hub drill-down view.
 *
 * Shows one chip per narrowing axis with a clear control, plus the resulting count.
 * Rendered only when a secondary filter is actually applied, so an ordinary
 * single-axis view looks exactly as it did before.
 *
 * The chips are links, not buttons: each hub is a static page routed entirely by query
 * string, so clearing a filter is a navigation. That keeps the whole state shareable and
 * back-button-correct with no client-side history handling.
 */
import '../styles/hub-filters.css';
import {
  hubUrl,
  topicLabel,
  tierLabel,
  bandLabel,
  type Secondary,
} from '../lib/hub-filters';

interface Props {
  /** BASE_URL, e.g. "/caail/" */
  base: string;
  /** Hub route segment: "licenses" | "citations" | "topics" */
  path: string;
  /** Parsed params; the hub's own primary axis should be omitted before passing in. */
  active: Partial<Secondary>;
  /** How many items survived the filters. */
  count: number;
  /** Population being narrowed, e.g. "resources at this tier". */
  noun: string;
}

export default function HubFilterBar({ base, path, active, count, noun }: Props) {
  const chips: { key: 't' | 'tier' | 'band'; label: string }[] = [];
  if (active.t) chips.push({ key: 't', label: topicLabel(active.t) });
  if (active.tier) chips.push({ key: 'tier', label: tierLabel(active.tier) });
  if (active.band) chips.push({ key: 'band', label: bandLabel(active.band) });
  if (chips.length === 0) return null;

  return (
    <div class="hf-bar" role="status">
      <span class="hf-lead">
        {count} {noun}
        {count === 0 ? ' match' : ''} also in
      </span>
      {chips.map((c) => (
        <span class="hf-chip" key={c.key}>
          {c.label}
          <a
            class="hf-clear"
            href={hubUrl(base, path, { [c.key]: null })}
            aria-label={`Remove the ${c.label} filter`}
          >
            ×
          </a>
        </span>
      ))}
      {chips.length > 1 && (
        // Clear only the axes actually shown as chips. Clearing all three would also drop
        // the hub's OWN primary axis (each hub omits it from `active`), navigating the
        // reader off the drill-down back to the index — a different outcome from clicking
        // each chip's x, which reads as the same action.
        <a
          class="hf-clear-all"
          href={hubUrl(base, path, Object.fromEntries(chips.map((c) => [c.key, null])))}
        >
          Clear all
        </a>
      )}
    </div>
  );
}
