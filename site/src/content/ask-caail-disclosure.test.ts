/**
 * ask-caail-disclosure.test.ts: the privacy statement and the chat panel's notice
 * agree on whether the model's provider uses readers' questions for itself.
 *
 * Both are hand-written, in different registers, so neither can be derived from
 * the other. Every statement of the provider's own use describes the model
 * service's unpaid tier, and the page makes it in several places, so a change of
 * tier that rewrites some of them and forgets the rest, or the notice, would tell
 * readers different things in different places. The notice is the one they
 * actually read. This fails on a partial edit of the page, and whenever the page
 * and the notice disagree.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Source text with whitespace collapsed, so rewrapping a line changes nothing. */
const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8').replace(/\s+/g, ' ');

/** Each place privacy.mdx states the provider's own use, as written there. */
const PAGE_CLAIMS = [
  'to provide, improve, and develop its own products', // "The answering model's tier" paragraph
  'Google also uses questions and answers for its own products', // the provider's table row
  'also uses what it receives for purposes of its own', // the Recipients lead
  'also uses the questions it receives for purposes of its own', // after the purposes list
  'the model provider also keeps that text', // the rights section
];

describe('Ask CAAIL provider-use disclosure', () => {
  const page = read('./docs/privacy.mdx');
  const notice = read('../components/CaailChatWidget.tsx').match(
    /<p class="chat-panel-notice">(.*?)<\/p>/,
  )?.[1];

  it('the privacy statement makes the claim everywhere or nowhere', () => {
    const missing = PAGE_CLAIMS.filter((c) => !page.includes(c));
    expect(
      missing.length === 0 || missing.length === PAGE_CLAIMS.length,
      `privacy.mdx states the provider's own use in some places but not these: ${missing.join(' | ')}`,
    ).toBe(true);
  });

  it('the chat notice agrees with the privacy statement', () => {
    expect(notice, 'the chat notice was not found in CaailChatWidget.tsx').toBeDefined();
    const pageStates = PAGE_CLAIMS.some((c) => page.includes(c));
    const noticeStates = /provider also uses them\b[^.]*\bown products/.test(notice!);
    expect(
      noticeStates,
      pageStates
        ? 'the privacy statement describes the provider using questions, but the chat notice does not'
        : 'the chat notice describes the provider using questions, but the privacy statement does not',
    ).toBe(pageStates);
  });
});
