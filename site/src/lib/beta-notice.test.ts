import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { toString as mdastToString } from 'mdast-util-to-string';
import {
  BETA_LEAD,
  BETA_BODY,
  BETA_LINKS,
  ROADMAP_PAGE,
  ROADMAP_ANCHOR,
  absoluteBetaHref,
} from './beta-notice';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

// The README copy is the one the site cannot render for itself, so it is the
// copy most likely to drift. Assert it as one line, in order, rather than one
// `toContain` per part: separate checks pass with the parts reordered.
describe('beta notice: README copy', () => {
  it('carries the same wording and links as the site notice', () => {
    const [roadmap, feedback] = BETA_LINKS;
    const expected =
      `> **${BETA_LEAD}** ${BETA_BODY} ` +
      `[${roadmap.label}](${absoluteBetaHref(roadmap.path)}) · ` +
      `[${feedback.label}](${absoluteBetaHref(feedback.path)})`;
    expect(read('README.md')).toContain(expected);
  });
});

describe('beta notice: roadmap anchor', () => {
  it('points at the anchor this module names', () => {
    const [roadmap] = BETA_LINKS;
    expect(roadmap.path.split('#')[1]).toBe(ROADMAP_ANCHOR);
  });

  it('matches a heading on the curation page, slugged as Starlight slugs it', () => {
    // A section added above "Roadmap" renumbers it, and the anchor would then
    // land at the top of the page with every other gate green.
    // Parsed to mdast and slugged from each heading's text, as the renderer does, so
    // a `##` inside a code fence is not counted and inline Markdown is not slugged raw.
    const tree = unified().use(remarkParse).parse(read(ROADMAP_PAGE));
    const slugger = new GithubSlugger();
    const slugs: string[] = [];
    visit(tree, 'heading', (heading) => {
      slugs.push(slugger.slug(mdastToString(heading)));
    });
    expect(slugs).toContain(ROADMAP_ANCHOR);
  });
});
