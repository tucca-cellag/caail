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
import type { Root, Table, RootContent, Heading, Paragraph, Blockquote } from 'mdast';

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

/** Only absolute http(s) URLs are accepted as deposit links. */
const ABSOLUTE_URL_RE = /^https?:\/\//i;

/**
 * Starting at `nodes[index]`, scan FORWARD over immediately-following
 * `blockquote` nodes and extract labeled deposit links of the form
 * `> **Label**: https://…`.
 *
 * The scan stops at the FIRST non-blockquote sibling — it does not skip over
 * intervening paragraphs or headings.
 *
 * Handles both authoring styles that remark produces:
 *
 *   Separate-node style (blank line between entries):
 *     ```
 *     > **Code**: https://…
 *
 *     > **Data**: https://…
 *     ```
 *     remark emits two blockquote nodes, each with one paragraph child.
 *
 *   Single-node style (no blank line between entries):
 *     ```
 *     > **Code**: https://…
 *     > **Data**: https://…
 *     ```
 *     remark folds both lines into ONE blockquote node — either two paragraph
 *     children, or one paragraph whose inline children are joined by a soft
 *     `break` node. This function scans ALL paragraph children and ALL
 *     `strong`→`link` pairs within each paragraph so both labels are recovered
 *     regardless of authoring style.
 *
 * Every line of those blockquotes is returned, one entry each, in document order.
 * A line that opens with a label gives `{ label, urls }`; any other line gives
 * `{ label: null, text }`, its plain text, so a caller can refuse it rather than
 * lose it. A label is bold that starts the line and is followed by a colon,
 * inside the bold or after it with at most a parenthesis between
 * (`> **Erratum:** url`, `> **Correction** (2025): url`), or straight by a URL
 * (`> **Code** url`). Bold that runs into words (`> **Note** that …`,
 * `> **Important** caveat: …`), and bold anywhere else (`(**archived**)` after a
 * URL), is no label. A label's URLs are the absolute http(s) URLs on its own line
 * (`> **Models**: url1, url2` gives both), each once; a URL wrapped onto the next
 * line is that line's content, not the label's. A label with no such URL is
 * returned with `urls: []`. A relative link such as `[Datasets/](./Datasets/)` is
 * not a deposit URL and is skipped. A blockquote child that is not a paragraph (a
 * list, say) is returned whole as one line with no label.
 *
 * @param nodes Sibling nodes to scan
 * @param index Index of the reference paragraph node (scan begins at index+1)
 * @returns One entry per line, in document order; a label is the bold text as
 *   written (e.g. `"Code"`), without a trailing colon.
 */
export function labeledLinksAfter(nodes: RootContent[], index: number): BlockquoteLine[] {
  const result: BlockquoteLine[] = [];

  for (let i = index + 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type !== 'blockquote') break;

    for (const child of (node as Blockquote).children) {
      if (child.type !== 'paragraph') {
        result.push({ label: null, text: mdastToString(child).trim() });
        continue;
      }
      for (const line of linesOf((child as Paragraph).children)) {
        const label = labelOf(line);
        if (label === null) {
          result.push({ label: null, text: line.map((inline) => mdastToString(inline)).join('').trim() });
          continue;
        }
        const urls: string[] = [];
        for (const inline of line.slice(1)) {
          const found = inline.type === 'link' ? [inline.url] : inline.type === 'text' ? textUrls(inline.value) : [];
          for (const url of found) if (ABSOLUTE_URL_RE.test(url) && !urls.includes(url)) urls.push(url);
        }
        result.push({ label, urls });
      }
    }
  }

  return result;
}

/** One line of a reference's trailing blockquotes: a label and its URLs, or a line that opens no label. */
export type BlockquoteLine = { label: string; urls: string[] } | { label: null; text: string };

type Inline = Paragraph['children'][number];

/**
 * A paragraph's inline children split into its lines, at a hard `break` and at each
 * soft line break inside a text run. Whitespace-only text that starts a line is
 * dropped, and so is a line left with nothing on it.
 */
function linesOf(inlines: Inline[]): Inline[][] {
  const lines: Inline[][] = [[]];
  for (const inline of inlines) {
    if (inline.type === 'break') {
      lines.push([]);
    } else if (inline.type === 'text' && inline.value.includes('\n')) {
      inline.value.split('\n').forEach((part, n) => {
        if (n > 0) lines.push([]);
        if (part !== '') lines.at(-1)!.push({ type: 'text', value: part });
      });
    } else {
      lines.at(-1)!.push(inline);
    }
  }
  return lines
    .map((line) => (line[0]?.type === 'text' && line[0].value.trim() === '' ? line.slice(1) : line))
    .filter((line) => line.length > 0);
}

/** A URL written out in a text run that GFM did not autolink, up to whitespace or a comma. */
const TEXT_URL = /https?:\/\/[^\s,]+/g;
/** The punctuation a sentence leaves after such a URL, which GFM's own autolinks exclude too. */
const TRAILING_PUNCTUATION = /[.;:!?'")\]>]+$/;

function textUrls(text: string): string[] {
  return [...text.matchAll(TEXT_URL)].map((m) => m[0].replace(TRAILING_PUNCTUATION, ''));
}

/**
 * The label a line opens, or null when it opens none: a leading `strong` whose text
 * ends with a colon, or that is followed straight by a link, by a colon (after at
 * most a parenthesis), or by a URL written out (see `labeledLinksAfter`).
 */
function labelOf(line: Inline[]): string | null {
  const first = line[0];
  if (first?.type !== 'strong') return null;
  const text = mdastToString(first).trim();
  if (text.endsWith(':')) return text.slice(0, -1).trim();
  // A space or tab between the bold and an autolinked URL is no content of its own.
  const next = line[1]?.type === 'text' && /^[ \t]*$/.test(line[1].value) ? line[2] : line[1];
  if (next?.type === 'link') return text;
  if (next?.type === 'text' && /^\s*(?:\([^)]*\)\s*)?:|^\s*https?:\/\//.test(next.value)) return text;
  return null;
}
