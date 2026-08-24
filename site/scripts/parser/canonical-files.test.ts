/**
 * canonical-files.test.ts — private `*.local.md` companions stay out of the
 * published corpus.
 *
 * `docs/adr/0002-what-the-repo-publishes.md` puts a private companion BESIDE
 * its public file, so one can land inside a canonical directory. Two parser
 * entry points enumerate those directories: llms-full.ts inlines each match
 * verbatim into the served public/llms-full.txt, and counts.ts derives the
 * homepage species / research-area numbers from them.
 *
 * The fixtures here are built at RUNTIME, deliberately. A committed
 * `*.local.md` fixture would be matched by the very `.gitignore` rule under
 * test, so it would never reach CI and the guard would pass without
 * exercising anything.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isPublishedMarkdown, PRIVATE_COMPANION_SUFFIX } from '../../src/lib/canonical-files.js';
import { llmsFullSources } from './llms-full.js';
import { computeCounts } from './counts.js';
import type { PapersData } from './types.js';

const FIXTURE_DIR = join(fileURLToPath(import.meta.url), '..', 'fixtures');

describe('isPublishedMarkdown', () => {
  it('admits ordinary canonical pages', () => {
    for (const n of ['Cow.md', 'README.md', 'Bioprocess.md']) {
      expect(isPublishedMarkdown(n)).toBe(true);
    }
  });

  it('rejects private companions', () => {
    for (const n of ['Cow.local.md', 'issue-tracker.local.md', 'a.b.local.md']) {
      expect(isPublishedMarkdown(n)).toBe(false);
    }
  });

  it('rejects agent-instruction files', () => {
    expect(isPublishedMarkdown('CLAUDE.md')).toBe(false);
  });

  it('rejects non-Markdown', () => {
    expect(isPublishedMarkdown('Cow.txt')).toBe(false);
    // A directory named like a companion is still not a .md file.
    expect(isPublishedMarkdown('notes.local')).toBe(false);
  });

  it('does not treat "local.md" as a companion without the dot separator', () => {
    // `mylocal.md` ends with "local.md" but is not `*.local.md`.
    expect(PRIVATE_COMPANION_SUFFIX).toBe('.local.md');
    expect(isPublishedMarkdown('mylocal.md')).toBe(true);
  });
});

describe('llmsFullSources — private companions are never inlined', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'caail-llms-'));
    for (const dir of ['Datasets', 'ResearchAreas', 'Methods', 'Primers']) {
      mkdirSync(join(root, dir));
      writeFileSync(join(root, dir, 'README.md'), '# public\n');
      writeFileSync(join(root, dir, 'Public.md'), '# public\n');
      writeFileSync(join(root, dir, 'Private.local.md'), 'SECRET-COMPANION-BODY\n');
    }
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('omits every *.local.md from the source list', () => {
    const sources = llmsFullSources(root);
    const leaked = sources.filter((s) => s.endsWith(PRIVATE_COMPANION_SUFFIX));
    expect(leaked).toEqual([]);
  });

  it('still includes the public pages beside them', () => {
    const sources = llmsFullSources(root);
    for (const dir of ['Datasets', 'ResearchAreas', 'Methods', 'Primers']) {
      expect(sources).toContain(`${dir}/Public.md`);
      expect(sources).toContain(`${dir}/README.md`);
    }
  });
});

describe('computeCounts — private companions do not inflate the counts', () => {
  let root: string;

  const stubModel: PapersData = { areas: [], methods: [], cells: [], references: [] };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'caail-counts-'));
    cpSync(join(FIXTURE_DIR, 'counts-repo-root-fixture'), root, { recursive: true });
    // A curator follows ADR-0002 and drops a companion beside a public page.
    writeFileSync(join(root, 'Datasets', 'Cow.local.md'), 'PRIVATE\n');
    writeFileSync(join(root, 'ResearchAreas', 'Bioprocess.local.md'), 'PRIVATE\n');
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('counts the same species and research areas as without the companions', () => {
    const result = computeCounts(stubModel, root);
    // Fixture ground truth (counts.test.ts): Cow.md + Pig.md = 2 species,
    // Bioprocess.md + MediaOptimization.md = 2 research areas.
    expect(result.species).toBe(2);
    expect(result.researchAreas).toBe(2);
  });
});
