/**
 * contribute-form.ts — reconcile the caail-contribute skill against the issue forms it prefills.
 *
 * WHY THIS EXISTS
 * ---------------
 * `plugin-contribute/skills/caail-contribute/SKILL.md` tells an agent to compose a GitHub issue
 * URL for a resource CAAIL does not index. GitHub prefills an issue form by matching a query
 * parameter to a field's `id`, and it reports nothing when the match fails: a renamed field, or a
 * field of the wrong type, arrives BLANK. The form still opens. The agent still says it filled the
 * form in. The contributor is handed the empty box this whole route exists to avoid.
 *
 * Restating the field list in the skill and hoping it tracks the templates is the defect this repo
 * pays for most often, and it is worse here than on /report/: the skill ships to other people's
 * machines, so a stale copy is wrong somewhere nobody can see it. So the skill keeps exactly one
 * copy of each list, this module READS those copies, and the build fails naming the string it
 * could not reconcile. Sibling of correction-form.ts, which does the same for /report/.
 *
 * THE TRAP THIS IS MOSTLY HERE TO CATCH
 * -------------------------------------
 * A `dropdown` does not prefill. GitHub takes the query parameter and ignores it. `paper.yml`
 * carries three dropdowns (`paper_type`, `ai_methods`, `research_areas`) that are the obvious
 * things to want to prefill and the exact things that cannot be, so the skill has to tell the
 * reader to pick them by hand.
 *
 * WHY THE SKILL DECLARES BOTH LISTS, NOT JUST THE PREFILLED ONE
 * -------------------------------------------------------------
 * An earlier version checked only the prefill list and let the skill say "three fields cannot be
 * prefilled" in prose. That number was the one hand-typed fact in the file, and nothing derived or
 * checked it: adding a required `Species` dropdown to `paper.yml` left CI green while the shipped
 * skill went on naming three, and the composed issue arrived with a fourth blank required dropdown
 * that GitHub refuses to submit.
 *
 * So the skill declares the pick-by-hand list too, and {@link assertRequiredCovered} demands that
 * EVERY required field is accounted for by one list or the other. A new required field of any type
 * now fails the build until the skill says what to do with it, and the count lives nowhere.
 *
 * Optional fields are deliberately not covered: an optional field left blank submits fine, so
 * requiring the skill to enumerate them would be noise with no failure behind it.
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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Field ids GitHub consumes as its own `issues/new` query parameters, so a template must not use
 * them: the parameter is eaten by the built-in and the field arrives blank, exactly as `title` did.
 *
 * `template` is the one most likely to be chosen innocently, and it is the parameter every URL
 * this skill composes already carries.
 */
export const RESERVED_FIELD_IDS: readonly string[] = [
  'title',
  'body',
  'labels',
  'assignees',
  'milestone',
  'projects',
  'template',
];

/** Field types whose value GitHub will actually take from a query parameter. */
const PREFILLABLE_TYPES: readonly string[] = ['input', 'textarea'];

/**
 * Confirmation checkboxes are deliberately never prefilled and never picked for the reader: they
 * ask the contributor to confirm they searched the library and that they accept the contribution
 * licence, and an agent answering either on their behalf is the point of the checkbox defeated.
 *
 * This is a real exemption rather than documentation. {@link assertRequiredCovered} covers every
 * required field regardless of type, so without this entry the committed `confirmations` field
 * would be reported as unaccounted for.
 *
 * Matched on type as well as id, because the whole justification above is about the field being a
 * confirmation CHECKBOX. On id alone, a template declaring a required `input` named `confirmations`
 * would inherit an exemption that reasons about something else entirely, and its blank required box
 * would reach a contributor unreported.
 */
const UNPREFILLED_BY_DESIGN: readonly { id: string; type: string }[] = [
  { id: 'confirmations', type: 'checkboxes' },
];

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

