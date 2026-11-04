import { test, expect, type Page } from '@playwright/test';

/**
 * The homepage hero's graphic (HeroGraphic.astro) runs a pointer parallax and a set of
 * infinite CSS animations. These tests assert the mechanism, never frame timing,
 * which is too noisy to gate on (tucca-cellag/caail-planning#650):
 *
 * - a burst of pointer moves reads the hero's box at most once and writes the two
 *   parallax properties once each per frame, through a passive listener;
 * - the animations pause while the hero is off-screen and resume when it returns;
 * - under reduced motion there is no animation and no parallax, as before;
 * - on a layout that hides the graphic, moves write nothing;
 * - while the graphic is off-screen the parallax rests, and only a new move shifts it.
 */

// Hero.astro hides the graphic on narrow layouts, so these need a desktop viewport.
// Pinned here so a narrower project default fails as a missing graphic, not as broken
// logic. The one test about the hidden layout sets its own.
test.use({ viewport: { width: 1280, height: 720 } });

type Probe = { rects: number; writes: number; options: unknown[] };

// Installed before any page script runs, so it sees the component's own listener.
// Counts layout reads of the hero's box and writes of the parallax properties, and
// records the options each pointermove listener on the hero was added with.
function instrument() {
  const w = window as unknown as { __hg: Probe };
  w.__hg = { rects: 0, writes: 0, options: [] };
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this.classList.contains('hero')) w.__hg.rects++;
    return rect.call(this);
  };
  const setProperty = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (this: CSSStyleDeclaration, name: string, value: string | null, priority?: string) {
    if (name === '--hgx' || name === '--hgy') w.__hg.writes++;
    return setProperty.call(this, name, value, priority);
  };
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (type === 'pointermove' && this instanceof Element && this.classList.contains('hero')) {
      w.__hg.options.push(options ?? null);
    }
    return add.call(this, type, listener, options);
  };
}

// Dispatches `n` pointer moves across the hero in one task, then waits two frames.
async function burst(page: Page, n: number) {
  return page.evaluate(async (count) => {
    const w = window as unknown as { __hg: Probe };
    const hero = document.querySelector('.hero') as HTMLElement;
    const hg = document.querySelector('.hero .hg') as HTMLElement;
    const r = hero.getBoundingClientRect();
    w.__hg.rects = 0;
    w.__hg.writes = 0;
    for (let i = 0; i < count; i++) {
      hero.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: r.left + r.width * (0.1 + (0.76 * i) / Math.max(1, count - 1)),
        clientY: r.top + r.height * 0.25,
      }));
    }
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    return {
      rects: w.__hg.rects,
      writes: w.__hg.writes,
      hgx: hg.style.getPropertyValue('--hgx'),
      hgy: hg.style.getPropertyValue('--hgy'),
      options: w.__hg.options,
    };
  }, n);
}

// The play states of the CSS animations running inside the hero graphic. Transitions
// are left out: the parallax's transform transition is not one of the ambient loops.
function heroAnimations(page: Page) {
  return page.evaluate(() => {
    const hg = document.querySelector('.hero .hg') as Element;
    const anims = document.getAnimations().filter((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target;
      return a instanceof CSSAnimation && target instanceof Element && hg.contains(target);
    });
    return { count: anims.length, states: [...new Set(anims.map((a) => a.playState))].sort() };
  });
}

// How many CSS animations the rendered elements of the hero graphic carry, read from
// the page rather than typed here, so adding a loop to the markup does not break the
// count. Unrendered elements (a hidden variant) run none, and one element can run several.
function animatedLoops(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.hero .hg *')]
      .filter((el) => el.getClientRects().length > 0)
      .reduce((n, el) => n + getComputedStyle(el).animationName.split(',').filter((a) => a.trim() !== 'none').length, 0),
  );
}

// The two parallax properties as written on the graphic, 0 where unset.
function parallax(page: Page) {
  return page.locator('.hero .hg').evaluate((el) => [
    Number((el as HTMLElement).style.getPropertyValue('--hgx') || 0),
    Number((el as HTMLElement).style.getPropertyValue('--hgy') || 0),
  ]);
}

function isMarkedOffscreen(page: Page) {
  return page.locator('.hero .hg').evaluate((el) => el.hasAttribute('data-offscreen'));
}

