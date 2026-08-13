/**
 * Preflight checks that run before the Playwright e2e suite, in `playwright.config.ts`.
 *
 * These guard the two ways a red e2e run has been actively misleading rather than
 * merely flaky. Both are properties of the *build artifact or the environment*, not
 * of any test, and both are deterministic within one `dist`: the suite fails
 * identically every time, which reads as a solid reproducible regression.
 * `--repeat-each` makes it look stronger rather than weaker, because repeated runs
 * against one `dist` are one observation counted N times. Both also land on the
 * search specs specifically (`explorer.spec.ts`, `privacy.spec.ts`), so any change
 * that plausibly touches search gets blamed for them.
 *
 * 1. `dist/pagefind/*` written as entirely NUL bytes. An incremental `pnpm build`
 *    intermittently produces `pagefind.js` and `pagefind-entry.json` at the correct
 *    size and completely zero-filled. Pagefind then never initialises, the search
 *    dialog stays empty, and every spec that opens search fails on a content
 *    assertion ten seconds later. `rm -rf dist && pnpm build` fixes it.
 *
 * 2. The port already held by a server this run did not start. `reuseExistingServer`
 *    is `!process.env.CI`, so a local run silently ATTACHES to whatever is listening.
 *    A hand-started `pnpm preview` outliving a `rm -rf dist` keeps serving the
 *    deleted build, and the run reports on an artifact nobody built.
 *
 * ## Why this module is imported from the config and not from `globalSetup`
 *
 * Playwright composes its startup as
 * `[removeOutputDirs, ...pluginSetup, ...globalTeardown, ...globalSetup]`, and
 * `webServer` is registered as a *plugin*. So the web server is already up by the
 * time `globalSetup` runs, and a port check there would see the port held on every
 * single run — by Playwright's own preview server. Config evaluation is the only
 * phase that is strictly earlier than the webServer plugin.
 *
 * That is also why the port probe is synchronous. Firing an async probe during
 * config evaluation and awaiting it in `globalSetup` would leave a race between the
 * probe and the server start, and a guard whose whole purpose is trustworthiness
 * cannot itself be racy.
 *
 * ## Why it must run only once per run
 *
 * Playwright re-evaluates the config in every worker process, and a worker starts
 * *after* the web server. A port check that ran there would see the port held — by
 * Playwright's own preview server — and fail every healthy run. That is the same
 * trap as the `globalSetup` one, arriving through a different door; it was observed
 * before this guard shipped, which is why `preflight` gates the port probe to the
 * runner process. The artifact check is not gated: it is idempotent, and a
 * long-lived runner re-evaluates the config after a rebuild.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The pagefind artifacts every search spec depends on, relative to `dist/`.
 *
 * **Deliberately a named list, not a walk of `dist/pagefind/`.** Scanning that
 * directory looks like the obvious generalisation, and it is wrong: a healthy build
 * of this site ships three files that are *legitimately* entirely NUL —
 * `pagefind-ui.js`, `pagefind-modular-ui.js` and `pagefind-modular-ui.css` (measured
 * on a build whose search specs pass). Starlight renders its own search UI and never
 * loads them. A wholesale scan would therefore fail every healthy run, which is worse
 * than having no guard at all.
 *
 * Extend this list only with a file whose corruption has actually been observed to
 * break search, and only after checking that a healthy build's copy is not all-NUL.
 */
export const PAGEFIND_ARTIFACTS = ['pagefind/pagefind.js', 'pagefind/pagefind-entry.json'] as const;

export type ArtifactVerdict =
  | { status: 'ok'; bytes: number }
  | { status: 'absent' }
  | { status: 'empty' }
  | { status: 'all-nul'; bytes: number };

/**
 * Classify one artifact's bytes. `null` means the file does not exist.
 *
 * The corrupt case is specifically *right size, all zeroes* — the file is neither
 * missing nor truncated, which is why nothing downstream notices until a browser
 * tries to execute it. A zero-length file is called out separately: also broken,
 * but a different failure with a different cause.
 */
