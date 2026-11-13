import type { Page } from '@playwright/test';

/**
 * Wait for an Astro island to finish hydrating before interacting with it.
 *
 * Every island's controls are server-rendered, so Playwright can click a button or fill
 * an input the moment the HTML arrives — before the component's event handlers exist.
 * When that happens the interaction is not delayed, it is LOST: `selectOption` changes
 * the <select> value and `fill` changes the input value, but no framework handler ever
 * runs, so the island's state never updates.
 *
 * That distinction matters, because it is why retrying the *assertion* does not fix it.
 * A `toPass` block that re-reads the DOM waits for a state change that is never coming;
 * only retrying the *interaction*, or waiting for hydration first, converges. This helper
 * does the latter, which is cheaper and states the intent.
 *
 * The signal is Astro's own: it renders `<astro-island ... ssr>` and removes the `ssr`
 * attribute once the component is hydrated. Matching on `component-url` scopes the wait
 * to one island, so a page carrying several (the explorer plus the chat widget, say)
 * does not resolve early on the wrong one.
 *
 * @param page       the Playwright page
 * @param component  substring of the island's component-url, e.g. 'PapersExplorer'
 */
export async function awaitHydrated(page: Page, component: string): Promise<void> {
  await page.waitForSelector(`astro-island[component-url*="${component}"]:not([ssr])`, {
    state: 'attached',
  });
}

/**
 * Keep the page's main thread busy from before its first script runs, so the browser never
 * has idle time: an unbroken chain of `MessageChannel` tasks, each a few milliseconds of work.
 * A `MessageChannel` message is not clamped the way a nested `setTimeout(0)` is, so no gap
 * between tasks is long enough for `requestIdleCallback` to fire. This is the condition a busy
 * CI runner produced on the chat-widget specs (tucca-cellag/caail-planning#604): an idle
 * callback with no timeout never ran, so a `client:idle` island never hydrated, and a test
 * waiting on one idle callback hung.
 *
 * It holds one CPU core while it runs, which is load on the runner every other test shares, so
 * it runs in the top frame only, and the returned `stop` ends it: call it once the assertion
 * it exists for has been made.
 */
export async function neverIdle(page: Page): Promise<() => Promise<void>> {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    let stopped = false;
    (window as unknown as { caailStopNeverIdle: () => void }).caailStopNeverIdle = () => {
      stopped = true;
    };
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      if (stopped) return;
      const until = performance.now() + 4;
      while (performance.now() < until) {
        // Hold the thread, so the next task is always already queued.
      }
      channel.port2.postMessage(0);
    };
    channel.port2.postMessage(0);
  });
  return async () => {
    await page.evaluate(() => (window as unknown as { caailStopNeverIdle?: () => void }).caailStopNeverIdle?.());
  };
}
