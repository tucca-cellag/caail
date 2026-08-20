/**
 * correction-form.ts — reads the GitHub issue form that /report/ composes against.
 *
 * WHY THE SITE READS THE TEMPLATE INSTEAD OF AGREEING WITH IT
 * -----------------------------------------------------------
 * `.github/ISSUE_TEMPLATE/entry-correction.yml` is the prefill contract. GitHub matches a
 * URL query parameter to a field's `id`, so a renamed field silently stops prefilling, and
 * the composer would offer a reason the form does not list. Both failures are invisible on
 * the page: the form still opens, it is just empty where it should be filled.
 *
 * Restating either list in the site's source would be the defect this repo pays for most
 * often — a hand-typed fact beside a machine-derived one with nothing checking they agree.
 * So the reasons and the field ids are READ from the template at build time, and
 * `resolveReasons` demands a bijection between the options and the follow-ups the composer
 * knows how to ask about. Reword an option's trailing hint and nothing breaks; rename the
 * error class, add a ninth option, or delete the `details` field, and the BUILD fails
 * naming the string it could not reconcile.
 *
 * WHERE THE VOCABULARY LIVES, AND WHY IT IS NOT AN `options:` LIST
 * ----------------------------------------------------------------
 * It used to be, because `reason` was a `dropdown`. A dropdown does not prefill — GitHub
 * takes the query parameter and ignores it — so the composer could compose the answer and
 * then had to ask the reader to pick it again by hand. Making the field an `input` fixed
 * that and cost the `options:` key, which was the vocabulary's home.
 *
 * The list therefore moved into the input's `description:`, where it is still exactly one
 * copy, still in the template, and still what the reader is shown. Only the KEY this module
 * reads it out of changed. The alternative — a bare input, with the eight class names
 * retyped in the site's source — is the defect above, reintroduced to buy a prefill.
 *
 * WHY THIS IS NOW A YAML PARSER, HAVING ARGUED THE OPPOSITE
 * ---------------------------------------------------------
 * This file used to say a narrow hand-rolled reader was right for a document of known, committed
 * shape, and that a real parser was only worth it for arbitrary YAML. That was wrong, and the
 * evidence is in `issue-form-fields.ts`: three consecutive review rounds each found a different
 * VALID spelling of the same template that made a field disappear from the reader, and here a
 * disappearing field did not error — it made `countRequiredConfirmations` publish a number the
 * form does not ask for. A regex reader has to enumerate YAML's spellings; a parser does not have
 * to know they differ. Field reading is now shared with contribute-form.ts through that module.
 *
 * What is still read by hand is the markdown list INSIDE the description string, which is markdown
 * and not YAML, so a YAML parser has nothing to say about it.
 */

import { readFileSync } from 'node:fs';

import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import { fileURLToPath } from 'node:url';

import { findItem, readIssueForm, requiredOptionCount } from './issue-form-fields.js';
import { CORRECTION_FIELDS } from '../../src/lib/report.js';
import { resolveReasons, type ResolvedReason } from '../../src/lib/report-compose.js';

/**
 * Absolute path to the correction template, resolved from this module's location
 * (parser → scripts → site → repo root), stable regardless of cwd. Mirrors
 * TAXONOMY_MD_PATH in taxonomy.ts.
 */
export const CORRECTION_TEMPLATE_PATH: string = fileURLToPath(
  new URL('../../../.github/ISSUE_TEMPLATE/entry-correction.yml', import.meta.url),
);

/**
 * The query parameters /report/ prefills, and therefore the field ids the template must
 * still carry.
 *
 * DERIVED from the URL builder rather than listed again here. `correctionIssueUrl` in
 * src/lib/report.ts sets exactly these keys, so a rename on that side moves this list with
 * it; typing them out here instead would leave a check that keeps asserting the old name
 * while the prefill silently stops. Losing a field is invisible at runtime — GitHub ignores
 * a query parameter that matches no field — which is why it is asserted at build time.
 */
export const REQUIRED_FIELD_IDS: readonly string[] = Object.values(CORRECTION_FIELDS);

/** The correction form, as far as the composer needs to know about it. */
export interface CorrectionForm {
  /** The `reason` field's listed error classes, resolved to the follow-up each one needs. */
  readonly reasons: readonly ResolvedReason[];
  /** Every `id:` the template declares, in document order. */
  readonly fieldIds: readonly string[];
  /**
   * How many confirmation checkboxes the form marks `required: true`.
   *
   * Same reason: the review step says what is left to do after the prefill, and the
   * confirmations are part of that. Counted so the page cannot claim a number the form
   * does not ask for, and so a form with none stops mentioning them at all.
   */
  readonly requiredConfirmations: number;
}

/**
 * The `reason` field's listed error classes, read from its `description:`.
 *
 * They are a markdown list inside the description rather than an `options:` list because the field
 * is an `input` (see the assertion in {@link buildCorrectionForm}): a `dropdown` would not prefill.
 * Non-bullet lines are prose and are skipped, which is what lets the description carry an
 * instruction sentence above the list.
 *
 * The block must be LITERAL (`|`), not folded (`>`). A folded block joins its lines, so the eight
 * bullets arrive as one string; `resolveReasons` would still reject that, but naming a reason head
 * rather than the block style that actually broke. Asserted against the parsed node's own type,
 * which is exact, where the previous reader inferred it from a regex over the raw text.
 */
