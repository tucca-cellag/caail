/**
 * The longest the site waits for an idle moment before doing deferred work. Every island under
 * site/src that hydrates when the page is idle is written
 * `client:idle={{ timeout: IDLE_TIMEOUT_MS }}`, and script defers work through `onIdle` below
 * rather than asking the browser for an idle callback itself. `idle-timeout.test.ts` fails on
 * any other use, in code or prose, so this does not list them, and prose here and elsewhere
 * describes the browser's idle-callback API rather than naming it.
 *
 * Idle-only work never runs on a page that never goes idle, as on a busy CI runner: the chat
 * button was "not found" within 15 s and the network canvas within 20 s, a different page each
 * time (tucca-cellag/caail-planning#604). The `timeout` option of Astro's idle directive, and
 * the one the idle-callback API takes, run the work after this many milliseconds even if the
 * page is not yet idle.
 *
 * Why 200: in a browser without the idle-callback API, Astro's idle directive hydrates an island
 * after `setTimeout(cb, timeout || 200)`, so an idle island there waits this value, and it is the
 * delay such a browser already had with no timeout. So no browser's islands wait longer than
 * they did before the bound. A larger value would delay those browsers by the difference.
 * `idle-timeout.test.ts` reads that fallback in the installed Astro, in its source and in the
 * minified copy pages inline, and fails if either stops matching this value.
 *
 * Which browsers that is (a snapshot, read 2026-11-13 from MDN's browser-compat-data,
 * api/Window.json): Safari ships the idle-callback API only in its preview build behind a flag,
 * and iOS Safari mirrors it, so both take that fallback.
 *
 * No environment is read here, so the e2e specs can import it too.
 */
export const IDLE_TIMEOUT_MS = 200;

/**
 * Run `cb` once the page is idle, or after `IDLE_TIMEOUT_MS` if it never is.
 *
 * The one place script under site/src asks for an idle callback, so the bound is part of the
 * call rather than something each caller has to remember. In a browser without the
 * idle-callback API it runs `cb` after `setTimeout(cb, 1)`, the fallback the search wiring in
 * `Analytics.astro` had before it moved here; the bound is the most it waits where the browser
 * has one.
 */
export function onIdle(cb: () => void): void {
  // Named once, so the scan in idle-timeout.test.ts can require exactly one use of it here.
  const ask = globalThis.requestIdleCallback?.bind(globalThis);
  if (ask) ask(cb, { timeout: IDLE_TIMEOUT_MS });
  else setTimeout(cb, 1);
}
