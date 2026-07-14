/**
 * hook.test.ts — pins the PreToolUse guard (.claude/hooks/block-generated-edits.py):
 * structured edits to the generated catalog files are denied; prose edits, dataset
 * narrative, and non-canonical files are allowed. Shells the real hook exactly as
 * Claude Code would (tool JSON on stdin; a deny is a JSON object on stdout).
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO_ROOT } from './lib.js';

const HOOK = join(REPO_ROOT, '.claude', 'hooks', 'block-generated-edits.py');
const P = (rel: string) => join(REPO_ROOT, rel);

/** Run the hook; return the permissionDecision ('deny') or null when it allows. */
function decide(payload: object): string | null {
  const out = execFileSync('python3', [HOOK], { input: JSON.stringify(payload), encoding: 'utf-8' }).trim();
  if (!out) return null;
  return JSON.parse(out).hookSpecificOutput.permissionDecision as string;
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
