/**
 * authors.test.ts: the rules that decide whether two same-key authorships are one person.
 * The graph-level behaviour (which edges survive) is pinned in graph.test.ts.
 */

import { describe, it, expect } from 'vitest';

import {
  authorKey,
  authorshipsFor,
  compareAuthorships,
  differentPeopleCheck,
  foldName,
  givenCore,
  uncachedDois,
  type AuthorCache,
  type Authorship,
} from './authors.js';

const person = (given: string | null, family: string | null, orcid: string | null = null): Authorship => ({
  given,
  family,
  orcid,
});

describe('foldName and givenCore', () => {
  it('folds accents and case, and maps Latin letters Unicode does not decompose', () => {
    expect(foldName('Ávila')).toBe('avila');
    expect(foldName('Łukasz Ørsted')).toBe('lukasz orsted');
  });

  it('drops initials and separators, keeping what tells people apart', () => {
    expect(givenCore('Yusuf H.')).toBe('yusuf');
    expect(givenCore('Ji-Hoe')).toBe('jihoe');
    expect(givenCore('Dong‐Yup')).toBe('dongyup'); // U+2010 hyphen, as one deposit spells it
    expect(givenCore('Xiao Ming')).toBe(givenCore('Xiaoming'));
  });

  it('is empty when there is nothing to compare', () => {
    expect(givenCore(null)).toBe('');
    expect(givenCore('S.')).toBe('');
    expect(givenCore('J. W.')).toBe('');
    // Someone who goes by a middle name may appear elsewhere under the first.
    expect(givenCore('J. Craig')).toBe('');
  });
});

describe('compareAuthorships', () => {
  it('different full given names are different people (ref 49 vs the FarmGTEx papers)', () => {
    expect(compareAuthorships(person('Sherry', 'Liu'), person('Shuli', 'Liu'))).toBe('different');
  });

  it('a matching ORCID is the same person, whatever the names say', () => {
    const orcid = '0000-0002-1825-0097';
    expect(compareAuthorships(person('Bob', 'Smith', orcid), person('Robert', 'Smith', orcid))).toBe('same');
  });

  it('different ORCIDs on one full name are not evidence (Kexin Huang on refs 49 and 123)', () => {
    expect(
      compareAuthorships(
        person('Kexin', 'Huang', '0009-0000-1753-8681'),
        person('Kexin', 'Huang', '0000-0001-6693-8390'),
      ),
    ).toBe('same');
  });

  it('a name that is a prefix of the other agrees, so short forms and middle names do not split', () => {
    expect(compareAuthorships(person('Ana', 'Lopez'), person('Ana Maria', 'Lopez'))).toBe('same');
    expect(compareAuthorships(person('Chris', 'Lee'), person('Christopher', 'Lee'))).toBe('same');
  });

  it('a name whose parts all appear in the other agrees, so going by a second name does not split', () => {
    expect(compareAuthorships(person('Maria', 'Lopez'), person('Ana Maria', 'Lopez'))).toBe('same');
    expect(compareAuthorships(person('Maria', 'Lopez'), person('Ana-Maria', 'Lopez'))).toBe('same');
  });

  it('long names one letter apart are unknown, since a spelling variant is as likely as a new person', () => {
    expect(compareAuthorships(person('Mohamed', 'Ali'), person('Mohammed', 'Ali'))).toBe('unknown');
    expect(compareAuthorships(person('Sergey', 'Ivanov'), person('Sergei', 'Ivanov'))).toBe('unknown');
    expect(compareAuthorships(person('Jielong', 'Yang'), person('Jilong', 'Yang'))).toBe('unknown');
  });

  it('short names one letter apart stay different people: they are usually different names', () => {
    expect(compareAuthorships(person('Ying', 'Xu'), person('Yong', 'Xu'))).toBe('different');
    expect(compareAuthorships(person('Jie', 'Wang'), person('Jin', 'Wang'))).toBe('different');
  });

  it('a nickname that is not a prefix reads as different people without a shared ORCID (known gap)', () => {
    expect(compareAuthorships(person('Mike', 'Smith'), person('Michael', 'Smith'))).toBe('different');
    const orcid = '0000-0002-1825-0097';
    expect(compareAuthorships(person('Mike', 'Smith', orcid), person('Michael', 'Smith', orcid))).toBe('same');
  });

  it('initials only, or no given name, is unknown', () => {
    expect(compareAuthorships(person('S.', 'Liu'), person('Shuli', 'Liu'))).toBe('unknown');
    expect(compareAuthorships(person(null, 'Liu'), person('Shuli', 'Liu'))).toBe('unknown');
  });
});

