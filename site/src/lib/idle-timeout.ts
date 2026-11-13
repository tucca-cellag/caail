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
 * Why 200: where a browser has no `requestIdleCallback`, as Safari and iOS have none, Astro's
 * idle directive already waits `setTimeout(cb, timeout || 200)`
 * (astro/dist/runtime/client/idle.js), so this value is also that fallback's delay. Every
 * browser then waits at most what Safari already waits. A larger value would delay Safari's
 * chat button by the difference.
 *
 * The e2e specs read the same value: `chat-widget-hidden.spec.ts` waits for one idle callback
 * of its own with this timeout, queued after the island's, so it still runs after the island's
 * would have. No environment is read here, so the specs can import it.
 */
export const IDLE_TIMEOUT_MS = 200;
