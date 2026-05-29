import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { stripLeadingH1 } from './strip-leading-h1.ts';

function run(md: string): string {
  return String(unified().use(remarkParse).use(stripLeadingH1).use(remarkStringify).processSync(md));
}

describe('stripLeadingH1', () => {
  it('removes a single leading depth-1 heading', () => {
    const out = run('# Cow / *Bos taurus*\n\nBody paragraph.\n');
    expect(out).not.toMatch(/^#\s/m);
    expect(out).toContain('Body paragraph.');
  });
  it('leaves H2s and later H1s untouched', () => {
    const out = run('# Title\n\n## Section\n\nText\n');
    expect(out).toContain('## Section');
  });
  it('is a no-op when the doc does not start with an H1', () => {
    const out = run('Intro prose with no heading.\n\n## Later\n');
    expect(out).toContain('Intro prose with no heading.');
    expect(out).toContain('## Later');
  });
});