export function classifyArtifact(bytes: Uint8Array | null): ArtifactVerdict {
  if (bytes === null) return { status: 'absent' };
  if (bytes.length === 0) return { status: 'empty' };
  // `.every` short-circuits, so a healthy file costs one byte comparison in practice:
  // real pagefind.js starts with source text, not a NUL.
  if (bytes.every((b) => b === 0)) return { status: 'all-nul', bytes: bytes.length };
  return { status: 'ok', bytes: bytes.length };
}

/** Read an artifact's bytes, or `null` when it does not exist. */
function readArtifact(path: string): Uint8Array | null {
  if (!existsSync(path)) return null;
  return readFileSync(path);
}

export interface PagefindProblem {
  /** Path relative to `dist/`, e.g. `pagefind/pagefind.js`. */
  relative: string;
  /**
   * Kept at this granularity because the message differs per kind, and a message
   * that describes the wrong failure is the defect this whole module is about.
   * `all-nul` is the only one the incremental-build story explains; `all-nul` and
   * `empty` are the only ones a byte-count command can confirm, since on the other
   * two it prints an error rather than the promised zero.
   */
  kind: 'all-nul' | 'empty' | 'missing' | 'unreadable';
  /** One-line description naming the file and what is wrong with it. */
  message: string;
}

/**
 * Check the pagefind artifacts under `distDir`.
 *
 * Returns one problem per broken artifact, empty when everything is fine. A `dist`
 * that does not exist at all yields no problems: that is the stale/absent-build
 * problem, which `pnpm preview` reports on its own terms, and claiming it here
 * would make this guard fire on a checkout that has simply never been built.
 *
 * The `relative` path is carried alongside the message so callers can point their
 * suggested diagnostic command at the artifact that is actually broken. Naming a
 * healthy file there would print a large byte count under a comment reading "0
 * means corrupt", contradicting the diagnosis at the moment it has to be believed.
 */
export function checkPagefindArtifacts(
  distDir: string,
  read: (path: string) => Uint8Array | null = readArtifact,
): PagefindProblem[] {
  if (!existsSync(distDir)) return [];

  const problems: PagefindProblem[] = [];
  for (const relative of PAGEFIND_ARTIFACTS) {
    const path = join(distDir, relative);

    let bytes: Uint8Array | null;
    try {
      bytes = read(path);
    } catch (error) {
      // A concurrent `pnpm build` rm -rf's dist, so the file can vanish between the
      // existence check and the read. Letting that escape would throw a raw stack out
      // of config evaluation, from a file the reader has no reason to suspect — the
      // misleading red run this module exists to prevent, produced by the guard.
      problems.push({
        relative,
        kind: 'unreadable',
        message: `dist/${relative} could not be read (${(error as Error).message})`,
      });
      continue;
    }

    const verdict = classifyArtifact(bytes);
    if (verdict.status === 'ok') continue;
    const detail =
      verdict.status === 'all-nul'
        ? `is ${verdict.bytes} bytes of NUL — the correct size, entirely zero-filled`
        : verdict.status === 'empty'
          ? 'is zero bytes'
          : 'is missing';
    const kind = verdict.status === 'absent' ? 'missing' : verdict.status;
    problems.push({ relative, kind, message: `dist/${relative} ${detail}` });
  }
  return problems;
}

/**
 * Probe a local TCP port synchronously. `true` means something is listening.
 *
 * Node has no synchronous socket API, so this spawns a short-lived child. Both
 * loopback families are tried: `astro preview` binds to `localhost`, which resolves
 * to `::1` before `127.0.0.1` on some hosts, and a probe of the wrong family would
 * report a held port as free.
 *
 * Only the explicit exit code 10 counts as held, so every other outcome — a
 * `spawnSync` timeout kill, a crash, a future Node change — reads as free and the
 * run proceeds. That direction is deliberate: this guard exists to stop a
 * misleading run, and a probe that blocked runs whenever it could not answer would
 * itself become the thing nobody trusts. It does say so out loud, though: a probe
 * that never ran and a port that is genuinely free are the same `false` to the
 * caller, and an unreported one lets the guard sit disabled while looking active.
 * That is why the child separates "every family refused" (0) from "could not tell"
 * (11) rather than mapping every non-connect to free — `EMFILE` and `ECONNREFUSED`
 * are different facts and only one of them is evidence.
 *
 * The child is given an empty `NODE_OPTIONS` because that is exactly how it stops
 * working. This repo's own `pnpm test` sets `NODE_OPTIONS='--experimental-sqlite
 * --no-warnings'`, and a Node that does not recognise a flag there refuses to start
 * at all — measured: with a real listener bound, the same call returns `true` on a
 * clean environment and `false` with a `NODE_OPTIONS` the child rejects. The probe
 * needs no runtime flags of its own.
 */
