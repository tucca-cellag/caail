import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  SKILL_PATH,
  TEMPLATE_DIR,
  readClaims,
  readFields,
  verifyContributeForms,
} from './contribute-form.js';

const SKILL = readFileSync(SKILL_PATH, 'utf-8');

/** Every template the skill claims, so a scenario can copy the real set. */
const TEMPLATES = readClaims(SKILL).map((c) => c.template);

const paperFields = (): ReturnType<typeof readFields> =>
  readFields(readFileSync(join(TEMPLATE_DIR, 'paper.yml'), 'utf-8'));

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
      if (edited === src) throw new Error(`the ${t} edit matched nothing, so this proves nothing`);
      writeFileSync(join(dir, t), edited, 'utf-8');
    } else {
      copyFileSync(join(TEMPLATE_DIR, t), join(dir, t));
    }
  }

  const skillPath = join(dir, 'SKILL.md');
  const skill = opts.skill ? opts.skill(SKILL) : SKILL;
  if (opts.skill && skill === SKILL) throw new Error('the skill edit matched nothing');
  writeFileSync(skillPath, skill, 'utf-8');

  return () => verifyContributeForms(skillPath, dir);
}

/** Append a field to a template, so a scenario can add one of any type/requiredness. */
const appendField = (type: string, id: string, required: boolean) => (src: string) =>
  `${src}\n  - type: ${type}\n    id: ${id}\n    attributes:\n      label: Added\n` +
  (required ? '    validations:\n      required: true\n' : '');

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

  it('sees a field whose id and type are quoted, which YAML treats as identical', () => {
    // A quoted id made the whole field invisible, taking its `required` flag with it — the
    // exact regression assertRequiredCovered exists to stop, under a spelling YAML considers
    // the same. The quoted type was the mirror: it captured `"input"` with the quotes and
    // reported a perfectly prefillable field as unprefillable.
    const src = [
      '  - type: "input"',
      '    id: "species"',
      '    validations:',
      '      required: true',
    ].join('\n');
    expect(readFields(src)).toEqual([{ id: 'species', type: 'input', required: true }]);
  });

  it('reads a tagged-scalar type, which the regex reader deleted the field for', () => {
    // The round-11 reader counted `- type:` lines and threw here, on the ground that it could not
    // parse one. The parser reads all three fields, which is what the template always meant.
    const src = [
      '  - type: input',
      '    id: doi',
      '  - type: !!str dropdown',
      '    id: species',
      '    validations:',
      '      required: true',
      '  - type: input',
      '    id: notes',
    ].join('\n');
    expect(readFields(src).map((f) => f.id)).toEqual(['doi', 'species', 'notes']);
    expect(readFields(src).find((f) => f.id === 'species')?.required).toBe(true);
  });

  it('throws on a REQUIRED field with no id, which can never be prefilled', () => {
    const src = [
      '  - type: dropdown',
      '    attributes:',
      '      label: No id here',
      '    validations:',
      '      required: true',
    ].join('\n');
    expect(() => readFields(src)).toThrow(/required "- type: dropdown" field/);
  });

  it('names the file it was given when the YAML is invalid', () => {
    // The one build-aborting error that used to name nothing: readFields hardcoded a label while
    // verifyContributeForms had the path in hand, so a mis-indented paper.yml aborted the build
    // saying only "this issue form".
    expect(() => readFields('body:\n  - type: input\n   id: bad\n', 'paper.yml')).toThrow(
      /paper\.yml is not valid YAML/,
    );
  });

  it('still sees a field whose keys carry trailing comments', () => {
    // A `[ \t]*$` anchor made this field vanish entirely, taking its required flag with it.
    const src = [
      '  - type: dropdown # picked by hand',
      '    id: species # new axis',
      '    validations:',
      '      required: true # must answer',
    ].join('\n');
    expect(readFields(src)).toEqual([{ id: 'species', type: 'dropdown', required: true }]);
  });
});

