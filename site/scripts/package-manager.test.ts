/**
 * package-manager.test.ts: one exact pnpm, pinned per lockfile, and CI reads it.
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
 * agree, which package a step reads cannot change the pnpm it installs. The
 * action cannot see a range in the field, a `devEngines.packageManager` it
 * would read first, two packages on different pnpms, a job that runs pnpm with
 * no setup step, or one that fetches another pnpm (`npm i -g pnpm`,
 * `npx pnpm@…`, corepack, `pnpm self-update`); `pinProblems` checks those. It runs wherever `test.yml`
 * runs, which is not on a workflow-only edit, deliberately: `guards.yml`
 * records why workflow paths do not buy a full build.
 *
 * THE PIN GOVERNS CI, NOT LOCAL RUNS. Corepack looks for `packageManager` from
 * the working directory upward and ignores `--dir`, so the documented
 * `pnpm --dir site …` from the repo root does not see it. And pnpm 9 run
 * without corepack ignores it even inside `site/`: pnpm 9.15.9 run directly in
 * a package pinned to 9.15.8 used itself, with no warning. Later majors were
 * not measured. Both gaps are tucca-cellag/caail-planning#689.
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

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface Job {
  where: string;
  steps: Step[];
}

type Manifest = Record<string, unknown>;

/** What the check reads, as data, so a test can hand it a broken one. */
interface Repo {
  /** The package.json beside each pnpm lockfile, repo-relative. */
  lockPackages: string[];
  /** Parsed manifests by path: those packages, and every file a setup step names. */
  manifests: Record<string, Manifest | undefined>;
  jobs: Job[];
}

/** The pnpm a pin installs. The action and corepack both drop a `+sha…` suffix. */
const versionOf = (pin: unknown) => (typeof pin === 'string' ? pin.split('+')[0] : undefined);
const isSetup = (s: Step) => typeof s.uses === 'string' && s.uses.startsWith('pnpm/action-setup@');
const runsPnpm = (s: Step) => /(^|[^\w/.-])pnpm(\s|@|$)/m.test(s.run ?? '');
/** The common ways a step fetches a pnpm other than the one the setup step installed. */
const OTHER_PNPM = /\bnpm\s+(i|install|add)\b[^\n]*\bpnpm\b|\bnpx\s+pnpm@|\bcorepack\b|\bpnpm\s+self-update\b|@pnpm\/exe\b/;

/** Every way the pinning is broken, one readable line each; empty when it holds. */
function pinProblems(repo: Repo): string[] {
  const problems: string[] = [];
  const pinOf = (pkg: string) => repo.manifests[pkg]?.packageManager;

  for (const pkg of repo.lockPackages) {
    const pin = pinOf(pkg);
    if (typeof pin !== 'string' || !EXACT_PNPM.test(pin)) {
      problems.push(`${pkg}: packageManager is ${JSON.stringify(pin)}, not an exact pnpm`);
    }
  }
  // Every manifest the check reads, not only the lockfile packages: a setup step
  // can name any package.json, and the action reads devEngines there first too.
  for (const [pkg, manifest] of Object.entries(repo.manifests)) {
    const devEngines = manifest?.devEngines as { packageManager?: unknown } | undefined;
    if (devEngines?.packageManager !== undefined) {
      problems.push(`${pkg}: devEngines.packageManager is set, and pnpm/action-setup reads it before packageManager`);
    }
  }

  const versions = [...new Set(repo.lockPackages.map((pkg) => versionOf(pinOf(pkg))))];
  if (versions.length > 1) problems.push(`the packages pin different pnpms: ${versions.join(', ')}`);
  // One version can still carry two integrity hashes, and at most one is right.
  const hashes = new Set(
    repo.lockPackages.map((pkg) => pinOf(pkg)).flatMap((pin) => (typeof pin === 'string' ? pin.split('+').slice(1) : [])),
  );
  if (hashes.size > 1) problems.push(`the packages pin ${versions[0]} with ${hashes.size} different integrity hashes`);
  const shared = versions.length === 1 ? versions[0] : undefined;

  for (const job of repo.jobs) {
    for (const step of job.steps) {
      const other = (step.run ?? '').match(OTHER_PNPM);
      if (other) problems.push(`${job.where}: fetches another pnpm (${other[0]}), which bypasses the pin`);
    }
    const setups = job.steps.filter(isSetup);
    if (setups.length === 0 && job.steps.some(runsPnpm)) {
      problems.push(`${job.where}: runs pnpm without a pnpm/action-setup step, so its pnpm is not the pin`);
    }
    for (const step of setups) {
      if (step.with?.version !== undefined) {
        problems.push(`${job.where}: setup step carries version ${String(step.with.version)}`);
      }
      const file = step.with?.package_json_file;
      if (typeof file !== 'string' || shared === undefined || versionOf(pinOf(file)) !== shared) {
        problems.push(`${job.where}: package_json_file ${String(file)} does not carry the shared pin`);
      }
    }
  }
  return problems;
}

