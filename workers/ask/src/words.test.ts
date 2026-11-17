/**
 * The Worker enforces the widget's word limit again, because the widget is not a
 * trust boundary. That holds only while the two count words the same way and
 * stop at the same number, so this is the check that fails when they stop
 * agreeing, as normalizeQuery's parity test does for the events Worker.
 *
 * The widget keeps its count and its limit private to its module, so they are
 * read from its source: the `wordCount` arrow function and the `WORD_LIMIT`
 * literal. Each is required to appear exactly once. If the widget is refactored
 * so either cannot be found, this fails naming which, the safe direction for a
 * guard: the fix is to point it at the new home (or import it, once the widget
 * exports it), never to delete it.
 *
 * The function is run as JavaScript by removing the one type annotation its
 * signature carries. That is exact rather than a guess, because the pattern that
 * finds the function matches that signature literally; any other TypeScript in
 * its body makes it fail to evaluate, which fails the test. No transpiler is
 * used, and no Node API newer than the repo's floor (Node 22.12).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORD_LIMIT, wordCount } from './words.ts';

const WIDGET = readFileSync(new URL('../../../site/src/components/CaailChatWidget.tsx', import.meta.url), 'utf8');

function once(pattern: RegExp, what: string): RegExpMatchArray {
  const matches = [...WIDGET.matchAll(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))];
  if (matches.length !== 1) {
    throw new Error(`CaailChatWidget.tsx: expected one ${what}, found ${matches.length}; point this test at where it went`);
  }
  return matches[0];
}

function widgetLimit(): number {
  return Number(once(/^const WORD_LIMIT = (\d+);$/m, '`const WORD_LIMIT = <n>;`')[1]);
}

const SIGNATURE = 'const wordCount = (text: string) => {';

// Evaluates this repository's own widget source, in a test, and nothing else.
function widgetWordCount(): (text: string) => number {
  const source = once(/^const wordCount = \(text: string\) => \{\n[\s\S]*?\n\};$/m, `\`${SIGNATURE} ... };\``)[0];
  const javascript = `const wordCount = (text) => {${source.slice(SIGNATURE.length)}`;
  return new Function(`${javascript}\nreturn wordCount;`)() as (text: string) => number;
}

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('word limit parity with the widget', () => {
  it('stops at the same number of words', () => {
    expect(WORD_LIMIT).toBe(widgetLimit());
  });

  const corpus = [
    '',
    ' ',
    '\t\n ',
    'one',
    '  two words  ',
    'tabs\tand\nnewlines\r\nmixed',
    'a no-break space',
    'an em space',
    'zero​width joiner',
    'ideographic　space',
    'punctuation, counts! as? part-of words.',
    '10.1038/s41586-021-03819-2 GSE169291',
    'émigré naïve café',
    '多 語 言',
    words(199),
    words(200),
    words(201),
    `${words(200)}\n`,
  ];

  const theirs = widgetWordCount();
  it.each(corpus.map((text) => [JSON.stringify(text).slice(0, 60), text]))('counts %s the same', (_label, text) => {
    expect(wordCount(text)).toBe(theirs(text));
  });

  // Both directions at the boundary, through the Worker's own count.
  it('admits the limit and refuses one past it', () => {
    expect(wordCount(words(WORD_LIMIT))).toBeLessThanOrEqual(WORD_LIMIT);
    expect(wordCount(words(WORD_LIMIT + 1))).toBeGreaterThan(WORD_LIMIT);
  });
});
