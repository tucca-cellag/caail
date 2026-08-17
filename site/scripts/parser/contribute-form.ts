/**
 * contribute-form.ts — reconcile the caail-contribute skill against the issue forms it prefills.
 *
 * WHY THIS EXISTS
 * ---------------
 * `plugin-contribute/skills/caail-contribute/SKILL.md` tells an agent to compose a GitHub issue
 * URL for a resource CAAIL does not index. GitHub prefills an issue form by matching a query
 * parameter to a field's `id`, and it reports nothing when the match fails: a renamed field, or a
 * field of the wrong type, arrives BLANK. The form still opens. The agent still says it filled the
 * form in. The contributor is handed the empty box the whole route exists to avoid.
 *
 * Restating the field list in the skill and hoping it tracks the templates is the defect this repo
 * pays for most often, and it is worse here than on /report/: the skill ships to other people's
 * machines, so a stale copy is wrong somewhere nobody can see it. So the skill keeps exactly one
 * copy of the parameter list, this module READS that copy, and the build fails naming the string it
 * could not reconcile. Sibling of correction-form.ts, which does the same for /report/.
 *
 * THE TRAP THIS IS MOSTLY HERE TO CATCH
 * -------------------------------------
 * A `dropdown` does not prefill. GitHub takes the query parameter and ignores it. `paper.yml`
 * carries three dropdowns (`paper_type`, `ai_methods`, `research_areas`) that are the obvious
 * things to want to prefill and the exact things that cannot be, so the skill has to tell the
 * reader to pick them by hand. If someone later "fixes" the skill by adding them to the prefill
 * list, or converts a prefilled input into a dropdown, {@link assertPrefillable} fails the build.
 *
 * `title` IS NOT A USABLE FIELD ID, WHICH IS WHY paper.yml SAYS `paper_title`
 * ---------------------------------------------------------------------------
 * `title` is GitHub's built-in issue-title parameter. A template field whose id is `title` is
 * therefore ambiguous at best: the parameter is consumed by the issue title and the required body
 * field stays empty. paper.yml's field was renamed to `paper_title` for exactly this reason, and
 * {@link RESERVED_FIELD_IDS} keeps it renamed.
 *
 * WHY THIS IS NOT A YAML PARSER
 * ------------------------------
 * Same answer as correction-form.ts: the site has no YAML dependency, these are known documents
 * with a committed shape, and a narrow reader that throws the moment its assumptions stop holding
 * is smaller and fails just as loudly as a real parser would.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Field ids GitHub reserves for its own query parameters, so a template must not use them. */
export const RESERVED_FIELD_IDS: readonly string[] = ['title', 'body', 'labels', 'assignees'];

/** Field types whose value GitHub will actually take from a query parameter. */
const PREFILLABLE_TYPES: readonly string[] = ['input', 'textarea'];

/**
 * Confirmation checkboxes are deliberately never prefilled: they ask the contributor to confirm
 * they searched the library and that they accept the contribution licence, and an agent answering
 * either on their behalf is the point of the checkbox defeated. Exempted from the
 * every-required-field-is-handled check below rather than silently passing it.
 */
const UNPREFILLED_BY_DESIGN: readonly string[] = ['confirmations'];

export const SKILL_PATH: string = fileURLToPath(
  new URL('../../../plugin-contribute/skills/caail-contribute/SKILL.md', import.meta.url),
);

export const TEMPLATE_DIR: string = fileURLToPath(
  new URL('../../../.github/ISSUE_TEMPLATE/', import.meta.url),
);

/** One field of an issue form, as far as prefilling cares. */
export interface FormField {
  readonly id: string;
  readonly type: string;
  readonly required: boolean;
}

/** What the skill claims it can prefill on one template. */
export interface PrefillClaim {
  /** The template filename, e.g. `paper.yml`. */
  readonly template: string;
  /** The query parameters the skill documents, in document order. */
  readonly params: readonly string[];
}

/**
 * Every `- type: <kind>` item in a template, with its `id` and whether anything in it is
 * `required: true`.
 *
 * Bounded by the `- type:` items themselves rather than by scanning forward from an `id:`, because
 * YAML mappings are unordered and GitHub accepts a field's keys in any order. correction-form.ts
 * records two real failures caused by assuming otherwise; this reader is built the same way so it
 * cannot repeat them.
 *
 * `markdown` blocks carry no `id` and are skipped: they are prose shown to the reader, not fields.
 */
export function readFields(src: string): FormField[] {
  const bounds = [...src.matchAll(/^[ \t]*-[ \t]+type:[ \t]*(\S+)[ \t]*$/gm)];
  return bounds.flatMap((m, i) => {
    const start = m.index!;
    const end = bounds[i + 1]?.index ?? src.length;
    const item = src.slice(start, end);
    const id = /^[ \t]*id:[ \t]*([A-Za-z0-9_-]+)[ \t]*$/m.exec(item)?.[1];
    if (id === undefined) return [];
    return [{ id, type: m[1]!, required: /^[ \t]*required:[ \t]*true[ \t]*$/m.test(item) }];
  });
}

/**
 * The prefill claims the skill makes, read from its own prose.
 *
 * Anchored on the sentence that introduces each list, so the worked URL example further down the
 * page (which also contains `template=paper.yml`) is not mistaken for a claim. The parameters are
 * the code spans on the next non-empty line, which is the single copy of that list anywhere.
 */
