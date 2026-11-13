import { test, expect } from '@playwright/test';
import { neverIdle } from './hydration';
import { IDLE_TIMEOUT_MS } from '../src/lib/idle-timeout';

/**
 * The never-idle guards (chat-widget-stacking, chat-widget-hidden, network-metrics) prove a fix
 * only if `neverIdle` really keeps the page from going idle. If a browser update let idle time
 * through between its tasks, every guard would pass against code with the bound removed. So
 * this checks the helper itself in both directions: an unbounded idle callback does not run,
 * and a bounded one does (tucca-cellag/caail-planning#604).
 */
test('neverIdle keeps an unbounded idle callback from running, and lets a bounded one run', async ({ page }) => {
  const stop = await neverIdle(page);
  try {
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    // The bound the site uses, and a window well past it, so the bounded callback has had its
    // chance while the unbounded one, given the same window, has had none.
    const ran = await page.evaluate(
      (timeout) =>
        new Promise<string[]>((resolve) => {
          const seen: string[] = [];
          requestIdleCallback(() => seen.push('unbounded'));
          requestIdleCallback(() => seen.push('bounded'), { timeout });
          setTimeout(() => resolve(seen), timeout + 1_300);
        }),
      IDLE_TIMEOUT_MS,
    );
    expect(ran).toEqual(['bounded']);
  } finally {
    await stop();
  }
});
