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
  test('the first panel is readable before any interaction', async ({ page }) => {
    await page.goto('./');
    const first = page.locator('.gs .panel').first();
    await expect(first).toBeVisible();
    await expect(first.locator('code').first()).toContainText('raw.githubusercontent.com');
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
  test('the copy button does not change size when clicked', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./');
    const btn = page.locator('.gs .copy').first();
    await btn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const box = async () => {
      const r = await btn.boundingBox();
      const row = await page.locator('.gs .cmd').first().boundingBox();
      return { w: Math.round(r!.width), h: Math.round(r!.height), rowH: Math.round(row!.height) };
    };

    const before = await box();
    await btn.click();
    await expect(btn).toHaveClass(/is-done/); // the swap really happened
    await page.waitForTimeout(120);
    const after = await box();

    expect(after, `copy button resized on click: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`).toEqual(before);
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

  test('switching tabs does not change the section height (no page jump)', async ({ page }) => {
    await page.goto('./');
    // The section's own height is what everything below it sits on, so holding that
    // constant is the invariant. Measuring a sibling is indirect and, on the splash
    // layout, the next sibling is not always a laid-out box.
    const section = page.locator('.gs');
    const tabs = page.locator('.gs [role="tab"]');
    const count = await tabs.count();

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
      `the panel reserve is too small — section height varied across tabs: ${heights.join(', ')}`,
    ).toBe(1);
  });
});

test('the hero counter renders a real statistic before the typewriter runs', async ({ page }) => {
  await page.goto('./');
  // Server-rendered complete, so no JS (or a script error) still leaves a real number.
  await expect(page.locator('.hero .tick-n')).toHaveText(/^\d+$/);
  await expect(page.locator('.hero .tick-l')).not.toBeEmpty();
  const entries = JSON.parse((await page.locator('.hero .tick').getAttribute('data-stats')) ?? '[]');
  expect(entries.length, 'the typewriter has nothing to cycle through').toBeGreaterThan(1);
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
  const answer = (await page.locator('#why .half--with .bubble').last().innerText()).trim();

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

test.describe('worked-queries carousel', () => {
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
   * is the site's tagline ("Cellular Agriculture × Artificial Intelligence"), not a
   * categorical tag, and the correct rail label for the top of a page is "Top". This
   * assertion found that case on its first run.
   */
  test('rail labels match the eyebrow of the section they name', async ({ page }) => {
    await page.goto('./');
    const mismatched = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('.rail a[data-rail]')]
        .map((a) => {
          if (a.dataset.rail === 'top') return null; // tagline, not a categorical tag
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

  test('the rail is hidden where there is no gutter for it', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto('./');
    await expect(page.locator('.rail')).toBeHidden();
  });
});
