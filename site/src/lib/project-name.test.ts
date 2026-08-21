import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * How the work is titled is written out by hand in several places. `CITATION.cff`
 * is the source of truth; this fails when a copy drifts from it.
 *
 * `CLAUDE.md` names this repo's most expensive recurring defect: a hand-typed fact
 * beside a machine-derived one with nothing checking they agree. Its prescribed fix
 * is one of exactly two things — derive the value, or add a check — and it is
 * explicit that a comment saying "keep these in sync" documents the risk without
 * mitigating it. This is the check.
 *
 * WHAT IS COVERED IS THE LIST OF `it` NAMES BELOW, and is deliberately not restated
 * up here. Three drafts of this docstring carried such a list and all three were
 * falsified by the next commit that added a pin — the first was missing
 * `citation.ts` on the day it was written, and the last omitted both organisation
 * pins. An inventory of hand-typed copies is itself a hand-typed copy, in a file
 * whose entire thesis is that those drift. The `it` names cannot go stale, because
 * they are the things.
 *
 * WHAT EARNS A PIN, since "one more copy exists" is true indefinitely and is not on
 * its own a reason:
 *
 *   1. A PAIR RENDERED TOGETHER. An APA line and a BibTeX block sit side by side on
 *      `/cite/`, and again on `README.md`, whose H1 sits forty lines above its own
 *      citations. Pinning one of a pair without the other makes a retitle WORSE than
 *      doing nothing: the page then shows two titles that disagree, which is harder
 *      to notice and harder to trust than two that are equally stale. Pin a pair, or
 *      neither of it.
 *   2. THE TWO AUDIENCES DISAGREEING. This library exists to be read by humans and
 *      queried by agents. `api/index.json`'s `name` is, per its own comment, the
 *      first thing an agent reads. A retitle that moves the hero and not the API
 *      leaves those two surfaces announcing different names for the same project.
 *   3. A COPY THAT CANNOT BE CORRECTED AFTERWARDS. `.zenodo.json` titles the
 *      deposition the concept DOI resolves to, and that DOI is cited from README,
 *      `/cite/` and `CITATION.cff`. Every other copy here is fixed by editing a file;
 *      a minted DOI record is not. Nothing derives it from `CITATION.cff` — there is
 *      no cffconvert step — so hand-editing or this check are the only two options.
 *      Note it does NOT qualify under 1: the Zenodo page's title and its citation
 *      export come from one deposited record, so they cannot disagree with each
 *      other. It can only disagree with this repo.
 *
 *      READ THE REACH OF THIS ONE NARROWLY. `.zenodo.json` is in no workflow's
 *      `paths:` filter, so a PR editing ONLY that file runs nothing and this check
 *      does not fire on it. What it does catch is the realistic retitle, which
 *      starts at `CITATION.cff` and therefore does trigger `test.yml`. Closing the
 *      remaining case means adding the path, which buys a full build and browser
 *      install for one JSON read; that trade is CAAIL-298 and the decision is
 *      CAAIL-301.
 *
 * Everything else is deliberately unpinned. The expansion appears in prose in
 * several other files and chasing each one would make this file the inventory it
 * argues against. The rule is: if you add a copy that meets one of the criteria
 * above, add a pin for it here — and do not add it to a list.
 *
 * These read **source text, not rendered output**. Writing the separator or any
 * part of the expansion as an HTML entity will fail this guard on a page that
 * renders correctly. That is the intended trade: source is what a person edits.
 */

// src/lib -> src -> site -> repo root
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

/**
 * Read a repo file and hand the parser its path, so a failure names the file it
 * actually read.
 *
 * Every parser below takes `source` rather than hardcoding a filename, and this
 * helper is why that cannot drift: the path is written once and used for both the
 * read and the message. Two of them DID hardcode one, and it stopped being true the
 * moment `README.md` became a second call site — a failure there announced
 * `citation.ts has 0 BibTeX title lines`, sending the reader to a file that was
 * correct. That is the same misdirection `parseHeroEyebrow` argues against below.
 */
const readFrom = <T>(rel: string, parse: (text: string, source: string) => T): T =>
  parse(read(rel), rel);