export function readPrefillClaims(skillSrc: string): PrefillClaim[] {
  const intro = /\(`template=([a-z0-9-]+\.yml)`\)[^\n]*prefillable\s+parameters:\s*\n/g;
  const claims: PrefillClaim[] = [];

  for (const m of skillSrc.matchAll(intro)) {
    const rest = skillSrc.slice(m.index! + m[0].length);
    const line = rest.split('\n').find((l) => l.trim() !== '');
    const params = [...(line ?? '').matchAll(/`([a-z0-9_]+)`/g)].map((p) => p[1]!);
    if (params.length === 0) {
      throw new Error(
        `contribute-form: the skill announces prefillable parameters for "${m[1]}" and then ` +
          `lists none. ${SKILL_PATH} is the only copy of that list; an empty one means every ` +
          `composed issue arrives blank.`,
      );
    }
    claims.push({ template: m[1]!, params });
  }

  if (claims.length === 0) {
    throw new Error(
      `contribute-form: no prefill claims found in ${SKILL_PATH}. Expected at least one line ` +
        `of the form "(\`template=<file>.yml\`) … prefillable parameters:" followed by the ` +
        `parameter names as code spans. Either the skill stopped composing prefilled URLs, or ` +
        `its wording changed and this reader can no longer find the list it checks.`,
    );
  }
  return claims;
}

/** Every documented parameter must still be a field on that template. */
function assertPresent(claim: PrefillClaim, fields: readonly FormField[]): void {
  const ids = new Set(fields.map((f) => f.id));
  const missing = claim.params.filter((p) => !ids.has(p));
  if (missing.length > 0) {
    throw new Error(
      `contribute-form: ${claim.template} has no field id(s) ` +
        `${missing.map((m) => `"${m}"`).join(', ')}, but the caail-contribute skill composes ` +
        `URLs that set them. GitHub ignores a query parameter matching no field, so the issue ` +
        `opens with those boxes empty and nothing reports it. Rename them in the skill or ` +
        `restore them in the template.`,
    );
  }
}

/** Every documented parameter must be a type GitHub will actually prefill. */
function assertPrefillable(claim: PrefillClaim, fields: readonly FormField[]): void {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const wrong = claim.params
    .map((p) => byId.get(p)!)
    .filter((f) => f !== undefined && !PREFILLABLE_TYPES.includes(f.type));
  if (wrong.length > 0) {
    throw new Error(
      `contribute-form: ${claim.template} declares ` +
        `${wrong.map((f) => `"${f.id}" as type: ${f.type}`).join(', ')}, and the ` +
        `caail-contribute skill lists it as prefillable. Only ` +
        `${PREFILLABLE_TYPES.join(' and ')} prefill from a URL query parameter. GitHub takes ` +
        `the parameter for a dropdown and silently ignores it, so the reader is handed a blank ` +
        `required field under copy saying it was filled in for them.`,
    );
  }
}

/** No template may use a field id GitHub has reserved for its own parameters. */
function assertNoReservedIds(template: string, fields: readonly FormField[]): void {
  const clashes = fields.filter((f) => RESERVED_FIELD_IDS.includes(f.id));
  if (clashes.length > 0) {
    throw new Error(
      `contribute-form: ${template} declares the field id(s) ` +
        `${clashes.map((f) => `"${f.id}"`).join(', ')}, which GitHub reserves for its own ` +
        `issue-creation query parameters. The parameter is consumed by the built-in and the ` +
        `body field stays empty, so the field cannot be prefilled at all. paper.yml's ` +
        `"title" was renamed to "paper_title" for exactly this reason.`,
    );
  }
}

/**
 * Every required field is either prefilled by the skill, or is one the reader must answer.
 *
 * The failure this catches is additive rather than a rename: someone adds a required `input` to a
 * template, nothing anywhere errors, and every composed issue from then on arrives with a blank
 * required box that the agent has just told the contributor was filled in. A dropdown is an
 * acceptable answer because it CANNOT be prefilled, and the skill's job there is to say so.
 */
function assertRequiredCovered(claim: PrefillClaim, fields: readonly FormField[]): void {
  const claimed = new Set(claim.params);
  const stranded = fields.filter(
    (f) =>
      f.required &&
      !claimed.has(f.id) &&
      PREFILLABLE_TYPES.includes(f.type) &&
      !UNPREFILLED_BY_DESIGN.includes(f.id),
  );
  if (stranded.length > 0) {
    throw new Error(
      `contribute-form: ${claim.template} requires ` +
        `${stranded.map((f) => `"${f.id}"`).join(', ')}, which the caail-contribute skill does ` +
        `not prefill even though the field type allows it. A composed issue would arrive with ` +
        `a blank required box. Add the parameter to the skill's list, or make the field ` +
        `optional.`,
    );
  }
}

/**
 * Reconcile the skill against every template it claims to prefill.
 *
 * @param skillPath    Path to the caail-contribute SKILL.md (defaults to the repo's).
 * @param templateDir  Directory holding the issue forms (defaults to the repo's).
 * @returns            The verified claims, for a caller that wants to report what was checked.
 * @throws             If a claimed parameter is missing, is not prefillable, collides with a
 *                     GitHub built-in, or if a required prefillable field is left unfilled.
 */
export function verifyContributeForms(
  skillPath: string = SKILL_PATH,
  templateDir: string = TEMPLATE_DIR,
): PrefillClaim[] {
  const claims = readPrefillClaims(readFileSync(skillPath, 'utf-8'));

  for (const claim of claims) {
    const fields = readFields(readFileSync(`${templateDir}${claim.template}`, 'utf-8'));
    if (fields.length === 0) {
      throw new Error(
        `contribute-form: ${claim.template} declares no fields with an id, so nothing the ` +
          `caail-contribute skill composes for it can prefill.`,
      );
    }
    assertNoReservedIds(claim.template, fields);
    assertPresent(claim, fields);
    assertPrefillable(claim, fields);
    assertRequiredCovered(claim, fields);
  }

  return claims;
}
