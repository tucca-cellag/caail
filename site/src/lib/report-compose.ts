/**
 * report-compose.ts — turning structured answers into a finished correction.
 *
 * WHAT THIS EXISTS TO AVOID
 * -------------------------
 * The shipped report path anchors a correction to a frozen item id, then hands the reader
 * a blank textarea. The signal we are asking for is a domain reader's few seconds of "that
 * placement is wrong", and a blank box spends those seconds on composition rather than on
 * the judgment. So the reader picks from vocabularies CAAIL already owns — the real matrix
 * rows and columns, the four licence tiers, the eight subject themes — and this module
 * turns those picks into the report. Five of the eight error classes need no typing at all.
 *
 * WHY THE REASON VOCABULARY IS MATCHED RATHER THAN RESTATED
 * ---------------------------------------------------------
 * The reasons are the error classes the `reason` field lists in
 * `.github/ISSUE_TEMPLATE/entry-correction.yml`, and that file is the prefill contract: a
 * report composed against a list that has drifted from the template names an error class
 * the form does not offer, and prefills the field with it. Restating the eight strings here
 * would be one more hand-typed fact beside a machine-derived one, which is this repo's most
 * expensive recurring defect.
 *
 * So {@link REASON_SPECS} carries only the identifying HEAD of each one — the shortest
 * leading phrase that names the error class — and {@link resolveReasons} matches those
 * heads against the template's real list, demanding a bijection. Reword a trailing hint
 * (prose that will be edited) and nothing breaks; rename the class itself and the build
 * fails naming the string it could not match. The head is the identity; the rest of the
 * line is display text this module never has to know.
 *
 * WHY THE COMPOSED BODY IS PLAIN LINES, NOT MARKDOWN
 * --------------------------------------------------
 * The body ends up in a URL and then in a public GitHub issue. Emitting `Key: value` lines
 * with no `#`, `-`, `|` or backtick means a bounded free-text note has nothing to break out
 * of: it cannot start a heading, close a fence, or forge a table row, because there are none.
 * That reduces the handling of reader text to two mechanical rules — collapse it to one line,
 * cap its length — rather than an escaping problem that has to be got exactly right.
 *
 * Worth stating plainly what is NOT a risk here, so the defences stay proportionate. There
 * is no endpoint of ours, so there is no injection target. The note is typed by the reader,
 * lands in a form the same reader reviews, and is submitted under their own account: there
 * is no second party to attack. Only `?item=` is attacker-supplied, and `isItemId` in
 * ./report.ts already gates that.
 */

/** The follow-up question a reason needs once it has been picked. */
export type FollowUpKind =
  /** Two selects: the matrix row and column the entry should sit in. */
  | 'matrix'
  /** One select over the four licence tiers. */
  | 'licence'
  /** One select over the subject themes. */
  | 'topics'
  /** One text field, checked against the DOI shape. */
  | 'doi'
  /** One bounded, optional note. The only path that asks for prose. */
  | 'note'
  /** Nothing to ask. The entry id already says everything the curator needs. */
  | 'none';

/** What {@link REASON_SPECS} declares about one error class. */
export interface ReasonSpec {
  /**
   * The identifying leading phrase of the error class as the template lists it. Must match
   * exactly one of them by prefix, and must not be a prefix of another head (see
   * {@link resolveReasons}).
   */
  readonly head: string;
  readonly kind: FollowUpKind;
  /** Label for the note field. Required by, and only meaningful for, `kind: 'note'`. */
  readonly noteLabel?: string;
}

/**
 * The follow-up each error class needs.
 *
 * Order is irrelevant — the rendered order comes from the template, so the reader sees the
 * options in the same sequence on the site and on the GitHub form.
 */
export const REASON_SPECS: readonly ReasonSpec[] = [
  { head: 'Wrong matrix placement', kind: 'matrix' },
  { head: 'Not machine learning at all', kind: 'none' },
  { head: 'Stale or wrong figures', kind: 'note', noteLabel: 'What the figures should say' },
  { head: 'Dead or wrong link', kind: 'none' },
  { head: 'Wrong licence tier', kind: 'licence' },
  { head: 'Wrong or missing DOI', kind: 'doi' },
  { head: 'Wrong or missing subject topics', kind: 'topics' },
  { head: 'Something else', kind: 'note', noteLabel: 'What is wrong with it' },
];

