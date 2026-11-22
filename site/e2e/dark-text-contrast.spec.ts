import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Contrast that only fails in one theme.
 *
 * The palette inverts by lightness in dark mode, and Lighthouse and the other axe scans
 * here run light mode only, so a colour fixed for white can fail on the dark ground with
 * nothing saying so. Three did: white text on `--caail-primary` and on the density ramp's
 * top steps, which turn light in dark mode (tucca-cellag/caail-planning#887).
 */

async function useScheme(page: Page, scheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: scheme });
}

/** Asserted, not assumed: Starlight sets data-theme from its own script. */
async function expectTheme(page: Page, scheme: 'light' | 'dark') {
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
}

const DARK_CASES = [
  { route: './datasets/cow/', within: '.caail-tv-toggle', what: 'the Table/Cards toggle' },
  { route: './papers/network/', within: '.ng-seg', what: "the network's edge-mode toggle" },
  { route: './by-the-numbers/', within: '.md-grid', what: 'the subject grids' },
];

for (const { route, within, what } of DARK_CASES) {
  test(`${what} on ${route} passes text contrast in the dark theme`, async ({ page }) => {
    await useScheme(page, 'dark');
    await page.goto(route);
    await expectTheme(page, 'dark');
    // The pressed state is the case that failed, so wait for it rather than scanning
    // an island before it has hydrated.
    if (within !== '.md-grid') await expect(page.locator(`${within} [aria-pressed='true']`).first()).toBeVisible();
    else await expect(page.locator('.md-cell[data-level="4"]').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).include(within).withRules(['color-contrast']).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}
