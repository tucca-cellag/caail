import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIN_DATA_TABLE_BODY_ROWS, MIN_DATA_TABLE_COLUMNS } from './table-layout.ts';

/**
 * The full-width table rules agree with `table-layout.ts` about what a data
 * table is.
 *
 * This is the check that stands in for an import CSS cannot make. It reads the
 * shipped stylesheet and the shipped component rather than a copy, so it fails
 * on the real divergence rather than on a fixture of one.
 *
 * The state it was written against: both `.sl-container:has(...)` rules matched
 * on `table` alone, so a two-column table switched `/community/` and
 * `/datasets/readme/` to the full-width layout that exists for the 8- and
 * 9-column species inventories.
 */
const CSS = readFileSync(
  fileURLToPath(new URL('../styles/starlight-overrides.css', import.meta.url)),
  'utf8',
);
const COMPONENT = readFileSync(
  fileURLToPath(new URL('../components/DataTableViews.astro', import.meta.url)),
  'utf8',
);

/**
 * Every `.sl-container:has(… table …)` selector in the stylesheet.
 *
 * Derived rather than counted: a third rule of this shape is covered the day it
 * lands, and an ungated one fails whichever rule it is.
 *
 * THE MATCH SPANS NEWLINES, and that is load-bearing rather than incidental. It
 * runs on `[^{}]`, which matches a newline, so it starts wherever the previous
 * rule's brace left off and ends at this rule's opening one however the
 * selector is wrapped. An earlier version anchored per line and its docstring
 * claimed the floor below caught what that missed. It does not: the floor
 * asserts that AT LEAST ONE selector matched, and two already do, so a third
 * rule wrapped for length would have been invisible while the file stayed
 * green on the other two. Both of the current selectors are near 100 characters
 * and one more qualifier would wrap either of them, so this was a live gap
 * rather than a hypothetical one.
 *
 * What the floor below actually buys is narrower and worth stating exactly: it
 * catches TOTAL extraction failure, the case where the shape changes so much
 * that nothing matches at all. It cannot catch a partial miss, and no
 * count-based assertion can either without hardcoding how many rules there
 * ought to be, which is the second-copy defect this file exists to prevent.
 */
function containerTableSelectors(css: string): string[] {
  return [...css.matchAll(/([^{}]*\.sl-container:has\([^{}]*?\btable\b[^{}]*?)\{/g)].map((m) =>
    // Drop any comment block sitting between the previous rule and this one: it
    // is preamble, and leaving it in would let prose satisfy the gate assertion.
    m[1].replace(/^[\s\S]*\*\//, '').trim(),
  );
}

describe('the full-width data-table rules', () => {
  it('are found in the stylesheet at all', () => {
    // Guards the derivation against TOTAL failure only, which is the whole of
    // what it can do. If every selector stopped matching, the loop below would
    // make zero assertions and the file would report green while checking
    // nothing. A PARTIAL miss is not reachable from here and is handled in the
    // extractor instead, by matching across newlines rather than per line.
    expect(containerTableSelectors(CSS).length).toBeGreaterThan(0);
  });

  it('gate on a column count, not on the presence of any table', () => {
    for (const selector of containerTableSelectors(CSS)) {
      expect(
        selector,
        `this rule fires on any table, so a ${MIN_DATA_TABLE_COLUMNS - 1}-column one widens the ` +
          'page the same as a 9-column inventory',
      ).toContain(`th:nth-child(${MIN_DATA_TABLE_COLUMNS})`);
    }
  });
});

describe('DataTableViews', () => {
  it('takes its thresholds from table-layout.ts rather than repeating them', () => {
    expect(COMPONENT).toMatch(
      /import\s*\{[^}]*MIN_DATA_TABLE_COLUMNS[^}]*\}\s*from\s*'\.\.\/lib\/table-layout'/,
    );
    expect(COMPONENT).toMatch(
      /import\s*\{[^}]*MIN_DATA_TABLE_BODY_ROWS[^}]*\}\s*from\s*'\.\.\/lib\/table-layout'/,
    );
  });

  it('has no second copy of either threshold as a literal', () => {
    // The literals as the component used to spell them. Matching the shape
    // rather than the whole line, so a reformat does not silently retire the
    // check.
    expect(COMPONENT).not.toMatch(
      new RegExp(`headCells\\.length\\s*<\\s*${MIN_DATA_TABLE_COLUMNS}\\b`),
    );
    expect(COMPONENT).not.toMatch(
      new RegExp(`bodyRows\\.length\\s*<\\s*${MIN_DATA_TABLE_BODY_ROWS}\\b`),
    );
  });
});
