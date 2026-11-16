import { describe, expect, it } from 'vitest';

import { escapeRegExp } from './escape-regexp';

describe('escapeRegExp', () => {
  const METACHARACTERS = '.*+?^${}()|[]\\';

  it('makes a pattern that matches the text literally, metacharacters included', () => {
    for (const text of [METACHARACTERS, 'a.b', 'at ${width}px', '(of 9) [x]', 'C:\\path', '2026 Edition']) {
      expect(new RegExp(`^${escapeRegExp(text)}$`).test(text), text).toBe(true);
    }
  });

  it('makes a pattern that matches nothing but the text', () => {
    expect(new RegExp(`^${escapeRegExp('a.b')}$`).test('axb')).toBe(false);
    expect(new RegExp(`^${escapeRegExp('a+')}$`).test('aa')).toBe(false);
    expect(new RegExp(`^${escapeRegExp('(a|b)')}$`).test('a')).toBe(false);
    expect(new RegExp(`^${escapeRegExp('[ab]')}$`).test('a')).toBe(false);
  });
});
