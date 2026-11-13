/**
 * markdown.ts — thin remark/unified structural helpers over Markdown documents.
 *
 * These are LOW-LEVEL primitives. APA-field parsing and the Papers.md model
 * live in other modules — this file has no knowledge of those concerns.
 *
 * All helpers are pure functions over mdast nodes (no side effects beyond
 * the disk read in `parseFile`).
 */

import { readFileSync } from 'node:fs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toString as mdastToString } from 'mdast-util-to-string';
import type { Root, Table, RootContent, Heading, Paragraph } from 'mdast';

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** Parse a Markdown string and return its mdast `Root`. */
export function parseMarkdown(src: string): Root {
  return unified().use(remarkParse).use(remarkGfm).parse(src);
}

/** Read `path` from disk (utf-8) and return the parsed mdast `Root`. */
export function parseFile(path: string): Root {
  const src = readFileSync(path, 'utf-8');
  return parseMarkdown(src);
}

// ---------------------------------------------------------------------------
// firstTable
// ---------------------------------------------------------------------------

/**
 * Return the first top-level GFM `table` node, or `null` if none exists.
 *
 * Only scans direct children of `root` — nested tables inside blockquotes or
 * other containers are intentionally ignored. The Papers.md matrix table is
 * always a top-level node, and a DFS could wrongly return a nested table.
 */
export function firstTable(root: Root): Table | null {
  return root.children.find((n): n is Table => n.type === 'table') ?? null;
}

// ---------------------------------------------------------------------------
// sectionsAfter
// ---------------------------------------------------------------------------

/**
 * Split the document at headings of the given `depth`.
 *
 * Each returned entry contains:
 *   - `heading`: plain text of the heading node (via mdast-util-to-string)
 *   - `nodes`: sibling nodes AFTER that heading up to (not including) the
 *     next heading of depth ≤ `depth`.
 *
 * Content before the first heading of the requested depth is NOT returned.
 * A deeper heading (e.g. `###` when `depth` is `2`) does NOT end a section.
 *
 * @param root  Parsed mdast Root
 * @param depth Heading depth to split on (1–6)
 */
export function sectionsAfter(
  root: Root,
  depth: number
): Array<{ heading: string; nodes: RootContent[] }> {
  const result: Array<{ heading: string; nodes: RootContent[] }> = [];
  let current: { heading: string; nodes: RootContent[] } | null = null;

  for (const node of root.children) {
    if (node.type === 'heading') {
      const h = node as Heading;
      if (h.depth <= depth) {
        // A heading at the target depth (or shallower) starts a new section.
        if (h.depth === depth) {
          if (current !== null) {
            result.push(current);
          }
          current = { heading: mdastToString(h), nodes: [] };
        } else {
          // Shallower heading ends the current section (if any) and no new
          // section is opened at this depth.
          if (current !== null) {
            result.push(current);
            current = null;
          }
        }
        continue;
      }
      // Deeper heading (h.depth > depth): falls through to the default case.
    }
    // Accumulate into the current section.
    if (current !== null) {
      current.nodes.push(node);
    }
  }

  // Push the last open section.
  if (current !== null) {
    result.push(current);
  }

  return result;
}

// ---------------------------------------------------------------------------
// anchorParagraphs
// ---------------------------------------------------------------------------

/**
 * Regex to detect and capture the integer id from `<a id="N">` at the start
 * of an html inline node's value.
 */
const ANCHOR_OPEN_RE = /^<a\s+id="(\d+)">/;

/**
 * Find `paragraph` nodes whose first child is an HTML inline anchor of the
 * form `<a id="N">` (as emitted by remark for explicit `<a id="N">` markup).
 *
 * Returns `{ id, text }` for each, where:
 *   - `id`   is the integer N parsed from the anchor
 *   - `text` is the FULL paragraph text via mdast-util-to-string (includes
 *     the raw `<a id="N">…</a>` HTML and any autolink DOI URLs)
 *
 * @param nodes Top-level sibling nodes to search (e.g. from a section body)
 */
export function anchorParagraphs(
  nodes: RootContent[]
): Array<{ id: number; text: string }> {
  const result: Array<{ id: number; text: string }> = [];

  for (const node of nodes) {
    if (node.type !== 'paragraph') continue;
    const para = node as Paragraph;
    const firstChild = para.children[0];
    if (!firstChild || firstChild.type !== 'html') continue;

    const match = ANCHOR_OPEN_RE.exec(firstChild.value);
    if (!match) continue;

    const id = parseInt(match[1], 10);
    const text = mdastToString(para);
    result.push({ id, text });
  }

  return result;
}

