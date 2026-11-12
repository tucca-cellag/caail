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
 * A label is bold text that starts a line of the blockquote: `> **Code**: url`,
 * `> **Erratum:** url`, `> **Correction** (2025): url` and `> **Code** url` all
 * label what follows, since the bold is followed by a colon (inside or after
 * it) or straight by a URL. Bold prose that starts a line and runs into words
 * with no colon (`> **Note** that …`), and bold anywhere else (`(**archived**)`
 * after a URL), is content, not a label. Each label's URLs are the absolute
 * http(s) URLs after it on its line and on the lines that continue it up to the
 * next line that starts (`> **Models**: url1, url2` gives both); a line that
 * starts without a label ends the label, so a later `See also [x](url)` line is
 * not one of its URLs. A label with no such URL is returned with `urls: []`, so a
 * caller can refuse a label it does not know rather than lose it. A relative link
 * such as `[Datasets/](./Datasets/)` is not a deposit URL and is skipped.
 *
 * @param nodes Sibling nodes to scan
 * @param index Index of the reference paragraph node (scan begins at index+1)
 * @returns One `{ label, urls }` per label occurrence, in document order; label
 *   is the bold text as written (e.g. `"Code"`), without a trailing colon.
 */
export function labeledLinksAfter(
  nodes: RootContent[],
  index: number,
): Array<{ label: string; urls: string[] }> {
  const result: Array<{ label: string; urls: string[] }> = [];

  for (let i = index + 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type !== 'blockquote') break;

    for (const child of (node as Blockquote).children) {
      if (child.type !== 'paragraph') continue;

      // Walk inline children, line by line: a line that starts with a label
      // opens it, and every link (or URL in a text run) after it, until a line
      // starts again, is one of its URLs. This handles both one-pair and
      // multi-pair (soft-break-joined) paragraphs.
      const inlines = (child as Paragraph).children;
      let current: { label: string; urls: string[] } | null = null;
      let atLineStart = true;
      const collect = (urls: string[]): void => {
        for (const url of urls) {
          if (current !== null && ABSOLUTE_URL_RE.test(url) && !current.urls.includes(url)) current.urls.push(url);
        }
      };
      const textUrls = (text: string): string[] => [...text.matchAll(TEXT_URL)].map((m) => m[0]);
      for (let k = 0; k < inlines.length; k++) {
        const inline = inlines[k]!;
        if (atLineStart) {
          atLineStart = false;
          const label = labelAt(inlines, k);
          if (label !== null) {
            current = { label, urls: [] };
            result.push(current);
            continue;
          }
          current = null;
        }
        if (inline.type === 'break') {
          atLineStart = true;
        } else if (inline.type === 'text' && inline.value.includes('\n')) {
          // A soft line break sits inside a text run, at its start, middle or end.
          // The run's first line still belongs to the current label; a line after
          // it starts without one unless the run ends at the break, where the next
          // inline starts a line and may be a label.
          collect(textUrls(inline.value.slice(0, inline.value.indexOf('\n'))));
          current = null;
          atLineStart = inline.value.slice(inline.value.lastIndexOf('\n') + 1).trim() === '';
        } else if (inline.type === 'link') {
          collect([inline.url]);
        } else if (inline.type === 'text') {
          collect(textUrls(inline.value));
        }
      }
    }
  }

  return result;
}

/** A URL written out in a text run that GFM did not autolink, up to whitespace or a comma. */
const TEXT_URL = /https?:\/\/[^\s,]+/g;

/**
 * The label `inlines[k]` opens, or null when it opens none: a `strong` whose text
 * ends with a colon, or that is followed straight by a link, or by text holding a
 * colon before any URL or starting with one (see `labeledLinksAfter`).
 */
function labelAt(inlines: Paragraph['children'], k: number): string | null {
  const inline = inlines[k];
  if (inline?.type !== 'strong') return null;
  const text = mdastToString(inline).trim();
  if (text.endsWith(':')) return text.slice(0, -1).trim();
  // A space or tab between the bold and an autolinked URL is no content of its own.
  let j = k + 1;
  const gap = inlines[j];
  if (gap?.type === 'text' && /^[ \t]*$/.test(gap.value)) j++;
  const next = inlines[j];
  if (next?.type === 'link') return text;
  if (next?.type === 'text') {
    const beforeUrl = next.value.split(/https?:\/\//)[0]!;
    if (beforeUrl.includes(':') || /^\s*https?:\/\//.test(next.value)) return text;
  }
  return null;
}
