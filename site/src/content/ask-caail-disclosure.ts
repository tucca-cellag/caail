/**
 * The two facts the chat panel's notice must state about the model provider, as
 * patterns over its text. Matched as facts rather than wording, so rewording the
 * sentence stays a copy edit. One copy, imported by both checks on the notice:
 * `ask-caail-disclosure.test.ts` (against the source, and against the privacy
 * statement) and `e2e/chat-widget.spec.ts` (against the rendered panel).
 */
export const NOTICE_FACTS: readonly { pattern: RegExp; missing: string }[] = [
  { pattern: /own products/i, missing: 'the reader is not told the model provider uses the question' },
  { pattern: /review/i, missing: 'the reader is not told people may review the question' },
];
