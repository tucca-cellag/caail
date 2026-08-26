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
 * lands, and an ungated one fails whichever rule it is. The match runs to the
 * opening brace on the same line, which is how every rule in this stylesheet is
 * written; a selector broken across lines would simply not be found, and the
 * `toBeGreaterThan(0)` guard below is what stops that turning the whole file
 * green-and-vacuous.
 */
function containerTableSelectors(css: string): string[] {
  return [...css.matchAll(/^[^\n{]*\.sl-container:has\([^\n{]*\btable\b[^\n{]*\{/gm)].map((m) =>
    m[0].replace(/\{\s*$/, '').trim(),
  );
}

describe('the full-width data-table rules', () => {
  it('are found in the stylesheet at all', () => {
    // Guards the derivation. Without this, a selector this regex stops matching
    // makes the loop below zero assertions and the file reports green while
    // checking nothing.
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
