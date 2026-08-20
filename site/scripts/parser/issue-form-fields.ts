/**
 * issue-form-fields.ts — the one check both issue-form readers need, in one place.
 *
 * WHY THIS IS ITS OWN MODULE
 * --------------------------
 * `contribute-form.ts` and `correction-form.ts` both find a field by scanning for the `- type:`
 * line that opens it, and both are therefore blind in the same way: a field whose FIRST key is
 * something else opens a list item they never see. The consequences differ — one silently drops a
 * required field from its coverage, the other publishes a wrong confirmation count — but the cause
 * is a single rule, and `review-phase.md` records three consecutive review rounds each finding the
 * same defect: a rule written in two places with the fix applied to one of them. So it is written
 * once, here, and imported by both.
 *
 * WHAT IT CATCHES THAT A `- type:` COUNT CANNOT
 * ---------------------------------------------
 * Both readers already reject a `- type:` line written in a form they cannot parse, by counting
 * loosely and strictly and comparing. That check cannot see this one, because there is no
 * malformed line to count: the field contributes no `- type:` line at all.
 *
 *     - type: input          <- seen
 *       id: doi
 *     - id: species          <- INVISIBLE: the item opens with `id`, so no `- type:` matches,
 *       type: dropdown          and the whole field merges into the one above it
 *       validations:
 *         required: true
 *
 * YAML mappings are unordered and GitHub accepts a field's keys in any order, so that document is
 * valid and means exactly what the first one means. Both readers' docstrings already claim to be
 * built for unordered keys; that claim was true of how a field's keys are READ and false of how
 * its boundary is FOUND, which is the half that decides whether the field exists at all.
 *
 * WHY IT COUNTS ITEMS AT ONE INDENT RATHER THAN ALL LIST ITEMS
 * ------------------------------------------------------------
 * `- label:` under a `checkboxes` field's `options:` is a list item with a key, and it is not a
 * field. Counting every `- <word>:` in the document would report every confirmation checkbox as a
 * missing field and fail on both committed templates. The field items are the ones at the same
 * indentation as the `- type:` lines, which is derived from the document rather than assumed,
 * because nothing guarantees two spaces beyond both templates currently using them.
 */

/** The `- type:` lines a reader finds fields by, with the indent they sit at. */
const TYPE_ITEM = /^([ \t]*)-[ \t]+type:/gm;

/**
 * Throw when the document contains a field item this reader would not see.
 *
 * @param src    The issue-form YAML.
 * @param where  What to name in the error: a path, or a module-qualified description.
 * @throws       If any list item at field indentation opens with a key other than `type`.
 */
export function assertEveryFieldOpensWithType(src: string, where: string): void {
  const typeItems = [...src.matchAll(TYPE_ITEM)];
  // No fields at all is not this function's business: each caller already reports that in its own
  // terms, and there is no indent to derive here.
  if (typeItems.length === 0) return;

  const indents = new Set(typeItems.map((m) => m[1]!));
  if (indents.size > 1) {
    throw new Error(
      `issue-form: the "- type:" lines in ${where} are not all at the same indentation ` +
        `(${[...indents].map((i) => i.length).join(', ')} columns). Field items sit at one level, ` +
        `so a mixture means either a nested list is being read as a field or a field has been ` +
        `indented into another one, and which of those it is changes what every check below sees.`,
    );
  }

  const indent = [...indents][0]!;
  const items = [
    ...src.matchAll(new RegExp(String.raw`^${indent}-[ \t]+([A-Za-z0-9_-]+):`, 'gm')),
  ];
  const wrongFirstKey = items.filter((m) => m[1] !== 'type');
  if (wrongFirstKey.length > 0) {
    throw new Error(
      `issue-form: ${wrongFirstKey.length} field(s) in ${where} open with ` +
        `${wrongFirstKey.map((m) => `"${m[1]}"`).join(', ')} rather than "type". YAML keys are ` +
        `unordered so that is a valid form of the same document, but this reader finds a field ` +
        `by its "- type:" line, so such a field is invisible: it merges into the one before it ` +
        `and takes its "required" flag with it. Put "type" first, or teach the reader to bound ` +
        `items without it.`,
    );
  }
}
