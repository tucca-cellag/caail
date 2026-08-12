import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('topic hub index lists the 8 themes', async ({ page }) => {
  await page.goto('./topics/');
  await expect(page.locator('[data-theme-card]')).toHaveCount(8);
});

test('a theme view shows grouped items and sub-tag nav', async ({ page }) => {
  await page.goto('./topics/?t=metabolism-modeling');
  // client-rendered from the ?t= param
  await expect(page.locator('.th-title')).toHaveText(/Metabolism/);
  await expect(page.getByRole('heading', { name: /Papers/ })).toBeVisible();
  await expect(page.locator('.th-subtag').first()).toBeVisible();
});

test('topic chips are not offset by Starlight prose-flow margins (#67 trap)', async ({ page }) => {
  await page.goto('./software/');
  await expect(page.locator('.topic-chip').first()).toBeVisible();
  // every chip <li> must have margin-top 0, or the 2nd+ chip drops below the first
  const margins = await page.locator('.topic-chips li').evaluateAll((els) =>
    els.map((e) => getComputedStyle(e).marginTop),
  );
  expect(margins.length).toBeGreaterThan(1);
  expect(margins.every((m) => m === '0px')).toBe(true);
});

test('the topic hub has no axe accessibility violations', async ({ page }) => {
  await page.goto('./topics/');
  await expect(page.locator('[data-theme-card]').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('a theme view with a named lead has no axe violations', async ({ page }) => {
  // Separate from the index test above because it renders DIFFERENT COMPONENTS. The index
  // never mounts `LeadFull`, so for a while nothing in the suite loaded the only surface
  // showing a lead's name, affiliation and ORCID — and an underline-less link shipped
  // there at 2.99:1 (light) and 2.01:1 (dark), a serious `link-in-text-block` failure, on
  // a page no axe run visited. The blocking Lighthouse gate covers only the landing page
  // and the explorer, so it would not have caught it either.
  //
  // Pinned to a theme that HAS a lead on purpose: with an unheld theme this renders
  // nothing and passes while asserting nothing about the component it exists for.
  await page.goto('./topics/?t=ai-methods-tooling');
  const lead = page.locator('.th-lead-full');
  await expect(lead).toBeVisible();
  await expect(lead.locator('a')).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('the lead credit reads as separate words, not one run-together string', async ({ page }) => {
  // This line renders correctly and copies wrongly, twice over, unless both separators are
  // real. JSX drops whitespace between children on separate lines, so the role label ran
  // into the name; and the middot between name and affiliation was a CSS `::before`, which
  // is not included in a copied selection. Both looked right on screen because the gaps
  // came from a margin and from generated content. The result a reader actually took away
  // was "LeadBenjamin BrombergTUCCA, Tufts University", on the one surface whose stated
  // job is to let someone contact or cite this person.
  //
  // Asserted against innerText, which is what a selection yields. Case-insensitive because
  // `.th-lead-role` is uppercased by CSS, and that transform is presentation, not content.
  await page.goto('./topics/?t=ai-methods-tooling');
  const text = await page.locator('.th-lead-full').innerText();
  expect(text, 'the role label runs into the name').toMatch(/^lead\s+\S/i);
  expect(text, 'the name runs into the affiliation').toMatch(/\S\s+·\s+\S/);
});
