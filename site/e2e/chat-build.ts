/**
 * Whether the build under test was given a chat endpoint, and how to find the widget in it.
 *
 * The "Ask CAAIL" box is offered only when PUBLIC_CAAIL_CHAT_API names an endpoint at build
 * time (src/lib/chat-config.ts). Without one, pages carry no widget at all, so the chat specs
 * have two honest states to check and need to know which one the build is in. The build
 * cannot be asked, so this reads the value from where the build read it: Vite's env files for
 * production mode in `site/`, in Vite's order, parsed with Node's dotenv parser, with the
 * process environment taking priority, and judges it with the build's own rule
 * (src/lib/chat-endpoint.ts). CI sets it in the job's environment, so a build and the e2e run
 * after it see one value (.github/workflows/test.yml). A run that reads one thing about a build
 * that did the other fails, in either direction, rather than passing for the wrong reason.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
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
    if (existsSync(path)) value = parseEnv(readFileSync(path, 'utf-8'))[KEY] ?? value;
  }
  return value;
}

export const CHAT_BUILT: boolean = chatEndpoint(builtValue()) !== undefined;

/**
 * The widget's island. The load-bearing check for "no widget": the button itself appears only
 * after `client:idle` hydration, so its absence right after navigation proves nothing, while an
 * island in the markup is what loads and hydrates the widget. chat-widget.spec.ts asserts this
 * finds exactly one island in a build with an endpoint, so it cannot pass by matching nothing.
 */
export const CHAT_ISLAND = 'astro-island[component-url*="CaailChatWidget"]';
