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
 * citations; and the two agent-facing names, `api/index.json`'s `name` (emitted from
 * `agent-api.ts`) and `llms.txt`'s heading.
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
export function parseAgentApiName(json: string, source: string): string {
  const parsed: unknown = JSON.parse(json);
  const name = (parsed as { name?: unknown }).name;
  if (typeof name !== 'string' || name === '') {
    throw new Error(`${source} has no top-level string \`name\` — this guard cannot run`);
  }
  return name;
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

  it('rejects an API payload with no top-level name, rather than reading undefined', () => {
    expect(() => parseAgentApiName('{"corpusDate":"2026-01-01"}', '<fixture>')).toThrow(
      /no top-level string `name`/,
    );
    expect(() => parseAgentApiName('{"name":""}', '<fixture>')).toThrow(/no top-level string/);
  });

  it('rejects an APA line whose title lost its italics', () => {
    expect(() => parseApaTitle('Author, A. (2026). CAAIL: X (Version 1.0.0).', '<fixture>')).toThrow(
      /0 italicised titles/,
    );
  });
});
