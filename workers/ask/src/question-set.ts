/**
 * The fixed question set (eval/questions.json): questions with a known answer in
 * the corpus, each with the entries a correct answer must cite. It is how the
 * model that answers was chosen, and it stays as the regression check on
 * answers as the corpus grows.
 *
 * Two measures per answer, both read from the answer and the entries retrieval
 * supplied, never from a judgement:
 *   - right entry: the answer cites at least one entry of every `mustCite` group;
 *   - no outside links: every link in the answer names an entry it was given.
 * Whether an answer also stays inside the entries in what it says, rather than
 * filling in from general knowledge, takes reading it; the scoring script puts
 * each answer beside its entries so it can be read.
 *
 * Not imported by the Worker, so nothing here reaches its bundle. Imports only
 * files that need no build step, since the scoring script runs it under Node's
 * own type stripping.
 */
import type { RetrievedEntry } from './retrieval.ts';
import { LINK_CHARS, LINK_TRAILING, linkKey } from './links.ts';
import { trimTrailing } from './text.ts';
import { WORD_LIMIT, wordCount } from './words.ts';

/**
 * The models the set scores, cheapest first by the Workers AI price per token:
 * the first that clears the bar is the one to configure as MODEL_ID. Each has a
 * least-reasoning setting in model.ts, which question-set.test.ts checks, so a
 * candidate is scored the way the Worker would run it.
 */
export const CANDIDATES = ['@cf/google/gemma-4-26b-a4b-it', '@cf/openai/gpt-oss-20b', '@cf/openai/gpt-oss-120b'] as const;

/** The four question shapes the set covers, each in it at least once. */
export const SHAPES = ['tool', 'dataset', 'method-area', 'term'] as const;
export type Shape = (typeof SHAPES)[number];

export interface Question {
  id: string;
  shape: Shape;
  question: string;
  /** Groups of entry ids; an answer is right when it cites one of each group. */
  mustCite: string[][];
}

export interface QuestionSet {
  /** The corpus date the expected entries were read from. */
  corpusDate: string;
  questions: Question[];
}

/**
 * The bar a candidate must clear: the right entry on at least this share of the
 * questions, and no outside link on any. Kept as a share so the bar follows the
 * set's size: 16 of the 20 questions the set started with.
 */
export const RIGHT_ENTRY_SHARE = 0.8;

/** The fewest right answers a set of `n` questions passes with. */
export function rightEntryBar(n: number): number {
  return Math.ceil(RIGHT_ENTRY_SHARE * n);
}

/**
 * What is wrong with a question set, one line per problem; empty when nothing is.
 * `entryIds` is every id the corpus holds, so an expected entry the corpus no
 * longer has is caught here rather than scored as a model's miss.
 */
export function questionSetProblems(set: QuestionSet, entryIds: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (typeof set.corpusDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(set.corpusDate)) {
    problems.push('corpusDate is not a YYYY-MM-DD date');
  }
  if (!Array.isArray(set.questions) || set.questions.length === 0) return [...problems, 'no questions'];
  const seen = new Set<string>();
  for (const [n, q] of set.questions.entries()) {
    if (typeof q !== 'object' || q === null || Array.isArray(q)) {
      problems.push(`question ${n + 1}: not an object`);
      continue;
    }
    const at = `question ${n + 1} (${q.id ?? 'no id'})`;
    if (typeof q.id !== 'string' || q.id === '') problems.push(`${at}: no id`);
    else if (seen.has(q.id)) problems.push(`${at}: id used twice`);
    else seen.add(q.id);
    if (!(SHAPES as readonly string[]).includes(q.shape)) problems.push(`${at}: shape "${q.shape}" is not one of ${SHAPES.join(', ')}`);
    const words = typeof q.question === 'string' ? wordCount(q.question) : 0;
    if (words < 1 || words > WORD_LIMIT) problems.push(`${at}: the question is outside the Worker's word limit`);
    if (!Array.isArray(q.mustCite) || q.mustCite.length === 0) {
      problems.push(`${at}: mustCite names no group`);
      continue;
    }
    for (const group of q.mustCite) {
      if (!Array.isArray(group) || group.length === 0) {
        problems.push(`${at}: an empty mustCite group`);
        continue;
      }
      for (const id of group) if (!entryIds.has(id)) problems.push(`${at}: ${id} is not in the corpus`);
    }
  }
  for (const shape of SHAPES) {
    if (!set.questions.some((q) => q?.shape === shape)) problems.push(`no question of shape ${shape}`);
  }
  return problems;
}

/**
 * Every link in an answer, its trailing punctuation stripped. The same reading
 * of a link as model.ts's citedEntryIds (LINK_CHARS, then LINK_TRAILING), which
 * question-set.test.ts holds the two to.
 */
export function linksIn(answer: string): string[] {
  const urls = answer.match(new RegExp(`https?://[${LINK_CHARS}]+`, 'gi')) ?? [];
  return urls.map((url) => trimTrailing(url, LINK_TRAILING));
}

