import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// The hero's diagonal band (`.hero-stripe::before` in src/components/Hero.astro)
// must never be painted anywhere but behind the title.
//
// A script pins the band to the title. Hero's script is an inline module, which
// the browser runs only after the whole document is parsed, and on a slow phone
// it paints the page before that. The band used to be painted at the CSS
// fallback, the middle of the hero, which on a phone is near the bottom of the
// screen, and then jumped to the title: one layout shift of 0.229, the whole of
// the homepage's CLS in Lighthouse (caail-planning#651).
//
// The first test is the state at first paint, which is the state with no script
// run, so it is deterministic. The third measures the outcome under the CPU
// slowdown Lighthouse applies; that one passes reliably on a correct build but
// cannot promise to catch every regression, since it depends on a race.
// ---------------------------------------------------------------------------

/** Lighthouse's mobile viewport. */
const PHONE = { width: 412, height: 823 };

/** Whether the band is painted, and where its centre sits against the title's. */
function band(page: Page) {
  return page.evaluate(() => {
    const stripe = document.querySelector<HTMLElement>('.hero-stripe');
    const title = document.querySelector<HTMLElement>('.h-title');
    if (!stripe || !title) throw new Error('the hero stripe or the title is missing');
    const style = getComputedStyle(stripe, '::before');
    const s = stripe.getBoundingClientRect();
    const t = title.getBoundingClientRect();
    return {
      shown: style.visibility === 'visible' && Number(style.opacity) > 0 && style.display !== 'none',
      // `top` is the band's centre: the rule translates it up by half its height.
      centre: s.top + parseFloat(style.top),
      titleCentre: t.top + t.height / 2,
    };
  });
}

test.describe('with no script run, as at first paint', () => {
  test.use({ javaScriptEnabled: false, viewport: PHONE });

  test('the hero band is not painted', async ({ page }) => {
    await page.goto('./');
    expect((await band(page)).shown, 'the band is painted before the script has placed it').toBe(false);
  });
});

for (const viewport of [PHONE, { width: 1280, height: 800 }]) {
  test(`at ${viewport.width}px the hero band ends up painted behind the title`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('./');
    await expect.poll(async () => (await band(page)).shown, { message: 'the band is never shown' }).toBe(true);
    const { centre, titleCentre } = await band(page);
    expect(Math.abs(centre - titleCentre), `band centre ${centre}, title centre ${titleCentre}`).toBeLessThan(2);
  });
}

test('on a slowed phone the hero band records no layout shift', async ({ page, context }) => {
  await page.setViewportSize(PHONE);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    const w = window as unknown as { __stripeShifts: number[] };
    w.__stripeShifts = [];
    const inStripe = (n: Node | null) => !!n?.parentElement?.closest('.hero-stripe') || (n instanceof Element && !!n.closest('.hero-stripe'));
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; sources?: { node: Node | null }[] })[]) {
        if (e.sources?.some((s) => inStripe(s.node))) w.__stripeShifts.push(e.value);
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('./');
  await expect.poll(async () => (await band(page)).shown, { message: 'the band is never shown' }).toBe(true);
  // Two frames, so a shift caused by the placement has been recorded.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const shifts = await page.evaluate(() => (window as unknown as { __stripeShifts: number[] }).__stripeShifts);
  expect(shifts, 'layout shifts whose source is the hero band').toEqual([]);
});
