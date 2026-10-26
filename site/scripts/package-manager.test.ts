/**
 * package-manager.test.ts — one exact pnpm per lockfile, and CI reads it.
 *
 * A floating pnpm 9.x rewrote hundreds of unrelated lockfile lines on a
 * two-dependency change, which buries the one transitive change a reviewer needs
 * to see while every workflow installs with `--frozen-lockfile`. So every
 * package that keeps a pnpm lockfile names an exact pnpm in `packageManager`,
 * and every `pnpm/action-setup` step reads that field rather than carrying a
 * `version:` of its own.
 *
 * The action already fails a job whose `version:` disagrees with the field, or
 * that has neither. What it cannot see is a range in the field, a step reading
 * the wrong package's pin, or a lockfile whose package names no pnpm at all.
 * Those are what this checks.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** `pnpm@<major>.<minor>.<patch>`, with corepack's optional `+sha…` integrity suffix. */
const EXACT_PNPM = /^pnpm@\d+\.\d+\.\d+(\+sha\d+\.[0-9a-f]+)?$/;

function tracked(pathspec: string): string[] {
  return execFileSync('git', ['ls-files', '-z', '--', pathspec], { cwd: REPO_ROOT, encoding: 'utf-8' })
    .split('\0')
    .filter(Boolean);
}

function packageManagerOf(packageJson: string): unknown {
  return JSON.parse(readFileSync(join(REPO_ROOT, packageJson), 'utf-8')).packageManager;
}

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

/** Every job in every workflow, with its steps. */
function jobs(): Array<{ where: string; steps: Step[] }> {
  return tracked('.github/workflows/*.yml').flatMap((file) => {
    const workflow = parse(readFileSync(join(REPO_ROOT, file), 'utf-8')) as {
      jobs?: Record<string, { steps?: Step[] }>;
    };
    return Object.entries(workflow.jobs ?? {}).map(([name, job]) => ({
      where: `${file} › ${name}`,
      steps: job.steps ?? [],
    }));
  });
}

const isSetup = (s: Step) => typeof s.uses === 'string' && s.uses.startsWith('pnpm/action-setup@');

describe('pnpm is pinned once per lockfile', () => {
  it('finds the lockfiles and the setup steps it reasons about', () => {
    // Inert if either list came back empty, and passing silently would be worse.
    expect(tracked('*pnpm-lock.yaml').length).toBeGreaterThan(0);
    expect(jobs().filter((j) => j.steps.some(isSetup)).length).toBeGreaterThan(0);
  });

  it('every package with a pnpm lockfile names an exact pnpm in packageManager', () => {
    const unpinned = tracked('*pnpm-lock.yaml')
      .map((lock) => join(dirname(lock), 'package.json'))
      .filter((pkg) => {
        const pin = existsSync(join(REPO_ROOT, pkg)) ? packageManagerOf(pkg) : undefined;
        return typeof pin !== 'string' || !EXACT_PNPM.test(pin);
      });
    expect(unpinned).toEqual([]);
  });

  it('no setup step carries its own version', () => {
    const own = jobs()
      .filter((j) => j.steps.some((s) => isSetup(s) && s.with?.version !== undefined))
      .map((j) => j.where);
    expect(own).toEqual([]);
  });

  it("each setup step reads the pin of the package its job installs", () => {
    const wrong: string[] = [];
    for (const job of jobs()) {
      const setup = job.steps.find(isSetup);
      if (!setup) continue;
      const pinFile = setup.with?.package_json_file;
      if (typeof pinFile !== 'string' || !existsSync(join(REPO_ROOT, pinFile))) {
        wrong.push(`${job.where}: package_json_file is ${String(pinFile)}`);
        continue;
      }
      const installed = job.steps
        .flatMap((s) => [...(s.run ?? '').matchAll(/pnpm --dir (\S+) install/g)].map((m) => m[1]))
        .filter((dir, i, all) => all.indexOf(dir) === i);
      for (const dir of installed) {
        if (dirname(pinFile) !== dir) wrong.push(`${job.where}: reads ${pinFile}, installs ${dir}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
