/**
 * The longest the site waits for an idle moment before doing deferred work: hydrating the "Ask
 * CAAIL" widget (`Footer.astro`) and the citation network (`papers/network.mdx`), both
 * `client:idle`, and wiring the search event (`Analytics.astro`).
 *
 * Idle-only work never runs on a page that never goes idle, as on a busy CI runner: the chat
 * button was "not found" within 15 s and the network canvas within 20 s, a different page each
 * time (tucca-cellag/caail-planning#604). Astro's `client:idle` `timeout` option, and
 * `requestIdleCallback`'s own, run the work after this many milliseconds even if the page is
 * not yet idle.
 *
 * Why 200: in a browser with no `requestIdleCallback`, Astro's idle directive hydrates an island
 * after `setTimeout(cb, timeout || 200)` (astro/dist/runtime/client/idle.js), so a `client:idle`
 * island there waits this value, and it is the delay such a browser already had with no timeout.
 * So no browser's islands wait longer than they did before the bound. A larger value would
 * delay those browsers by the difference. `idle-timeout.test.ts` reads the installed Astro and
 * fails if its fallback delay stops matching this value.
 *
 * Which browsers that is (a snapshot, read 2026-11-13 from MDN's browser-compat-data,
 * api/Window.json): Safari ships `requestIdleCallback` only in its preview build behind a flag,
 * and iOS Safari mirrors it, so both take that fallback.
 *
 * `Analytics.astro` keeps its own fallback for such a browser, `setTimeout(cb, 1)`: the bound
 * here is the most it waits in a browser that has `requestIdleCallback`.
 *
 * The e2e specs read the same value: `chat-widget-hidden.spec.ts` waits for one idle callback
 * of its own with this timeout, queued after the island's, so it still runs after the island's
 * would have. No environment is read here, so the specs can import it.
 */
export const IDLE_TIMEOUT_MS = 200;
