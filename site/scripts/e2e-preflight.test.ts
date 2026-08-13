import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:net';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
// `join` and `writeFileSync` are also used directly by the named-list test below.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkPagefindArtifacts,
  classifyArtifact,
  isPortHeld,
  preflight,
  runPreflight,
  PAGEFIND_ARTIFACTS,
  PREFLIGHT_ATTACHED_ENV,
  PREFLIGHT_DONE_ENV,
} from './e2e-preflight';

const tempDirs: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  while (servers.length) {
    const server = servers.pop()!;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

/**
 * Build a `dist/pagefind/` whose artifacts have the given contents. `null` omits
 * the file entirely.
 */
function makeDist(contents: Partial<Record<(typeof PAGEFIND_ARTIFACTS)[number], Uint8Array | null>>) {
  const dir = mkdtempSync(join(tmpdir(), 'caail-preflight-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'pagefind'), { recursive: true });
  for (const relative of PAGEFIND_ARTIFACTS) {
    const bytes = relative in contents ? contents[relative] : Buffer.from('healthy artifact');
    if (bytes !== null && bytes !== undefined) writeFileSync(join(dir, relative), bytes);
  }
  return dir;
}

describe('classifyArtifact', () => {
  it('accepts a file with real content', () => {
    expect(classifyArtifact(Buffer.from('import x from "y";'))).toEqual({ status: 'ok', bytes: 18 });
  });

  it('flags a correctly-sized, entirely zero-filled file', () => {
    // The observed corruption: right size, all NUL. This is the case that is
    // invisible to anything checking existence or length.
    expect(classifyArtifact(Buffer.alloc(45555))).toEqual({ status: 'all-nul', bytes: 45555 });
  });

  it('accepts a file that merely contains NUL bytes', () => {
    expect(classifyArtifact(Buffer.from([0, 0, 0, 65, 0]))).toEqual({ status: 'ok', bytes: 5 });
  });

  it('separates absent from zero-length', () => {
    expect(classifyArtifact(null)).toEqual({ status: 'absent' });
    expect(classifyArtifact(Buffer.alloc(0))).toEqual({ status: 'empty' });
  });
});

describe('checkPagefindArtifacts', () => {
  it('passes a healthy build', () => {
    expect(checkPagefindArtifacts(makeDist({}))).toEqual([]);
  });

  it('reports both artifacts when both are zero-filled, with their sizes', () => {
    // The exact sizes observed in the wild, so the message a reader sees is the
    // message this test pins.
    const problems = checkPagefindArtifacts(
      makeDist({
        'pagefind/pagefind.js': Buffer.alloc(45555),
        'pagefind/pagefind-entry.json': Buffer.alloc(172),
      }),
    );
    expect(problems).toEqual([
      {
        relative: 'pagefind/pagefind.js',
        kind: 'all-nul',
        message:
          'dist/pagefind/pagefind.js is 45555 bytes of NUL — the correct size, entirely zero-filled',
      },
      {
        relative: 'pagefind/pagefind-entry.json',
        kind: 'all-nul',
        message:
          'dist/pagefind/pagefind-entry.json is 172 bytes of NUL — the correct size, entirely zero-filled',
      },
    ]);
  });

  it('reports a missing artifact, distinguished from a corrupt one', () => {
    expect(checkPagefindArtifacts(makeDist({ 'pagefind/pagefind.js': null }))).toEqual([
      {
        relative: 'pagefind/pagefind.js',
        kind: 'missing',
        message: 'dist/pagefind/pagefind.js is missing',
      },
    ]);
  });

  it('ignores an all-NUL file that is not one of the named artifacts', () => {
    // Load-bearing, and the reason PAGEFIND_ARTIFACTS is a named list rather than a
    // walk of dist/pagefind/. A HEALTHY build of this site ships three legitimately
    // all-NUL files (pagefind-ui.js, pagefind-modular-ui.js, pagefind-modular-ui.css)
    // that Starlight never loads, measured on a build whose search specs pass.
    // Generalising this check to the whole directory would fail every healthy run.
    const dir = makeDist({});
    writeFileSync(join(dir, 'pagefind/pagefind-ui.js'), Buffer.alloc(119987));
    expect(checkPagefindArtifacts(dir)).toEqual([]);
  });

  it('says nothing when dist does not exist', () => {
    // An unbuilt checkout is a different problem with a different owner. Claiming
    // it here would make the guard fire on every fresh worktree.
    expect(checkPagefindArtifacts(join(tmpdir(), 'caail-preflight-no-such-dir'))).toEqual([]);
  });
});

describe('isPortHeld', () => {
  /** Listen on an ephemeral port and return it. */
  async function listen(): Promise<number> {
    const server = createServer();
    servers.push(server);
    return new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port));
    });
  }

  it('detects a real listening socket, and a free port', async () => {
    const port = await listen();
    expect(isPortHeld(port)).toBe(true);

    const server = servers.pop()!;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(isPortHeld(port)).toBe(false);
  });

  it('does not let an inherited NODE_OPTIONS silently disable it', async () => {
    // Measured before this was fixed: with a real listener bound, the same call
    // returned true on a clean environment and false with a NODE_OPTIONS the child
    // rejects — the guard off while still appearing to run. Not hypothetical: this
    // repo's own `pnpm test` sets NODE_OPTIONS, and a Node that does not know a flag
    // there refuses to start at all.
    const port = await listen();
    const original = process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS = '--a-flag-no-node-accepts';
    try {
      expect(isPortHeld(port)).toBe(true);
    } finally {
      if (original === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = original;
    }
  });

  it('says so out loud when the probe cannot run, rather than reporting free', async () => {
    // A port that is genuinely free and a probe that never ran are the same `false`
    // to the caller, so the second has to announce itself or the guard sits disabled.
    const warnings: string[] = [];
    // 0 is not a connectable port, so the child exits non-zero without connecting.
    const held = isPortHeld(-1 as unknown as number, (message) => warnings.push(message));
    expect(held).toBe(false);
    expect(warnings.join('\n')).toContain('could not probe port');
    expect(warnings.join('\n')).toContain('NOT protected');
  });
});

