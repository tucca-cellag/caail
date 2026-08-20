import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { TEMPLATE_DIR } from './contribute-form.js';
import { CORRECTION_TEMPLATE_PATH } from './correction-form.js';
import { assertEveryFieldOpensWithType } from './issue-form-fields.js';

describe('assertEveryFieldOpensWithType', () => {
  it('passes on every committed issue template', () => {
    for (const t of ['paper.yml', 'resource.yml', 'research-area.yml', 'entry-correction.yml']) {
      const src = readFileSync(join(TEMPLATE_DIR, t), 'utf-8');
      expect(() => assertEveryFieldOpensWithType(src, t), t).not.toThrow();
    }
    const correction = readFileSync(CORRECTION_TEMPLATE_PATH, 'utf-8');
    expect(() => assertEveryFieldOpensWithType(correction, 'entry-correction.yml')).not.toThrow();
  });

  it('catches a field written id-first, which contributes no `- type:` line at all', () => {
    // The case neither reader's loose-vs-strict `- type:` counter can see: there is no malformed
    // line to count. Both readers found only `doi` and `notes` here, and the required `species`
    // dropdown vanished with its required flag.
    const src = [
      '  - type: input',
      '    id: doi',
      '  - id: species',
      '    type: dropdown',
      '    validations:',
      '      required: true',
      '  - type: textarea',
      '    id: notes',
    ].join('\n');
    expect(() => assertEveryFieldOpensWithType(src, 'x.yml')).toThrow(/open with "id" rather than "type"/);
  });

  it('does not count `- label:` under a checkboxes field as a field', () => {
    // Confirmation options are list items with keys, at a deeper indent. Counting every `- <word>:`
    // would fail both committed templates, which is why the check derives the field indent.
    const src = [
      '  - type: checkboxes',
      '    id: confirmations',
      '    attributes:',
      '      options:',
      "        - label: I've searched existing entries.",
      '          required: true',
      '        - label: I accept the licence.',
      '          required: true',
    ].join('\n');
    expect(() => assertEveryFieldOpensWithType(src, 'x.yml')).not.toThrow();
  });

  it('throws when field items sit at more than one indentation', () => {
    const src = ['  - type: input', '    id: a', '      - type: input', '        id: b'].join('\n');
    expect(() => assertEveryFieldOpensWithType(src, 'x.yml')).toThrow(/not all at the same indentation/);
  });

  it('says nothing about a document with no fields, which each caller reports itself', () => {
    expect(() => assertEveryFieldOpensWithType('name: empty\nbody: []\n', 'x.yml')).not.toThrow();
  });
});
