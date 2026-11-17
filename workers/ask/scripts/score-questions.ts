/**
 * Score Ask CAAIL's fixed question set (eval/questions.json) for each candidate
 * model, through the Worker's own retrieval and model call over the live index.
 *
 *   pnpm --dir workers/ask run score:plan                 # print every request a run would send; sends nothing
 *   pnpm --dir workers/ask run score:run --out <file>     # send them, and write every answer to <file>
 *
 * Run by hand, like the index build, and only once the request count has been
 * approved: every run spends Workers AI allocation. Without --send it only
 * prints the plan. With --send it reads CLOUDFLARE_ACCOUNT_ID and
 * CLOUDFLARE_API_TOKEN from the environment (the index build's token, with
 * Workers AI and Vectorize permission); neither value is printed.
 *
 * What it shares with the Worker, so the system scored is the system that runs:
 * the lookup over the committed API, `retrieve` (both halves, the site and
 * deployed-corpus filters, TOP_K), `modelInput` (system prompt, max_tokens,
 * temperature, each model's least reasoning) and `answerText`. What differs:
 * the bindings are Cloudflare's REST endpoints rather than the Worker's, and
 * retrieval runs once per question for all candidates, since nothing in it
 * depends on the model. No question record is written, so a scoring run leaves
 * nothing in the Worker's dataset.
 *
 * Stops at the first Workers AI limit (3036, the daily allocation; 3040,
 * capacity) or HTTP 429, and writes what it has.
 *
 * Runs under Node's own type stripping, so it imports only files that need no
 * build step.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildCorpus, corpusDateOf, type ApiFiles } from '../src/corpus.ts';
import { buildLookup } from '../src/lookup.ts';
import { answerText, modelInput } from '../src/model.ts';
import { retrieve, type AiBinding, type IndexBinding, type StoredVector } from '../src/retrieval.ts';
import { CORPUS_RECORD_ID, INDEX_NAME, REQUEST_DEADLINE_MS, builtWithTheseSettings } from '../src/settings.ts';
import { callWorkersAi, workersAiCode } from '../src/workers-ai.ts';
import {
  CANDIDATES,
  questionSetProblems,
  requestPlan,
  rightEntryBar,
  scoreAnswer,
  tally,
  type AnswerScore,
  type QuestionSet,
} from '../src/question-set.ts';

const API_DIR = new URL('../../../site/public/api/', import.meta.url);
const read = (file: string) => JSON.parse(readFileSync(new URL(file, API_DIR), 'utf8'));

const api: ApiFiles = {
  index: read('index.json'),
  catalog: read('catalog.json'),
  papers: read('papers.json'),
  datasets: read('datasets.json'),
  taxonomy: read('taxonomy.json'),
  reports: read('reports.json'),
};
const corpusDate = corpusDateOf(api);
const entryIds = new Set(buildCorpus(api).map((entry) => entry.id));
const lookup = buildLookup({
  catalog: api.catalog,
  papersIndex: read('papers-index.json'),
  datasets: api.datasets,
  reports: api.reports,
  taxonomy: api.taxonomy,
});
const set: QuestionSet = JSON.parse(readFileSync(new URL('../eval/questions.json', import.meta.url), 'utf8'));

const problems = questionSetProblems(set, entryIds);
if (problems.length > 0) {
  console.error(`The question set has ${problems.length} problem(s); nothing was sent:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
if (set.corpusDate !== corpusDate) {
  console.warn(
    `Note: the set was written against the corpus of ${set.corpusDate}, and the API is dated ${corpusDate}. ` +
      'Every expected entry is still in the corpus, but re-read them before trusting a miss.',
  );
}

const plan = requestPlan(set.questions, (q) => lookup.match(q).length > 0, CANDIDATES);
console.log(
  [
    `Question set: ${plan.questions} questions, corpus ${corpusDate}; candidates, cheapest first: ${CANDIDATES.join(', ')}.`,
    `Bar: the right entry on at least ${rightEntryBar(plan.questions)} of ${plan.questions}, and no outside link on any.`,
    '',
    `Requests a run sends: ${plan.total}.`,
    `  Workers AI: ${plan.workersAi.total} = ${plan.workersAi.embeddings} question embeddings + ${plan.workersAi.modelCalls} model calls (${plan.questions} x ${plan.candidates}).`,
    `  Vectorize:  ${plan.vectorize.total} = ${plan.vectorize.corpusRecordReads} corpus-record read + ${plan.vectorize.searches} searches + ${plan.vectorize.fetchesById} fetches by id (questions that name an entry).`,
    `  Each model call asks for at most ${modelInput(CANDIDATES[0], [], '').max_tokens} output tokens.`,
  ].join('\n'),
);

if (!process.argv.includes('--send')) {
  console.log('\nPlan only: nothing was sent. Re-run with --send and --out <file> to send it.');
  process.exit(0);
}

const outAt = process.argv.indexOf('--out');
const outPath = outAt > 0 ? process.argv[outAt + 1] : undefined;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
if (!outPath || !accountId || !apiToken) {
  console.error('\n--send needs --out <file>, and CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the environment. Nothing was sent.');
  process.exit(1);
}

/**
 * The Worker's two bindings over Cloudflare's REST endpoints. An error names the
 * step, the HTTP status and Cloudflare's own codes, and never the token. A
 * Workers AI error's message leads with its code, the form workers-ai.ts reads
 * from the binding's errors, so the same limits are recognised here.
 */
