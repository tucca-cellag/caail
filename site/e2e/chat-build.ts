/**
 * Whether the build under test was given a chat endpoint.
 *
 * The "Ask CAAIL" box is offered only when PUBLIC_CAAIL_CHAT_API names an endpoint at build
 * time (src/lib/chat-config.ts). Without one, pages carry no widget at all, so the chat specs
 * have two honest states to check and need to know which one the build is in. The build
 * cannot be asked, so this reads the value from where the build read it: Vite's env files for
 * production mode in `site/`, in Vite's order, with the process environment taking priority,
 * and judges it with the build's own rule (src/lib/chat-endpoint.ts). CI sets it in the job's
 * environment, so its build and e2e steps see one value (.github/workflows/test.yml). A run
 * that reads one thing about a build that did the other fails, in either direction, rather
 * than passing for the wrong reason.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chatEndpoint } from '../src/lib/chat-endpoint';

const SITE = fileURLToPath(new URL('../', import.meta.url));
const KEY = 'PUBLIC_CAAIL_CHAT_API';
/** The files Vite loads for `astro build` (production mode), lowest priority first. */
const ENV_FILES = ['.env', '.env.local', '.env.production', '.env.production.local'];

function builtValue(): string | undefined {
  if (process.env[KEY] !== undefined) return process.env[KEY];
  let value: string | undefined;
  for (const file of ENV_FILES) {
    const path = join(SITE, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*(?:export\\s+)?${KEY}\\s*=\\s*(.*)$`));
      if (m) value = m[1]!.trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return value;
}

export const CHAT_BUILT: boolean = chatEndpoint(builtValue()) !== undefined;
