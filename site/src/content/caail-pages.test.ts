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
  });
  it('returns title + sidebar metadata by id', () => {
    expect(CAAIL_PAGES.byId('research-areas/bioprocess')?.title).toBe('Bioprocess control');
    expect(CAAIL_PAGES.byId('datasets/cow')?.title).toContain('Cow');
  });
  it('has an entry for every rendered ResearchAreas and Datasets page (no missing map entries)', () => {
    const ra = readdirSync(`${REPO_ROOT}ResearchAreas`).filter((f) => f.endsWith('.md') && f !== 'CLAUDE.md');
    const ds = readdirSync(`${REPO_ROOT}Datasets`).filter((f) => f.endsWith('.md') && !['CLAUDE.md', 'README.md'].includes(f));
    const missing = CAAIL_PAGES.missingEntries({ ResearchAreas: ra, Datasets: ds });
    expect(missing).toEqual([]);
  });
});
