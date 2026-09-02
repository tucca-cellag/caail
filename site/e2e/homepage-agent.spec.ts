/**
 * The homepage agent bands: scroll reveal, the setup tabs, and the hero counter.
 *
 * The reveal tests exist because this exact failure has already shipped once here. An
 * earlier version faded sections in from `opacity: 0` under `animation-fill-mode: both`,
 * which left them completely blank in any renderer where the timeline never advanced —
 * and the entire e2e suite stayed green, because every assertion queried the DOM and the
 * DOM was perfect. Text was present, attached, and invisible.
 *
 * So these assert on COMPUTED OPACITY, not on presence. A test that only checks the
 * markup cannot see this class of bug at all.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Effective opacity of every `.sr` element, after transitions have had time to settle.
 *
 * The reveal fades as well as lifts, so opacity legitimately reaches 0 mid-flight. What
 * these assert is the property that must hold once things SETTLE: an element that is on
 * screen, or that the reveal system was never armed for, is never left transparent.
 *
 * That is the bug worth guarding. A fade is only safe while every escape route restores
 * opacity — the no-JS path, `prefers-reduced-motion`, print, and the load-time pass for
 * content already in the first viewport. Break any one of them and content ships blank
 * with a flawless DOM, which is precisely how this shipped the first time.
 *
 * VISIBLE_ENOUGH is loose on purpose: the failure being guarded is an element stuck at
 * 0, and a tight threshold would test the sampling clock rather than the property.
 */
const VISIBLE_ENOUGH = 0.5;
async function revealOpacities(page: import('@playwright/test').Page) {
  return page.locator('.sr').evaluateAll((els) =>
    els.map((e) => ({ cls: e.className, opacity: parseFloat(getComputedStyle(e).opacity) })),
  );
}

test.describe('scroll reveal', () => {
  test('content is visible when the reveal system is never armed (the no-JS path)', async ({ page }) => {
    await page.goto('./');
    // `sr-ready` is what an inline script adds once it has confirmed IntersectionObserver
    // exists. Without JS it is never added. Removing it reproduces that exactly.
    await page.evaluate(() => document.documentElement.classList.remove('sr-ready'));
    await page.waitForTimeout(1200);

    const items = await revealOpacities(page);
    expect(items.length, 'no .sr elements found — the selector has drifted').toBeGreaterThan(3);
    const hidden = items.filter((i) => i.opacity < VISIBLE_ENOUGH);
    expect(hidden, `unarmed reveal left content invisible: ${JSON.stringify(hidden)}`).toEqual([]);
  });

  test('every revealed section actually becomes visible when scrolled to', async ({ page }) => {
    await page.goto('./');
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 80));
      }
    });
    await page.waitForTimeout(1000);

    const stranded = (await revealOpacities(page)).filter((i) => i.opacity < VISIBLE_ENOUGH);
    expect(stranded, `sections never revealed: ${JSON.stringify(stranded)}`).toEqual([]);
  });

  /**
   * Nothing visible on the landing screen may be transparent, without scrolling.
   *
   * The trigger line sits at 75% of the viewport, so an element in the bottom quarter of
   * the first screen is on screen but has not met the observer's condition. While the
   * reveal only lifted, that was invisible as a defect. Now that it fades, it would be a
   * blank strip on the page everybody sees first, so RevealScript reveals whatever is
   * already on screen at load. This is the test for that guarantee.
   */
  test('nothing already on screen at load is left transparent', async ({ page }) => {
    await page.goto('./');
    await page.waitForTimeout(1400); // no scrolling at all — that is the point

    const onScreenHidden = await page.locator('.sr').evaluateAll((els) =>
      els
        .map((e) => ({
          cls: e.className,
          opacity: parseFloat(getComputedStyle(e).opacity),
          top: Math.round(e.getBoundingClientRect().top),
        }))
        .filter((i) => i.top < window.innerHeight && i.opacity < 0.5),
    );
    expect(
      onScreenHidden,
      `visible on the landing screen but transparent: ${JSON.stringify(onScreenHidden)}`,
    ).toEqual([]);
  });

  /**
   * An accessibility preference must never cost someone the content.
   *
   * reveal.css resets BOTH transform and opacity under reduced motion. Resetting only the
   * transform — the shape the rule had while the reveal was transform-only — would now
   * leave every unrevealed element at opacity 0 for exactly the users least able to
   * tolerate it.
   */
  test('reduced motion leaves all content fully visible without scrolling', async ({ page }) => {
    // `page.emulateMedia`, NOT `test.use({ reducedMotion })`. The fixture form silently
    // did not apply here — `matchMedia('(prefers-reduced-motion: reduce)')` still reported
    // false inside the test — so the assertion ran against a normal-motion page and failed
    // for a reason that had nothing to do with the CSS it was written to guard. A media
    // emulation that quietly does not emulate is worse than no test, because it fails
    // loudly in the wrong place and invites "fixing" working code.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    await page.waitForTimeout(900);

    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      'reduced-motion emulation is not in effect, so this test proves nothing',
    ).toBe(true);

    const hidden = (await revealOpacities(page)).filter((i) => i.opacity < VISIBLE_ENOUGH);
    expect(hidden, `reduced motion hid content: ${JSON.stringify(hidden)}`).toEqual([]);
  });

  /**
   * The regression this suite could not see.
   *
   * The test above scrolls in 400px steps, which is a gradual scroll, and a gradual scroll
   * has always worked. Real navigation is not gradual: a rail-TOC click, a scrollbar drag,
   * End, or landing on a #hash moves the page instantly. IntersectionObserver reports a
   * CHANGE in intersection, so an element that goes from below the viewport to above it
   * between two samples never produces a callback at all — measured here as 21 of 26
   * elements left permanently at translateY(34px).
   *
   * It also asserts on TRANSFORM, not opacity. The reveal is transform-only, so every
   * opacity assertion in this file reads 1 for a stuck element. That is why the suite was
   * green while the page was visibly broken.
   */
  test('an instant jump does not strand sections mid-reveal', async ({ page }) => {
    await page.goto('./');
    await page.waitForTimeout(400);

    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    // Longer than the slowest reveal can possibly take: 0.72s transition plus the 0.5s
    // `.sr-d5` delay. Sampling at 1.2s caught an element still legitimately in flight and
    // reported it as stranded.
    await page.waitForTimeout(1800);

    const stranded = await page.locator('.sr').evaluateAll((els) =>
      els
        .map((e) => ({
          cls: e.className,
          // m42 is the vertical translation of the resolved transform matrix.
          offset: Math.round(new DOMMatrix(getComputedStyle(e).transform).m42),
        }))
        .filter((e) => Math.abs(e.offset) > 1),
    );
    expect(
      stranded,
      `an instant scroll left ${stranded.length} sections offset — the observer skipped them`,
    ).toEqual([]);
  });

  test('reduced motion shows everything without waiting on the observer', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('./');
    await page.waitForTimeout(400);

    // No scrolling at all: under reduced motion the hidden state must not apply, so
    // even far-below-the-fold sections are already at full opacity.
    const hidden = (await revealOpacities(page)).filter((i) => i.opacity < VISIBLE_ENOUGH);
    expect(hidden, `reduced motion hid content: ${JSON.stringify(hidden)}`).toEqual([]);
    await ctx.close();
  });
});

