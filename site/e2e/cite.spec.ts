import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ---------------------------------------------------------------------------
// How to Cite page — citation blocks + copy-to-clipboard
// ---------------------------------------------------------------------------

test('cite page renders APA + BibTeX with a working copy button', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./cite/');

  await expect(page.getByRole('heading', { name: 'Recommended citation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'BibTeX' })).toBeVisible();

  const blocks = page.locator('[data-caail-cite]');
  await expect(blocks).toHaveCount(2);

  // BibTeX preserves its field indentation (MDX would otherwise strip it).
  const bibtex = await page.locator('.caail-cite__body--code').textContent();
  expect(bibtex).toContain('@misc{caail2026');
  expect(bibtex).toContain('\n  author');

  // Clicking copy flips the label to "Copied!" and writes the citation text.
  const apaBlock = blocks.first();
  await apaBlock.locator('[data-caail-cite-copy]').click();
  await expect(apaBlock.locator('.caail-cite__copy-text')).toHaveText('Copied!');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.startsWith('Plotts, J., Bromberg, B., Kaplan, D. L.,')).toBe(true);
  expect(clip).toContain('https://doi.org/10.5281/zenodo.20295590');
});

test('cite page has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./cite/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// About page — TUCCA section + how-to-cite pointer
// ---------------------------------------------------------------------------

test('about page surfaces TUCCA and a how-to-cite pointer', async ({ page }) => {
  await page.goto('./about/');
  await expect(page.getByRole('heading', { name: 'About TUCCA' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How to cite' })).toBeVisible();
  // links out to the TUCCA site and in to the cite page
  await expect(
    page.locator('main a[href="https://cellularagriculture.tufts.edu/"]').first(),
  ).toBeVisible();
  await expect(page.locator('main a[href="/caail/cite/"]').first()).toBeVisible();
});

test('about page has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./about/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Homepage — citation band points to the cite page
// ---------------------------------------------------------------------------

test('homepage shows a citation band linking to the cite page', async ({ page }) => {
  await page.goto('./');
  const band = page.locator('.caail-citeband');
  await expect(band).toBeVisible();
  await expect(band.locator('a.cta')).toHaveAttribute('href', '/caail/cite/');
  await expect(band.locator('a.doi')).toHaveAttribute('href', 'https://doi.org/10.5281/zenodo.20295590');
});

test('homepage surfaces the TUCCA lockup in hero and footer, linked to TUCCA', async ({ page }) => {
  await page.goto('./');
  const TUCCA = 'https://cellularagriculture.tufts.edu/';
  const hero = page.locator(`.hero-attrib a.tl[href="${TUCCA}"]`);
  await expect(hero).toBeVisible();
  await expect(hero).toHaveAttribute('aria-label', /Tufts University Center for Cellular Agriculture/);
  await expect(page.locator(`.caail-foot-brand a.tl[href="${TUCCA}"]`)).toBeVisible();
  // the lockup mark renders (theme-swapped background-image on a fixed-size box)
  await expect(hero.locator('.tl-mark')).toBeVisible();
});
