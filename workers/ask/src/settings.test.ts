/**
 * "The index was built with these embedding settings" is decided once, by
 * builtWithTheseSettings, so the build and the Worker can never disagree about
 * it: a setting added to one rule and not the other would have the build keep a
 * record the Worker then trusts, or the reverse.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMBEDDING_MODEL, EMBEDDING_PROMPTS, builtWithTheseSettings } from './settings.ts';

const record = (overrides: Record<string, unknown> = {}) => ({
  corpusDate: '2026-11-14',
  embeddingModel: EMBEDDING_MODEL,
  embeddingPrompts: EMBEDDING_PROMPTS,
  documents: 907,
  ...overrides,
});

describe('builtWithTheseSettings', () => {
  it('accepts a record written with this model and these prompts, whatever else it carries', () => {
    expect(builtWithTheseSettings(record())).toBe(true);
    expect(builtWithTheseSettings(record({ documents: 1, extra: 'x' }))).toBe(true);
  });

  it.each([
    ['another model', record({ embeddingModel: '@cf/test/older-embedding' })],
    ['other prompts', record({ embeddingPrompts: 'none' })],
    ['no model', record({ embeddingModel: undefined })],
    ['no prompts', record({ embeddingPrompts: undefined })],
    ['the settings as other types', record({ embeddingModel: [EMBEDDING_MODEL], embeddingPrompts: { EMBEDDING_PROMPTS } })],
  ])('refuses a record with %s', (_label, written) => {
    expect(builtWithTheseSettings(written)).toBe(false);
  });

  // The rule lives in one place: neither caller compares the settings itself.
  it.each(['./index.ts', './index-build.ts'])('is the only settings comparison %s makes', (file) => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    expect(source).toMatch(/\bbuiltWithTheseSettings\(/);
    expect(source, `${file} compares the embedding settings itself`).not.toMatch(/\.embedding(Model|Prompts)\s*[!=]==/);
  });
});
