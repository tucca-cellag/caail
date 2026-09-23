/**
 * search-terms.test.ts: tests for the curated search vocabulary loader.
 *
 * Two suites:
 *   (A) the committed search-terms.json against the real Taxonomy.md: every live area and
 *       method has exactly one entry (the same guard the build enforces, pinned here so a
 *       drift is caught by `pnpm test` too), and the contract names every plural rule the
 *       loader applies;
 *   (B) the failure modes, each built by mutating a copy of the committed file, so the
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
    expect(run).toThrow(/joined by single spaces or hyphens: "machine\u00adlearning"/);
    expect(run).toThrow(/joined by single spaces or hyphens: "deep\u200blearning"/);
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

  it('names the file on a load failure too, not only on the checks after parsing', () => {
    const badJson = join(scratch, 'not-json.json');
    writeFileSync(badJson, '{ "contract": ');
    expect(() => buildSearchTerms(taxonomy, badJson)).toThrow(`${badJson} failed to load`);
    const badSchema = variant((t) => { t.surprise = []; });
    expect(() => buildSearchTerms(taxonomy, badSchema)).toThrow(`${badSchema} failed to load`);
  });

  it('rejects an empty method list, while an empty area list is allowed', () => {
    const emptyMethod = variant((t) => { t.methods[firstMethod] = []; });
    expect(() => buildSearchTerms(taxonomy, emptyMethod)).toThrow(/too_small|at least 1/i);
    const emptyArea = variant((t) => { t.areas[firstArea] = []; });
    expect(() => buildSearchTerms(taxonomy, emptyArea)).not.toThrow();
  });

  it('rejects an unknown top-level key rather than shipping it', () => {
    const path = variant((t) => { t.surprise = []; });
    expect(() => buildSearchTerms(taxonomy, path)).toThrow(/unrecognized_keys|surprise/i);
  });
});
