/**
 * The longest the site waits for an idle moment before doing deferred work: every `client:idle`
 * island and every `requestIdleCallback` under site/src takes it as its timeout.
 * `idle-timeout.test.ts` fails on one that does not, so this does not list them.
 *
 * Idle-only work never runs on a page that never goes idle, as on a busy CI runner: the chat
 * button was "not found" within 15 s and the network canvas within 20 s, a different page each
 * time (tucca-cellag/caail-planning#604). Astro's `client:idle` `timeout` option, and
 * `requestIdleCallback`'s own, run the work after this many milliseconds even if the page is
 * not yet idle.
 *
 * Why 200: in a browser with no `requestIdleCallback`, Astro's idle directive hydrates an island
 * after `setTimeout(cb, timeout || 200)`, so a `client:idle` island there waits this value, and
 * it is the delay such a browser already had with no timeout. So no browser's islands wait
 * longer than they did before the bound. A larger value would delay those browsers by the
 * difference. `idle-timeout.test.ts` reads that fallback in the installed Astro, in its source
 * and in the minified copy pages inline, and fails if either stops matching this value.
 *
 * Which browsers that is (a snapshot, read 2026-11-13 from MDN's browser-compat-data,
 * api/Window.json): Safari ships `requestIdleCallback` only in its preview build behind a flag,
 * and iOS Safari mirrors it, so both take that fallback.
 *
 * `Analytics.astro` keeps its own fallback for such a browser, `setTimeout(cb, 1)`: the bound
 * here is the most it waits in a browser that has `requestIdleCallback`.
 *
 * No environment is read here, so the e2e specs can import it too.
 */
export const IDLE_TIMEOUT_MS = 200;
