import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CAAIL_PAGES } from './caail-pages.ts';
import { CANONICAL_SOURCES } from './canonical-sources.ts';
import { isPublishedMarkdown } from '../lib/canonical-files.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('CAAIL_PAGES', () => {
  it('maps a known source path to a route id', () => {
    expect(CAAIL_PAGES.idForSourcePath('ResearchAreas/Bioprocess')).toBe('research-areas/bioprocess');
    // Methods/ is the row axis, ResearchAreas/ the column axis. Its dir slug is
    // the plain lowercase of the directory, so it needs no DIR_SLUG special case.
    expect(CAAIL_PAGES.idForSourcePath('Methods/BenchmarksEvaluation')).toBe('methods/benchmarksevaluation');
    expect(CAAIL_PAGES.idForSourcePath('Methods/BenchmarksEvaluation.md')).toBe('methods/benchmarksevaluation');
    expect(CAAIL_PAGES.idForSourcePath('Datasets/Cow')).toBe('datasets/cow');
    expect(CAAIL_PAGES.idForSourcePath('CONTRIBUTING')).toBe('contributing');
    // Single-word top-level file: falls through to plain lowercasing, no
    // hyphenation special case needed (unlike OtherResources / ReferenceWorks).
    expect(CAAIL_PAGES.idForSourcePath('Community.md')).toBe('community');
    // multi-word top-level file gets an explicit hyphenated id (not "otherresources")
    expect(CAAIL_PAGES.idForSourcePath('OtherResources')).toBe('other-resources');
    expect(CAAIL_PAGES.idForSourcePath('OtherResources.md')).toBe('other-resources');
    expect(CAAIL_PAGES.idForSourcePath('AIAgentsFoundationModels')).toBe('ai-agents-foundation-models');
    expect(CAAIL_PAGES.idForSourcePath('AIAgentsFoundationModels.md')).toBe('ai-agents-foundation-models');
    // ReferenceWorks needs an explicit hyphenated id (default lowercasing → "referenceworks")
    expect(CAAIL_PAGES.idForSourcePath('ReferenceWorks')).toBe('reference-works');
    expect(CAAIL_PAGES.idForSourcePath('ReferenceWorks.md')).toBe('reference-works');
    // single-word top-level files lowercase cleanly
    expect(CAAIL_PAGES.idForSourcePath('Funding')).toBe('funding');
  });
  it('returns title + sidebar metadata by id', () => {
    expect(CAAIL_PAGES.byId('research-areas/bioprocess')?.title).toBe('Bioprocess & Scale-Up');
    expect(CAAIL_PAGES.byId('methods/benchmarksevaluation')).toMatchObject({
      group: 'methods',
      title: 'Benchmarks & Evaluation Frameworks',
    });
    expect(CAAIL_PAGES.byId('datasets/cow')?.title).toContain('Cow');
    expect(CAAIL_PAGES.byId('other-resources')).toMatchObject({ group: 'top', title: 'Other Resources' });
    expect(CAAIL_PAGES.byId('ai-agents-foundation-models')).toMatchObject({ group: 'top', title: 'AI Agents & Foundation Models' });
    expect(CAAIL_PAGES.byId('reference-works')).toMatchObject({ group: 'top', title: 'Reference Works' });
    expect(CAAIL_PAGES.byId('funding')).toMatchObject({ group: 'top', title: 'Funding & Grants' });
    expect(CAAIL_PAGES.byId('community')).toMatchObject({ group: 'top', title: 'Community' });
  });
  it('all() returns {id,...meta} objects', () => {
    const all = CAAIL_PAGES.all();
    // 33 → 57: CAAIL-266 filled in the Methods/ row axis, adding the 24 pages the
    // matrix's other rows were missing (the axis had held only Benchmarks &
    // Evaluation, migrated there when the eval column was retired).
    // 57 → 58: the 8th research area added ResearchAreas/FoodSafetyPrediction.md.
    // Only +1, not +2 — MetabolicModeling.md already existed as a deep dive for a
    // subject that was not yet a column.
    // This is a ground-truth contract, not a derived value — it is meant to fail when
    // the page set changes, so update it deliberately with the reason rather than
    // relaxing it to `toBeGreaterThan`.
    expect(all.length).toBe(58);
    const cow = all.find((p) => p.id === 'datasets/cow');
    expect(cow).toMatchObject({ id: 'datasets/cow', group: 'datasets' });
    expect(typeof cow?.sidebarLabel).toBe('string');
    expect(typeof cow?.order).toBe('number');
  });
  it('has an entry for every rendered ResearchAreas, Methods and Datasets page (no missing map entries)', () => {
    // isPublishedMarkdown, not a bare .md test: a `*.local.md` private
    // companion backs no route, so counting it here would report it
    // as an unregistered page and read as map drift.
    const ra = readdirSync(`${REPO_ROOT}ResearchAreas`).filter(isPublishedMarkdown);
    const me = readdirSync(`${REPO_ROOT}Methods`).filter(isPublishedMarkdown);
    const ds = readdirSync(`${REPO_ROOT}Datasets`).filter((f) => isPublishedMarkdown(f) && f !== 'README.md');
    const missing = CAAIL_PAGES.missingEntries({ ResearchAreas: ra, Methods: me, Datasets: ds });
    expect(missing).toEqual([]);
  });
  it('has a backing file for every ResearchAreas, Methods and Datasets entry (no orphan map entries)', () => {
    // The mirror of the test above, and covered by neither it nor the all() count.
    // missingEntries() only walks files -> map, so DELETING a page while its entry
    // stays leaves every remaining file mapped and the count still 58: the suite
    // passes while groupItems() in astro.config.mjs goes on emitting a sidebar link,
    // which is a 404 on every page of the site.
    //
    // Deletion is the ONLY uncovered case, and the two neighbours are why. A RENAME
    // is already caught by the sibling test above, because the renamed file has no
    // entry (verified: both fail on a rename). An ADDED orphan entry is caught by the
    // count going to 58. Do not widen this comment back out: the sibling test is not
    // redundant.
    //
    // README.md is included here, unlike in the test above, because Datasets/README.md
    // backs the real `datasets/readme` route; excluding it would report a false orphan.
    const idsFrom = (dir: string) =>
      readdirSync(`${REPO_ROOT}${dir}`)
        .filter(isPublishedMarkdown)
        .map((f) => CAAIL_PAGES.idForSourcePath(`${dir}/${f}`));
    const backed = new Set([...idsFrom('ResearchAreas'), ...idsFrom('Methods'), ...idsFrom('Datasets')]);
    const orphans = CAAIL_PAGES.all()
      .filter((p) => p.group === 'research-areas' || p.group === 'methods' || p.group === 'datasets')
      .map((p) => p.id)
      .filter((id) => !backed.has(id));
    expect(orphans).toEqual([]);
  });
});

