/**
 * Text helpers that run on what a reader sends, or on what the model writes
 * back, and so have to stay linear in its length.
 *
 * A pattern like /[.,;]+$/ looks harmless and is not: on a long run of those
 * characters followed by anything else, every start position re-scans the run
 * and fails at `$`, which is quadratic. One "word" can fill a whole request
 * body, so the word limit does not bound it. These walk instead.
 */

/**
 * Typographic punctuation a reader or a model writes round an identifier or a
 * link: curly quotes and apostrophes, guillemets, the ellipsis, the en and em
 * dashes, and the full-width and CJK brackets and sentence marks. None is part
 * of a DOI or a corpus link as written, so each ends one. The DOI reader stops
 * at these (lookup.ts). The link reader takes only link characters, which
 * excludes them already, and model.test.ts runs it over every one of these.
 * Escaped, so the source shows each code point.
 */
export const TYPOGRAPHIC_PUNCTUATION = [
  '‘’‚‛“”„‟', // curly quotes and apostrophes
  '«»‹›', // guillemets
  '…–—', // ellipsis, en dash, em dash
  '（）［］｛｝〈〉《》「」『』【】〔〕', // full-width and CJK brackets
  '、。！，：；？', // CJK and full-width sentence marks
].join('');

/** `text` without any run of `chars` at its end. */
export function trimTrailing(text: string, chars: ReadonlySet<string>): string {
  let end = text.length;
  while (end > 0 && chars.has(text[end - 1])) end--;
  return text.slice(0, end);
}

/** `text` without a version suffix: a final `.` and the digits after it (SRA051669.1 is SRA051669). */
export function trimVersion(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] >= '0' && text[end - 1] <= '9') end--;
  return end < text.length && end > 0 && text[end - 1] === '.' ? text.slice(0, end - 1) : text;
}
