/**
 * ask-caail-disclosure.test.ts: the privacy statement and the chat panel's notice
 * agree on what the model's provider does with readers' questions.
 *
 * The privacy statement says it once, in the paragraph anchored `#model-tier`; every
 * other place on the page only links there. The notice says it again at the point
 * of entry, in its own register, so neither can be derived from the other. This
 * fails while the two disagree, and while the page links to `#model-tier` with no
 * such anchor on it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { NOTICE_FACTS } from './ask-caail-disclosure';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');
/** Whitespace collapsed, so rewrapping a line changes nothing. */
const flat = (s: string) => s.replace(/\s+/g, ' ');

/** The tier paragraph's two facts, as it words them: the provider's own use, and review. */
const PAGE_FACTS = [
  'to provide, improve, and develop its own products',
  'its human reviewers may read, annotate, and process them',
];

describe('Ask CAAIL provider-use disclosure', () => {
  // MDX comments are dropped first: text there never renders, so it must not count.
  const mdx = read('./docs/privacy.mdx').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
  const anchorAt = mdx.indexOf('id="model-tier"');
  // The block after the anchor's line is the paragraph every #model-tier link lands on,
  // so the facts are looked for there and nowhere else on the page.
  const tierParagraph = anchorAt < 0 ? '' : flat(mdx.slice(anchorAt).split(/\n\s*\n/)[1] ?? '');
  const notice = flat(read('../components/CaailChatWidget.tsx')).match(
    /<p class="chat-panel-notice">(.*?)<\/p>/,
  )?.[1];

  it('every link to the tier paragraph has an anchor to land on', () => {
    expect(
      !mdx.includes('](#model-tier)') || anchorAt >= 0,
      'privacy.mdx links to #model-tier, but nothing on the page carries id="model-tier"',
    ).toBe(true);
  });

  it('the chat notice agrees with the tier paragraph', () => {
    expect(notice, 'the chat notice was not found in CaailChatWidget.tsx').toBeDefined();
    const pageCount = PAGE_FACTS.filter((f) => tierParagraph.includes(f)).length;
    const noticeCount = NOTICE_FACTS.filter(({ pattern }) => pattern.test(notice!)).length;
    expect(pageCount, 'the tier paragraph states one of its two facts but not the other').not.toBe(1);
    expect(noticeCount, 'the chat notice states one of its two facts but not the other').not.toBe(1);
    expect(
      noticeCount === 2,
      pageCount === 2
        ? 'the tier paragraph says the provider uses and reviews questions, but the chat notice does not'
        : 'the chat notice says the provider uses and reviews questions, but the paragraph after ' +
            'id="model-tier" no longer contains the phrases in PAGE_FACTS. If it still says so in ' +
            'other words, update PAGE_FACTS; if it no longer does, the notice must change too',
    ).toBe(pageCount === 2);
  });
});
