/**
 * ask-caail-disclosure.test.ts — the privacy statement and the chat panel's notice
 * agree on whether the model's provider uses readers' questions for itself.
 *
 * Both are hand-written, in different registers, so neither can be derived from
 * the other. Both describe the model service's unpaid tier, so a change of tier
 * that rewrites one and forgets the other would tell readers two different
 * things, and the one at the point of entry is the one they actually read. This
 * fails whenever one states the provider's own use and the other does not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');

describe('Ask CAAIL provider-use disclosure', () => {
  it('the privacy statement and the chat notice agree on whether the provider uses questions', () => {
    const page = read('./docs/privacy.mdx');
    const notice = read('../components/CaailChatWidget.tsx')
      .match(/<p class="chat-panel-notice">([\s\S]*?)<\/p>/)?.[1];
    expect(notice, 'the chat notice was not found in CaailChatWidget.tsx').toBeDefined();

    const pageStates = page.includes("**The answering model's tier.**");
    const noticeStates = /own products/.test(notice!);
    expect(
      noticeStates,
      pageStates
        ? 'the privacy statement describes the provider using questions, but the chat notice does not'
        : 'the chat notice describes the provider using questions, but the privacy statement does not',
    ).toBe(pageStates);
  });
});