/** One template option, resolved to its follow-up and split for display. */
export interface ResolvedReason {
  /** The template's option string, verbatim. The error class as the GitHub form names it. */
  readonly value: string;
  /** The identifying head that matched it. */
  readonly head: string;
  /** Display label: the option up to its em dash, or the whole option if it has none. */
  readonly label: string;
  /** Display hint: whatever followed the em dash. Empty when there was none. */
  readonly hint: string;
  readonly kind: FollowUpKind;
  readonly noteLabel?: string;
}

/**
 * The em dash the template uses to separate an option's name from its explanation.
 *
 * Written as an escape rather than literally because this repo's prose style bans the
 * character, and a bare one here reads like a style violation rather than the parsing
 * detail it is.
 */
const EM_DASH = '\u2014';

/**
 * Split one listed error class into its display label and hint.
 *
 * Display only: the identity of an option is its head (see {@link REASON_SPECS}), never
 * this split. An option with no em dash is all label, which is correct for the short ones.
 */
export function splitOption(option: string): { label: string; hint: string } {
  const i = option.indexOf(EM_DASH);
  if (i < 0) return { label: option.trim(), hint: '' };
  return { label: option.slice(0, i).trim(), hint: option.slice(i + EM_DASH.length).trim() };
}

/**
 * Match {@link REASON_SPECS} against the error classes the template really lists.
 *
 * @param options  The `reason` field's listed error classes, in template order.
 * @param specs    The follow-up declarations to match against. Defaults to
 *                 {@link REASON_SPECS}; a parameter only so the failure branches below are
 *                 reachable from a test, since a module-level constant cannot be varied and
 *                 an unreachable guard is one nothing proves works.
 * @returns        One {@link ResolvedReason} per option, in that same order.
 * @throws         If the two lists are not in bijection, or if one head is a prefix of
 *                 another (which would make matching depend on declaration order).
 */
export function resolveReasons(
  options: readonly string[],
  specs: readonly ReasonSpec[] = REASON_SPECS,
): ResolvedReason[] {
  // A head that prefixes another head makes "the option this head matches" ambiguous the
  // moment the template gains an option starting with the shorter one. Caught here rather
  // than left to whichever happens to be tried first.
  for (const a of specs) {
    for (const b of specs) {
      if (a !== b && b.head.startsWith(a.head)) {
        throw new Error(
          `report-compose: reason head "${a.head}" is a prefix of "${b.head}". ` +
            `Heads identify an option by prefix, so one containing another makes the ` +
            `match order-dependent. Lengthen the shorter head until it is distinct.`,
        );
      }
    }
  }

  const unmatched = new Set(specs.map((s) => s.head));
  const resolved = options.map((option) => {
    const hits = specs.filter((s) => option.startsWith(s.head));
    if (hits.length === 0) {
      throw new Error(
        `report-compose: the correction template offers "${option}", which no reason ` +
          `head in REASON_SPECS matches. Every option needs a follow-up declared, or the ` +
          `composer would render a reason it cannot ask a question about. Add a spec ` +
          `whose head is that option's leading phrase.`,
      );
    }
    // Unreachable while the prefix check above holds, since two heads matching one option
    // means one is a prefix of the other. Kept so a future edit to that check cannot
    // silently reintroduce an ambiguous match.
    if (hits.length > 1) {
      throw new Error(
        `report-compose: "${option}" matches ${hits.length} reason heads ` +
          `(${hits.map((h) => `"${h.head}"`).join(', ')}).`,
      );
    }
    const spec = hits[0]!;
    unmatched.delete(spec.head);
    const { label, hint } = splitOption(option);
    return {
      value: option,
      head: spec.head,
      label,
      hint,
      kind: spec.kind,
      ...(spec.noteLabel === undefined ? {} : { noteLabel: spec.noteLabel }),
    } satisfies ResolvedReason;
  });

  if (unmatched.size > 0) {
    throw new Error(
      `report-compose: ${unmatched.size} reason head(s) matched no option in the ` +
        `correction template: ${[...unmatched].map((h) => `"${h}"`).join(', ')}. ` +
        `Either the option was renamed (update the head) or removed (drop the spec). ` +
        `A head with no option is a follow-up the reader can never reach.`,
    );
  }

  // A duplicated option would leave `unmatched` empty while producing two entries for one
  // spec, so the count check is not implied by the loop above.
  if (resolved.length !== specs.length) {
    throw new Error(
      `report-compose: the template offers ${resolved.length} options but REASON_SPECS ` +
        `declares ${specs.length}. A duplicated option is the usual cause.`,
    );
  }

  return resolved;
}