describe('authorshipsFor', () => {
  const authors = [
    person('Mengdi', 'Wang'),
    person('Shuli', 'Liu'),
    person('Kevin', 'D’Mellow'),
    person('Ángel B.', 'Ávila'),
    person('Łukasz', 'Smoliński'),
    person('Ehecatl Antonio', 'del Rio Chanona'),
    person(null, null),
  ];
  const givenFor = (citation: string) => authorshipsFor(authors, authorKey(citation)!).map((a) => a.given);

  it('finds the authorship with the citation’s surname and first initial', () => {
    expect(givenFor('Liu, S.')).toEqual(['Shuli']);
    expect(givenFor('D’Mellow, K.')).toEqual(['Kevin']);
  });

  it('resolves accented citations through authorKey itself, initials and surnames alike', () => {
    expect(givenFor('Ávila, Á. B.')).toEqual(['Ángel B.']);
    expect(givenFor('Avila, A.')).toEqual(['Ángel B.']);
    expect(givenFor('Smoliński, Ł.')).toEqual(['Łukasz']);
    expect(givenFor('del Rio‐Chanona, E. A.')).toEqual(['Ehecatl Antonio']);
  });

  it('matches on the surname alone when the citation gives no initial', () => {
    expect(givenFor('Wang')).toEqual(['Mengdi']);
  });

  it('is empty when the initial differs or nobody matches', () => {
    expect(givenFor('Liu, X.')).toEqual([]);
    expect(givenFor('Zhang, J.')).toEqual([]);
  });

  it('returns every authorship that carries the key', () => {
    const twoWangs = [person('Mengdi', 'Wang'), person('Mingxun', 'Wang')];
    expect(authorshipsFor(twoWangs, 'wang|m').map((a) => a.given)).toEqual(['Mengdi', 'Mingxun']);
  });
});

describe('differentPeopleCheck', () => {
  const cache: AuthorCache = {
    generatedAt: '2026-10-20T00:00:00.000Z',
    works: {
      '10.1/a': { source: 'crossref', authors: [person('Sherry', 'Liu')] },
      '10.1/b': { source: 'crossref', authors: [person('Shuli', 'Liu')] },
      '10.1/c': { source: 'datacite', authors: [person('Shuli', 'Liu')] },
      '10.1/two': { source: 'crossref', authors: [person('Shuli', 'Liu'), person('Shan', 'Liu')] },
      '10.1/other-two': { source: 'crossref', authors: [person('Sherry', 'Liu'), person('Siyu', 'Liu')] },
    },
  };
  const refs = [
    { id: 1, doi: 'https://doi.org/10.1/A' }, // URL form and upper case still key to 10.1/a
    { id: 2, doi: '10.1/b' },
    { id: 3, doi: '10.1/c' },
    { id: 4, doi: '10.1/not-cached' },
    { id: 5, doi: null },
    { id: 6, doi: '10.1/two' },
    { id: 7, doi: '10.1/other-two' },
  ];
  const differ = differentPeopleCheck(cache, refs);

  it('is true only when both papers name different people under the key', () => {
    expect(differ(1, 2, 'liu|s')).toBe(true);
    expect(differ(2, 3, 'liu|s')).toBe(false);
  });

  it('with several authorships under the key, splits only when every one differs from every one', () => {
    expect(differ(1, 6, 'liu|s')).toBe(true); // Sherry against Shuli and Shan
    expect(differ(2, 6, 'liu|s')).toBe(false); // Shuli is on both
    expect(differ(6, 7, 'liu|s')).toBe(true); // {Shuli, Shan} against {Sherry, Siyu}
  });

  it('is false when either paper has no record, so the join stands', () => {
    expect(differ(1, 4, 'liu|s')).toBe(false);
    expect(differ(1, 5, 'liu|s')).toBe(false);
  });

  it('uncachedDois lists the papers that fall back to names only', () => {
    expect(uncachedDois(cache, refs)).toEqual(['10.1/not-cached']);
    expect(uncachedDois(null, refs)).toEqual(['10.1/a', '10.1/b', '10.1/c', '10.1/not-cached', '10.1/other-two', '10.1/two']);
  });
});