/**
 * The top-level prose pages, which the three tests above do not reach.
 *
 * `missingEntries` and its mirror walk the canonical DIRECTORIES. A top-level
 * file has no directory to enumerate, so its name has to be written somewhere,
 * and every reader that wrote its own copy is a list that can drift from the
 * others. One already did: the site's loader carried all seven names while the
 * prototype branch's `<route>/index.md` endpoint carried six, and `/community/`
 * ended up the one page on the site with no Markdown twin, no Copy-as-Markdown
 * control, and nothing failing.
 *
 * `topLevelSources()` is now the single list and the loader derives from it, so
 * these are the checks that make the derivation trustworthy rather than a
 * comment asking for it.
 */
describe('top-level prose pages', () => {
  it('every top-level entry names a source file', () => {
    const nameless = CAAIL_PAGES.all()
      .filter((p) => p.group === 'top' && !p.source)
      .map((p) => p.id);
    expect(nameless).toEqual([]);
  });

  it("every source round-trips back to its own page's id", () => {
    // Catches a misspelling at its source rather than at the next reader: a
    // `source` that resolves to some other id (or to no page at all) would
    // otherwise just quietly ingest the wrong file.
    for (const page of CAAIL_PAGES.all().filter((p) => p.group === 'top')) {
      expect(CAAIL_PAGES.idForSourcePath(page.source!)).toBe(page.id);
    }
  });

  it('every source exists at the repo root', () => {
    const missing = CAAIL_PAGES.topLevelSources().filter((s) => !existsSync(`${REPO_ROOT}${s}`));
    expect(missing).toEqual([]);
  });

  it('the loader ingests every one of them', () => {
    // The live guard. `CANONICAL_SOURCES.files` is derived today, so this holds
    // by construction — which is the point: it fails the moment anyone replaces
    // the derivation with a literal that is short a page.
    expect(CAAIL_PAGES.missingTopLevelSources(CANONICAL_SOURCES.files)).toEqual([]);
  });

  it('reports the page the prototype branch actually dropped', () => {
    // The exact list `site/src/lib/prototype-page-md.ts` shipped on
    // prototype/caail-340-nav, which is where the divergence was found. Kept as
    // a case rather than a comment so the guard is shown discriminating: fed a
    // list that is short a page it names that page, and it named this one.
    //
    // `toContain`, NOT `toEqual`, because this list is FROZEN HISTORY while
    // `topLevelSources()` grows. An eighth top-level page is a correct and
    // unrelated change, and under an exact assertion it would fail here with a
    // message about a prototype branch's Markdown endpoint, sending the reader
    // somewhere with no bearing on what they did. Exactness is not lost; it
    // moves to the derived case below, which is the one that can carry it.
    const asPrototypeShippedIt = [
      'CONTRIBUTING.md',
      'OtherResources.md',
      'ReferenceWorks.md',
      'Funding.md',
      'Taxonomy.md',
      'AIAgentsFoundationModels.md',
    ];
    expect(CAAIL_PAGES.missingTopLevelSources(asPrototypeShippedIt)).toContain('Community.md');
  });

  it('names exactly the page a list is short, whatever the page set becomes', () => {
    // The exact half, derived so it survives the corpus growing. Dropping ONE
    // known entry must report that entry and nothing else.
    //
    // Not tautological, and the distinction is worth stating because the
    // obvious version IS. Asserting against
    // `topLevelSources().filter(s => !input.includes(s))` would restate the
    // implementation and test nothing. Here the input is built by REMOVING a
    // named element and the expectation is that single literal name, so the
    // two sides are derived differently.
    const all = CAAIL_PAGES.topLevelSources();
    const dropped = all[0];
    expect(CAAIL_PAGES.missingTopLevelSources(all.slice(1))).toEqual([dropped]);
  });

  it('counts every top-level page the repo root actually backs', () => {
    // The other direction, and the one a derived list can still get wrong: a
    // new top-level page registered in CAAIL_PAGES but filed under some other
    // group renders with no source and never reaches the loader. Deriving from
    // `group: 'top'` is what makes that possible, so it is what this checks.
    const ingested = new Set(CAAIL_PAGES.topLevelSources());
    const unreached = readdirSync(REPO_ROOT)
      .filter(isPublishedMarkdown)
      .filter((f) => CAAIL_PAGES.byId(CAAIL_PAGES.idForSourcePath(f)))
      .filter((f) => !ingested.has(f));
    expect(unreached).toEqual([]);
  });
});