test('a burst of pointer moves over the hero reads its box at most once and writes the parallax once per frame', async ({ page }) => {
  await page.addInitScript(instrument);
  await page.goto('./');
  await expect(page.locator('.hero .hg')).toBeVisible();

  const m = await burst(page, 20);
  // Every pointermove listener on the hero is passive, and there is at least one. #650's
  // criteria ask for it; passive changes nothing for pointermove (only touch and wheel
  // listeners can block scrolling), so this records that the handler never cancels.
  expect(m.options.length).toBeGreaterThan(0);
  for (const o of m.options) expect(o).toMatchObject({ passive: true });
  // One frame passed, so one write of each property, and the box was read at most
  // once rather than once per move (20 reads and 40 writes before the fix).
  expect(m.rects).toBeLessThanOrEqual(1);
  expect(m.writes).toBe(2);
  // The parallax still follows the pointer: the last move sat 86% across and 25%
  // down the hero, so the properties read 0.36 and -0.25.
  expect(Number(m.hgx)).toBeCloseTo(0.36, 2);
  expect(Number(m.hgy)).toBeCloseTo(-0.25, 2);
});

test('the hero animations pause while it is off-screen and resume when it returns', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.hero .hg')).toBeVisible();
  const loops = await animatedLoops(page);
  expect(loops).toBeGreaterThan(0);
  await expect.poll(() => heroAnimations(page)).toEqual({ count: loops, states: ['running'] });

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  // The precondition, so a page too short to scroll the graphic away fails as that.
  await expect.poll(() => page.locator('.hero .hg').evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThan(0);
  await expect.poll(() => heroAnimations(page)).toEqual({ count: loops, states: ['paused'] });

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => heroAnimations(page)).toEqual({ count: loops, states: ['running'] });
});

test('under reduced motion the hero graphic neither animates nor follows the pointer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(instrument);
  await page.goto('./');
  await expect(page.locator('.hero .hg')).toBeVisible();

  expect(await heroAnimations(page)).toEqual({ count: 0, states: [] });
  const m = await burst(page, 5);
  expect(m.writes).toBe(0);
  expect(m.options).toEqual([]);
});

test.describe('on a layout that hides the graphic', () => {
  test.use({ viewport: { width: 800, height: 720 } });

  test('pointer moves over the hero read nothing and write no parallax', async ({ page }) => {
    await page.addInitScript(instrument);
    await page.goto('./');
    // The precondition: Hero.astro hides the graphic at this width, and the script marks it.
    await expect(page.locator('.hero .hg')).toBeHidden();
    await expect.poll(() => isMarkedOffscreen(page)).toBe(true);

    const m = await burst(page, 10);
    expect(m.rects).toBe(0);
    expect(m.writes).toBe(0);
  });
});

test('while the graphic is off-screen the parallax rests, and only a new move shifts it again', async ({ page }) => {
  await page.addInitScript(instrument);
  await page.goto('./');
  await expect(page.locator('.hero .hg')).toBeVisible();

  // Shift the parallax off its rest position first.
  const before = await burst(page, 20);
  expect(Number(before.hgx)).toBeCloseTo(0.36, 2);

  // Scroll the graphic just past the top edge: it returns to rest, and moves write nothing.
  await page.evaluate(() => {
    const hg = document.querySelector('.hero .hg') as HTMLElement;
    window.scrollTo(0, hg.getBoundingClientRect().bottom + window.scrollY + 10);
  });
  await expect.poll(() => isMarkedOffscreen(page)).toBe(true);
  expect(await parallax(page)).toEqual([0, 0]);
  const away = await burst(page, 5);
  expect(away.writes).toBe(0);

  // Back on screen with no further move, nothing is written and it stays at rest.
  await page.evaluate(() => {
    (window as unknown as { __hg: Probe }).__hg.writes = 0;
    window.scrollTo(0, 0);
  });
  await expect.poll(() => isMarkedOffscreen(page)).toBe(false);
  const returned = await page.evaluate(async () => {
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    return (window as unknown as { __hg: Probe }).__hg.writes;
  });
  expect(returned).toBe(0);
  expect(await parallax(page)).toEqual([0, 0]);

  // The next move applies normally.
  const after = await burst(page, 20);
  expect(after.writes).toBe(2);
  expect(Number(after.hgx)).toBeCloseTo(0.36, 2);
});
