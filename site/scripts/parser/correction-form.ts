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
 * WHY THIS IS NOT A YAML PARSER
 * ------------------------------
 * The site has no YAML dependency and this needs two things out of one file with a fixed,
 * committed shape. A real parser would be the right answer for arbitrary YAML; for a known
 * document, a narrow reader that throws the moment the shape stops matching its assumptions
 * is smaller, has no dependency, and fails just as loudly. Every assumption it makes is
 * asserted rather than assumed — see the throws below, all of which name the file.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

/** Every `id: <name>` in the document. Field ids are a bare word by GitHub's own schema. */
function readFieldIds(src: string): string[] {
  return [...src.matchAll(/^\s*id:\s*([A-Za-z0-9_-]+)\s*$/gm)].map((m) => m[1]!);
}

/**
 * The `- type: …` list item that declares the `reason` field.
 *
 * The field is bounded by ITS OWN LIST ITEM, not by "everything after `id: reason`". YAML
 * mappings are unordered and GitHub accepts a field's keys in any order, so both of these
 * are valid templates and both used to read wrong:
 *
 *   - `validations:` written before `attributes:`, which removed the end marker an earlier
 *     version scanned for, so the options ran to end of file.
 *   - `id:` written after `attributes:`, which puts the anchor AFTER its own options, so a
 *     search starting there found the next `options:` in the file: the `confirmations`
 *     checkbox list, returned as the reason vocabulary.
 *
 * Both failed loudly, because `resolveReasons` rejects a checkbox label as an error class.
 * Both failed naming the wrong field, which is the part that costs an afternoon.
 *
 * The missing-anchor throw below is UNREACHABLE from `buildCorrectionForm`, which checks
 * REQUIRED_FIELD_IDS first and reports the same template in the same breath with a better
 * message (it names the prefill that would silently stop). Kept anyway, because this
 * function's contract should not depend on its one caller checking first — and because a
 * caller that did not would otherwise slice from index -1.
 */
function reasonField(src: string): string {
  const anchor = src.search(/^[ \t]*id:[ \t]*reason[ \t]*$/m);
  if (anchor < 0) {
    throw new Error(
      `correction-form: no "id: reason" field in ${CORRECTION_TEMPLATE_PATH}. /report/ ` +
        `composes a report whose error class comes from that field; without it there ` +
        `is no vocabulary to offer.`,
    );
  }
  // Every field in the form body opens with `- type: <kind>`, which is what separates one
  // from the next regardless of how its own keys are ordered inside it.
  const bounds = [...src.matchAll(/^[ \t]*-[ \t]+type:[ \t]*\S+[ \t]*$/gm)].map((m) => m.index!);
  const start = bounds.filter((i) => i <= anchor).pop();
  if (start === undefined) {
    throw new Error(
      `correction-form: "id: reason" in ${CORRECTION_TEMPLATE_PATH} is not inside a ` +
        `"- type:" field item, so its options cannot be told apart from another field's.`,
    );
  }
  return src.slice(start, bounds.find((i) => i > start) ?? src.length);
}

/**
 * Assert the `reason` field is the kind that can be prefilled.
 *
 * The whole point of the composer is that the reader does not answer a question twice, and
 * a `dropdown` breaks that in the one way nothing else here would notice: GitHub accepts
 * the `reason=` query parameter, ignores it, and opens the form with the field empty. No
 * error, no warning, and the review step goes on telling the reader that only the
 * confirmations are left — which is then false, since `reason` is `required: true`. So the
 * field type is checked rather than assumed, at build time, where it is loud.
 */
function assertPrefillable(field: string): void {
  const type = /^[ \t]*-[ \t]+type:[ \t]*(\S+)[ \t]*$/m.exec(field)?.[1];
  if (type !== 'input') {
    throw new Error(
      `correction-form: the "reason" field in ${CORRECTION_TEMPLATE_PATH} is ` +
        `"type: ${type}", not "type: input". Only an input prefills from a URL query ` +
        `parameter — GitHub takes the parameter for a dropdown and silently ignores it — ` +
        `so /report/ would compose the error class and then hand the reader a blank ` +
        `required field, under copy saying it had been filled in for them.`,
    );
  }
}

/**
 * The error classes the `reason` field lists, read from its `description:`.
 *
 * They are a markdown list inside a literal block rather than an `options:` list because
 * the field is an input (see {@link assertPrefillable}). Everything below is about reading
 * a YAML block safely, and every rule in it was put there by a real failure:
 *
 * The block ENDS AT THE FIRST DEDENT. Indentation is what actually delimits a YAML block,
 * so scanning for a sibling key as an end marker assumes an ordering the format does not
 * promise. Combined with {@link reasonField} above, the read no longer depends on where any
 * of the field's keys sit relative to each other.
 *
 * The searches use `[ \t]*` and never `\s*`: `\s` matches a newline, so `/^\s*description:/m`
 * can begin its match on a BLANK LINE above the key. The slice would then start one line
 * early, that line's indent reads as 0, and the dedent bound never trips. One blank line in
 * the template was all it took.
 *
 * The block scalar must be LITERAL (`|`), not folded (`>`). A folded block joins its lines,
 * so the eight bullets would arrive as one string and `resolveReasons` would reject it —
 * loudly, but naming a reason head rather than the block style that actually broke.
 * Non-bullet lines in the block are prose and are skipped, which is what lets the
 * description carry an instruction sentence above the list.
 */
function readReasonOptions(src: string): string[] {
  const rest = reasonField(src);
  const descriptionAt = rest.search(/^[ \t]*description:[ \t]*\|[-+0-9]*[ \t]*$/m);
  if (descriptionAt < 0) {
    throw new Error(
      `correction-form: the "reason" field in ${CORRECTION_TEMPLATE_PATH} has no ` +
        `"description: |" literal block. That block is where its error classes are ` +
        `listed, and it is the only copy of that vocabulary.`,
    );
  }

  const indentOf = (line: string): number => line.length - line.trimStart().length;
  const [header, ...body] = rest.slice(descriptionAt).split('\n');
  const baseIndent = indentOf(header!);

  const block: string[] = [];
  for (const line of body) {
    // A blank line does not end a YAML block, and carries no indentation to judge.
    if (line.trim() === '') continue;
    if (indentOf(line) <= baseIndent) break;
    block.push(line);
  }

  const options = block.flatMap((line) => {
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
 * How many of the `confirmations` field's checkboxes are `required: true`.
 *
 * Zero is a legitimate answer, not an error: a template that drops the confirmations is a
 * curator's decision, and the page simply stops mentioning them. What must not happen is
 * the page asserting a count the form does not ask for.
 */
function countRequiredConfirmations(src: string): number {
  const anchor = src.search(/^[ \t]*id:[ \t]*confirmations[ \t]*$/m);
  if (anchor < 0) return 0;
  const bounds = [...src.matchAll(/^[ \t]*-[ \t]+type:[ \t]*\S+[ \t]*$/gm)].map((m) => m.index!);
  const start = bounds.filter((i) => i <= anchor).pop() ?? 0;
  const field = src.slice(start, bounds.find((i) => i > start) ?? src.length);
  return (field.match(/^[ \t]*required:[ \t]*true[ \t]*$/gm) ?? []).length;
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

  const fieldIds = readFieldIds(src);
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

  // Throws if the field can no longer be prefilled, or on any drift between the template's
  // vocabulary and the composer's.
  assertPrefillable(reasonField(src));
  const reasons = resolveReasons(readReasonOptions(src));

  return {
    reasons,
    fieldIds,
    requiredConfirmations: countRequiredConfirmations(src),
  };
}
