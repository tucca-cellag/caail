/**
 * search-terms.test.ts: tests for the curated search vocabulary loader.
 *
 * Three suites:
 *   (A) the committed search-terms.json against the real Taxonomy.md: every live area and
 *       method has exactly one entry (the same guard the build enforces, pinned here so a
 *       drift is caught by `pnpm test` too), the contract's plural rules equal the
 *       loader's, in both directions, and the core field list is served and named;
 *   (B) the served `sha256`, in both directions: it moves when any member changes, and holds
 *       still for the same content in another layout or order, or beside reworded definitions;
 *   (C) the failure modes, each built by mutating a copy of the committed file, so the
 *       check is shown firing on the defect it guards rather than trusted to.
 */

import { afterAll, describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildSearchTerms, PLURAL_RULES, SEARCH_TERMS_PATH } from './search-terms';
import { buildTaxonomyModel } from './taxonomy';

const taxonomy = buildTaxonomyModel();
const committed = JSON.parse(readFileSync(SEARCH_TERMS_PATH, 'utf-8'));

// One scratch directory for the whole file, removed afterwards.
const scratch = mkdtempSync(join(tmpdir(), 'search-terms-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let variants = 0;

/** Write a mutated copy of the committed file and return its path. */
function variant(mutate: (t: typeof committed) => void): string {
  const copy = structuredClone(committed);
  mutate(copy);
  const path = join(scratch, `variant-${++variants}.json`);
  writeFileSync(path, JSON.stringify(copy));
  return path;
}

describe('buildSearchTerms (committed file)', () => {
  const terms = buildSearchTerms(taxonomy);

  it('has exactly one entry per live research area and AI/ML method', () => {
    expect(Object.keys(terms.areas).sort()).toEqual(Object.keys(taxonomy.axes.area).sort());
    expect(Object.keys(terms.methods).sort()).toEqual(Object.keys(taxonomy.axes.method).sort());
  });

  it('states exactly the plural rules the loader applies, no more and no fewer', () => {
    const clause = /regular plural: ([^.]+)\./.exec(terms.contract);
    expect(clause, 'contract names its plural rules after "regular plural:"').not.toBeNull();
    expect(clause![1].split(', ').sort()).toEqual(PLURAL_RULES.map((r) => r.name).sort());
  });

  it('serves a core field list, and its contract names it, so a consumer can find how it composes', () => {
    expect(terms.fieldCore.length).toBeGreaterThan(0);
    expect(terms.contract).toContain('fieldCore');
  });
});

describe('buildSearchTerms (sha256)', () => {
  const served = buildSearchTerms(taxonomy);
  // Asserted again in each equality test, so none passes on two missing hashes.
  const HEX64 = /^[0-9a-f]{64}$/;

  it('is 64 lowercase hex characters, derived rather than stored in the file', () => {
    expect(served.sha256).toMatch(HEX64);
    expect(committed).not.toHaveProperty('sha256');
  });

  it('follows the content, not the file layout', () => {
    // variant() writes the copy unindented, so its bytes differ from the committed file's.
    expect(served.sha256).toMatch(HEX64);
    expect(buildSearchTerms(taxonomy, variant(() => {})).sha256).toBe(served.sha256);
  });

  it('moves when any member of the block changes, whichever member it is', () => {
    // Every served member but sha256 comes from the file, so mutating each file member in
    // turn covers the whole block, including any member added after this test was written.
    expect(Object.keys(committed).sort()).toEqual(Object.keys(served).filter((k) => k !== 'sha256').sort());
    for (const key of Object.keys(committed)) {
      const path = variant((t) => {
        const member = t[key];
        if (typeof member === 'string') t[key] = `${member} Changed.`;
        else if (Array.isArray(member)) member.push('zzz unused term');
        else member[Object.keys(member)[0]].push('zzz unused term');
      });
      expect(buildSearchTerms(taxonomy, path).sha256, `a change to ${key}`).not.toBe(served.sha256);
    }
  });

  it('moves when a term moves from one list to another, its text unchanged', () => {
    const path = variant((t) => { t.fieldCore.push(t.methodGeneric.shift()); });
    expect(served.sha256).toMatch(HEX64);
    expect(buildSearchTerms(taxonomy, path).sha256).not.toBe(served.sha256);
  });

  it('holds still when only the order of terms or labels changes', () => {
    // Order carries no meaning in the vocabulary, so a curator alphabetising a list must not
    // read to consumers as a new vocabulary.
    const path = variant((t) => {
      t.fieldCore.reverse();
      t.methodGeneric.reverse();
      t.areas = Object.fromEntries(Object.entries(t.areas).reverse().map(([k, v]) => [k, [...(v as string[])].reverse()]));
      t.methods = Object.fromEntries(Object.entries(t.methods).reverse().map(([k, v]) => [k, [...(v as string[])].reverse()]));
    });
    expect(served.sha256).toMatch(HEX64);
    expect(buildSearchTerms(taxonomy, path).sha256).toBe(served.sha256);
  });

  it('does not move when only the taxonomy definitions change', () => {
    const reworded = structuredClone(taxonomy);
    for (const label of Object.keys(reworded.definitions)) reworded.definitions[label] = 'Reworded.';
    for (const axis of Object.values(reworded.axes)) {
      for (const label of Object.keys(axis)) axis[label] = 'Reworded.';
    }
    expect(served.sha256).toMatch(HEX64);
    expect(buildSearchTerms(reworded).sha256).toBe(served.sha256);
  });

  it('rejects a sha256 written into the file, since the build derives it', () => {
    const path = variant((t) => { t.sha256 = served.sha256; });
    expect(() => buildSearchTerms(taxonomy, path)).toThrow(/\(root\): .*"sha256".*\(unrecognized_keys\)/);
  });
});

describe('buildSearchTerms (failure modes)', () => {
  const [firstArea] = Object.keys(committed.areas);
  const [firstMethod] = Object.keys(committed.methods);

  it('names a live area that has no entry', () => {
    const path = variant((t) => { delete t.areas[firstArea]; });
    expect(() => buildSearchTerms(taxonomy, path)).toThrow(`no entry for "${firstArea}"`);
  });

  it('names a key that matches no live label, so a renamed row cannot strand its terms', () => {
    const path = variant((t) => {
      t.methods[`${firstMethod} (renamed)`] = t.methods[firstMethod];
      delete t.methods[firstMethod];
    });
    expect(() => buildSearchTerms(taxonomy, path)).toThrow(/\(renamed\)" names no method/);
  });

  it('rejects a term that is not lowercase and trimmed', () => {
    const path = variant((t) => { t.methodGeneric.push(' Machine Learning'); });
    expect(() => buildSearchTerms(taxonomy, path)).toThrow(/not lowercase ASCII words/);
  });

  it('rejects invisible characters a consumer would fold away', () => {
    const path = variant((t) => { t.methodGeneric.push('machine\u00adlearning', 'deep\u200blearning'); });
    const run = () => buildSearchTerms(taxonomy, path);
    // Shown escaped, so the curator can see what is wrong with a term that looks valid.
    expect(run).toThrow('joined by single spaces or hyphens: "machine\\u00adlearning", "deep\\u200blearning"');
  });

  it('treats a word and its regular plural as the same term, as the contract does', () => {
    const path = variant((t) => {
      t.methodGeneric.push('assay', 'assays', 'process', 'processes', 'capability', 'capabilities',
        'analysis', 'analyses', 'matrix', 'matrices');
    });
    expect(() => buildSearchTerms(taxonomy, path)).toThrow(
      /repeated "assays", "processes", "capabilities", "analyses", "matrices"/,
    );
  });

  it('rejects a term repeated within one list', () => {
    const path = variant((t) => { t.methods[firstMethod].push(t.methods[firstMethod][0]); });
    expect(() => buildSearchTerms(taxonomy, path)).toThrow(/repeated/);
  });

  it('treats a hyphen and a space as the same term, as the contract does', () => {
    const path = variant((t) => { t.methodGeneric.push('water holding', 'water-holding'); });
    expect(() => buildSearchTerms(taxonomy, path)).toThrow(/repeated "water-holding"/);
  });

  it('rejects a term stored with a Unicode dash, which a folding consumer would never match', () => {
    const path = variant((t) => { t.methodGeneric.push('wood\u2013ljungdahl'); });
    expect(() => buildSearchTerms(taxonomy, path)).toThrow(/not lowercase ASCII words/);
  });

  it('names the file it actually loaded, not the committed default', () => {
    const path = variant((t) => { delete t.areas[firstArea]; });
    expect(() => buildSearchTerms(taxonomy, path)).toThrow(path);
  });

  it('names the file on a load failure too, and keeps the original error as its cause', () => {
    const badJson = join(scratch, 'not-json.json');
    writeFileSync(badJson, '{ "contract": ');
    expect(() => buildSearchTerms(taxonomy, badJson)).toThrow(`${badJson} failed to load`);
    const missing = join(scratch, 'absent.json');
    let caught: unknown;
    try { buildSearchTerms(taxonomy, missing); } catch (e) { caught = e; }
    expect(String(caught)).toContain(`${missing} failed to load`);
    expect((caught as Error).cause).toMatchObject({ code: 'ENOENT' });
  });

  it('reports every problem in one pass: form, coverage and repeats together', () => {
    const path = variant((t) => {
      t.methodGeneric.push('Bad Term');
      delete t.areas[firstArea];
      t.methods[firstMethod].push(t.methods[firstMethod][0]);
    });
    const run = () => buildSearchTerms(taxonomy, path);
    expect(run).toThrow('"Bad Term"');
    expect(run).toThrow(`no entry for "${firstArea}"`);
    expect(run).toThrow(`methods["${firstMethod}"]: repeated`);
  });

  it('rejects an empty method list, while an empty area list is allowed', () => {
    const emptyMethod = variant((t) => { t.methods[firstMethod] = []; });
    expect(() => buildSearchTerms(taxonomy, emptyMethod)).toThrow(/too_small|at least 1/i);
    const emptyArea = variant((t) => { t.areas[firstArea] = []; });
    expect(() => buildSearchTerms(taxonomy, emptyArea)).not.toThrow();
  });

  it('rejects a file with no fieldCore list, or an empty one', () => {
    const absent = variant((t) => { delete t.fieldCore; });
    expect(() => buildSearchTerms(taxonomy, absent)).toThrow(/fieldCore: .*\(invalid_type\)/);
    const empty = variant((t) => { t.fieldCore = []; });
    expect(() => buildSearchTerms(taxonomy, empty)).toThrow(/fieldCore: .*\(too_small\)/);
  });

  it('checks fieldCore terms for form and for repeats as a consumer reads them', () => {
    const path = variant((t) => { t.fieldCore.push('Cultivated Pork', `${t.fieldCore[0]}s`); });
    const run = () => buildSearchTerms(taxonomy, path);
    expect(run).toThrow('fieldCore: not lowercase ASCII words joined by single spaces or hyphens: "Cultivated Pork"');
    expect(run).toThrow(`fieldCore: repeated "${committed.fieldCore[0]}s"`);
  });

  it('rejects an unknown top-level key rather than shipping it', () => {
    const path = variant((t) => { t.surprise = []; });
    expect(() => buildSearchTerms(taxonomy, path)).toThrow(/unrecognized_keys|surprise/i);
  });
});
