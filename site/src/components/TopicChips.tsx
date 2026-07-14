/**
 * TopicChips — the fine-tag/theme chips shown on a card, colored by theme and linking
 * to the topic hub. Presentational; all logic is in ../lib/topic-chips.ts.
 */
import { chipProps, type TopicRef } from '../lib/topic-chips';
import '../styles/topic-chips.css';

export default function TopicChips({
  topics,
  base = import.meta.env.BASE_URL,
}: {
  topics: TopicRef[];
  base?: string;
}) {
  const chips = chipProps(base, topics);
  if (chips.length === 0) return null;
  return (
    <ul class="topic-chips" aria-label="Topics">
      {chips.map((c) => (
        <li key={c.slug}>
          <a class="topic-chip" data-theme={c.theme} href={c.href}>
            {c.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
