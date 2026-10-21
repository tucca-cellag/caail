/**
 * authors.test.ts: the rules that decide whether two same-key authorships are one person.
 * The graph-level behaviour (which edges survive) is pinned in graph.test.ts.
 */

import { describe, it, expect } from 'vitest';

import {
  authorKey,
  authorKeys,
  authorshipsFor,
  compareAuthorships,
  differentPeopleCheck,
  foldName,
  givenCore,
  givenParts,
  initialsOf,
  uncachedDois,
  unnamedDois,
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

  it('spells ß, æ, œ and þ the way ASCII does', () => {
    expect(authorKey('Strauß, J.')).toBe(authorKey('Strauss, J.'));
    expect(authorKey('Sæther, B.')).toBe(authorKey('Saether, B.'));
    expect(authorKey('Hafþórsson, K.')).toBe(authorKey('Hafthorsson, K.'));
  });

  it('keys a surname with an umlaut under both of its ASCII spellings, and nothing else twice', () => {
    expect(authorKeys('Müller, X.')).toEqual(['muller|x', 'mueller|x']);
    expect(authorKeys('Muller, X.')).toEqual(['muller|x']);
    expect(authorKeys('Mueller, X.')).toEqual(['mueller|x']);
    // The variant comes from the umlaut only: "Xue" is not rewritten towards "Xu".
    expect(authorKeys('Xue, Y.')).toEqual(['xue|y']);
    expect(authorKeys('Xu, Y.')).toEqual(['xu|y']);
  });

  it('reads two or three capitals as initials, not a name ("JP" is J. P.)', () => {
    expect(givenParts('JP')).toEqual([]);
    expect(givenParts('DE')).toEqual([]);
    expect(initialsOf('JP')).toEqual(['j', 'p']);
    expect(compareAuthorships(person('JP', 'Heimonen'), person('Juha-Pekka', 'Heimonen'))).toBe('unknown');
    expect(givenParts('Li')).toEqual(['li']); // a two-letter name in ordinary case is still a name
  });

  it('initialsOf abbreviates given names and reads citation initials alike', () => {
    expect(initialsOf('Jong Woo')).toEqual(['j', 'w']);
    expect(initialsOf('Ji-Hoe')).toEqual(['j', 'h']);
    expect(initialsOf(' J. W.')).toEqual(['j', 'w']);
    expect(initialsOf('Jaehyun')).toEqual(['j']);
    expect(initialsOf(null)).toEqual([]);
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
  const givenFor = (citation: string) => authorshipsFor(authors, authorKeys(citation)).map((a) => a.given);

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
    expect(authorshipsFor(twoWangs, ['wang|m']).map((a) => a.given)).toEqual(['Mengdi', 'Mingxun']);
  });

  it('with second initials, keeps only the authorships that carry one of them', () => {
    const kims = [person('Jaehyun', 'Kim'), person('Juyeon', 'Kim'), person('Jong Woo', 'Kim')];
    expect(authorshipsFor(kims, ['kim|j'], new Set(['w'])).map((a) => a.given)).toEqual(['Jong Woo']);
    expect(authorshipsFor(kims.slice(0, 2), ['kim|j'], new Set(['w']))).toEqual([]);
  });

  it('matches an umlaut surname from either ASCII spelling in the citation', () => {
    const muller = [person('Xaver', 'Müller')];
    expect(authorshipsFor(muller, authorKeys('Mueller, X.')).map((a) => a.given)).toEqual(['Xaver']);
    expect(authorshipsFor(muller, authorKeys('Muller, X.')).map((a) => a.given)).toEqual(['Xaver']);
  });

  it('finds a record spelled "Mueller" from a citation with the umlaut', () => {
    expect(authorshipsFor([person('Xaver', 'Mueller')], authorKeys('Müller, X.')).map((a) => a.given)).toEqual(['Xaver']);
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

  it('a citation with a second initial cannot be stood in for by a same-key co-author', () => {
    const kimCache: AuthorCache = {
      generatedAt: '2026-10-20T00:00:00.000Z',
      works: {
        '10.1/k1': { source: 'crossref', authors: [person('Jaehyun', 'Kim'), person('Juyeon', 'Kim')] },
        '10.1/k2': { source: 'crossref', authors: [person('Jong Woo', 'Kim')] },
      },
    };
    // Paper 1 cites "Kim, J. W." but its record spells that person in a way the key misses;
    // its co-authors Jaehyun and Juyeon must not decide the split.
    const withSecond = differentPeopleCheck(kimCache, [
      { id: 1, doi: '10.1/k1', authors: ['Kim, J. W.'] },
      { id: 2, doi: '10.1/k2', authors: ['Kim, J. W.'] },
    ]);
    expect(withSecond(1, 2, 'kim|j')).toBe(false);
    // Cited with one initial, both co-authors are fair candidates, and both differ from Jong Woo.
    const oneInitial = differentPeopleCheck(kimCache, [
      { id: 1, doi: '10.1/k1', authors: ['Kim, J.'] },
      { id: 2, doi: '10.1/k2', authors: ['Kim, J. W.'] },
    ]);
    expect(oneInitial(1, 2, 'kim|j')).toBe(true);
  });

  it('is false when either paper has no record, so the join stands', () => {
    expect(differ(1, 4, 'liu|s')).toBe(false);
    expect(differ(1, 5, 'liu|s')).toBe(false);
  });

  it('unnamedDois lists records that name no one, which a fetch cannot fix', () => {
    const withNone: AuthorCache = {
      ...cache,
      works: { ...cache.works, '10.1/none': { source: 'none', authors: [] }, '10.1/org': { source: 'crossref', authors: [] } },
    };
    const extra = [...refs, { id: 8, doi: '10.1/none' }, { id: 9, doi: '10.1/org' }];
    expect(unnamedDois(withNone, extra)).toEqual(['10.1/none', '10.1/org']);
    expect(uncachedDois(withNone, extra)).not.toContain('10.1/none');
  });

  it('uncachedDois lists the papers that fall back to names only', () => {
    expect(uncachedDois(cache, refs)).toEqual(['10.1/not-cached']);
    expect(uncachedDois(null, refs)).toEqual(['10.1/a', '10.1/b', '10.1/c', '10.1/not-cached', '10.1/other-two', '10.1/two']);
  });
});
