/**
 * What the Ask CAAIL disclosure must say about the model provider, in the two places
 * readers meet it. One copy, imported by every check on either place:
 * `ask-caail-disclosure.test.ts` (against the sources, and each against the other),
 * `e2e/privacy.spec.ts` (against the rendered page) and `e2e/chat-widget.spec.ts`
 * (against the rendered panel).
 */

/**
 * The privacy statement's two facts, as the paragraph inside `<div id="model-tier">`
 * words them: the provider's own use, and human review. Rewording that paragraph means
 * updating these, which is the point: the facts are stated once, so they are pinned once.
 */
export const PAGE_FACTS: readonly string[] = [
  'to provide, improve, and develop its own products',
  'its human reviewers may read, annotate, and process them',
];

/**
 * The chat panel notice's two facts, matched as facts rather than wording so rewording the
 * sentence stays a copy edit. Each is tied to the provider or to people, so a mention of
 * our own review of questions cannot stand in for it.
 */
export const NOTICE_FACTS: readonly { pattern: RegExp; missing: string }[] = [
  {
    pattern: /provider\b[^.]*\bown products/i,
    missing: 'the reader is not told the model provider uses the question',
  },
  { pattern: /people may review/i, missing: 'the reader is not told people may review the question' },
];
