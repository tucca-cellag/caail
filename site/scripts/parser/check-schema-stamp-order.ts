/**
 * check-schema-stamp-order.ts (schema:check-order): the CI guard that keeps the agent API's schema
 * version moving up on main (tucca-cellag/caail-planning#153; schema-stamp.ts says what the stamp
 * is). The corpus stamp's order guard, `check-stamp-order.ts`, is its model.
 *
 *   pnpm --dir site schema:check-order <base>
 *
 * It compares `api-schema-stamp.json` at HEAD with the one at `<base>`, the tree the change lands on,
 * as `lint-papers.yml` passes it. A HEAD stamp identical to `<base>`'s passes, since the change did
 * not bring it in. Otherwise it is refused when it is:
 *
 *   - for the same shape as `<base>`'s (the same hash) under another version: one shape has one
 *     version, so the remedy is to restore `<base>`'s stamp;
 *   - for a different shape, with a version that is not above `<base>`'s. A revert or cherry-pick of
 *     a shape change restores an earlier stamp whose hash matches the restored shape, so `pnpm parse`
 *     and the vitest suite pass it, and a stamp conflict resolved to the wrong side can keep a number
 *     main already published. Either way a consumer who recorded that number would be told nothing
 *     changed. The remedy is to restore `<base>`'s stamp and run `schema:stamp`, which bumps past it.
 *
 * A version more than one above `<base>`'s passes: a branch that changed the shape twice and stamped
 * each time has skipped a number, which tells a consumer nothing false. A base with no stamp passes,
 * since it predates the stamp. A base whose stamp does not parse is compared, with a notice, with the
 * newest earlier stamp that does, so its repair cannot reuse a number already published; with none,
 * the head passes. Every stamp is read from its commit, never the working tree.
 *
 * It shares the corpus guard's gap: on a pull request `<base>` is the first parent of GitHub's merge
 * commit, which can lag main when GitHub has not rebuilt it, so a bad version can pass the pull
 * request and be refused only by the push run after the merge.
 */

import { relative, sep } from 'node:path';

import { assertCommit, committedFile, commitsTouching } from '../db/check-stamp-order.js';
import { exitOnRefusal, REPO_ROOT, RefusalError, runsAsMain } from '../db/lib.js';
import { parseSchemaStamp, SCHEMA_STAMP_COMMAND, SCHEMA_STAMP_PATH, type SchemaStamp } from './schema-stamp.js';

const LABEL = 'schema:check-order';

/** The stamp's path relative to the repository root, as git names it. */
const STAMP_REL = relative(REPO_ROOT, SCHEMA_STAMP_PATH).split(sep).join('/');

const RESTORE = `restore it (for a pull request, git checkout origin/main -- ${STAMP_REL})`;

/**
 * Why `head`'s stamp is out of order against `base`'s, or null when it is not. The rules are in this
 * file's header.
 */
export function schemaStampOrderProblem(base: SchemaStamp | null, head: SchemaStamp): string | null {
  if (base === null) return null;
  if (base.version === head.version && base.sha256 === head.sha256) return null;
  if (head.sha256 === base.sha256) {
    return (
      `the agent API's shape is unchanged from the tree this lands on, whose stamp records schema version ` +
      `${base.version}, but this stamp records ${head.version}. One shape keeps one version: ${RESTORE}, ` +
      'run pnpm --dir site parse, and commit both'
    );
  }
  if (head.version <= base.version) {
    return (
      `the agent API's shape differs from the tree this lands on, but its schema version (${head.version}) is ` +
      `not above that tree's (${base.version}), so a consumer who recorded ${head.version} would be told ` +
      'nothing changed. A revert or cherry-pick of a shape change restores an earlier stamp, and a stamp ' +
      `conflict resolved to the wrong side keeps a number already published: ${RESTORE}, run ` +
      `${SCHEMA_STAMP_COMMAND}, which bumps past it, then run pnpm --dir site parse and commit both`
    );
  }
  return null;
}

/**
 * The problem with `head`'s stamp against `base`'s in the repository at `repo`, or null. A notice for
 * the log, such as a base stamp that does not parse, is pushed onto `notes`.
 */
export function checkSchemaStampOrder(repo: string, base: string, head = 'HEAD', notes: string[] = []): string | null {
  assertCommit(repo, base, LABEL);
  assertCommit(repo, head, LABEL);
  const headText = committedFile(repo, head, STAMP_REL);
  if (headText === null) {
    throw new RefusalError(`${LABEL}: ${STAMP_REL} is not at ${head}; restore it from main and commit it.`);
  }
  const headParsed = parseSchemaStamp(headText);
  if ('problem' in headParsed) throw new RefusalError(`${LABEL}: ${STAMP_REL} at ${head} ${headParsed.problem}.`);
  const baseText = committedFile(repo, base, STAMP_REL);
  let baseStamp: SchemaStamp | null = null;
  if (baseText !== null) {
    const baseParsed = parseSchemaStamp(baseText);
    if ('problem' in baseParsed) {
      // Compare with the newest earlier stamp that parses, so a repair cannot reuse its number.
      for (const sha of commitsTouching(repo, base, STAMP_REL)) {
        const text = committedFile(repo, sha, STAMP_REL);
        const earlier = text === null ? null : parseSchemaStamp(text);
        if (earlier !== null && 'stamp' in earlier) {
          baseStamp = earlier.stamp;
          notes.push(`${STAMP_REL} at ${base} ${baseParsed.problem}, so it is compared with ${sha.slice(0, 8)}'s, the newest that parses.`);
          break;
        }
      }
      if (baseStamp === null) {
        notes.push(`${STAMP_REL} at ${base} ${baseParsed.problem}, and no earlier stamp parses, so it is compared as if absent.`);
      }
    } else {
      baseStamp = baseParsed.stamp;
    }
  }
  return schemaStampOrderProblem(baseStamp, headParsed.stamp);
}

function main(): void {
  try {
    const base = process.argv[2];
    if (!base) throw new RefusalError(`usage: ${LABEL} <base commit>`);
    const notes: string[] = [];
    const problem = checkSchemaStampOrder(REPO_ROOT, base, 'HEAD', notes);
    for (const note of notes) console.log(`::notice::${LABEL}: ${note}`);
    if (problem) throw new RefusalError(`${LABEL}: ${problem}.`);
    console.log(`${LABEL}: the schema stamp is in order against ${base}.`);
  } catch (err) {
    exitOnRefusal(err);
  }
}

if (runsAsMain(import.meta.url)) main();
