/**
 * markdown.test.ts — tests for the remark/unified structural helpers.
 *
 * Strategy: use parseMarkdown() with inline string fixtures for most cases
 * (no disk I/O required). Use parseFile() once to prove disk round-trip.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Root, Paragraph } from 'mdast';

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
  it('(a) separate blockquote nodes — both Code and Data recovered', () => {
    // Blank line between the two blockquotes → remark emits two separate nodes.
    const src = [
      '<a id="1">1</a> Author (2022). Title. https://doi.org/10.1/a',
      '',
      '> **Code**: https://github.com/org/repo',
      '',
      '> **Data**: https://zenodo.org/record/999',
    ].join('\n');
    const root = parseMarkdown(src);
    const results = labeledLinksAfter(root.children, 0);
    expect(results).toHaveLength(2);
    expect(results[0].label).toBe('Code');
    expect(results[0].urls).toEqual(['https://github.com/org/repo']);
    expect(results[1].label).toBe('Data');
    expect(results[1].urls).toEqual(['https://zenodo.org/record/999']);
  });

  it('(b) single blockquote node (no blank line between Code and Data) — BOTH labels recovered', () => {
    // No blank line → remark folds both lines into ONE blockquote node.
    // This is the regression that motivated the change; both labels MUST be returned.
    const src = [
      '<a id="2">2</a> Author (2023). Title. https://doi.org/10.2/b',
      '',
      '> **Code**: https://github.com/example/merged',
      '> **Data**: https://zenodo.org/record/merged',
    ].join('\n');
    const root = parseMarkdown(src);
    const results = labeledLinksAfter(root.children, 0);
    const labels = results.map((r) => r.label);
    expect(labels).toContain('Code');
    expect(labels).toContain('Data');
    const codeEntry = results.find((r) => r.label === 'Code')!;
    const dataEntry = results.find((r) => r.label === 'Data')!;
    expect(codeEntry.urls).toEqual(['https://github.com/example/merged']);
    expect(dataEntry.urls).toEqual(['https://zenodo.org/record/merged']);
  });

  it('(c) comma-separated URLs on one line — every URL recovered under its label (tucca-cellag/caail-planning#656)', () => {
    // `> **Models**: url1, url2` is how ref 124 lists its two model checkpoints.
    const src = [
      '<a id="3">3</a> Author (2021). Title. https://doi.org/10.3/c',
      '',
      '> **Models**: https://huggingface.co/a/one, https://huggingface.co/a/two',
    ].join('\n');
    const root = parseMarkdown(src);
    expect(labeledLinksAfter(root.children, 0)).toEqual([
      { label: 'Models', urls: ['https://huggingface.co/a/one', 'https://huggingface.co/a/two'] },
    ]);
  });

  it('returns a label with no http(s) URL, with no URLs, so a caller can refuse it', () => {
    const src = [
      '<a id="9">9</a> Author (2021). Title. https://doi.org/10.9/z',
      '',
      '> **Retraction**: see the journal',
    ].join('\n');
    expect(labeledLinksAfter(parseMarkdown(src).children, 0)).toEqual([{ label: 'Retraction', urls: [] }]);
  });

  it('reads only a line-starting **Label**: as a label, and returns bold prose as a line with none', () => {
    const src = [
      '<a id="11">11</a> Author (2021). Title. https://doi.org/10.11/x',
      '',
      '> **Code**: https://github.com/x/y (**archived**)',
      '',
      '> See **also** [the repo](https://github.com/x/z) for more.',
      '',
      '> **Note** that this line has no colon after its bold.',
    ].join('\n');
    expect(labeledLinksAfter(parseMarkdown(src).children, 0)).toEqual([
      { label: 'Code', urls: ['https://github.com/x/y'] },
      { label: null, text: 'See also the repo for more.' },
      { label: null, text: 'Note that this line has no colon after its bold.' },
    ]);
  });

  it('reads bold followed by words and then a colon as prose, not a label', () => {
    const src = [
      '<a id="15">15</a> Author (2021). Title. https://doi.org/10.15/t',
      '',
      '> **Important** caveat: see https://example.org/a',
    ].join('\n');
    expect(labeledLinksAfter(parseMarkdown(src).children, 0)).toEqual([
      { label: null, text: 'Important caveat: see https://example.org/a' },
    ]);
  });

  it('returns a URL wrapped onto its own line as a line with no label, not as a URL of the label above', () => {
    const src = [
      '<a id="16">16</a> Author (2021). Title. https://doi.org/10.16/s',
      '',
      '> **Models**: https://huggingface.co/a/one,',
      '> https://huggingface.co/a/two',
    ].join('\n');
    expect(labeledLinksAfter(parseMarkdown(src).children, 0)).toEqual([
      { label: 'Models', urls: ['https://huggingface.co/a/one'] },
      { label: null, text: 'https://huggingface.co/a/two' },
    ]);
  });

  it('returns a line holding a second label as a line that is not one label, not as more URLs of the first', () => {
    const src = [
      '<a id="19">19</a> Author (2021). Title. https://doi.org/10.19/p',
      '',
      '> **Models**: https://huggingface.co/a/one **Correction**: https://doi.org/10.1/c',
    ].join('\n');
    expect(labeledLinksAfter(parseMarkdown(src).children, 0)).toEqual([
      { label: null, text: 'Models: https://huggingface.co/a/one Correction: https://doi.org/10.1/c' },
    ]);
  });

  it('reads bold prose later on a label line, before a URL, as no second label', () => {
    const src = [
      '<a id="20">20</a> Author (2021). Title. https://doi.org/10.20/o',
      '',
      '> **Data**: https://zenodo.org/a (**mirror** https://zenodo.org/b)',
    ].join('\n');
    expect(labeledLinksAfter(parseMarkdown(src).children, 0)).toEqual([
      { label: 'Data', urls: ['https://zenodo.org/a', 'https://zenodo.org/b'] },
    ]);
  });

  it('returns an unbolded label, a bare URL and a list item each as a line with no label', () => {
    const src = [
      '<a id="17">17</a> Author (2021). Title. https://doi.org/10.17/r',
      '',
      '> Correction: https://doi.org/10.1/x',
      '',
      '> https://doi.org/10.1/y',
      '',
      '> - a list item https://doi.org/10.1/z',
    ].join('\n');
    expect(labeledLinksAfter(parseMarkdown(src).children, 0)).toEqual([
      { label: null, text: 'Correction: https://doi.org/10.1/x' },
      { label: null, text: 'https://doi.org/10.1/y' },
      { label: null, text: 'a list item https://doi.org/10.1/z' },
    ]);
  });

  it('returns each label occurrence, in document order, as written', () => {
    const src = [
      '<a id="10">10</a> Author (2021). Title. https://doi.org/10.10/y',
      '',
      '> **Correction**: https://doi.org/10.1/one',
      '',
      '> **Erratum**: https://doi.org/10.1/two',
      '',
      '> **correction**: https://doi.org/10.1/three',
    ].join('\n');
    expect(labeledLinksAfter(parseMarkdown(src).children, 0)).toEqual([
      { label: 'Correction', urls: ['https://doi.org/10.1/one'] },
      { label: 'Erratum', urls: ['https://doi.org/10.1/two'] },
      { label: 'correction', urls: ['https://doi.org/10.1/three'] },
    ]);
  });

  it('ends a label where a line starts without one, so a later link is not its URL', () => {
    const src = [
      '<a id="12">12</a> Author (2021). Title. https://doi.org/10.12/w',
      '',
      '> **Correction**: https://doi.org/10.1/fix',
      '> See also [the dataset](https://zenodo.org/x)',
    ].join('\n');
    expect(labeledLinksAfter(parseMarkdown(src).children, 0)).toEqual([
      { label: 'Correction', urls: ['https://doi.org/10.1/fix'] },
      { label: null, text: 'See also the dataset' },
    ]);
  });

  it('reads a label written without a colon, with the colon inside the bold, or with a parenthesis', () => {
    const src = [
      '<a id="13">13</a> Author (2021). Title. https://doi.org/10.13/v',
      '',
      '> **Code** https://github.com/x/y',
      '',
      '> **Erratum:** https://doi.org/10.1/err',
      '',
      '> **Correction** (2025): https://doi.org/10.1/cor',
    ].join('\n');
    expect(labeledLinksAfter(parseMarkdown(src).children, 0)).toEqual([
      { label: 'Code', urls: ['https://github.com/x/y'] },
      { label: 'Erratum', urls: ['https://doi.org/10.1/err'] },
      { label: 'Correction', urls: ['https://doi.org/10.1/cor'] },
    ]);
  });

  it('takes only the URL from a text run GFM did not autolink', () => {
    // GFM leaves a URL with a malformed host unlinked, so it stays in a text run.
    const src = [
      '<a id="14">14</a> Author (2021). Title. https://doi.org/10.14/u',
      '',
      '> **Data**: https://-bad-/a (mirror)',
    ].join('\n');
    expect(labeledLinksAfter(parseMarkdown(src).children, 0)).toEqual([{ label: 'Data', urls: ['https://-bad-/a'] }]);
  });

  it('trims the punctuation a sentence puts after a URL GFM did not autolink', () => {
    for (const tail of ['.', ').', ';', ']', '>', ':']) {
      const src = [
        '<a id="18">18</a> Author (2021). Title. https://doi.org/10.18/q',
        '',
        `> **Data**: https://-bad-/a${tail}`,
      ].join('\n');
      expect(labeledLinksAfter(parseMarkdown(src).children, 0), tail).toEqual([{ label: 'Data', urls: ['https://-bad-/a'] }]);
    }
  });

  it('keeps a closing parenthesis that belongs to an unlinked URL, as GFM does for a linked one', () => {
    // GFM leaves a URL with a malformed host in a text run (with a well-formed host it
    // autolinks, even straight after the colon, and keeps a balanced parenthesis itself).
    for (const tail of ['', '.', ').']) {
      const src = [
        '<a id="21">21</a> Author (2021). Title. https://doi.org/10.21/n',
        '',
        `> **Data**: https://-bad-/wiki/Foo_(bar)${tail}`,
      ].join('\n');
      expect(labeledLinksAfter(parseMarkdown(src).children, 0), tail).toEqual([
        { label: 'Data', urls: ['https://-bad-/wiki/Foo_(bar)'] },
      ]);
    }
  });

  it('(d) stops at the first non-blockquote sibling', () => {
    const src = [
      '<a id="4">4</a> Author (2020). Title. https://doi.org/10.4/d',
      '',
      '> **Code**: https://github.com/x/y',
      '',
      'This is a paragraph — scan must stop here.',
      '',
      '> **Data**: https://zenodo.org/record/000',
    ].join('\n');
    const root = parseMarkdown(src);
    const results = labeledLinksAfter(root.children, 0);
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe('Code');
  });

  it('(e) a prose blockquote with a relative link is a line with no label, not a labelled URL', () => {
    const src = [
      '<a id="5">5</a> Author (2019). Title. https://doi.org/10.5/e',
      '',
      '> See also [Datasets/](./Datasets/) for more.',
    ].join('\n');
    const root = parseMarkdown(src);
    expect(labeledLinksAfter(root.children, 0)).toEqual([{ label: null, text: 'See also Datasets/ for more.' }]);
  });

  it('(f) returns [] when nodes[index+1] is not a blockquote', () => {
    const src = [
      '<a id="6">6</a> Author (2018). Title. https://doi.org/10.6/f',
      '',
      '<a id="7">7</a> Other Author (2019). Title. https://doi.org/10.7/g',
    ].join('\n');
    const root = parseMarkdown(src);
    // index 0 is ref #6, index 1 is ref #7 (paragraph, not blockquote)
    const results = labeledLinksAfter(root.children, 0);
    expect(results).toHaveLength(0);
  });

  it('works correctly with the disk fixture — ref 1 has Code, ref 2 has Code+Data, ref 3 has none', () => {
    const root = parseFile(join(FIXTURES_DIR, 'sample.md'));
    const sections = sectionsAfter(root, 2);
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
    const idx1 = nodeIndexFor(1);
    const bq1 = labeledLinksAfter(refs.nodes, idx1);
    expect(bq1).toHaveLength(1);
    expect(bq1[0].label).toBe('Code');

    // ref 2: Code + Data blockquotes (separate nodes in this fixture)
    const idx2 = nodeIndexFor(2);
    const bq2 = labeledLinksAfter(refs.nodes, idx2);
    expect(bq2).toHaveLength(2);
    const labels2 = bq2.map((b) => b.label);
    expect(labels2).toContain('Code');
    expect(labels2).toContain('Data');

    // ref 3: no blockquote (followed immediately by ref 4)
    const idx3 = nodeIndexFor(3);
    const bq3 = labeledLinksAfter(refs.nodes, idx3);
    expect(bq3).toHaveLength(0);
  });
});