describe('runPreflight', () => {
  const base = {
    port: 4321,
    reuseExistingServer: true,
    allowExistingServer: false,
    portIsHeld: () => false,
    describeHolder: () => 'node (pid 123)',
    warn: () => {},
  };

  it('passes a healthy build on a free port', () => {
    expect(runPreflight({ ...base, distDir: makeDist({}) })).toBeNull();
  });

  it('names the corrupt artifact and the fix', () => {
    const message = runPreflight({
      ...base,
      distDir: makeDist({ 'pagefind/pagefind.js': Buffer.alloc(45555) }),
    });
    expect(message).toContain("this build's pagefind search index is unusable");
    expect(message).toContain('45555 bytes of NUL');
    expect(message).toContain('rm -rf dist && pnpm build');
  });

  it('points the confirm command at the artifact that is actually broken', () => {
    // A hardcoded confirm path named pagefind.js whatever was wrong. When only
    // entry.json is corrupt that prints a large byte count under a comment reading
    // "0 means corrupt", contradicting the diagnosis exactly when it must be
    // believed. The healthy file must not appear in the suggested command.
    const message = runPreflight({
      ...base,
      distDir: makeDist({ 'pagefind/pagefind-entry.json': Buffer.alloc(172) }),
    })!;
    const confirmLines = message
      .split('\n')
      .filter((line) => line.includes('tr -d'))
      .join('\n');
    expect(confirmLines).toContain('pagefind-entry.json');
    expect(confirmLines).not.toContain('pagefind.js');
  });

  it('suggests no byte-count command for a missing file, and no zero-fill story', () => {
    // `tr -d '\000' < <missing>` prints a file-not-found error, not the promised 0,
    // and "written correctly sized and zero-filled" is simply false for a file that
    // is not there. Same defect class as the hardcoded confirm path: a diagnostic
    // that contradicts itself exactly when it has to be believed.
    const message = runPreflight({
      ...base,
      distDir: makeDist({ 'pagefind/pagefind.js': null }),
    })!;
    expect(message).toContain('dist/pagefind/pagefind.js is missing');
    expect(message).not.toContain('tr -d');
    expect(message).not.toContain('zero-filled');
    expect(message).toContain('rm -rf dist && pnpm build');
  });

  it('does not tell the zero-filled story about a zero-byte file', () => {
    // classifyArtifact already separates empty from all-NUL; the message has to keep
    // that distinction or it prints "written at the correct size and entirely
    // zero-filled" directly under a line saying the file is zero bytes.
    const message = runPreflight({
      ...base,
      distDir: makeDist({ 'pagefind/pagefind.js': Buffer.alloc(0) }),
    })!;
    expect(message).toContain('dist/pagefind/pagefind.js is zero bytes');
    expect(message).not.toContain('correct size');
    // A byte count still means something for a file that exists, so keep the command.
    expect(message).toContain('tr -d');
  });

  it('quotes the path in the confirm command, for checkouts containing spaces', () => {
    const message = runPreflight({
      ...base,
      distDir: makeDist({ 'pagefind/pagefind.js': Buffer.alloc(45555) }),
    })!;
    const confirm = message.split('\n').find((line) => line.includes('tr -d'))!;
    expect(confirm).toMatch(/< '.*pagefind\.js' \| wc -c$/);
  });

  it('names an unreadable artifact instead of throwing out of config evaluation', () => {
    // A concurrent `pnpm build` rm -rf's dist, so a file can vanish between the
    // existence check and the read. Escaping here would throw a raw stack from a
    // file the reader has no reason to suspect.
    const message = runPreflight({
      ...base,
      distDir: makeDist({}),
      read: () => {
        throw new Error('EACCES: permission denied');
      },
    })!;
    expect(message).toContain('could not be read');
    expect(message).toContain('EACCES');
    expect(message).not.toContain('tr -d');
  });

  it('suggests one confirm command per broken artifact', () => {
    const message = runPreflight({
      ...base,
      distDir: makeDist({
        'pagefind/pagefind.js': Buffer.alloc(45555),
        'pagefind/pagefind-entry.json': Buffer.alloc(172),
      }),
    })!;
    expect(message.split('\n').filter((line) => line.includes('tr -d'))).toHaveLength(2);
  });

  it('reports the held port first when the build is also corrupt', () => {
    // Port wins: when a foreign server holds the port, that is what the specs will
    // exercise, so the state of the local dist is not yet the interesting question.
    // Reporting the build first would send someone to rebuild a dist this run is
    // not going to serve.
    const message = runPreflight({
      ...base,
      distDir: makeDist({ 'pagefind/pagefind.js': Buffer.alloc(45555) }),
      portIsHeld: () => true,
    });
    expect(message).toContain('already held');
    expect(message).not.toContain('zero-filled');
  });

  it('does not fault the local build when the run deliberately attaches elsewhere', () => {
    // The escape hatch asserts that distDir is not what is being served, so
    // demanding `rm -rf dist && pnpm build` for it would be the same category error
    // the port check exists to prevent, pointed the other way.
    const message = runPreflight({
      ...base,
      distDir: makeDist({ 'pagefind/pagefind.js': Buffer.alloc(45555) }),
      portIsHeld: () => true,
      allowExistingServer: true,
    });
    expect(message).toBeNull();
  });

  it('still faults the local build when the opt-out is set but no server is there', () => {
    // Nothing to attach to, so Playwright starts its own server on this dist and
    // the artifact check is once again about the build that will be served.
    const message = runPreflight({
      ...base,
      distDir: makeDist({ 'pagefind/pagefind.js': Buffer.alloc(45555) }),
      portIsHeld: () => false,
      allowExistingServer: true,
    });
    expect(message).toContain('zero-filled');
  });

  it('fails on a held port, naming the holder and the escapes', () => {
    const message = runPreflight({ ...base, distDir: makeDist({}), portIsHeld: () => true });
    expect(message).toContain('port 4321 is already held by node (pid 123)');
    expect(message).toContain('CAAIL_E2E_PORT=<free port>');
    expect(message).toContain('CAAIL_E2E_ALLOW_EXISTING_SERVER=1');
  });

  it('does not check the port when Playwright starts its own server', () => {
    // This is what keeps the check out of CI, where reuseExistingServer is false.
    // A held port there is Playwright's problem and it reports it itself.
    let probed = false;
    const message = runPreflight({
      ...base,
      distDir: makeDist({}),
      reuseExistingServer: false,
      portIsHeld: () => {
        probed = true;
        return true;
      },
    });
    expect(message).toBeNull();
    expect(probed).toBe(false);
  });

  it('warns rather than fails when attaching is opted into', () => {
    const warnings: string[] = [];
    const message = runPreflight({
      ...base,
      distDir: makeDist({}),
      portIsHeld: () => true,
      allowExistingServer: true,
      warn: (m) => warnings.push(m),
    });
    expect(message).toBeNull();
    expect(warnings.join('\n')).toContain('will attach to it');
  });
});

