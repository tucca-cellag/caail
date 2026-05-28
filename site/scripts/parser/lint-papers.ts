/**
 * lint-papers.ts — build-time lint CLI entrypoint (`pnpm lint:papers`).
 *
 * Composes buildPapersModel + lint, formats a human-readable report, and
 * exits 1 on hard errors (exit 0 on warnings-only or clean).
 *
 * DESIGN: the testable core (runLint) is a pure function that takes a
 * PapersData model and returns { errors, warnings, report, exitCode }. It
 * never reads files or calls process.exit. CLI side-effects (model loading
 * from disk, console output, exit code) are guarded behind the isMain check
 * so that importing this module in tests is side-effect-free.
 */

import { pathToFileURL } from 'node:url';

import { buildPapersModel } from './papers.js';
import { lint } from './lint.js';
import type { PapersData } from './types.js';

// ---------------------------------------------------------------------------
// Testable core
// ---------------------------------------------------------------------------

export interface LintRunResult {
  errors: string[];
  warnings: string[];
  /** Human-readable multi-line report string */
  report: string;
  /** 1 if errors.length > 0, else 0 */
  exitCode: 0 | 1;
}

/**
 * Run the full lint suite on a PapersData model and return a structured result.
 *
 * Never reads files; never calls process.exit; never writes to console.
 * Suitable for direct use in tests.
 *
 * @param model  A fully-built PapersData object (from buildPapersModel or synthetic).
 */
export function runLint(model: PapersData): LintRunResult {
  const { errors, warnings } = lint(model);

  const lines: string[] = [];

  // Header
  lines.push('lint:papers — matrix ↔ reference integrity check');
  lines.push('─'.repeat(50));

  // Errors
  if (errors.length > 0) {
    for (const msg of errors) {
      lines.push(`ERROR: ${msg}`);
    }
  }

  // Warnings
  if (warnings.length > 0) {
    for (const msg of warnings) {
      lines.push(`warn:  ${msg}`);
    }
  }

  lines.push('─'.repeat(50));

  // Summary / clean-state indicator
  if (errors.length === 0) {
    lines.push(`✓ matrix–reference integrity OK`);
  }
  lines.push(
    `${errors.length} error(s), ${warnings.length} warning(s)`,
  );

  const report = lines.join('\n');
  const exitCode: 0 | 1 = errors.length > 0 ? 1 : 0;

  return { errors, warnings, report, exitCode };
}

// ---------------------------------------------------------------------------
// CLI entrypoint — guarded so tests never trigger side effects
// ---------------------------------------------------------------------------

const isMain =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
  try {
    const model = buildPapersModel();
    const r = runLint(model);
    // eslint-disable-next-line no-console
    console.log(r.report);
    process.exitCode = r.exitCode;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      'lint:papers: FAILED —',
      err instanceof Error ? err.message : String(err),
    );
    process.exitCode = 1;
  }
}
