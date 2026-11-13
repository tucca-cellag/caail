/**
 * link-targets.ts — every link target in a line or a page of Markdown, as the site's parser
 * reads it: link and image destinations with where each is written, and each `href`/`src` in
 * an inline HTML tag. One reader for every consumer, so the agent API's link rewrite and an
 * inventory row's `links` cannot read one cell two ways (tucca-cellag/caail-planning#759).
 * Moved here from agent-api.ts unchanged.
 */

import { visit } from 'unist-util-visit';

import { parseMarkdown } from './markdown.js';

/**
 * Text that can hold no link: no `]` (inline links), no `<` (HTML, angle autolinks), and
 * no `://` or `www.` (GFM autolink literals). An email autolink becomes a mailto, which
 * is always absolute, so `@` needs no parse.
 */
const NO_LINK_SYNTAX = /^(?:(?!:\/\/|www\.)[^\]<])*$/i;

/**
 * An `href` or `src` attribute in an HTML tag: group 1 the name, then its value
 * double-quoted, single-quoted or bare (groups 2 to 4). Not `data-src` or `data-href`,
 * which no browser follows.
 */
const HTML_LINK_ATTR = /(?<![\w-])(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

/**
 * An HTML start tag: its name, then attributes whose quoted values may hold `>`, each
 * after whitespace or straight after a quoted value (`href="/x"title="t"`, which browsers
 * read as two attributes). A closing tag or text between tags is none.
 */
const HTML_START_TAG = /<[a-z][a-z0-9-]*(?:(?:\s+|(?<=["']))[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/gi;

/**
 * A comment (`<!-- … -->`, or the empty `<!-->` and `<!--->`) or a start tag, read in one
 * ordered pass, so a `<!--` quoted inside a tag's attribute stays inside that tag.
 */
const HTML_COMMENT_OR_START_TAG = new RegExp(`<!--(?:>|->|[\\s\\S]*?-->)|${HTML_START_TAG.source}`, 'gi');

/** The start tags in HTML, and the HTML with its comments removed. */
export function scanHtml(html: string): { tags: string[]; uncommented: string } {
  const tags: string[] = [];
  let uncommented = '';
  let last = 0;
  for (const m of html.matchAll(HTML_COMMENT_OR_START_TAG)) {
    if (m[0].startsWith('<!--')) {
      uncommented += html.slice(last, m.index);
      last = m.index! + m[0].length;
    } else {
      tags.push(m[0]);
    }
  }
  return { tags, uncommented: uncommented + html.slice(last) };
}

/**
 * The `href` and `src` attributes of the start tags in HTML, as name and value. Only tag
 * text outside comments is read, so a tag quoted in a comment, or `…&amp;src=GEO` in a
 * link's visible text, is not mistaken for a link.
 */
export function htmlLinkAttrs(html: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const tag of scanHtml(html).tags) {
    for (const m of tag.matchAll(HTML_LINK_ATTR)) out.push({ name: m[1]!, value: m[2] ?? m[3] ?? m[4]! });
  }
  return out;
}

/**
 * What a cell is parsed behind, so its text is read as the inline content of one line,
 * as in the table cell it comes from: a cell opening with `<div>`, `<!-- -->` or
 * `[a]: x` would otherwise start an HTML block or a definition and hide its links.
 */
const INLINE_PREFIX = 'x ';

/**
 * One link target in Markdown text, what wrote it (a link, an image, a reference definition,
 * or an `href`/`src` in an HTML tag), and where its destination is written, where it can be
 * rewritten in place.
 */
export interface LinkTarget { url: string; kind: 'link' | 'image' | 'definition' | 'footnote' | 'html'; at: { start: number; end: number } | null; label?: string }

/**
 * Where a link or image `node`'s destination is written in `md`: after the `](` that
 * closes its label, past any whitespace and an opening `<`. A link's label ends at its
 * last child, so a title or text holding `](url` is never taken for the destination.
 * Null where the destination is not written as the URL remark reads (escaped or
 * entity-encoded), or there is none (a GFM autolink).
 */
function destinationAt(md: string, node: any): { start: number; end: number } | null {
  const s: number | undefined = node.position?.start.offset;
  const e: number | undefined = node.position?.end.offset;
  if (s === undefined || e === undefined || !node.url) return null;
  const label = node.type === 'link' ? node.children?.at(-1)?.position?.end.offset : undefined;
  const i = md.indexOf('](', label ?? s);
  if (i === -1 || i >= e) return null;
  let j = i + 2;
  while (j < e && /\s/.test(md[j]!)) j++;
  if (md[j] === '<') j++;
  return md.startsWith(node.url, j) ? { start: j, end: j + node.url.length } : null;
}

/**
 * Every link target in a line of Markdown as the site's parser reads it inside a table
 * cell (`parseMarkdown`, remark with GFM, behind `INLINE_PREFIX`): each link and image
 * destination with where it is written, and each `href`/`src` in an inline HTML tag,
 * which is checked but never rewritten. Parsing, not a pattern, keeps a code span's
 * `[x](y)` from counting as a link and reads every destination form remark does. Its
 * one walk serves the rewrite and the check. A reference link (`[x][ref]`) is a link
 * only where its page defines `[ref]:`, which no dataset page may
 * (`buildDatasetInventory` refuses one), so in a cell it is text, here and on the site.
 *
 * With `page`, `md` is a whole page of block Markdown, read as it stands (no inline
 * prefix), and its reference definitions (`[ref]: url`) are targets too
 * (tucca-cellag/caail-planning#810).
 */
export function markdownLinkTargets(md: string, page = false): LinkTarget[] {
  if (NO_LINK_SYNTAX.test(md)) return [];
  const prefix = page ? '' : INLINE_PREFIX;
  const src = prefix + md;
  const out: LinkTarget[] = [];
  visit(parseMarkdown(src), (node: any) => {
    if (node.type === 'link' || node.type === 'image' || node.type === 'definition') {
      if (node.type === 'definition') {
        // Reported for a caller that refuses it (see `absolutizePageLinks`), never rewritten.
        out.push({ url: node.url, kind: 'definition', at: null, label: node.label ?? node.identifier });
        return;
      }
      const at = destinationAt(src, node);
      out.push({ url: node.url, kind: node.type, at: at && { start: at.start - prefix.length, end: at.end - prefix.length } });
    } else if (page && node.type === 'footnoteDefinition') {
      // A footnote is no link, but its definition is shared like a reference's in a concatenated file.
      out.push({ url: '', kind: 'footnote', at: null, label: node.label ?? node.identifier });
    } else if (node.type === 'html' || node.type === 'text') {
      // micromark reads `<a href=../x.csv>` (a bare value holding `/`) as text, but
      // CommonMark and GitHub's cmark-gfm read it as a tag, so an agent may render it as one.
      for (const a of htmlLinkAttrs(String(node.value))) out.push({ url: a.value, kind: 'html', at: null });
    }
  });
  return out;
}
