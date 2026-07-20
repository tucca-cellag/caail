import { describe, it, expect } from 'vitest';
import { PapersDataSchema, CountsSchema } from './types';

// ---------------------------------------------------------------------------
// Minimal valid fixtures
// ---------------------------------------------------------------------------

const validReference = {
  id: 1,
  section: 'References',
  raw: 'Smith, J. (2022). A great paper. *Nature*, 1(1), 1-10. https://doi.org/10.1234/abc',
  authors: ['Smith, J.'],
  authorsDropped: 0,
  authorsText: 'Smith, J.',
  year: 2022,
  title: 'A great paper',
  journal: 'Nature',
  doi: '10.1234/abc',
  codeUrl: null,
  dataUrl: null,
  isPrimary: true,
  methods: ['Bayesian Optimization'],
  areas: ['media'],
  hasCode: false,
  hasData: false,
  slug: 'smith-2022',
};

const validCell = {
  method: 'Bayesian Optimization',
  area: 'media',
  refIds: [1],
  labels: ['Smith et al. 2022'],
};

const validPapersData = {
  areas: [{ key: 'media', label: 'Media Optimization' }],
  methods: ['Bayesian Optimization'],
  cells: [validCell],
  references: [validReference],
};

const validCounts = {
  papers: 193,
  software: 70,
  databases: 71,
  species: 10,
  datasets: 120,
  researchAreas: 8,
  talks: 25,
};

// ---------------------------------------------------------------------------
// PapersData — happy paths
// ---------------------------------------------------------------------------

describe('PapersDataSchema — valid payloads', () => {
  it('parses a minimal valid PapersData payload', () => {
    const result = PapersDataSchema.safeParse(validPapersData);
    expect(result.success).toBe(true);
  });

  it('accepts null for authors (APA parse failed)', () => {
    const payload = {
      ...validPapersData,
      references: [{ ...validReference, authors: null }],
    };
    const result = PapersDataSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts null for doi, journal, title, year, codeUrl, dataUrl', () => {
    const payload = {
      ...validPapersData,
      references: [
        {
          ...validReference,
          doi: null,
          journal: null,
          title: null,
          year: null,
          codeUrl: null,
          dataUrl: null,
        },
      ],
    };
    const result = PapersDataSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts empty arrays for methods and areas on a reference', () => {
    const payload = {
      ...validPapersData,
      references: [{ ...validReference, methods: [], areas: [] }],
    };
    const result = PapersDataSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts areas array with only key+label (no color field required)', () => {
    const payload = {
      ...validPapersData,
      areas: [
        { key: 'media', label: 'Media Optimization' },
        { key: 'cell', label: 'Cellular Engineering' },
      ],
    };
    const result = PapersDataSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts a reference with a valid codeUrl', () => {
    const payload = {
      ...validPapersData,
      references: [
        { ...validReference, codeUrl: 'https://github.com/x/y', hasCode: true },
      ],
    };
    expect(PapersDataSchema.safeParse(payload).success).toBe(true);
  });

  it('accepts a reference with a valid dataUrl', () => {
    const payload = {
      ...validPapersData,
      references: [
        { ...validReference, dataUrl: 'https://zenodo.org/record/123', hasData: true },
      ],
    };
    expect(PapersDataSchema.safeParse(payload).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PapersData — rejection cases
// ---------------------------------------------------------------------------

describe('PapersDataSchema — invalid payloads are rejected', () => {
  it('rejects when year is a string', () => {
    const payload = {
      ...validPapersData,
      references: [{ ...validReference, year: '2022' }],
    };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when authorsText is null', () => {
    const payload = {
      ...validPapersData,
      references: [{ ...validReference, authorsText: null }],
    };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when authorsText is missing', () => {
    const { authorsText: _omit, ...refWithout } = validReference;
    const payload = { ...validPapersData, references: [refWithout] };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when refIds contains a non-number', () => {
    const payload = {
      ...validPapersData,
      cells: [{ ...validCell, refIds: ['1'] }],
    };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when a required top-level field (areas) is missing', () => {
    const { areas: _omit, ...withoutAreas } = validPapersData;
    expect(PapersDataSchema.safeParse(withoutAreas).success).toBe(false);
  });

  it('rejects when cells is missing', () => {
    const { cells: _omit, ...withoutCells } = validPapersData;
    expect(PapersDataSchema.safeParse(withoutCells).success).toBe(false);
  });

  it('rejects when id is not an integer (float)', () => {
    const payload = {
      ...validPapersData,
      references: [{ ...validReference, id: 1.5 }],
    };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when isPrimary is missing', () => {
    const { isPrimary: _omit, ...refWithout } = validReference;
    const payload = { ...validPapersData, references: [refWithout] };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when slug is missing', () => {
    const { slug: _omit, ...refWithout } = validReference;
    const payload = { ...validPapersData, references: [refWithout] };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when raw is missing', () => {
    const { raw: _omit, ...refWithout } = validReference;
    const payload = { ...validPapersData, references: [refWithout] };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when section is missing', () => {
    const { section: _omit, ...refWithout } = validReference;
    const payload = { ...validPapersData, references: [refWithout] };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when cell is missing labels', () => {
    const { labels: _omit, ...cellWithout } = validCell;
    const payload = { ...validPapersData, cells: [cellWithout] };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when reference id is 0 (must be positive)', () => {
    const payload = {
      ...validPapersData,
      references: [{ ...validReference, id: 0 }],
    };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when reference id is negative', () => {
    const payload = {
      ...validPapersData,
      references: [{ ...validReference, id: -1 }],
    };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when refIds contains 0 (must be positive)', () => {
    const payload = {
      ...validPapersData,
      cells: [{ ...validCell, refIds: [0] }],
    };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when refIds contains a negative value', () => {
    const payload = {
      ...validPapersData,
      cells: [{ ...validCell, refIds: [-2] }],
    };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when codeUrl is not a valid URL', () => {
    const payload = {
      ...validPapersData,
      references: [{ ...validReference, codeUrl: 'not-a-url' }],
    };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects when dataUrl is not a valid URL', () => {
    const payload = {
      ...validPapersData,
      references: [{ ...validReference, dataUrl: 'not-a-url' }],
    };
    expect(PapersDataSchema.safeParse(payload).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Counts — happy paths
// ---------------------------------------------------------------------------

describe('CountsSchema — valid payloads', () => {
  it('parses a valid Counts payload', () => {
    const result = CountsSchema.safeParse(validCounts);
    expect(result.success).toBe(true);
  });

  it('accepts zero for all counts', () => {
    const zero = { papers: 0, software: 0, databases: 0, species: 0, datasets: 0, researchAreas: 0, talks: 0 };
    expect(CountsSchema.safeParse(zero).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Counts — rejection cases
// ---------------------------------------------------------------------------

describe('CountsSchema — invalid payloads are rejected', () => {
  it('rejects a negative count', () => {
    expect(CountsSchema.safeParse({ ...validCounts, papers: -1 }).success).toBe(false);
  });

  it('rejects a fractional count', () => {
    expect(CountsSchema.safeParse({ ...validCounts, software: 1.5 }).success).toBe(false);
  });

  it('rejects when a required field (databases) is missing', () => {
    const { databases: _omit, ...without } = validCounts;
    expect(CountsSchema.safeParse(without).success).toBe(false);
  });

  it('rejects when a count is a string', () => {
    expect(CountsSchema.safeParse({ ...validCounts, talks: '25' }).success).toBe(false);
  });
});
