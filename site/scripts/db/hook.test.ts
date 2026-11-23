/**
 * hook.test.ts — pins the PreToolUse guard (.claude/hooks/block-generated-edits.py):
 * structured edits to the generated catalog files are denied; prose edits, dataset
 * narrative, and non-canonical files are allowed. Shells the real hook exactly as
 * Claude Code would (tool JSON on stdin; a deny is a JSON object on stdout).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from './lib.js';

const HOOK = join(REPO_ROOT, '.claude', 'hooks', 'block-generated-edits.py');
const P = (rel: string) => join(REPO_ROOT, rel);

/** Run a copy of the hook; return its hookSpecificOutput, or null when it allows. */
function run(payload: object, hook = HOOK): { permissionDecision: string; permissionDecisionReason: string } | null {
  const out = execFileSync('python3', [hook], { input: JSON.stringify(payload), encoding: 'utf-8' }).trim();
  return out ? JSON.parse(out).hookSpecificOutput : null;
}

/** Run the hook; return the permissionDecision ('deny') or null when it allows. */
function decide(payload: object, hook = HOOK): string | null {
  return run(payload, hook)?.permissionDecision ?? null;
}

describe('block-generated-edits hook', () => {
  it('DENIES editing a reference in Papers.md (structured)', () => {
    expect(decide({ tool_name: 'Edit', tool_input: { file_path: P('Papers.md'), old_string: '<a id="1">1</a> X', new_string: 'y' } })).toBe('deny');
  });
  it('DENIES editing a matrix cell link in Papers.md', () => {
    expect(decide({ tool_name: 'Edit', tool_input: { file_path: P('Papers.md'), old_string: '[Cosenza](#3)', new_string: 'y' } })).toBe('deny');
  });
  it('DENIES editing a catalog H3 entry in Databases.md', () => {
    expect(decide({ tool_name: 'Edit', tool_input: { file_path: P('Databases.md'), old_string: '### [GEO](u)', new_string: '### [GEO2](u)' } })).toBe('deny');
  });
  it('DENIES a whole-file Write to Software.md', () => {
    expect(decide({ tool_name: 'Write', tool_input: { file_path: P('Software.md'), content: '# x' } })).toBe('deny');
  });
  it('DENIES editing a field-report H3 entry in FieldReports.md (structured)', () => {
    expect(decide({ tool_name: 'Edit', tool_input: { file_path: P('FieldReports.md'), old_string: '### [GFI State of the Industry](u)', new_string: '### [GFI](u)' } })).toBe('deny');
  });
  it('ALLOWS a prose-only edit in FieldReports.md', () => {
    expect(decide({ tool_name: 'Edit', tool_input: { file_path: P('FieldReports.md'), old_string: 'Recurring institutional surveys', new_string: 'Periodic institutional surveys' } })).toBeNull();
  });
  it('ALLOWS a prose-only edit in Papers.md', () => {
    expect(decide({ tool_name: 'Edit', tool_input: { file_path: P('Papers.md'), old_string: 'This document presents', new_string: 'This document collects' } })).toBeNull();
  });
  it('ALLOWS editing dataset narrative (not hooked)', () => {
    expect(decide({ tool_name: 'Edit', tool_input: { file_path: P('Datasets/Cow.md'), old_string: 'prose', new_string: 'prose2' } })).toBeNull();
  });
  it('ALLOWS editing a non-canonical site file', () => {
    expect(decide({ tool_name: 'Write', tool_input: { file_path: P('site/scripts/db/emit.ts'), content: 'x' } })).toBeNull();
  });
  it('DENIES only the structured member of a MultiEdit', () => {
    expect(decide({ tool_name: 'MultiEdit', tool_input: { file_path: P('Papers.md'), edits: [{ old_string: 'prose', new_string: 'p2' }, { old_string: '<a id="9">9</a>', new_string: 'z' }] } })).toBe('deny');
  });
});

/**
 * Worktrees live at <repo>/.claude/worktrees/<name>/, so every path inside one
 * contains "/.claude/" and used to hit the hook's exclusion for config files —
 * silently disabling the guard in the workspace CLAUDE.md tells you to use.
 * These pin literal worktree paths so the case is covered wherever the suite
 * runs, not only when it happens to run inside a worktree itself.
 */
describe('block-generated-edits hook — inside a git worktree', () => {
  const WT = (rel: string) => join(REPO_ROOT, '.claude', 'worktrees', 'some-feature', rel);

  it('DENIES a structured edit to Papers.md through a worktree path', () => {
    expect(decide({ tool_name: 'Edit', tool_input: { file_path: WT('Papers.md'), old_string: '<a id="1">1</a> X', new_string: 'y' } })).toBe('deny');
  });
  it('DENIES a whole-file Write to Software.md through a worktree path', () => {
    expect(decide({ tool_name: 'Write', tool_input: { file_path: WT('Software.md'), content: '# x' } })).toBe('deny');
  });
  it('DENIES a catalog H3 edit in Databases.md through a worktree path', () => {
    expect(decide({ tool_name: 'Edit', tool_input: { file_path: WT('Databases.md'), old_string: '### [GEO](u)', new_string: '### [GEO2](u)' } })).toBe('deny');
  });

  // Re-rooting must not over-match: a worktree's own config and site files are
  // still excluded, exactly as in the primary checkout.
  it('ALLOWS a worktree .claude config file', () => {
    expect(decide({ tool_name: 'Write', tool_input: { file_path: WT('.claude/settings.json'), content: '{}' } })).toBeNull();
  });
  it('ALLOWS a worktree site file', () => {
    expect(decide({ tool_name: 'Write', tool_input: { file_path: WT('site/scripts/db/emit.ts'), content: 'x' } })).toBeNull();
  });
  it('ALLOWS a prose-only edit in a worktree Papers.md', () => {
    expect(decide({ tool_name: 'Edit', tool_input: { file_path: WT('Papers.md'), old_string: 'This document presents', new_string: 'This document collects' } })).toBeNull();
  });
});