function restBindings(account: string, token: string): { AI: AiBinding; INDEX: IndexBinding } {
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
  const indexUrl = `${base}/vectorize/v2/indexes/${INDEX_NAME}`;

  async function post(step: string, url: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const envelope = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      result?: unknown;
      errors?: { code?: number; message?: string }[];
    };
    if (!response.ok || envelope.success !== true) {
      const errors = (envelope.errors ?? []).map((e) => `${e.code ?? '?'}: ${e.message ?? ''}`.trim()).join('; ');
      const error = new Error(`${errors || 'no error body'} (${step}, HTTP ${response.status})`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    return envelope.result;
  }

  const vectorsOf = (result: unknown): StoredVector[] => {
    const vectors = Array.isArray(result) ? result : (result as { vectors?: unknown } | null)?.vectors;
    if (!Array.isArray(vectors)) throw new Error('a read by id carried no vectors');
    return vectors as StoredVector[];
  };

  return {
    AI: {
      run: (model, inputs, options) => post(`running ${model}`, `${base}/ai/run/${model}`, inputs, options?.signal),
    },
    INDEX: {
      async query(vector, options) {
        const result = (await post('searching the index', `${indexUrl}/query`, { vector, ...options, returnValues: false })) as {
          matches?: (StoredVector & { score: number })[];
        };
        const matches = result?.matches ?? [];
        // The REST reference does not list `namespace` for a query, as the
        // binding does. The corpus record is the one vector outside the entries'
        // namespace, so finding it here means the search was not confined to
        // them, and the retrieval scored would not be the Worker's.
        if (matches.some((match) => match.id === CORPUS_RECORD_ID)) {
          throw new Error('the search returned the corpus record, so its namespace was not applied');
        }
        return { matches };
      },
      async getByIds(ids) {
        return vectorsOf(await post('reading by id', `${indexUrl}/get_by_ids`, { ids }));
      },
    },
  };
}

const env = restBindings(accountId, apiToken);
const LIMITS = new Set([3036, 3040]);
const statusOf = (err: unknown) => (err as { status?: number } | null)?.status;
const isLimit = (err: unknown) =>
  LIMITS.has(workersAiCode(err) ?? -1) ||
  statusOf(err) === 429 ||
  (err instanceof Error && statusOf(err.cause) === 429);
const errorLine = (err: unknown) => (err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err));
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Between Workers AI calls: one run is sequential and well inside the documented per-minute limits. */
const SPACING_MS = 1_000;
/** A hung call is given up on after this; it is not the Worker's deadline, which each answer is timed against. */
const CALL_TIMEOUT_MS = 120_000;

const record = await env.INDEX.getByIds([CORPUS_RECORD_ID]);
const meta = record.find((vector) => vector.id === CORPUS_RECORD_ID)?.metadata ?? {};
if (!builtWithTheseSettings(meta) || meta.corpusDate !== corpusDate) {
  console.error(
    `\nThe index does not match: built from ${String(meta.corpusDate)} with ${String(meta.embeddingModel)}; ` +
      `this checkout embeds questions as the Worker does and bundles ${corpusDate}. One request was sent; nothing more.`,
  );
  process.exit(1);
}

