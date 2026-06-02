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
 * Only absolute http(s) URLs are returned — a relative link such as
 * `[Datasets/](./Datasets/)` inside a prose blockquote is not a deposit URL
 * and is silently skipped.
 *
 * @param nodes Sibling nodes to scan
 * @param index Index of the reference paragraph node (scan begins at index+1)
 * @returns Array of `{ label, url }` pairs in encounter order; label is the
 *   original-case bold text (e.g. `"Code"`, `"Data"`).
 */
export function labeledLinksAfter(
  nodes: RootContent[],
  index: number,
): Array<{ label: string; url: string }> {
  const result: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();

  for (let i = index + 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type !== 'blockquote') break;

    for (const child of (node as Blockquote).children) {
      if (child.type !== 'paragraph') continue;

      // Walk inline children: a `strong` sets the current label; the next
      // link (or http text run) is its URL.  This handles both one-pair and
      // multi-pair (soft-break-joined) paragraphs.
      let currentLabel: string | null = null;
      for (const inline of (child as Paragraph).children) {
        if (inline.type === 'strong') {
          currentLabel = mdastToString(inline).trim();
          continue;
        }
        if (currentLabel === null) continue;

        let url: string | null = null;
        if (inline.type === 'link') {
          url = inline.url;
        } else if (inline.type === 'text' && inline.value.trim().startsWith('http')) {
          url = inline.value.trim();
        }

        if (url !== null && ABSOLUTE_URL_RE.test(url)) {
          const key = currentLabel.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            result.push({ label: currentLabel, url });
          }
          currentLabel = null; // consume this label slot
        }
      }
    }
  }

  return result;
}
