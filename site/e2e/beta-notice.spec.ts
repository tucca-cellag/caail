import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { BETA_LEAD, BETA_BODY, BETA_LINKS } from '../src/lib/beta-notice';
import { SITE_BASE } from '../src/content/site-config';

// ---------------------------------------------------------------------------
// Site-wide beta notice (src/components/BetaNotice.astro). Every page but the
// homepage gets it as a strip from the Starlight Banner override; the homepage
// carries it inside the hero, so nothing opens a gap above the hero stripe.
// The wording is read from src/lib/beta-notice.ts rather than retyped here.
// ---------------------------------------------------------------------------

const [ROADMAP, FEEDBACK] = BETA_LINKS;
/** The href the component renders: the site base, then the module's path. */
const href = (path: string) => `${SITE_BASE}${path}`;

// One route per page shape: the splash homepage (inline variant), a prose page
// from the canonical-Markdown loader, an island card page, the page the roadmap
// link targets, and a broken link, which lands on Starlight's built-in 404 page
// (it sets `hero`, which once made the override skip it). A Banner override
// that only some layouts render would pass a single-route test.
const ROUTES = ['./', './contributing/', './software/', './curation/', './no-such-page/'];

for (const route of ROUTES) {
  test(`the beta notice leads ${route} with its two links`, async ({ page }) => {
    await page.goto(route);
    const notice = page.locator('main [data-caail-beta]');
    await expect(notice).toHaveCount(1);
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(BETA_LEAD);
    await expect(notice).toContainText(BETA_BODY);
    await expect(notice.getByRole('link', { name: ROADMAP.label })).toHaveAttribute('href', href(ROADMAP.path));
    await expect(notice.getByRole('link', { name: FEEDBACK.label })).toHaveAttribute('href', href(FEEDBACK.path));
  });
}

// "Leads" is a placement claim, so check placement. On a strip page the notice
// is the first element in <main>, above everything else, the title included (the
// 404 page has no title to compare against, so the check is not title-based). The
// homepage shows it inside the hero, by design below the title (BetaNotice.astro
// says why).
for (const route of ROUTES.filter((r) => r !== './')) {
  test(`the beta notice is the first thing in main on ${route}`, async ({ page }) => {
    await page.goto(route);
    const first = await page.evaluate(
      () => document.querySelector('main')?.firstElementChild?.hasAttribute('data-caail-beta') ?? false,
    );
    expect(first, `the first element in main is not the beta notice on ${route}`).toBe(true);
  });
}

test('on the homepage the beta notice sits inside the hero', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.hero [data-caail-beta]')).toHaveCount(1);
});

test('the roadmap link lands on the roadmap section, which carries the v2 item', async ({ page }) => {
  await page.goto('./');
  await page.locator('main [data-caail-beta]').getByRole('link', { name: ROADMAP.label }).click();
  await expect(page).toHaveURL(new RegExp(`${ROADMAP.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  // An attribute selector: `#6-roadmap` is not valid CSS, as an id selector
  // cannot start with a digit.
  const anchor = ROADMAP.path.split('#')[1];
  await expect(page.locator(`[id="${anchor}"]`)).toBeVisible();
  // The MDX renderer turns the apostrophe typographic (’), so match either form.
  await expect(page.locator('main')).toContainText(
    /v2: reorganized research areas\. The research areas are being reorganized for CAAIL['’]s next major version\./,
  );
});

test('the feedback link lands on the community page', async ({ page }) => {
  await page.goto('./software/');
  await page.locator('main [data-caail-beta]').getByRole('link', { name: FEEDBACK.label }).click();
  await expect(page).toHaveURL(new RegExp(`${FEEDBACK.path}$`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the notice reflows at 320px instead of overflowing its box', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const route of ['./', './contributing/']) {
    await page.goto(route);
    const overflow = await page.locator('main [data-caail-beta]').evaluate((el) => {
      const box = el.getBoundingClientRect();
      const worst = Math.max(...[...el.querySelectorAll('a')].map((a) => a.getBoundingClientRect().right));
      return { boxRight: box.right, linkRight: worst, docOverflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(overflow.linkRight, `a link runs past the notice box on ${route}`).toBeLessThanOrEqual(overflow.boxRight + 0.5);
    expect(overflow.docOverflow, `the page scrolls sideways on ${route}`).toBe(false);
  }
});

// Both colour schemes, and every placement: the strip (a prose page), the inline
// variant (the homepage hero), and the 404 page. The notice's colours are
// Starlight theme tokens, which resolve differently per scheme.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} scheme`, () => {
    test.use({ colorScheme });
    for (const route of ['./', './contributing/', './no-such-page/']) {
      test(`the beta notice on ${route} adds no serious or critical a11y violation`, async ({ page }) => {
        await page.goto(route);
        const results = await new AxeBuilder({ page })
          .include('[data-caail-beta]')
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze();
        const serious = results.violations.filter((v) =>
          ['serious', 'critical'].includes(v.impact ?? ''),
        );
        expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
      });
    }
  });
}
