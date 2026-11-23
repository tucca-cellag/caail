/**
 * schema-stamp.ts: a version for the agent API's shape (tucca-cellag/caail-planning#153).
 *
 * The agent API is what outside consumers build against, and `corpusDate` dates its content.
 * Nothing dated its shape: a renamed field, a restructured payload or a removed key looked the
 * same to a consumer as a content update. This stamp is that signal.
 *
 * `api-schema-stamp.json`, beside this file, holds a counter and a sha256 of `openapi.json`'s
 * `paths` and `components` (`schemaHashOf`). Those two keys are the shape: every response schema
 * and every endpoint. They carry no date and no envelope-note text, so a catalog edit or a
 * rewording of `scopeNote` cannot move the hash (both asserted in schema-stamp.test.ts). The
 * counter is served as `index.json`'s `schemaVersion` and as the second part of `info.version`,
 * after `API_VERSION`.
 *
 * `pnpm parse` refuses a stamp whose hash no longer matches (`readStampedSchemaVersion`, called by
 * `buildAgentApi`), and so does the vitest suite, so a change of shape cannot reach main without a
 * deliberate re-stamp: `pnpm --dir site schema:stamp`, which bumps the counter by one.
 *
 * The counter must also only go up on main, which neither of those can see: a revert or
 * cherry-pick of a shape change restores an older stamp whose hash matches the restored shape, and
 * would reuse a version main already published. `check-schema-stamp-order.ts`
 * (`schema:check-order`, run by `lint-papers.yml` against the tree a change lands on) refuses that.
 * The first design held that a counter needs no order guard; review found the revert case, and the
 * guard was added (2026-11-23).
 *
 * Two branches that each change the shape each bump the counter, so git reports a conflict on the
 * stamp. Keep main's side and re-run the stamp command: the merged shape differs from main's, so it
 * bumps past it, and the order guard refuses any resolution that does not. A stamp that does not
 * parse (conflict markers left in) is refused, never guessed at, since rewriting it would reset the
 * counter.
 *
 * It needs no git and no network, and reads no corpus data: `paths` and `components` come from the
 * zod schemas alone.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RefusalError } from '../db/lib.js';
import { buildOpenApiDocument } from './openapi.js';

/** The committed stamp: beside this module, in the parser directory `lint-papers.yml` watches. */
export const SCHEMA_STAMP_PATH = join(dirname(fileURLToPath(import.meta.url)), 'api-schema-stamp.json');

/** The command that re-stamps the shape, named by every refusal. */
export const SCHEMA_STAMP_COMMAND = 'pnpm --dir site schema:stamp';

/** What the stamp holds: the schema version (a counter) and the hash of the shape it counts. */
export interface SchemaStamp {
  version: number;
  sha256: string;
}

/** `value` with every object's keys sorted, recursively, so the hash ignores key order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

/**
 * The sha256 of `doc`'s `paths` and `components`, over a canonical form (keys sorted, arrays kept
 * in order, since an array's order can be meaningful). Nothing else in the document is read, so
 * `info` and `x-corpus-date`, which carry the version and the date, stay out by construction.
 * Throws when either key is missing, since an empty shape would hash to a stable, wrong answer.
 */
export function schemaHashOf(doc: unknown): string {
  const { paths, components } = (doc ?? {}) as { paths?: unknown; components?: unknown };
  if (paths === undefined || components === undefined) {
    throw new Error('schema stamp: the document has no `paths` or no `components` to hash');
  }
  return createHash('sha256').update(JSON.stringify(canonical({ paths, components }))).digest('hex');
}

/**
 * The hash of the shape this checkout's schemas describe. The arguments only reach `info` and
 * `x-corpus-date`, outside the hashed part, so any values do (asserted in the tests).
 */
export function currentSchemaHash(): string {
  return schemaHashOf(buildOpenApiDocument('2000-01-01', 1));
}

const SHA256 = /^[0-9a-f]{64}$/;

/** The stamp in `text`, or why it is not one. Exactly the two keys, so the file holds only what it says. */
export function parseSchemaStamp(text: string): { stamp: SchemaStamp } | { problem: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { problem: 'is not valid JSON' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { problem: 'is not a JSON object' };
  }
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'sha256,version') {
    return { problem: `has the keys [${keys.join(', ')}], not exactly version and sha256` };
  }
  const { version, sha256 } = value as Record<string, unknown>;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    return { problem: `has the version ${JSON.stringify(version)}, which is not a whole number of 1 or more` };
  }
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) {
    return { problem: `has the sha256 ${JSON.stringify(sha256)}, which is not 64 lowercase hex digits` };
  }
  return { stamp: { version, sha256 } };
}