/**
 * The diagonal stripe must reach the header with no white wedge above it.
 *
 * This has now regressed twice, both times from a change nowhere near Hero.astro. The
 * stripe rises to the right and is clipped by its own wrapper, so any gap between the
 * wrapper's top and the header's bottom shows as a white triangle in the top-right corner.
 * The wrapper is pinned with a negative `top` calibrated to the content panel's padding,
 * which means ANY extra space above the hero reopens it.
 *
 * The second regression was caused by mounting two invisible components (a script and a
 * nav) above the hero: they added no height, but they made the hero a non-first sibling,
 * which handed it Starlight's 16px prose margin. Nothing in the hero's own code changed.
 *
 * So this asserts the geometric property directly rather than any CSS value, because the
 * value that breaks it is never in the file you would think to look at.
 */
test('the hero stripe meets the header with no gap', async ({ page }) => {
  await page.goto('./');
  await page.waitForTimeout(500);

  const gap = await page.evaluate(() => {
    const header = document.querySelector('header.header')?.getBoundingClientRect();
    const stripe = document.querySelector('.hero-stripe')?.getBoundingClientRect();
    if (!header || !stripe) return null;
    return { headerBottom: +header.bottom.toFixed(1), stripeTop: +stripe.top.toFixed(1) };
  });

  expect(gap, '.hero-stripe or header.header not found — selectors have drifted').not.toBeNull();
  // <= 0 means the stripe starts at or above the header's lower edge, so the band is
  // already at full width by the time it becomes visible.
  expect(
    gap!.stripeTop - gap!.headerBottom,
    `white wedge above the stripe: header ends at ${gap!.headerBottom}, stripe starts at ${gap!.stripeTop}`,
  ).toBeLessThanOrEqual(0);
});