/** The `title:` value from CITATION.cff, e.g. `CAAIL: Cellular Agriculture AI Library`. */
export function parseCitationTitle(cff: string, source: string): string {
  const m = cff.match(/^title:\s*"([^"]+)"\s*$/m);
  if (!m) throw new Error(`${source} has no quoted top-level \`title:\` — this guard cannot run`);
  return m[1];
}

/**
 * The hero eyebrow's source text, e.g. `CAAIL · Cellular Agriculture AI Library`.
 *
 * Requires exactly one `.eyebrow` paragraph. Taking the first match would silently
 * check the wrong element if one were added above it, which is a passing guard on a
 * drifting page — the failure mode this file exists to prevent.
 */
export function parseHeroEyebrow(astro: string, source: string): string {
  // Match any single-`class`-attribute <p> and test the class LIST, rather than
  // hardcoding `class="eyebrow"`. Pinning the attribute exactly made every second
  // class a silent zero-match — `class="eyebrow sr"` would have read as a deleted
  // eyebrow — and this repo wraps homepage section heads in `.sr` already
  // (WhyCaail.astro's `<div class="hd sr">`), so that edit is one refactor away.
  const all = [...astro.matchAll(/<p class="([^"]*)">([^<]+)<\/p>/g)].filter(([, cls]) =>
    cls.split(/\s+/).includes('eyebrow'),
  );
  if (all.length !== 1) {
    // `[^<]+` cannot cross a child element, so a *present* eyebrow carrying nested
    // markup counts as 0 matches and is indistinguishable here from a deleted one.
    // That is not hypothetical: WhyCaail.astro's eyebrow already opens with a
    // `<span class="bar" aria-hidden="true">`, so giving the hero the same decoration
    // trips this. Say so, rather than sending the reader to hunt for a `<p>` that is
    // still there.
    const zero =
      all.length === 0
        ? ' (0 does NOT necessarily mean it was deleted: this matcher also misses an ' +
          'eyebrow that has gained nested markup, or whose `class` is not a single ' +
          'double-quoted attribute — check the element before assuming it is gone)'
        : '';
    throw new Error(
      `${source} has ${all.length} \`.eyebrow\` paragraphs of plain text, expected ` +
        `exactly 1 — this guard cannot tell which one spells out the acronym${zero}`,
    );
  }
  return all[0][2].trim();
}

/**
 * The BibTeX `title` field, with brace protection stripped.
 *
 * Requires exactly one, for the same reason `parseHeroEyebrow` does: add a second
 * BibTeX block (a per-version entry, say) and a first-match parser would silently
 * check the wrong line and pass on a drifted page.
 */
export function parseBibtexTitle(ts: string, source: string): string {
  const all = [...ts.matchAll(/^\s*title\s*=\s*\{(.+)\},\s*$/gm)];
  if (all.length !== 1) {
    throw new Error(
      `${source} has ${all.length} BibTeX \`title = {...}\` lines, expected exactly 1 — ` +
        'this guard cannot tell which one titles the work',
    );
  }
  return all[0][1].replace(/[{}]/g, '');
}

/**
 * The APA work title, e.g. `CAAIL: Cellular Agriculture AI Library`.
 *
 * Anchored on the APA form itself — an italicised work title immediately followed
 * by a `(Version …)` parenthetical — rather than on "the only italics in the file",
 * which is false: `cite.mdx` has three, and the other two are ordinary emphasis.
 */
