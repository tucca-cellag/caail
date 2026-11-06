import { describe, it, expect } from 'vitest';
import { bareDoi, doiRelation, DATA_REPOSITORY_REGISTRANTS, DOI_SHAPE } from './doi-relation.js';

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

  it('knows the data hosts whose DOIs are deposits', () => {
    expect(doiRelation('10.57967/hf/1234')).toBe('own');
    expect(doiRelation('10.34740/kaggle/dsv/123')).toBe('own');
    expect(doiRelation('10.7303/syn12345')).toBe('own');
    expect(doiRelation('10.24433/CO.1234567.v1')).toBe('own');
  });

  it('still classifies a DOI stored with a prefix doiKey would leave behind', () => {
    expect(doiRelation('doi.org/10.5281/zenodo.1')).toBe('own');
    expect(doiRelation('https://www.doi.org/10.5281/zenodo.1')).toBe('own');
    expect(doiRelation('DOI: 10.1038/s41586-021-03819-2')).toBe('publication');
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

describe('bareDoi', () => {
  it('reduces every common written form to one bare lowercase DOI', () => {
    for (const v of [
      '10.7910/DVN/XNFVTS',
      'https://doi.org/10.7910/DVN/XNFVTS',
      'http://dx.doi.org/10.7910/DVN/XNFVTS',
      'https://www.doi.org/10.7910/DVN/XNFVTS',
      'doi.org/10.7910/DVN/XNFVTS',
      'doi:10.7910/DVN/XNFVTS',
      'DOI: 10.7910/DVN/XNFVTS',
    ]) expect(bareDoi(v), v).toBe('10.7910/dvn/xnfvts');
  });

  it('does not percent-decode, so a stored DOI and its citation key stay identical', () => {
    expect(bareDoi('doi%3A10.7910%2FDVN%2FXNFVTS')).toBeNull();
  });

  it('reduces a nested doi: and resolver prefix in either order', () => {
    expect(bareDoi('doi:https://doi.org/10.5281/zenodo.1')).toBe('10.5281/zenodo.1');
    expect(doiRelation('doi:https://doi.org/10.5281/zenodo.1')).toBe('own');
  });

  it('exports the one DOI shape db:check also validates with', () => {
    expect(DOI_SHAPE.test('10.1000.1/abc')).toBe(true);
    expect(DOI_SHAPE.test('10.5281/zenodo.1')).toBe(true);
    expect(DOI_SHAPE.test('10.1/x')).toBe(false);
    expect(DOI_SHAPE.test('https://doi.org/10.5281/zenodo.1')).toBe(false);
  });

  it('accepts a registrant with dotted subdivisions', () => {
    expect(bareDoi('10.1000.1/ABC')).toBe('10.1000.1/abc');
    expect(doiRelation('10.1000.1/abc')).toBe('publication');
  });

  it('keeps parentheses inside a DOI', () => {
    expect(bareDoi('https://doi.org/10.1016/S0092-8674(20)30001-1')).toBe('10.1016/s0092-8674(20)30001-1');
  });

  it('rejects what is not a DOI', () => {
    expect(bareDoi('https://github.com/a/b')).toBeNull();
    expect(bareDoi('10.1/x')).toBeNull();
    expect(bareDoi('')).toBeNull();
    expect(bareDoi(null)).toBeNull();
  });
});