test.describe('Connect your agent', () => {
  /**
   * Asserts the PROPERTY (the default panel renders usable content with no interaction),
   * not which path happens to lead. This pinned `raw.githubusercontent.com` until Claude
   * Science took first position, then went red on a pure reorder that broke nothing. A
   * test that fails when the thing it names still works is asserting an accident.
   */
  test('the first panel is readable before any interaction', async ({ page }) => {
    await page.goto('./');
    const first = page.locator('.gs .panel').first();
    await expect(first).toBeVisible();
    const code = first.locator('code').first();
    await expect(code).toBeVisible();
    // CONTENT, not merely length. `length > 8` passed on any nine characters, which is not
    // what "readable" means and not what this comment used to claim it guarded. Matching the
    // union of the two values that can legitimately lead keeps the reorder-independence the
    // docblock argues for without giving up the assertion.
    await expect(code).toHaveText(/tucca-cellag\/caail|raw\.githubusercontent\.com/);
  });

  /**
   * Clicking copy must not resize the button.
   *
   * The button holds two icons and swaps them by `display`. The check mark inherited
   * Starlight's 16px prose-flow margin, which is inert while the icon is `display: none` —
   * so the button measured right, screenshotted right, and passed everything, right up
   * until a human clicked it and the box jumped 16px taller, shoving the command row down.
   *
   * This is why the assertion is a MEASUREMENT taken across a real click rather than a
   * check that the class toggled: the class toggle was always correct. Only the geometry
   * was wrong, and only after interaction.
   */
  /**
   * The value and its copy button share an optical centre.
   *
   * Two children of different intrinsic heights: one line of 12px mono is 1.2rem, the copy
   * button is 1.6rem. The button sets the well's height, so without an explicit floor the
   * text pins to the top and sits ~3px high. Starlight adds a second, quieter way to break
   * it: `.sl-markdown-content code { margin-block: -0.125rem }` shifts the code -2px unless
   * `starlight-overrides.css` cancels it, and that override entry reads as removable to
   * anyone who has not measured it. Both failures are a few pixels, invisible in a
   * screenshot review, and neither is caught by anything else here.
   */
  test('a one-line value is centred against its copy button', async ({ page }) => {
    await page.goto('./');
    const panel = page.locator('.gs .panel:not([hidden])');
    const code = panel.locator('.val code');
    const btn = panel.locator('.val .copy');
    await expect(code).toBeVisible();
    const c = await code.boundingBox();
    const b = await btn.boundingBox();
    // Single-line only: a wrapped value legitimately grows past the button, and the button
    // is meant to stay at the top of the block there rather than drift to its middle.
    expect(Math.round(c!.height), 'default panel value is not one line').toBeLessThan(30);
    const drift = Math.abs((c!.y + c!.height / 2) - (b!.y + b!.height / 2));
    expect(
      drift,
      `value and copy button are ${drift.toFixed(1)}px out of alignment`,
    ).toBeLessThanOrEqual(1);
  });

  test('the copy button does not change size when clicked', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./');
    const btn = page.locator('.gs .copy').first();
    await btn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const box = async () => {
      const r = await btn.boundingBox();
      // `:has(.copy)`, not `.first()`. The leading panel's first step is an ACTION row
      // with no button, so `.first()` measured a row structurally incapable of the
      // growth this test names, and passed for the wrong reason.
      const row = await page.locator('.gs .step:has(.copy)').first().boundingBox();
      return { w: Math.round(r!.width), h: Math.round(r!.height), rowH: Math.round(row!.height) };
    };

    const before = await box();
    await btn.click();
    await expect(btn).toHaveClass(/is-done/); // the swap really happened
    await page.waitForTimeout(120);
    const after = await box();

    expect(after, `copy button resized on click: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`).toEqual(before);
  });

  /**
   * Two copies in quick succession must not cut each other short.
   *
   * Each `.setup` holds several copy buttons but a single <output>. With a timer armed per
   * button, copying one command and then another a second later left the first button's 2s
   * timer running against that shared live region, so it wiped the second copy's
   * announcement one second in. Only a screen-reader user ever perceives it, which is
   * precisely why it needs an assertion rather than a look.
   *
   * It now copies ACROSS tabs rather than within one panel. Once steps were split into
   * values and actions, only values carry a copy button and no panel exposes two at once.
   * The race is untouched by that: the <output> is shared per `.setup`, not per panel, so
   * two copies from different tabs contend for the same live region exactly as two from
   * one panel used to. If anything it is the likelier path, since a reader comparing
   * install routes copies from one tab and then another.
   */
  test('a second copy does not have its announcement wiped by the first', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./');

    const tabs = page.locator('.gs [role="tab"]');
    const count = await tabs.count();
    const visibleCopy = page.locator('.gs .panel:not([hidden]) .copy');

    // Find two tabs that each offer something copyable.
    const withCopy: number[] = [];
    for (let i = 0; i < count && withCopy.length < 2; i++) {
      await tabs.nth(i).click();
      if ((await visibleCopy.count()) > 0) withCopy.push(i);
    }
    expect(
      withCopy.length,
      'fewer than two tabs expose a copy button — the shared-output race cannot be exercised',
    ).toBe(2);

    const live = page.locator('.gs output');
    await tabs.nth(withCopy[0]).click();
    await visibleCopy.first().click();
    await page.waitForTimeout(1100);
    await tabs.nth(withCopy[1]).click();
    await visibleCopy.first().click();
    // Now past the FIRST button's 2s deadline, but well inside the second's.
    await page.waitForTimeout(1100);

    await expect(
      live,
      "the first copy's timer wiped the second copy's announcement",
    ).toHaveText('Copied to clipboard');
    expect(
      await page.locator('.gs .copy.is-done').count(),
      'more than one copy button left showing the done glyph',
    ).toBe(1);
  });

  test('tabs switch panels and keep exactly one in the tab order', async ({ page }) => {
    await page.goto('./');
    const tabs = page.locator('.gs [role="tab"]');
    const count = await tabs.count();
    expect(count).toBeGreaterThan(1);

    for (let i = 0; i < count; i++) {
      await tabs.nth(i).click();
      // Exactly one panel visible, and it is the one this tab controls.
      const id = await tabs.nth(i).getAttribute('aria-controls');
      await expect(page.locator(`#${id}`)).toBeVisible();
      const visible = await page.locator('.gs .panel:not([hidden])').count();
      expect(visible, 'more than one setup panel visible at once').toBe(1);

      // Roving tabindex: one 0, the rest -1.
      const tabindexes = await tabs.evaluateAll((els) => els.map((e) => (e as HTMLElement).tabIndex));
      expect(tabindexes.filter((t) => t === 0), 'roving tabindex broken').toHaveLength(1);
    }
  });

  test('arrow keys move between tabs and wrap', async ({ page }) => {
    await page.goto('./');
    const tabs = page.locator('.gs [role="tab"]');
    const count = await tabs.count();
    await tabs.first().click();
    await tabs.first().press('ArrowLeft'); // wraps to the last
    await expect(tabs.nth(count - 1)).toHaveAttribute('aria-selected', 'true');
    await tabs.nth(count - 1).press('ArrowRight'); // wraps back to the first
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  });

  /**
   * Both instances, because the reserve is set per instance and only one was guarded.
   *
   * SetupTabs reserves panel height with a min-height, and `.setup--compact` (the hero)
   * reserved 9rem against panels that measure roughly 200-240px. So every hero tab click
   * resized the hero and shoved the router strip and everything below it out from under
   * the pointer, and re-ran the stripe ResizeObserver that Hero.astro is written not to
   * provoke. The `.gs` instance was guarded and correct the whole time.
   *
   * That is the argument for parameterising rather than copying: one covered instance and
   * one uncovered one is how a property that reads as tested goes untested.
   */
  for (const root of ['.gs', '.hero'])
  for (const width of [1280, 600, 560]) {
    test(`switching tabs does not change the section height, no page jump (${root} @ ${width}px)`, async ({ page }) => {
      // Three widths for two reserves. 1280px is the two-column topology; 600px and 560px
      // are both the stacked one.
      //
      // 600 and 560 are NOT redundant, and the reason is not that a different panel peaks
      // at each. Measured with `min-height: 0` forced, the Claude Science panel is tallest
      // at every sampled width: 263px from 545 to 959, 164px from 960 to 1600. What differs
      // is the RUNNER-UP, and that is what 560 buys: the cli panel is 203px at 600 and 243px
      // at 560, so if the science panel ever shrank below 243 the reserve would stop being
      // governed by it, and 560 is the width where that hands over.
      //
      // These figures have now gone stale TWICE, and the second time is the instructive one.
      // The first version quoted 236/195 from the single-column layout. The replacement was
      // written in the same round that restored the Starlight list-margin override, which
      // took 2 x 4px off every three-step panel and moved every number here, and only
      // `SetupTabs.astro` was updated. So a comment carrying "Re-measured" and scolding its
      // own predecessor was stale within one commit. The lesson is not to measure more
      // carefully; it is that the same numbers live in two files with nothing tying them
      // together, and re-deriving them is one `min-height: 0` sweep.
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./');
      // The section's own height is what everything below it sits on, so holding that
      // constant is the invariant. Measuring a sibling is indirect and, on the splash
      // layout, the next sibling is not always a laid-out box.
      const section = page.locator(root);
      const tabs = page.locator(`${root} [role="tab"]`);
      const count = await tabs.count();
      expect(count, `no tabs found under ${root} — the selector has drifted`).toBeGreaterThan(1);

      const heights: number[] = [];
      for (let i = 0; i < count; i++) {
        await tabs.nth(i).click();
        await page.waitForTimeout(120);
        const box = await section.boundingBox();
        expect(box).not.toBeNull();
        heights.push(Math.round(box!.height));
      }
      expect(
        new Set(heights).size,
        `${root}: the panel reserve is too small — section height varied across tabs: ${heights.join(', ')}`,
      ).toBe(1);
    });
  }
});

test('the hero counter renders a real statistic before the typewriter runs', async ({ page }) => {
  await page.goto('./');
  // Scoped to `.tick`, the LIVE counter. `.hero .tick-n` also matches the hidden width
  // reserve, which renders every entry in the same classes on purpose — it has to measure
  // identically to be a valid reserve — so the unscoped selector matches five elements.
  // Server-rendered complete, so no JS (or a script error) still leaves a real number.
  await expect(page.locator('.hero .tick .tick-n')).toHaveText(/^\d+$/);
  await expect(page.locator('.hero .tick .tick-l')).not.toBeEmpty();
  const entries = JSON.parse((await page.locator('.hero .tick').getAttribute('data-stats')) ?? '[]');
  expect(entries.length, 'the typewriter has nothing to cycle through').toBeGreaterThan(1);
});

/**
 * The counter's column is sized by a hidden reserve holding every entry, so it is as wide
 * as the widest one at whatever size the text actually renders — which is what lets the
 * routes beside it wrap on content rather than on a breakpoint.
 *
 * Every width-based gate tried before this was blind to text scaling. `rem` in a media
 * query resolves against the browser's INITIAL font size, so raising the default font size
 * left the gate meaning the same pixel width while every word grew: 204px of overlap at
 * 125%, 326px at 200%. A container query in `em` fixed that and still missed a reader's
 * minimum-font-size setting, which grows the label without growing the column: 82px of
 * overlap at a 20px minimum. `nowrap` means none of it reflows, so two blocks of text
 * simply paint over each other with nothing to signal it.
 *
 * This asserts the property that replaced all of that: at any text size, the routes either
 * clear the counter or have moved to their own line.
 */
