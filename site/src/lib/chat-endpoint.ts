/**
 * The chat endpoint a raw PUBLIC_CAAIL_CHAT_API value names, or undefined when it names none.
 *
 * Usable means a URL, once trimmed, that the site's pages can fetch: https, or plain http only
 * to a backend on this machine, since the site is served over HTTPS and a browser blocks plain
 * http to any other host as mixed content. An unset repo variable reaches the build as an empty
 * string, and a value that is whitespace, not a URL (the `<backend-host>` placeholder in
 * site/.env.example included), or blocked that way would show a box whose every question
 * fails, so all of those count as no endpoint.
 *
 * Pure, with no `import.meta.env`, so the build's switch (chat-config.ts) and the e2e run
 * (e2e/chat-build.ts) apply the same rule.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function chatEndpoint(raw: string | undefined): string | undefined {
  const value = (raw ?? '').trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  const reachable = url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname));
  return reachable && url.hostname ? value : undefined;
}
