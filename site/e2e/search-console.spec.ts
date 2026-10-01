import { test, expect } from '@playwright/test';
import { SEARCH_CONSOLE_TOKENS } from '../src/content/site-config';

// Search Console reads the verification tag from the rendered home page of the
// property's URL, and a property whose tag disappears loses verification at the
// next re-check. Starlight merges the head layer by layer (defaults, config, page
// frontmatter): a later layer that sets google-site-verification replaces every
// earlier entry with that name, so a home page that ever sets its own tag silently
// drops the config's, with the build still green.
test('every Search Console token is in the home page head', async ({ page }) => {
  await page.goto('./');
  const got = await page
    .locator('head meta[name="google-site-verification"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('content') ?? ''));
  expect(got.sort()).toEqual([...SEARCH_CONSOLE_TOKENS].sort());
});