export function parseApaTitle(mdx: string, source: string): string {
  const all = [...mdx.matchAll(/\*([^*]+)\*\s+\(Version\b/g)];
  if (all.length !== 1) {
    throw new Error(
      `${source} has ${all.length} italicised titles followed by "(Version …)", expected ` +
        'exactly 1 — this guard cannot tell which one titles the work',
    );
  }
  return all[0][1];
}

// The name says the RELATIONSHIP, not the membership. Two earlier titles enumerated
// what this block covers — "everywhere it is written by hand", then "the hero eyebrow
// and the BibTeX title" — and each was falsified by the next commit that added an `it`,
// while still printing on every run as though it were true. A describe string that
// lists its contents is a hand-typed copy of the list directly below it. The `it`
// names are the inventory; this is not.
/**
 * The document title of a Markdown file: its FIRST LINE, which must be an H1.
 *
 * Anchored on position, not on uniqueness. An earlier draft required the file to
 * contain exactly one `# ` heading, on the reasoning that a Markdown document has
 * one H1 by convention — and `README.md` has EIGHT, because it heads every section
 * that way. That draft failed on the real file, which is the outcome it was built
 * for: the premise was wrong and said so instead of quietly matching something.
 *
 * Taking the first of many would have been worse than either. It would have passed,
 * pinned the correct string by luck, and left a guard that silently follows whatever
 * heading happens to sort first if the document is ever reordered.
 */
export function parseMarkdownH1(md: string, source: string): string {
  const first = md.split('\n', 1)[0];
  const m = /^# (.+)$/.exec(first);
  if (!m) {
    throw new Error(
      `${source} does not begin with an \`# \` heading — its first line is ` +
        `${JSON.stringify(first.slice(0, 60))}, so this guard cannot read the title`,
    );
  }
  return m[1].trim();
}

/**
 * The `name` the agent API announces, read from the GENERATED `api/index.json`.
 *
 * Reading the artifact rather than `agent-api.ts`'s literal is deliberate, and the
 * first attempt went the other way for a good-sounding reason — a failure should
 * name the file a person edits. It could not be made precise: `agent-api.ts` has
 * three `name:` properties on their own line, and the other two are output
 * FILENAMES (`datasets.json`, `topics.json`). Separating them by regex means
 * matching on the value, which is the thing under test, so the guard would have
 * asserted the title by assuming it.
 *
 * The JSON has exactly one top-level `name`, so there is nothing to disambiguate.
 * The artifact is committed and `lint-papers.yml`'s API sync guard re-derives it, so
 * it cannot drift from the source; the assertion below says where to fix it.
 */
/**
 * `JSON.parse`, but a failure names the file.
 *
 * The bare call throws `SyntaxError: Unexpected end of JSON input`, which identifies
 * neither the file nor what was wrong with it — and a truncated write, the case the
 * shape guards below were added for, produces INVALID json far more often than it
 * produces valid `null`. An earlier comment here claimed otherwise, which meant the
 * guard covered the rarer half of the case it was written for.
 */
function parseJson(json: string, source: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch (e) {
    throw new Error(
      `${source} is not valid JSON (${e instanceof Error ? e.message : String(e)}) — ` +
        'this guard cannot run',
    );
  }
}

function jsonStringField(json: string, source: string, field: string): string {
  const parsed = parseJson(json, source);
  // Then guard the shape before indexing it: `JSON.parse('null')` is valid and
  // returns null, and indexing that throws "Cannot read properties of null", which
  // again names neither the file nor the cause.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `${source} did not parse to a JSON object (got ${parsed === null ? 'null' : typeof parsed}) — ` +
        'this guard cannot run',
    );
  }
  const value = (parsed as Record<string, unknown>)[field];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${source} has no top-level string \`${field}\` — this guard cannot run`);
  }
  return value;
}

/** `api/index.json` names the library under `name`. */
export function parseAgentApiName(json: string, source: string): string {
  return jsonStringField(json, source, 'name');
}

/**
 * `.zenodo.json` titles the deposit under `title`, NOT `name`.
 *
 * Two parsers rather than one reading whichever key is present: a lenient
 * "try `name`, else `title`" would keep passing if either file were restructured to
 * use the other key, which is exactly the silent-success this file exists to refuse.
 */
export function parseZenodoTitle(json: string, source: string): string {
  return jsonStringField(json, source, 'title');
}

/**
 * The organisation `CITATION.cff` names as an author, e.g.
 * `Tufts University Center for Cellular Agriculture (TUCCA)`.
 *
 * Read from the entity `- name:` under `authors`, NOT from an `affiliation:`. The
 * two carry the same string today, but they answer different questions — who the
 * work is by, versus where a person happens to work — and pinning the site's display
 * name to an affiliation would make changing one author's employer read as renaming
 * the project's owner.
 */
