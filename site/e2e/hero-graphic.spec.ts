import { test, expect, type Page } from '@playwright/test';

/**
 * The homepage hero's graphic (HeroGraphic.astro) runs a pointer parallax and ten
 * infinite CSS animations. These tests assert the mechanism, never frame timing,
 * which is too noisy to gate on (tucca-cellag/caail-planning#650):
 *
 * - a burst of pointer moves reads the hero's box at most once and writes the two
 *   parallax properties once each per frame, through a passive listener;
 * - the animations pause while the hero is off-screen and resume when it returns;
 * - under reduced motion there is no animation and no parallax, as before.
 */

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

// The play states of the CSS animations running inside the hero graphic.
function heroAnimations(page: Page) {
  return page.evaluate(() => {
    const hg = document.querySelector('.hero .hg') as Element;
    const anims = document.getAnimations().filter((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target;
      return target instanceof Element && hg.contains(target);
    });
    return { count: anims.length, states: [...new Set(anims.map((a) => a.playState))].sort() };
  });
}

test('a burst of pointer moves over the hero reads its box at most once and writes the parallax once per frame', async ({ page }) => {
  await page.addInitScript(instrument);
  await page.goto('./');
  await expect(page.locator('.hero .hg')).toBeVisible();

  const m = await burst(page, 20);
  // Every pointermove listener on the hero is passive, and there is at least one.
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
  await expect.poll(() => heroAnimations(page)).toEqual({ count: 10, states: ['running'] });

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => heroAnimations(page)).toEqual({ count: 10, states: ['paused'] });

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => heroAnimations(page)).toEqual({ count: 10, states: ['running'] });
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