export function isPortHeld(
  port: number,
  warn: (message: string) => void = (message) => console.warn(message),
): boolean {
  // Exit codes: 10 = something is listening, 0 = nothing is (every family refused),
  // 11 = could not tell. The third exists because "refused" and "the probe could not
  // ask" are different facts, and collapsing them is how a guard sits disabled while
  // looking active. ECONNREFUSED means genuinely free; the address-family errors mean
  // this host has no such loopback, which is also not evidence of a listener, so
  // neither is treated as undetermined. Anything else (EMFILE, EACCES, a dropped SYN
  // reaching the timeout) is.
  const probe = `
    const net = require('node:net');
    const port = Number(process.argv[1]);
    const FREE = new Set(['ECONNREFUSED', 'EADDRNOTAVAIL', 'EAFNOSUPPORT', 'ENETUNREACH']);
    const hosts = ['127.0.0.1', '::1'];
    let pending = hosts.length;
    let held = false;
    let undetermined = false;
    for (const host of hosts) {
      const socket = net.connect({ port, host });
      socket.setTimeout(2000);
      const settle = (state) => {
        if (state === 'held') held = true;
        if (state === 'unknown') undetermined = true;
        socket.destroy();
        if (--pending === 0) process.exit(held ? 10 : undetermined ? 11 : 0);
      };
      socket.on('connect', () => settle('held'));
      socket.on('error', (error) => settle(FREE.has(error.code) ? 'free' : 'unknown'));
      socket.on('timeout', () => settle('unknown'));
    }
  `;
  const result = spawnSync(process.execPath, ['-e', probe, String(port)], {
    timeout: 10_000,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  if (result.status === 10) return true;
  if (result.status !== 0) {
    warn(
      [
        `e2e preflight: could not probe port ${port} (the probe exited ` +
          `${result.status === null ? 'abnormally' : String(result.status)}).`,
        'Treating the port as free, so this run is NOT protected against attaching to',
        'a server it did not start. Check that the port is yours before trusting the',
        'result.',
        ...(result.stderr ? [`Probe stderr: ${String(result.stderr).trim()}`] : []),
      ].join('\n'),
    );
  }
  return false;
}

/**
 * Best-effort description of what holds a port, for the error message only.
 *
 * `lsof` is not present everywhere and its output format is not a contract, so a
 * failure here degrades to "something", never to a wrong verdict. Nothing branches
 * on the result.
 */
export function describePortHolder(port: number): string {
  try {
    const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    const rows = (result.stdout ?? '')
      .split('\n')
      .slice(1) // drop lsof's COMMAND/PID/... header
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [command, pid] = line.split(/\s+/);
        return `${command} (pid ${pid})`;
      });
    return rows.length > 0 ? [...new Set(rows)].join(', ') : 'an unidentified process';
  } catch {
    return 'an unidentified process';
  }
}

/** Set by the runner process so its workers can tell they are not it. */
export const PREFLIGHT_DONE_ENV = 'CAAIL_E2E_PREFLIGHT_DONE';

/**
 * Set by the runner when it deliberately attached to a server it did not start, so
 * workers skip the artifact check too. Without it the runner warns and proceeds
 * while every worker independently faults the local `dist` — a build nobody is
 * serving. Workers inherit the runner's env at fork time, which is after this is set.
 */
