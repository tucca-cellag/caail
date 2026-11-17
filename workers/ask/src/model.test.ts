/**
 * What the model is sent and what is read back from it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_TOKENS, SYSTEM_PROMPT, TEMPERATURE, answerText, citedEntryIds, modelInput } from './model.ts';
import { ENTRIES, ORIGIN, chatOutput } from './test-env.ts';

describe('the system prompt', () => {
  // The four rules the answer has to follow, each by the words that carry it.
  it.each([
    ['answers only from the entries supplied', /Answer only from the entries supplied/],
    ["cites each claim with its entry's link", /Cite every claim with a Markdown link to the entry it comes from/],
    ['says plainly when CAAIL holds nothing', /say plainly that CAAIL holds nothing/],
    ['never fills in from general knowledge', /Never fill in from general knowledge/],
    ['takes no position on whether an approach succeeds', /takes no position on whether an approach succeeds/],
  ])('%s', (_label, pattern) => {
    expect(SYSTEM_PROMPT).toMatch(pattern);
  });
});

describe('the model input', () => {
  it('sets max_tokens above the platform default of 256, and a low temperature', () => {
    const input = modelInput('@cf/test/model', ENTRIES, 'q');
    expect(input.max_tokens).toBe(MAX_TOKENS);
    expect(MAX_TOKENS).toBeGreaterThan(256);
    expect(input.temperature).toBe(TEMPERATURE);
    expect(TEMPERATURE).toBeLessThanOrEqual(0.3);
  });

  it('gives each entry its link, in retrieval order', () => {
    const user = (modelInput('@cf/test/model', ENTRIES, 'q').messages as { content: string }[])[1].content;
    const positions = ENTRIES.map((entry) => user.indexOf(`Link: ${entry.link}`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('asks each candidate model for its least reasoning, and passes nothing extra to any other model', () => {
    expect(modelInput('@cf/google/gemma-4-26b-a4b-it', ENTRIES, 'q').chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(modelInput('@cf/openai/gpt-oss-20b', ENTRIES, 'q').reasoning_effort).toBe('low');
    expect(modelInput('@cf/openai/gpt-oss-120b', ENTRIES, 'q').reasoning_effort).toBe('low');
    expect(Object.keys(modelInput('@cf/test/model', ENTRIES, 'q')).sort()).toEqual(['max_tokens', 'messages', 'temperature']);
  });

  // A model set in wrangler.toml but missing from the reasoning table would run
  // at its default reasoning, slower and dearer, with nothing failing.
  it('has a reasoning setting for the model wrangler.toml configures', () => {
    const configured = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8').match(/^MODEL_ID = "([^"]+)"$/m)?.[1];
    expect(configured).toBeDefined();
    expect(Object.keys(modelInput(configured as string, ENTRIES, 'q')).sort()).not.toEqual([
      'max_tokens',
      'messages',
      'temperature',
    ]);
  });
});

describe('the answer', () => {
  it('reads Chat Completions output', () => {
    expect(answerText(chatOutput('  An answer.  '))).toBe('An answer.');
  });

  it('reads the older response form', () => {
    expect(answerText({ response: 'An answer.' })).toBe('An answer.');
  });

  it.each([
    ['nothing', undefined],
    ['an empty answer', chatOutput('')],
    ['a blank answer', chatOutput(' \n ')],
    ['a null content', { choices: [{ message: { content: null } }] }],
    ['no choices', { choices: [] }],
  ])('finds no answer in %s', (_label, output) => {
    expect(answerText(output)).toBeNull();
  });
});

describe('the cited entries', () => {
  it('are the entries whose links appear, exactly', () => {
    const answer = `Yes ([a](${ENTRIES[0].link})), and see ${ENTRIES[2].link}.`;
    expect(citedEntryIds(answer, ENTRIES)).toEqual([ENTRIES[0].id, ENTRIES[2].id]);
  });

  // A model, or a Markdown renderer before it, may percent-encode the query or
  // fragment, or change the case of the scheme and host. The link still names
  // the same entry.
  it.each([
    ['a percent-encoded item', `[a](${ORIGIN}/papers/explorer/?item=paper%3A1)`, ['paper:1']],
    ['an encoded item and fragment', `[a](${ORIGIN}/datasets/chicken/?item=ds%3Agse169291#complete%2Ddata%2Dinventory)`, ['ds:gse169291']],
    ['an upper-case scheme and host', `[a](HTTPS://CAAIL.TUFTS.EDU/software/#alphafold)`, ['sw:alphafold']],
    ['another query parameter beside the item', `[a](${ORIGIN}/papers/explorer/?utm=x&item=paper:1)`, ['paper:1']],
    // An item link is its page and its item: the fragment and a trailing slash
    // do not change which entry it cites.
    ['an item link with its fragment dropped', `[a](${ORIGIN}/datasets/chicken/?item=ds:gse169291)`, ['ds:gse169291']],
    ['an item link with its trailing slash dropped', `[a](${ORIGIN}/papers/explorer?item=paper:1)`, ['paper:1']],
    // A link without an item is the page and its anchor; a trailing slash is not part of either.
    ['an anchored link with its trailing slash dropped', `[a](${ORIGIN}/software#alphafold)`, ['sw:alphafold']],
  ])('count %s', (_label, answer, expected) => {
    expect(citedEntryIds(answer, ENTRIES)).toEqual(expected);
  });

  it.each([
    ['an encoded item naming another entry', `[a](${ORIGIN}/papers/explorer/?item=paper%3A10)`],
    ['an item link naming another item', `[a](${ORIGIN}/datasets/chicken/?item=ds:gse169292)`],
    // The right item on the wrong page lands the reader on a page that ignores it.
    ['the item on another page of the site', `[a](${ORIGIN}/papers/reviews/?item=paper:1)`],
    ['the item on another host', '[a](https://caail.tufts.edu.evil.example/papers/explorer/?item=paper:1)'],
    ['the path on another host', '[a](https://caail.tufts.edu.evil.example/software/#alphafold)'],
    ['an anchored link to another anchor', `[a](${ORIGIN}/software/#alphafold2)`],
    ['a link that does not parse', '[a](https://caail.tufts.edu:99999/software/#alphafold)'],
    ['a malformed escape', `[a](${ORIGIN}/papers/explorer/?item=paper%3)`],
  ])('do not count %s', (_label, answer) => {
    expect(citedEntryIds(answer, ENTRIES)).toEqual([]);
  });

  // A model that bolds or italicises a bare link puts the emphasis markers
  // straight after it. They are Markdown, not part of the link.
  describe('after Markdown emphasis', () => {
    const scgpt = { id: 'sw:scgpt', kind: 'software', name: 'scGPT', link: `${ORIGIN}/software/#scgpt`, text: 'scGPT' };
    const underscored = { id: 'ds:a_b', kind: 'dataset', name: 'A', link: `${ORIGIN}/datasets/cow/?item=ds:a_b#complete-data-inventory`, text: 'A' };

    it.each([
      ['bold', `See **${scgpt.link}**`],
      ['italic', `See *${scgpt.link}*`],
      ['underscore bold', `See __${scgpt.link}__`],
      ['underscore italic', `See _${scgpt.link}_`],
      ['bold, then a full stop', `See **${scgpt.link}**.`],
    ])('count a link in %s', (_label, answer) => {
      expect(citedEntryIds(answer, [scgpt])).toEqual(['sw:scgpt']);
    });

    it('keep an underscore that is part of the link', () => {
      expect(citedEntryIds(`See **${underscored.link}**`, [underscored])).toEqual(['ds:a_b']);
      expect(citedEntryIds(`See ${ORIGIN}/datasets/cow/?item=ds:a_`, [underscored])).toEqual([]);
    });
  });

  it('do not include an entry whose link was altered, cut or made up', () => {
    const answer = [
      `[a](${ENTRIES[0].link}x)`,
      `[b](${ENTRIES[1].link.replace('paper:1', 'paper:10')})`,
      `[c](${ENTRIES[2].link.replace('ds:gse169291', 'ds:gse16929')})`,
      `[d](${ORIGIN}/papers/explorer/?item=paper:999)`,
    ].join(' ');
    expect(citedEntryIds(answer, ENTRIES)).toEqual([]);
  });

  // The answer is the model's text, and a question can steer it, so reading its
  // links has to stay linear too.
  it('are read in linear time from an answer with a long punctuation run', () => {
    const answer = `[a](${ENTRIES[0].link}${'.'.repeat(50_000)}x)`;
    const started = performance.now();
    const cited = citedEntryIds(answer, ENTRIES);
    const elapsed = performance.now() - started;

    expect(cited).toEqual([]);
    expect(elapsed, `reading links took ${elapsed.toFixed(0)} ms`).toBeLessThan(100);
  });

  it('are none for an answer that cites nothing', () => {
    expect(citedEntryIds('CAAIL holds nothing on that.', ENTRIES)).toEqual([]);
  });
});