export function parseCitationOrg(cff: string, source: string): string {
  // Identified by the website the lockup itself links to, not by position and not by
  // a substring of the name. CITATION.cff lists TWO entity authors — the centre and
  // "The CAAIL Contributors" — so "the only `- name:`" is false, and matching on the
  // name would mean using the value under test to find the value under test.
  const all = [
    ...cff.matchAll(/^\s*-\s+name:\s*"([^"]+)"\s*\n\s*website:\s*"([^"]+)"\s*$/gm),
  ].filter(([, , site]) => site.includes('cellularagriculture.tufts.edu'));
  if (all.length !== 1) {
    throw new Error(
      `${source} has ${all.length} entity authors whose website is TUCCA's, expected ` +
        'exactly 1 — this guard cannot tell which one names the organisation',
    );
  }
  return all[0][1];
}

/** The `NAME` constant `TuccaLockup` uses for its `aria-label` and its text form. */
export function parseLockupName(astro: string, source: string): string {
  const all = [...astro.matchAll(/^const NAME = '([^']+)';$/gm)];
  if (all.length !== 1) {
    throw new Error(
      `${source} has ${all.length} \`const NAME = '…'\` declarations, expected exactly 1 — ` +
        'this guard cannot tell which one names the organisation',
    );
  }
  return all[0][1];
}

/**
 * Every `creators[].name` in `.zenodo.json`.
 *
 * Returns the whole list rather than trying to pick out the organisation, because
 * the caller already knows the org's name from `CITATION.cff` and can simply ask
 * whether it is credited. Two earlier attempts tried to IDENTIFY the org entry and
 * both were wrong:
 *
 *   - by a substring of its name ("contains 'Center for'"), which uses the value
 *     under test to locate the value under test;
 *   - by the affiliation the human creators share, which is worse than a heuristic:
 *     it fails on a CORRECT change. Add one contributor from another institution —
 *     realistic for a repo that takes outside contributions — and there are two
 *     distinct affiliations and the guard rejects a legitimate edit. It also
 *     contradicted `parseCitationOrg` directly, whose docstring argues against
 *     reading an affiliation because changing one author's employer would read as
 *     renaming the project's owner.
 *
 * Containment has neither problem: renaming the org entry alone still fails, and
 * adding any number of other creators does not.
 */
export function parseZenodoCreatorNames(json: string, source: string): string[] {
  // Shape-guarded at every step, for the reason `jsonStringField` is: a truncated or
  // hand-mangled file must fail with a message naming the file and the cause, not
  // with `creators.map is not a function`.
  const parsed = parseJson(json, source);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `${source} did not parse to a JSON object (got ${parsed === null ? 'null' : typeof parsed}) — ` +
        'this guard cannot run',
    );
  }
  const creators = (parsed as Record<string, unknown>).creators;
  if (!Array.isArray(creators)) {
    throw new Error(
      `${source} has no top-level \`creators\` array (got ${
        creators === undefined ? 'nothing' : typeof creators
      }) — this guard cannot run`,
    );
  }
  const names = creators
    .map((c) => (typeof c === 'object' && c !== null ? (c as { name?: unknown }).name : undefined))
    .filter((n): n is string => typeof n === 'string' && n !== '');
  if (names.length === 0) {
    throw new Error(`${source} has no creator with a non-empty \`name\` — this guard cannot run`);
  }
  return names;
}

