import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:net';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkPagefindArtifacts,
  classifyArtifact,
  isPortHeld,
  preflightOnce,
  runPreflight,
  PAGEFIND_ARTIFACTS,
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
        message:
          'dist/pagefind/pagefind.js is 45555 bytes of NUL — the correct size, entirely zero-filled',
      },
      {
        relative: 'pagefind/pagefind-entry.json',
        message:
          'dist/pagefind/pagefind-entry.json is 172 bytes of NUL — the correct size, entirely zero-filled',
      },
    ]);
  });

  it('reports a missing artifact', () => {
    expect(checkPagefindArtifacts(makeDist({ 'pagefind/pagefind.js': null }))).toEqual([
      { relative: 'pagefind/pagefind.js', message: 'dist/pagefind/pagefind.js is missing' },
    ]);
  });

  it('says nothing when dist does not exist', () => {
    // An unbuilt checkout is a different problem with a different owner. Claiming
    // it here would make the guard fire on every fresh worktree.
    expect(checkPagefindArtifacts(join(tmpdir(), 'caail-preflight-no-such-dir'))).toEqual([]);
  });
});

describe('isPortHeld', () => {
  it('detects a real listening socket, and a free port', async () => {
    const server = createServer();
    servers.push(server);
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve((server.address() as { port: number }).port);
      });
    });

    expect(isPortHeld(port)).toBe(true);

    await new Promise<void>((resolve) => server.close(() => resolve()));
    servers.pop();
    expect(isPortHeld(port)).toBe(false);
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
    expect(message).toContain('pagefind search index in this build is corrupt');
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

  it('reports the corrupt build even when the port is also held', () => {
    // Artifact first: a wrong build is the more misleading of the two, and a
    // single message beats two competing explanations for one red run.
    const message = runPreflight({
      ...base,
      distDir: makeDist({ 'pagefind/pagefind.js': Buffer.alloc(45555) }),
      portIsHeld: () => true,
    });
    expect(message).toContain('corrupt');
    expect(message).not.toContain('already held');
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

describe('preflightOnce', () => {
  const base = {
    port: 4321,
    reuseExistingServer: true,
    allowExistingServer: false,
    describeHolder: () => 'node (pid 123)',
    warn: () => {},
  };

  it('checks in a runner process, and marks the env so children know', () => {
    const env: NodeJS.ProcessEnv = {};
    const message = preflightOnce({
      ...base,
      distDir: makeDist({}),
      portIsHeld: () => true,
      env,
    });
    expect(message).toContain('already held');
    expect(env[PREFLIGHT_DONE_ENV]).toBe('1');
  });

  it('skips in a Playwright worker process', () => {
    // The bug this pins: Playwright re-evaluates the config in each worker, and a
    // worker starts AFTER the web server. Left unguarded the port probe sees
    // Playwright's own preview server and fails every healthy run.
    let probed = false;
    const message = preflightOnce({
      ...base,
      distDir: makeDist({ 'pagefind/pagefind.js': Buffer.alloc(45555) }),
      portIsHeld: () => {
        probed = true;
        return true;
      },
      env: { TEST_WORKER_INDEX: '0' },
    });
    expect(message).toBeNull();
    expect(probed).toBe(false);
  });

  it('skips when a parent process already ran the checks', () => {
    // Second signal, independent of Playwright internals: forked workers inherit
    // the runner's env.
    const message = preflightOnce({
      ...base,
      distDir: makeDist({}),
      portIsHeld: () => true,
      env: { [PREFLIGHT_DONE_ENV]: '1' },
    });
    expect(message).toBeNull();
  });

  it('is idempotent within one process', () => {
    const env: NodeJS.ProcessEnv = {};
    const options = { ...base, distDir: makeDist({}), portIsHeld: () => true, env };
    expect(preflightOnce(options)).toContain('already held');
    expect(preflightOnce(options)).toBeNull();
  });
});
