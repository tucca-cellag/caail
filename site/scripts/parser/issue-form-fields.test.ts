import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { TEMPLATE_DIR } from './contribute-form.js';
import { CORRECTION_TEMPLATE_PATH } from './correction-form.js';
import { readIssueForm, findItem, requiredOptionCount } from './issue-form-fields.js';

const TEMPLATES = ['paper.yml', 'resource.yml', 'research-area.yml', 'entry-correction.yml'];

describe('readIssueForm against the committed templates', () => {
  it('reads every one without throwing', () => {
    for (const t of TEMPLATES) {
      const src = readFileSync(join(TEMPLATE_DIR, t), 'utf-8');
      expect(() => readIssueForm(src, t), t).not.toThrow();
    }
  });

  it('finds the fields the reconciler depends on', () => {
    const paper = readIssueForm(readFileSync(join(TEMPLATE_DIR, 'paper.yml'), 'utf-8'), 'paper.yml');
    const byId = new Map(paper.fields.map((f) => [f.id, f]));
    expect(byId.get('doi')).toEqual({ id: 'doi', type: 'input', required: true });
    expect(byId.get('code_url')).toEqual({ id: 'code_url', type: 'input', required: false });
    expect(byId.get('research_areas')?.type).toBe('dropdown');
    // No `markdown` block is a field.
    expect(paper.fields.some((f) => f.type === 'markdown')).toBe(false);
  });

  it('treats a checkboxes field as required via its options, not via validations', () => {
    // GitHub puts `required` in two places and `confirmations` uses only the second. The old regex
    // reader caught this by accident, matching `required: true` anywhere in the field's text.
    const src = readFileSync(join(TEMPLATE_DIR, 'paper.yml'), 'utf-8');
    const form = readIssueForm(src, 'paper.yml');
    const confirmations = findItem(form, 'confirmations')!;
    expect(confirmations.validations).toBeUndefined();
    expect(requiredOptionCount(confirmations)).toBeGreaterThan(0);
    expect(form.fields.find((f) => f.id === 'confirmations')?.required).toBe(true);
  });

  it('counts the correction template\'s required confirmations', () => {
    const src = readFileSync(CORRECTION_TEMPLATE_PATH, 'utf-8');
    const form = readIssueForm(src, CORRECTION_TEMPLATE_PATH);
    expect(requiredOptionCount(findItem(form, 'confirmations')!)).toBeGreaterThan(0);
  });
});

describe('readIssueForm reads the spellings the regex readers deleted', () => {
  // Each of these is a valid YAML spelling of the same document that a previous round found
  // silently dropping a field — id, type and `required: true` with it. To a parser they were never
  // different documents, which is the whole reason this module replaced the scanners.
  const required = { id: 'species', type: 'dropdown', required: true };

  it('key order: a field written id-first', () => {
    const src = ['- id: species', '  type: dropdown', '  validations:', '    required: true'].join('\n');
    expect(readIssueForm(src, 'x.yml').fields).toEqual([required]);
  });

  it('a tagged scalar type', () => {
    const src = ['- type: !!str dropdown', '  id: species', '  validations:', '    required: true'].join('\n');
    expect(readIssueForm(src, 'x.yml').fields).toEqual([required]);
  });

  it('quoted id and type', () => {
    const src = ['- type: "dropdown"', "  id: 'species'", '  validations:', '    required: true'].join('\n');
    expect(readIssueForm(src, 'x.yml').fields).toEqual([required]);
  });

  it('trailing comments on every key', () => {
    const src = [
      '- type: dropdown # picked by hand',
      '  id: species # new axis',
      '  validations:',
      '    required: true # must answer',
    ].join('\n');
    expect(readIssueForm(src, 'x.yml').fields).toEqual([required]);
  });

  it('flow style, which no line-oriented reader could have seen at all', () => {
    const src = '[{ type: dropdown, id: species, validations: { required: true } }]';
    expect(readIssueForm(src, 'x.yml').fields).toEqual([required]);
  });
});

describe('readIssueForm still fails loudly on what is genuinely wrong', () => {
  it('throws on invalid YAML, naming the document', () => {
    expect(() => readIssueForm('body:\n  - type: input\n   id: bad\n', 'x.yml')).toThrow(
      /x\.yml is not valid YAML/,
    );
  });

  it('throws when there is no body sequence', () => {
    expect(() => readIssueForm('name: only a name\n', 'x.yml')).toThrow(/has no "body:" sequence/);
  });

  it('throws on a REQUIRED field with no id, which can never be prefilled', () => {
    const src = [
      '- type: dropdown',
      '  attributes:',
      '    label: No id here',
      '  validations:',
      '    required: true',
    ].join('\n');
    expect(() => readIssueForm(src, 'x.yml')).toThrow(/required "- type: dropdown" field/);
  });

  it('accepts an OPTIONAL field with no id, which GitHub\'s schema allows', () => {
    // `id` is optional by GitHub's own schema, and an optional field without one is harmless:
    // nothing needs to prefill it and leaving it blank submits fine. Throwing here would turn a
    // legal template into a failed build and a blocked deploy, which is worse than what it guards.
    const src = ['- type: textarea', '  attributes:', '    label: Anything else?'].join('\n');
    expect(readIssueForm(src, 'x.yml').fields).toEqual([]);
  });

  it('skips a markdown block rather than demanding an id from it', () => {
    const src = ['- type: markdown', '  attributes:', '    value: hello'].join('\n');
    expect(readIssueForm(src, 'x.yml').fields).toEqual([]);
  });

  it('throws when an entry has no string type', () => {
    expect(() => readIssueForm('- id: orphan\n', 'x.yml')).toThrow(/has no string "type"/);
  });
});
