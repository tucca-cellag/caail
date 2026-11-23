/**
 * stamp-schema.ts (schema:stamp): count a change to the agent API's shape, so
 * `site/scripts/parser/api-schema-stamp.json` matches it (tucca-cellag/caail-planning#153;
 * schema-stamp.ts says what the stamp is and why).
 *
 *   pnpm --dir site schema:stamp [--init]
 *
 * Run it after a deliberate change to a response schema or an endpoint, when `pnpm parse` refuses
 * the stamp. It bumps the schema version by one; a stamp that already matches is left unchanged.
 * `--init` writes version 1 where no stamp exists, and is refused where one does. Then run
 * `pnpm --dir site parse` and commit the stamp with what parse changed under `site/public/api/`.
 */

import { exitOnRefusal, RefusalError, runsAsMain } from '../db/lib.js';
import { describeSchemaStamp, stampSchema } from './schema-stamp.js';

/** The flags schema:stamp takes, or a refusal naming its usage. */
export function parseStampSchemaArgs(args: readonly string[]): { init: boolean } {
  const unknown = args.filter((a) => a !== '--init');
  if (unknown.length) throw new RefusalError(`usage: schema:stamp [--init]   (unknown: ${unknown.join(' ')})`);
  return { init: args.includes('--init') };
}

function main(): void {
  try {
    const { init } = parseStampSchemaArgs(process.argv.slice(2));
    console.log(`schema:stamp: ${describeSchemaStamp(stampSchema(undefined, undefined, { init }))}`);
  } catch (err) {
    exitOnRefusal(err);
  }
}

if (runsAsMain(import.meta.url)) main();
