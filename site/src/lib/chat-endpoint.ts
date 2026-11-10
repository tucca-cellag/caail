/**
 * The chat endpoint a raw PUBLIC_CAAIL_CHAT_API value names, or undefined when it names none.
 *
 * Usable means an http(s) URL once trimmed. An unset repo variable reaches the build as an
 * empty string, and a value that is only whitespace, or not a URL, would show a box whose
 * every question fails, so all of those count as no endpoint.
 *
 * Pure, with no `import.meta.env`, so the build's switch (chat-config.ts) and the e2e run
 * (e2e/chat-build.ts) apply the same rule.
 */
export function chatEndpoint(raw: string | undefined): string | undefined {
  const value = (raw ?? '').trim();
  return /^https?:\/\/\S+$/.test(value) ? value : undefined;
}
