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
  /** The `reason` dropdown's options, resolved to the follow-up each one needs. */
  readonly reasons: readonly ResolvedReason[];
  /** Every `id:` the template declares, in document order. */
  readonly fieldIds: readonly string[];
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
 */
function reasonField(src: string): string {
  const anchor = src.search(/^[ \t]*id:[ \t]*reason[ \t]*$/m);
  if (anchor < 0) {
    throw new Error(
      `correction-form: no "id: reason" field in ${CORRECTION_TEMPLATE_PATH}. /report/ ` +
        `composes a report whose error class comes from that dropdown; without it there ` +
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
 * The `options:` list belonging to the `reason` field.
 *
 * The block ENDS AT THE FIRST DEDENT. Indentation is what actually delimits a YAML block,
 * so scanning for a sibling key as an end marker assumes an ordering the format does not
 * promise. Combined with {@link reasonField} above, the read no longer depends on where any
 * of the field's keys sit relative to each other.
 *
 * The searches use `[ \t]*` and never `\s*`: `\s` matches a newline, so `/^\s*options:/m`
 * can begin its match on a BLANK LINE above the key. The slice would then start one line
 * early, that line's indent reads as 0, and the dedent bound never trips. One blank line in
 * the template was all it took.
 */
function readReasonOptions(src: string): string[] {
  const rest = reasonField(src);
  const optionsAt = rest.search(/^[ \t]*options:[ \t]*$/m);
  if (optionsAt < 0) {
    throw new Error(
      `correction-form: the "reason" field in ${CORRECTION_TEMPLATE_PATH} has no ` +
        `"options:" list. It is expected to be a dropdown.`,
    );
  }

  const indentOf = (line: string): number => line.length - line.trimStart().length;
  const [header, ...body] = rest.slice(optionsAt).split('\n');
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
      `correction-form: the "reason" dropdown in ${CORRECTION_TEMPLATE_PATH} lists no ` +
        `options.`,
    );
  }
  return options;
}

/**
 * Build the correction-form model from the committed issue template.
 *
 * @param templatePath  Path to entry-correction.yml (defaults to the repo's).
 * @returns             The resolved reason vocabulary and the template's field ids.
 * @throws              If the reason dropdown is missing or empty, if a required field id
 *                      has been renamed away, or if the options and the composer's
 *                      follow-up declarations are not in bijection.
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

  // Throws on any drift between the template's vocabulary and the composer's.
  const reasons = resolveReasons(readReasonOptions(src));

  return { reasons, fieldIds };
}
