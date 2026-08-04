import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

/**
 * renderMarkdown is the boundary where model output becomes DOM: the chat
 * widget hands its result straight to dangerouslySetInnerHTML. These pin both
 * halves of "safe" — raw HTML dropped, and URL schemes restricted — because
 * only the first half held originally (#125), and the docblock's claim that the
 * output was sanitized made the gap easy to miss.
 */

describe('renderMarkdown — URL schemes', () => {
  it('strips a javascript: href, keeping the link text', () => {
    const html = renderMarkdown('[click me](javascript:alert(document.domain))');
    expect(html).not.toContain('javascript:');
    expect(html).not.toMatch(/href=/);
    expect(html).toContain('click me');
  });

  it('is not fooled by capitalisation', () => {
    expect(renderMarkdown('[x](JaVaScRiPt:alert(1))')).not.toMatch(/href=/i);
  });

  it('is not fooled by leading whitespace', () => {
    expect(renderMarkdown('[x](  javascript:alert(1))')).not.toMatch(/href=/i);
  });

  it('strips a javascript: image src', () => {
    const html = renderMarkdown('![img](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).not.toMatch(/src=/);
  });

  it('strips a data: URL, which can carry an HTML document', () => {
    const html = renderMarkdown('[d](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)');
    expect(html).not.toContain('data:text/html');
    expect(html).not.toMatch(/href=/);
  });

  it('strips vbscript:', () => {
    expect(renderMarkdown('[v](vbscript:msgbox(1))')).not.toMatch(/href=/i);
  });

  it('keeps ordinary http(s) links intact', () => {
    const html = renderMarkdown('[paper](https://doi.org/10.1038/s41586-024-1)');
    expect(html).toContain('href="https://doi.org/10.1038/s41586-024-1"');
  });

  it('keeps site-relative links intact, which is how answers cite CAAIL pages', () => {
    expect(renderMarkdown('[explorer](/caail/papers/explorer/)')).toContain(
      'href="/caail/papers/explorer/"',
    );
  });

  it('keeps mailto: links, which the default schema allows', () => {
    expect(renderMarkdown('[mail](mailto:dataprivacy@tufts.edu)')).toContain('mailto:');
  });
});

describe('renderMarkdown — raw HTML', () => {
  it('drops an inline event handler entirely', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<img');
  });

  it('drops a raw anchor carrying a javascript: href', () => {
    const html = renderMarkdown('<a href="javascript:alert(1)">raw</a>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('raw');
  });

  it('drops a script tag but keeps surrounding prose', () => {
    const html = renderMarkdown('before <script>alert(1)</script> after');
    expect(html).not.toContain('<script');
    expect(html).toContain('before');
    expect(html).toContain('after');
  });
});

describe('renderMarkdown — ordinary formatting still renders', () => {
  it('renders emphasis, strong and inline code', () => {
    const html = renderMarkdown('*a* **b** `c`');
    expect(html).toContain('<em>a</em>');
    expect(html).toContain('<strong>b</strong>');
    expect(html).toContain('<code>c</code>');
  });

  it('renders lists', () => {
    const html = renderMarkdown('- one\n- two');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
  });

  it('renders GFM tables, which remark-gfm is loaded for', () => {
    const html = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>1</td>');
  });

  it('renders fenced code blocks', () => {
    expect(renderMarkdown('```\nx = 1\n```')).toContain('<pre>');
  });

  it('returns an empty string for empty input rather than throwing', () => {
    expect(renderMarkdown('')).toBe('');
  });
});