/**
 * Links with no http(s) scheme, which linksIn does not read: a Markdown link's
 * target such as `www.example.org`, `example.org/x` or a relative path, and a
 * bare `www.` host in the text. Every entry's link is absolute, so none of these
 * can name one, and each is an outside link.
 */
export function schemelessLinksIn(answer: string): string[] {
  const targets = [...answer.matchAll(/\]\(\s*<?([^)\s>]+)/g)].map((m) => m[1]).filter((t) => !/^https?:\/\//i.test(t));
  const hosts = answer.match(/(?<![\w/.@-])www\.[^\s)\]>]+/gi) ?? [];
  return [...new Set([...targets, ...hosts].map((link) => trimTrailing(link, LINK_TRAILING)))];
}

export interface AnswerScore {
  /** Retrieval supplied an entry of every group, so a right answer was possible. */
  retrieved: boolean;
  /** The answer cites an entry of every group. */
  rightEntry: boolean;
  /** The entries the answer cites, by id, in the order retrieval supplied them. */
  cited: string[];
  /** Links in the answer that name no entry it was given: made up, altered or outside. */
  outsideLinks: string[];
}

/** Both measures for one answer to one question, from the entries it was given. */
export function scoreAnswer(question: Question, entries: RetrievedEntry[], answer: string): AnswerScore {
  const byKey = new Map<string, string>();
  for (const entry of entries) {
    const key = linkKey(entry.link);
    if (key !== null) byKey.set(key, entry.id);
  }
  const linked = new Set<string>();
  const outsideLinks: string[] = [];
  for (const link of linksIn(answer)) {
    const key = linkKey(link);
    const id = key === null ? undefined : byKey.get(key);
    if (id === undefined) outsideLinks.push(link);
    else linked.add(id);
  }
  outsideLinks.push(...schemelessLinksIn(answer));
  const cited = entries.map((entry) => entry.id).filter((id) => linked.has(id));
  const supplied = new Set(entries.map((entry) => entry.id));
  return {
    retrieved: question.mustCite.every((group) => group.some((id) => supplied.has(id))),
    rightEntry: question.mustCite.every((group) => group.some((id) => linked.has(id))),
    cited,
    outsideLinks,
  };
}

/**
 * The most requests one scoring run sends, by service. Fewer go out when a run
 * stops early, or when retrieval gives a question no entries, since the Worker
 * then answers 503 without calling a model. Retrieval does not depend on
 * the model, so it runs once per question and its entries go to every
 * candidate: one embedding and one search by meaning per question, plus one
 * fetch by id for each question that names an entry outright (the lookup is
 * offline, so this count is exact), then one model call per question per
 * candidate. One read of the corpus record comes first, to check the index was
 * built the way questions are embedded.
 */
export interface RequestPlan {
  questions: number;
  candidates: number;
  workersAi: { embeddings: number; modelCalls: number; total: number };
  vectorize: { corpusRecordReads: number; searches: number; fetchesById: number; total: number };
  total: number;
}

export function requestPlan(questions: Question[], namesAnEntry: (question: string) => boolean, candidates: readonly string[]): RequestPlan {
  const n = questions.length;
  const fetchesById = questions.filter((q) => namesAnEntry(q.question)).length;
  const workersAi = { embeddings: n, modelCalls: n * candidates.length, total: n + n * candidates.length };
  const vectorize = { corpusRecordReads: 1, searches: n, fetchesById, total: 1 + n + fetchesById };
  return { questions: n, candidates: candidates.length, workersAi, vectorize, total: workersAi.total + vectorize.total };
}

export interface CandidateTally {
  model: string;
  questions: number;
  /** Questions with an answer the Worker would have delivered. */
  answered: number;
  rightEntry: number;
  noOutsideLinks: number;
  /** Whether the mechanical half of the bar is met; the reading of each answer is the other half. */
  meetsMechanicalBar: boolean;
}

/**
 * One candidate's totals over the whole set. `scores` holds one entry for every
 * question in the set, null where the question has no answer the Worker would
 * have delivered: retrieval failed, the call failed or came back empty, the
 * answer missed the deadline, or the run stopped first. A null counts as wrong,
 * and the bar is met only when every question was answered, so a run that
 * reached few questions cannot pass on the ones it reached.
 */
export function tally(model: string, scores: (AnswerScore | null)[]): CandidateTally {
  const answered = scores.filter((s) => s !== null);
  const rightEntry = answered.filter((s) => s.rightEntry).length;
  const noOutsideLinks = answered.filter((s) => s.outsideLinks.length === 0).length;
  return {
    model,
    questions: scores.length,
    answered: answered.length,
    rightEntry,
    noOutsideLinks,
    meetsMechanicalBar:
      scores.length > 0 &&
      answered.length === scores.length &&
      rightEntry >= rightEntryBar(scores.length) &&
      noOutsideLinks === scores.length,
  };
}