function readReasonOptions(description: string, isLiteralBlock: boolean): string[] {
  if (!isLiteralBlock) {
    throw new Error(
      `correction-form: the "reason" field in ${CORRECTION_TEMPLATE_PATH} has no ` +
        `"description: |" literal block. That block is where its error classes are ` +
        `listed, and it is the only copy of that vocabulary.`,
    );
  }

  const options = description.split('\n').flatMap((line) => {
    const m = /^\s*-\s+(.+?)\s*$/.exec(line);
    return m ? [m[1]!] : [];
  });
  if (options.length === 0) {
    throw new Error(
      `correction-form: the "reason" field in ${CORRECTION_TEMPLATE_PATH} describes no ` +
        `error classes. Its description is expected to carry them as a markdown list.`,
    );
  }
  return options;
}

/**
 * Is the `reason` field's `description` written as a LITERAL block (`|`) rather than folded (`>`)?
 *
 * Asked of the parsed node's own block style, which is exact. The previous reader inferred it from
 * a regex over the raw text, and inferring a YAML property from its spelling is the whole class of
 * mistake this module was rewritten to leave behind.
 *
 * A folded block joins its lines, so the eight bullets arrive as one string and no bullet is found.
 * `resolveReasons` would still reject that, but naming a reason head rather than the block style
 * that actually broke, which sends the next reader to REASON_SPECS instead of to the template.
 */
function reasonDescriptionIsLiteral(src: string): boolean {
  const body = parseDocument(src).get('body');
  if (!isSeq(body)) return false;
  for (const item of body.items) {
    if (!isMap(item) || item.get('id') !== 'reason') continue;
    const attributes = item.get('attributes');
    if (!isMap(attributes)) return false;
    const description = attributes.get('description', true);
    return isScalar(description) && description.type === 'BLOCK_LITERAL';
  }
  return false;
}

/**
 * Build the correction-form model from the committed issue template.
 *
 * @param templatePath  Path to entry-correction.yml (defaults to the repo's).
 * @returns             The resolved reason vocabulary and the template's field ids.
 * @throws              If the reason field is missing, empty or no longer prefillable, if a
 *                      required field id has been renamed away, or if the listed error
 *                      classes and the composer's follow-up declarations are not in
 *                      bijection.
 */
export function buildCorrectionForm(
  templatePath: string = CORRECTION_TEMPLATE_PATH,
): CorrectionForm {
  const src = readFileSync(templatePath, 'utf-8');
  const form = readIssueForm(src, templatePath);

  const fieldIds = form.fields.map((f) => f.id);
  const missing = REQUIRED_FIELD_IDS.filter((id) => !fieldIds.includes(id));
  if (missing.length > 0) {
    throw new Error(
      `correction-form: ${templatePath} is missing the field id(s) ` +
        `${missing.map((m) => `"${m}"`).join(', ')}. GitHub prefills an issue form by ` +
        `matching a query parameter to a field's id, so a renamed field does not error — ` +
        `it silently arrives blank, and the reader is handed the empty box this whole ` +
        `route exists to avoid.`,
    );
  }

  // The `reason` field must still be the kind that prefills. A `dropdown` breaks the composer in
  // the one way nothing else here would notice: GitHub accepts the `reason=` parameter, ignores
  // it, and opens the form with the field empty, under a review step saying only the confirmations
  // are left — which is then false, since `reason` is required.
  const reason = findItem(form, 'reason')!;
  if (reason.type !== 'input') {
    throw new Error(
      `correction-form: the "reason" field in ${templatePath} is ` +
        `"type: ${String(reason.type)}", not "type: input". Only an input prefills from a URL ` +
        `query parameter — GitHub takes the parameter for a dropdown and silently ignores it — ` +
        `so /report/ would compose the error class and then hand the reader a blank ` +
        `required field, under copy saying it had been filled in for them.`,
    );
  }

  const attributes = reason.attributes as { description?: unknown } | undefined;
  const description = attributes?.description;
  if (typeof description !== 'string') {
    throw new Error(
      `correction-form: the "reason" field in ${templatePath} has no "description". That block ` +
        `is where its error classes are listed, and it is the only copy of that vocabulary.`,
    );
  }

  // Throws on any drift between the template's vocabulary and the composer's.
  const reasons = resolveReasons(readReasonOptions(description, reasonDescriptionIsLiteral(src)));

  const confirmations = findItem(form, 'confirmations');
  return {
    reasons,
    fieldIds,
    // Zero is a legitimate answer, not an error: a template that drops the confirmations is a
    // curator's decision and the page stops mentioning them. What must not happen is the page
    // asserting a count the form does not ask for, which is what the old text-slicing reader did
    // whenever the field was written in a spelling it could not bound.
    requiredConfirmations: confirmations === undefined ? 0 : requiredOptionCount(confirmations),
  };
}

