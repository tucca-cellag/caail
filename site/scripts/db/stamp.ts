/**
 * stamp.ts (db:stamp): stamp the NDJSON as it stands, so `site/db/corpus-stamp.json` dates it
 * (tucca-cellag/caail-planning#655; corpus-stamp.ts says what the stamp is and why).
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:stamp [--redate]
 *
 * Every db command that writes the NDJSON stamps it when it finishes, and so does `db:emit`, so this
 * is for an NDJSON change made any other way. A stamp that already matches is left unchanged, date
 * and all. `--redate` dates it today anyway, for three cases:
 *
 *   - after resolving a stamp conflict in a merge or rebase, where one side's stamp can still match
 *     the merged NDJSON and keep its older date;
 *   - after a revert of a corpus commit, which restores the earlier stamp with the earlier NDJSON;
 *   - to repair a stamp dated in the future.
 *
 * `db:check-stamp-order` refuses a future date, and a stamp dated earlier than main's, until they
 * are re-dated; re-dating is right in all three cases whether or not it would refuse, with one
 * exception. When the NDJSON ends up identical to main's (a branch that reverts its own corpus
 * commit, or a merge where main already holds the change), the same corpus keeps main's stamp:
 * restore it (`git checkout origin/main -- site/db/corpus-stamp.json`) rather than re-dating,
 * which the guard refuses as the same corpus under another date. Then run
 * `pnpm --dir site parse`, so the API and llms.txt carry the date, and commit the stamp, the NDJSON
 * and what parse changed under `site/public/` together. A re-date onto the date the stamp already
 * carries changes nothing and says so.
 */

import { exitOnRefusal, NDJSON_DIR, RefusalError, runsAsMain } from './lib.js';
import { describeStamp, stampCorpus } from './corpus-stamp.js';

/** The flags db:stamp takes, or a refusal naming its usage. */
export function parseStampArgs(args: readonly string[]): { redate: boolean } {
  const unknown = args.filter((a) => a !== '--redate');
  if (unknown.length) throw new RefusalError(`usage: db:stamp [--redate]   (unknown: ${unknown.join(' ')})`);
  return { redate: args.includes('--redate') };
}

function main(): void {
  try {
    const { redate } = parseStampArgs(process.argv.slice(2));
    console.log(`db:stamp: ${describeStamp(stampCorpus(NDJSON_DIR, new Date(), { redate }))}`);
  } catch (err) {
    exitOnRefusal(err);
  }
}

if (runsAsMain(import.meta.url)) main();