export const PREFLIGHT_ATTACHED_ENV = 'CAAIL_E2E_ATTACHED';

/**
 * Whether this process is the one that starts the web server, rather than a worker
 * Playwright forked afterwards.
 *
 * Two independent signals, either of which is sufficient, because a false negative
 * here fails every healthy run:
 *
 *  - `TEST_WORKER_INDEX` is set by Playwright's own `workerProcessEntry`. Reliable,
 *    but it is an internal and could be renamed.
 *  - `CAAIL_E2E_PREFLIGHT_DONE` is set by us on the runner's `process.env`, which
 *    forked workers inherit. This depends only on Node's env inheritance.
 */
function isMainRunnerProcess(env: NodeJS.ProcessEnv): boolean {
  return env.TEST_WORKER_INDEX === undefined && env[PREFLIGHT_DONE_ENV] !== '1';
}

/** Whether this invocation only enumerates tests rather than running any. */
export function isListOnly(argv: readonly string[]): boolean {
  return argv.includes('--list');
}

export interface PreflightOptions {
  distDir: string;
  port: number;
  /**
   * Whether Playwright will adopt an already-listening server. When false it always
   * starts its own and fails on a busy port by itself, so the port check has nothing
   * to add. This is how the check stays out of CI's way.
   */
  reuseExistingServer: boolean;
  /** Escape hatch: attach to the existing server deliberately, with a warning. */
  allowExistingServer: boolean;
  /**
   * Whether to probe the port. False in a Playwright worker, which starts after the
   * web server and would therefore always see the port held. Defaults to true so a
   * direct caller gets the full check.
   */
  checkPort?: boolean;
  /** Called when the run deliberately attaches to a server it did not start. */
  onAttach?: () => void;
  /** Defaults to `process.argv`. Injected in tests. */
  argv?: string[];
  /** Injected in tests. */
  portIsHeld?: (port: number) => boolean;
  describeHolder?: (port: number) => string;
  read?: (path: string) => Uint8Array | null;
  warn?: (message: string) => void;
  env?: NodeJS.ProcessEnv;
}

/**
 * The entry point the Playwright config calls.
 *
 * The **port** probe runs only in the runner process: workers start after the web
 * server and would see the port held on every healthy run. The **artifact** check
 * runs on every config evaluation instead, because it is idempotent and cheap, and
 * because a long-lived runner (`--ui`, an IDE test server) re-evaluates the config
 * after a rebuild — gating it to the first evaluation would leave every later run in
 * that session unguarded against exactly the corruption it exists to catch.
 */
export function preflight(options: PreflightOptions): string | null {
  const env = options.env ?? process.env;

  // `--list` enumerates tests and runs none: no web server is started, nothing is
  // attached to, and no browser opens the search dialog, so neither check has a
  // subject. Aborting here is a false positive on a healthy workflow — and not a
  // rare one, since the default port 4321 is also `astro dev`'s, so anyone with
  // `pnpm dev` running lost IDE test discovery (which lists through this same path)
  // and was told to kill their dev server for a command that never touched it.
  if (isListOnly(options.argv ?? process.argv)) return null;

  if (!isMainRunnerProcess(env)) {
    // The runner attached to a server this dist does not back, so nothing here
    // describes what the specs are about to exercise.
    if (env[PREFLIGHT_ATTACHED_ENV] === '1') return null;
    return runPreflight({ ...options, checkPort: false });
  }

  env[PREFLIGHT_DONE_ENV] = '1';
  return runPreflight({
    ...options,
    checkPort: true,
    onAttach: () => {
      env[PREFLIGHT_ATTACHED_ENV] = '1';
      options.onAttach?.();
    },
  });
}

/**
 * Run every preflight check. Returns a fully-formed error message when the run
 * would be untrustworthy, or `null` when it is safe to proceed.
 */