/** How much reader-typed prose one report may carry, in characters. */
export const NOTE_MAX_LENGTH = 400;

/**
 * The same cap expressed in the unit that actually matters: percent-encoded length.
 *
 * `NOTE_MAX_LENGTH` counts UTF-16 code units, but the constraint it exists to satisfy is
 * URL length, and the two are only the same for ASCII. A character outside the Basic Latin
 * range costs three to nine characters once encoded, so a full 400-character note in
 * Chinese, Japanese, Korean, Greek or Cyrillic produces a `mailto:` past 3,700 characters.
 * Windows and Outlook truncate mailto URLs around 2,048, so the email route would deliver a
 * silently cut-off report — and the reader has no way to know, because the preview on the
 * page is complete.
 *
 * Budget: the whole mailto must clear {@link MAILTO_MAX_URL} with room to spare. The fixed
 * overhead is larger than it looks, which an earlier version of this comment got wrong by
 * guessing at it: the longest committed item id is 101 characters and appears in BOTH the
 * subject and the `Entry:` line, and the longest reason label is 71. Measured rather than
 * estimated, that overhead is 176 encoded characters, so a note at 1,500 put the worst-case
 * URL at 1,908 — inside the limit, but with 140 characters of headroom rather than the
 * ~250 the old figure implied.
 *
 * 1,400 restores the margin. It costs a Chinese note about eleven characters and buys back
 * a hundred against a limit that is itself a conservative reading of what mail clients do.
 *
 * These figures are a snapshot; `report-compose.test.ts` derives the real worst case from
 * the committed ids and the live template and fails if it stops fitting, so the numbers
 * here are commentary and the test is the guarantee.
 */
export const NOTE_MAX_ENCODED = 1400;

/**
 * The `mailto:` URL length this module keeps its output under.
 *
 * Windows shell and Outlook truncate around here, and a truncated mailto is the worst
 * failure available to this feature: the reader sees a complete report in the preview,
 * sends it, and the recipient gets a cut-off one, with nothing anywhere saying so.
 */
export const MAILTO_MAX_URL = 2048;

/**
 * The budget the composed GitHub issue URL is kept inside.
 *
 * A budget CAAIL keeps to, not a limit anyone has measured on github.com: 8 KiB is the
 * conventional ceiling a server puts on a whole request line, and staying an order of
 * magnitude inside it is cheaper than finding out. It is loose on purpose — the point is
 * that the URL has a bound at all, now that it carries three prefilled fields rather than
 * two, and that raising a field's cap far enough to matter fails a test instead of a
 * reader's submit.
 *
 * Much larger than {@link MAILTO_MAX_URL} because the constraint is different in kind: the
 * mailto limit is a real, low, client-side truncation that delivers a silently cut-off
 * report, which is why that one is tight and this one is not.
 */
export const GITHUB_MAX_URL = 8192;

/**
 * Encoded length of `text`, tolerating a trailing lone surrogate.
 *
 * `encodeURIComponent` throws `URIError` on an unpaired surrogate, and the truncation
 * search below probes arbitrary cut points, so it will produce them.
 */
function encodedLength(text: string): number {
  return encodeURIComponent(text.replace(/[\uD800-\uDBFF]$/, '')).length;
}

/**
 * Truncate `text` to the longest prefix whose encoded form fits `maxEncoded`.
 *
 * Binary search rather than a character-by-character walk, because encoded cost per
 * character is not constant and the answer is not derivable arithmetically.
 */
function truncateToEncoded(text: string, maxEncoded: number): string {
  if (encodedLength(text) <= maxEncoded) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (encodedLength(text.slice(0, mid)) <= maxEncoded) low = mid;
    else high = mid - 1;
  }
  return text.slice(0, low);
}

/**
 * Remove surrogate code units that are not part of a valid pair.
 *
 * `encodeURIComponent` throws `URIError` on any lone surrogate, and `render()` has no
 * try/catch: one unpaired code unit anywhere in a note would throw on every keystroke from
 * then on, freezing the preview and all three links at whatever they last held, with
 * nothing on screen to say so. The truncation guard elsewhere in this module strips only a
 * TRAILING HIGH surrogate, which is the half of the problem truncation itself creates.
 *
 * `Array.from` iterates by code point: a valid pair arrives as one two-unit string, a lone
 * surrogate as a one-unit string in the surrogate range. That distinction is exactly the
 * test, and it needs no lookbehind (unsupported in Safari before 16.4).
 */
