import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  CORRECTION_TEMPLATE_PATH,
  REQUIRED_FIELD_IDS,
  buildCorrectionForm,
} from './correction-form.js';

const TEMPLATE = readFileSync(CORRECTION_TEMPLATE_PATH, 'utf-8');

/**
 * Write a variant of the REAL template to a temp file and return a thunk that builds
 * against it.
 *
 * Edits of the committed file rather than a hand-written fixture, so a test cannot pass
 * against a shape the template no longer has. A fixture that had drifted from its
 * interface is a defect this repo has already paid for once.
 */
function buildEdited(edit: (src: string) => string): () => ReturnType<typeof buildCorrectionForm> {
  const dir = mkdtempSync(join(tmpdir(), 'caail-correction-'));
  const path = join(dir, 'entry-correction.yml');
  const edited = edit(TEMPLATE);
  if (edited === TEMPLATE) throw new Error('the edit matched nothing, so this test proves nothing');
  writeFileSync(path, edited, 'utf-8');
  return () => buildCorrectionForm(path);
}

/**
 * Where the `reason` field's `- type:` item starts and ends, found INDEPENDENTLY of the
 * parser under test.
 *
 * The template carries three `input` fields, so `indexOf('  - type: input')` finds `item`
 * and the tests that reorder the reason field's keys would quietly rewrite the wrong one
 * and then assert nothing. It is located from `id: reason` outwards instead, which is the
 * one line that is unambiguous.
 */
function reasonFieldBounds(src: string): [number, number] {
  const anchor = src.indexOf('\n    id: reason\n');
  if (anchor < 0) throw new Error('the template has no `id: reason` field to edit');
  const next = src.indexOf('\n  - type:', anchor);
  return [src.lastIndexOf('\n  - type:', anchor) + 1, next < 0 ? src.length : next + 1];
}

/** Rewrite only the `reason` field, leaving the rest of the template byte-identical. */
function editReasonField(src: string, edit: (field: string) => string): string {
  const [start, end] = reasonFieldBounds(src);
  return src.slice(0, start) + edit(src.slice(start, end)) + src.slice(end);
}

describe('buildCorrectionForm against the committed template', () => {
  const form = buildCorrectionForm();

  it('reads every reason the form actually offers, and nothing else', () => {
    // Counted from the file rather than asserted as a literal: the number is the thing
    // most likely to change, and a hard-coded 8 here would be exactly the hand-typed
    // figure beside a derived one that this whole module exists to avoid.
    //
    // Sliced on the NEXT FIELD rather than on `validations:`, which is deliberately a
    // different rule from the one the parser uses, so this is an independent oracle and
    // not a restatement of the implementation. It matters: a naive count of every
    // 8-space list item after `id: reason` returns 10, because the `confirmations`
    // checkboxes further down the file are indented identically.
    const fromReason = TEMPLATE.slice(TEMPLATE.indexOf('id: reason'));
    const nextField = fromReason.search(/^ {2}- type:/m);
    const reasonField = nextField > 0 ? fromReason.slice(0, nextField) : fromReason;
    const optionCount = (reasonField.match(/^ {8}- /gm) ?? []).length;

    expect(optionCount).toBeGreaterThan(0);
    expect(form.reasons).toHaveLength(optionCount);
  });

  it('preserves each option verbatim as the value the curator will read', () => {
    for (const reason of form.reasons) {
      expect(TEMPLATE).toContain(reason.value);
    }
  });

  it('gives every reason a follow-up kind and a non-empty display label', () => {
    for (const reason of form.reasons) {
      expect(reason.kind, reason.value).toBeTruthy();
      expect(reason.label.length, reason.value).toBeGreaterThan(0);
      // The label is the option's own leading text, so it must be a prefix of it.
      expect(reason.value.startsWith(reason.label), reason.value).toBe(true);
    }
  });

  it('keeps form instructions out of the label, which is published verbatim', () => {
    // `label` is what reaches the composed body as `Problem: …`, and from there a public
    // GitHub issue. A trailing "(describe below)" is an instruction to whoever is filling
    // the form; published as the problem statement it reads as part of the report, and
    // "below" refers to a place the reader of the issue is not standing.
    //
    // The template's convention is that anything of that kind goes after an em dash, where
    // splitOption files it as a hint — shown beside the radio, never composed. So the rule
    // is simply that a label does not end in a parenthetical.
    for (const reason of form.reasons) {
      expect(reason.label, `${reason.value}: put the aside after an em dash`).not.toMatch(/\)$/);
    }
  });

  it('finds the field ids the page prefills', () => {
    // `item` is CAAIL-255's contract; `details` is where the composed body lands. GitHub
    // ignores a query parameter matching no field, so losing either is silent at runtime.
    for (const id of REQUIRED_FIELD_IDS) expect(form.fieldIds).toContain(id);
  });

  it('reads the reason field, not some other list in the file', () => {
    // The template opens with a markdown block and carries several fields; a reader that
    // grabbed the first `- ` lines it found would return prose, not error classes.
    for (const reason of form.reasons) {
      expect(reason.value).not.toMatch(/^\s*type:/);
      expect(reason.value.length).toBeGreaterThan(3);
    }
  });

  it('is unmoved by trailing YAML comments on the lines it anchors on', () => {
    // The sibling reader (contribute-form.ts) hit this as a real defect: an intolerant `$`
    // made a commented field vanish along with its `required` flag. Here it is quieter and
    // worse, because requiredConfirmations would return a wrong number rather than throw.
    const commented = buildEdited((s) =>
      s
        .replace('    id: reason', '    id: reason # the error class')
        .replace('    id: confirmations', '    id: confirmations # keep last')
        .replace(/^ {10}required: true$/m, '          required: true # must tick'),
    )();
    expect(commented.reasons.map((r) => r.value)).toEqual(form.reasons.map((r) => r.value));
    expect(commented.requiredConfirmations).toBe(form.requiredConfirmations);
    expect(commented.requiredConfirmations).toBeGreaterThan(0);
  });
});

