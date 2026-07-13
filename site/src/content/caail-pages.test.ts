import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CAAIL_PAGES } from './caail-pages.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('CAAIL_PAGES', () => {
  it('maps a known source path to a route id', () => {
    expect(CAAIL_PAGES.idForSourcePath('ResearchAreas/Bioprocess')).toBe('research-areas/bioprocess');
    expect(CAAIL_PAGES.idForSourcePath('Datasets/Cow')).toBe('datasets/cow');
    expect(CAAIL_PAGES.idForSourcePath('CONTRIBUTING')).toBe('contributing');
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
    expect(CAAIL_PAGES.byId('datasets/cow')?.title).toContain('Cow');
    expect(CAAIL_PAGES.byId('other-resources')).toMatchObject({ group: 'top', title: 'Other Resources' });
    expect(CAAIL_PAGES.byId('ai-agents-foundation-models')).toMatchObject({ group: 'top', title: 'AI Agents & Foundation Models' });
    expect(CAAIL_PAGES.byId('reference-works')).toMatchObject({ group: 'top', title: 'Reference Works' });
    expect(CAAIL_PAGES.byId('funding')).toMatchObject({ group: 'top', title: 'Funding & Grants' });
  });
  it('all() returns {id,...meta} objects', () => {
    const all = CAAIL_PAGES.all();
    expect(all.length).toBe(30);
    const cow = all.find((p) => p.id === 'datasets/cow');
    expect(cow).toMatchObject({ id: 'datasets/cow', group: 'datasets' });
    expect(typeof cow?.sidebarLabel).toBe('string');
    expect(typeof cow?.order).toBe('number');
  });
  it('has an entry for every rendered ResearchAreas and Datasets page (no missing map entries)', () => {
    const ra = readdirSync(`${REPO_ROOT}ResearchAreas`).filter((f) => f.endsWith('.md') && f !== 'CLAUDE.md');
    const ds = readdirSync(`${REPO_ROOT}Datasets`).filter((f) => f.endsWith('.md') && !['CLAUDE.md', 'README.md'].includes(f));
    const missing = CAAIL_PAGES.missingEntries({ ResearchAreas: ra, Datasets: ds });
    expect(missing).toEqual([]);
  });
});