// ---------------------------------------------------------------------------
// labeledLinksAfter
// ---------------------------------------------------------------------------

/**
 * One URL on a label line: http(s), with no whitespace, comma, backslash or `<` (where
 * GFM's autolink stops), and not ending in a character that autolink drops from a URL's
 * end. A closing parenthesis may end one only if it closes one the URL opened, which
 * `labeledLinksAfter` checks, as GFM does. The GFM-parity test in `markdown.test.ts`
 * holds this to what GitHub renders.
 */
const LINE_URL = String.raw`https?://[^\s,\\<]*[^\s,\\<.;:!?'"*_~]`;
/** A label, bold with no whitespace just inside its asterisks (GFM renders no other as bold), and what follows its colon. */
const LABEL_LINE = /^\*\*([^*\s](?:[^*]*[^*\s])?)\*\*:(?: (.*))?$/;
/** What may follow a label's colon: one URL, or several separated by a comma and a space. */
const URL_LIST = new RegExp(String.raw`^${LINE_URL}(?:, ${LINE_URL})*$`);

/**
 * Starting at `nodes[index]`, scan FORWARD over immediately-following
 * `blockquote` nodes and read each of their lines from `src`, the Markdown the
 * nodes were parsed from.
 *
 * The scan stops at the FIRST non-blockquote sibling — it does not skip over
 * intervening paragraphs or headings. A blank line between two labels gives two
 * blockquote nodes, and no blank line gives one; either way each line is read.
 *
 * Every non-blank line is returned, one entry each, in document order, and is held
 * to one strict rule: `> **Label**: url`, or `> **Label**: url, url, …` for several,
 * exactly. Such a line gives `{ label, urls }` (the label as written with its
 * whitespace collapsed, each URL once); a label with nothing after its colon gives
 * `urls: []`. Any other line gives `{ label: null, text }`, the line as written less
 * its `>`, so a caller can refuse it rather than misread it: an annotation after the
 * URLs, a second label, a Markdown link, a wrapped URL and the line it left, another
 * spelling of a label (`**Code** url`, `**Erratum:** url`, `**Code **:`), and a URL
 * GitHub would link differently (one ending in punctuation, `_`, `*`, `~`, an unopened
 * `)` or a hard-break backslash). The rule is the shape `db:emit` writes and every line
 * in `Papers.md` has (tucca-cellag/caail-planning#656); it replaced a set of heuristics
 * over the parsed Markdown whose every refinement let through a new misreading. A
 * GFM-parity test in `markdown.test.ts` asserts that every line it accepts renders on
 * GitHub as the same bold label linking exactly the same URLs.
 *
 * @param nodes Sibling nodes to scan
 * @param index Index of the reference paragraph node (scan begins at index+1)
 * @param src The Markdown `nodes` were parsed from, whose offsets their positions carry
 * @returns One entry per non-blank line, in document order
 */
export function labeledLinksAfter(nodes: RootContent[], index: number, src: string): BlockquoteLine[] {
  const result: BlockquoteLine[] = [];

  for (let i = index + 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type !== 'blockquote') break;

    const { start, end } = node.position!;
    for (const raw of src.slice(start.offset, end.offset).split('\n')) {
      const line = raw.replace(/^\s*>\s?/, '').trim();
      if (line === '') continue;
      const m = LABEL_LINE.exec(line);
      const rest = m?.[2] ?? '';
      const urls = rest === '' ? [] : rest.split(', ');
      if (m === null || (rest !== '' && !URL_LIST.test(rest)) || urls.some(closesUnopened)) {
        result.push({ label: null, text: line });
        continue;
      }
      const label = m[1]!.replace(/\s+/g, ' ');
      result.push({ label, urls: [...new Set(urls)] });
    }
  }

  return result;
}

/** Whether `url` ends in a `)` it never opened, which GFM's autolink drops from the link. */
function closesUnopened(url: string): boolean {
  return url.endsWith(')') && url.split('(').length < url.split(')').length;
}

/** One line of a reference's trailing blockquotes: a label and its URLs, or a line that is not one label and its URLs. */
export type BlockquoteLine = { label: string; urls: string[] } | { label: null; text: string };
