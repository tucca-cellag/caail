/**
 * The longest the "Ask CAAIL" widget waits for an idle moment before it hydrates.
 *
 * The footer mounts the widget with `client:idle`, which hydrates once the browser reports
 * idle time. A page that never goes idle, on a busy CI runner or a slow device, then never
 * shows the chat button at all: on main's CI the button was "not found" within 15 s, a
 * different page each time (tucca-cellag/caail-planning#604). Astro's `timeout` option
 * hydrates after this many milliseconds even if the page is not yet idle, which bounds it.
 *
 * The e2e specs read the same value: `chat-widget-hidden.spec.ts` waits for one idle callback
 * of its own, queued after the island's with this timeout, so it still runs after the island's
 * would have, and its "no widget script was requested" check keeps its meaning.
 *
 * No environment is read here, so the specs can import it as well as the footer.
 */
export const CHAT_HYDRATE_TIMEOUT_MS = 2_000;
