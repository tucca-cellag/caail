/**
 * The chat endpoint a raw PUBLIC_CAAIL_CHAT_API value names, or undefined when it names none.
 *
 * Usable means an https URL, once trimmed, with a host and no credentials. The site is served
 * over HTTPS, so a browser blocks plain http as mixed content, and plain http to localhost
 * would send every visitor's question to their own machine. `fetch` refuses a URL carrying a
 * username or password, which would in any case be inlined into the public bundle. An unset
 * repo variable reaches the build as an empty string, and a value that is whitespace or not a
 * URL (the `<backend-host>` placeholder in site/.env.example included) names nothing either.
 * Each of those would show a box whose every question fails, so all count as no endpoint.
 *
 * Pure, with no `import.meta.env`, so the build's switch (chat-config.ts) and the e2e run
 * (e2e/chat-build.ts) apply the same rule.
 */
export function chatEndpoint(raw: string | undefined): string | undefined {
  const value = (raw ?? '').trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  const usable = url.protocol === 'https:' && url.hostname !== '' && url.username === '' && url.password === '';
  return usable ? value : undefined;
}
