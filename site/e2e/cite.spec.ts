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

test('the hero attribution names its subject in every text-extraction surface', async ({
  page,
}) => {
  await page.goto('./');

  // The defect this guards: the lockup draws the org name as a CSS background image
  // on an `aria-hidden` span, so the anchor contributes NO text of its own. This line
  // once shipped as "A project of  and used in its own R&D" — a sentence with its
  // subject missing — past four screenshots and a clean axe run, because sighted
  // rendering and assistive tech were both fine and neither check reads extracted text.
  //
  // The two surfaces are checked SEPARATELY because they genuinely differ here, and an
  // earlier version of this test asserted one while its name and three source comments
  // claimed the other. Measured on the built page:
  //
  //   textContent -> "A project of Tufts University Center for Cellular Agriculture
  //                   and used in its own R&D"
  //   innerText   -> "A PROJECT OF\nTufts University Center for Cellular
  //                   Agriculture\nAND USED IN ITS OWN R&D"
  //
  // `.hero-attrib` is `display: flex`, so the serialiser blockifies each child and
  // inserts newlines; and its spans carry `text-transform: uppercase`, which does not
  // reach `.tl-name` because that span is emitted under TuccaLockup's own Astro scope.
  // So copied text is three lines with mixed casing, by design of the hero's styling
  // rather than by accident, and calling it "one clean sentence" would be false.
  const text = (await page.locator('.hero-attrib').textContent()) ?? '';

  // ONE assertion on the whole sentence, not three on its parts. Three `toContain`s
  // pass in any order, so a regression that emitted the org name after "and used in
  // its own R&D" would satisfy them while reading as nonsense. This pins the words,
  // their order, and the single spaces between them in one go.
  //
  // It also subsumes the padding check that used to sit here as `not.toMatch(/  +/)`:
  // re-indenting TuccaLockup.astro's markup emits whitespace text nodes inside the
  // anchor, which Astro's `compressHTML` collapses to spaces that stack with the
  // explicit trailing space in "A project of ". Measured: the three-space and
  // two-space forms both fail this.
  expect(
    text,
    `hero attribution is not one clean sentence in textContent: ${JSON.stringify(text)}`,
  ).toContain('A project of Tufts University Center for Cellular Agriculture and used in its own R&D');

  // `innerText` is the model for select-and-copy (and what `Selection.toString()`
  // returns here — checked, they match). It is asserted for the one property that
  // matters and that this change actually delivers: the SUBJECT IS PRESENT. Before
  // `textName`, a reader copying this line got "A PROJECT OF / AND USED IN ITS OWN
  // R&D" with no org name at all.
  //
  // Deliberately not asserted here: line count, casing, or a single-sentence form.
  // Those are properties of the hero's flex + uppercase styling, not of this prop,
  // and pinning them would make an unrelated design change fail this spec.
  const copied = await page.locator('.hero-attrib').innerText();
  expect(
    copied.replace(/\s+/g, ' '),
    `the org name is missing from copied text: ${JSON.stringify(copied)}`,
  ).toContain('Tufts University Center for Cellular Agriculture');
});
