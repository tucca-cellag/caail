/**
 * regenerate.ts — the shared tail of db:add and db:remove. After either CLI has mutated
 * the DB, this runs the integrity checks, then writes the canonical Markdown, then exports
 * the NDJSON. Emit runs before export because it computes every file, and throws on a bad
 * state, before writing any, so a failure leaves the Markdown and the NDJSON untouched.
 */

import { exportNdjson, NDJSON_DIR, REPO_ROOT, type Db } from './lib.js';
import { runChecks } from './check.js';
import { emitAll } from './emit-files.js';

/**
 * Where the tail reads and writes. `ndjsonDir` is the NDJSON it exports to; `root` is the
 * repo the checks read and the Markdown is written into. Both default to the repo, and are
 * injectable so a test can point them at fixture copies.
 */
export interface RegeneratePaths {
  ndjsonDir?: string;
  root?: string;
}

/**
 * Check `db`, then regenerate from it. Returns the canonical files written. Throws, writing
 * nothing, when a check fails; `failure` opens the message, e.g.
 * "db:remove: integrity check failed after removing sw:x".
 */
export function checkAndRegenerate(db: Db, failure: string, paths: RegeneratePaths = {}): string[] {
  const ndjsonDir = paths.ndjsonDir ?? NDJSON_DIR;
  const root = paths.root ?? REPO_ROOT;

  const bad = runChecks(db, root).filter((r) => !r.ok);
  if (bad.length) {
    throw new Error(`${failure} — nothing written:\n${bad.map((r) => `  ✗ ${r.label}: ${r.detail}`).join('\n')}`);
  }
  const written = emitAll(db, root);
  exportNdjson(db, ndjsonDir);
  return written;
}
