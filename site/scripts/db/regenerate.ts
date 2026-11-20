/**
 * regenerate.ts: the shared tail of db:add and db:remove. After either CLI has mutated the
 * DB, this runs the integrity checks, then writes the canonical Markdown, then exports the
 * NDJSON and stamps it. A failed check writes nothing, and so does a failed emit, since `emitAll` computes
 * every file, throwing on a bad state, before it writes any. The export is not atomic with
 * the emit, though: if writing the NDJSON fails after the Markdown is written, the Markdown
 * is ahead of the NDJSON until the command runs again cleanly, and `lint-papers.yml`'s sync
 * guard reports the mismatch in the meantime. Nor is the stamp atomic with either: if it cannot be
 * written, the Markdown and the NDJSON already are, and the refusal says so and names `db:stamp`,
 * since `db:check` and `pnpm parse` refuse the stale stamp until it runs.
 */

import { exportNdjson, NDJSON_DIR, RefusalError, type Db } from './lib.js';
import { runChecks } from './check.js';
import { stampAfterWriting } from './corpus-stamp.js';
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
 * Check `db`, then regenerate from it, then stamp the exported NDJSON (corpus-stamp.ts), so the
 * tree is ready to commit with the stamp dating it. Returns the canonical files written. Throws,
 * writing nothing, when a check fails; `failure` opens the message, e.g.
 * "db:remove: integrity check failed after removing sw:x".
 */
export function checkAndRegenerate(db: Db, failure: string, paths: RegeneratePaths = {}): string[] {
  const bad = runChecks(db, paths.root).filter((r) => !r.ok);
  if (bad.length) {
    throw new RefusalError(`${failure} — nothing written:\n${bad.map((r) => `  ✗ ${r.label}: ${r.detail}`).join('\n')}`);
  }
  const written = emitAll(db, paths.root);
  const ndjsonDir = paths.ndjsonDir ?? NDJSON_DIR;
  exportNdjson(db, ndjsonDir);
  stampAfterWriting(ndjsonDir, `The canonical Markdown (${written.length} files) and the NDJSON were written`);
  return written;
}