/** Files git would publish: tracked, or untracked and not ignored, so new ones count before commit. */
function published(...pathspecs: string[]): string[] {
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
  return [...new Set(out.split('\0'))].filter((f) => f && existsSync(join(REPO_ROOT, f)));
}

/** A manifest by repo-relative path; package_json_file may also name a package.yaml. */
function manifestAt(path: string): Manifest | undefined {
  const full = join(REPO_ROOT, path);
  if (!existsSync(full)) return undefined;
  const text = readFileSync(full, 'utf-8');
  try {
    return (/\.ya?ml$/.test(path) ? parse(text) : JSON.parse(text)) as Manifest;
  } catch (err) {
    throw new Error(`could not parse ${path}, which the pnpm pin check reads: ${String(err)}`);
  }
}

let repoCache: Repo | undefined;

/** The repository as `pinProblems` reads it. Built on first use inside a test, never at collection. */
function theRepo(): Repo {
  if (repoCache) return repoCache;
  const lockPackages = published('*pnpm-lock.yaml')
    .filter((f) => f.split('/').pop() === 'pnpm-lock.yaml')
    .map((lock) => join(dirname(lock), 'package.json'));
  const jobs = published('.github/workflows/*.yml', '.github/workflows/*.yaml').flatMap((file) => {
    const workflow = parse(readFileSync(join(REPO_ROOT, file), 'utf-8')) as {
      jobs?: Record<string, { steps?: Step[] }>;
    };
    return Object.entries(workflow.jobs ?? {}).map(([name, job]) => ({
      where: `${file} › ${name}`,
      steps: job.steps ?? [],
    }));
  });
  const named = jobs
    .flatMap((j) => j.steps.filter(isSetup).map((s) => s.with?.package_json_file))
    .filter((f): f is string => typeof f === 'string');
  const manifests = Object.fromEntries([...new Set([...lockPackages, ...named])].map((f) => [f, manifestAt(f)]));
  repoCache = { lockPackages, manifests, jobs };
  return repoCache;
}

const PIN = 'pnpm@9.15.9';

/** Two pinned packages and one job that reads a pin and installs: the shape that holds. */
function fixture(): Repo {
  return {
    lockPackages: ['a/package.json', 'b/package.json'],
    manifests: { 'a/package.json': { packageManager: PIN }, 'b/package.json': { packageManager: PIN } },
    jobs: [
      {
        where: 'ci.yml › build',
        steps: [
          { uses: 'pnpm/action-setup@v6', with: { package_json_file: 'a/package.json' } },
          { run: 'pnpm --dir a install --frozen-lockfile' },
        ],
      },
    ],
  };
}

/** The one problem a single defect should produce, matched on its distinctive words. */
function onlyProblem(repo: Repo): string {
  const problems = pinProblems(repo);
  expect(problems, problems.join('\n')).toHaveLength(1);
  return problems[0];
}

describe('pinProblems accepts what holds', () => {
  it('a repo whose packages share an exact pin, read by every setup step', () => {
    expect(pinProblems(fixture())).toEqual([]);
  });

  it('an integrity suffix on one pin, which installs the same pnpm', () => {
    const repo = fixture();
    repo.manifests['b/package.json'] = { packageManager: `${PIN}+sha512.0123abcd` };
    expect(pinProblems(repo)).toEqual([]);
  });

  it("a step reading the other package's pin, which is the same pnpm", () => {
    const repo = fixture();
    repo.jobs[0].steps[0].with = { package_json_file: 'b/package.json' };
    expect(pinProblems(repo)).toEqual([]);
  });
});