// The name states the RELATIONSHIP, not the membership. Three earlier titles named
// their own contents — "everywhere it is written by hand", then "the hero eyebrow and
// the BibTeX title", then "every pinned copy of the TITLE" — and each was falsified by
// the next commit that added an `it`, while still printing on every run as though it
// were true. The third outlived its truth by two rounds, from the moment the
// organisation pins below made it cover more than titles. A describe string that lists
// its contents is a hand-typed copy of the list directly beneath it.
describe('what CITATION.cff records and what the project shows agree', () => {
  const title = () => readFrom('CITATION.cff', parseCitationTitle);

  it('the hero eyebrow expands the acronym exactly as CITATION.cff titles the work', () => {
    const expansion = title().replace(/^CAAIL:\s*/, '');
    expect(expansion, 'CITATION.cff title should read "CAAIL: <expansion>"').not.toBe(title());
    expect(readFrom('site/src/components/Hero.astro', parseHeroEyebrow)).toBe(
      `CAAIL · ${expansion}`,
    );
  });

  it('the BibTeX title matches CITATION.cff once brace protection is stripped', () => {
    expect(readFrom('site/src/lib/citation.ts', parseBibtexTitle)).toBe(title());
  });

  it('README’s heading agrees with the citations further down the same page', () => {
    // The H1 sits about forty lines above README's APA and BibTeX blocks. Pinning
    // those two and not this one would leave the repo's most-read page announcing
    // one title at the top and citing another below it — the same
    // half-a-pair failure the citation cases exist to prevent, one element up.
    expect(readFrom('README.md', parseMarkdownH1)).toBe(title());
  });

  it('README renders the same two citations, so both are pinned there too', () => {
    // README.md carries its own APA line and its own BibTeX block, on one page, for
    // the same reason /cite/ does. It is also the most-read page in the repo. Leaving
    // it out would reproduce there the exact self-contradiction the case below exists
    // to prevent — and the parsers need no changes to reach it.
    expect(readFrom('README.md', parseApaTitle)).toBe(title());
    expect(readFrom('README.md', parseBibtexTitle)).toBe(title());
  });

  it('the name agents read from the API agrees with the one humans read', () => {
    // `api/index.json`'s `name` is, by its own adjacent comment, "the first thing an
    // agent reads". This library's stated purpose is to be queried by agents, so the
    // human-facing and agent-facing names disagreeing is not a cosmetic mismatch —
    // it is the two surfaces this project exists to keep aligned saying different
    // things about what the project is called.
    expect(
      readFrom('site/public/api/index.json', parseAgentApiName),
      'fix the `name:` literal in site/scripts/parser/agent-api.ts, then `pnpm --dir site parse`',
    ).toBe(title());
  });

  it('the lockup names the same organisation the citation record credits', () => {
    // `TuccaLockup`'s NAME constant is what the hero, the footer and every extracted
    // form of the attribution say. Until this assertion it was pinned to nothing:
    // `cite.spec.ts` hardcodes the identical string, so the hero was checked against
    // a second copy of itself. Rename TUCCA in `CITATION.cff` and `.zenodo.json` and
    // every check stayed green while the site and the citation record credited
    // differently-named organisations.
    //
    // Criterion 3: the org name is deposited as a creator on the Zenodo record, so
    // it lands in the same place the title does and is no more correctable after the
    // fact. The `(TUCCA)` parenthetical is stripped for the same reason `CAAIL: ` is
    // stripped from the title above — the record carries the formal form, the page
    // carries the display form, and the relationship between them is what is pinned.
    const org = readFrom('CITATION.cff', parseCitationOrg);
    const display = org.replace(/\s*\(TUCCA\)$/, '');
    expect(display, 'CITATION.cff should name the org as "<display name> (TUCCA)"').not.toBe(org);
    expect(readFrom('site/src/components/TuccaLockup.astro', parseLockupName)).toBe(display);
  });

  it('the archived deposit credits that same organisation', () => {
    // The other half, and the one that gets minted. Asked as containment rather than
    // equality: the question is whether the org CITATION.cff names is among the
    // deposit's creators, which stays true and stays checkable however many other
    // contributors are added.
    const org = readFrom('CITATION.cff', parseCitationOrg);
    expect(
      readFrom('.zenodo.json', parseZenodoCreatorNames),
      `.zenodo.json does not credit ${JSON.stringify(org)} — the minted deposit would name a different body than CITATION.cff`,
    ).toContain(org);
  });

  it('the archived deposit is titled the same as the record that cites it', () => {
    // `.zenodo.json` titles the Zenodo deposition the concept DOI resolves to, and
    // that DOI is cited from README, /cite/ and CITATION.cff. Nothing derives this
    // file from CITATION.cff — no cffconvert step, no generator — so hand-editing or
    // this check are the only two things keeping them in step.
    //
    // Pinned for the reason in 3 above rather than 1: the Zenodo page cannot
    // contradict ITSELF, since its displayed title and its citation export come from
    // the same deposited record. It can contradict the repo, and that is the copy
    // nobody can correct afterwards by editing a file.
    expect(readFrom('.zenodo.json', parseZenodoTitle)).toBe(title());
  });

  it('llms.txt announces the same name to agents that find it that way', () => {
    // The other agent-facing entry point, and a plain Markdown H1, so it needs no
    // parser of its own.
    expect(readFrom('site/public/llms.txt', parseMarkdownH1)).toBe(title());
  });

  it('the APA title on /cite/ matches the BibTeX title rendered beside it', () => {
    // /cite/ renders these two citations on one page. Pinning only the BibTeX one
    // would make a retitle WORSE than leaving both alone: CITATION.cff, the hero and
    // the BibTeX would move together while the APA line stayed put, and the page
    // would show two citations disagreeing about the name of the work. Uniformly
    // stale is recoverable; self-contradicting is not.
    expect(readFrom('site/src/content/docs/cite.mdx', parseApaTitle)).toBe(title());
  });
});