describe('readClaims', () => {
  it('finds both lists for every template the skill composes for', () => {
    const claims = readClaims(SKILL);
    expect(claims.map((c) => c.template)).toContain('paper.yml');
    const paper = claims.find((c) => c.template === 'paper.yml')!;
    expect(paper.prefill).toContain('doi');
    expect(paper.manual).toContain('ai_methods');
  });

  it('ignores the worked URL example, which also names a template', () => {
    expect(SKILL).toContain('issues/new?template=paper.yml');
    expect(readClaims(SKILL).filter((c) => c.template === 'paper.yml')).toHaveLength(1);
  });

  it('throws when the wording it anchors on is gone, rather than checking nothing', () => {
    expect(() => readClaims('# a skill with no prefill claims')).toThrow(/no prefill claims found/);
  });

  it('survives the intro wrapping across a line break', () => {
    // The earlier `[^\n]*` anchor required the template marker and the heading to share a line,
    // so reflowing one break dropped resource.yml from coverage entirely, with no error.
    const reflowed = SKILL.replace(
      '**Software, datasets, databases and other resources** (`template=resource.yml`), prefillable\nparameters:',
      '**Software, datasets, databases and other resources**\n(`template=resource.yml`),\nprefillable parameters:',
    );
    expect(reflowed).not.toBe(SKILL);
    expect(readClaims(reflowed).map((c) => c.template)).toContain('resource.yml');
  });

  it('reads a parameter list that wraps onto a second line', () => {
    // Reading only the first non-empty line dropped the list's TAIL, which is where the optional
    // parameters sit. Optional means assertRequiredCovered never rescues them, so the loss was
    // total and silent.
    const wrapped = SKILL.replace(
      '`paper_title`, `authors`, `year`, `venue`, `doi`, `code_url`, `notes`',
      '`paper_title`, `authors`, `year`, `venue`, `doi`,\n`code_url`, `notes`',
    );
    expect(wrapped).not.toBe(SKILL);
    const paper = readClaims(wrapped).find((c) => c.template === 'paper.yml')!;
    expect(paper.prefill).toContain('code_url');
    expect(paper.prefill).toContain('notes');
  });

  it('throws when a parameter list is split across a blank line', () => {
    // The tail is where the optional parameters live (`notes` on resource.yml), and optional
    // means assertRequiredCovered never rescues them. Silently reading the first paragraph
    // would leave the skill setting a `notes=` parameter a later rename had made dead.
    const split = SKILL.replace(
      '`name`, `url`, `category`, `summary`, `notes`',
      '`name`, `url`, `category`, `summary`,\n\n`notes`',
    );
    expect(split).not.toBe(SKILL);
    expect(() => readClaims(split)).toThrow(/continues after a break/);
  });

  it('throws when the list resumes after an intervening paragraph of prose', () => {
    // The shape the earlier guard did not scan: it only inspected the paragraph immediately
    // after the list, so `list / prose / more list` dropped its tail in silence.
    const interrupted = SKILL.replace(
      '`paper_title`, `authors`, `year`, `venue`, `doi`, `code_url`, `notes`',
      '`paper_title`, `authors`, `year`, `venue`, `doi`, `notes`\n\nAnd also, less commonly:\n\n`code_url`',
    );
    expect(interrupted).not.toBe(SKILL);
    expect(() => readClaims(interrupted)).toThrow(/continues after a break/);
  });

  it('does not mistake the next claim\'s own list for a stray continuation', () => {
    // The scan window has to stop at the next `(template=…)` intro, or every later list in the
    // file reads as a stray and the committed skill itself would fail.
    expect(() => readClaims(SKILL)).not.toThrow();
  });

  it('throws on a continuation line carrying a word, rather than dropping its tail', () => {
    // The case a pure shape test got wrong: `code_url` and `notes` reflowed onto a second line
    // with a conjunction. "The list ended" and "the list continued in a form I did not expect"
    // look identical, so the reader must refuse to guess.
    const conjoined = SKILL.replace(
      '`paper_title`, `authors`, `year`, `venue`, `doi`, `code_url`, `notes`',
      '`paper_title`, `authors`, `year`, `venue`, `doi`,\n`code_url` and `notes`',
    );
    expect(conjoined).not.toBe(SKILL);
    expect(() => readClaims(conjoined)).toThrow(/runs into a line that is not part of it/);
  });

  it('throws when the paragraph after the list is joined onto it', () => {
    // The paragraph after the resource list opens "**Set `title` as well.**". Reading on would
    // demand a field id `title` from a template where RESERVED_FIELD_IDS forbids exactly that,
    // sending the maintainer to fix the wrong file over a whitespace slip in the skill.
    const joined = SKILL.replace(
      '`resource_type`\n\n**Set `title` as well.**',
      '`resource_type`\n**Set `title` as well.**',
    );
    expect(joined).not.toBe(SKILL);
    expect(() => readClaims(joined)).toThrow(/runs into a line that is not part of it/);
    expect(() => readClaims(joined)).not.toThrow(/paper_title/);
  });

  it('stops the parameter list at the blank line, not at the next paragraph', () => {
    const paper = readClaims(SKILL).find((c) => c.template === 'paper.yml')!;
    // Would pick up prose words from the following paragraph if the block ran on.
    expect(paper.prefill).toEqual([
      'paper_title',
      'authors',
      'year',
      'venue',
      'doi',
      'code_url',
      'notes',
    ]);
  });

  it('throws when a mentioned template has no prefill list at all', () => {
    const run = stage({
      skill: (s) =>
        s.replace(
          '**Software, datasets, databases and other resources** (`template=resource.yml`), prefillable\nparameters:',
          '**Software, datasets, databases and other resources** (`template=resource.yml`), fine\nprint:',
        ),
    });
    expect(run).toThrow(/mentions the template\(s\) "resource\.yml"/);
  });

  it('throws when one template declares the same list twice', () => {
    const dup =
      '\n\n**Preprints** (`template=paper.yml`), prefillable parameters:\n\n`doi`\n';
    expect(() => readClaims(SKILL + dup)).toThrow(/declares "prefillable parameters" for "paper\.yml" more than once/);
  });

  it('quotes a heading that exists in the skill, not the regex it was matched with', () => {
    const run = stage({
      skill: (s) => s.replace('`paper_type`, `ai_methods`, `research_areas`', 'none'),
    });
    expect(run).toThrow(/"fields to pick by hand"/);
    expect(run).not.toThrow(/\\s\+/);
  });

  it('throws when a pick-by-hand list names a template no prefill list does', () => {
    // Caught by the mentioned-template check rather than a separate orphan check: the typo'd
    // name is itself a mention, so one guard covers it and names the file to fix.
    const run = stage({
      skill: (s) =>
        s.replace(
          '(`template=resource.yml`), fields to pick by\nhand:',
          '(`template=resorce.yml`), fields to pick by\nhand:',
        ),
    });
    expect(run).toThrow(/mentions the template\(s\) "resorce\.yml"/);
  });
});

