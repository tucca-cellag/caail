import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ---------------------------------------------------------------------------
// Site-wide beta notice (src/components/BetaNotice.astro). Every page but the
// homepage gets it as a strip from the Starlight Banner override; the homepage
// carries it inside the hero, so nothing opens a gap above the hero stripe.
// Wording is fixed by tucca-cellag/caail-planning#565.
// ---------------------------------------------------------------------------

// One route per page shape: the splash homepage (custom hero, no title), a
// prose page from the canonical-Markdown loader, an island card page, and the
// page the notice's roadmap link targets. A Banner override that only some
// layouts render would pass a single-route test.
const ROUTES = ['./', './contributing/', './software/', './curation/'];

for (const route of ROUTES) {
  test(`the beta notice leads ${route} with its two links`, async ({ page }) => {
    await page.goto(route);
    const notice = page.locator('main [data-caail-beta]');
    await expect(notice).toHaveCount(1);
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('CAAIL is in beta.');
    await expect(notice).toContainText(
      "We're re-checking earlier classifications and reorganizing the research areas for v2.",
    );
    await expect(notice.getByRole('link', { name: 'See the roadmap' })).toHaveAttribute(
      'href',
      '/curation/#6-roadmap',
    );
    await expect(notice.getByRole('link', { name: 'Tell us what you think' })).toHaveAttribute(
      'href',
      '/community/',
    );
  });
}

test('the roadmap link lands on the roadmap section, which carries the v2 item', async ({ page }) => {
  await page.goto('./');
  await page.locator('main [data-caail-beta]').getByRole('link', { name: 'See the roadmap' }).click();
  await expect(page).toHaveURL(/\/curation\/#6-roadmap$/);
  // An attribute selector: `#6-roadmap` is not valid CSS, as an id selector
  // cannot start with a digit.
  await expect(page.locator('[id="6-roadmap"]')).toBeVisible();
  // The MDX renderer turns the apostrophe typographic (’), so match either form.
  await expect(page.locator('main')).toContainText(
    /v2: reorganized research areas\. The research areas are being reorganized for CAAIL['’]s next major version\./,
  );
});

test('the feedback link lands on the community page', async ({ page }) => {
  await page.goto('./software/');
  await page
    .locator('main [data-caail-beta]')
    .getByRole('link', { name: 'Tell us what you think' })
    .click();
  await expect(page).toHaveURL(/\/community\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

// Both colour schemes: the notice's colours are Starlight theme tokens, which
// resolve differently per scheme, so a contrast pass in one says nothing about
// the other.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} scheme`, () => {
    test.use({ colorScheme });
    test('the beta notice adds no serious or critical a11y violation', async ({ page }) => {
      await page.goto('./contributing/');
      const results = await new AxeBuilder({ page })
        .include('[data-caail-beta]')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      const serious = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  });
}
