/**
 * package-manager.test.ts — one exact pnpm, pinned per lockfile, and CI reads it.
 *
 * A floating pnpm 9.x rewrote hundreds of unrelated lockfile lines on a
 * two-dependency change, which buries the one transitive change a reviewer needs
 * to see while every workflow installs with `--frozen-lockfile`. So every
 * package that keeps a pnpm lockfile names an exact pnpm in `packageManager`,
 * every `pnpm/action-setup` step reads that field rather than carrying a
 * `version:` of its own, and the pins agree, so a bump is one decision that
 * cannot land in one package and not the other.
 *
 * The action already fails a job whose `version:` disagrees with the field, or
 * that has neither. What it cannot see is a range in the field, two packages on
 * different pnpms, or a step reading the wrong package's pin. Those are what
 * this checks. `docs.yml` has no pull_request trigger, so this test is the only
 * pre-merge look at its pnpm step, which is why the last case requires every
 * pnpm workflow to be in `test.yml`'s path filters.
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

/** The one install form whose package a check can read off the command. */
const INSTALL = /pnpm --dir (\S+) install/g;

const listed = new Map<string, string[]>();

/**
 * Files git would publish under these pathspecs: tracked, or untracked and not
 * ignored, so a workflow or lockfile not yet added is checked before it is
 * committed rather than first in CI. Memoised; computed inside a test, never
 * while the file is collected.
 */
function published(...pathspecs: string[]): string[] {
  const key = pathspecs.join('\0');
  let files = listed.get(key);
  if (!files) {
    const out = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...pathspecs],
      { cwd: REPO_ROOT, encoding: 'utf-8' },
    );
    files = [...new Set(out.split('\0'))].filter((f) => f && existsSync(join(REPO_ROOT, f)));
    listed.set(key, files);
  }
  return files;
}

const lockfiles = () => published('*pnpm-lock.yaml');

/** The package.json beside each lockfile, with its `packageManager` field. */
function pins(): Array<{ pkg: string; pin: unknown }> {
  return lockfiles().map((lock) => {
    const pkg = join(dirname(lock), 'package.json');
    const pin = existsSync(join(REPO_ROOT, pkg))
      ? JSON.parse(readFileSync(join(REPO_ROOT, pkg), 'utf-8')).packageManager
      : undefined;
    return { pkg, pin };
  });
}

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface Job {
  file: string;
  where: string;
  steps: Step[];
}

let jobsCache: Job[] | undefined;

/** Every job in every workflow, `.yml` or `.yaml`, with its steps. */
function jobs(): Job[] {
  jobsCache ??= published('.github/workflows/*.yml', '.github/workflows/*.yaml').flatMap((file) => {
    const workflow = parse(readFileSync(join(REPO_ROOT, file), 'utf-8')) as {
      jobs?: Record<string, { steps?: Step[] }>;
    };
    return Object.entries(workflow.jobs ?? {}).map(([name, job]) => ({
      file,
      where: `${file} › ${name}`,
      steps: job.steps ?? [],
    }));
  });
  return jobsCache;
}

const isSetup = (s: Step) => typeof s.uses === 'string' && s.uses.startsWith('pnpm/action-setup@');
const setupJobs = () => jobs().filter((j) => j.steps.some(isSetup));

describe('pnpm is pinned once, and every workflow reads the pin', () => {
  it('finds the lockfiles and the setup steps it reasons about', () => {
    // Inert if either list came back empty, and passing silently would be worse.
    expect(lockfiles().length).toBeGreaterThan(0);
    expect(setupJobs().length).toBeGreaterThan(0);
  });

  it('every package with a pnpm lockfile names an exact pnpm in packageManager', () => {
    const unpinned = pins()
      .filter(({ pin }) => typeof pin !== 'string' || !EXACT_PNPM.test(pin))
      .map(({ pkg }) => pkg);
    expect(unpinned).toEqual([]);
  });

  it('every package pins the same pnpm', () => {
    expect(new Set(pins().map(({ pin }) => pin)).size).toBe(1);
  });

  it('no setup step carries its own version', () => {
    const own = setupJobs()
      .filter((j) => j.steps.some((s) => isSetup(s) && s.with?.version !== undefined))
      .map((j) => j.where);
    expect(own).toEqual([]);
  });

  it('each setup step reads the pin of the package its job installs', () => {
    const wrong: string[] = [];
    for (const job of setupJobs()) {
      const installed = [
        ...new Set(job.steps.flatMap((s) => [...(s.run ?? '').matchAll(INSTALL)].map((m) => m[1]))),
      ];
      // Fail closed: a job that installs some other way has no package this
      // check can compare against, and an empty list would otherwise pass.
      if (installed.length === 0) {
        wrong.push(`${job.where}: no "pnpm --dir <package> install" step, so its pin cannot be checked`);
      }
      for (const setup of job.steps.filter(isSetup)) {
        const pinFile = setup.with?.package_json_file;
        if (typeof pinFile !== 'string' || !existsSync(join(REPO_ROOT, pinFile))) {
          wrong.push(`${job.where}: package_json_file is ${String(pinFile)}`);
          continue;
        }
        for (const dir of installed) {
          if (dirname(pinFile) !== dir) wrong.push(`${job.where}: reads ${pinFile}, installs ${dir}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("every workflow that sets up pnpm is in test.yml's path filters, so this test runs on its edits", () => {
    const testYml = parse(readFileSync(join(REPO_ROOT, '.github/workflows/test.yml'), 'utf-8')) as {
      on: Record<string, { paths?: string[] } | null>;
    };
    const missing: string[] = [];
    for (const trigger of ['pull_request', 'push']) {
      const paths = testYml.on[trigger]?.paths ?? [];
      for (const file of new Set(setupJobs().map((j) => j.file))) {
        if (!paths.includes(file) && !paths.includes('.github/workflows/**')) {
          missing.push(`${trigger}: ${file}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
