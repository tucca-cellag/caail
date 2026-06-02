/**
 * llms-full.test.ts — the public/llms-full.txt full-text agent index.
 *
 * Verifies the source list (CLAUDE.md excluded, README first) and that the
 * concatenated text is non-trivial and carries a per-file delimiter for the
 * key canonical sources.
 */
import { describe, it, expect } from 'vitest';

import { buildLlmsFullText, llmsFullSources } from './llms-full.js';

describe('llmsFullSources', () => {
  const sources = llmsFullSources();

  it('includes the core canonical files', () => {
    for (const f of ['README.md', 'Papers.md', 'Software.md', 'Databases.md', 'CONTRIBUTING.md']) {
      expect(sources).toContain(f);
    }
  });

  it('includes per-species dataset and research-area pages', () => {
    expect(sources).toContain('Datasets/Cow.md');
    expect(sources).toContain('ResearchAreas/Bioprocess.md');
  });

  it('excludes CLAUDE.md agent-instruction files', () => {
    expect(sources.some((s) => s.endsWith('CLAUDE.md'))).toBe(false);
  });

  it('orders each directory with README first', () => {
    const datasets = sources.filter((s) => s.startsWith('Datasets/'));
    expect(datasets[0]).toBe('Datasets/README.md');
  });
});

describe('buildLlmsFullText', () => {
  const text = buildLlmsFullText();

  it('is substantial (full library, not a stub)', () => {
    expect(text.length).toBeGreaterThan(50_000);
  });

  it('starts with the agent-facing header', () => {
    expect(text.startsWith('# CAAIL — Cellular Agriculture AI Library (full canonical text)')).toBe(
      true,
    );
  });

  it('carries a per-file delimiter for each source', () => {
    for (const rel of llmsFullSources()) {
      expect(text).toContain(`# ===== ${rel} =====`);
    }
  });

  it('contains real canonical content (Papers references section)', () => {
    expect(text).toContain('## References');
  });
});
