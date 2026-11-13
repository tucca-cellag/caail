/**
 * markdown.test.ts — tests for the remark/unified structural helpers.
 *
 * Strategy: use parseMarkdown() with inline string fixtures for most cases
 * (no disk I/O required). Use parseFile() once to prove disk round-trip.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Root, Paragraph, Blockquote, Link } from 'mdast';
import { toString as mdastToString } from 'mdast-util-to-string';

import {
  parseMarkdown,
  parseFile,
  firstTable,
  sectionsAfter,
  anchorParagraphs,
  labeledLinksAfter,
} from './markdown.js';

const FIXTURES_DIR = join(fileURLToPath(import.meta.url), '..', 'fixtures');

// ---------------------------------------------------------------------------
// parseMarkdown / parseFile
// ---------------------------------------------------------------------------

describe('parseMarkdown', () => {
  it('returns a Root node', () => {
    const root = parseMarkdown('# Hello\n\nSome text.');
    expect(root.type).toBe('root');
  });

  it('parses a paragraph child', () => {
    const root = parseMarkdown('Hello world.');
    expect(root.children[0].type).toBe('paragraph');
  });

  it('parses a heading child', () => {
    const root = parseMarkdown('## My Heading');
    const h = root.children[0];
    expect(h.type).toBe('heading');
    if (h.type === 'heading') {
      expect(h.depth).toBe(2);
    }
  });

  it('parses an empty document to a root with no children', () => {
    const root = parseMarkdown('');
    expect(root.type).toBe('root');
    expect(root.children).toHaveLength(0);
  });
});

describe('parseFile', () => {
  it('reads and parses the disk fixture, returning a Root with expected child types', () => {
    const path = join(FIXTURES_DIR, 'sample.md');
    const root = parseFile(path);
    expect(root.type).toBe('root');
    // The fixture has a heading, table, headings, paragraphs, blockquotes
    const types = root.children.map((c) => c.type);
    expect(types).toContain('heading');
    expect(types).toContain('table');
    expect(types).toContain('paragraph');
    expect(types).toContain('blockquote');
  });
});

// ---------------------------------------------------------------------------
// firstTable
// ---------------------------------------------------------------------------

describe('firstTable', () => {
  it('returns null when there is no table', () => {
    const root = parseMarkdown('# Heading\n\nJust text.');
    expect(firstTable(root)).toBeNull();
  });

  it('finds a GFM table', () => {
    const root = parseMarkdown(
      '| A | B |\n|---|---|\n| 1 | 2 |'
    );
    const table = firstTable(root);
    expect(table).not.toBeNull();
    expect(table?.type).toBe('table');
  });

  it('returns the FIRST table when multiple exist', () => {
    const root = parseMarkdown(
      '| A | B |\n|---|---|\n| 1 | 2 |\n\nParagraph\n\n| C | D |\n|---|---|\n| 3 | 4 |'
    );
    const table = firstTable(root);
    expect(table).not.toBeNull();
    // table.children[0] is the header tableRow; its first child is a tableCell
    const firstCell = table?.children[0]?.children[0]; // header row -> first cell
    expect(firstCell?.type).toBe('tableCell');
    const inner = firstCell?.children[0];
    expect(inner?.type === 'text' ? inner.value : '').toBe('A');
  });

  it('returns the table from the disk fixture', () => {
    const root = parseFile(join(FIXTURES_DIR, 'sample.md'));
    const table = firstTable(root);
    expect(table).not.toBeNull();
    expect(table?.type).toBe('table');
  });
});

// ---------------------------------------------------------------------------
// sectionsAfter
// ---------------------------------------------------------------------------

describe('sectionsAfter', () => {
  const DOC = `Preamble before any section.

## Alpha

Alpha paragraph 1.

Alpha paragraph 2.

## Beta

Beta paragraph.

### Beta sub

Sub content.

## Gamma

Gamma paragraph.
`;

  it('returns entries only for depth-2 headings (not preamble content)', () => {
    const root = parseMarkdown(DOC);
    const sections = sectionsAfter(root, 2);
    const headings = sections.map((s) => s.heading);
    expect(headings).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('excludes content before the first depth-2 heading', () => {
    const root = parseMarkdown(DOC);
    const sections = sectionsAfter(root, 2);
    // No section should contain the preamble paragraph
    const allTexts = sections.flatMap((s) =>
      s.nodes.filter((n) => n.type === 'paragraph')
    );
    // The preamble "Preamble before any section." should not appear
    expect(
      allTexts.some(
        (n) =>
          n.type === 'paragraph' &&
          n.children.some(
            (c) => c.type === 'text' && (c as { value: string }).value.includes('Preamble')
          )
      )
    ).toBe(false);
  });

  it('assigns the correct nodes to each section', () => {
    const root = parseMarkdown(DOC);
    const sections = sectionsAfter(root, 2);

    const alpha = sections.find((s) => s.heading === 'Alpha')!;
    expect(alpha).toBeDefined();
    const alphaParagraphs = alpha.nodes.filter((n) => n.type === 'paragraph');
    expect(alphaParagraphs).toHaveLength(2);

    const beta = sections.find((s) => s.heading === 'Beta')!;
    expect(beta).toBeDefined();
    // Beta section should contain the paragraph AND the h3 heading AND the sub content
    // (### does NOT end a ## section)
    const betaTypes = beta.nodes.map((n) => n.type);
    expect(betaTypes).toContain('heading'); // the ### sub-heading
    expect(betaTypes).toContain('paragraph');
  });

  it('a deeper (###) heading does NOT end a ## section', () => {
    const root = parseMarkdown(DOC);
    const sections = sectionsAfter(root, 2);
    const beta = sections.find((s) => s.heading === 'Beta')!;
    // ### Beta sub should be inside Beta's nodes, not end it
    const h3s = beta.nodes.filter(
      (n) => n.type === 'heading' && (n as { depth: number }).depth === 3
    );
    expect(h3s).toHaveLength(1);
  });

  it('another ## heading DOES end the preceding section', () => {
    const root = parseMarkdown(DOC);
    const sections = sectionsAfter(root, 2);
    const alpha = sections.find((s) => s.heading === 'Alpha')!;
    // Alpha should not contain any nodes from Beta
    const betaNodes = alpha.nodes.filter(
      (n) =>
        n.type === 'paragraph' &&
        n.children.some(
          (c) => c.type === 'text' && (c as { value: string }).value.includes('Beta paragraph')
        )
    );
    expect(betaNodes).toHaveLength(0);
  });

  it('returns empty array when no headings of the given depth exist', () => {
    const root = parseMarkdown('# Top\n\nText.\n\n### Deep\n\nMore.');
    const sections = sectionsAfter(root, 2);
    expect(sections).toHaveLength(0);
  });

  it('works correctly with the disk fixture — finds References and Reviews & Perspectives', () => {
    const root = parseFile(join(FIXTURES_DIR, 'sample.md'));
    const sections = sectionsAfter(root, 2);
    const headings = sections.map((s) => s.heading);
    expect(headings).toContain('References');
    expect(headings).toContain('Reviews & Perspectives');
  });
});

// ---------------------------------------------------------------------------
// anchorParagraphs
// ---------------------------------------------------------------------------

describe('anchorParagraphs', () => {
  it('extracts id and full text for a single anchor paragraph', () => {
    const src = '<a id="3">3</a> Author, A. (2022). Title. *Journal*, 1(1), 1. https://doi.org/10.1234/x';
    const root = parseMarkdown(src);
    const results = anchorParagraphs(root.children);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(3);
    // The text includes the raw html anchor string
    expect(results[0].text).toContain('<a id="3">');
    // The text includes the DOI URL (comes from a link node)
    expect(results[0].text).toContain('https://doi.org/10.1234/x');
  });

  it('ignores normal paragraphs (no anchor)', () => {
    const src = 'Just a normal paragraph.\n\n<a id="1">1</a> Real ref. https://doi.org/10.1/x';
    const root = parseMarkdown(src);
    const results = anchorParagraphs(root.children);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(1);
  });

  it('parses the integer id correctly', () => {
    const src = '<a id="42">42</a> Some author (2020). Title. https://doi.org/10.1/y';
    const root = parseMarkdown(src);
    const results = anchorParagraphs(root.children);
    expect(results[0].id).toBe(42);
    expect(typeof results[0].id).toBe('number');
  });

  it('returns the full text INCLUDING the anchor HTML and DOI URL', () => {
    const src = '<a id="7">7</a> Brown, X. (2021). Paper. *Bio Journal*, 5(2), 100-110. https://doi.org/10.5/z';
    const root = parseMarkdown(src);
    const results = anchorParagraphs(root.children);
    const { text } = results[0];
    // Anchor html is included
    expect(text).toContain('<a id="7">');
    expect(text).toContain('</a>');
    // Author text is included
    expect(text).toContain('Brown, X.');
    // DOI link text is included
    expect(text).toContain('https://doi.org/10.5/z');
  });

  it('handles multiple anchor paragraphs in sequence', () => {
    const src = [
      '<a id="1">1</a> First, A. (2020). Title one. https://doi.org/10.1/a',
      '',
      'Normal paragraph (should be ignored).',
      '',
      '<a id="2">2</a> Second, B. (2021). Title two. https://doi.org/10.2/b',
    ].join('\n');
    const root = parseMarkdown(src);
    const results = anchorParagraphs(root.children);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe(1);
    expect(results[1].id).toBe(2);
  });

  it('returns [] when given an empty nodes array', () => {
    expect(anchorParagraphs([])).toHaveLength(0);
  });

  it('correctly processes anchor paragraphs from the disk fixture References section', () => {
    const root = parseFile(join(FIXTURES_DIR, 'sample.md'));
    const sections = sectionsAfter(root, 2);
    const refs = sections.find((s) => s.heading === 'References')!;
    const results = anchorParagraphs(refs.nodes);
    // Fixture has refs 1-4 in the References section
    const ids = results.map((r) => r.id);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
    expect(ids).toContain(4);
    // All texts contain anchor html
    for (const r of results) {
      expect(r.text).toContain('<a id=');
    }
  });
});

// ---------------------------------------------------------------------------
// labeledLinksAfter
// ---------------------------------------------------------------------------

describe('labeledLinksAfter', () => {
  /** The blockquote lines `md` after one reference, read as `parseReferences` reads them. */
  const read = (...md: string[]) => {
    const src = ['<a id="1">1</a> Author (2021). Title. https://doi.org/10.1/a', '', ...md].join('\n');
    return labeledLinksAfter(parseMarkdown(src).children, 0, src);
  };

  it('(a) separate blockquote nodes — both Code and Data recovered', () => {
    // Blank line between the two blockquotes → remark emits two separate nodes.
    expect(read('> **Code**: https://github.com/org/repo', '', '> **Data**: https://zenodo.org/record/999')).toEqual([
      { label: 'Code', urls: ['https://github.com/org/repo'] },
      { label: 'Data', urls: ['https://zenodo.org/record/999'] },
    ]);
  });

  it('(b) single blockquote node (no blank line between Code and Data) — BOTH labels recovered', () => {
    // No blank line → remark folds both lines into ONE blockquote node.
    expect(read('> **Code**: https://github.com/example/merged', '> **Data**: https://zenodo.org/record/merged')).toEqual([
      { label: 'Code', urls: ['https://github.com/example/merged'] },
      { label: 'Data', urls: ['https://zenodo.org/record/merged'] },
    ]);
  });

  it('(c) comma-separated URLs on one line — every URL recovered under its label (tucca-cellag/caail-planning#656)', () => {
    // `> **Models**: url1, url2` is how ref 124 lists its two model checkpoints.
    expect(read('> **Models**: https://huggingface.co/a/one, https://huggingface.co/a/two')).toEqual([
      { label: 'Models', urls: ['https://huggingface.co/a/one', 'https://huggingface.co/a/two'] },
    ]);
  });

  it('returns a label with nothing after its colon, with no URLs, so a caller can refuse it', () => {
    expect(read('> **Retraction**:')).toEqual([{ label: 'Retraction', urls: [] }]);
  });

  it('returns each label occurrence, in document order, as written, with its whitespace collapsed', () => {
    expect(read(
      '> **Correction**: https://doi.org/10.1/one', '', '> **Erratum**: https://doi.org/10.1/two', '',
      '> **correction**: https://doi.org/10.1/three', '', '> **Expression of  concern**: https://doi.org/10.1/four',
    )).toEqual([
      { label: 'Correction', urls: ['https://doi.org/10.1/one'] },
      { label: 'Erratum', urls: ['https://doi.org/10.1/two'] },
      { label: 'correction', urls: ['https://doi.org/10.1/three'] },
      { label: 'Expression of concern', urls: ['https://doi.org/10.1/four'] },
    ]);
  });

  it('serves a repeated URL on one line once', () => {
    expect(read('> **Models**: https://huggingface.co/a/one, https://huggingface.co/a/one')).toEqual([
      { label: 'Models', urls: ['https://huggingface.co/a/one'] },
    ]);
  });

  it('takes a URL whose last character is a parenthesis it opened', () => {
    expect(read('> **Data**: https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual([
      { label: 'Data', urls: ['https://en.wikipedia.org/wiki/Foo_(bar)'] },
    ]);
  });

  it('returns any line that is not exactly a label and its URLs as it is written, with no label', () => {
    const cases = [
      // An annotation after the URLs (R7-3), bold or not, and a second label inside one (R7-1).
      '**Code**: https://github.com/x/y (**archived**)',
      '**Correction**: https://doi.org/10.1/x (Fig. 2 only)',
      '**Models**: https://huggingface.co/a (see **Data**: https://zenodo.org/1)',
      // A second label on the line.
      '**Models**: https://huggingface.co/a/one **Correction**: https://doi.org/10.1/c',
      // Label spellings the rule does not take: no colon, the colon inside the bold, a parenthesis.
      '**Code** https://github.com/x/y',
      '**Erratum:** https://doi.org/10.1/err',
      '**Correction** (2025): https://doi.org/10.1/cor',
      // Bold prose, an unbolded label, a bare URL, a Markdown link, prose.
      '**Important** caveat: see https://example.org/a',
      'Correction: https://doi.org/10.1/x',
      'https://doi.org/10.1/y',
      '**Code**: [the repo](https://github.com/x/y)',
      'See also [Datasets/](./Datasets/) for more.',
      // URLs joined with no space after the comma (R7-2), and words where a URL should be.
      '**Models**: https://hf.co/a,https://hf.co/b',
      '**Correction**: see the journal',
    ];
    for (const line of cases) expect(read(`> ${line}`), line).toEqual([{ label: null, text: line }]);
  });

  it('accepts only lines GitHub renders as that bold label linking exactly those URLs (GFM parity)', () => {
    // The rule is checked against GFM's own parse rather than hand-copied from it: any line it
    // accepts must render on GitHub, where these lines are read, as the same label and links.
    const accepted = [
      '**Code**: https://github.com/org/repo',
      '**Models**: https://huggingface.co/a/one, https://huggingface.co/a/two',
      '**Data**: https://en.wikipedia.org/wiki/Foo_(bar)',
      '**Data**: https://example.org/a(b',
      '**Data**: https://example.org/q?a=1&b=2',
      '**Correction**: https://doi.org/10.1/x',
    ];
    const refused = [
      // Endings GFM's autolink drops (R8-1), and a character it stops at.
      '**Code**: https://github.com/org/repo_',
      '**Code**: https://github.com/org/repo*',
      '**Code**: https://github.com/org/repo~',
      '**Data**: https://example.org/x)',
      '**Code**: https://github.com/x<y',
      // Bold GFM does not render (R8-2).
      '**Code **: https://github.com/x',
      '** Code**: https://github.com/x',
    ];
    for (const line of [...accepted, ...refused]) {
      const src = `<a id="1">1</a> Author (2021). Title. https://doi.org/10.1/a\n\n> ${line}`;
      const root = parseMarkdown(src);
      const [entry] = labeledLinksAfter(root.children, 0, src);
      expect(entry?.label !== null, line).toBe(accepted.includes(line));
      if (entry === undefined || entry.label === null) continue;
      const inlines = ((root.children[1] as Blockquote).children[0] as Paragraph).children;
      expect(inlines[0]?.type, line).toBe('strong');
      expect(mdastToString(inlines[0]!).replace(/\s+/g, ' '), line).toBe(entry.label);
      expect(entry.urls, line).toEqual(inlines.filter((n) => n.type === 'link').map((n) => (n as Link).url));
    }
  });

  it('returns a URL ending in sentence punctuation as no URL, rather than serving or trimming it', () => {
    for (const tail of ['.', ';', ':', '!', '?']) {
      const line = `**Data**: https://zenodo.org/record/1${tail}`;
      expect(read(`> ${line}`), tail).toEqual([{ label: null, text: line }]);
    }
  });

  it('returns a URL wrapped onto its own line, and the line it left, each with no label', () => {
    expect(read('> **Models**: https://huggingface.co/a/one,', '> https://huggingface.co/a/two')).toEqual([
      { label: null, text: '**Models**: https://huggingface.co/a/one,' },
      { label: null, text: 'https://huggingface.co/a/two' },
    ]);
    // A lazy continuation line, with no `>`, is still part of the blockquote.
    expect(read('> **Code**:', 'https://github.com/x/y')).toEqual([
      { label: 'Code', urls: [] },
      { label: null, text: 'https://github.com/x/y' },
    ]);
  });

  it('returns a line ending in a hard-break backslash with no label, so the backslash never reaches a URL (R7-7)', () => {
    expect(read('> **Code**: https://github.com/x\\', '> **Data**: https://zenodo.org/1')).toEqual([
      { label: null, text: '**Code**: https://github.com/x\\' },
      { label: 'Data', urls: ['https://zenodo.org/1'] },
    ]);
  });

  it('returns a list inside the blockquote line by line, with no label', () => {
    expect(read('> - a list item https://doi.org/10.1/z')).toEqual([{ label: null, text: '- a list item https://doi.org/10.1/z' }]);
  });

  it('(d) stops at the first non-blockquote sibling', () => {
    expect(read('> **Code**: https://github.com/x/y', '', 'This is a paragraph — scan must stop here.', '',
      '> **Data**: https://zenodo.org/record/000')).toEqual([{ label: 'Code', urls: ['https://github.com/x/y'] }]);
  });

  it('(f) returns [] when nodes[index+1] is not a blockquote', () => {
    expect(read('<a id="7">7</a> Other Author (2019). Title. https://doi.org/10.7/g')).toEqual([]);
  });

  it('works correctly with the disk fixture — ref 1 has Code, ref 2 has Code+Data, ref 3 has none', () => {
    const src = readFileSync(join(FIXTURES_DIR, 'sample.md'), 'utf-8');
    const sections = sectionsAfter(parseMarkdown(src), 2);
    const refs = sections.find((s) => s.heading === 'References')!;

    // Find node index for each anchor within refs.nodes
    const nodeIndexFor = (id: number): number => {
      return refs.nodes.findIndex((n) => {
        if (n.type !== 'paragraph') return false;
        const para = n as Paragraph;
        const firstChild = para.children[0];
        return (
          firstChild?.type === 'html' &&
          firstChild.value.includes(`id="${id}"`)
        );
      });
    };

    // ref 1: one Code blockquote
    const bq1 = labeledLinksAfter(refs.nodes, nodeIndexFor(1), src);
    expect(bq1).toHaveLength(1);
    expect(bq1[0].label).toBe('Code');

    // ref 2: Code + Data blockquotes (separate nodes in this fixture)
    const labels2 = labeledLinksAfter(refs.nodes, nodeIndexFor(2), src).map((b) => b.label);
    expect(labels2).toEqual(['Code', 'Data']);

    // ref 3: no blockquote (followed immediately by ref 4)
    expect(labeledLinksAfter(refs.nodes, nodeIndexFor(3), src)).toHaveLength(0);
  });
});
