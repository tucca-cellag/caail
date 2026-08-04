/**
 * renderMarkdown — Markdown source -> sanitized HTML string, for rendering the chat
 * widget's LLM-generated answer. Same remark/mdast toolchain as the build-time
 * parser (see scripts/parser/catalog.ts), reused at runtime since the answer text
 * isn't known until the browser gets a response. Raw HTML in the source is dropped,
 * not passed through (toHtml/toHast default) — the safe choice for untrusted text.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toHast } from 'mdast-util-to-hast';
import { toHtml } from 'hast-util-to-html';
import { sanitize, defaultSchema } from 'hast-util-sanitize';

const processor = unified().use(remarkParse).use(remarkGfm);

export function renderMarkdown(markdown: string): string {
  return toHtml(sanitize(toHast(processor.parse(markdown)), defaultSchema));
}
