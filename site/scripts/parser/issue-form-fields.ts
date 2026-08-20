/**
 * issue-form-fields.ts — read a GitHub issue form's fields, with a real YAML parser.
 *
 * WHY THIS REPLACED THE REGEX READERS, AND WHY THAT ARGUMENT CHANGED
 * ------------------------------------------------------------------
 * `contribute-form.ts` and `correction-form.ts` both used to find fields by scanning for the
 * `- type:` line that opens one, and both carried a docstring arguing a narrow hand-rolled reader
 * was the right answer for a document of known, committed shape. That argument was reasonable and
 * it turned out to be wrong, for a reason neither file could see from the inside: **YAML has many
 * spellings of the same document, and a regex has to enumerate them.** Three consecutive review
 * rounds each found a different one silently deleting a field:
 *
 *   - `id: "species"`            — a quoted scalar.
 *   - `- type: !!str dropdown`   — a tagged scalar, so the line stopped being a field boundary.
 *   - `- id: species`            — key order, so the item contributed no `- type:` line at all.
 *       `type: dropdown`
 *
 * Every one was patched, and the next round found the next spelling. They are one defect, and a
 * parser closes the class rather than the instance: all three of the above now simply read
 * correctly, because to `yaml` they were never different documents.
 *
 * The failure they shared is the expensive one. A field this reader cannot see does not error, it
 * **vanishes** — and takes `required: true` with it, so `assertRequiredCovered` stops covering a
 * required field and a contributor is handed a blank box GitHub refuses to submit. That is the
 * regression the whole reconciler exists to prevent, reachable by writing valid YAML.
 *
 * The dependency this cost is `yaml`, dev-only: nothing here ships to a browser, it runs in
 * `pnpm parse`.
 *
 * WHAT "REQUIRED" MEANS, WHICH IS NOT ONE KEY
 * -------------------------------------------
 * GitHub puts it in two places. Most fields carry `validations.required`. A `checkboxes` field does
 * not: each option carries its own `required`, and the committed `confirmations` field is required
 * only in that second sense. The old regex tested for `required: true` anywhere inside the field's
 * text, which happened to catch both and is why `confirmations` read as required. That behaviour is
 * correct and is kept deliberately rather than inherited: a field is required when answering it is
 * not optional, however the form says so.
 */

import { parse } from 'yaml';

/** One field of an issue form, as far as prefilling cares. */
export interface FormField {
  readonly id: string;
  readonly type: string;
  readonly required: boolean;
}

/** A parsed issue form: the fields, plus the raw items for a caller needing more. */
export interface IssueForm {
  readonly fields: readonly FormField[];
  /** The `body:` items as parsed, in document order, including `markdown` blocks. */
  readonly items: readonly Record<string, unknown>[];
}

/** How many of a field's checkbox options are marked required. Zero for a non-checkboxes field. */
export function requiredOptionCount(item: Record<string, unknown>): number {
  const attributes = item.attributes as { options?: unknown } | undefined;
  const options = Array.isArray(attributes?.options) ? attributes.options : [];
  return options.filter((o) => (o as { required?: unknown } | null)?.required === true).length;
}

/**
 * Parse an issue form and return its fields.
 *
 * Accepts a whole template (`{ name, body: [...] }`) or a bare sequence of field items, because
 * unit tests exercise the reader on fragments and a fragment is a valid YAML document.
 *
 * @param src    The issue-form YAML.
 * @param where  What to name in an error: a path, or a description of the document.
 * @throws       If the YAML is invalid, if `body` is not a sequence, or if any non-`markdown`
 *               field has no usable `id` or `type`.
 */
export function readIssueForm(src: string, where: string): IssueForm {
  let doc: unknown;
  try {
    doc = parse(src);
  } catch (err) {
    throw new Error(
      `issue-form: ${where} is not valid YAML, so none of its fields can be read and every ` +
        `check over them would silently cover nothing. ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const body = Array.isArray(doc) ? doc : (doc as { body?: unknown } | null)?.body;
  if (!Array.isArray(body)) {
    throw new Error(
      `issue-form: ${where} has no "body:" sequence, so it declares no fields. A template that ` +
        `parses but exposes nothing would let every check below pass over an empty set.`,
    );
  }

  const items = body.filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null);
  if (items.length !== body.length) {
    throw new Error(`issue-form: ${where} has a "body:" entry that is not a mapping.`);
  }

  const fields: FormField[] = [];
  for (const item of items) {
    const type = item.type;
    if (typeof type !== 'string') {
      throw new Error(
        `issue-form: a "body:" entry in ${where} has no string "type". Every field has one by ` +
          `GitHub's own schema, and without it this reader cannot tell a prefillable field from ` +
          `a dropdown that silently ignores the parameter.`,
      );
    }
    // `markdown` is prose shown to the reader and carries no id by GitHub's schema.
    if (type === 'markdown') continue;

    const validations = item.validations as { required?: unknown } | undefined;
    const required = validations?.required === true || requiredOptionCount(item) > 0;

    const id = item.id;
    if (typeof id !== 'string') {
      // `id` is OPTIONAL in GitHub's schema, and an optional field without one is legal and
      // harmless: nothing needs to prefill it, and leaving it blank submits fine. Throwing on
      // every id-less field would turn a valid template into a failed build and a blocked deploy,
      // which is a worse outcome than the one being guarded against.
      //
      // A REQUIRED field without an id is the case worth stopping: it can never be prefilled, by
      // this skill or anything else, so it reaches a contributor as a blank box they must fill by
      // hand under copy saying the form was filled in for them. That is the consequence this
      // throw was written for, and it is the only one it now covers.
      if (!required) continue;
      throw new Error(
        `issue-form: a required "- type: ${type}" field in ${where} has no string "id". GitHub ` +
          `prefills by matching a query parameter to an id, so a required field without one can ` +
          `never be filled in and reaches a contributor as a blank box. Give it an id, or make ` +
          `it optional.`,
      );
    }

    fields.push({ id, type, required });
  }

  return { fields, items };
}

/** The parsed `body:` item declaring `id`, or undefined. */
export function findItem(
  form: IssueForm,
  id: string,
): Record<string, unknown> | undefined {
  return form.items.find((i) => i.id === id);
}
