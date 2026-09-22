/** @jsxImportSource preact */
import './catalog-browser.css';
import './field-reports.css';
import TopicChips from './TopicChips';
import { reportGroups, editionAnchor } from '../lib/report-groups';

/**
 * FieldReports — the field-report card page (FieldReports.md → reports.json).
 *
 * A first-class, series-aware view of the recurring institutional state-of-field
 * surveys that track cellular agriculture and alternative proteins as a sector.
 * Mirrors the AwesomeLists / CatalogBrowser card pattern: one `<section>` per
 * series with a shared-slug heading id (so the right-rail TOC anchors match),
 * and one card per edition.
 *
 * The whole point of the model is recency: within a series the current edition
 * leads with a "Current" badge, and every superseded edition carries a badge
 * linking to the current one — so no reader (human or agent) recommends from a
 * stale report. `current`/`supersededBy` are derived at parse, never stored, so
 * next year's edition self-demotes this one. The page is fully server-rendered,
 * so it works with JavaScript disabled.
 */
export default function FieldReports() {
  const groups = reportGroups();
  const total = groups.reduce((n, g) => n + g.editions.length, 0);

  return (
    <div class="cb">
      <p class="cb-count" role="status">
        {total} report{total === 1 ? '' : 's'} across {groups.length} series
      </p>

      {groups.map((g) => (
        <section class="cb-grp" key={g.slug}>
          <h2 class="cb-grp-h caail-display" id={g.slug}>{g.label}</h2>
          <div class="cb-grid">
            {g.editions.map((r) => {
              // Resolve the successor edition once, so the badge's link text and
              // its href come from the SAME record and can never disagree (even
              // if supersededBy ever points at the immediate successor rather
              // than the current edition).
              const successor = r.supersededBy
                ? g.editions.find((e) => e.id === r.supersededBy)
                : undefined;
              return (
                <article class="cb-card" id={editionAnchor(r.id)} key={r.id}>
                  <h3 class="cb-name">
                    {r.url ? (
                      <a
                        class="cb-name-link"
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {r.title}
                        <span class="cb-ext" aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <span class="cb-name-link">{r.title}</span>
                    )}
                  </h3>
                  <p class="fr-meta">
                    <span class="fr-edition">{r.editionLabel} edition</span>
                    {r.current ? (
                      <span class="fr-badge fr-current">Current</span>
                    ) : (
                      <span class="fr-badge fr-superseded">
                        Superseded
                        {successor && (
                          <>
                            {' · '}
                            <a class="fr-super-link" href={`#${editionAnchor(successor.id)}`}>
                              see {successor.editionLabel}
                            </a>
                          </>
                        )}
                      </span>
                    )}
                  </p>
                  <TopicChips topics={r.topics} />
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
