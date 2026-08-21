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
 * Covered: the hero eyebrow (`Hero.astro`); the BibTeX block in
 * `src/lib/citation.ts`, whose own docstring says to update `CITATION.cff` first
 * and mirror it there — an instruction with nothing enforcing it until now; the
 * APA line in `content/docs/cite.mdx`; `README.md`'s heading and both of its
 * citations; the two agent-facing names, `api/index.json`'s `name` (emitted from
 * `agent-api.ts`) and `llms.txt`'s heading; and `.zenodo.json`'s deposit `title`.
 *
 * WHAT IS IN AND WHAT IS OUT, since "one more copy exists" is true indefinitely and
 * is not on its own a reason. Two things earn a pin:
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
 * Everything else is deliberately unpinned, and deliberately not enumerated. The
 * expansion appears in prose in several other files; an earlier draft of this
 * docstring listed them and was already missing `citation.ts` on the day it was
 * written — a hand-typed inventory of hand-typed copies, in a file whose whole
 * thesis is that those drift. Rather than maintain one, the rule is: if you add a
 * copy that meets 1 or 2 above, add it here.
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
function jsonStringField(json: string, source: string, field: string): string {
  const parsed: unknown = JSON.parse(json);
  // Guard the shape before indexing it. `JSON.parse('null')` is valid and returns
  // null, and a truncated write can produce exactly that — indexing it throws
  // "Cannot read properties of null", which names neither the file nor the cause.
  // Every message in this file is built to identify both.
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
 * The organisation `.zenodo.json` credits, from the `contributors`/`creators` entry
 * whose `name` is the org rather than a person.
 *
 * Matched as the one `"name"` sitting on its own line with no `orcid` beside it
 * would be fragile, so this reads the entity by structure: the only entry whose
 * `name` contains "Center for", which is what distinguishes the body from the three
 * people. Stated rather than clever, and it fails loudly if that stops being true.
 */
export function parseZenodoCreatorName(json: string, source: string): string {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${source} did not parse to a JSON object — this guard cannot run`);
  }
  const creators = ((parsed as Record<string, unknown>).creators as unknown[] | undefined) ?? [];
  // Every human creator carries the organisation as their `affiliation`, so the
  // affiliations ARE the org name and they must agree with each other. Reading them
  // rather than picking the creator whose name looks institutional keeps this
  // structural: no substring heuristic, and a disagreement among the people is
  // itself a defect worth failing on.
  const affiliations = [
    ...new Set(
      creators
        .map((c) => (c as { affiliation?: unknown }).affiliation)
        .filter((a): a is string => typeof a === 'string' && a !== ''),
    ),
  ];
  if (affiliations.length !== 1) {
    throw new Error(
      `${source} has ${affiliations.length} distinct creator affiliations, expected exactly 1 — ` +
        `this guard cannot tell which names the organisation (${JSON.stringify(affiliations)})`,
    );
  }
  return affiliations[0];
}

describe('every pinned copy of the title agrees with CITATION.cff', () => {
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

  it('the archived deposit affiliates its authors to that same organisation', () => {
    // The other half, and the one that gets minted. Every human creator in
    // `.zenodo.json` lists the organisation as their affiliation, so if that drifts
    // from CITATION.cff the deposit credits a differently-named body than the
    // citation record does — on a record nobody can edit afterwards.
    expect(readFrom('.zenodo.json', parseZenodoCreatorName)).toBe(
      readFrom('CITATION.cff', parseCitationOrg),
    );
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

  it('names the file when the JSON is not an object at all', () => {
    // `JSON.parse('null')` is valid. Indexing the result throws a TypeError naming
    // neither the file nor the cause, which is the one thing this file never does.
    expect(() => parseZenodoTitle('null', '<fixture>')).toThrow(/did not parse to a JSON object/);
    expect(() => parseAgentApiName('[]', '<fixture>')).toThrow(/did not parse to a JSON object/);
    expect(() => parseZenodoTitle('null', 'the-real-file.json')).toThrow(/the-real-file\.json/);
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
