/**
 * Whether the build under test was given a chat endpoint, and how to find the widget in it.
 *
 * The "Ask CAAIL" box is offered only when PUBLIC_CAAIL_CHAT_API names an endpoint at build
 * time (src/lib/chat-config.ts). Without one, pages carry no widget at all, so the chat specs
 * have two honest states to check and need to know which one the build is in.
 *
 * This takes the value from the process environment only, judged by the build's own rule
 * (src/lib/chat-endpoint.ts), so a build and an e2e run started with the same environment
 * agree. CI sets it once for the job (.github/workflows/test.yml). The build also reads
 * site/.env files and this does not try to: re-implementing Vite's env loading (its file order,
 * its variable expansion) was the source of every disagreement found in review. So when a
 * site/.env* file sets the variable and the environment does not, this refuses to run, naming
 * the file, rather than guess what the build saw.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chatEndpoint } from '../src/lib/chat-endpoint';

const SITE = fileURLToPath(new URL('../', import.meta.url));
const KEY = 'PUBLIC_CAAIL_CHAT_API';
/**
 * A line giving the variable a value. A commented-out line, or an empty assignment (which means
 * no endpoint to the build and to this run alike), does not count.
 */
const SETS_KEY = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${KEY}[ \\t]*=[ \\t]*[^\\s#]`, 'm');
/** `astro build` runs in production mode, so Vite reads `.env`, `.env.local` and `.env.production*`. */
const readByBuild = (f: string): boolean => f === '.env' || f === '.env.local' || f.startsWith('.env.production');

if (process.env[KEY] === undefined) {
  const file = readdirSync(SITE).find(
    (f) => readByBuild(f) && SETS_KEY.test(readFileSync(join(SITE, f), 'utf-8')),
  );
  if (file) {
    throw new Error(
      `site/${file} sets ${KEY}, which the build reads and this e2e run does not. ` +
        `Set it in the shell for both the build and the e2e run instead, and remove it from site/${file}.`,
    );
  }
}

export const CHAT_BUILT: boolean = chatEndpoint(process.env[KEY]) !== undefined;

/**
 * The widget's island. The load-bearing check for "no widget": the button itself appears only
 * after `client:idle` hydration, so its absence right after navigation proves nothing, while an
 * island in the markup is what loads and hydrates the widget. chat-widget.spec.ts asserts this
 * finds exactly one island in a build with an endpoint, so it cannot pass by matching nothing.
 */
export const CHAT_ISLAND = 'astro-island[component-url*="CaailChatWidget"]';

/** What to say when the island count disagrees with what this run read. */
export const BUILD_MISMATCH =
  `the island count does not match ${KEY} in this run's environment. If the build was started ` +
  'with a different value, build and test with the same one; otherwise the widget is mounted wrongly';
