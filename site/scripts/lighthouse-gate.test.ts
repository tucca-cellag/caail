/**
 * lighthouse-gate.test.ts — the check that stops the Lighthouse prose going stale again.
 *
 * Both `CLAUDE.md` files told agents the performance gate was blocking. It has been
 * `warn`-level since `e627e97`, and the `docs.yml` step was named "perf landing-only"
 * while the assertion matrix matched every collected URL. Three copies of a fact, one
 * config that owned it, nothing comparing them.
 *
 * These assert the derived sentence appears verbatim, so editing `lighthouserc.json`
 * fails here with the replacement text rather than leaving the docs quietly wrong.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readLighthouseGate, describeLighthouseGate } from './lighthouse-gate.js';

const SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(SITE_ROOT, '..');
const CONFIG = join(SITE_ROOT, 'lighthouserc.json');

const gate = readLighthouseGate(CONFIG);
const sentence = describeLighthouseGate(gate);

describe('the Lighthouse gate description is derived, not typed', () => {
  for (const file of ['CLAUDE.md', join('site', 'CLAUDE.md')]) {
    it(`${file} states the gate exactly as lighthouserc.json defines it`, () => {
      const text = readFileSync(join(REPO_ROOT, file), 'utf-8');
      expect(
        text.includes(sentence),
        `${file} does not contain the derived Lighthouse sentence.\n\nExpected verbatim:\n  ${sentence}\n`,
      ).toBe(true);
    });
  }

  it('the docs.yml step name does not contradict the config', () => {
    // The step was named "Lighthouse (a11y both; perf landing-only)" while the matrix
    // matched `.*`. A step name is the first thing read in a failed run's log, so a
    // wrong one misdirects at the worst moment.
    const workflow = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'docs.yml'), 'utf-8');
    const stepName = /- name: (Lighthouse.*)/.exec(workflow)?.[1];
    expect(stepName, 'no Lighthouse step found in docs.yml').toBeTruthy();
    // Any scope claim in the name has to survive the config saying `.*`.
    const everyUrl = gate.gates.every((g) => g.urlPattern === '.*');
    if (everyUrl) {
      expect(
        /landing-only|landing only/i.test(stepName!),
        `docs.yml step name claims a landing-only scope, but every assertion matches .*: ${stepName}`,
      ).toBe(false);
    }
  });
});

describe('readLighthouseGate', () => {
  it('reads the real config', () => {
    expect(gate.urls.length).toBeGreaterThan(0);
    expect(gate.gates.length).toBeGreaterThan(0);
  });

  it('records the level, which is the only thing that decides whether a deploy blocks', () => {
    // Named explicitly: lhci exits non-zero on `error` and not on `warn`, so this is
    // the distinction the docs got wrong.
    const perf = gate.gates.find((g) => g.category === 'performance');
    const a11y = gate.gates.find((g) => g.category === 'accessibility');
    expect(perf?.level, 'performance is warn-level (e627e97); if this changed, the docs must too').toBe('warn');
    expect(a11y?.level).toBe('error');
  });

  it('throws rather than guessing on a config it does not understand', () => {
    // A parser that returned an empty gate would make the doc assertions vacuous,
    // which is the failure being fixed rather than a new one.
    const tmp = join(SITE_ROOT, 'scripts', 'lighthouse-gate.test.ts'); // any non-config JSON-less file
    expect(() => readLighthouseGate(tmp)).toThrow();
  });
});

describe('describeLighthouseGate', () => {
  const base = { urls: ['a', 'b'], gates: [] as never[] };

  it('leads with what blocks, because that is what a reader needs first', () => {
    const text = describeLighthouseGate({
      urls: base.urls,
      gates: [
        { category: 'performance', level: 'warn', minScore: 0.9, urlPattern: '.*' },
        { category: 'accessibility', level: 'error', minScore: 0.9, urlPattern: '.*' },
      ],
    });
    expect(text.indexOf('blocking')).toBeLessThan(text.indexOf('warn-level'));
  });

  it('says a warn-level gate does not block, in words that cannot be skimmed past', () => {
    const text = describeLighthouseGate({
      urls: base.urls,
      gates: [{ category: 'performance', level: 'warn', minScore: 0.9, urlPattern: '.*' }],
    });
    expect(text).toContain('does NOT block');
  });

  it('describes `.*` as every collected URL rather than naming one', () => {
    const text = describeLighthouseGate({
      urls: ['a', 'b'],
      gates: [{ category: 'accessibility', level: 'error', minScore: 0.9, urlPattern: '.*' }],
    });
    expect(text).toContain('all 2 collected URLs');
  });

  it('renders the score at two decimals so 0.9 and ≥0.90 cannot diverge', () => {
    const text = describeLighthouseGate({
      urls: ['a'],
      gates: [{ category: 'accessibility', level: 'error', minScore: 0.9, urlPattern: '.*' }],
    });
    expect(text).toContain('≥0.90');
  });
});
