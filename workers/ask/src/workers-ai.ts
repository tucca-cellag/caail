/**
 * Workers AI calls, and their errors told apart from every other error.
 *
 * A failed Workers AI request has an internal code, which Cloudflare's Workers AI
 * errors page lists: 3036 for the daily free allocation used up, 3040 for no
 * capacity, 5007 for no such model, and others. The binding's thrown error has no
 * documented field for it (the runtime types declare InferenceUpstreamError as a
 * plain Error), so a code is read from a `code` field where one is present, else
 * from the message's leading "<code>:" form, else from the documented message of
 * one of the two limits.
 *
 * Only an error thrown by a Workers AI call is read at all: `callWorkersAi` wraps
 * it, and `workersAiCode` reads nothing else. A number in a Vectorize, network or
 * body-read message, such as "after 3040 ms", is never taken for a quota.
 */
import type { AiBinding } from './retrieval.ts';

/** "5007: No such model", or with the error's name before it: "InferenceUpstreamError: 3040: …". */
const LEADING_CODE = /^\s*(?:[A-Za-z]+Error:\s*)?(\d{4})\s*:/;

/** The two limits by the messages Cloudflare's errors page gives them. */
const DOCUMENTED_LIMITS: readonly [code: number, message: string][] = [
  [3036, 'You have used up your daily free allocation'],
  [3040, 'Capacity temporarily exceeded'],
];

function codeOf(err: unknown): number | undefined {
  const field = (err as { code?: unknown } | null)?.code;
  if (typeof field === 'number' && Number.isInteger(field) && field >= 1000 && field <= 9999) return field;
  if (typeof field === 'string' && /^\d{4}$/.test(field)) return Number(field);
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const leading = message.match(LEADING_CODE);
  if (leading) return Number(leading[1]);
  for (const [code, text] of DOCUMENTED_LIMITS) if (message.includes(text)) return code;
  return undefined;
}

/** An error thrown by a Workers AI call, with its internal code when one could be read. */
export class WorkersAiError extends Error {
  readonly code: number | undefined;

  constructor(cause: unknown) {
    super('workers_ai_call_failed', { cause });
    this.code = codeOf(cause);
  }
}

/** Run a Workers AI model, wrapping any error it throws as a WorkersAiError. */
export async function callWorkersAi(
  ai: AiBinding,
  model: string,
  inputs: Record<string, unknown>,
  options: { signal?: AbortSignal },
): Promise<unknown> {
  try {
    return await ai.run(model, inputs, options);
  } catch (err) {
    throw new WorkersAiError(err);
  }
}

/** The Workers AI code of an error, or undefined for any error not from a Workers AI call. */
export function workersAiCode(err: unknown): number | undefined {
  return err instanceof WorkersAiError ? err.code : undefined;
}
