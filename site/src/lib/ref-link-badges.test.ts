/**
 * ref-link-badges.test.ts: the paper cards' link badges never give two links one name
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

/** The text a screen reader reads from `node`: its strings, less anything `aria-hidden`. */
function spoken(node: unknown): string {
  if (Array.isArray(node)) return node.map(spoken).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (node === null || typeof node !== 'object') return '';
  const el = node as Element;
  if (el.props?.['aria-hidden'] === true || el.props?.['aria-hidden'] === 'true') return '';
  return spoken(el.props?.children);
}

/** Every link the badges render, in order, as its accessible name and its target. */
function links(node: unknown): Array<{ name: string; href: string }> {
  if (Array.isArray(node)) return node.flatMap(links);
  if (node === null || typeof node !== 'object') return [];
  const el = node as Element;
  if (el.type === 'a') {
    return [{ name: String(el.props['aria-label'] ?? spoken(el.props.children).trim()), href: String(el.props.href) }];
  }
  return links(el.props?.children);
}

const none: RefLinks = { codeUrl: null, dataUrl: null, modelUrls: [], notices: [] };

describe('RefLinkBadges', () => {
  it('names a notice by its word alone, its glyph hidden from assistive technology', () => {
    const r: RefLinks = { ...none, notices: [{ label: 'Expression of concern', url: 'https://doi.org/10.1/eoc' }] };
    expect(links(RefLinkBadges({ r }))).toEqual([{ name: 'Expression of concern', href: 'https://doi.org/10.1/eoc' }]);
  });

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
      { name: 'Correction 1', href: 'https://doi.org/10.1/one' },
      { name: 'Erratum', href: 'https://doi.org/10.1/two' },
      { name: 'Correction 2', href: 'https://doi.org/10.1/three' },
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

  it('names a model link by its repository, not by the branch or file after it', () => {
    const r: RefLinks = {
      ...none,
      modelUrls: [
        'https://huggingface.co/org/a/tree/main',
        'https://huggingface.co/org/b/blob/main/model.safetensors',
        'https://huggingface.co/org/c/resolve/main/weights.bin',
      ],
    };
    expect(links(RefLinkBadges({ r })).map((l) => l.name)).toEqual(['Model 1: a', 'Model 2: b', 'Model 3: c']);
  });

  it('names a lone model link Model, with no number', () => {
    const r: RefLinks = { ...none, modelUrls: ['https://huggingface.co/arcinstitute/Stack-Large'] };
    expect(links(RefLinkBadges({ r }))).toEqual([
      { name: 'Model: Stack-Large', href: 'https://huggingface.co/arcinstitute/Stack-Large' },
    ]);
  });
});