/** What the skill claims about one template. */
export interface TemplateClaim {
  /** The template filename, e.g. `paper.yml`. */
  readonly template: string;
  /** The query parameters the skill documents as prefillable, in document order. */
  readonly prefill: readonly string[];
  /** The field ids the skill tells the reader to pick by hand. */
  readonly manual: readonly string[];
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
 * A trailing `# comment` is tolerated on all three keys. An earlier version anchored on `[ \t]*$`,
 * which made `- type: input  # required` invisible: the field vanished from the model entirely,
 * taking its `required` flag with it, and every check here silently stopped covering it.
 *
 * `markdown` blocks carry no `id` and are skipped: they are prose shown to the reader, not fields.
 */
export function readFields(src: string): FormField[] {
  const bounds = [...src.matchAll(/^[ \t]*-[ \t]+type:[ \t]*(["']?)([A-Za-z0-9_-]+)\1[ \t]*(?:#.*)?$/gm)];

  // The `- type:` line is what SEPARATES one field from the next, so an unparseable one is worse
  // than an unparseable id: the field is not merely unreadable, it stops being a boundary, merges
  // into its predecessor and disappears entirely — id, type and `required: true` with it. The id
  // guard below throws for exactly that reason and had no counterpart here, which left the
  // invariant it states ("must not be reachable by writing it in a form this reader fails to
  // parse") true of one key and false of the other. Counting loosely and comparing is the cheapest
  // way to notice, because the strict pattern cannot report what it failed to match.
  const loose = [...src.matchAll(/^[ \t]*-[ \t]+type:/gm)];
  if (loose.length !== bounds.length) {
    throw new Error(
      `contribute-form: ${loose.length - bounds.length} of ${loose.length} "- type:" lines are ` +
        `written in a form this reader cannot parse. Each one stops separating its field from the ` +
        `one before it, so that field vanishes from every check here along with its required ` +
        `flag. Write the type as a bare or quoted word.`,
    );
  }

  return bounds.flatMap((m, i) => {
    const start = m.index!;
    const end = bounds[i + 1]?.index ?? src.length;
    const item = src.slice(start, end);
    const type = m[2]!;
    const id = /^[ \t]*id:[ \t]*(["']?)([A-Za-z0-9_-]+)\1[ \t]*(?:#.*)?$/m.exec(item)?.[2];
    if (id === undefined) {
      // `markdown` is prose shown to the reader and carries no id by GitHub's own schema.
      // Anything else without one is a field this module cannot see, and an invisible field
      // takes its `required` flag with it: that is precisely the regression assertRequiredCovered
      // exists to stop, so it must not be reachable by writing the id in a form this reader
      // fails to parse. Quoted scalars are accepted above; this catches every other spelling.
      if (type === 'markdown') return [];
      throw new Error(
        `contribute-form: a "- type: ${type}" field carries no id this reader can parse. A field ` +
          `with no readable id is invisible to every check here, including whether it is ` +
          `required, so a required one would reach a contributor as a blank box with nothing ` +
          `reporting it. Write the id as a bare or quoted word.`,
      );
    }
    return [
      { id, type, required: /^[ \t]*required:[ \t]*true[ \t]*(?:#.*)?$/m.test(item) },
    ];
  });
}

/**
 * Read one kind of claim list out of the skill's prose.
 *
 * Anchored on the sentence that introduces each list, so the worked URL example further down the
 * page (which also contains `template=paper.yml`) is not mistaken for a claim. The parameters are
 * the code spans on the next non-empty line, which is the single copy of that list anywhere.
 *
 * The template name accepts the whole set GitHub allows rather than lowercase-and-dash only. The
 * narrow charset silently failed to recognise a claim for `paper_form.yml`, and because a missing
 * claim is only an error when NO claim is found at all, a second template could have gone
 * unchecked forever without anything saying so.
 */
/**
 * Is this line part of a parameter list, rather than the prose that follows one?
 *
 * True when the line is code spans and separators and nothing else. That is the shape of every
 * list the skill declares, and it is not the shape of any sentence around them, including the
 * sentences that mention a parameter in passing: those carry words outside the backticks.
 */
function isParameterLine(line: string): boolean {
  const spans = [...line.matchAll(/`[A-Za-z0-9_-]+`/g)];
  if (spans.length === 0) return false;
  return line.replace(/`[A-Za-z0-9_-]+`/g, '').trim().replace(/[,;]/g, '').trim() === '';
}

function readClaimLists(
  skillSrc: string,
  pattern: string,
  label: string,
  skillPath: string,
): Map<string, string[]> {
  // `[^:]` rather than `[^\n]`, so the intro may WRAP. The earlier form required the template
  // marker and the heading to share a line, which made a reflow silently drop a whole template:
  // moving one line break in the resource.yml intro left `readClaims` returning paper.yml alone,
  // with no error, and resource.yml's parameters unreconciled from then on. A colon is what
  // actually ends an intro, and no heading contains one, so this cannot run past its own list.
  const intro = new RegExp(
    String.raw`\(\x60template=([A-Za-z0-9._-]+\.yml)\x60\)[^:]{0,120}?` + pattern + String.raw`:[ \t]*\n`,
    'g',
  );
  const out = new Map<string, string[]>();

  for (const m of skillSrc.matchAll(intro)) {
    const template = m[1]!;
    // The list is the ONE paragraph after the intro, and every way it can go wrong THROWS.
    //
    // Three earlier rules each closed one hazard and left another open, and every failure lands
    // on the list's TAIL, where the optional parameters sit (`code_url` on paper.yml, `notes` on
    // resource.yml). Optional means assertRequiredCovered never rescues them, and a
    // truncated-but-non-empty list never trips the ids.length === 0 throw, so the loss was
    // total and silent every time:
    //
    //   - "first non-empty line only" dropped everything after a WRAP.
    //   - "up to the first blank line" closed the wrap, not a PARAGRAPH BREAK.
    //   - "every line that looks like a list" closed the paragraph break, but stopped dead at
    //     the first continuation line carrying a word: `` `code_url` and `notes` `` reflowed
    //     onto a second line silently lost both.
    //
    // The lesson is that no terminator rule is safe here, because "the list ended" and "the
    // list continued in a form I did not expect" are indistinguishable by shape and differ
    // only in consequence. So nothing is inferred: a non-list line inside the paragraph is an
    // ERROR naming the line, and a list-shaped line in the NEXT paragraph is an ERROR too.
    // Reflow freely within the paragraph; anything else stops the build instead of the reader.
    const after = skillSrc.slice(m.index! + m[0].length).split('\n');
    const start = after.findIndex((l) => l.trim() !== '');
    const block: string[] = [];
    let end = start < 0 ? 0 : start;
    for (; end < after.length && after[end]!.trim() !== ''; end++) {
      const line = after[end]!;
      if (!isParameterLine(line)) {
        throw new Error(
          `contribute-form: the ${label} list for "${template}" in ${skillPath} runs into a ` +
            `line that is not part of it: ${JSON.stringify(line.trim())}. The list must be one ` +
            `paragraph of code spans separated by commas, because anything else is ` +
            `indistinguishable from the list having ended, and a parameter dropped that way is ` +
            `silent all the way to a contributor's screen. Put prose in its own paragraph.`,
        );
      }
      block.push(line);
    }

    // Every remaining line up to the NEXT claim intro, not just the next paragraph.
    //
    // Checking only the paragraph immediately after left `list / prose / more list` dropping its
    // tail in silence, which is the same failure in the one shape the guard did not look at. The
    // window stops at the next `(`template=…`)` because that is where another claim's own list
    // legitimately begins, and scanning past it would report every later list as a stray.
    const tail = after.slice(end);
    const nextIntro = tail.findIndex((l) => /\(`template=[A-Za-z0-9._-]+\.yml`\)/.test(l));
    const stray = (nextIntro < 0 ? tail : tail.slice(0, nextIntro)).find((l) => isParameterLine(l));
    if (stray !== undefined) {
      throw new Error(
        `contribute-form: the ${label} list for "${template}" in ${skillPath} continues after a ` +
          `break — ${JSON.stringify(stray.trim())} reads as a separate paragraph. Only the ` +
          `first would be checked, and the parameters after the break would silently stop being ` +
          `reconciled. Keep the whole list in one paragraph.`,
      );
    }

    const ids = [...block.join(' ').matchAll(/`([A-Za-z0-9_-]+)`/g)].map((p) => p[1]!);
    if (ids.length === 0) {
      throw new Error(
        `contribute-form: the skill announces ${label} for "${template}" and then lists none. ` +
          `${skillPath} is the only copy of that list; an empty one means the checks below ` +
          `cover nothing.`,
      );
    }
    // Last-write-wins would discard the first list in silence. A plausible edit — documenting a
    // narrower variant of the same template — would then leave the real list unchecked while
    // everything still passed.
    if (out.has(template)) {
      throw new Error(
        `contribute-form: ${skillPath} declares ${label} for "${template}" more than once. ` +
          `Only one list per template can be reconciled, so a second one would silently ` +
          `replace the first and the original list would stop being checked.`,
      );
    }
    out.set(template, ids);
  }
  return out;
}

/**
 * The claims the skill makes, one entry per template it composes URLs for.
 *
 * A template may legitimately have no pick-by-hand list (nothing unprefillable and required), so a
 * missing `manual` list is an empty array rather than an error. That is safe because
 * {@link assertRequiredCovered} independently fails on any required field the skill did not
 * account for, which is what a wrongly-omitted list would produce.
 */
export function readClaims(skillSrc: string, skillPath: string = SKILL_PATH): TemplateClaim[] {
  const prefill = readClaimLists(
    skillSrc,
    String.raw`prefillable\s+parameters`,
    '"prefillable parameters"',
    skillPath,
  );
  const manual = readClaimLists(
    skillSrc,
    String.raw`fields to pick by\s+hand`,
    '"fields to pick by hand"',
    skillPath,
  );

  if (prefill.size === 0) {
    throw new Error(
      `contribute-form: no prefill claims found in ${skillPath}. Expected at least one line ` +
        `of the form "(\`template=<file>.yml\`) … prefillable parameters:" followed by the ` +
        `parameter names as code spans. Either the skill stopped composing prefilled URLs, or ` +
        `its wording changed and this reader can no longer find the list it checks.`,
    );
  }

  // Every template the skill MENTIONS anywhere must have a prefill claim.
  //
  // Without this, "how many templates are covered" is decided by whether a regex happened to
  // match, and a template that silently stopped matching looks exactly like a template the skill
  // never mentioned. Deriving the expected set from the prose independently is what turns a
  // dropped claim from invisible into a build failure.
  //
  // The scan is deliberately blunt: any `template=<x>.yml` counts, including one inside a sentence
  // telling the reader NOT to use that template. Narrowing it to the claim intros would make the
  // check circular and worthless. The cost is that naming a deliberately-uncomposed template in
  // that literal form trips the build, so the error below offers dropping the `template=` form as
  // a remedy rather than only deleting the sentence.
  const mentioned = new Set(
    [...skillSrc.matchAll(/template=([A-Za-z0-9._-]+\.yml)/g)].map((m) => m[1]!),
  );
  const uncovered = [...mentioned].filter((t) => !prefill.has(t));
  if (uncovered.length > 0) {
    throw new Error(
      `contribute-form: ${skillPath} mentions the template(s) ` +
        `${uncovered.map((t) => `"${t}"`).join(', ')} but declares no prefillable parameters ` +
        `for them, so nothing reconciles what it composes against those forms. Either add the ` +
        `list, or — if the skill names that template precisely to say it does NOT compose for ` +
        `it — refer to it without the literal "template=<name>" form, which is what this check ` +
        `scans for.`,
    );
  }

  return [...prefill.entries()].map(([template, ids]) => ({
    template,
    prefill: ids,
    manual: manual.get(template) ?? [],
  }));
}

/** Every id the skill names must still be a field on that template. */
function assertPresent(claim: TemplateClaim, fields: readonly FormField[]): void {
  const ids = new Set(fields.map((f) => f.id));
  const missing = [...claim.prefill, ...claim.manual].filter((p) => !ids.has(p));
  if (missing.length > 0) {
    throw new Error(
      `contribute-form: ${claim.template} has no field id(s) ` +
        `${missing.map((m) => `"${m}"`).join(', ')}, but the caail-contribute skill names them. ` +
        `GitHub ignores a query parameter matching no field, so the issue opens with those ` +
        `boxes empty and nothing reports it. Rename them in the skill or restore them in the ` +
        `template.`,
    );
  }
}

/** Every documented parameter must be a type GitHub will actually prefill. */
function assertPrefillable(claim: TemplateClaim, fields: readonly FormField[]): void {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const wrong = claim.prefill
    .map((p) => byId.get(p))
    .filter((f): f is FormField => f !== undefined && !PREFILLABLE_TYPES.includes(f.type));
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

/**
 * Nothing may be on the pick-by-hand list that the skill could simply have filled in.
 *
 * The lists are opposites, so a field on the wrong one is a real error rather than a stylistic
 * choice: it asks the contributor to type something the agent already knew.
 */
function assertManualIsUnprefillable(claim: TemplateClaim, fields: readonly FormField[]): void {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const fillable = claim.manual
    .map((p) => byId.get(p))
    .filter((f): f is FormField => f !== undefined && PREFILLABLE_TYPES.includes(f.type));
  if (fillable.length > 0) {
    throw new Error(
      `contribute-form: the caail-contribute skill tells the reader to fill ` +
        `${fillable.map((f) => `"${f.id}"`).join(', ')} by hand on ${claim.template}, but ` +
        `type: ${fillable[0]!.type} prefills perfectly well. Move it to the prefillable list ` +
        `rather than asking a contributor to retype something the agent already has.`,
    );
  }
}

/**
 * Every required field is accounted for: prefilled, named as pick-by-hand, or exempt by design.
 *
 * Covers required fields of EVERY type, which is the point. A required `input` the skill forgot
 * produces a blank box under copy claiming the form was filled in; a required `dropdown` the skill
 * forgot produces a blank box the contributor is never told to fill, and GitHub then refuses the
 * submission. Both are invisible here until this check runs, because nothing at runtime reports
 * either one.
 */
function assertRequiredCovered(claim: TemplateClaim, fields: readonly FormField[]): void {
  const handled = new Set([...claim.prefill, ...claim.manual]);
  const exempt = (f: FormField): boolean =>
    UNPREFILLED_BY_DESIGN.some((e) => e.id === f.id && e.type === f.type);
  const stranded = fields.filter((f) => f.required && !handled.has(f.id) && !exempt(f));
  if (stranded.length > 0) {
    throw new Error(
      `contribute-form: ${claim.template} requires ` +
        `${stranded.map((f) => `"${f.id}" (type: ${f.type})`).join(', ')}, which the ` +
        `caail-contribute skill neither prefills nor tells the reader to pick. A composed issue ` +
        `would arrive with a blank required box. Add it to the skill's prefillable list if its ` +
        `type allows, otherwise to its pick-by-hand list.`,
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
 * Reconcile the skill against every template it claims to compose URLs for.
 *
 * @param skillPath    Path to the caail-contribute SKILL.md (defaults to the repo's).
 * @param templateDir  Directory holding the issue forms (defaults to the repo's).
 * @returns            The verified claims, for a caller that wants to report what was checked.
 * @throws             If a named field is missing, is on the wrong list for its type, collides
 *                     with a GitHub built-in, or if any required field is left unaccounted for.
 */
export function verifyContributeForms(
  skillPath: string = SKILL_PATH,
  templateDir: string = TEMPLATE_DIR,
): TemplateClaim[] {
  // Checked rather than left to readFileSync, because this is now the FIRST thing `pnpm parse`
  // does: relocating or renaming plugin-contribute/ would otherwise kill every site build and
  // the lint-papers sync guard with a bare ENOENT naming no module and no reason.
  if (!existsSync(skillPath)) {
    throw new Error(
      `contribute-form: no caail-contribute skill at ${skillPath}. That file is the only copy ` +
        `of the parameter lists the composed issue URLs set, so there is nothing to reconcile ` +
        `the issue templates against. If the plugin moved, update SKILL_PATH in this module.`,
    );
  }
  const claims = readClaims(readFileSync(skillPath, 'utf-8'), skillPath);

  for (const claim of claims) {
    // The orphan check in readClaims only catches a template name mistyped in ONE of the two
    // lists. Copy-paste the same wrong name into both and this is where it lands, so it answers
    // in the module's own voice rather than as a bare ENOENT from the middle of `pnpm parse`.
    const templatePath = join(templateDir, claim.template);
    if (!existsSync(templatePath)) {
      throw new Error(
        `contribute-form: the caail-contribute skill composes URLs for "${claim.template}", ` +
          `which does not exist in ${templateDir}. Check the template name in both of the ` +
          `skill's lists for it; a name wrong in both places passes every earlier check.`,
      );
    }
    const fields = readFields(readFileSync(templatePath, 'utf-8'));
    if (fields.length === 0) {
      throw new Error(
        `contribute-form: ${claim.template} declares no fields with an id, so nothing the ` +
          `caail-contribute skill composes for it can prefill.`,
      );
    }
    assertNoReservedIds(claim.template, fields);
    assertPresent(claim, fields);
    assertPrefillable(claim, fields);
    assertManualIsUnprefillable(claim, fields);
    assertRequiredCovered(claim, fields);
  }

  return claims;
}
