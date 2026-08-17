import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  SKILL_PATH,
  TEMPLATE_DIR,
  readFields,
  readPrefillClaims,
  verifyContributeForms,
} from './contribute-form.js';

const SKILL = readFileSync(SKILL_PATH, 'utf-8');

/** Every template the skill claims to prefill, so a scenario can copy the real set. */
const TEMPLATES = readPrefillClaims(SKILL).map((c) => c.template);

/**
 * Stage the REAL skill and the REAL templates in a temp directory, optionally editing one of
 * each, and return a thunk that verifies the result.
 *
 * Edits of the committed files rather than hand-written fixtures, for the reason
 * correction-form.test.ts gives: a fixture that has drifted from the interface it stands in for
 * proves nothing. Each edit asserts it changed something, so a test cannot quietly stop
 * exercising the defect it guards.
 */
function stage(
  opts: { skill?: (src: string) => string; template?: [string, (src: string) => string] } = {},
): () => ReturnType<typeof verifyContributeForms> {
  const dir = mkdtempSync(join(tmpdir(), 'caail-contribute-'));

  for (const t of TEMPLATES) {
    const src = readFileSync(join(TEMPLATE_DIR, t), 'utf-8');
    if (opts.template && opts.template[0] === t) {
      const edited = opts.template[1](src);
      if (edited === src) throw new Error(`the ${t} edit matched nothing, so this test proves nothing`);
      writeFileSync(join(dir, t), edited, 'utf-8');
    } else {
      copyFileSync(join(TEMPLATE_DIR, t), join(dir, t));
    }
  }

  const skillPath = join(dir, 'SKILL.md');
  const skill = opts.skill ? opts.skill(SKILL) : SKILL;
  if (opts.skill && skill === SKILL) throw new Error('the skill edit matched nothing');
  writeFileSync(skillPath, skill, 'utf-8');

  return () => verifyContributeForms(skillPath, `${dir}/`);
}

describe('readFields', () => {
  it('reads a field regardless of where its id sits among the field keys', () => {
    const src = [
      '  - type: input',
      '    validations:',
      '      required: true',
      '    attributes:',
      '      label: Whatever',
      '    id: late_id',
    ].join('\n');
    expect(readFields(src)).toEqual([{ id: 'late_id', type: 'input', required: true }]);
  });

  it('skips markdown blocks, which carry no id and are not fields', () => {
    const src = ['  - type: markdown', '    attributes:', '      value: hello'].join('\n');
    expect(readFields(src)).toEqual([]);
  });

  it('does not let one field\'s required flag leak into the next', () => {
    const src = [
      '  - type: input',
      '    id: first',
      '    validations:',
      '      required: true',
      '  - type: input',
      '    id: second',
    ].join('\n');
    expect(readFields(src)).toEqual([
      { id: 'first', type: 'input', required: true },
      { id: 'second', type: 'input', required: false },
    ]);
  });
});

describe('readPrefillClaims', () => {
  it('finds a claim for every template the skill composes for', () => {
    expect(TEMPLATES.length).toBeGreaterThan(0);
    expect(TEMPLATES).toContain('paper.yml');
  });

  it('ignores the worked URL example, which also names a template', () => {
    // The example is the reason the anchor is the introducing sentence and not `template=`.
    expect(SKILL).toContain('issues/new?template=paper.yml');
    expect(readPrefillClaims(SKILL).filter((c) => c.template === 'paper.yml')).toHaveLength(1);
  });

  it('throws when the wording it anchors on is gone, rather than silently checking nothing', () => {
    expect(() => readPrefillClaims('# a skill with no prefill claims')).toThrow(
      /no prefill claims found/,
    );
  });
});

describe('verifyContributeForms', () => {
  it('passes against the committed skill and templates', () => {
    expect(() => verifyContributeForms()).not.toThrow();
  });

  it('fails when a template renames a field the skill prefills', () => {
    const run = stage({ template: ['paper.yml', (s) => s.replace('id: doi', 'id: doi_url')] });
    expect(run).toThrow(/no field id\(s\) "doi"/);
  });

  it('fails when a prefilled field becomes a dropdown, which silently does not prefill', () => {
    const run = stage({
      template: [
        'paper.yml',
        (s) => s.replace(/  - type: input\n    id: venue/, '  - type: dropdown\n    id: venue'),
      ],
    });
    expect(run).toThrow(/Only input and textarea prefill/);
  });

  it('fails when the skill tries to prefill one of the dropdowns', () => {
    const run = stage({
      skill: (s) => s.replace('`doi`, `code_url`', '`doi`, `ai_methods`, `code_url`'),
    });
    expect(run).toThrow(/"ai_methods" as type: dropdown/);
  });

  it('fails when a template reuses a field id GitHub reserves', () => {
    const run = stage({ template: ['paper.yml', (s) => s.replace('id: paper_title', 'id: title')] });
    expect(run).toThrow(/reserves for its own/);
  });

  it('fails when a new required input is added that the skill does not fill', () => {
    const run = stage({
      template: [
        'paper.yml',
        (s) =>
          `${s}\n  - type: input\n    id: funder\n    attributes:\n      label: Funder\n    validations:\n      required: true\n`,
      ],
    });
    expect(run).toThrow(/requires "funder"/);
  });

  it('does not object to a required field that cannot be prefilled anyway', () => {
    // research_areas is a required dropdown in the committed template, and the skill's job is
    // to tell the reader to pick it rather than to prefill it.
    const fields = readFields(readFileSync(join(TEMPLATE_DIR, 'paper.yml'), 'utf-8'));
    const areas = fields.find((f) => f.id === 'research_areas');
    expect(areas).toEqual({ id: 'research_areas', type: 'dropdown', required: true });
    expect(() => verifyContributeForms()).not.toThrow();
  });

  it('does not object to the confirmation checkboxes, which are never prefilled by design', () => {
    const fields = readFields(readFileSync(join(TEMPLATE_DIR, 'paper.yml'), 'utf-8'));
    expect(fields.find((f) => f.id === 'confirmations')?.required).toBe(true);
    expect(() => verifyContributeForms()).not.toThrow();
  });
});
