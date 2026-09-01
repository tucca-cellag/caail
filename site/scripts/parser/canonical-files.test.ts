/**
 * canonical-files.test.ts — private `*.local.md` companions stay out of the
 * published corpus.
 *
 * The repo's publishing rule (CLAUDE.md) puts a private companion BESIDE
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
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isPublishedMarkdown,
  isPrivateCompanion,
  PRIVATE_COMPANION_SUFFIXES,
} from '../../src/lib/canonical-files.js';
import { worktreeIncludeRules } from '../../src/lib/worktree-include.js';
import { patternOf, isInRepoGitignore } from '../../src/lib/gitignore-report.js';
import { llmsFullSources } from './llms-full.js';
import { computeCounts } from './counts.js';
import { DOCS_GLOB_PATTERN } from '../../src/content/loaders/caail-docs-loader.js';
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

  it('takes a path as well as a bare name, without failing open', () => {
    // The instruction-file check is a whole-string match, so without a
    // basename step isPublishedMarkdown('Datasets/CLAUDE.md') returned true.
    // The module doc invites new enumerators to adopt this predicate and the
    // nearest candidate already builds `${dir}/${name}` strings.
    expect(isPublishedMarkdown('Datasets/CLAUDE.md')).toBe(false);
    expect(isPublishedMarkdown('ResearchAreas/Bioprocess.local.md')).toBe(false);
    expect(isPublishedMarkdown('Datasets/Cow.md')).toBe(true);
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
  // COMMITTABLE; .worktreeinclude decides what REACHES A WORKTREE. Three
  // copies of one suffix list, and nothing but this block connects them. It
  // exists because they did diverge: .gitignore covered only *.local.md while
  // every file under site/src/content/docs/ is .mdx, so the commonest
  // companion was excluded from the build and committable into a public repo
  // at the same time.
  // TWO PROBES, AT TWO DEPTHS, and the second is not redundant. The suffix
    // rules live in the ROOT .gitignore today and therefore cover the whole
    // tree, but nothing here required that until this probe existed. Scope them
    // into the tracked `site/.gitignore` instead, which is a plausible tidy-up,
    // and a single `site/`-only probe still reports ignored while every
    // companion beside a canonical page at the repo root becomes committable
    // into a public repo.
    //
    // MEASURED, not reasoned about, because an earlier version of this guard
    // pinned the ROOT .gitignore by regex and that pin was replaced with a
    // shared in-repo predicate: with the rules moved to `site/.gitignore`, this
    // suite ran 18/18 GREEN while `git check-ignore --no-index -v
    // Datasets/Cow.local.md` exited 1. The predicate change was right on its own
    // terms (a nested in-repo rule is genuinely in-repo) and silently gave up a
    // property the regex had been carrying by accident. A probe states the
    // property directly instead of leaving it to the shape of a pattern.
  //
  // ONE `it` PER PROBE, not a loop, matching the sibling guard's reason: a run
  // that breaks two rules must report both. A single loop aborts on the first
  // failure, so an edit dropping both suffixes reports only the first probe, the
  // reviewer fixes that one line, re-runs, and only then learns the repo-root
  // case and the .mdx case are broken too. Three round-trips for one edit, on
  // the guard whose failure mode is a private companion being committable.
  const probes = PRIVATE_COMPANION_SUFFIXES.flatMap((suffix) => [
    `site/src/content/docs/probe${suffix}`,
    `Datasets/probe${suffix}`,
  ]);

  it.each(probes)('git ignores a companion at %s', (probe) => {
    // -v, and the SOURCE is asserted, not just the match. With -q alone this
    // proves only that SOMETHING ignores the probe: a contributor carrying
    // `*.local.md*` in ~/.config/git/ignore or .git/info/exclude could delete
    // the committed rule, run this suite, see green and push, and only CI
    // would catch it. Not hypothetical: this repo's own .git/info/exclude
    // already carries a rule that masked the `.env` case in
    // scripts/private-paths.test.ts, which is where this fix came from.
    //
    // THE `(?!!)` IS LOAD-BEARING AND WAS ADDED AFTER A REGRESSION. Moving
    // from -q to -v inverts the exit-code contract: -q exits 1 on a negated
    // path (correct, it is not ignored) while -v MATCHES the negation and
    // exits 0. Measured against `!site/src/content/docs/*.local.mdx`:
    // -q exits 1, -v exits 0 and prints `.gitignore:79:!site/...`. So the
    // first draft of this very fix made the guard weaker than the -q form it
    // replaced, passing while a companion was committable. Rejecting a
    // leading `!` in the pattern is what makes -v safe here.
    // --no-index, for the reason the sibling test 60 lines down gives at
    // length: in index-aware mode check-ignore never reports a TRACKED path,
    // so the moment a probe name becomes concrete (which the repo-root probe
    // invites) stdout goes empty and the assertion below reads nothing while
    // staying green. That is worse than an unreachable guard: this one runs.
    const res = spawnSync('git', ['check-ignore', '--no-index', '-v', probe], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    expect(res.error, `git check-ignore could not run for ${probe}`).toBeUndefined();
    expect([0, 1], `git check-ignore exited ${res.status} for ${probe}`).toContain(res.status);
    expect(res.status, `${probe} is NOT gitignored: a companion here is committable`).toBe(0);
    // TWO INDEPENDENT QUESTIONS, asked separately, because one regex asking
    // both answered neither clearly. `/^\.gitignore:\d+:(?!!)/` was root
    // anchored, so scoping the `*.local.md` rules into the tracked
    // `site/.gitignore` (a plausible refactor, since the probe path lives
    // under `site/`) made it report "the rule lives in a personal exclude
    // source" about a rule sitting in this repo. That is the third
    // hand-rolled copy of this parse to get the in-repo test wrong, which is
    // why the predicate now has one home.
    const out = (res.stdout ?? '').trim();
    expect(
      isInRepoGitignore(out),
      `${probe} is ignored, but by a rule OUTSIDE this repo (a personal `
        + `core.excludesFile or .git/info/exclude), so nothing here makes it `
        + `true for anyone else and a companion is committable for them. `
        + `The reporting source was: ${out}`,
    ).toBe(true);
    expect(
      patternOf(out).startsWith('!'),
      `${probe} matched a NEGATION, which un-ignores it, so a companion here `
        + `is committable. The exit code cannot see this: -v MATCHES a `
        + `negation and exits 0, which is how an earlier draft of this guard `
        + `passed while being weaker than the -q form it replaced.`,
    ).toBe(false);
  });

  it('.worktreeinclude carries every suffix, or companions never reach a worktree', () => {
    // The third copy. Without this a suffix could be added to the predicate
    // and .gitignore, and companions at it would silently stop being copied
    // into new worktrees — first noticed by a curator losing a file.
    const lines = worktreeIncludeRules(
      readFileSync(join(REPO_ROOT, '.worktreeinclude'), 'utf-8'),
    );
    for (const suffix of PRIVATE_COMPANION_SUFFIXES) {
      expect(lines, `.worktreeinclude has no rule covering ${suffix}`).toContain(`*${suffix}`);
    }
  });

  it('nothing gitignored in a canonical directory is treated as published', () => {
    // The OTHER direction, and the one that actually publishes. The check
    // above proves predicate ⊆ gitignore; this proves gitignore ⊆ predicate.
    // Without it someone adds `*.private.md` (or `notes-*.md`) to .gitignore,
    // drops Datasets/notes-internal.md beside Cow.md, and dirMarkdown inlines
    // it verbatim into the served llms-full.txt while every test stays green.
    for (const dir of ['Datasets', 'ResearchAreas', 'Methods', 'Primers']) {
      const names = readdirSync(join(REPO_ROOT, dir));
      const published = names.filter((n) => isPublishedMarkdown(n));
      if (published.length === 0) continue;
      // --no-index is load-bearing, not a flag someone added for tidiness.
      // In index-aware mode git check-ignore NEVER reports a TRACKED path, and
      // in a CI checkout every file in these directories is tracked — so
      // without it this assertion reads an always-empty stdout and passes
      // whatever .gitignore says. That is worse than the unreachable-guard
      // defect this diff's test.yml comment describes: this one runs, and
      // checks nothing.
      const res = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
        cwd: REPO_ROOT,
        input: published.map((n) => `${dir}/${n}`).join('\n'),
        encoding: 'utf-8',
      });
      // 0 = something matched, 1 = nothing matched. Anything else (128, or a
      // missing git) means the check did not happen, and an unchecked check
      // must fail rather than pass quietly: stdout is empty in that case too,
      // which is indistinguishable from success.
      expect(res.error, `git check-ignore could not run for ${dir}/`).toBeUndefined();
      expect([0, 1], `git check-ignore exited ${res.status} for ${dir}/`).toContain(res.status);
      const ignored = (res.stdout ?? '').trim();
      expect(ignored, `these ${dir}/ files are gitignored but treated as published`).toBe('');
    }
  });
});

describe('the docs glob keeps companions out of the build', () => {
  it('excludes every companion suffix, derived rather than hardcoded', () => {
    // Guards the "tidy the array back to a string" edit, which reads as
    // removing redundancy and actually deploys private companions.
    expect(Array.isArray(DOCS_GLOB_PATTERN)).toBe(true);
    for (const suffix of PRIVATE_COMPANION_SUFFIXES) {
      expect(DOCS_GLOB_PATTERN, `docs glob does not exclude *${suffix}`).toContain(`!**/*${suffix}`);
    }
  });

  it('still matches the ordinary pages it exists to load', () => {
    expect(DOCS_GLOB_PATTERN[0]).toBe('**/[^_]*.{md,mdx}');
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
    // A curator follows the publishing rule and drops a companion beside a public page.
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