interface AnswerRecord {
  answer: string | null;
  score: AnswerScore | null;
  ms: number;
  withinDeadline: boolean;
  usage: unknown;
  error: string | null;
}
interface QuestionRecord {
  id: string;
  shape: string;
  question: string;
  mustCite: string[][];
  entries: { id: string; name: string }[];
  retrievalFailed: string | null;
  retrievalMs: number;
  answers: Record<string, AnswerRecord>;
}

const results: QuestionRecord[] = [];
let stoppedAt: string | null = null;
const startedAt = new Date().toISOString();

run: for (const q of set.questions) {
  const t0 = Date.now();
  let retrieval: Awaited<ReturnType<typeof retrieve>>;
  try {
    retrieval = await retrieve(q.question, env, lookup, AbortSignal.timeout(CALL_TIMEOUT_MS));
  } catch (err) {
    if (isLimit(err)) {
      stoppedAt = `${q.id}, retrieval: ${errorLine(err)}`;
      break;
    }
    results.push({ ...q, entries: [], retrievalFailed: errorLine(err), retrievalMs: Date.now() - t0, answers: {} });
    continue;
  }
  // The embedding half can hit a limit while the named half still answers, and
  // retrieve() then returns rather than throws. The Worker stops there on the
  // daily allocation, and so does this.
  if (retrieval.failed && isLimit(retrieval.failed.error)) {
    stoppedAt = `${q.id}, retrieval: ${errorLine(retrieval.failed.error)}`;
    break;
  }
  const retrievalMs = Date.now() - t0;
  const row: QuestionRecord = {
    ...q,
    entries: retrieval.entries.map((e) => ({ id: e.id, name: e.name })),
    retrievalFailed: retrieval.failed ? `${retrieval.failed.half}: ${errorLine(retrieval.failed.error)}` : null,
    retrievalMs,
    answers: {},
  };
  results.push(row);
  for (const model of CANDIDATES) {
    await pause(SPACING_MS);
    const t1 = Date.now();
    try {
      const output = await callWorkersAi(env.AI, model, modelInput(model, retrieval.entries, q.question), {
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      const answer = answerText(output);
      const ms = Date.now() - t1;
      row.answers[model] = {
        answer,
        score: answer === null ? null : scoreAnswer(q, retrieval.entries, answer),
        ms,
        withinDeadline: retrievalMs + ms < REQUEST_DEADLINE_MS,
        usage: (output as { usage?: unknown } | null)?.usage ?? null,
        error: answer === null ? 'no answer text' : null,
      };
    } catch (err) {
      row.answers[model] = { answer: null, score: null, ms: Date.now() - t1, withinDeadline: false, usage: null, error: errorLine(err) };
      if (isLimit(err)) {
        stoppedAt = `${q.id}, ${model}: ${errorLine(err)}`;
        break run;
      }
    }
  }
  console.log(`${q.id}: ${retrieval.entries.length} entries in ${retrievalMs} ms`);
}

const failed: AnswerScore = { retrieved: false, rightEntry: false, cited: [], outsideLinks: [] };
const tallies = CANDIDATES.map((model) => {
  const scores = results.filter((r) => r.answers[model]).map((r) => r.answers[model].score ?? failed);
  return {
    ...tally(model, scores),
    retrievalMisses: results.filter((r) => r.answers[model]?.score?.retrieved === false).length,
    overDeadline: results.filter((r) => r.answers[model] && !r.answers[model].withinDeadline).length,
  };
});

writeFileSync(
  outPath,
  `${JSON.stringify({ corpusDate, indexCorpusDate: meta.corpusDate, startedAt, stoppedAt, candidates: CANDIDATES, tallies, questions: results }, null, 2)}\n`,
);
console.log(`\n${stoppedAt ? `Stopped early at ${stoppedAt}.\n` : ''}Wrote ${results.length} questions to ${outPath}.`);
for (const t of tallies) {
  console.log(
    `${t.model}: right entry ${t.rightEntry}/${t.questions}, no outside link ${t.noOutsideLinks}/${t.questions}, ` +
      `retrieval missed ${t.retrievalMisses}, over the ${REQUEST_DEADLINE_MS} ms deadline ${t.overDeadline}` +
      `${t.meetsMechanicalBar ? '; meets the mechanical bar' : ''}.`,
  );
}
console.log('\nRead each answer against its entries before taking a candidate: no outside link is not the same as staying inside them.');
