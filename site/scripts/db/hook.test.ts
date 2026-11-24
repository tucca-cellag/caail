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
  opts: { cwd?: string; env?: Record<string, string> } = {},
): { permissionDecision: string; permissionDecisionReason: string } | null {
  const env = { ...process.env, ...opts.env };
  const out = execFileSync('python3', [hook], { input: JSON.stringify(payload), encoding: 'utf-8', cwd: opts.cwd, env }).trim();
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
 * macOS's default disk (APFS) is case-insensitive: it opens papers.md as Papers.md, so a
 * Write to the lowercase name replaces the whole generated file. It folds more than ASCII
 * case, too: it opens "Paperſ.md" (long s) as Papers.md and "ﬁeldReports.md" (the fi
 * ligature) as FieldReports.md. str.lower() misses both, and a regex with re.IGNORECASE
 * misses the ligature. Every name here is judged as text, so the cases hold on a
 * case-sensitive disk too.
 */
describe('block-generated-edits hook: a catalog name in another letter case', () => {
  it.each([
    ['papers.md', 'lowercase'],
    ['PAPERS.MD', 'uppercase'],
    ['software.md', 'lowercase'],
    ['dataBASES.md', 'mixed case'],
    ['fieldreports.md', 'lowercase'],
    ['Paperſ.md', 'a long s for the s'],
    ['ﬁeldReports.md', 'the fi ligature for fi'],
  ])('DENIES a whole-file Write to %s (%s)', (name) => {
    expect(decide({ tool_name: 'Write', tool_input: { file_path: P(name), content: '# x' } })).toBe('deny');
  });
  it('DENIES a structured Edit to papers.md', () => {
    expect(decide({ tool_name: 'Edit', tool_input: { file_path: P('papers.md'), old_string: '<a id="1">1</a> X', new_string: 'y' } })).toBe('deny');
  });
  it('DENIES a structured Edit to databases.md through a worktree path', () => {
    const file = join(REPO_ROOT, '.claude', 'worktrees', 'some-feature', 'databases.md');
    expect(decide({ tool_name: 'Edit', tool_input: { file_path: file, old_string: '### [GEO](u)', new_string: '### [GEO2](u)' } })).toBe('deny');
  });
  // The other direction: an Edit is still judged by its markup, and a name that only
  // contains a catalog name is a different file on every disk.
  it('ALLOWS a prose-only Edit to papers.md', () => {
    expect(decide({ tool_name: 'Edit', tool_input: { file_path: P('papers.md'), old_string: 'This document presents', new_string: 'This document collects' } })).toBeNull();
  });
  it.each(['papers.md.bak', 'MyPapers.md', 'papers.mdx', 'Papers2.md'])('ALLOWS a whole-file Write to %s', (name) => {
    expect(decide({ tool_name: 'Write', tool_input: { file_path: P(name), content: '# x' } })).toBeNull();
  });
  // Folding reaches only the checkout root. Below it the older rule holds as spelled: an
  // exact catalog name outside site/, docs/ and .claude/ is refused, and another spelling
  // is not.
  it.each(['Datasets/Papers.md', 'plugin/skills/caail/reference/Databases.md'])(
    'DENIES a whole-file Write to %s, an exact catalog name below the checkout root', (rel) => {
      expect(decide({ tool_name: 'Write', tool_input: { file_path: P(rel), content: '# x' } })).toBe('deny');
    });
  it.each([
    'Datasets/papers.md',
    'workers/ask/software.md',
    'plugin/skills/caail/reference/databases.md',
    'ResearchAreas/fieldreports.md',
  ])('ALLOWS a whole-file Write to %s, another spelling below the checkout root', (rel) => {
    expect(decide({ tool_name: 'Write', tool_input: { file_path: P(rel), content: '# x' } })).toBeNull();
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

  // A "~/" path names the home directory, not a directory called "~" under the session cwd,
  // so a file under the checkout's own site/ given that way is still allowed.
  it('ALLOWS a ~/ path to a file under the checkout\'s site/', () => {
    const root = checkout('plain');
    const payload = { ...write('~/plain/caail/site/src/Papers.md'), cwd: root };
    expect(run(payload, hookOf(root), { env: { HOME: tmp } })?.permissionDecision ?? null).toBeNull();
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
   * Only a name at the checkout root, or at a worktree's root once the exact
   * .claude/worktrees/<name>/ prefix is stripped, is matched in any letter case. Every other
   * rule matches as spelled, exactly as before folding existed: the worktree prefix, the
   * site/, docs/ and .claude/ exclusions, a catalog name below the root, and a name outside
   * any checkout. Each "as before" case is pinned in both directions, so a change to any of
   * them shows here.
   */
  describe('a path in another letter case', () => {
    it('DENIES a relative papers.md when the session cwd is the checkout root', () => {
      const root = checkout('plain');
      expect(run({ ...write('papers.md'), cwd: root }, hookOf(root))?.permissionDecision ?? null).toBe('deny');
    });
    it('DENIES papers.md at the root of a worktree holding no copy of the hook', () => {
      const root = checkout('plain');
      expect(decide(write(join(root, '.claude', 'worktrees', 'bare', 'papers.md')), hookOf(root))).toBe('deny');
    });
    // As before: an exact catalog name below the root is refused wherever it is not under an
    // exactly spelled site/, docs/ or .claude/. That covers a checkout nested outside
    // .claude/worktrees/ with no copy of the hook, and a worktree prefix spelled otherwise.
    it.each([
      '.worktrees/old/Papers.md',
      'SITE/src/Papers.md',
      '.CLAUDE/scratch/Papers.md',
      '.CLAUDE/worktrees/bare/Papers.md',
      '.Claude/Worktrees/x/site/Papers.md',
    ])('DENIES %s, an exact catalog name below the root, as before', (rel) => {
      const root = checkout('plain');
      expect(decide(write(join(root, rel)), hookOf(root))).toBe('deny');
    });
    // As before, and the limits this change accepts: below the root, and outside any
    // checkout, another spelling of a catalog name is not refused, even where a
    // case-insensitive disk would open it as a generated file, as in a nested checkout or a
    // worktree reached through a prefix spelled otherwise (here with a Kelvin sign for the k).
    it.each([
      '.worktrees/old/papers.md',
      '.Claude/Worktrees/bare/papers.md',
      '.claude/worKtrees/bare/Software.md',
      'Docs/papers.md',
      '.Claude/Worktrees/bare/Site/papers.md',
    ])('ALLOWS %s, another spelling below the root, as before', (rel) => {
      const root = checkout('plain');
      expect(decide(write(join(root, rel)), hookOf(root))).toBeNull();
    });
    it('ALLOWS papers.md in no checkout at all, where only the exact name is refused, as before', () => {
      expect(decide(write(join(tmp, 'docs', 'loose', 'papers.md')), hookOf(checkout('plain')))).toBeNull();
    });
    it.each(['site/src/papers.md', 'docs/Papers.md', '.claude/worktrees/bare/site/papers.md'])(
      'ALLOWS %s, under an excluded folder spelled exactly', (rel) => {
        const root = checkout('plain');
        expect(decide(write(join(root, rel)), hookOf(root))).toBeNull();
      });
    it('names the catalog file it refused as, and says why, only when the name was spelled otherwise', () => {
      const root = checkout('plain');
      const variant = run(write(join(root, 'papers.md')), hookOf(root))?.permissionDecisionReason ?? '';
      expect(variant.split('\n')[0]).toMatch(/^papers\.md was refused as Papers\.md: a case-insensitive disk/);
      expect(variant).toContain('Papers.md is generated from the SQLite authoring DB');
      const exact = run(write(join(root, 'Papers.md')), hookOf(root))?.permissionDecisionReason ?? '';
      expect(exact).not.toContain('case-insensitive');
    });
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
