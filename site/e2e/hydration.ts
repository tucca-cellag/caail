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
