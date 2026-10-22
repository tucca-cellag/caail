/**
 * media.test.ts: covers the link-list helpers Talks.md and the primers share.
 *
 * itemFromListItem's note separator is a contract between two sources that
 * write it differently (`: ` in the primers, ` — ` in Talks.md), so its cases
 * live here, beside the function, rather than in either consumer's suite.
 */
import { describe, it, expect } from 'vitest';
import type { List } from 'mdast';

import { parseMarkdown } from './markdown.js';
import { itemFromListItem } from './media.js';

describe('itemFromListItem note separator', () => {
  /** The first item of the first list in a Markdown snippet. */
  const firstItem = (md: string) => {
    const list = parseMarkdown(md).children.find((n): n is List => n.type === 'list');
    if (!list) throw new Error('fixture has no list');
    return itemFromListItem(list.children[0]);
  };

  it('drops the ": " separator the primers use, leaving no leading colon', () => {
    expect(firstItem('* [A Title](https://example.org/a): the note text\n')).toMatchObject({
      title: 'A Title',
      url: 'https://example.org/a',
      note: 'the note text',
    });
  });

  it('drops the dash separators Talks.md items are written with', () => {
    expect(firstItem('* [A Title](https://example.org/a) — the note text\n')?.note).toBe('the note text');
    expect(firstItem('* [A Title](https://example.org/a) – the note text\n')?.note).toBe('the note text');
    expect(firstItem('* [A Title](https://example.org/a) -- the note text\n')?.note).toBe('the note text');
  });

  it('keeps a colon that follows a parenthetical rather than the title', () => {
    expect(firstItem('* [A Title](https://example.org/a) (Venue, 2026): the note text\n')?.note).toBe(
      '(Venue, 2026): the note text',
    );
  });

  it('keeps a colon inside the link title', () => {
    expect(firstItem('* [Course: Part One](https://example.org/a): the note text\n')).toMatchObject({
      title: 'Course: Part One',
      note: 'the note text',
    });
  });

  it('gives an empty note to an item with no text after the link', () => {
    expect(firstItem('* [A Title](https://example.org/a)\n')?.note).toBe('');
  });

  it('strips one separator only, so a note starting with a minus sign keeps it', () => {
    expect(firstItem('* [A Title](https://example.org/a): -80 °C storage\n')?.note).toBe('-80 °C storage');
    expect(firstItem('* [A Title](https://example.org/a) — -80 °C storage\n')?.note).toBe('-80 °C storage');
  });

  it('takes a hyphen as a separator only with a space on each side', () => {
    expect(firstItem('* [A Title](https://example.org/a) - the note text\n')?.note).toBe('the note text');
    expect(firstItem('* [A Title](https://example.org/a) -80 °C storage\n')?.note).toBe('-80 °C storage');
    expect(firstItem('* [PyTorch](https://pytorch.org)-based tutorials\n')?.note).toBe('-based tutorials');
  });
});
