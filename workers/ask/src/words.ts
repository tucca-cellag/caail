/**
 * The question's word limit, enforced again here because the widget is not a
 * trust boundary: anyone can post to the Worker directly.
 *
 * Both values copy the widget's (site/src/components/CaailChatWidget.tsx), and
 * words.test.ts runs this count and the widget's over one corpus, so the two are
 * held together by a test rather than by this sentence.
 */

/** The most words a question may have. */
export const WORD_LIMIT = 200;

/** Words in a question, counted exactly as the widget counts them. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
