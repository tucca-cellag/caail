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
import { visit } from 'unist-util-visit';
import type { Root, Table, RootContent, Heading, Paragraph, Blockquote } from 'mdast';

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** Parse a Markdown string and return its mdast `Root`. */
export function parseMarkdown(src: string): Root {
  return unified().use(remarkParse).use(remarkGfm).parse(src) as Root;
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
 * Return the first GFM `table` node in the tree, or `null` if none exists.
 */
export function firstTable(root: Root): Table | null {
  let found: Table | null = null;
  visit(root, 'table', (node: Table) => {
    if (found === null) {
      found = node;
    }
    // Return false-ish to stop visiting after the first match.
    return false;
  });
  return found;
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
// blockquotesAfter
// ---------------------------------------------------------------------------

/**
 * Starting at `nodes[index]`, scan FORWARD over immediately-following
 * `blockquote` nodes (stopping at the first non-blockquote) and extract
 * labeled links of the form `> **Label**: https://…`.
 *
 * Returns `{ label, url }` for each matching blockquote, where:
 *   - `label` is the bold text (e.g. `"Code"`, `"Data"`)
 *   - `url`   is the href of the link node (or the text of a plain-text URL)
 *
 * This associates Code/Data blockquotes with the reference paragraph they
 * follow. In Papers.md a reference paragraph is followed by 0–2 such
 * blockquotes before the next reference paragraph.
 *
 * @param nodes Sibling nodes to scan
 * @param index Index of the reference paragraph node (scan begins at index+1)
 */
export function blockquotesAfter(
  nodes: RootContent[],
  index: number
): Array<{ label: string; url: string }> {
  const result: Array<{ label: string; url: string }> = [];

  for (let i = index + 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type !== 'blockquote') break;

    const bq = node as Blockquote;
    // A matching blockquote has exactly one paragraph child containing
    // strong (the label), text ": ", and a link (or text URL).
    const para = bq.children[0];
    if (!para || para.type !== 'paragraph') continue;

    const children = para.children;
    // Expect: [strong, text(": "), link | text]
    const strongNode = children[0];
    if (!strongNode || strongNode.type !== 'strong') continue;

    const label = mdastToString(strongNode);

    // Find the URL: prefer a link node, fall back to trailing text node.
    let url = '';
    for (let j = 1; j < children.length; j++) {
      const child = children[j];
      if (child.type === 'link') {
        url = child.url;
        break;
      }
      if (child.type === 'text' && child.value.startsWith('http')) {
        url = child.value.trim();
        break;
      }
    }

    if (label && url) {
      result.push({ label, url });
    }
  }

  return result;
}