describe('preflight', () => {
  const base = {
    port: 4321,
    reuseExistingServer: true,
    allowExistingServer: false,
    describeHolder: () => 'node (pid 123)',
    warn: () => {},
  };

  it('probes the port in a runner process, and marks the env so children know', () => {
    const env: NodeJS.ProcessEnv = {};
    const message = preflight({
      ...base,
      distDir: makeDist({}),
      portIsHeld: () => true,
      env,
    });
    expect(message).toContain('already held');
    expect(env[PREFLIGHT_DONE_ENV]).toBe('1');
  });

  it('does not probe the port in a Playwright worker process', () => {
    // The bug this pins: Playwright re-evaluates the config in each worker, and a
    // worker starts AFTER the web server. Left unguarded the port probe sees
    // Playwright's own preview server and fails every healthy run.
    let probed = false;
    const message = preflight({
      ...base,
      distDir: makeDist({}),
      portIsHeld: () => {
        probed = true;
        return true;
      },
      env: { TEST_WORKER_INDEX: '0' },
    });
    expect(message).toBeNull();
    expect(probed).toBe(false);
  });

  it('does not probe the port when a parent process already did', () => {
    // Second signal, independent of Playwright internals: forked workers inherit
    // the runner's env.
    const message = preflight({
      ...base,
      distDir: makeDist({}),
      portIsHeld: () => true,
      env: { [PREFLIGHT_DONE_ENV]: '1' },
    });
    expect(message).toBeNull();
  });

  it('still checks the build artifacts on every evaluation, not only the first', () => {
    // A long-lived runner (`--ui`, an IDE test server) re-evaluates the config after
    // a rebuild. Gating the artifact check to the first evaluation would leave every
    // later run in that session unguarded against the corruption it exists to catch.
    const env: NodeJS.ProcessEnv = {};
    const options = {
      ...base,
      distDir: makeDist({ 'pagefind/pagefind.js': Buffer.alloc(45555) }),
      portIsHeld: () => false,
      env,
    };
    expect(preflight(options)).toContain('zero-filled');
    expect(preflight(options)).toContain('zero-filled');
  });

  it('checks the build artifacts even inside a worker', () => {
    const message = preflight({
      ...base,
      distDir: makeDist({ 'pagefind/pagefind.js': Buffer.alloc(45555) }),
      portIsHeld: () => true,
      env: { TEST_WORKER_INDEX: '0' },
    });
    expect(message).toContain('zero-filled');
  });

  it('tells workers when the runner attached, so they do not fault the local build', () => {
    // Observed end to end before this was wired: with a corrupt local dist and
    // CAAIL_E2E_ALLOW_EXISTING_SERVER=1, the runner warned and proceeded, then every
    // worker independently threw about a build nobody was serving. The runner's
    // decision has to reach the workers, since only it probes the port.
    const env: NodeJS.ProcessEnv = {};
    const distDir = makeDist({ 'pagefind/pagefind.js': Buffer.alloc(45555) });

    expect(
      preflight({ ...base, distDir, portIsHeld: () => true, allowExistingServer: true, env }),
    ).toBeNull();
    expect(env[PREFLIGHT_ATTACHED_ENV]).toBe('1');

    // A worker forked afterwards inherits that env.
    expect(
      preflight({
        ...base,
        distDir,
        portIsHeld: () => true,
        env: { ...env, TEST_WORKER_INDEX: '0' },
      }),
    ).toBeNull();
  });
});
