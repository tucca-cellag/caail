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
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isPublishedMarkdown,
  isPrivateCompanion,
  PRIVATE_COMPANION_SUFFIXES,
} from '../../src/lib/canonical-files.js';
import { llmsFullSources } from './llms-full.js';
import { computeCounts } from './counts.js';
import type { PapersData } from './types.js';

const FIXTURE_DIR = join(fileURLToPath(import.meta.url), '..', 'fixtures');
/** parser/ → scripts/ → site/ → repo root. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

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

  it('rejects companions whatever their case, because .gitignore ignores case', () => {
    // core.ignoreCase=true here, so git treats all of these as ignored — i.e.
    // private. A case-sensitive test would publish them.
    for (const n of ['Cow.LOCAL.md', 'Cow.Local.md', 'COW.LOCAL.md']) {
      expect(isPublishedMarkdown(n)).toBe(false);
    }
  });

  it('keeps the extension test case-SENSITIVE, matching the other enumerators', () => {
    // idForSourcePath and the docs loader's canonical scan both test `.md`
    // case-sensitively. Admitting Foo.MD here would have this function alone
    // call it a page, which is the disagreement the predicate exists to end.
    expect(isPublishedMarkdown('Foo.MD')).toBe(false);
    expect(isPublishedMarkdown('claude.md')).toBe(true);
  });

  it('rejects non-Markdown', () => {
    expect(isPublishedMarkdown('Cow.txt')).toBe(false);
    // A directory named like a companion is still not a .md file.
    expect(isPublishedMarkdown('notes.local')).toBe(false);
  });

  it('does not treat "local.md" as a companion without the dot separator', () => {
    // `mylocal.md` ends with "local.md" but is not `*.local.md`.
    expect(isPublishedMarkdown('mylocal.md')).toBe(true);
    expect(isPrivateCompanion('mylocal.md')).toBe(false);
  });
});

describe('isPrivateCompanion', () => {
  it('covers .mdx as well as .md', () => {
    // Not optional: every file under site/src/content/docs/ is .mdx, and the
    // convention sanctions a companion beside them.
    expect(PRIVATE_COMPANION_SUFFIXES).toEqual(['.local.md', '.local.mdx']);
    expect(isPrivateCompanion('privacy.local.mdx')).toBe(true);
    expect(isPrivateCompanion('privacy.local.MDX')).toBe(true);
  });

  it('leaves ordinary pages alone', () => {
    for (const n of ['privacy.mdx', 'Cow.md', 'README.md']) {
      expect(isPrivateCompanion(n)).toBe(false);
    }
  });
});

describe('the ignore rules and the predicate agree on what a companion is', () => {
  // The predicate decides what gets PUBLISHED; .gitignore decides what is
  // COMMITTABLE. Both have to know the same suffixes, and nothing but this
  // test connects them. It exists because they did diverge: .gitignore
  // covered only *.local.md while every file under site/src/content/docs/ is
  // .mdx, so the commonest companion was excluded from the build and
  // committable into a public repo at the same time.
  it('git ignores a companion at every suffix the predicate recognises', () => {
    for (const suffix of PRIVATE_COMPANION_SUFFIXES) {
      const probe = `site/src/content/docs/probe${suffix}`;
      const res = spawnSync('git', ['check-ignore', '-q', probe], { cwd: REPO_ROOT });
      expect(res.status, `${probe} is NOT gitignored — a companion here is committable`).toBe(0);
    }
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

  it('omits every private companion from the source list', () => {
    const sources = llmsFullSources(root);
    const leaked = sources.filter((s) => isPrivateCompanion(s));
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
