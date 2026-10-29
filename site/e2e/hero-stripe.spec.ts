import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// The hero's diagonal band (`.hero-stripe::before` in src/components/Hero.astro)
// must never be painted anywhere but behind the title.
//
// A script pins the band to the title. When that script was a module, which the
// browser runs only after the whole document is parsed, a slow phone painted
// first: the band was drawn at its CSS fallback, the middle of the hero and so
// near the bottom of a phone screen, then jumped to the title. That one layout
// shift, 0.229, was the whole of the homepage's CLS in Lighthouse
// (tucca-cellag/caail-planning#651). The script now runs inline as the hero is
// parsed, and the band stays hidden until it has been placed.
//
// The first test is the state at first paint before any script, which is the
// state with scripts off, so it is deterministic and is what pins the hiding.
// The last measures the outcome under the CPU slowdown Lighthouse applies. It
// passes reliably on a correct build, but it rests on a race, so it cannot
// promise to catch every regression on its own.
// ---------------------------------------------------------------------------

/** Lighthouse's mobile viewport. */
const PHONE = { width: 412, height: 823 };

/** CLS a page should stay under: the "good" threshold, and well under the 0.229 this caught. */
const GOOD_CLS = 0.1;

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

/** How far the band's centre is from the title's, or Infinity while it is not painted. */
async function offTitle(page: Page) {
  const b = await band(page);
  return b.shown ? Math.abs(b.centre - b.titleCentre) : Infinity;
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
    // Polled as one condition, so a late font swap that moves the title cannot land
    // between seeing the band and measuring it.
    await expect
      .poll(() => offTitle(page), { message: 'pixels between the band centre and the title centre (Infinity: never shown)' })
      .toBeLessThan(2);
  });
}

test('on a slowed phone the hero band records no layout shift', async ({ page, context }) => {
  await page.setViewportSize(PHONE);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    const w = window as unknown as { __stripeShifts: number[]; __cls: number };
    w.__stripeShifts = [];
    w.__cls = 0;
    const inStripe = (n: Node | null) => !!n?.parentElement?.closest('.hero-stripe') || (n instanceof Element && !!n.closest('.hero-stripe'));
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; sources?: { node: Node | null }[] })[]) {
        w.__cls += e.value;
        if (e.sources?.some((s) => inStripe(s.node))) w.__stripeShifts.push(e.value);
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('./');
  await expect.poll(() => offTitle(page), { message: 'the band never settled on the title' }).toBeLessThan(2);
  // Two frames, so a shift caused by the placement has been recorded.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const { shifts, cls } = await page.evaluate(() => {
    const w = window as unknown as { __stripeShifts: number[]; __cls: number };
    return { shifts: w.__stripeShifts, cls: w.__cls };
  });
  expect(shifts, 'layout shifts whose source is the hero band').toEqual([]);
  // Also bounded without attribution: Chrome names at most five sources per shift,
  // and how it names a pseudo-element is its choice, so the check above could go
  // quiet on a browser update while this one still sees the jump.
  expect(cls, 'the page\'s total layout shift').toBeLessThan(GOOD_CLS);
});
