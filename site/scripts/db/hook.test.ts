/**
 * hook.test.ts — pins the PreToolUse guard (.claude/hooks/block-generated-edits.py):
 * structured edits to the generated catalog files are denied; prose edits, dataset
 * narrative, and non-canonical files are allowed. Shells the real hook exactly as
 * Claude Code would (tool JSON on stdin; a deny is a JSON object on stdout).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from './lib.js';

const HOOK = join(REPO_ROOT, '.claude', 'hooks', 'block-generated-edits.py');
const P = (rel: string) => join(REPO_ROOT, rel);

/** Run a copy of the hook; return its hookSpecificOutput, or null when it allows. */
function run(
  payload: object,
  hook = HOOK,
  opts: { cwd?: string } = {},
): { permissionDecision: string; permissionDecisionReason: string } | null {
  const out = execFileSync('python3', [hook], { input: JSON.stringify(payload), encoding: 'utf-8', cwd: opts.cwd }).trim();
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
  const HOOK_REL = join('.claude', 'hooks', 'block-generated-edits.py');
  let tmp = '';
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'caail-hook-'));
    // The no-checkout case below needs a temp dir that no checkout contains. A TMPDIR
    // pointed inside one would place every fixture in that checkout's excluded
    // directories, and the cases would fail with nothing wrong in the hook.
    for (let d = tmp; ; d = dirname(d)) {
      expect(existsSync(join(d, HOOK_REL)), `${d} holds a copy of the hook, so the fixtures sit inside a checkout`).toBe(false);
      if (dirname(d) === d) break;
    }
  });
  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

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
      // The worktree holds its own copy, so the primary's hook finds the worktree as the
      // file's checkout. The worktree-prefix strip is the next case's, where it holds none.
      it('DENIES a Write to the worktree\'s Papers.md when the primary checkout\'s hook runs on it', () => {
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

  // A relative path is resolved against the session's cwd from the hook input, which is where
  // the tool writes it, never against the directory the hook process started in.
  it.each([
    ['DENIES', 'the checkout root', '', 'deny'],
    ['ALLOWS', 'site/', 'site', null],
  ])('%s a relative Papers.md when the session cwd is %s, wherever the hook process runs', (_v, _where, cwdRel, want) => {
    const root = checkout('plain');
    mkdirSync(join(root, 'site'), { recursive: true });
    const payload = { ...write('Papers.md'), cwd: join(root, cwdRel) };
    // The process cwd is the opposite of the session's, so a hook reading it would get both wrong.
    const opts = { cwd: join(root, cwdRel === 'site' ? '' : 'site') };
    expect(run(payload, hookOf(root), opts)?.permissionDecision ?? null).toBe(want);
  });

  // A path in no checkout cannot be placed inside one, so it is judged by its name alone:
  // the guard fails closed rather than guessing that a "docs" above it is the repo's own.
  it('DENIES a catalog file name in no checkout at all, even under a docs/ directory', () => {
    expect(decide(write(join(tmp, 'docs', 'loose', 'Papers.md')), hookOf(checkout('plain')))).toBe('deny');
  });
  // The other direction: failing closed is for catalog names only, and an Edit outside a
  // checkout is still judged by its markup, so neither of these may be refused.
  it('ALLOWS a file in no checkout whose name is not a catalog file name', () => {
    expect(decide(write(join(tmp, 'docs', 'loose', 'README.md')), hookOf(checkout('plain')))).toBeNull();
  });
  it('ALLOWS a prose-only Edit to a catalog file name in no checkout', () => {
    const edit = { tool_name: 'Edit', tool_input: { file_path: join(tmp, 'docs', 'loose', 'Papers.md'), old_string: 'draft', new_string: 'final' } };
    expect(decide(edit, hookOf(checkout('plain')))).toBeNull();
  });
  it('says so when it refuses a file in no checkout, and not when the file is in one', () => {
    const root = checkout('plain');
    const loose = run(write(join(tmp, 'docs', 'loose', 'Papers.md')), hookOf(root))?.permissionDecisionReason ?? '';
    expect(loose.split('\n')[0]).toMatch(/in no CAAIL checkout .* refused as if it were one of CAAIL's catalog files/);
    const inside = run(write(join(root, 'Papers.md')), hookOf(root))?.permissionDecisionReason ?? '';
    expect(inside).not.toContain('no CAAIL checkout');
  });

  /**
   * The deny message is usually the first instruction a curator gets, so its edit flow has to
   * be one that works. There are two: edit caail.db (db:build, edit, db:export, db:emit), or
   * edit the NDJSON and run db:emit alone. They cannot be interleaved: db:export rewrites
   * every NDJSON file from caail.db, so an NDJSON edit followed by db:export is reverted with
   * no error, and a caail.db edit with no db:export never reaches the tracked NDJSON.
   */
  describe('the deny message', () => {
    let lines: string[] = [];
    beforeAll(() => {
      const root = checkout('plain');
      const out = run(write(join(root, 'Papers.md')), hookOf(root));
      lines = (out?.permissionDecisionReason ?? '').split('\n');
    });
    /** The db:* and parse commands a line runs, in order, read from its backticked commands. */
    const commands = (line: string) =>
      [...line.matchAll(/`([^`]+)`/g)].flatMap((m) => m[1].match(/\bdb:[a-z-]+|\bparse\b/g) ?? []);
    const editsDb = (line: string) => /\bedit (?:site\/)?caail\.db\b/.test(line);
    const editsNdjson = (line: string) => line.includes('site/db/ndjson/');

    it('gives the NDJSON route on lines of its own, ending in db:emit without db:export', () => {
      const ndjson = lines.filter(editsNdjson);
      expect(ndjson.length, 'no line tells the reader how to edit the NDJSON').toBeGreaterThan(0);
      for (const line of ndjson) {
        expect(editsDb(line), `the NDJSON route shares a line with the caail.db route: ${line}`).toBe(false);
        expect(commands(line)).toContain('db:emit');
        expect(commands(line)).not.toContain('db:export');
        // Plain text counts too: a sentence naming db:export on this route may only warn
        // against it, so "then run db:export" fails here even without backticks.
        for (const sentence of line.split(/(?<=\.)\s+/).filter((s) => s.includes('db:export'))) {
          expect(sentence, `the NDJSON route names db:export as a step: ${sentence}`).toMatch(/^Skip db:export\b/);
        }
      }
    });
    it('gives the caail.db route on one line, running db:build, then db:export before db:emit', () => {
      const db = lines.filter(editsDb);
      expect(db).toHaveLength(1);
      expect(commands(db[0])).toEqual(['db:build', 'db:export', 'db:emit']);
    });
    it('ends both routes with db:check, db:verify and parse, and says to commit what parse changed', () => {
      const routes = lines.findLastIndex((l) => editsDb(l) || editsNdjson(l));
      const tail = lines.slice(routes + 1).join('\n');
      expect(commands(tail)).toEqual(['db:check', 'db:verify', 'parse']);
      expect(tail).toContain('site/public/');
    });
  });
});