test('the ways-in list never collides with the counter, at any text size', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const scale of [1, 1.25, 1.5, 2]) {
    for (const minFontPx of [0, 20, 24]) {
      await page.goto('./');
      if (scale !== 1) {
        await page.addStyleTag({ content: `html { font-size: ${16 * scale}px !important; }` });
      }
      if (minFontPx) {
        await page.addStyleTag({
          content: `.tick-l, .ways, .ways *, .tick-cap { font-size: ${minFontPx}px !important; }`,
        });
      }

      const r = await page.evaluate(() => {
        const tick = document.querySelector<HTMLElement>('.hero .tick')!;
        // worst case: the widest entry, fully typed
        tick.querySelector('.tick-n')!.textContent = '139';
        tick.querySelector('.tick-l')!.textContent = 'software tools';
        const ways = document.querySelector('.hero .ways')!.getBoundingClientRect();
        // The counter's CONTENT edge, not its box. That distinction is the whole test:
        // `nowrap` makes an over-wide counter overflow its own track, so the boxes stay
        // neatly side by side while the painted text runs straight through the routes.
        // Measuring `.tick-col`'s rect reports no collision in exactly the case that
        // motivated this assertion.
        const kids = [...tick.children].map((k) => k.getBoundingClientRect());
        const contentRight = Math.max(...kids.map((k) => k.right));
        const contentLeft = Math.min(...kids.map((k) => k.left));
        const contentTop = Math.min(...kids.map((k) => k.top));
        const contentBottom = Math.max(...kids.map((k) => k.bottom));
        // Two things collide only when they overlap on BOTH axes. Beside the counter the
        // routes are clear horizontally; wrapped beneath it they are clear vertically.
        // Either is fine; overlapping on both is text painted over text.
        return {
          overlapsX: ways.left < contentRight - 1 && ways.right > contentLeft + 1,
          overlapsY: ways.top < contentBottom - 1 && ways.bottom > contentTop + 1,
          layout: ways.left >= contentRight - 1 ? 'beside' : 'wrapped',
          intrusionPx: Math.round(contentRight - ways.left),
        };
      });

      expect(
        r.overlapsX && r.overlapsY,
        `at ${scale * 100}% text${minFontPx ? ` + ${minFontPx}px minimum` : ''}: the counter ` +
          `runs ${r.intrusionPx}px into the routes (layout read as "${r.layout}")`,
      ).toBe(false);
    }
  }
});

test('the hero never changes height while the counter types (stripe ResizeObserver)', async ({ page }) => {
  await page.goto('./');
  // Hero.astro pins the diagonal stripe to the title's rect via a ResizeObserver on
  // `.hero`. A counter line that collapsed when the text emptied mid-erase would re-run
  // that measurement several times per cycle, forever. This is a regression test, not a
  // precaution: reserving only the number's own height left a real 3px oscillation,
  // because `align-items: baseline` makes the line taller than its tallest child.
  const heights = await page.evaluate(async () => {
    const tick = document.querySelector<HTMLElement>('.hero .tick')!;
    const hero = document.querySelector<HTMLElement>('.hero')!;
    const nEl = tick.querySelector<HTMLElement>('.tick-n')!;
    const lEl = tick.querySelector<HTMLElement>('.tick-l')!;
    const entries: [string, string][] = JSON.parse(tick.dataset.stats ?? '[]');
    const seen = new Set<number>();
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

    // Walk every entry through every intermediate typing state, including fully empty.
    for (const [n, label] of entries) {
      for (let chars = 0; chars <= n.length + 1 + label.length; chars++) {
        nEl.textContent = n.slice(0, Math.min(chars, n.length));
        const intoLabel = chars - n.length - 1;
        lEl.textContent = intoLabel > 0 ? label.slice(0, intoLabel) : '';
        await frame();
        seen.add(Math.round(hero.getBoundingClientRect().height));
      }
    }
    return [...seen];
  });
  expect(heights.length, `hero height varied while typing: ${heights.join(', ')}px`).toBe(1);
});

/**
 * The #why mock claims a specific matrix cell and then answers it with real numbers. Both
 * halves must describe the SAME cell.
 *
 * They did not. The method and area were constants at the top of the component, but the
 * area label inside the mock was a hardcoded literal, so changing the example cell left
 * the API line advertising "Ensemble Learning × Media Optimization" while the answer
 * below it reported the 23 papers of the sensory cell. Every test passed: each half was
 * independently well-formed, and nothing compared them. Derived from the served API, so
 * this stays honest as the corpus grows.
 */
test('the #why mock answers the same cell it claims to query', async ({ page }) => {
  await page.goto('./');

  const claimed = (await page.locator('#why .bubble--tool code').innerText()).trim();
  const answer = (await page.locator('#why .half--index .bubble').last().innerText()).trim();

  const m = /matrix\.json\s*→\s*(.+?)\s*×\s*(.+)$/.exec(claimed);
  expect(m, `could not parse the API line: "${claimed}"`).not.toBeNull();
  const [, method, areaLabel] = m!;

  const matrix = await page.evaluate(async (base) => {
    const res = await fetch(`${base}api/matrix.json`);
    return (await res.json()) as { cells: { method: string; areaLabel: string; refIds: number[] }[] };
  }, new URL(page.url()).pathname.replace(/[^/]*$/, ''));

  const cell = matrix.cells.find((c) => c.method === method && c.areaLabel === areaLabel);
  expect(cell, `the mock claims a cell that is not in matrix.json: ${method} × ${areaLabel}`).toBeTruthy();

  // The answer opens with the paper count for that cell.
  const stated = Number(/^(\d+)\s+papers/.exec(answer)?.[1]);
  expect(
    stated,
    `mock claims ${method} × ${areaLabel} (${cell!.refIds.length} papers) but answers "${answer.slice(0, 60)}"`,
  ).toBe(cell!.refIds.length);
});

/**
 * The worked-queries carousel.
 *
 * Rotation is deliberately BOUNDED (three dwells per card, then it rests) and deliberately
 * late (it does not start until the card frame is on screen). Both are properties of a
 * clock, so most of what follows drives that clock rather than waiting on it: `hurry()`
 * collapses the 16s dwell to a few milliseconds by restyling the animation the carousel
 * uses as its timer. Waiting the real duration would put a single test at over three
 * minutes and would still be measuring the same property.
 */