describe('verifyContributeForms', () => {
  it('passes against the committed skill and templates', () => {
    expect(() => verifyContributeForms()).not.toThrow();
  });

  it('still sees a field written id-first, rather than losing it', () => {
    // Round 12's finding: the item contributes no `- type:` line, so every scanner missed it.
    // A parser reads it, so the claim still reconciles and nothing needs to know it was rewritten.
    const run = stage({
      template: [
        'paper.yml',
        (s) => s.replace('  - type: input\n    id: venue', '  - id: venue\n    type: input'),
      ],
    });
    expect(run).not.toThrow();
  });

  it('keeps covering a required field written id-first, which is what vanishing cost', () => {
    // The consequence that made the spelling matter: an unseen field takes its required flag with
    // it, so assertRequiredCovered stops covering it and a blank required box reaches a
    // contributor. Asserted by adding one the skill does not claim, and requiring the complaint.
    const run = stage({
      template: [
        'paper.yml',
        (s) =>
          `${s}\n  - id: species\n    type: dropdown\n    attributes:\n      label: Species\n    validations:\n      required: true\n`,
      ],
    });
    expect(run).toThrow(/requires "species" \(type: dropdown\)/);
  });

  it('checks the worked URL example however its query string is ordered', () => {
    // The guard matched the literal `issues/new?template=<t>`, so putting `title=` first — a
    // natural edit — turned the whole check into a silent no-op. That is the failure class the
    // check exists to catch, occurring in the check.
    const run = stage({
      skill: (s) =>
        s.replace(
          'issues/new?template=paper.yml&title=...&paper_title=...&doi=...',
          'issues/new?title=...&template=paper.yml&paper_title=...&summary=...',
        ),
    });
    expect(run).toThrow(/sets "summary"/);
  });

  it('fails when the skill carries no worked URL example at all', () => {
    // A guard over an empty set passes forever, so deleting the example would otherwise retire
    // the check rather than trip it.
    const run = stage({ skill: (s) => s.replace(/^https:\/\/github\.com\/.*issues\/new\?.*$/m, 'none') });
    expect(run).toThrow(/contains no worked "issues\/new\?" URL example/);
  });

  it('fails when the worked URL example sets a parameter the list does not claim', () => {
    // The example is what an agent copies, so a parameter only it names is one GitHub drops.
    const run = stage({
      skill: (s) => s.replace('&paper_title=...&doi=...', '&paper_title=...&summary=...'),
    });
    expect(run).toThrow(/worked URL example .* sets "summary"/s);
  });

  it('bounds the stray-continuation scan at the next heading', () => {
    // Without the heading bound the LAST claim's window ran to end of file, so a later paragraph
    // that happened to be only code spans failed the build naming a list nowhere near it.
    const withLater = SKILL.replace(
      '## Rules',
      '## Rules\n\n`stop suggesting`, `not interested`\n',
    );
    expect(withLater).not.toBe(SKILL);
    expect(() => readClaims(withLater)).not.toThrow();
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

  it('fails when the skill asks the reader to hand-fill something it could prefill', () => {
    const run = stage({
      skill: (s) => s.replace('`paper_type`, `ai_methods`', '`paper_type`, `venue`, `ai_methods`'),
    });
    expect(run).toThrow(/"venue" by hand on paper\.yml, but type: input prefills/);
  });

  it('fails when a template reuses a field id GitHub reserves', () => {
    const run = stage({ template: ['paper.yml', (s) => s.replace('id: paper_title', 'id: title')] });
    expect(run).toThrow(/reserves for its own/);
  });

  it('fails on `template`, the reserved id every composed URL already carries', () => {
    const run = stage({ template: ['paper.yml', (s) => s.replace('id: venue', 'id: template')] });
    expect(run).toThrow(/reserves for its own/);
  });

  it('names the missing file itself when a template name is wrong in both lists', () => {
    const run = stage({ skill: (s) => s.replaceAll('template=resource.yml', 'template=resorce.yml') });
    expect(run).toThrow(/composes URLs for "resorce\.yml", which does not exist/);
  });

  it('fails when a new required input is added that the skill does not fill', () => {
    const run = stage({ template: ['paper.yml', appendField('input', 'funder', true)] });
    expect(run).toThrow(/requires "funder" \(type: input\)/);
  });

  // The regression that motivated checking required fields of EVERY type. Under the earlier
  // type-filtered check this passed silently, and the shipped skill went on naming three
  // pick-by-hand fields while the composed issue carried a fourth blank required dropdown.
  it('fails when a new required DROPDOWN is added that the skill never mentions', () => {
    const run = stage({ template: ['paper.yml', appendField('dropdown', 'species', true)] });
    expect(run).toThrow(/requires "species" \(type: dropdown\)/);
  });

  it('ignores a new OPTIONAL field, which submits fine left blank', () => {
    const run = stage({ template: ['paper.yml', appendField('dropdown', 'species', false)] });
    expect(run).not.toThrow();
  });

  it('does not extend the confirmations exemption to a field of another type', () => {
    // The exemption is justified entirely by the field being a confirmation CHECKBOX. Matching on
    // id alone would hand that reasoning to a required input, whose blank box does reach someone.
    const run = stage({ template: ['resource.yml', appendField('input', 'confirmations', true)] });
    expect(run).toThrow(/requires "confirmations" \(type: input\)/);
  });

  it('exempts only the confirmations field, not required checkboxes generally', () => {
    // Proves UNPREFILLED_BY_DESIGN is load-bearing and narrow: the committed `confirmations`
    // field is required checkboxes and passes, while a second required checkboxes field does not.
    expect(paperFields().find((f) => f.id === 'confirmations')).toEqual({
      id: 'confirmations',
      type: 'checkboxes',
      required: true,
    });
    expect(() => verifyContributeForms()).not.toThrow();

    const run = stage({ template: ['paper.yml', appendField('checkboxes', 'consent', true)] });
    expect(run).toThrow(/requires "consent" \(type: checkboxes\)/);
  });

  it('names the skill it was actually given, not the committed one, when a claim is empty', () => {
    const run = stage({
      skill: (s) => s.replace('`paper_type`, `ai_methods`, `research_areas`', 'none'),
    });
    expect(run).toThrow(/caail-contribute-/);
    expect(run).not.toThrow(/plugin-contribute/);
  });
});
