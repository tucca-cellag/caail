import { readFileSync } from 'node:fs';

import { describe, it, expect } from 'vitest';

import { buildCorrectionForm } from '../../scripts/parser/correction-form.js';
import { correctionMailto } from './report';
import {
  DOI_MAX_LENGTH,
  MAILTO_MAX_URL,
  NOTE_MAX_ENCODED,
  NOTE_MAX_LENGTH,
  REASON_SPECS,
  boundNote,
  collapseNote,
  composeBody,
  isDoiShape,
  normaliseDoi,
  resolveReasons,
  splitOption,
  type CorrectionVocabularies,
  type ReasonSpec,
  type ResolvedReason,
} from './report-compose';

/**
 * The vocabularies are passed in rather than imported, so these are deliberately small,
 * fixed lists: what is under test is that a value OUTSIDE the vocabulary is dropped, and
 * that is clearer against four strings than against the real 25 matrix rows. The real
 * lists are exercised where they matter, in correction-form.test.ts (the reasons) and in
 * the e2e suite (every select's options).
 */
const VOCAB: CorrectionVocabularies = {
  methods: ['Bayesian Optimization', 'Deep Learning'],
  areas: ['Media Optimization', 'Scaffolding'],
  themes: ['Food Safety'],
  tiers: ['Permissive', 'Restricted'],
};

const reason = (over: Partial<ResolvedReason>): ResolvedReason => ({
  value: 'Wrong matrix placement — the AI method is not what the paper does',
  head: 'Wrong matrix placement',
  label: 'Wrong matrix placement',
  hint: 'the AI method is not what the paper does',
  kind: 'matrix',
  ...over,
});

describe('splitOption', () => {
  it('splits an option at its em dash into a label and a hint', () => {
    expect(splitOption('Wrong licence tier — the badge is wrong')).toEqual({
      label: 'Wrong licence tier',
      hint: 'the badge is wrong',
    });
  });

  it('treats an option with no em dash as all label', () => {
    // Three of the eight real options are this shape, so it is the common case, not an edge.
    expect(splitOption('Dead or wrong link')).toEqual({ label: 'Dead or wrong link', hint: '' });
  });

  it('splits at the FIRST em dash, so a hint may contain another', () => {
    const { label, hint } = splitOption('A — b — c');
    expect(label).toBe('A');
    expect(hint).toBe('b — c');
  });
});

describe('resolveReasons against a drifting template', () => {
  const specs: ReasonSpec[] = [
    { head: 'Wrong licence tier', kind: 'licence' },
    { head: 'Dead or wrong link', kind: 'none' },
  ];

  it('resolves each option to its declared follow-up, in template order', () => {
    const resolved = resolveReasons(['Dead or wrong link', 'Wrong licence tier — x'], specs);
    expect(resolved.map((r) => r.head)).toEqual(['Dead or wrong link', 'Wrong licence tier']);
    expect(resolved.map((r) => r.kind)).toEqual(['none', 'licence']);
    // The full option string is preserved, because that is the error class as the GitHub
    // form names it; the label is only the display split.
    expect(resolved[1]!.value).toBe('Wrong licence tier — x');
    expect(resolved[1]!.label).toBe('Wrong licence tier');
  });

  it('throws when the template gains an option no spec declares', () => {
    // The failure this exists for: someone adds a ninth reason to the issue form and the
    // composer would otherwise offer it with no follow-up and no way to answer it.
    expect(() =>
      resolveReasons(['Dead or wrong link', 'Wrong licence tier', 'Something new'], specs),
    ).toThrow(/"Something new", which no reason head/);
  });

  it('throws when a spec matches no option, so a follow-up is unreachable', () => {
    expect(() => resolveReasons(['Dead or wrong link'], specs)).toThrow(
      /matched no option in the correction template: "Wrong licence tier"/,
    );
  });

  it('throws when one head is a prefix of another, which would make matching order-dependent', () => {
    expect(() =>
      resolveReasons(['Wrong licence', 'Wrong licence tier'], [
        { head: 'Wrong licence', kind: 'none' },
        { head: 'Wrong licence tier', kind: 'licence' },
      ]),
    ).toThrow(/is a prefix of/);
  });

  it('throws when an option is duplicated, which the unmatched-set check alone would miss', () => {
    expect(() =>
      resolveReasons(['Dead or wrong link', 'Dead or wrong link', 'Wrong licence tier'], specs),
    ).toThrow(/offers 3 options but REASON_SPECS declares 2/);
  });

  it('carries noteLabel through only for the kinds that ask for prose', () => {
    const [noted, plain] = resolveReasons(['Note me', 'Dead or wrong link'], [
      { head: 'Note me', kind: 'note', noteLabel: 'What it should say' },
      { head: 'Dead or wrong link', kind: 'none' },
    ]);
    expect(noted!.noteLabel).toBe('What it should say');
    expect(plain!.noteLabel).toBeUndefined();
  });
});