test.describe('worked-queries carousel', () => {
  /**
   * Collapse the dwell so a full rotation budget runs in a couple of seconds.
   *
   * 200ms rather than the tempting 40: the whole rotation then lasts 12 x 200ms, and a test
   * that first has to observe rotation IN PROGRESS gets a 2.4s window to do it in. At 40ms
   * that window is ~0.5s, which on a contended runner is a coin toss, and it would fail
   * reporting "expected data-rotating" — a message about the harness, not about the
   * property under test. This repo already has a ticket for tests that fail under load.
   */
  const hurry = (page: import('@playwright/test').Page, ms = 200) =>
    page.addStyleTag({ content: `.ask .prog.run { animation-duration: ${ms}ms !important; }` });

  /** Scrolling the stack into view is what arms the rotation, so most tests start here. */
  const reachTheBand = async (page: import('@playwright/test').Page) => {
    await page.locator('.ask .stack').scrollIntoViewIfNeeded();
    await expect(page.locator('.ask')).toHaveAttribute('data-rotating', '');
  };

  test('exactly one card is showing, and the frame never resizes as they change', async ({ page }) => {
    await page.goto('./');
    const stack = page.locator('.ask .stack');
    await expect(stack).toBeVisible();

    const pills = page.locator('.ask [data-pill]');
    const n = await pills.count();
    expect(n, 'no carousel pills found — the selector has drifted').toBeGreaterThan(1);

    const heights = new Set<number>();
    for (let i = 0; i < n; i++) {
      await pills.nth(i).click();
      await page.waitForTimeout(650); // let the entrance settle
      heights.add(Math.round((await stack.boundingBox())!.height));

      // `visibility`, not `hidden` — so count what is actually being shown rather than
      // what is in the DOM. Every card is present in the DOM at all times by design.
      const shown = await page.locator('.ask [data-card]').evaluateAll((els) =>
        els.filter((e) => getComputedStyle(e).visibility !== 'hidden').length,
      );
      expect(shown, `card ${i}: ${shown} cards visible at once`).toBe(1);
    }
    expect(
      [...heights],
      `the frame resized between cards (${[...heights].join(', ')}px) — the grid stack is not sizing to the tallest card`,
    ).toHaveLength(1);
  });

  test('the first card is readable with no JavaScript at all', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('./');
    // The controls are inert without JS, but the content must not be.
    await expect(page.locator('.ask [data-card]').first()).toBeVisible();
    await expect(page.locator('.ask [data-card]').first().locator('.q')).not.toBeEmpty();
    await ctx.close();
  });

  /**
   * The clock used to start at parse time, with the band several screens below the fold, so
   * a reader who scrolled down arrived at whatever card the timer had reached and never saw
   * the first one. Asserted on the running ANIMATION rather than on the class, because the
   * class is what the fix touches and the animation is what the reader experiences.
   */
  test('rotation does not start until the band is on screen', async ({ page }) => {
    // Pinned, because this test's premise is that the band is BELOW the fold. Inheriting the
    // default viewport makes the suite silently depend on it, and the failure when it changes
    // would look like a carousel bug.
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./');
    await page.waitForTimeout(1500); // ~ where the old 16s clock would already be a tenth in

    // Belt and braces: if the band is ever on screen at load anyway, say so rather than
    // passing on a premise that no longer holds.
    const box = (await page.locator('.ask .stack').boundingBox())!;
    expect(
      box.y > page.viewportSize()!.height,
      'the band is already on screen at load, so "it has not started yet" is not the property being measured',
    ).toBe(true);

    await expect(page.locator('.ask')).not.toHaveAttribute('data-rotating', '');
    expect(
      await page.locator('.ask .prog').evaluate((el) => el.getAnimations().length),
      'the progress bar is animating while the band is still below the fold',
    ).toBe(0);
    await expect(page.locator('.ask [data-card]').first()).toBeVisible();

    await reachTheBand(page);
    expect(
      await page.locator('.ask .prog').evaluate((el) => el.getAnimations().length),
      'scrolling to the band did not start the rotation',
    ).toBe(1);
  });

  /**
   * Hover-pause and focus-pause were one inline style with two writers, so whichever
   * condition ENDED last won. The commonest form: a keyboard user holds focus in the band,
   * a mouse crosses it and leaves, and the rotation resumes under them.
   */
  test('a passing pointer does not resume rotation under a held focus', async ({ page }) => {
    await page.goto('./');
    await reachTheBand(page);
    const playState = () => page.locator('.ask .prog').evaluate((el) => getComputedStyle(el).animationPlayState);

    await page.locator('.ask [data-pill]').first().focus();
    expect(await playState(), 'focus did not pause the rotation').toBe('paused');

    // Mouse enters the band and leaves again, while focus never moves.
    await page.locator('.ask .stack').hover();
    expect(await playState()).toBe('paused');
    await page.mouse.move(0, 0);
    expect(await playState(), 'the pointer leaving cancelled a pause that focus still holds').toBe('paused');

    // And the mirror image: pointer inside, focus taken and given up.
    await page.locator('.ask .stack').hover();
    await page.locator('.ask [data-pill]').first().focus();
    await page.locator('.ask [data-pill]').first().blur();
    expect(await playState(), 'blurring cancelled a pause that the pointer still holds').toBe('paused');
  });

  /**
   * A live region that speaks on every automatic advance speaks to a reader anywhere on the
   * page, every 16 seconds, for as long as the tab is open — and they may never have been
   * near the band. Automatic movement is not a status message; a response to a control is.
   */
  test('the live region is silent while it rotates and speaks when a control is used', async ({ page }) => {
    await page.goto('./');
    await hurry(page);
    await reachTheBand(page);
    const live = page.locator('.ask [data-live]');

    /**
     * Watch, rather than sample afterwards. Two things have to hold across the WHOLE
     * rotation and an assertion taken once it has finished can see neither of them: that
     * the cards actually advanced — a rotation that never moved would announce nothing and
     * pass triumphantly — and that the region was never written, since a write that
     * something later cleared leaves no trace in the final state. A MutationObserver cannot
     * miss either, where polling at this dwell is a race.
     */
    const observed = await page.evaluate(
      (ms) =>
        new Promise<{ cards: number[]; announcements: string[] }>((resolve) => {
          const root = document.querySelector('.ask')!;
          const pills = [...root.querySelectorAll('[data-pill]')];
          const liveEl = root.querySelector('[data-live]')!;
          const cards = new Set<number>();
          const announcements: string[] = [];
          const readPills = () =>
            pills.forEach((p, i) => {
              if (p.getAttribute('aria-pressed') === 'true') cards.add(i);
            });
          readPills();
          const pillObs = new MutationObserver(readPills);
          pills.forEach((p) => pillObs.observe(p, { attributes: true, attributeFilter: ['aria-pressed'] }));
          const liveObs = new MutationObserver(() => announcements.push(liveEl.textContent ?? ''));
          liveObs.observe(liveEl, { childList: true, characterData: true, subtree: true });
          setTimeout(() => {
            pillObs.disconnect();
            liveObs.disconnect();
            resolve({ cards: [...cards], announcements });
          }, ms);
        }),
      4000, // longer than the whole hurried budget of 12 x 200ms
    );

    expect(
      observed.cards.length,
      'the rotation never advanced, so "it announced nothing" proves nothing',
    ).toBeGreaterThan(1);
    expect(
      observed.announcements,
      `the timer announced its own advances: ${JSON.stringify(observed.announcements)}`,
    ).toEqual([]);

    await page.locator('.ask [data-next]').click();
    await expect(live, 'a reader-initiated change was not announced').not.toBeEmpty();
  });

  /**
   * Picking a card BEFORE the band has been reached must also cancel the rotation that has
   * not started yet.
   *
   * Rotation arms on an IntersectionObserver, so the two orderings differ: stopping a
   * running clock is one thing, cancelling a pending one is another, and only the first was
   * handled. A reader who reaches the band and picks a card in the same movement would have
   * had the rotation start under them a frame later. The window is small, which is the
   * argument for a test rather than against one — nobody would reproduce this by hand.
   */
  test('picking a card before the band is reached cancels the rotation that had not started', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.ask'), 'rotation started before the band was on screen').not.toHaveAttribute(
      'data-rotating',
      '',
    );

    // Click without scrolling the band into view first: Playwright scrolls to the element as
    // part of the click, so the observer fires in the same movement as the interaction.
    await page.locator('.ask [data-pill]').nth(2).click();
    await page.waitForTimeout(600); // well past the observer's callback

    await expect(page.locator('.ask'), 'a pending observer armed the rotation after the reader chose').not.toHaveAttribute(
      'data-rotating',
      '',
    );
    await expect(page.locator('.ask [data-pill]').nth(2), 'the chosen card did not stay chosen').toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await page.locator('.ask .prog').evaluate((el) => el.getAnimations().length)).toBe(0);
  });

  /**
   * The carousel semantics, which are the only thing standing between a screen-reader user
   * and three cards they cannot see.
   *
   * `visibility: hidden` removes the inactive cards from the accessibility tree — that is
   * the WAI-ARIA carousel pattern working, not a bug, but only if the widget says what it
   * is. Nothing in axe checks for that, so it is checked here. The header comment in
   * AskExamples.astro asserted the exact opposite of how `visibility` behaves for months,
   * which is why this property gets an assertion rather than a comment.
   */
  test('the stack describes itself as a carousel of labelled slides', async ({ page }) => {
    await page.goto('./');
    const stack = page.locator('.ask .stack');
    await expect(stack).toHaveAttribute('aria-roledescription', 'carousel');
    await expect(stack).toHaveAttribute('role', 'group');
    await expect(stack, 'aria-roledescription is not announced without an accessible name').toHaveAttribute(
      'aria-label',
      /\S/,
    );

    const cards = page.locator('.ask [data-card]');
    const pills = page.locator('.ask [data-pill]');
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      await expect(cards.nth(i)).toHaveAttribute('aria-roledescription', 'slide');
      // Position AND name: "2 of 4: Media & metabolism". Position alone leaves a listener
      // who arrives mid-band with no idea what they are hearing.
      const tab = ((await pills.nth(i).textContent()) ?? '').trim();
      await expect(cards.nth(i)).toHaveAttribute('aria-label', `${i + 1} of ${n}: ${tab}`);
    }

    // Every control names the thing it drives, and that thing exists.
    const dangling = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.ask [aria-controls]')]
        .filter((el) => !document.getElementById(el.getAttribute('aria-controls')!))
        .map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim()),
    );
    expect(dangling, `controls pointing at a missing id: ${dangling.join(', ')}`).toEqual([]);
    expect(
      await page.locator('.ask [aria-controls]').count(),
      'no control claims to control anything — the pills, dots and arrows should all point at the stack',
    ).toBe(n * 2 + 3); // a pill and a dot each, plus prev / next / rotate
  });

  /**
   * Bounded rotation is the whole reason the other two defects stop mattering: content that
   * moves by itself forever cannot be made acceptable by announcing it more politely.
   */
  test('rotation stops on its own after three passes, and rests on the first card', async ({ page }) => {
    await page.goto('./');
    await hurry(page);
    await reachTheBand(page);

    await expect(page.locator('.ask'), 'the rotation never ended').not.toHaveAttribute('data-rotating', '', {
      timeout: 8000, // the hurried budget is 12 x 200ms, plus room for a slow runner
    });
    const shown = await page.locator('.ask [data-card]').evaluateAll((els) =>
      els.filter((e) => getComputedStyle(e).visibility !== 'hidden').length,
    );
    expect(shown, 'the band came to rest showing something other than exactly one card').toBe(1);
    // Resting on the first card is what tells you every card got its full three turns: end
    // the rotation one dwell earlier and it comes to rest on the last card instead, having
    // given that one two turns and every other one three.
    await expect(
      page.locator('.ask [data-pill]').first(),
      'the rotation ended somewhere other than back at the first card, so a card was short-changed a turn',
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      await page.locator('.ask .prog').evaluate((el) => el.getAnimations().length),
      'the progress bar is still running after the rotation ended',
    ).toBe(0);
  });

  /**
   * WCAG 2.2.2 asks for a mechanism to stop moving content. Pausing on hover is not one for
   * a keyboard or screen-reader user, and "press any other control" is not one you can find.
   */
  test('the rotation control stops the rotation, and its label says which it will do', async ({ page }) => {
    await page.goto('./');
    await reachTheBand(page);
    const btn = page.locator('.ask [data-rotate]');

    await expect(btn).toHaveAttribute('aria-label', /stop/i);
    await btn.click();
    await expect(page.locator('.ask')).not.toHaveAttribute('data-rotating', '');
    await expect(btn).toHaveAttribute('aria-label', /start/i);
    expect(await page.locator('.ask .prog').evaluate((el) => el.getAnimations().length)).toBe(0);

    // And back on, because a control that only stops is a sign, not a mechanism.
    await btn.click();
    await expect(page.locator('.ask')).toHaveAttribute('data-rotating', '');

    /**
     * And it must actually RUN, not merely say it is running.
     *
     * Rotation holds while the pointer or focus is inside the band — and you cannot press
     * this button without the pointer or focus being inside the band. So the act of starting
     * the rotation satisfied its own pause condition: `data-rotating` was set, the icon
     * swapped to pause, the label said "Stop", and the progress bar sat frozen at scaleX(0)
     * until the reader moved the mouse off the whole section. Every state assertion above
     * passed while the feature did nothing, which is why this one measures the clock.
     */
    expect(
      await page.locator('.ask .prog').evaluate((el) => getComputedStyle(el).animationPlayState),
      'the rotation reports itself as running but the clock it runs on is paused',
    ).toBe('running');
  });

  /**
   * Every prose block in a card ends at the same right edge.
   *
   * The closing paragraph carried `max-width: 82ch` while nothing else in the card had a
   * max-width, so at 1440px the head ran to 1014px, the row text to 1014px, and the tail
   * stopped at 724px. Four ragged lines of small type under two full-width blocks reads as
   * text hard-wrapped to a column and pasted in, and that is how a reader described it.
   *
   * Asserted on each block's BOX edge, not on how far its text happens to run. The first
   * version measured the rendered text and had to allow slack for ragged wrapping, which
   * put the threshold (60px) within spitting distance of a real 62px rag on the row text —
   * a test that fails on ordinary word-wrap and would have to be loosened until it could no
   * longer see a small regression. The box edge has no raggedness in it: a constrained
   * measure moves it and normal wrapping does not, so the tolerance can be a couple of
   * pixels of subpixel rounding and mean something.
   *
   * Checked at several widths because the old value was a fixed `ch` measure: it fell short
   * of the card at wide viewports and agreed with it at narrow ones, so a single-width test
   * at 1024px would have called it fine.
   */
  for (const width of [1440, 1280, 1024]) {
    test(`card prose shares one right edge at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./');
      await page.locator('.ask .stack').scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);

      const edges = await page.evaluate(() => {
        const card = document.querySelector('.ask [data-card]:not([data-off])')!;
        const cbody = card.querySelector('.cbody')!;
        const boxRight = (el: Element | null) => (el ? el.getBoundingClientRect().right : null);
        return {
          limit: cbody.getBoundingClientRect().right - parseFloat(getComputedStyle(cbody).paddingRight),
          head: boxRight(card.querySelector('.head')),
          row: boxRight(card.querySelector('.rows li span')),
          tail: boxRight(card.querySelector('.tail')),
        };
      });

      for (const [name, edge] of [['head', edges.head], ['row text', edges.row], ['tail', edges.tail]] as const) {
        expect(edge, `no ${name} found in the showing card`).not.toBeNull();
        expect(
          edges.limit - edge!,
          `${name} is ${Math.round(edges.limit - edge!)}px narrower than the card at ${width}px, ` +
            'so it wraps to its own measure and reads as hard-wrapped beside the blocks around it',
        ).toBeLessThan(2);
      }
    });
  }

  /**
   * The active dot used to transition `width`, so marking one active re-laid-out the row.
   *
   * Measured PER DOT, and this is the whole test rather than a detail of it. Measuring the
   * `.dots` container instead cannot see the bug at all: exactly one dot is wide under
   * either implementation, so the container's width is identical no matter which dot that
   * is, and identical mid-transition too, since one dot grows by exactly what the other
   * shrinks. A container-level assertion passes just as happily against the `width`
   * transition it is supposed to forbid. What actually moves is the individual dots — so
   * that is what gets asserted: every dot keeps the same x and the same width, whichever
   * one is current.
   */
  test('marking a dot active moves and resizes no dot', async ({ page }) => {
    await page.goto('./');
    await reachTheBand(page);
    await page.locator('.ask [data-rotate]').click(); // stop the clock so it cannot move under the measurement

    const geometry = () =>
      page.locator('.ask [data-dot]').evaluateAll((els) =>
        els
          .map((e) => {
            const b = e.getBoundingClientRect();
            return `${b.x.toFixed(1)}/${b.width.toFixed(1)}`;
          })
          .join(' '),
      );

    const dots = page.locator('.ask [data-dot]');
    const n = await dots.count();
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
      await dots.nth(i).click();
      await page.waitForTimeout(300); // longer than the .2s indicator transition
      seen.add(await geometry());
    }
    expect(
      [...seen],
      `the dots changed size or position as the active one changed:\n${[...seen].join('\n')}`,
    ).toHaveLength(1);
  });
});

/**
 * The two bands must not argue from the same matrix cell.
 *
 * `#why` picks one cell by hand and shows what querying it returns; `#ask` derives cells
 * from the questions its cards ask. Adjacent on the page, both leading on the same cell,
 * they read as one band said twice — and the corpus looks thinner than it is.
 *
 * This has now happened twice. WhyCaail moved off Bayesian Optimization × Media Optimization
 * because a worked-query card took it, landed on Ensemble Learning × Sensory Prediction on
 * the reasoning that no card touched sensory, and the next rewrite of that band added a
 * sensory card naming that exact cell. Both times the constraint was written down as a
 * comment in the file doing the choosing, which cannot see the other band. So it is asserted
 * here instead, against what the two bands actually render.
 */
test('the #why example cell is not one the #ask band also argues from', async ({ page }) => {
  await page.goto('./');

  // Same source the #why mock test parses: the band advertises its cell in the API line.
  const claimed = (await page.locator('#why .bubble--tool code').innerText()).trim();
  const m = /matrix\.json\s*→\s*(.+?)\s*×\s*(.+)$/.exec(claimed);
  expect(m, `could not parse the #why API line: "${claimed}"`).not.toBeNull();
  const [, method, areaLabel] = m!;

  // `textContent`, NOT `innerText`. Only one card is showing at a time and the rest are
  // `visibility: hidden`, so `innerText` returns the rendered text of card 1 alone — this
  // assertion passed against a known collision because the colliding card was the hidden
  // fourth one. What is being asserted is a property of the whole band, so it has to read
  // the whole band.
  const ask = (await page.locator('.ask').textContent()) ?? '';
  expect(
    ask.includes(`${method} × ${areaLabel}`),
    `both homepage bands lead on ${method} × ${areaLabel}. #why picks its cell by hand, so ` +
      'move that one: pick a populated cell in a column no card argues from.',
  ).toBe(false);

  // The area alone is the softer half of the collision and the one that bit last time: a
  // card can own a column without naming the same cell, and two bands on one research area
  // still read as repetition.
  expect(
    ask.includes(`× ${areaLabel}`),
    `#why argues from the ${areaLabel} column and so does a card in #ask. Even where the ` +
      'method differs, the two bands are then making the same point about the same area.',
  ).toBe(false);
});

test('the homepage agent bands have no serious accessibility violations', async ({ page }) => {
  await page.goto('./');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .include('.why')
    .include('.ask')
    .include('.gs')
    .include('.hero')
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    serious,
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`).join('\n'),
  ).toEqual([]);
});

test.describe('homepage section rail', () => {
  test('every rail entry points at a section that exists', async ({ page }) => {
    await page.goto('./');
    const dead = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('.rail a[data-rail]')]
        .filter((a) => !document.getElementById(a.dataset.rail ?? ''))
        .map((a) => a.dataset.rail),
    );
    expect(dead, `rail links with no target section: ${dead.join(', ')}`).toEqual([]);
    expect(await page.locator('.rail a[data-rail]').count()).toBeGreaterThan(4);
  });

  /**
   * The rail labels were hand-copied from section headings, and drifted: "Before and
   * after" and "Ask something specific" both survived rewrites of the sections they
   * named. Where a section carries an eyebrow, that eyebrow is the label's source of
   * truth — a headline can be expressive because the section supplies context, but a rail
   * label is read cold. Sections without an eyebrow are exempt.
   *
   * The hero is exempt by id, not by accident. It carries an `.eyebrow` too, but that one
   * expands the acronym rather than naming a category, and the correct rail label for the
   * top of a page is "Top". This assertion found that case on its first run.
   *
   * Deliberately not quoting the hero eyebrow's text here. An earlier version did, and the
   * quote outlived the string it described — which is the drift this repo keeps paying for.
   * The exemption is by id, so no comment needs to track what that eyebrow says.
   */
  test('rail labels match the eyebrow of the section they name', async ({ page }) => {
    await page.goto('./');
    const mismatched = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('.rail a[data-rail]')]
        .map((a) => {
          if (a.dataset.rail === 'top') return null; // exempt: not a categorical tag
          const section = document.getElementById(a.dataset.rail!);
          const eyebrow = section?.querySelector('.eyebrow');
          if (!eyebrow) return null; // no eyebrow: nothing to derive from
          const label = (a.getAttribute('aria-label') ?? '').trim();
          const tag = (eyebrow.textContent ?? '').trim();
          return label === tag ? null : { id: a.dataset.rail, label, eyebrow: tag };
        })
        .filter(Boolean),
    );
    expect(mismatched, `rail label drifted from its section eyebrow: ${JSON.stringify(mismatched)}`).toEqual([]);
  });

  test('the collapsed rail does not sit on top of the content column', async ({ page }) => {
    // The labels were once laid out in flow, which made the nav 182px wide against a
    // content column starting at 180 — invisible anchors covering the hero, swallowing
    // its clicks. Probing elementFromPoint catches that; a screenshot never would.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./');
    const result = await page.evaluate(() => {
      const rail = document.querySelector('.rail')!.getBoundingClientRect();
      const content = document.querySelector('.hero-text')!.getBoundingClientRect();
      const hit = document.elementFromPoint(content.left + 40, content.top + 30);
      return { overlaps: rail.right > content.left, stealsClicks: !!hit?.closest('.rail') };
    });
    expect(result.overlaps, 'rail box reaches into the content column').toBe(false);
    expect(result.stealsClicks, 'rail intercepts clicks meant for the hero').toBe(false);
  });

  test('expanded labels do not stack on top of each other', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./');
    await page.locator('.rail a[data-rail="why"]').hover();
    await page.waitForTimeout(300);
    const collisions = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.rail .lbl')].map((l) => {
        const b = l.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, text: l.textContent ?? '' };
      });
      const bad: string[] = [];
      for (let i = 1; i < boxes.length; i++) {
        if (boxes[i]!.top < boxes[i - 1]!.bottom) bad.push(`${boxes[i - 1]!.text} / ${boxes[i]!.text}`);
      }
      return bad;
    });
    expect(collisions, `overlapping rail labels: ${collisions.join(', ')}`).toEqual([]);
  });

  /**
   * Opened labels must stay in the gutter, clear of the prose.
   *
   * The rail's offset and the content column both scale with the viewport, so the space
   * between them is CONSTANT — it was 104px at every width while the widest label needed
   * 178px. The labels therefore sat on the body text by the same 74px at 1440px and at
   * 2560px alike, and widening the window looked like it ought to help and never did.
   *
   * Checked at several widths precisely because the bug was width-independent: a single
   * viewport would have proved almost nothing, and the two widest are the ones a reader
   * would assume are safe.
   */
  for (const width of [1488, 1600, 1920, 2560]) {
    test(`expanded labels stay clear of the content column at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./');
      await page.locator('.rail').hover();
      await page.waitForTimeout(350);

      const worst = await page.evaluate(() => {
        const content = document.querySelector('.content-panel .sl-markdown-content')!.getBoundingClientRect();
        const shown = [...document.querySelectorAll('.rail .lbl')].filter(
          (el) => getComputedStyle(el).visibility === 'visible',
        );
        // Ticks-only is a legitimate state below the label breakpoint; nothing to check.
        if (!shown.length) return null;
        return shown
          .map((el) => ({ text: el.textContent ?? '', over: +(el.getBoundingClientRect().right - content.left).toFixed(1) }))
          .sort((a, b) => b.over - a.over)[0]!;
      });

      if (worst === null) return; // labels deliberately closed at this width
      expect(worst.over, `label "${worst.text}" reaches ${worst.over}px into the content column`).toBeLessThanOrEqual(0);
    });
  }

  test('the active entry follows the scroll position', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./');
    const seen = await page.evaluate(async () => {
      const out: string[] = [];
      for (let y = 0; y <= document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
        const t = document.querySelector('.rail a[aria-current="true"]')?.textContent?.trim();
        if (t && t !== out[out.length - 1]) out.push(t);
      }
      return out;
    });
    // Exactly one entry is current at a time, and the indicator advances rather than
    // sticking on the first section.
    expect(seen.length, `active entry never advanced: ${seen.join(' → ')}`).toBeGreaterThan(3);
    expect(await page.locator('.rail a[aria-current="true"]').count()).toBe(1);
  });

  /**
   * No tick may be decorative.
   *
   * `.caail-band-pair` lays Community and Cite side by side above 56rem, and the rail only
   * renders above 78rem, so within the rail's whole live range those two sections start at
   * the SAME offsetTop. While the scan picked a single winner on that tie, the loser could
   * never be active at any scroll position: a permanently dark tick, with which of the two
   * died decided by list order alone.
   *
   * The sibling test above cannot catch this — it asserts only that the indicator advances
   * more than three times, which stays true with a dead entry. This walks the page and
   * asserts every entry lights up somewhere, which is the property that was actually false.
   */
  test('every rail entry lights up at some scroll position', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./');
    const { ids, seen } = await page.evaluate(async () => {
      const links = [...document.querySelectorAll<HTMLAnchorElement>('.rail a[data-rail]')];
      const found = new Set<string>();
      for (let y = 0; y <= document.body.scrollHeight; y += 200) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
        for (const a of links) {
          if (a.getAttribute('data-active') === 'true') found.add(a.dataset.rail!);
        }
      }
      return { ids: links.map((a) => a.dataset.rail!), seen: [...found] };
    });
    const dead = ids.filter((id) => !seen.includes(id));
    expect(dead, `rail entries that never light up at any scroll position: ${dead.join(', ')}`).toEqual([]);
  });

  test('the rail is hidden where there is no gutter for it', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto('./');
    await expect(page.locator('.rail')).toBeHidden();
  });
});
