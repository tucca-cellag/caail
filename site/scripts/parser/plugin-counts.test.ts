/**
 * plugin-counts.test.ts: plugin.json's description, the always-loaded query skill and CLAUDE.md
 * type corpus counts by hand. Each is checked against the agent manifest here, so a catalogue
 * change that moves a count fails this test until the text is updated with it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string) => JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf-8'));

const plugin = read('plugin/.claude-plugin/plugin.json') as { description: string };
const index = read('site/public/api/index.json') as {
  counts: Record<string, number> & { papersBySection: Record<string, number> };
};
const matrix = read('site/public/api/matrix.json') as { methods: unknown[]; areas: unknown[] };
const datasets = read('site/public/api/datasets.json') as {
  inventory: { page: string }[];
  entries: { page: string }[];
};

/** The one capture of `re` in `text`; fails when it matches nowhere or more than once. */
const capture = (text: string, re: RegExp, where: string): string => {
  const all = [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))];
  if (all.length !== 1) {
    throw new Error(`${where} matches ${re} ${all.length} times, not once; update this test with it`);
  }
  return all[0][1];
};
const count = (re: RegExp): number => Number(capture(plugin.description, re, "plugin.json's description"));

describe('plugin.json description counts', () => {
  it('match the agent manifest', () => {
    expect(count(/(\d+) references/), 'references').toBe(index.counts.papersAllSections);
    expect(count(/across (\d+) methods/), 'methods').toBe(matrix.methods.length);
    expect(count(/(\d+) research areas/), 'research areas').toBe(matrix.areas.length);
    expect(count(/(\d+) software tools/), 'software tools').toBe(index.counts.software);
    expect(count(/(\d+) databases/), 'databases').toBe(index.counts.databases);
    expect(count(/(\d+) datasets/), 'datasets').toBe(index.counts.datasetsTotal);
    const pages = new Set([...datasets.inventory, ...datasets.entries].map((r) => r.page));
    expect(count(/across (\d+) dataset pages/), 'dataset pages').toBe(pages.size);
  });
});

const inFile = (rel: string, re: RegExp): string =>
  capture(readFileSync(join(REPO_ROOT, rel), 'utf-8'), re, rel);
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const WORDS: Record<string, number> = Object.fromEntries(NUMBER_WORDS.map((w, i) => [w, i + 1]));
const WORD = NUMBER_WORDS.join('|');

describe('section counts typed into the query skill and CLAUDE.md', () => {
  const bySection = index.counts.papersBySection;
  const refWork = Object.entries(bySection).filter(([s]) => /Reference Work/.test(s));
  const refWorkTotal = refWork.reduce((n, [, v]) => n + v, 0);

  for (const rel of ['plugin/skills/caail/SKILL.md', 'CLAUDE.md']) {
    it(`${rel} matches the manifest`, () => {
      expect(WORDS[inFile(rel, new RegExp(`(?:holds|spans) (${WORD}) sections`))], 'sections').toBe(
        Object.keys(bySection).length,
      );
      expect(Number(inFile(rel, /References`? \((\d+)\)/)), 'References').toBe(bySection.References);
      expect(Number(inFile(rel, /Reviews\s+& Perspectives \((\d+)\)/)), 'Reviews & Perspectives').toBe(
        bySection['Reviews & Perspectives'],
      );
      expect(WORDS[inFile(rel, new RegExp(`\\b(${WORD}) [^()]*?Reference Work\`? sections`))], 'reference-work sections').toBe(
        refWork.length,
      );
      expect(Number(inFile(rel, /Reference Work`? sections \((\d+)\)/)), 'reference works').toBe(refWorkTotal);
      expect(Number(inFile(rel, /"(\d+) papers"/)), 'all sections').toBe(index.counts.papersAllSections);
    });
  }
});
