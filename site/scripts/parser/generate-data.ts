/**
 * generate-data.ts — build-time CLI entrypoint (`pnpm parse`).
 *
 * Composes buildPapersModel + computeCounts, validates the outputs, and
 * writes papers.json and counts.json to site/src/content/data/.
 *
 * DESIGN: the testable core (generateData) is a pure-ish function that
 * returns data and throws on failure — it never writes to the real output
 * directory unless explicitly passed that path, and it never calls
 * process.exit. CLI side-effects (file writes to the canonical dir,
 * console output, exit code) are guarded behind the isMain check so that
 * importing this module in tests is side-effect-free.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPapersModel } from './papers.js';
import { computeCounts } from './counts.js';
import { PapersDataSchema, CountsSchema, type Counts } from './types.js';

// ---------------------------------------------------------------------------
// Default output directory
// ---------------------------------------------------------------------------

/**
 * Absolute path to site/src/content/data/, resolved from this module's
 * location. The two `..` ascend parser/ → scripts/ → site/, then descend
 * into src/content/data/.
 */
export const DEFAULT_OUT_DIR: string = fileURLToPath(
  new URL('../../src/content/data/', import.meta.url),
);

// ---------------------------------------------------------------------------
// Testable core
// ---------------------------------------------------------------------------

/**
 * Generate papers.json and counts.json in `outDir`.
 *
 * - Calls buildPapersModel() and computeCounts() (each validates internally).
 * - Re-validates with PapersDataSchema and CountsSchema before writing
 *   (belt-and-suspenders: the schemas are cheap and catch any drift).
 * - Creates outDir if it doesn't exist.
 * - Writes pretty-printed (2-space) JSON for both artifacts.
 * - Returns { counts, papersRefs } — does NOT write to the canonical
 *   src/content/data/ unless outDir defaults to DEFAULT_OUT_DIR.
 * - Throws on any error (schema violation, FS error); never calls process.exit.
 *
 * @param outDir  Directory to write into. Defaults to DEFAULT_OUT_DIR.
 */
export function generateData(
  outDir: string = DEFAULT_OUT_DIR,
): { counts: Counts; papersRefs: number } {
  // Build and validate the papers model.
  const model = buildPapersModel();

  // Compute and validate the aggregate counts.
  const counts = computeCounts(model);

  // Belt-and-suspenders: re-validate both before writing.
  PapersDataSchema.parse(model);
  CountsSchema.parse(counts);

  // Ensure the output directory exists.
  mkdirSync(outDir, { recursive: true });

  // Write papers.json.
  writeFileSync(
    join(outDir, 'papers.json'),
    JSON.stringify(model, null, 2) + '\n',
    'utf-8',
  );

  // Write counts.json.
  writeFileSync(
    join(outDir, 'counts.json'),
    JSON.stringify(counts, null, 2) + '\n',
    'utf-8',
  );

  return { counts, papersRefs: model.references.length };
}

// ---------------------------------------------------------------------------
// CLI entrypoint — guarded so tests never trigger side effects
// ---------------------------------------------------------------------------

const isMain =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
  try {
    const { counts, papersRefs } = generateData();
    // eslint-disable-next-line no-console
    console.log(
      `parse: wrote papers.json (${papersRefs} references) and counts.json`,
    );
    // eslint-disable-next-line no-console
    console.log('counts:', counts);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      'parse: FAILED —',
      err instanceof Error ? err.message : String(err),
    );
    process.exitCode = 1;
  }
}
