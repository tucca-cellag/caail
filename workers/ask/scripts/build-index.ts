/**
 * Build Ask CAAIL's Vectorize index from the committed site/public/api/.
 *
 *   pnpm --dir workers/ask run index:plan     # print what a run would send; sends nothing
 *   pnpm --dir workers/ask run index:build    # send it; add --create-index the first time
 *
 * Run by hand after a corpus change, as the Worker is deployed by hand. Without
 * --write it only prints the plan, so the request count can be read and approved
 * before anything is sent. With --write it reads CLOUDFLARE_ACCOUNT_ID and
 * CLOUDFLARE_API_TOKEN from the environment (a token with Workers AI and
 * Vectorize edit permission); neither value is printed.
 *
 * Runs under Node's own type stripping, so it imports only files that need no
 * build step.
 */
import { readFileSync } from 'node:fs';
import { describePlan, planBuild, restApi, runBuild } from '../src/index-build.ts';
import type { ApiFiles } from '../src/corpus.ts';

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

const plan = await planBuild(api);
console.log(describePlan(plan));

if (!process.argv.includes('--write')) {
  console.log('\nPlan only: nothing was sent. Re-run with --write to send it.');
  process.exit(0);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
if (!accountId || !apiToken) {
  console.error('\n--write needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the environment. Nothing was sent.');
  process.exit(1);
}

const result = await runBuild(plan, restApi({ accountId, apiToken }), {
  createIndex: process.argv.includes('--create-index'),
  log: (line) => console.log(`\n${line}`),
});
console.log(
  `\n${result.created ? 'Created the index. ' : ''}${result.refused ? 'Refused the old corpus record first. ' : ''}` +
    `Wrote ${result.written} vectors, deleted ${result.deleted}.` +
    ` Mutations: ${result.mutationIds.join(', ')}.` +
    '\nVectorize applies writes asynchronously; a GET on the Worker reports the new corpus date once they land,' +
    ' and answers 200 once the deployed Worker bundles the same corpus.',
);
