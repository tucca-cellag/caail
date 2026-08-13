import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  CAAIL_REPO,
  CORRECTION_EMAIL,
  CORRECTION_TEMPLATE,
  correctionIssueUrl,
  correctionMailto,
  isItemId,
  reportHref,
} from './report';

/**
 * The grammar is only useful if it admits every id the DB actually holds. Reading the
 * committed items NDJSON rather than a hand-picked sample is the point: a slug rule that
 * later mints an id this regex rejects fails here instead of silently dropping that
 * entry's report link, which would be invisible on the page.
 */
const ITEM_IDS: string[] = readFileSync(
  fileURLToPath(new URL('../../db/ndjson/items.ndjson', import.meta.url)),
  'utf-8',
)
  .trim()
  .split('\n')
  .map((l) => (JSON.parse(l) as { id: string }).id);

describe('isItemId against every committed id', () => {
  it('admits every non-topic item id in the DB', () => {
    const content = ITEM_IDS.filter((id) => !id.startsWith('topic:'));
    expect(content.length).toBeGreaterThan(800);
    expect(content.filter((id) => !isItemId(id))).toEqual([]);
  });

  it('rejects topic ids, which are not reportable entries', () => {
    const topics = ITEM_IDS.filter((id) => id.startsWith('topic:'));
    expect(topics.length).toBeGreaterThan(0);
    expect(topics.filter(isItemId)).toEqual([]);
  });
});

describe('isItemId rejects hostile and malformed input', () => {
  // /report/ reads `?item=` from an address anyone can hand a reader, so the grammar is
  // the first line of defence and these are the shapes it exists to stop.
  it.each([
    ['javascript: URL', 'javascript:alert(1)'],
    ['markup', 'paper:1<script>alert(1)</script>'],
    ['quote break-out', 'sw:x" onmouseover="alert(1)'],
    ['protocol-relative URL', '//evil.example.com'],
    ['absolute URL', 'https://evil.example.com'],
    ['path traversal', 'sw:../../etc/passwd'],
    ['unknown namespace', 'topic:proteins'],
    ['no namespace', 'cellpose'],
    ['empty', ''],
    ['whitespace', ' paper:1 '],
    ['uppercase slug', 'sw:CellPose'],
    ['underscore', 'sw:cell_pose'],
    ['leading hyphen', 'sw:-cellpose'],
    ['paper zero', 'paper:0'],
    ['paper non-numeric', 'paper:abc'],
    ['newline injection', 'paper:1\nsw:x'],
    ['over-long slug', `sw:${'a'.repeat(200)}`],
  ])('rejects %s', (_label, value) => {
    expect(isItemId(value)).toBe(false);
  });

  it.each([null, undefined, 42, {}, ['paper:1']])('rejects the non-string %s', (value) => {
    expect(isItemId(value)).toBe(false);
  });
});

describe('reportHref', () => {
  it('normalises the trailing slash BASE_URL carries in .astro but not in an island', () => {
    expect(reportHref('/caail/', 'paper:214')).toBe('/caail/report/?item=paper%3A214');
    expect(reportHref('/caail', 'paper:214')).toBe('/caail/report/?item=paper%3A214');
  });

  it('works at the site root, where BASE_URL is "/"', () => {
    expect(reportHref('/', 'sw:cellpose')).toBe('/report/?item=sw%3Acellpose');
  });
});

