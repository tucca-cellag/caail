/**
 * search-terms.test.ts — tests for the curated search vocabulary loader.
 *
 * Two suites:
 *   (A) the committed search-terms.json against the real Taxonomy.md: every live area and
 *       method has exactly one entry (the same guard the build enforces, pinned here so a
 *       drift is caught by `pnpm test` too), and no term carries a Markdown link target;
 *   (B) the failure modes, each built by mutating a copy of the committed file, so the
 *       check is shown firing on the defect it guards rather than trusted to.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildSearchTerms, SEARCH_TERMS_PATH } from './search-terms';
import { buildTaxonomyModel } from './taxonomy';

const taxonomy = buildTaxonomyModel();
const committed = JSON.parse(readFileSync(SEARCH_TERMS_PATH, 'utf-8'));

/** Write a mutated copy of the committed file and return its path. */
function variant(mutate: (t: typeof committed) => void): string {
  const copy = structuredClone(committed);
  mutate(copy);
  const path = join(mkdtempSync(join(tmpdir(), 'search-terms-')), 'search-terms.json');
  writeFileSync(path, JSON.stringify(copy));
  return path;
}

describe('buildSearchTerms (committed file)', () => {
  const terms = buildSearchTerms(taxonomy);

  it('has exactly one entry per live research area and AI/ML method', () => {
    expect(Object.keys(terms.areas).sort()).toEqual(Object.keys(taxonomy.axes.area).sort());
    expect(Object.keys(terms.methods).sort()).toEqual(Object.keys(taxonomy.axes.method).sort());
  });

  it('gives every method at least one term of its own', () => {
    for (const [label, list] of Object.entries(terms.methods)) {
      expect(list.length, label).toBeGreaterThan(0);
    }
  });

  it('carries no Markdown link targets, which an off-site agent cannot resolve', () => {
    const all = [
      ...terms.methodGeneric,
      ...Object.values(terms.areas).flat(),
      ...Object.values(terms.methods).flat(),
    ];
    expect(all.filter((t) => t.includes('](') || t.includes('://'))).toEqual([]);
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
    expect(() => buildSearchTerms(taxonomy, path)).toThrow(/not lowercase\/trimmed/);
  });

  it('rejects a term repeated within one list', () => {
    const path = variant((t) => { t.methods[firstMethod].push(t.methods[firstMethod][0]); });
    expect(() => buildSearchTerms(taxonomy, path)).toThrow(/repeated/);
  });

  it('rejects an empty method list, while an empty area list is allowed', () => {
    const emptyMethod = variant((t) => { t.methods[firstMethod] = []; });
    expect(() => buildSearchTerms(taxonomy, emptyMethod)).toThrow();
    const emptyArea = variant((t) => { t.areas[firstArea] = []; });
    expect(() => buildSearchTerms(taxonomy, emptyArea)).not.toThrow();
  });

  it('rejects an unknown top-level key rather than shipping it', () => {
    const path = variant((t) => { t.surprise = []; });
    expect(() => buildSearchTerms(taxonomy, path)).toThrow();
  });
});