export function runPreflight(options: PreflightOptions): string | null {
  const {
    distDir,
    port,
    reuseExistingServer,
    allowExistingServer,
    checkPort = true,
    onAttach,
    warn = (message: string) => console.warn(message),
    // Routed through the same `warn`, so a probe that could not run is reported
    // wherever the caller sends its output rather than only to the console.
    portIsHeld = (probePort: number) => isPortHeld(probePort, warn),
    describeHolder = describePortHolder,
    read = readArtifact,
  } = options;

  // Port first. When a foreign server holds the port, THAT is what the specs will
  // exercise, so the state of the local dist is not yet the interesting question.
  if (checkPort && reuseExistingServer && portIsHeld(port)) {
    if (!allowExistingServer) return portHeldMessage(port, describeHolder(port));
    warn(
      [
        `e2e preflight: port ${port} is held by ${describeHolder(port)} and`,
        'CAAIL_E2E_ALLOW_EXISTING_SERVER is set, so this run will attach to it.',
        'These results describe whatever that server is serving, not necessarily',
        `the build in ${distDir}.`,
      ].join('\n'),
    );
    // Deliberately attached, so the artifact check is skipped: it describes distDir,
    // and the whole point of the escape hatch is that distDir is not what is served.
    // Aborting here would demand `rm -rf dist && pnpm build` for a build nobody is
    // testing, which is the same mistake in the other direction.
    onAttach?.();
    return null;
  }

  const pagefindProblems = checkPagefindArtifacts(distDir, read);
  if (pagefindProblems.length > 0) return pagefindMessage(distDir, pagefindProblems);

  return null;
}

/** The message for a build whose pagefind index cannot work. */
function pagefindMessage(distDir: string, problems: PagefindProblem[]): string {
  // Only the zero-filled case is explained by the incremental-build story; saying
  // "written at the correct size and entirely zero-filled" about a zero-byte or
  // absent file contradicts the line listing it two lines above.
  const zeroFilled = problems.filter((problem) => problem.kind === 'all-nul');
  // A byte count only means anything for a file that exists.
  const countable = problems.filter(
    (problem) => problem.kind === 'all-nul' || problem.kind === 'empty',
  );
  return [
    "e2e preflight: this build's pagefind search index is unusable.",
    '',
    ...problems.map((problem) => `  - ${problem.message}`),
    '',
    'Pagefind will never initialise, the search dialog will stay empty, and every',
    'spec that opens search fails on a content assertion ten seconds later — which',
    'reads as a regression in whatever you changed. It is not.',
    ...(zeroFilled.length > 0
      ? [
          '',
          'An incremental build intermittently writes these files at the correct size',
          'and entirely zero-filled.',
        ]
      : []),
    '',
    'Fix: rm -rf dist && pnpm build',
    // LC_ALL=C because `tr` bails with "Illegal byte sequence" on non-UTF-8 bytes in
    // a UTF-8 locale. The path is quoted because a checkout path may contain spaces,
    // and a suggested command that errors when pasted undermines the diagnosis at
    // the moment it has to be believed.
    ...(countable.length > 0
      ? [
          'Confirm (0 means corrupt):',
          ...countable.map(
            (problem) => `  LC_ALL=C tr -d '\\000' < '${join(distDir, problem.relative)}' | wc -c`,
          ),
        ]
      : []),
  ].join('\n');
}

/** The message for a port held by a server this run did not start. */
function portHeldMessage(port: number, holder: string): string {
  return [
    `e2e preflight: port ${port} is already held by ${holder},`,
    'which this run did not start.',
    '',
    'reuseExistingServer is on outside CI, so Playwright would silently ATTACH to that',
    'server instead of starting its own. A preview server that outlived a `rm -rf dist`',
    'keeps serving the deleted build, so the suite would report on an artifact nobody',
    'built — passing or failing for reasons unrelated to your working tree.',
    '',
    'Pick one:',
    '  - Give this run its own port:  CAAIL_E2E_PORT=<free port> pnpm test:e2e',
    `  - Stop the existing server:     kill $(lsof -ti:${port})`,
    '  - Attach on purpose:            CAAIL_E2E_ALLOW_EXISTING_SERVER=1 pnpm test:e2e',
    '    (prints a warning; you are asserting that server serves the build you want)',
  ].join('\n');
}
