import { test, expect, type Page } from '@playwright/test';

/**
 * The hero counter's pause control (WCAG 2.2.2, tucca-cellag/caail-planning#887).
 *
 * The counter retypes itself and its caret blinks without end, so the reader needs a
 * control that stops both. Timers run on Playwright's clock, so these assert what the
 * loop does rather than how fast a machine happens to run it.
 */

const BUTTON = '.hero .tick-pause';
const live = (page: Page) => page.locator('.hero .tick').innerText();

async function caretStill(page: Page) {
  return page.locator('.hero .tick .tick-caret').evaluate((el) => {
    const s = getComputedStyle(el);
    return s.display === 'none' || s.animationPlayState === 'paused' || s.animationName === 'none';
  });
}

/** Every distinct text the counter shows while the clock runs `ms`, sampled each 50ms. */
async function textsOver(page: Page, ms: number) {
  const seen = new Set<string>();
  for (let t = 0; t < ms; t += 50) {
    await page.clock.runFor(50);
    seen.add(await live(page));
  }
  return seen;
}

test('the pause control stops the typing and the caret, and play resumes them', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  const button = page.locator(BUTTON);
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName('Pause the counter');

  // Running: over two full holds the counter must move on, or the rest proves nothing.
  expect((await textsOver(page, 5000)).size, 'the counter never moved, so pausing it shows nothing').toBeGreaterThan(1);
  expect(await caretStill(page), 'the caret is not animating while the counter runs').toBe(false);

  // Reachable and operable from the keyboard: Tab from the link before it, then Enter.
  await page.locator('.hero .tick-cap').focus();
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(button).toHaveAccessibleName('Play the counter');
  expect(await caretStill(page), 'the caret still blinks after pausing').toBe(true);
  const paused = await textsOver(page, 8000);
  expect([...paused], 'the counter kept typing after pausing').toHaveLength(1);

  // Returning to the tab must not override the reader's choice.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect([...(await textsOver(page, 4000))], 'a visibility change restarted a paused counter').toHaveLength(1);

  await page.keyboard.press('Space');
  await expect(button).toHaveAccessibleName('Pause the counter');
  expect(await caretStill(page)).toBe(false);
  expect((await textsOver(page, 5000)).size, 'play did not resume the counter').toBeGreaterThan(1);
});

test('no control is offered when nothing moves: reduced motion, or no script', async ({ page, request, browser, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(page.locator(BUTTON)).toBeHidden();

  // Served HTML, as a reader with JavaScript off gets it: the button is there but pending.
  const html = await (await request.get('./')).text();
  expect(html).toMatch(/<button[^>]*class="[^"]*tick-pause[^"]*"[^>]*\sdata-pending[\s>]/);

  // And with the script off nothing moves: the caret neither shows nor blinks, since
  // there is no control to stop it.
  const ctx = await browser.newContext({ baseURL, javaScriptEnabled: false, reducedMotion: 'no-preference' });
  const noScript = await ctx.newPage();
  await noScript.goto('./');
  await expect(noScript.locator(BUTTON)).toBeHidden();
  const caret = await noScript.locator('.hero .tick .tick-caret').evaluate((el) => {
    const s = getComputedStyle(el);
    return { visibility: s.visibility, animation: s.animationName };
  });
  expect(caret, 'with no script the caret shows or blinks, and nothing can stop it').toEqual({ visibility: 'hidden', animation: 'none' });
  await ctx.close();
});

test('turning reduced motion off after loading with it on moves nothing', async ({ page }) => {
  // The loop never starts on this page view, so no control will ever appear: its
  // reserved row must not open when the preference changes.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const col = page.locator('.hero .tick-col');
  const before = await col.evaluate((el) => el.getBoundingClientRect().height);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator(BUTTON)).toBeHidden();
  const after = await col.evaluate((el) => el.getBoundingClientRect().height);
  expect(after, `the counter column grew from ${before}px to ${after}px when reduced motion was turned off`).toBe(before);
});

test('turning reduced motion on after load pauses the counter and keeps its control, and focus on it', async ({ page }) => {
  // The script reads the preference at load. A reader who asks for less motion later gets
  // the loop paused, and the control they may be focused on stays where it is.
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('./');
  const button = page.locator(BUTTON);
  await expect(button).toBeVisible();
  expect((await textsOver(page, 5000)).size, 'the counter never moved, so stopping it shows nothing').toBeGreaterThan(1);

  await button.focus();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(button, 'the control vanished when reduced motion came on').toBeVisible();
  await expect(button, 'focus left the control when reduced motion came on').toBeFocused();
  await expect(button).toHaveAccessibleName('Play the counter');
  expect([...(await textsOver(page, 8000))], 'the counter kept typing after reduced motion came on').toHaveLength(1);
  expect(await caretStill(page), 'the caret still blinks under reduced motion').toBe(true);

  // Turning it off again leaves the pause standing until the reader presses Play.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(button).toHaveAccessibleName('Play the counter');
  expect([...(await textsOver(page, 4000))], 'turning reduced motion off restarted the counter by itself').toHaveLength(1);
});

test('enabling the control moves nothing: its row is reserved before the script runs', async ({ browser, baseURL }) => {
  // The script enables the button after first paint, so a row that appeared then would
  // shift the hero and everything below it. Measured with the script off and on.
  const heights: number[] = [];
  for (const javaScriptEnabled of [false, true]) {
    const ctx = await browser.newContext({ baseURL, javaScriptEnabled, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    await page.goto('./');
    if (javaScriptEnabled) await expect(page.locator(BUTTON)).toBeVisible();
    else await expect(page.locator(BUTTON)).toBeHidden();
    heights.push(await page.locator('.hero .tick-col').evaluate((el) => el.getBoundingClientRect().height));
    await ctx.close();
  }
  expect(heights[1], `the counter column is ${heights[0]}px tall before the script and ${heights[1]}px after`).toBe(heights[0]);
});