/**
 * A path is judged by where it sits inside its checkout, never by the directories above the
 * checkout. The hook once substring-matched "/site/", "/docs/" and "/.claude/" against the
 * absolute path, so a clone that itself lived under such a directory (~/docs/caail,
 * ~/site/caail) had the guard switched off for every file, with no signal.
 *
 * Every checkout here is built in a temp dir: a directory carrying a copy of the hook at
 * .claude/hooks/, where a clone carries it, and nothing else. Nothing is read from the repo
 * the suite runs in, so the cases hold wherever that repo happens to live.
 */
describe('block-generated-edits hook: judged by the path inside the checkout', () => {
  let tmp = '';
  beforeAll(() => { tmp = mkdtempSync(join(tmpdir(), 'caail-hook-')); });
  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  const HOOK_REL = join('.claude', 'hooks', 'block-generated-edits.py');
  /** Make `root` a checkout (idempotent) and return it. */
  function plant(root: string): string {
    mkdirSync(join(root, '.claude', 'hooks'), { recursive: true });
    copyFileSync(HOOK, join(root, HOOK_REL));
    return root;
  }
  /** A checkout at <tmp>/<parent>/caail. */
  const checkout = (parent: string) => plant(join(tmp, parent, 'caail'));
  const hookOf = (root: string) => join(root, HOOK_REL);
  const write = (file: string) => ({ tool_name: 'Write', tool_input: { file_path: file, content: '# x' } });

  describe.each(['docs', 'site', '.claude'])('a checkout that itself sits under %s/', (parent) => {
    // The checkout's own hook, as $CLAUDE_PROJECT_DIR in .claude/settings.json runs it.
    it('DENIES a whole-file Write to its Papers.md', () => {
      const root = checkout(parent);
      expect(decide(write(join(root, 'Papers.md')), hookOf(root))).toBe('deny');
    });
    it('DENIES a catalog H3 edit in its Databases.md', () => {
      const root = checkout(parent);
      const edit = { tool_name: 'Edit', tool_input: { file_path: join(root, 'Databases.md'), old_string: '### [GEO](u)', new_string: '### [GEO2](u)' } };
      expect(decide(edit, hookOf(root))).toBe('deny');
    });
    it.each(['site/src/Papers.md', 'docs/Papers.md', '.claude/scratch/Papers.md'])(
      'ALLOWS %s, under the checkout\'s own excluded directory', (rel) => {
        const root = checkout(parent);
        expect(decide(write(join(root, rel)), hookOf(root))).toBeNull();
      });

    describe('and a worktree inside it', () => {
      const tree = (root: string) => plant(join(root, '.claude', 'worktrees', 'feature'));
      it('DENIES a Write to the worktree\'s Papers.md through the worktree\'s own hook', () => {
        const wt = tree(checkout(parent));
        expect(decide(write(join(wt, 'Papers.md')), hookOf(wt))).toBe('deny');
      });
      it('DENIES a Write to the worktree\'s Papers.md through the primary checkout\'s hook', () => {
        const root = checkout(parent);
        const wt = tree(root);
        expect(decide(write(join(wt, 'Papers.md')), hookOf(root))).toBe('deny');
      });
      it('DENIES a Write to Papers.md in a worktree directory holding no copy of the hook', () => {
        const root = checkout(parent);
        expect(decide(write(join(root, '.claude', 'worktrees', 'bare', 'Papers.md')), hookOf(root))).toBe('deny');
      });
      it.each(['site/src/Papers.md', 'docs/Papers.md', '.claude/scratch/Papers.md'])(
        'ALLOWS the worktree\'s own %s', (rel) => {
          const wt = tree(checkout(parent));
          expect(decide(write(join(wt, rel)), hookOf(wt))).toBeNull();
        });
    });
  });

  it('DENIES a path that climbs out of site/ with ".." back to the checkout\'s Papers.md', () => {
    const root = checkout('plain');
    expect(decide(write(`${root}/site/../Papers.md`), hookOf(root))).toBe('deny');
  });

  // A path in no checkout cannot be placed inside one, so it is judged by its name alone:
  // the guard fails closed rather than guessing that a "docs" above it is the repo's own.
  it('DENIES a catalog file name in no checkout at all, even under a docs/ directory', () => {
    expect(decide(write(join(tmp, 'docs', 'loose', 'Papers.md')), hookOf(checkout('plain')))).toBe('deny');
  });
});