describe('buildCorrectionForm fails loudly when the template drifts', () => {
  it('throws when the reason field is gone', () => {
    // Reported by the field-id check rather than by `reasonField`, because `reason` is one
    // of the parameters /report/ prefills and so is in REQUIRED_FIELD_IDS. That check runs
    // first and names the prefill consequence, which is the more useful of the two messages.
    expect(buildEdited((s) => s.replace('id: reason', 'id: why'))).toThrow(
      /missing the field id\(s\) "reason"/,
    );
  });

  it('throws when the reason field goes back to being a dropdown', () => {
    // The regression this exists for is entirely silent: GitHub accepts `reason=` for a
    // dropdown, ignores it, and opens the form with a blank REQUIRED field — under a review
    // step saying the only thing left is the confirmations. Nothing else in this suite, and
    // nothing on the page, distinguishes that from a working prefill.
    expect(
      buildEdited((s) =>
        editReasonField(s, (field) => field.replace('- type: input', '- type: dropdown')),
      ),
    ).toThrow(/is "type: dropdown", not "type: input"/);
  });

  it('throws when the description stops being a literal block', () => {
    // A folded block (`>`) joins its lines, so the eight bullets would arrive as one string.
    // `resolveReasons` would still reject that, but naming a reason head — which sends the
    // next reader looking at REASON_SPECS rather than at the block style that broke it.
    expect(
      buildEdited((s) =>
        editReasonField(s, (field) => field.replace('description: |', 'description: >')),
      ),
    ).toThrow(/no "description: \|" literal block/);
  });

  it('ignores prose in the description, which is where the instruction sentence lives', () => {
    // The list shares its block with the sentence telling the reader what to do with it, so
    // the read has to take the bullets and leave everything else. Asserted by adding more
    // prose rather than by reading the committed sentence, which is copy and will change.
    const form = buildEdited((s) =>
      editReasonField(s, (field) =>
        field.replace(
          /^ {8}- Wrong matrix placement/m,
          '        One more sentence of guidance, added by a curator.\n\n        - Wrong matrix placement',
        ),
      ),
    )();
    expect(form.reasons).toEqual(buildCorrectionForm().reasons);
  });

  it('throws when a prefilled field id is renamed away', () => {
    // The failure mode this catches is invisible on the page: GitHub opens the form and
    // silently leaves the field blank, handing the reader the empty box the whole route
    // exists to avoid.
    expect(buildEdited((s) => s.replace(/^ {4}id: details$/m, '    id: body'))).toThrow(
      /missing the field id\(s\) "details"/,
    );
  });

  it('throws when the template gains a reason the composer cannot ask about', () => {
    expect(
      buildEdited((s) =>
        s.replace(
          /^ {8}- Something else.*$/m,
          '        - Something else — describe it below\n        - A brand new error class',
        ),
      ),
    ).toThrow(/no reason head in REASON_SPECS matches/);
  });

  it('throws when a reason the composer knows about is deleted', () => {
    expect(buildEdited((s) => s.replace(/^ {8}- Wrong licence tier$/m, ''))).toThrow(
      /matched no option in the correction template: "Wrong licence tier"/,
    );
  });

  it('throws when an error class is renamed, since the follow-up would be wrong', () => {
    // Renaming the HEAD is a real change of meaning, so it should fail. Rewording the
    // trailing hint is not, and the next test proves that one is tolerated.
    expect(
      buildEdited((s) => s.replace('- Wrong licence tier', '- Incorrect licence tier')),
    ).toThrow(/no reason head in REASON_SPECS matches/);
  });

  it('reads the error classes when the field writes validations before attributes', () => {
    // YAML mappings are unordered and GitHub accepts the reason field's keys in any order.
    // Bounding the block on a trailing `validations:` therefore assumed something the
    // format does not guarantee: with the key moved up, the block ran to the end of the
    // file and swallowed the `confirmations` checkbox labels, which are `- ` items at the
    // same indent. It failed loudly, but named a checkbox and the wrong problem.
    const form = buildEdited((src) =>
      editReasonField(src, (field) => {
        const validations = /^ {4}validations:\n(?: {6}.*\n)+/m.exec(field)![0];
        return field
          .replace(validations, '')
          .replace('    attributes:', `${validations}    attributes:`);
      }),
    )();

    // Exactly the same vocabulary as the committed order produces, with no checkbox text.
    expect(form.reasons).toEqual(buildCorrectionForm().reasons);
    for (const reason of form.reasons) {
      expect(reason.value).not.toContain('I understand');
    }
  });

  it('reads the error classes when a blank line sits above the description key', () => {
    // `\s` matches a newline, so `/^\s*description:/m` could begin matching on the blank
    // line ABOVE the key. The slice then started one line early, its first line was '',
    // that line's indent read as 0, and the dedent bound never tripped: the block ran to
    // end of file and picked up everything below it including `type: checkboxes` and the
    // confirmation labels. One blank line in the template was the whole trigger.
    //
    // Edited inside the reason field only. Three fields carry a `description: |`, and the
    // first in the file belongs to `item`, so a bare replace would have moved a blank line
    // somewhere this test does not read from and then asserted that nothing broke.
    const form = buildEdited((src) =>
      editReasonField(src, (field) => field.replace(/^( +description: \|)$/m, '\n$1')),
    )();
    expect(form.reasons).toEqual(buildCorrectionForm().reasons);
    for (const reason of form.reasons) {
      expect(reason.value).not.toMatch(/^type:/);
      expect(reason.value).not.toContain('I understand');
    }
  });

  it('reads the error classes when the field writes its id after its attributes', () => {
    // The symmetric case to the reordering test above, and the one the earlier
    // "everything after `id: reason`" scope could not survive: with the anchor written
    // AFTER its own description, the search found the next matching key in the file and
    // returned something else entirely as the reason vocabulary.
    const form = buildEdited((src) =>
      editReasonField(src, (field) => {
        const idLine = /^ {4}id: reason\n/m.exec(field)![0];
        return field
          .replace(idLine, '')
          .replace(/^ {4}validations:$/m, `${idLine}    validations:`);
      }),
    )();

    expect(form.reasons).toEqual(buildCorrectionForm().reasons);
    for (const reason of form.reasons) {
      expect(reason.value).not.toContain('I understand');
    }
  });

  it('tolerates a reworded hint, which is prose and will be edited', () => {
    // The complement of the test above, and the whole reason a reason is identified by a
    // PREFIX rather than by its full option string: the explanation after the em dash is
    // copy, and editing copy must not fail a build.
    const form = buildEdited((src) =>
      src.replace(
        /^( {8}- Wrong matrix placement — ).*$/m,
        '$1a completely different explanation of the same thing',
      ),
    )();
    const placement = form.reasons.find((r) => r.head === 'Wrong matrix placement');
    expect(placement?.kind).toBe('matrix');
    expect(placement?.hint).toBe('a completely different explanation of the same thing');
  });
});
