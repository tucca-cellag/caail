import { test, expect } from '@playwright/test';

/**
 * What every Tufts page carries (tucca-cellag/caail-planning#887).
 *
 * The wordings below are typed here from Tufts' own pages (read 2026-11-22), and
 * deliberately not imported from `src/lib/tufts-statements.ts`: this is the second copy
 * that makes the module's copy checkable. Change both only when Tufts' page changes.
 */

// The Digital Accessibility Policy's template, with the unit and the position filled in.
const ACCESSIBILITY_STATEMENT =
  'The Tufts University Center for Cellular Agriculture is committed to making its digital environment accessible to all users, and welcomes comments or suggestions on access improvements. Please send comments or suggestions on accessibility to cellag@tufts.edu.';
// The Policy on Co-Branding on Websites, verbatim.
const OUTSIDE_LINK_SENTENCE =
  'This site or any product or service provided by the site is not affiliated with or endorsed by Tufts University.';

const ROUTES = ['./', './about/', './papers/explorer/', './no-such-page/'];

for (const route of ROUTES) {
  test(`the footer on ${route} carries the Tufts statements`, async ({ page }) => {
    await page.goto(route);
    const footer = page.locator('.caail-statements');
    await expect(footer).toHaveCount(1);
    const text = (await footer.innerText()).replace(/\s+/g, ' ');

    expect(text).toContain(ACCESSIBILITY_STATEMENT);
    await expect(footer.locator('a[href="mailto:cellag@tufts.edu"]')).toHaveCount(1);
    await expect(footer.getByRole('link', { name: 'Tufts Digital Accessibility Policy' })).toHaveAttribute(
      'href',
      'https://access.tufts.edu/digital-accessibility-policy',
    );

    // Verbatim, and after the lead-in that says which site "this site" is.
    expect(text).toMatch(/Links to sites outside tufts\.edu: “This site or any product/);
    expect(text).toContain(OUTSIDE_LINK_SENTENCE);

    await expect(footer.getByRole('link', { name: 'Tufts Privacy Statement' })).toHaveAttribute(
      'href',
      'https://www.tufts.edu/about/privacy',
    );
    await expect(footer.getByRole('link', { name: 'Non-Discrimination Statement' })).toHaveAttribute(
      'href',
      'https://oeo.tufts.edu/policies-procedures/non-discrimination-statement/',
    );
    // The build's year. A run straddling New Year's Day in UTC fails here once: rebuild.
    expect(text).toContain(`© ${new Date().getUTCFullYear()} Tufts University and CAAIL contributors`);
  });
}