describe('REASON_SPECS as declared', () => {
  it('declares a note label for every note kind, and none for the others', () => {
    // `noteLabel` is the field's visible label, so a note kind without one would render an
    // unlabelled textarea — an accessibility failure that types cannot catch, since the
    // property is optional for the kinds that do not use it.
    for (const spec of REASON_SPECS) {
      if (spec.kind === 'note') expect(spec.noteLabel, spec.head).toBeTruthy();
      else expect(spec.noteLabel, spec.head).toBeUndefined();
    }
  });
});

describe('boundNote', () => {
  it('collapses newlines so one note is exactly one line of the body', () => {
    // The body is Key: value lines. A note spanning lines could otherwise forge one.
    expect(boundNote('first\nEntry: paper:1\nlast')).toBe('first Entry: paper:1 last');
  });

  it('strips control characters, which are invisible in the preview the reader checks', () => {
    // Escaped, not literal: control bytes in a test file are invisible and get
    // silently normalised by editors, which would quietly disarm this assertion.
    expect(boundNote('a\u0000b\u001Fc\u007Fd')).toBe('a b c d');
  });

  it('collapses whitespace runs and trims', () => {
    expect(boundNote('  a   \t  b  ')).toBe('a b');
  });

  it('strips C1 controls, which neither the C0 class nor the whitespace collapse reached', () => {
    // U+0085 NEL is a line break that sat in the gap between the two rules and reached the
    // composed body verbatim, which is exactly what the one-line guarantee rules out.
    expect(boundNote('a\u0085b\u0080c\u009Fd')).toBe('a b c d');
  });

  it.each([
    ['a lone LOW surrogate', 'ok\uDC00bad'],
    ['a lone HIGH surrogate mid-string', 'ok\uD800bad'],
    ['both', '\uDC00ok\uD800'],
  ])('removes %s, which would throw inside encodeURIComponent', (_label, input) => {
    // `render()` has no try/catch, so one URIError freezes the preview and all three links
    // at whatever they last held, on every subsequent keystroke, with nothing on screen to
    // say why. The truncation guard only ever handled a TRAILING high surrogate, which is
    // the half of the problem truncation itself creates.
    const bounded = boundNote(input);
    expect(() => encodeURIComponent(bounded)).not.toThrow();
    expect(bounded).toContain('ok');
  });

  it('keeps a valid pair while removing an unpaired unit beside it', () => {
    expect(boundNote('a😀b\uDC00c')).toBe('a😀bc');
  });
});

