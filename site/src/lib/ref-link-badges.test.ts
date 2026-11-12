/**
 * ref-link-badges.test.ts — the paper cards' link badges never give two links one name
 * (tucca-cellag/caail-planning#656).
 *
 * The component lives in `src/components/`, which vitest's include does not cover; it is
 * tested from here by calling it and reading the links out of the element tree it
 * returns, with no DOM. A screen reader names a link by its `aria-label`, else its text,
 * so that is what is compared.
 */
import { describe, it, expect } from 'vitest';

import RefLinkBadges, { type RefLinks } from '../components/RefLinkBadges';

type Element = { type: unknown; props: Record<string, unknown> & { children?: unknown } };

/** Every link the badges render, in order, as its accessible name and its target. */
function links(node: unknown): Array<{ name: string; href: string }> {
  if (Array.isArray(node)) return node.flatMap(links);
  if (node === null || typeof node !== 'object') return [];
  const el = node as Element;
  if (el.type === 'a') {
    const text = [el.props.children].flat(Infinity).join('');
    return [{ name: String(el.props['aria-label'] ?? text), href: String(el.props.href) }];
  }
  return links(el.props?.children);
}

const none: RefLinks = { codeUrl: null, dataUrl: null, modelUrls: [], notices: [] };

describe('RefLinkBadges', () => {
  it('numbers a notice label that repeats on one card, and leaves a single one as it is', () => {
    const r: RefLinks = {
      ...none,
      notices: [
        { label: 'Correction', url: 'https://doi.org/10.1/one' },
        { label: 'Erratum', url: 'https://doi.org/10.1/two' },
        { label: 'Correction', url: 'https://doi.org/10.1/three' },
      ],
    };
    expect(links(RefLinkBadges({ r }))).toEqual([
      { name: 'ⓘ Correction 1', href: 'https://doi.org/10.1/one' },
      { name: 'ⓘ Erratum', href: 'https://doi.org/10.1/two' },
      { name: 'ⓘ Correction 2', href: 'https://doi.org/10.1/three' },
    ]);
  });

  it('gives every badge on a card its own accessible name', () => {
    const r: RefLinks = {
      codeUrl: 'https://github.com/x/y',
      dataUrl: 'https://zenodo.org/record/1',
      modelUrls: ['https://huggingface.co/org/a/tree/main', 'https://huggingface.co/org/b/tree/main'],
      notices: [
        { label: 'Correction', url: 'https://doi.org/10.1/one' },
        { label: 'Correction', url: 'https://doi.org/10.1/two' },
      ],
    };
    const names = links(RefLinkBadges({ r })).map((l) => l.name);
    expect(names).toHaveLength(6);
    expect(new Set(names).size).toBe(names.length);
  });

  it('names a lone model link Model, with no number', () => {
    const r: RefLinks = { ...none, modelUrls: ['https://huggingface.co/arcinstitute/Stack-Large'] };
    expect(links(RefLinkBadges({ r }))).toEqual([
      { name: 'Model: Stack-Large', href: 'https://huggingface.co/arcinstitute/Stack-Large' },
    ]);
  });
});
