import { describe, it, expect } from 'vitest';
import { doiRelation, DATA_REPOSITORY_REGISTRANTS } from './doi-relation.js';

describe('doiRelation', () => {
  it('marks a data-repository DOI as the item\'s own', () => {
    expect(doiRelation('10.5281/zenodo.19339684')).toBe('own');
    expect(doiRelation('10.6084/m9.figshare.29551862')).toBe('own');
    expect(doiRelation('10.17632/cp2hdhkys3.6')).toBe('own');
    expect(doiRelation('10.7910/DVN/XNFVTS')).toBe('own');
  });

  it('marks a journal or preprint DOI as the describing publication', () => {
    expect(doiRelation('10.3390/foods12020344')).toBe('publication');
    expect(doiRelation('10.1038/s41586-021-03819-2')).toBe('publication');
    expect(doiRelation('10.1101/2024.12.09.627468')).toBe('publication');
  });

  it('reads the registrant whatever form the DOI arrives in', () => {
    expect(doiRelation('https://doi.org/10.5281/zenodo.1')).toBe('own');
    expect(doiRelation('doi:10.5281/zenodo.1')).toBe('own');
    expect(doiRelation('  10.5281/ZENODO.1 ')).toBe('own');
  });

  it('does not take a registrant that merely starts with a repository prefix', () => {
    // 10.52810 is a different registrant from 10.5281; a prefix match would misfile it.
    expect(doiRelation('10.52810/example.1')).toBe('publication');
  });

  it('returns null when there is no DOI', () => {
    expect(doiRelation(null)).toBeNull();
    expect(doiRelation(undefined)).toBeNull();
    expect(doiRelation('')).toBeNull();
    expect(doiRelation('not a doi')).toBeNull();
  });

  it('keeps every registrant in the 10.NNNN form', () => {
    for (const r of DATA_REPOSITORY_REGISTRANTS.keys()) expect(r).toMatch(/^10\.\d{4,9}$/);
  });
});
