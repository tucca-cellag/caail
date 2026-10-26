/**
 * package-manager.test.ts — one exact pnpm, pinned per lockfile, and CI reads it.
 *
 * A floating pnpm 9.x rewrote hundreds of unrelated lockfile lines on a
 * two-dependency change, which buries the one transitive change a reviewer needs
 * to see while every workflow installs with `--frozen-lockfile`. So every
 * package that keeps a pnpm lockfile names an exact pnpm in `packageManager`,
 * the pins agree, so a bump is one decision that cannot land in one package
 * and not the other, and every `pnpm/action-setup` step reads a pin rather
 * than carrying a `version:` of its own.
 *
 * WHAT ENFORCES WHAT. At run time the action fails a job whose `version:`
 * disagrees with the pin it reads, or that finds no pin, and because the pins
 * agree, which package a step reads cannot change the pnpm it installs. This
 * test adds what the action cannot see (a range in the field, two packages on
 * different pnpms) and an earlier look at the workflow side: it runs wherever
 * `test.yml` runs, which is not on a workflow-only edit, deliberately, since
 * `guards.yml` records why workflow paths do not buy a full build.
 *
 * THE PIN GOVERNS CI, NOT EVERY LOCAL RUN. Corepack and pnpm look for
 * `packageManager` from the working directory upward and ignore `--dir`, so the
 * documented `pnpm --dir site …` from the repo root does not see it. That gap
 * is tucca-cellag/caail-planning#689.
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

const listed = new Map<string, string[]>();

/**
 * Files git would publish under these pathspecs: tracked, or untracked and not
 * ignored, so a workflow or lockfile not yet added is checked before it is
 * committed rather than first in CI. Memoised, and computed inside a test, so
 * a missing work tree fails the tests that need one rather than collection.
 */
function published(...pathspecs: string[]): string[] {
  const key = pathspecs.join('\0');
  let files = listed.get(key);
  if (!files) {
    let out: string;
    try {
      out = execFileSync(
        'git',
        ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...pathspecs],
        { cwd: REPO_ROOT, encoding: 'utf-8' },
      );
    } catch (err) {
      throw new Error(
        `the pnpm pin check asks git for the lockfiles and workflows and needs a git work tree at ${REPO_ROOT}: ${String(err)}`,
      );
    }
    files = [...new Set(out.split('\0'))].filter((f) => f && existsSync(join(REPO_ROOT, f)));
    listed.set(key, files);
  }
  return files;
}

/** The `packageManager` field of a repo-relative package.json, if it has one. */
function pinOf(pkg: string): unknown {
  const path = join(REPO_ROOT, pkg);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')).packageManager : undefined;
}

/** The package.json beside each pnpm lockfile, with its pin. */
const pins = () =>
  published('*pnpm-lock.yaml').map((lock) => {
    const pkg = join(dirname(lock), 'package.json');
    return { pkg, pin: pinOf(pkg) };
  });

interface Step {
  uses?: string;
  with?: Record<string, unknown>;
}

let setupsCache: Array<{ where: string; step: Step }> | undefined;

/** Every `pnpm/action-setup` step in every workflow, `.yml` or `.yaml`. */
function setups(): Array<{ where: string; step: Step }> {
  setupsCache ??= published('.github/workflows/*.yml', '.github/workflows/*.yaml').flatMap((file) => {
    const workflow = parse(readFileSync(join(REPO_ROOT, file), 'utf-8')) as {
      jobs?: Record<string, { steps?: Step[] }>;
    };
    return Object.entries(workflow.jobs ?? {}).flatMap(([name, job]) =>
      (job.steps ?? [])
        .filter((s) => typeof s.uses === 'string' && s.uses.startsWith('pnpm/action-setup@'))
        .map((step) => ({ where: `${file} › ${name}`, step })),
    );
  });
  return setupsCache;
}

describe('pnpm is pinned once, and every workflow reads the pin', () => {
  it('finds the lockfiles and the setup steps it reasons about', () => {
    // Inert if either list came back empty, and passing silently would be worse.
    expect(pins().length).toBeGreaterThan(0);
    expect(setups().length).toBeGreaterThan(0);
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
    expect(setups().filter(({ step }) => step.with?.version !== undefined).map(({ where }) => where)).toEqual(
      [],
    );
  });

  it('every setup step reads a package.json that carries the shared pin', () => {
    const shared = pins()[0]?.pin;
    const wrong = setups()
      .filter(({ step }) => {
        const file = step.with?.package_json_file;
        return typeof file !== 'string' || pinOf(file) !== shared;
      })
      .map(({ where, step }) => `${where}: package_json_file is ${String(step.with?.package_json_file)}`);
    expect(wrong).toEqual([]);
  });
});