describe('collapseNote', () => {
  it('tidies without capping, so a caller can tell truncation from tidying', () => {
    // The note counter compares the two. Without this split, trimming a trailing space
    // would read to the reader as having lost a character.
    expect(collapseNote('  a \n b  ')).toBe('a b');
    expect(collapseNote('z'.repeat(NOTE_MAX_LENGTH + 50))).toHaveLength(NOTE_MAX_LENGTH + 50);
  });

  it('agrees with boundNote whenever neither cap binds', () => {
    const short = ' hello \n world ';
    expect(collapseNote(short)).toBe(boundNote(short));
  });

  it('caps at NOTE_MAX_LENGTH', () => {
    expect(boundNote('x'.repeat(NOTE_MAX_LENGTH + 50))).toHaveLength(NOTE_MAX_LENGTH);
  });

  it('returns empty for whitespace-only input, so no empty Note line is composed', () => {
    expect(boundNote('   \n\t ')).toBe('');
  });

  it('never leaves a lone surrogate at the cap, which would break URL encoding', () => {
    // `slice` counts UTF-16 code units, so capping mid-emoji leaves half a pair, and
    // `encodeURIComponent` throws URIError on one. The GitHub href is composed before the
    // mailto, so the failure would not even be uniform: one link would update and the
    // other two would silently stop.
    const note = 'a'.repeat(NOTE_MAX_LENGTH - 1) + '😀';
    const bounded = boundNote(note);
    expect(bounded).toHaveLength(NOTE_MAX_LENGTH - 1);
    expect(() => encodeURIComponent(bounded)).not.toThrow();
  });

  it('keeps a surrogate pair that fits inside the cap', () => {
    // The trim must be a truncation repair, not a blanket ban on astral characters.
    expect(boundNote('ok 😀')).toBe('ok 😀');
  });

  it('caps on ENCODED length too, which is the unit the URL limit is in', () => {
    // NOTE_MAX_LENGTH counts UTF-16 code units, and the two only agree for ASCII. A full
    // 400-character note in Chinese encodes to roughly 3,600 characters, so the mailto
    // sailed past the ~2,048 that Windows and Outlook truncate at: the email route would
    // deliver a cut-off report while the preview on the page looked complete.
    const cjk = boundNote('提'.repeat(NOTE_MAX_LENGTH));
    expect(encodeURIComponent(cjk).length).toBeLessThanOrEqual(NOTE_MAX_ENCODED);
    // Still generous: this is a real note, not a token.
    expect(cjk.length).toBeGreaterThan(100);
  });

  it('leaves an ASCII note at the character cap, where the encoded cap does not bind', () => {
    const ascii = boundNote('z'.repeat(NOTE_MAX_LENGTH + 50));
    expect(ascii).toHaveLength(NOTE_MAX_LENGTH);
  });

  it('does not split a surrogate pair when the ENCODED cap is the binding one', () => {
    // The two caps truncate at different points, so the pair-splitting repair has to
    // survive whichever one fires.
    const emoji = boundNote('😀'.repeat(NOTE_MAX_LENGTH));
    expect(() => encodeURIComponent(emoji)).not.toThrow();
    expect(encodeURIComponent(emoji).length).toBeLessThanOrEqual(NOTE_MAX_ENCODED);
    expect(emoji).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});

describe('normaliseDoi and isDoiShape', () => {
  it.each([
    ['bare', '10.1016/j.scitotenv.2023.164988'],
    ['https resolver', 'https://doi.org/10.1016/j.scitotenv.2023.164988'],
    ['http resolver', 'http://doi.org/10.1016/j.scitotenv.2023.164988'],
    ['legacy dx host', 'https://dx.doi.org/10.1016/j.scitotenv.2023.164988'],
    ['doi: prefix', 'doi: 10.1016/j.scitotenv.2023.164988'],
    ['surrounding space', '  10.1016/j.scitotenv.2023.164988  '],
  ])('accepts a DOI pasted as %s', (_label, input) => {
    // Readers copy what they are looking at, which is usually one of these forms.
    expect(normaliseDoi(input)).toBe('10.1016/j.scitotenv.2023.164988');
    expect(isDoiShape(input)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['no registrant prefix', 'j.scitotenv.2023.164988'],
    ['no slash', '10.1016'],
    ['nothing after the slash', '10.1016/'],
    ['a whole citation', 'Nikkhah et al. 2023'],
    ['a URL that is not a DOI', 'https://example.com/paper'],
    ['registrant too short', '10.1/x'],
    // A bare paste with a query is ambiguous: outside a URL nothing says the `?` is not
    // part of the identifier, so this refuses rather than guessing.
    ['a bare DOI carrying a query string', '10.1016/j.x?utm_source=news'],
    ['a bare DOI carrying a fragment', '10.1016/j.x#sec3'],
    ['a suffix past any real DOI length', `10.1016/${'x'.repeat(3000)}`],
  ])('rejects %s', (_label, input) => {
    expect(isDoiShape(input)).toBe(false);
  });

  it('drops the tracking parameters that come with a copied doi.org link', () => {
    // The common paste, and previously accepted verbatim: the page told the reader the DOI
    // was fine and composed one that resolves to nothing.
    const pasted = 'https://doi.org/10.1016/j.x.2024.1?utm_source=news&foo=bar#sec3';
    expect(normaliseDoi(pasted)).toBe('10.1016/j.x.2024.1');
    expect(isDoiShape(pasted)).toBe(true);
  });
});

describe('composeBody', () => {
  it('returns nothing until a reason is picked', () => {
    expect(composeBody({ itemId: 'paper:214', reason: null }, VOCAB)).toBe('');
  });

  it('always opens with the entry and the error class', () => {
    const body = composeBody({ itemId: 'paper:214', reason: reason({ kind: 'none' }) }, VOCAB);
    expect(body.split('\n')).toEqual(['Entry: paper:214', 'Problem: Wrong matrix placement']);
  });

  it('names both axes of a full matrix placement', () => {
    const body = composeBody(
      { itemId: 'paper:214', reason: reason({}), method: 'Deep Learning', area: 'Scaffolding' },
      VOCAB,
    );
    expect(body).toContain('Should be: Deep Learning × Scaffolding');
  });

  it.each([
    ['method only', { method: 'Deep Learning' }, 'AI/ML method should be: Deep Learning'],
    ['area only', { area: 'Scaffolding' }, 'Research area should be: Scaffolding'],
  ])('says which axis it means when only the %s is answered', (_label, answers, expected) => {
    // A half-answered placement is still worth sending, and "Should be: Deep Learning"
    // alone would leave the curator guessing which axis was meant.
    const body = composeBody({ itemId: 'paper:1', reason: reason({}), ...answers }, VOCAB);
    expect(body).toContain(expected);
  });

  it.each([
    ['method', { method: 'Reinforcement Learning' }],
    ['area', { area: 'Sensory Prediction' }],
  ])('drops a %s that is not in the live vocabulary', (_label, answers) => {
    // The DOM is editable, so an option's value is not evidence that the matrix has that
    // row. A composed report naming a row that does not exist is worse than a shorter one.
    const body = composeBody({ itemId: 'paper:1', reason: reason({}), ...answers }, VOCAB);
    expect(body).not.toMatch(/should be/i);
  });

  it.each([
    ['licence', { kind: 'licence' as const }, { tier: 'Restricted' }, 'Licence tier should be: Restricted'],
    ['topics', { kind: 'topics' as const }, { theme: 'Food Safety' }, 'Subject theme should be: Food Safety'],
  ])('composes the %s follow-up from its vocabulary', (_l, over, answers, expected) => {
    expect(composeBody({ itemId: 'db:x', reason: reason(over), ...answers }, VOCAB)).toContain(
      expected,
    );
  });

  it.each([
    ['tier', { kind: 'licence' as const }, { tier: 'Invented' }],
    ['theme', { kind: 'topics' as const }, { theme: 'Invented' }],
  ])('drops a %s outside its vocabulary', (_l, over, answers) => {
    expect(composeBody({ itemId: 'db:x', reason: reason(over), ...answers }, VOCAB)).not.toContain(
      'Invented',
    );
  });

  it('normalises a DOI before composing it', () => {
    const body = composeBody(
      { itemId: 'sw:x', reason: reason({ kind: 'doi' }), doi: 'https://doi.org/10.1234/abc' },
      VOCAB,
    );
    expect(body).toContain('DOI should be: 10.1234/abc');
  });

  it('omits a DOI that fails the shape check rather than composing a bad one', () => {
    const body = composeBody(
      { itemId: 'sw:x', reason: reason({ kind: 'doi' }), doi: 'not a doi' },
      VOCAB,
    );
    expect(body).not.toContain('DOI');
  });

  it('bounds a note into the body as a single line', () => {
    const body = composeBody(
      {
        itemId: 'ds:x',
        reason: reason({ kind: 'note' }),
        note: `${'z'.repeat(NOTE_MAX_LENGTH + 20)}\nProblem: forged`,
      },
      VOCAB,
    );
    const lines = body.split('\n');
    // Three lines, not four: the newline inside the note did not become a body line, so
    // the forged "Problem:" cannot be mistaken for one the composer wrote.
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe(`Note: ${'z'.repeat(NOTE_MAX_LENGTH)}`);
  });

  it('omits an empty note rather than composing a bare label', () => {
    const body = composeBody(
      { itemId: 'ds:x', reason: reason({ kind: 'note' }), note: '   ' },
      VOCAB,
    );
    expect(body).not.toContain('Note:');
  });

  it('composes nothing that a Markdown renderer would read as structure', () => {
    // The whole reason the body is Key: value lines. If this starts failing, reader text
    // has gained a way out of the shape and the bounding rules need to grow with it.
    const body = composeBody(
      {
        itemId: 'paper:1',
        reason: reason({ kind: 'note' }),
        note: '# heading\n- list\n```fence```\n| table |',
      },
      VOCAB,
    );
    for (const line of body.split('\n')) {
      expect(line, line).toMatch(/^[A-Z][A-Za-z/ ]*: /);
    }
  });

  it.each([
    ['ASCII', 'z'],
    // The case the ASCII-only version of this test never reached. Each of these costs nine
    // characters encoded, so a note that "fits" by character count did not fit at all.
    ['Chinese', '提'],
    ['Cyrillic', 'д'],
    ['emoji', '😀'],
  ])('stays inside a deliverable URL length with a full %s note', (_script, char) => {
    // The body travels in a query string to GitHub and in a mailto to a mail client, and
    // the mailto is the tight one: Windows and Outlook truncate around 2,048.
    const body = composeBody(
      {
        itemId: 'ds:a-very-long-dataset-identifier-of-the-kind-the-db-actually-mints',
        reason: reason({ kind: 'note', label: 'Stale or wrong figures in the description' }),
        note: char.repeat(NOTE_MAX_LENGTH),
      },
      VOCAB,
    );
    expect(encodeURIComponent(body).length).toBeLessThan(1800);
  });


  it.each([
    ['a note', 'note' as const],
    // The path the note's fix never reached. A 200-character DOI in a nine-bytes-encoded
    // script measured 1,738 encoded and put the mailto at 2,096, past the limit, while the
    // shape check called it valid — the same truncated-email failure, one field over.
    ['a DOI', 'doi' as const],
  ])('keeps the worst real mailto under the limit via %s', (_label, kind) => {
    const ids = readFileSync(new URL('../../db/ndjson/items.ndjson', import.meta.url), 'utf-8')
      .trim()
      .split('\n')
      .map((line) => (JSON.parse(line) as { id: string }).id)
      .filter((id) => !id.startsWith('topic:'));
    const longestId = ids.reduce((a, b) => (b.length > a.length ? b : a));
    const longestReason = buildCorrectionForm().reasons.reduce((a, b) =>
      b.label.length > a.label.length ? b : a,
    );

    // Saturate whichever field this kind uses, in a script that costs nine encoded each.
    const answers =
      kind === 'note'
        ? { note: '提'.repeat(NOTE_MAX_LENGTH) }
        : { doi: `10.1234/${'提'.repeat(DOI_MAX_LENGTH)}` };
    const body = composeBody(
      { itemId: longestId, reason: { ...longestReason, kind }, ...answers },
      VOCAB,
    );
    const url = correctionMailto(longestId, body);
    expect(url.length).toBeLessThan(MAILTO_MAX_URL);
    expect(MAILTO_MAX_URL - url.length).toBeGreaterThan(200);
  });

  it('does not compose a DOI longer than any real one', () => {
    const body = composeBody(
      { itemId: 'paper:1', reason: reason({ kind: 'doi' }), doi: `10.1016/${'x'.repeat(3000)}` },
      VOCAB,
    );
    expect(body).not.toContain('DOI should be');
    expect(encodeURIComponent(body).length).toBeLessThan(200);
  });
});