describe('correctionIssueUrl', () => {
  it('prefills the template, title and item field from the id', () => {
    const url = new URL(correctionIssueUrl('paper:214'));
    expect(url.origin + url.pathname).toBe(`https://github.com/${CAAIL_REPO}/issues/new`);
    expect(url.searchParams.get('template')).toBe(CORRECTION_TEMPLATE);
    expect(url.searchParams.get('item')).toBe('paper:214');
    expect(url.searchParams.get('title')).toBe('Correction: paper:214');
  });

  it('falls back to the bare template with no id', () => {
    const url = new URL(correctionIssueUrl(null));
    expect(url.searchParams.get('template')).toBe(CORRECTION_TEMPLATE);
    expect(url.searchParams.has('item')).toBe(false);
    expect(url.searchParams.has('title')).toBe(false);
  });

  it('drops an id that fails the grammar rather than passing it through', () => {
    const url = new URL(correctionIssueUrl('paper:1<script>'));
    expect(url.searchParams.has('item')).toBe(false);
    expect(url.searchParams.has('title')).toBe(false);
  });

  it('lands the composed body in the template `details` field', () => {
    const body = 'Entry: paper:214\nProblem: Wrong licence tier';
    const url = new URL(correctionIssueUrl('paper:214', body));
    expect(url.searchParams.get('details')).toBe(body);
  });

  it('omits `details` entirely when there is no body', () => {
    // Keeps the CAAIL-255 behaviour byte-for-byte for every caller that composes nothing,
    // which is every per-card link on the site.
    for (const body of [undefined, null, '']) {
      expect(new URL(correctionIssueUrl('paper:214', body)).searchParams.has('details')).toBe(false);
    }
  });

  it('does NOT send `reason`, because a dropdown does not prefill from its option text', () => {
    // Checked against the live form rather than inferred: GitHub's schema docs say only
    // that a field's `id` is "the canonical identifier for the field in URL query
    // parameter prefills" and never say how a dropdown encodes its value. A parameter
    // that does nothing would read to a maintainer like a working prefill, so the error
    // class travels in the body instead and the page tells the reader to pick it.
    const url = new URL(correctionIssueUrl('paper:214', 'Problem: Wrong licence tier'));
    expect(url.searchParams.has('reason')).toBe(false);
  });
});

describe('correctionMailto', () => {
  it('carries the id in the subject so the email route loses nothing', () => {
    expect(correctionMailto('ds:chickengtex-portal')).toBe(
      `mailto:${CORRECTION_EMAIL}?subject=${encodeURIComponent('CAAIL correction: ds:chickengtex-portal')}`,
    );
  });

  it('falls back to a bare subject with no id, and with a rejected one', () => {
    const bare = `mailto:${CORRECTION_EMAIL}?subject=${encodeURIComponent('CAAIL correction')}`;
    expect(correctionMailto(null)).toBe(bare);
    expect(correctionMailto('../evil')).toBe(bare);
  });

  it('carries the composed body, so the account-free route is not the thin one', () => {
    const body = 'Entry: paper:214\nProblem: Dead or wrong link';
    expect(correctionMailto('paper:214', body)).toContain(
      `body=${encodeURIComponent(body)}`,
    );
  });

  it('percent-encodes spaces rather than writing "+", because mailto is RFC 6068', () => {
    // `mailto:` is NOT application/x-www-form-urlencoded: a `+` in its query is a literal
    // plus, so building this with URLSearchParams would send a conforming mail client a
    // subject reading "CAAIL+correction:+paper:214" and a body with a plus between every
    // word. Both strings are space-heavy, so this would be wrong on the first real use.
    const url = correctionMailto('paper:214', 'Entry: paper:214\nProblem: Dead or wrong link');
    expect(url).not.toContain('+');
    expect(url).toContain('%20');
  });

  it('omits the body when there is none, leaving the shipped URL unchanged', () => {
    const bare = `mailto:${CORRECTION_EMAIL}?subject=${encodeURIComponent('CAAIL correction: paper:1')}`;
    for (const body of [undefined, null, '']) {
      expect(correctionMailto('paper:1', body)).toBe(bare);
    }
  });
});

describe('the issue template the URL points at', () => {
  const template = readFileSync(
    fileURLToPath(new URL(`../../../.github/ISSUE_TEMPLATE/${CORRECTION_TEMPLATE}`, import.meta.url)),
    'utf-8',
  );

  // GitHub prefills an issue form by matching a query param to a field's `id`. If the
  // template's field is renamed, the prefill silently stops working and the id — the
  // whole point of the link — arrives blank. This is the check that catches that.
  it('has an `item` field for the id query param to land in', () => {
    expect(template).toMatch(/^\s*id:\s*item\s*$/m);
  });

  it('is the correction template, not one of the suggestion forms', () => {
    expect(template).toMatch(/^name:\s*Report an issue with an entry\s*$/m);
  });
});