describe('the guard fails loudly rather than silently when a source is restructured', () => {
  it('rejects an unquoted CITATION.cff title instead of returning nothing', () => {
    expect(() =>
      parseCitationTitle('title: CAAIL: Cellular Agriculture AI Library\n', '<fixture>'),
    ).toThrow(
      /no quoted top-level/,
    );
  });

  it('rejects a second .eyebrow rather than silently checking the first', () => {
    const two = '<p class="eyebrow">Something else</p>\n<p class="eyebrow">CAAIL · X</p>';
    expect(() => parseHeroEyebrow(two, '<fixture>')).toThrow(/2 `\.eyebrow` paragraphs/);
  });

  it('still finds the eyebrow when it carries a second class', () => {
    // `.sr` is this homepage's scroll-reveal hook. It sits on a wrapper today, so the
    // eyebrows are all single-class — but nothing enforces that, and an exact
    // `class="eyebrow"` match would have turned that refactor into a guard reporting
    // a deleted element.
    const withSr = '<p class="eyebrow sr">CAAIL · X</p>';
    expect(parseHeroEyebrow(withSr, '<fixture>')).toBe('CAAIL · X');
  });

  it('says nested markup may be the cause, not only a deleted eyebrow', () => {
    // The decoration WhyCaail.astro's own eyebrow already carries. Giving the hero the
    // same one leaves the paragraph present and this matcher blind to it, so the message
    // has to name that possibility or it sends the reader after the wrong thing.
    const nested =
      '<p class="eyebrow"><span class="bar" aria-hidden="true"></span>CAAIL · X</p>';
    expect(() => parseHeroEyebrow(nested, '<fixture>')).toThrow(/nested markup/);
  });

  it('rejects a missing BibTeX title line', () => {
    expect(() => parseBibtexTitle('export const X = `@misc{a, year = {2026},}`;', '<fixture>')).toThrow(
      /0 BibTeX/,
    );
  });

  it('rejects a second BibTeX title rather than silently checking the first', () => {
    const two = '  title        = {{CAAIL}: A},\n  title        = {{CAAIL}: B},\n';
    expect(() => parseBibtexTitle(two, '<fixture>')).toThrow(/2 BibTeX/);
  });

  it('ignores ordinary emphasis and reads only the APA work title', () => {
    // cite.mdx carries three italic spans; only one is the title, and it is the one
    // an APA "(Version …)" parenthetical follows.
    const mdx =
      'See *“Cite this repository”* on GitHub.\n\n' +
      'Author, A. (2026). *CAAIL: X* (Version 1.0.0). Zenodo.\n\n' +
      'Credit the *original source*.\n';
    expect(parseApaTitle(mdx, '<fixture>')).toBe('CAAIL: X');
  });

  it('reads the leading H1 on a file that uses H1 for every section', () => {
    // Not a hypothetical: README.md heads all eight of its sections with `# `. A
    // uniqueness-based parser fails here, and a first-match one passes for the wrong
    // reason. Position is the property that actually identifies the title.
    const many = '# The Title\n\ntext\n\n# A Section\n\nmore\n\n# Another\n';
    expect(parseMarkdownH1(many, '<fixture>')).toBe('The Title');
  });

  it('rejects a file whose first line is not an H1, and quotes what it found', () => {
    expect(() => parseMarkdownH1('## Not the title\n', '<fixture>')).toThrow(
      /does not begin with an .# . heading/,
    );
    expect(() => parseMarkdownH1('\n# Title after a blank line\n', '<fixture>')).toThrow(
      /first line is ""/,
    );
  });

  it('rejects a JSON payload missing its field, rather than reading undefined', () => {
    expect(() => parseAgentApiName('{"corpusDate":"2026-01-01"}', '<fixture>')).toThrow(
      /no top-level string `name`/,
    );
    expect(() => parseAgentApiName('{"name":""}', '<fixture>')).toThrow(/no top-level string/);
    expect(() => parseZenodoTitle('{"upload_type":"software"}', '<fixture>')).toThrow(
      /no top-level string `title`/,
    );
  });

  it('names the file when the JSON does not parse at all', () => {
    // The commoner half of a truncated write, and the half the shape guards below do
    // not reach: `JSON.parse` throws before they run.
    expect(() => parseZenodoTitle('{"title":', 'half-written.json')).toThrow(
      /half-written\.json is not valid JSON/,
    );
    expect(() => parseZenodoCreatorNames('', 'empty.json')).toThrow(/empty\.json is not valid/);
  });

  it('names the file when the JSON is not an object at all', () => {
    // `JSON.parse('null')` is valid. Indexing the result throws a TypeError naming
    // neither the file nor the cause, which is the one thing this file never does.
    expect(() => parseZenodoTitle('null', '<fixture>')).toThrow(/did not parse to a JSON object/);
    expect(() => parseAgentApiName('[]', '<fixture>')).toThrow(/did not parse to a JSON object/);
    expect(() => parseZenodoTitle('null', 'the-real-file.json')).toThrow(/the-real-file\.json/);
  });

  it('keeps crediting the org when a contributor from elsewhere is added', () => {
    // The case that broke the previous implementation. It required every creator to
    // share one affiliation, so this correct edit failed CI.
    const withOutsider = JSON.stringify({
      creators: [
        { name: 'Bromberg, Benjamin', affiliation: 'TUCCA' },
        { name: 'Outside, Contributor', affiliation: 'Some Other University' },
        { name: 'The Org (X)' },
      ],
    });
    expect(parseZenodoCreatorNames(withOutsider, '<fixture>')).toContain('The Org (X)');
  });

  it('names the file when creators is missing or the wrong shape', () => {
    expect(() => parseZenodoCreatorNames('{"title":"x"}', '<fixture>')).toThrow(
      /no top-level `creators` array/,
    );
    expect(() => parseZenodoCreatorNames('{"creators":{}}', '<fixture>')).toThrow(
      /no top-level `creators` array/,
    );
    expect(() => parseZenodoCreatorNames('[]', 'real.json')).toThrow(/real\.json/);
    // A null element must not throw a bare TypeError from the map.
    expect(() => parseZenodoCreatorNames('{"creators":[null,{}]}', '<fixture>')).toThrow(
      /no creator with a non-empty `name`/,
    );
  });

  it('does not accept one file’s key standing in for the other’s', () => {
    // The lenient form would be a single parser trying `name` then `title`. It would
    // keep passing if either file were restructured onto the other key, which is the
    // silent success this file refuses everywhere else.
    expect(() => parseAgentApiName('{"title":"CAAIL: X"}', '<fixture>')).toThrow(/`name`/);
    expect(() => parseZenodoTitle('{"name":"CAAIL: X"}', '<fixture>')).toThrow(/`title`/);
  });

  it('rejects an APA line whose title lost its italics', () => {
    expect(() => parseApaTitle('Author, A. (2026). CAAIL: X (Version 1.0.0).', '<fixture>')).toThrow(
      /0 italicised titles/,
    );
  });
});
