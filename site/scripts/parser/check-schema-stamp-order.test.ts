/**
 * The schema-stamp order guard (tucca-cellag/caail-planning#153): the rules as a pure function, then
 * the same rules read from commits in a scratch repository, including the revert that motivated it.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from '../db/lib.js';
import { checkSchemaStampOrder, schemaStampOrderProblem } from './check-schema-stamp-order.js';
import { SCHEMA_STAMP_PATH } from './schema-stamp.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const at = (version: number, sha256: string) => ({ version, sha256 });

describe('schemaStampOrderProblem', () => {
  it('passes the same stamp, a bump on a change of shape, a skipped number, and a base with no stamp', () => {
    expect(schemaStampOrderProblem(at(2, A), at(2, A))).toBeNull();
    expect(schemaStampOrderProblem(at(2, A), at(3, B))).toBeNull();
    expect(schemaStampOrderProblem(at(2, A), at(5, B))).toBeNull();
    expect(schemaStampOrderProblem(null, at(1, A))).toBeNull();
  });

  it('refuses a changed shape whose version is not above the base, naming the remedy', () => {
    const revert = schemaStampOrderProblem(at(2, A), at(1, B));
    expect(revert).toMatch(/schema version \(1\) is not above that tree's \(2\)/);
    expect(revert).toMatch(/pnpm --dir site schema:stamp, which bumps past it/);
    expect(schemaStampOrderProblem(at(2, A), at(2, B))).toMatch(/not above that tree's \(2\)/);
  });

  it('refuses the same shape under another version', () => {
    expect(schemaStampOrderProblem(at(2, A), at(3, A))).toMatch(/One shape keeps one version/);
    expect(schemaStampOrderProblem(at(2, A), at(1, A))).toMatch(/One shape keeps one version/);
  });
});

const STAMP_REL = relative(REPO_ROOT, SCHEMA_STAMP_PATH).split(sep).join('/');

function git(cwd: string, args: string[]): string {
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.org', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.org' };
  for (const v of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR']) delete env[v];
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf-8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Write the stamp file (or `raw` text) at its repository path and commit it. */
function commitStamp(root: string, stamp: { version: number; sha256: string } | string, message: string): void {
  const path = join(root, STAMP_REL);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof stamp === 'string' ? stamp : `${JSON.stringify(stamp, null, 2)}\n`);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
}

function scratchRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'schema-order-'));
  git(root, ['init', '-q', '-b', 'main']);
  writeFileSync(join(root, 'README'), 'x\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'base, before any stamp']);
  return root;
}

describe('checkSchemaStampOrder, read from commits', () => {
  it('passes the first stamp and a bump, and refuses the revert that restores an older one', () => {
    const root = scratchRepo();
    commitStamp(root, at(1, A), 'stamp v1');
    expect(checkSchemaStampOrder(root, 'HEAD^1')).toBeNull();
    commitStamp(root, at(2, B), 'shape change, v2');
    expect(checkSchemaStampOrder(root, 'HEAD^1')).toBeNull();
    git(root, ['revert', '--no-edit', 'HEAD']);
    expect(checkSchemaStampOrder(root, 'HEAD^1')).toMatch(/schema version \(1\) is not above that tree's \(2\)/);
    // The remedy: restore the base's stamp and bump past it.
    commitStamp(root, at(3, A), 'restamp after the revert');
    expect(checkSchemaStampOrder(root, 'HEAD~2')).toBeNull();
  });

  it('refuses a missing head stamp, notes an unparseable base, and names a bad ref', () => {
    const root = scratchRepo();
    expect(() => checkSchemaStampOrder(root, 'HEAD')).toThrow(/is not at HEAD/);
    commitStamp(root, '<<<<<<< HEAD\n', 'conflicted stamp');
    commitStamp(root, at(1, C), 'repaired stamp');
    const notes: string[] = [];
    expect(checkSchemaStampOrder(root, 'HEAD^1', 'HEAD', notes)).toBeNull();
    expect(notes.join('\n')).toMatch(/compared as if absent/);
    expect(() => checkSchemaStampOrder(root, 'no-such-ref')).toThrow(/schema:check-order: no-such-ref is not a commit/);
  });
});
