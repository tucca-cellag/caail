import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CAAIL_PAGES } from './caail-pages.ts';

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
    // Evaluation, migrated there when the eval column was retired). This is a
    // ground-truth contract, not a derived value — it is meant to fail when the
    // page set changes, so update it deliberately with the reason rather than
    // relaxing it to `toBeGreaterThan`.
    expect(all.length).toBe(57);
    const cow = all.find((p) => p.id === 'datasets/cow');
    expect(cow).toMatchObject({ id: 'datasets/cow', group: 'datasets' });
    expect(typeof cow?.sidebarLabel).toBe('string');
    expect(typeof cow?.order).toBe('number');
  });
  it('has an entry for every rendered ResearchAreas, Methods and Datasets page (no missing map entries)', () => {
    const ra = readdirSync(`${REPO_ROOT}ResearchAreas`).filter((f) => f.endsWith('.md') && f !== 'CLAUDE.md');
    const me = readdirSync(`${REPO_ROOT}Methods`).filter((f) => f.endsWith('.md') && f !== 'CLAUDE.md');
    const ds = readdirSync(`${REPO_ROOT}Datasets`).filter((f) => f.endsWith('.md') && !['CLAUDE.md', 'README.md'].includes(f));
    const missing = CAAIL_PAGES.missingEntries({ ResearchAreas: ra, Methods: me, Datasets: ds });
    expect(missing).toEqual([]);
  });
  it('has a backing file for every ResearchAreas, Methods and Datasets entry (no orphan map entries)', () => {
    // The mirror of the test above, and covered by neither it nor the all() count.
    // missingEntries() only walks files -> map, so DELETING or RENAMING a page while
    // its entry stays leaves every remaining file mapped and the count still 57: the
    // suite passes while groupItems() in astro.config.mjs goes on emitting a sidebar
    // link, which is a 404 on every page of the site. (An *added* orphan entry is
    // caught, by the count going to 58 - that is the case this does not duplicate.)
    //
    // README.md is included here, unlike in the test above, because Datasets/README.md
    // backs the real `datasets/readme` route; excluding it would report a false orphan.
    const idsFrom = (dir: string) =>
      readdirSync(`${REPO_ROOT}${dir}`)
        .filter((f) => f.endsWith('.md') && f !== 'CLAUDE.md')
        .map((f) => CAAIL_PAGES.idForSourcePath(`${dir}/${f}`));
    const backed = new Set([...idsFrom('ResearchAreas'), ...idsFrom('Methods'), ...idsFrom('Datasets')]);
    const orphans = CAAIL_PAGES.all()
      .filter((p) => p.group === 'research-areas' || p.group === 'methods' || p.group === 'datasets')
      .map((p) => p.id)
      .filter((id) => !backed.has(id));
    expect(orphans).toEqual([]);
  });
});
