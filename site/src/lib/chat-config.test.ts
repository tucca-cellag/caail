import { afterEach, describe, expect, it, vi } from 'vitest';

/** chat-config.ts read under a given PUBLIC_CAAIL_CHAT_API, fresh each time since it reads at import. */
async function configWith(value: string | undefined) {
  vi.resetModules();
  vi.stubEnv('PUBLIC_CAAIL_CHAT_API', value as string);
  return import('./chat-config');
}

afterEach(() => vi.unstubAllEnvs());

describe('chat-config: the one switch for the Ask CAAIL box (tucca-cellag/caail-planning#763)', () => {
  it('offers the box when an endpoint is set', async () => {
    const c = await configWith('https://chat.invalid/caail/ask');
    expect(c.CHAT_ENABLED).toBe(true);
    expect(c.CHAT_API).toBe('https://chat.invalid/caail/ask');
  });

  it('hides it when the variable is empty, as a workflow passes an unset repo variable', async () => {
    const c = await configWith('');
    expect(c.CHAT_ENABLED).toBe(false);
    expect(c.CHAT_API).toBeUndefined();
  });

  it('hides it when the variable is absent', async () => {
    const c = await configWith(undefined);
    expect(c.CHAT_ENABLED).toBe(false);
    expect(c.CHAT_API).toBeUndefined();
  });

  it('hides it when the value is not an endpoint the HTTPS site could reach, since the box could not answer', async () => {
    const unusable = [
      '   ', 'not a url', 'chat.invalid/caail/ask', 'ftp://chat.invalid/caail/ask',
      // site/.env.example's placeholder, copied as-is
      'https://<backend-host>/caail/ask',
      // plain http is mixed content on the HTTPS site
      'http://chat.example/caail/ask',
      // a loopback host, on any scheme, is each visitor's own machine
      'http://localhost:8787/caail/ask', 'https://localhost:8787/caail/ask', 'https://127.0.0.1/caail/ask',
      'https://127.1.2.3/caail/ask', 'https://[::1]/caail/ask', 'https://app.localhost/caail/ask', 'https://0.0.0.0/caail/ask',
      // fetch refuses a URL carrying credentials, which would also sit in the public bundle
      'https://key:secret@chat.example/caail/ask', 'https://key@chat.example/caail/ask',
    ];
    for (const value of unusable) {
      const c = await configWith(value);
      expect(c.CHAT_ENABLED, JSON.stringify(value)).toBe(false);
      expect(c.CHAT_API, JSON.stringify(value)).toBeUndefined();
    }
  });

  it('trims stray whitespace around a real endpoint', async () => {
    const c = await configWith('  https://chat.invalid/caail/ask\n');
    expect(c.CHAT_ENABLED).toBe(true);
    expect(c.CHAT_API).toBe('https://chat.invalid/caail/ask');
  });

  it('accepts an upper-case scheme', async () => {
    expect((await configWith('HTTPS://chat.invalid/caail/ask')).CHAT_ENABLED).toBe(true);
  });
});