describe('pinProblems rejects each way the pin can be lost', () => {
  it('a range instead of an exact version', () => {
    const repo = fixture();
    repo.manifests['a/package.json'] = { packageManager: 'pnpm@9' };
    // The range is also a different "version" from b's, and the step reads a.
    expect(pinProblems(repo).some((p) => p.includes('not an exact pnpm'))).toBe(true);
  });

  it('a package with no pin', () => {
    const repo = fixture();
    repo.manifests['b/package.json'] = {};
    expect(pinProblems(repo).some((p) => p.includes('b/package.json: packageManager is undefined'))).toBe(true);
  });

  it('two packages on different pnpms', () => {
    const repo = fixture();
    repo.manifests['b/package.json'] = { packageManager: 'pnpm@9.15.8' };
    expect(pinProblems(repo).some((p) => p.includes('pin different pnpms'))).toBe(true);
  });

  it('a devEngines.packageManager the action would read first', () => {
    const repo = fixture();
    repo.manifests['a/package.json'] = {
      packageManager: PIN,
      devEngines: { packageManager: { name: 'pnpm', version: '^9' } },
    };
    expect(onlyProblem(repo)).toContain('devEngines.packageManager');
  });

  it('a setup step carrying its own version', () => {
    const repo = fixture();
    repo.jobs[0].steps[0].with = { package_json_file: 'a/package.json', version: 9 };
    expect(onlyProblem(repo)).toContain('carries version 9');
  });

  it('a setup step naming a file that does not carry the pin', () => {
    const repo = fixture();
    repo.jobs[0].steps[0].with = { package_json_file: 'a/package.jsn' };
    expect(onlyProblem(repo)).toContain('a/package.jsn does not carry the shared pin');
  });

  it('a job that runs pnpm without a setup step', () => {
    const repo = fixture();
    repo.jobs.push({ where: 'ci.yml › release', steps: [{ run: 'pnpm --dir a publish' }] });
    expect(onlyProblem(repo)).toContain('ci.yml › release: runs pnpm without a pnpm/action-setup step');
  });

  it('pnpm reached through npx, which the whitespace form would miss', () => {
    const repo = fixture();
    repo.jobs.push({ where: 'ci.yml › release', steps: [{ run: 'npx pnpm@8.15.0 install --frozen-lockfile' }] });
    const problems = pinProblems(repo);
    expect(problems.some((p) => p.includes('runs pnpm without a pnpm/action-setup step'))).toBe(true);
    expect(problems.some((p) => p.includes('fetches another pnpm (npx pnpm@)'))).toBe(true);
  });

  it('another pnpm fetched inside a job that does have a setup step', () => {
    const repo = fixture();
    repo.jobs[0].steps.push({ run: 'npm i -g pnpm@10' });
    expect(onlyProblem(repo)).toContain('ci.yml › build: fetches another pnpm');
  });

  it('a devEngines.packageManager on a manifest a step names, not only a lockfile package', () => {
    const repo = fixture();
    repo.manifests['package.json'] = {
      packageManager: PIN,
      devEngines: { packageManager: { name: 'pnpm', version: '^10' } },
    };
    repo.jobs[0].steps[0].with = { package_json_file: 'package.json' };
    expect(onlyProblem(repo)).toContain('package.json: devEngines.packageManager is set');
  });

  it('one version pinned with two different integrity hashes', () => {
    const repo = fixture();
    repo.manifests['a/package.json'] = { packageManager: `${PIN}+sha512.aaaa` };
    repo.manifests['b/package.json'] = { packageManager: `${PIN}+sha512.bbbb` };
    expect(onlyProblem(repo)).toContain('2 different integrity hashes');
  });
});

describe('the repository', () => {
  it('has lockfiles and setup steps to check, so an empty pass means nothing', () => {
    const repo = theRepo();
    expect(repo.lockPackages.length).toBeGreaterThan(0);
    expect(repo.jobs.some((j) => j.steps.some(isSetup))).toBe(true);
  });

  it('holds its pnpm pin', () => {
    expect(pinProblems(theRepo())).toEqual([]);
  });
});
