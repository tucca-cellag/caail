/**
 * The fixed question set against the corpus it was written for, and the two
 * measures it scores answers by, in both directions: a scorer that counted
 * every answer right would pass a test that only fed it right answers.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCorpus, type ApiFiles } from './corpus.ts';
import { buildLookup } from './lookup.ts';
import { citedEntryIds, modelInput } from './model.ts';
import type { RetrievedEntry } from './retrieval.ts';
import {
  CANDIDATES,
  SHAPES,
  linksIn,
  questionSetProblems,
  requestPlan,
  rightEntryBar,
  scoreAnswer,
  tally,
  type AnswerScore,
  type Question,
  type QuestionSet,
} from './question-set.ts';
import { WORD_LIMIT } from './words.ts';

const apiFile = (name: string) => JSON.parse(readFileSync(new URL(`../../../site/public/api/${name}`, import.meta.url), 'utf8'));
const api: ApiFiles = {
  index: apiFile('index.json'),
  catalog: apiFile('catalog.json'),
  papers: apiFile('papers.json'),
  datasets: apiFile('datasets.json'),
  taxonomy: apiFile('taxonomy.json'),
  reports: apiFile('reports.json'),
};
const corpus = buildCorpus(api);
const entryIds = new Set(corpus.map((entry) => entry.id));
const entry = (id: string): RetrievedEntry => {
  const found = corpus.find((e) => e.id === id);
  if (!found) throw new Error(`fixture: ${id} is not in the corpus`);
  return { id: found.id, kind: found.kind, name: found.name, link: found.link, text: found.text };
};

const committed: QuestionSet = JSON.parse(readFileSync(new URL('../eval/questions.json', import.meta.url), 'utf8'));

describe('the committed question set', () => {
  it('names only entries the corpus holds, with nothing else wrong', () => {
    expect(questionSetProblems(committed, entryIds)).toEqual([]);
  });

  it('was written against the corpus the API serves now', () => {
    // A rebuilt API with a new date is not a failure of the set, but its
    // expected entries were chosen against the old one: re-read them, then move
    // the date. Every id is checked above whatever the date says.
    expect(committed.corpusDate).toBe(api.index.corpusDate);
  });

  it('covers every shape, and its bar is the 16 of 20 the ticket set', () => {
    for (const shape of SHAPES) expect(committed.questions.some((q) => q.shape === shape)).toBe(true);
    expect(rightEntryBar(20)).toBe(16);
  });
});

describe('questionSetProblems rejects', () => {
  const good: Question = { id: 'q', shape: 'tool', question: 'Which tool?', mustCite: [['sw:cellpose']] };
  const setOf = (...questions: Question[]): QuestionSet => ({
    corpusDate: '2026-11-14',
    questions: [
      ...questions,
      ...SHAPES.filter((s) => !questions.some((q) => q.shape === s)).map((shape) => ({ ...good, id: `fill-${shape}`, shape })),
    ],
  });

  it('accepts a well-formed set, so the rejections below are not a blanket refusal', () => {
    expect(questionSetProblems(setOf(good), entryIds)).toEqual([]);
  });

  it.each<[string, QuestionSet, RegExp]>([
    ['an entry the corpus does not hold', setOf({ ...good, mustCite: [['sw:no-such-tool']] }), /sw:no-such-tool is not in the corpus/],
    ['an id used twice', setOf(good, { ...good }), /id used twice/],
    ['an unknown shape', setOf({ ...good, shape: 'opinion' as never }), /shape "opinion"/],
    ['an empty group', setOf({ ...good, mustCite: [[]] }), /empty mustCite group/],
    ['no groups', setOf({ ...good, mustCite: [] }), /mustCite names no group/],
    ['an empty question', setOf({ ...good, question: '   ' }), /word limit/],
    ['a question over the word limit', setOf({ ...good, question: 'word '.repeat(WORD_LIMIT + 1) }), /word limit/],
    ['a corpus date that is not a date', { ...setOf(good), corpusDate: 'today' }, /corpusDate/],
    ['a missing shape', { corpusDate: '2026-11-14', questions: [good] }, /no question of shape dataset/],
  ])('%s', (_, set, problem) => {
    expect(questionSetProblems(set, entryIds).join('\n')).toMatch(problem);
  });
});

describe('scoreAnswer', () => {
  const cellpose = entry('sw:cellpose');
  const stardist = entry('sw:stardist');
  const fcs = entry('db:fcs-free-database');
  const entries = [cellpose, stardist, fcs];
  const segmentation: Question = { id: 's', shape: 'tool', question: 'q', mustCite: [['sw:cellpose', 'sw:cellprofiler']] };

  it('counts an answer citing one entry of the group as right', () => {
    const score = scoreAnswer(segmentation, entries, `Use [Cellpose](${cellpose.link}).`);
    expect(score).toMatchObject({ retrieved: true, rightEntry: true, cited: ['sw:cellpose'], outsideLinks: [] });
  });

  it('counts an answer citing only other entries as wrong', () => {
    const score = scoreAnswer(segmentation, entries, `Try [StarDist](${stardist.link}).`);
    expect(score).toMatchObject({ rightEntry: false, cited: ['sw:stardist'], outsideLinks: [] });
  });

  it('counts an answer that names the right entry without its link as wrong', () => {
    expect(scoreAnswer(segmentation, entries, 'Cellpose segments cells.').rightEntry).toBe(false);
  });

  it('needs one entry of every group, not of any group', () => {
    const both: Question = { ...segmentation, mustCite: [['sw:cellpose'], ['db:fcs-free-database']] };
    expect(scoreAnswer(both, entries, `[Cellpose](${cellpose.link})`).rightEntry).toBe(false);
    expect(scoreAnswer(both, entries, `[Cellpose](${cellpose.link}) and [FCS-Free](${fcs.link})`).rightEntry).toBe(true);
  });

  it('flags a made-up, an altered and an outside link, and still counts the real one', () => {
    const answer = [
      `[Cellpose](${cellpose.link})`,
      `[made up](${cellpose.link.replace(/[^/]+\/?$/, 'not-an-entry/')})`,
      'see https://www.cellpose.org for more',
    ].join(' ');
    const score = scoreAnswer(segmentation, entries, answer);
    expect(score.rightEntry).toBe(true);
    expect(score.outsideLinks).toHaveLength(2);
    expect(score.outsideLinks).toContain('https://www.cellpose.org');
  });

  it('flags a link to a real entry the answer was not given', () => {
    const notSupplied = entry('sw:cellprofiler');
    const score = scoreAnswer(segmentation, entries, `[CellProfiler](${notSupplied.link})`);
    expect(score).toMatchObject({ rightEntry: false, cited: [], outsideLinks: [notSupplied.link] });
  });

  it('says when retrieval never supplied a right entry, so the miss is not the model', () => {
    expect(scoreAnswer(segmentation, [stardist, fcs], 'CAAIL holds nothing on this.').retrieved).toBe(false);
  });
});

describe('linksIn reads a link as the Worker does', () => {
  const entries = ['sw:cellpose', 'db:fcs-free-database', 'paper:21', 'term:scaffolding', 'ds:prjca049754'].map(entry);
  const answers = [
    entries.map((e) => `[${e.name}](${e.link})`).join(', '),
    entries.map((e) => `${e.link}.`).join(' '),
    `**${entries[0].link}** and _${entries[1].link}_; also ${entries[2].link}:`,
    `${entries[3].link.toUpperCase()} is not cited, ${entries[4].link}!`,
    'no links at all',
  ];

  it.each(answers)('cites the same entries as citedEntryIds: %s', (answer) => {
    expect(scoreAnswer({ id: 'x', shape: 'term', question: 'q', mustCite: [['x']] }, entries, answer).cited).toEqual(
      citedEntryIds(answer, entries),
    );
  });

  it('strips trailing punctuation and emphasis from a link', () => {
    expect(linksIn(`see ${entries[0].link}*.`)).toEqual([entries[0].link]);
  });
});

describe('the candidates', () => {
  const ENTRIES = [entry('sw:cellpose')];

  // A candidate missing from model.ts's reasoning table would be scored at its
  // default reasoning, which is not how the Worker would run it once chosen.
  it.each(CANDIDATES)('%s is scored with its least-reasoning setting', (model) => {
    expect(Object.keys(modelInput(model, ENTRIES, 'q')).sort()).not.toEqual(['max_tokens', 'messages', 'temperature']);
  });

  it('include the model wrangler.toml configures, so the shipped model is among those scored', () => {
    const configured = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8').match(/^MODEL_ID = "([^"]+)"$/m)?.[1];
    expect(CANDIDATES as readonly string[]).toContain(configured);
  });
});

describe('requestPlan', () => {
  const qs = (...texts: string[]): Question[] => texts.map((question, n) => ({ id: `q${n}`, shape: 'tool', question, mustCite: [['x']] }));

  it('retrieves once per question and calls every candidate on each', () => {
    const plan = requestPlan(qs('a', 'b'), () => false, CANDIDATES);
    expect(plan.workersAi).toEqual({ embeddings: 2, modelCalls: 6, total: 8 });
    expect(plan.vectorize).toEqual({ corpusRecordReads: 1, searches: 2, fetchesById: 0, total: 3 });
    expect(plan.total).toBe(11);
  });

  it('adds a fetch by id only for a question that names an entry', () => {
    expect(requestPlan(qs('names one', 'plain'), (q) => q.startsWith('names'), CANDIDATES).vectorize.fetchesById).toBe(1);
  });

  it('counts the committed set against the lookup the Worker uses', () => {
    const lookup = buildLookup({
      catalog: api.catalog,
      papersIndex: apiFile('papers-index.json'),
      datasets: api.datasets,
      reports: api.reports,
      taxonomy: api.taxonomy,
    });
    const plan = requestPlan(committed.questions, (q) => lookup.match(q).length > 0, CANDIDATES);
    expect(plan.workersAi.modelCalls).toBe(committed.questions.length * CANDIDATES.length);
    expect(plan.vectorize.fetchesById).toBeLessThanOrEqual(committed.questions.length);
  });
});

describe('tally', () => {
  const score = (rightEntry: boolean, outside = 0): AnswerScore => ({
    retrieved: true,
    rightEntry,
    cited: [],
    outsideLinks: Array<string>(outside).fill('https://example.org'),
  });
  const of = (right: number, total: number) => [
    ...Array.from({ length: right }, () => score(true)),
    ...Array.from({ length: total - right }, () => score(false)),
  ];

  it('meets the bar at 16 of 20 with no outside links', () => {
    expect(tally('m', of(16, 20)).meetsMechanicalBar).toBe(true);
  });

  it('misses it at 15 of 20', () => {
    expect(tally('m', of(15, 20))).toMatchObject({ rightEntry: 15, meetsMechanicalBar: false });
  });

  it('misses it with one outside link, however many are right', () => {
    expect(tally('m', [...of(19, 19), score(true, 1)])).toMatchObject({ rightEntry: 20, noOutsideLinks: 19, meetsMechanicalBar: false });
  });
});