/** What `inspectSchemaStamp` found: the stamp if it parsed, the shape's hash, and the problem, if any. */
export interface SchemaStampInspection {
  path: string;
  stamp: SchemaStamp | null;
  actual: string;
  /** Null when the stamp parses and its hash matches the shape. */
  problem: string | null;
}

/** Read the stamp at `path` and compare it with the shape (`actual`). Writes nothing. */
export function inspectSchemaStamp(
  path: string = SCHEMA_STAMP_PATH,
  actual: string = currentSchemaHash(),
): SchemaStampInspection {
  if (!existsSync(path)) return { path, stamp: null, actual, problem: `${path} does not exist` };
  const parsed = parseSchemaStamp(readFileSync(path, 'utf-8'));
  if ('problem' in parsed) return { path, stamp: null, actual, problem: `${path} ${parsed.problem}` };
  const { stamp } = parsed;
  if (stamp.sha256 !== actual) {
    return {
      path,
      stamp,
      actual,
      problem:
        `${path} records the schema hash ${stamp.sha256.slice(0, 12)}… for schema version ${stamp.version}, ` +
        `but openapi.json's paths and components now hash to ${actual.slice(0, 12)}…: the agent API's ` +
        'shape changed after it was stamped',
    };
  }
  return { path, stamp, actual, problem: null };
}

/**
 * The stamped schema version, refusing a stamp that is missing, malformed or no longer matches the
 * shape, so `pnpm parse` cannot serve a version that belongs to another shape.
 */
export function readStampedSchemaVersion(
  path: string = SCHEMA_STAMP_PATH,
  actual: string = currentSchemaHash(),
): number {
  const found = inspectSchemaStamp(path, actual);
  if (found.problem !== null || found.stamp === null) {
    throw new Error(
      `agent API schema stamp: ${found.problem}. If the change of shape is deliberate, run ` +
        `${SCHEMA_STAMP_COMMAND} to count it, then run pnpm --dir site parse and commit the stamp ` +
        'with what parse changed under site/public/api/.',
    );
  }
  return found.stamp.version;
}

/** What `stampSchema` did: whether it wrote, and the stamp now on disk. */
export interface SchemaStampResult {
  path: string;
  changed: boolean;
  stamp: SchemaStamp;
}

/**
 * Stamp the shape as it stands. A stamp that already matches is left alone, so re-running never
 * moves the counter. A stamp that parses but no longer matches is rewritten with the new hash and
 * its version plus one. A stamp that does not parse is refused rather than rewritten, since its
 * version is unknown and starting again would reset the counter. A missing stamp is refused too,
 * unless `init`, which writes version 1 and is refused when a stamp exists.
 */
export function stampSchema(
  path: string = SCHEMA_STAMP_PATH,
  actual: string = currentSchemaHash(),
  { init = false } = {},
): SchemaStampResult {
  const exists = existsSync(path);
  if (init && exists) {
    throw new RefusalError(`schema stamp: ${path} already exists, so --init would reset its counter; nothing stamped.`);
  }
  let next: SchemaStamp;
  if (!exists) {
    if (!init) {
      throw new RefusalError(
        `schema stamp: ${path} does not exist; nothing stamped. Restore it from git, or pass --init ` +
          'only when the API is stamped for the first time.',
      );
    }
    next = { version: 1, sha256: actual };
  } else {
    const parsed = parseSchemaStamp(readFileSync(path, 'utf-8'));
    if ('problem' in parsed) {
      throw new RefusalError(
        `schema stamp: ${path} ${parsed.problem}; nothing stamped, since its version is unknown. ` +
          "After a merge conflict, keep main's side whole, then run this again: the merged shape differs " +
          "from main's, so it bumps past it.",
      );
    }
    if (parsed.stamp.sha256 === actual) return { path, changed: false, stamp: parsed.stamp };
    next = { version: parsed.stamp.version + 1, sha256: actual };
  }
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  return { path, changed: true, stamp: next };
}

/** One line for the CLI to print after `stampSchema`. */
export function describeSchemaStamp(result: SchemaStampResult): string {
  return result.changed
    ? `stamped the agent API's shape: ${result.path} now records schema version ${result.stamp.version}`
    : `the schema stamp already matches the agent API's shape (schema version ${result.stamp.version}); left unchanged`;
}