function stripUnpairedSurrogates(text: string): string {
  return Array.from(text)
    .filter((ch) => !(ch.length === 1 && ch.charCodeAt(0) >= 0xd800 && ch.charCodeAt(0) <= 0xdfff))
    .join('');
}

/**
 * The tidying half of {@link boundNote}: unpaired surrogates and control characters out,
 * whitespace runs collapsed, ends trimmed. No capping.
 *
 * Exported so a caller can tell TRUNCATION from TIDYING. The note field reports how much of
 * what was typed will survive, and "typed 400, kept 166" is only honest if the comparison
 * is against the collapsed text rather than the raw keystrokes — otherwise trimming a
 * trailing space would read as losing a character.
 */
export function collapseNote(raw: string): string {
  return (
    stripUnpairedSurrogates(raw)
      // Escapes, not literal bytes: a control-character class written literally is
      // invisible in the source and reads as a stray paste. U+007F (DEL) is in the
      // class too, along with C1 (U+0080-U+009F). C1 is the range a \x00-\x1F shorthand
      // leaves out and the \s+ collapse below does not reach: U+0085 NEL in particular is
      // a line break that neither rule saw, so it reached the composed body verbatim.
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Reduce a reader's note to one bounded, single-line string.
 *
 * Three rules, and the reasoning for each is in this module's header: collapse every
 * whitespace run (newlines included) so one note is exactly one line of the body and cannot
 * forge another `Key: value` line; drop control characters, which are invisible in the
 * preview the reader is asked to check; and cap the length so the composed URL stays far
 * inside what a browser and GitHub will carry.
 *
 * The cap then drops a trailing lone surrogate, because `slice` counts UTF-16 code units
 * and will happily cut an emoji in half. `encodeURIComponent` THROWS `URIError` on a lone
 * surrogate, and the caller composes the GitHub href before the mailto one, so the failure
 * would not even be uniform: the GitHub link would update while the email and submit links
 * silently stopped. One character of a truncated note is the right thing to lose.
 */
export function boundNote(raw: string): string {
  // Both caps, because they bind on different inputs. The character cap is what the
  // textarea counts down for the reader and is the binding one for Latin text; the
  // encoded cap is what keeps the URL deliverable and binds on everything else.
  return truncateToEncoded(collapseNote(raw).slice(0, NOTE_MAX_LENGTH), NOTE_MAX_ENCODED).replace(
    /[\uD800-\uDBFF]$/,
    '',
  );
}

/**
 * The DOI shape: a `10.` registrant prefix, then a slash, then a non-empty suffix.
 *
 * Deliberately a shape check and not a resolution check. The page is static, so there is
 * nothing to resolve against, and a DOI that is well-formed but wrong is a curator's
 * problem to catch against the source — the same standard the rest of the report is held to.
 */
const DOI_RE = /^10\.\d{4,9}\/[^\s?#]+$/;

/**
 * Longest DOI this will accept.
 *
 * The DOI syntax itself sets no limit, but registered DOIs are short: the longest in
 * CAAIL's own corpus is well under 100 characters, and Crossref's own guidance is that
 * they should be. Without a bound the composed body inherits whatever was pasted, so
 * `10.1016/` followed by three thousand characters produced a three-thousand-character
 * mailto and GitHub URL. This module's header states the length rule; it was applied to
 * the note and not here.
 */
export const DOI_MAX_LENGTH = 200;

/**
 * The same bound in encoded characters, for the same reason {@link NOTE_MAX_ENCODED} exists.
 *
 * A character cap does not bound a URL. The note learned this and the DOI did not: a DOI of
 * exactly 200 characters in a script costing nine encoded each measures 1,738 encoded and
 * put the mailto at 2,096, over {@link MAILTO_MAX_URL}, while `isDoiShape` reported it fine.
 * That is the truncated-email failure this module already guards against on the other path,
 * reachable through the one field it did not cover.
 *
 * 600 is far beyond any registered DOI — the suffix is conventionally ASCII, so a real one
 * of 200 characters encodes to about 200 — and still leaves the worst-case URL near 950.
 * The point is to have a bound in the unit that binds, not to be tight.
 */
export const DOI_MAX_ENCODED = 600;

/**
 * What the DOI field itself will hold, which must be STRICTLY LOOSER than the cap above.
 *
 * `maxLength` on the input is enforced by the browser, so it is the most this module can
 * ever be handed. Setting it to {@link DOI_MAX_LENGTH} — the obvious thing, and what this
 * branch did until a review caught it — makes the character-cap rejection unreachable and
 * converts it into SILENT TRUNCATION, which is the one outcome the module says it never
 * produces: an answer that fails the check is dropped, never repaired.
 *
 * Two measured cases, the second of which is not an edge case at all:
 *
 *   * `10.1234/` + 400 `a`s is correctly rejected at 408 characters; cut to 200 by the
 *     field it passes, and the report carries a DOI the reader never typed.
 *   * A REAL 195-character DOI pasted as `https://doi.org/…` is 219 characters. Cut to
 *     200 it normalises to 184, passes, and is composed 11 characters short. Readers paste
 *     resolver URLs — the help text invites it — so this is the ordinary path.
 *
 * The property that makes truncation harmless, rather than the number: whatever the field
 * can hold, minus the longest prefix `normaliseDoi` strips (`https://doi.org/doi:`, 20),
 * must still exceed {@link DOI_MAX_LENGTH}. Then every truncated value is over the cap and
 * is refused rather than quietly accepted. 400 − 20 = 380 > 200 clears it with room, and
 * `report-compose.test.ts` asserts the property rather than the arithmetic.
 *
 * A bound is still wanted here: without one, a pasted article body sits in the field
 * looking like a pending answer.
 */
export const DOI_INPUT_MAX_LENGTH = DOI_MAX_LENGTH * 2;

/**
 * Normalise the ways a reader will paste a DOI into the bare `10.x/…` form.
 *
 * Readers copy what they are looking at, which is usually a resolver URL from the address
 * bar or a `doi:` prefix from a citation. Accepting those and stripping them is one line
 * here and saves an error message that would otherwise fire on a correct answer.
 */
export function normaliseDoi(raw: string): string {
  // Unpaired surrogates out FIRST, for the reason stripUnpairedSurrogates exists: the
  // shape check below calls encodeURIComponent, which throws URIError on one, and it is
  // called from the DOI field's `input` listener, which has no try/catch. A lone LOW
  // surrogate therefore threw on every keystroke from then on, freezing the preview and
  // all three links at their last value with nothing on screen; a lone HIGH one was worse,
  // because it passed the check and threw later, from inside the mailto composer.
  //
  // Notes got this in an earlier round and the DOI path did not, then the round that added
  // the encoded bound put encodeURIComponent on that path without the sanitising that made
  // it safe. Doing it here rather than in isDoiShape keeps it true of the string that is
  // actually composed, since composeBody emits what normaliseDoi returns.
  let value = stripUnpairedSurrogates(raw).trim();
  // To a FIXED POINT, not one pass of each rule. The two prefixes nest in both
  // orders — `https://doi.org/doi:10.x` and `DOI: https://doi.org/10.x`, the second
  // being what a pasted APA citation looks like — and a single pass only ever
  // handled one of them. The other left a resolver URL that `composeBody` emitted
  // while `isDoiShape` normalised a second time and validated the bare DOI, so the
  // field said "that does not look like a DOI" above a report containing it. That
  // is the same validate-one-string, emit-another failure an earlier round claimed
  // to have closed by making this idempotent; it closed one ordering.
  //
  // Terminates because every pass either strips a prefix, strictly shortening the
  // string, or changes nothing and returns. The bound is belt and braces.
  for (let pass = 0; pass < 8; pass += 1) {
    const next = stripDoiPrefixes(value);
    if (next === value) break;
    value = next;
  }
  return value;
}

/** One pass of the two prefix rules. See {@link normaliseDoi}, which iterates it. */
function stripDoiPrefixes(trimmed: string): string {
  const resolver = /^https?:\/\/(?:dx\.)?doi\.org\/(.*)$/is.exec(trimmed);
  // A resolver URL's query and fragment belong to the URL, not to the DOI. This is not a
  // theoretical case: copying a DOI link out of a newsletter or a search result brings
  // `?utm_source=…` with it, and composing that verbatim produced a DOI that resolves to
  // nothing while the page told the reader it had been accepted.
  //
  // A bare `?` still gets no such treatment: outside a URL nothing says it is a query
  // rather than part of the identifier, so the shape check rejects that rather than
  // guessing.
  const afterResolver = resolver ? resolver[1]!.replace(/[?#][\s\S]*$/, '').trim() : trimmed;

  // The `doi:` strip runs on BOTH paths, which is what makes this idempotent. It used to
  // sit on the else branch only, so `https://doi.org/doi:10.1234/abc` returned
  // `doi:10.1234/abc` — and because `isDoiShape` normalises again internally while
  // `composeBody` emitted the once-normalised value, the two disagreed: the review step
  // said "not shaped like a DOI, so it is not in the report below" directly above a report
  // that contained it. Validating and emitting the same string is the invariant; being
  // idempotent is how it is guaranteed rather than remembered.
  return afterResolver.replace(/^doi:\s*/i, '').trim();
}

/** True when `value` normalises to something DOI-shaped. Empty is not an error, just absent. */
export function isDoiShape(value: string): boolean {
  const doi = normaliseDoi(value);
  return (
    doi.length <= DOI_MAX_LENGTH &&
    // Both bounds, exactly as boundNote applies both: the character cap is what the input
    // field counts, and the encoded cap is what keeps the URL deliverable. They coincide
    // for ASCII, which is why checking only the first one looked sufficient.
    encodedLength(doi) <= DOI_MAX_ENCODED &&
    DOI_RE.test(doi)
  );
}

/**
 * The live vocabularies a follow-up answer is checked against.
 *
 * Passed in rather than imported so this module stays pure and the caller decides where
 * they come from — the matrix axes in `papers.json`, the themes in `topics.json`, the tiers
 * in `licenses.ts`.
 */
export interface CorrectionVocabularies {
  readonly methods: readonly string[];
  readonly areas: readonly string[];
  readonly themes: readonly string[];
  readonly tiers: readonly string[];
}

/** Everything the reader has answered so far. */
export interface CorrectionAnswers {
  readonly itemId: string;
  readonly reason: ResolvedReason | null;
  readonly method?: string;
  readonly area?: string;
  readonly tier?: string;
  readonly theme?: string;
  readonly doi?: string;
  readonly note?: string;
}

/** Keep a select's value only if the live vocabulary actually contains it. */
function fromVocabulary(value: string | undefined, allowed: readonly string[]): string {
  return value && allowed.includes(value) ? value : '';
}

/**
 * Compose the finished report body.
 *
 * Every value is re-checked against the live vocabulary rather than trusted from the
 * control that produced it, because the DOM is editable and a page that composed whatever
 * an `<option>` happened to hold would be trusting the reader's devtools. An answer that
 * fails the check is dropped, never repaired: a silently corrected report is worse than a
 * shorter one, since the curator cannot tell it was changed.
 *
 * @returns The body, or `''` when no reason has been picked yet.
 */
export function composeBody(
  answers: CorrectionAnswers,
  vocab: CorrectionVocabularies,
): string {
  const { reason } = answers;
  if (!reason) return '';

  const lines = [`Entry: ${answers.itemId}`, `Problem: ${reason.label}`];

  if (reason.kind === 'matrix') {
    const method = fromVocabulary(answers.method, vocab.methods);
    const area = fromVocabulary(answers.area, vocab.areas);
    // Named separately when only one is given, so a half-answered placement still says
    // exactly which axis it is talking about rather than leaving the curator to infer it.
    if (method && area) lines.push(`Should be: ${method} × ${area}`);
    else if (method) lines.push(`AI/ML method should be: ${method}`);
    else if (area) lines.push(`Research area should be: ${area}`);
  } else if (reason.kind === 'licence') {
    const tier = fromVocabulary(answers.tier, vocab.tiers);
    if (tier) lines.push(`Licence tier should be: ${tier}`);
  } else if (reason.kind === 'topics') {
    const theme = fromVocabulary(answers.theme, vocab.themes);
    if (theme) lines.push(`Subject theme should be: ${theme}`);
  } else if (reason.kind === 'doi') {
    const doi = normaliseDoi(answers.doi ?? '');
    if (isDoiShape(doi)) lines.push(`DOI should be: ${doi}`);
  } else if (reason.kind === 'note') {
    const note = boundNote(answers.note ?? '');
    if (note) lines.push(`Note: ${note}`);
  }

  return lines.join('\n');
}
