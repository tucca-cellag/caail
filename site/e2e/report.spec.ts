import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { awaitHydrated } from './hydration';
import { correctionForm, papers } from './data';

/**
 * The entry-anchored correction route (/report/ plus the per-card links that feed it).
 *
 * Two things are worth testing here that unit tests cannot reach. The first is that the
 * frozen item id survives the whole trip — card → page → prefilled GitHub form — since
 * every hop is a different rendering path (Preact island, raw-HTML remark twin, a
 * client-side script) and the id is the only reason the feature exists. The second is
 * that a hostile `?item=` is inert on a real page: the page reads a query string on a
 * static host, so this is the one place a stranger controls input.
 */

const GITHUB_LINK = '#caail-report-github';
const EMAIL_LINK = '#caail-report-email';

test('with no ?item= the page is still usable and says no entry is identified', async ({ page }) => {
  await page.goto('./report/');
  await expect(page.locator('#caail-report-none')).toBeVisible();
  await expect(page.locator('#caail-report-id')).toBeHidden();
  // Unanchored, but not broken: the bare template still opens.
  const href = await page.locator(GITHUB_LINK).getAttribute('href');
  expect(href).toContain('template=entry-correction.yml');
  expect(href).not.toContain('item=');
});

test('the no-entry copy covers the cases that have no card link to follow', async ({ page }) => {
  // Inventory rows are most of the dataset corpus and are deliberately never carded, so
  // most of the dataset corpus reaches this page with no id and no link it could have
  // followed. Telling that reader to go back and find one is a dead end.
  await page.goto('./report/');
  const cases = page.locator('#caail-report-none-cases');
  await expect(cases).toBeVisible();
  await expect(cases).toContainText('Complete data inventory');
  await expect(cases).toContainText('accession');
});

test('a valid ?item= is shown and threaded into the GitHub and email routes', async ({ page }) => {
  await page.goto('./report/?item=paper:214');
  await expect(page.locator('#caail-report-id')).toBeVisible();
  await expect(page.locator('#caail-report-id-value')).toHaveText('paper:214');
  // Every no-id paragraph hides, not just the first — they are selected as a group.
  await expect(page.locator('.rp-none')).toHaveCount(2);
  for (const el of await page.locator('.rp-none').all()) await expect(el).toBeHidden();

  const gh = new URL((await page.locator(GITHUB_LINK).getAttribute('href'))!);
  expect(gh.host).toBe('github.com');
  expect(gh.pathname).toBe('/tucca-cellag/caail/issues/new');
  expect(gh.searchParams.get('template')).toBe('entry-correction.yml');
  expect(gh.searchParams.get('item')).toBe('paper:214');
  expect(gh.searchParams.get('title')).toBe('Correction: paper:214');

  const mail = await page.locator(EMAIL_LINK).getAttribute('href');
  expect(mail).toContain('mailto:');
  expect(decodeURIComponent(mail!)).toContain('CAAIL correction: paper:214');
});

test('a hostile ?item= reaches neither the DOM nor a link', async ({ page }) => {
  // Percent-encoded so the whole payload survives as one query value.
  const hostile = '%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E';
  await page.goto(`./report/?item=${hostile}`);
  // Rejected outright: the banner never appears, so nothing is rendered from it.
  await expect(page.locator('#caail-report-id')).toBeHidden();
  await expect(page.locator('#caail-report-none')).toBeVisible();
  await expect(page.locator('.rp img')).toHaveCount(0);
  const href = await page.locator(GITHUB_LINK).getAttribute('href');
  expect(href).not.toContain('item=');
  expect(href).not.toContain('onerror');
});

test('a well-formed id for an entry that does not exist is still passed through', async ({ page }) => {
  // The page cannot know the catalogue, and refusing a syntactically valid id would drop
  // a real report over a typo. Curator triage is the right place to catch this.
  await page.goto('./report/?item=sw:not-a-real-entry');
  await expect(page.locator('#caail-report-id-value')).toHaveText('sw:not-a-real-entry');
});

test('the report page has no axe violations, with and without an entry', async ({ page }) => {
  for (const url of ['./report/', './report/?item=db:string']) {
    await page.goto(url);
    await expect(page.locator('.rp-routes')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  }
});

/**
 * The composer.
 *
 * What is worth testing here and nowhere else: the vocabularies really are the live ones
 * (a unit test can only check the ones it was handed), the composed report really reaches
 * all three routes, and the stepped control is really operable from the keyboard with no
 * axe violations at every step. That last one is the reason a multi-step control was the
 * risky choice, so it is asserted at each step rather than once on load.
 */

const COMPOSER = '#caail-compose';
const NEXT = '#caail-compose-next';
const BACK = '#caail-compose-back';
const SUBMIT = '#caail-compose-submit';
const BODY = '#caail-compose-body';

/**
 * Escape a reason label for use in an accessible-name regex.
 *
 * No label carries a regex metacharacter today — two did, and the parentheses moved behind
 * the em dash when the composed `Problem:` line stopped publishing form instructions. This
 * stays because the labels are read from the template at build time rather than written
 * here, so the next curator to add an option decides what characters this has to survive,
 * and an unescaped `(` would be read as a capture group and match something else entirely.
 */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pick a reason by its visible label and advance to the next step. */
async function chooseReason(page: import('@playwright/test').Page, label: string) {
  await page.getByRole('radio', { name: new RegExp(`^${escapeRe(label)}`) }).check();
  await page.locator(NEXT).click();
}

test('the composer stays hidden when no entry is identified', async ({ page }) => {
  // Without an id there is no entry for "wrong matrix placement" to be about, and an
  // unanchored composed report would be worse than the prose it replaced.
  await page.goto('./report/');
  await expect(page.locator(COMPOSER)).toBeHidden();
  await expect(page.locator('#caail-report-none')).toBeVisible();
});

test('the composer is absent from the served HTML, so no-JS gets the page as it was', async ({
  request,
  baseURL,
}) => {
  // Fetched rather than rendered, so this sees what a reader with JavaScript off sees.
  const html = await (await request.get(new URL('./report/', baseURL).href)).text();
  expect(html).toContain('id="caail-compose"');
  // Present but hidden, and empty: the reader still gets the three working routes.
  expect(html).toMatch(/id="caail-compose"[^>]*\shidden/);
  expect(html).toContain('Open a correction on GitHub');
  // The option lists are built in the browser, so 25 matrix method names do not enter the
  // Pagefind index and make /report/ rank for "Bayesian Optimization". They appear only
  // inside the JSON payload, which is a script element and not indexed.
  const withoutPayload = html.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, '');
  expect(withoutPayload).not.toContain('Bayesian Optimization');
});

test('the reason options are exactly the ones the GitHub form offers', async ({ page }) => {
  // The prefill contract, checked against the shipped page rather than the parser: a
  // report naming an error class the form does not list is not actionable.
  const { reasons } = correctionForm;
  await page.goto('./report/?item=paper:214');
  await expect(page.locator(COMPOSER)).toBeVisible();
  const radios = page.locator('#caail-compose-reasons input[type=radio]');
  await expect(radios).toHaveCount(reasons.length);
  for (const reason of reasons) {
    await expect(page.getByRole('radio', { name: new RegExp(`^${escapeRe(reason.label)}`) })).toHaveCount(1);
  }
});

test('a matrix placement is composed from the live matrix axes, with no typing', async ({ page }) => {
  const { methods, areas } = papers;
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Wrong matrix placement');

  // The selects offer the real axes, not a copy that could have drifted.
  const method = page.getByLabel('AI/ML method it should be');
  const area = page.getByLabel('Research area it should be');
  await expect(method.locator('option')).toHaveCount(methods.length + 1); // + the placeholder
  await expect(area.locator('option')).toHaveCount(areas.length + 1);

  await method.selectOption(methods[0]!);
  await area.selectOption(areas[0]!.label);
  await page.locator(NEXT).click();

  await expect(page.locator(BODY)).toContainText('Entry: paper:214');
  await expect(page.locator(BODY)).toContainText('Problem: Wrong matrix placement');
  await expect(page.locator(BODY)).toContainText(`Should be: ${methods[0]} × ${areas[0]!.label}`);
});

test('a reason with nothing to ask takes two steps, not three', async ({ page }) => {
  // Five of the eight error classes need no follow-up at all, which is the whole claim of
  // the design. A wasted "nothing to fill in" step would quietly undo it.
  await page.goto('./report/?item=sw:cellpose');
  await expect(page.locator('#caail-h-reason')).toHaveText(/^Step 1 of 3:/);

  await page.getByRole('radio', { name: /^Dead or wrong link/ }).check();
  // The count corrects itself the moment it is known. It is not monotonic; the sibling
  // test below covers it moving back up.
  await expect(page.locator('#caail-h-reason')).toHaveText(/^Step 1 of 2:/);

  await page.locator(NEXT).click();
  await expect(page.locator('#caail-h-review')).toHaveText('Step 2 of 2: Your report');
  await expect(page.locator('#caail-step-detail')).toBeHidden();
  await expect(page.locator(BODY)).toHaveText('Entry: sw:cellpose\nProblem: Dead or wrong link');
});

test('the step count tracks the answer in both directions', async ({ page }) => {
  // The count is not monotonic, and a comment here once claimed it was. It follows the
  // current selection, which is the honest behaviour; what must hold is that it only ever
  // moves because the reader answered something, never while they are reading a step.
  await page.goto('./report/?item=sw:cellpose');
  const heading = page.locator('#caail-h-reason');
  await expect(heading).toHaveText(/^Step 1 of 3:/);

  await page.getByRole('radio', { name: /^Dead or wrong link/ }).check();
  await expect(heading).toHaveText(/^Step 1 of 2:/);

  await page.getByRole('radio', { name: /^Wrong matrix placement/ }).check();
  await expect(heading).toHaveText(/^Step 1 of 3:/);
});

test('a repeated identical alert is cleared and re-posted, so it is announced twice', async ({
  page,
}) => {
  // `role="alert"` announces on a content CHANGE, so writing the same string twice
  // announces once and the second press is silent. The fix clears the region and re-posts.
  //
  // Asserted by WATCHING THE MUTATIONS rather than by reading the text afterwards, because
  // the end state is identical either way: the message is on screen whether or not it was
  // re-posted. A version of this test that only checked the timer's cancellation passed
  // for a whole round against a branch that could never run.
  await page.goto('./report/?item=paper:214');
  await page.locator(NEXT).click();
  await expect(page.locator('#caail-compose-error')).not.toHaveText('');

  await page.evaluate(() => {
    const region = document.getElementById('caail-compose-error')!;
    const seen: string[] = [];
    (window as unknown as { __alertSeq: string[] }).__alertSeq = seen;
    new MutationObserver(() => seen.push(region.textContent ?? '')).observe(region, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });

  await page.locator(NEXT).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __alertSeq: string[] }).__alertSeq))
    .toEqual(['', 'Pick what is wrong with the entry to continue.']);
});

test('an armed error re-post does not resurrect over an answered step', async ({ page }) => {
  // Pressing Next twice with nothing selected arms a 60ms re-post of the alert, which
  // exists so a repeated identical message is announced rather than swallowed. Answering
  // inside that window used to let the timer repaint the error over a step the reader had
  // just satisfied, and nothing cleared it for the rest of the flow.
  await page.goto('./report/?item=paper:214');
  const error = page.locator('#caail-compose-error');

  await page.locator(NEXT).click();
  await expect(error).not.toHaveText('');
  await page.locator(NEXT).click();
  // Answer immediately, inside the re-post window.
  await page.getByRole('radio', { name: /^Dead or wrong link/ }).check();

  await expect(error).toHaveText('');
  // Still empty once the timer would have fired.
  await page.waitForTimeout(200);
  await expect(error).toHaveText('');
});

test('the email address keeps its code styling after a report composes', async ({ page }) => {
  // The note is rewritten once a report exists, and writing textContent destroyed the
  // <code> the address lives in. Because that rewrite latches, the styling could never
  // come back for the rest of the visit.
  await page.goto('./report/?item=db:string');
  await expect(page.locator('#caail-report-email-note code')).toHaveCount(1);

  await chooseReason(page, 'Dead or wrong link');
  const code = page.locator('#caail-report-email-note code');
  await expect(code).toHaveCount(1);
  await expect(code).toContainText('@');
});

test('the composed report reaches all three routes, not only GitHub', async ({ page }) => {
  // The ticket's constraint: the composer must not leave the account-free routes as bare
  // links beneath a slicker GitHub path.
  await page.goto('./report/?item=db:string');
  await chooseReason(page, 'Wrong licence tier');
  await page.getByLabel('Licence tier it should be').selectOption('Copyleft');

  const expected = 'Entry: db:string\nProblem: Wrong licence tier\nLicence tier should be: Copyleft';

  const gh = new URL((await page.locator('#caail-report-github').getAttribute('href'))!);
  expect(gh.searchParams.get('details')).toBe(expected);
  expect(gh.searchParams.get('item')).toBe('db:string');

  const mail = (await page.locator('#caail-report-email').getAttribute('href'))!;
  // CRLF, because RFC 6068 requires it of a body's line breaks and a bare LF is dropped by
  // strict clients — which would collapse the whole report into one run-on line.
  expect(decodeURIComponent(mail)).toContain(expected.replace(/\n/g, '\r\n'));
  // RFC 6068: a `+` in a mailto query is a literal plus, not a space.
  expect(mail).not.toContain('+');

  // Slack cannot be prefilled by a link, so the report is on the page as selectable text.
  await page.locator(NEXT).click();
  await expect(page.locator(BODY)).toHaveText(expected);
  await expect(page.locator('#caail-report-slack-note')).toContainText('Copy the report');
});

test('the final step offers submit as a link, and says the account wall is unchanged', async ({
  page,
}) => {
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Not machine learning at all');

  await expect(page.locator(NEXT)).toBeHidden();
  const submit = page.locator(SUBMIT);
  await expect(submit).toBeVisible();
  // An anchor, not a button: it navigates, so middle-click and open-in-new-tab must work.
  expect(await submit.evaluate((el) => el.tagName)).toBe('A');
  expect(await submit.getAttribute('href')).toContain('github.com');

  // It must not imply the GitHub account requirement has been solved. It has not.
  const account = page.locator('#caail-compose-account');
  await expect(account).toBeVisible();
  await expect(account).toContainText('GitHub account');
  // `\s+` rather than a literal space: this copy is wrapped in the .astro source, so the
  // text node really does carry a newline mid-sentence, and Playwright matches a regex
  // against the raw text rather than a whitespace-normalised copy of it.
  await expect(account).toContainText(/email\s+and Slack routes below/);

  // And it must say what is genuinely left. The error class is prefilled now, so the only
  // thing the reader still does on GitHub is the confirmations — which are `required: true`
  // and would otherwise block a submit the page implied was one click away.
  const note = page.locator('#caail-compose-remaining');
  expect(correctionForm.requiredConfirmations).toBeGreaterThan(0);
  await expect(note).toContainText('confirmations');
  // It must NOT go back to asking the reader to pick the error class by hand.
  await expect(note).not.toContainText('pick');
});

test('the error class is prefilled on GitHub, not left for the reader to pick', async ({
  page,
}) => {
  // The reason for the whole `dropdown` → `input` change in the issue template: a dropdown
  // takes this parameter and ignores it, so the composer used to compose the answer and
  // then ask for it again. Asserted on the URL the reader actually follows, for both the
  // wizard's own Submit and the route list's GitHub link, because they are built separately
  // and only one of them was wrong the first time.
  await page.goto('./report/?item=db:string');
  const reason = correctionForm.reasons.find((r) => r.label === 'Wrong licence tier')!;
  await chooseReason(page, reason.label);
  await page.getByLabel('Licence tier it should be').selectOption('Copyleft');

  for (const selector of [SUBMIT, GITHUB_LINK]) {
    const url = new URL((await page.locator(selector).getAttribute('href'))!);
    // Verbatim, including the explanation after the em dash: this lands in a text field, so
    // it has to be the template's own line rather than the display split.
    expect(url.searchParams.get('reason'), selector).toBe(reason.value);
    expect(url.searchParams.get('item'), selector).toBe('db:string');
  }

  // The email route has no field to fill, so it carries no such parameter — the error class
  // is the body's `Problem:` line, which is where a human reads it.
  const mail = (await page.locator(EMAIL_LINK).getAttribute('href'))!;
  expect(mail).not.toContain('reason=');
  expect(decodeURIComponent(mail)).toContain('Problem: Wrong licence tier');
});

test('a DOI is normalised from what a reader actually pastes', async ({ page }) => {
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Wrong or missing DOI');

  const field = page.getByLabel('The DOI it should have');
  await field.fill('not a doi');
  await expect(page.locator('#caail-f-doi-err')).toContainText('does not look like a DOI');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator(BODY)).not.toContainText('DOI should be');

  await field.fill('https://doi.org/10.1016/j.scitotenv.2023.164988');
  await expect(page.locator('#caail-f-doi-err')).toHaveText('');
  await expect(page.locator(BODY)).toContainText(
    'DOI should be: 10.1016/j.scitotenv.2023.164988',
  );
});

test('a DOI rejected for length says so, rather than calling it malformed', async ({ page }) => {
  // Two rejections, two messages, and the field used to decide between them with its own
  // copy of the shape regex. This is also the first test of the "too long" branch at all:
  // until the field's cap was raised above the validation cap it was unreachable from the
  // UI, because the browser truncated the input into something that passed.
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Wrong or missing DOI');
  const field = page.getByLabel('The DOI it should have');
  const error = page.locator('#caail-f-doi-err');

  // Well-formed, and far over the ENCODED cap: 108 characters that encode to 908.
  await field.fill(`10.1234/${'提'.repeat(100)}`);
  await expect(error).toContainText('longer than any real DOI');
  await expect(error).not.toContainText('does not look like');
  await expect(page.locator(BODY)).not.toContainText('DOI should be');

  // And the other branch still fires for something genuinely malformed.
  await field.fill('not a doi');
  await expect(error).toContainText('does not look like a DOI');
});

test('a DOI that could not be read is reported as dropped, not silently discarded', async ({
  page,
}) => {
  // The reader can advance from step 2 with an unusable DOI. composeBody drops it, so the
  // review step would otherwise show a report saying the DOI is wrong and not saying what
  // it should be, with the explanation left behind on a step that is no longer on screen.
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Wrong or missing DOI');
  await page.getByLabel('The DOI it should have').fill('10.1016 j.xyz');
  await page.locator(NEXT).click();

  const dropped = page.locator('#caail-compose-dropped');
  await expect(dropped).toBeVisible();
  await expect(dropped).toContainText('not shaped like a DOI');
  await expect(page.locator(BODY)).not.toContainText('DOI should be');

  // And it goes away once the answer is usable, rather than latching.
  await page.locator(BACK).click();
  await page.getByLabel('The DOI it should have').fill('10.1016/j.xyz');
  await page.locator(NEXT).click();
  await expect(dropped).toHaveText('');
  await expect(page.locator(BODY)).toContainText('DOI should be: 10.1016/j.xyz');
});

test('Next without an answer explains itself instead of doing nothing', async ({ page }) => {
  // Deliberately not a disabled button: a disabled control cannot be focused, so a
  // keyboard reader who tabs to it gets no explanation of why nothing happens.
  await page.goto('./report/?item=paper:214');
  await page.locator(NEXT).click();
  await expect(page.locator('#caail-compose-error')).toContainText('Pick what is wrong');
  await expect(page.locator('#caail-h-reason')).toBeVisible();
  // Focus lands on the first choice, so the reader is where the answer is.
  await expect(page.locator('#caail-compose-reasons input').first()).toBeFocused();
});

test('the composer is fully operable from the keyboard, and moves focus on each step', async ({
  page,
}) => {
  await page.goto('./report/?item=paper:214');
  await expect(page.locator(COMPOSER)).toBeVisible();

  // Reach the radio group by keyboard alone, then choose with the arrow keys, which is
  // what a native radiogroup gives us and a custom control would have to reimplement.
  await page.locator('#caail-compose-reasons input').first().focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /^Not machine learning at all/ })).toBeChecked();

  await page.locator(NEXT).press('Enter');
  // Focus moves TO the new step's heading, so a screen reader announces the position and
  // the question together rather than leaving focus on a button that just vanished.
  await expect(page.locator('#caail-h-review')).toBeFocused();
  await expect(page.locator('#caail-h-review')).toHaveText(/^Step 2 of 2:/);

  await page.locator(BACK).press('Enter');
  await expect(page.locator('#caail-h-reason')).toBeFocused();
  await expect(page.locator('#caail-h-reason')).toHaveText(/^Step 1 of 2:/);
});

test('every step of the composer is free of axe violations', async ({ page }) => {
  // A multi-step control is the classic place zero-violation pages break, so this walks
  // the steps rather than scanning the first one. The matrix path is used because it is
  // the only one with two fields and therefore the most markup.
  await page.goto('./report/?item=paper:214');
  await expect(page.locator(COMPOSER)).toBeVisible();

  const scan = async (where: string) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, where).toEqual([]);
  };

  await scan('step 1');
  await chooseReason(page, 'Wrong matrix placement');
  await expect(page.locator('#caail-step-detail')).toBeVisible();
  await scan('step 2');
  await page.locator(NEXT).click();
  await expect(page.locator('#caail-step-review')).toBeVisible();
  await scan('step 3');

  // And with a validation error showing, which adds a live region and aria-invalid.
  await page.locator(BACK).click();
  await page.locator(BACK).click();
  await page.getByRole('radio', { name: /^Wrong or missing DOI/ }).check();
  await page.locator(NEXT).click();
  await page.getByLabel('The DOI it should have').fill('nope');
  await expect(page.locator('#caail-f-doi-err')).not.toHaveText('');
  await scan('step 2 with a validation error');
});

test('the controls the script builds are actually styled', async ({ page }) => {
  // Astro compiles a scoped selector to `.rc-opt:where(.astro-HASH)` and stamps that hash
  // class onto TEMPLATE elements only. Nothing puts it on a node from
  // `document.createElement`, and the hash is generated per build, so the script could not
  // add it if it tried. The rules therefore compiled, shipped, and matched nothing: the
  // radio list lost its padding, its selected highlight and its focus ring, the selects and
  // textarea fell back to browser defaults, and the DOI error rendered in body-text colour
  // instead of --caail-danger.
  //
  // Asserted on COMPUTED STYLE of elements the script builds, because that is the only
  // thing that tells a rule which matched from one which merely exists. Nothing else in
  // this file would have failed.
  await page.goto('./report/?item=paper:214');
  await expect(page.locator(COMPOSER)).toBeVisible();

  const option = page.locator('#caail-compose-reasons .rc-opt').first();
  await expect(option).toBeVisible();
  const optionStyle = await option.evaluate((el) => {
    const s = getComputedStyle(el);
    return { display: s.display, padding: s.paddingLeft, radius: s.borderTopLeftRadius };
  });
  expect(optionStyle.display).toBe('flex');
  expect(parseFloat(optionStyle.padding)).toBeGreaterThan(0);
  expect(parseFloat(optionStyle.radius)).toBeGreaterThan(0);

  // The hint sits on its own line under the label, rather than running on after it.
  const hint = page.locator('#caail-compose-reasons .rc-opt-hint').first();
  expect(await hint.evaluate((el) => getComputedStyle(el).display)).toBe('block');
  const label = page.locator('#caail-compose-reasons .rc-opt-label').first();
  expect(
    parseInt(await label.evaluate((el) => getComputedStyle(el).fontWeight), 10),
  ).toBeGreaterThan(400);

  // Selecting one gives visible feedback.
  await page.getByRole('radio', { name: /^Wrong matrix placement/ }).check();
  const checkedBorder = await option.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(checkedBorder).not.toBe('rgba(0, 0, 0, 0)');

  // And the step-2 field wrapper and its select are styled too.
  await page.locator(NEXT).click();
  const field = page.locator('#caail-compose-fields .rc-field').first();
  expect(await field.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('column');
  const select = page.getByLabel('AI/ML method it should be');
  expect(
    parseFloat(await select.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)),
  ).toBeGreaterThan(0);
});

test('step 2 lays its fields out on its own grid, not on Starlight prose rhythm', async ({
  page,
}) => {
  // Starlight gives every adjacent pair inside `.sl-markdown-content` a `margin-top: 1rem`,
  // excluding a short list of inline tags that happens to include `input` and NOT `select`,
  // `textarea`, `label` or `div`. The composer builds its controls with `document
  // .createElement` into that content, and lays them out with `gap` — so the prose margin
  // was added ON TOP of every gap it did not exclude, and only on some of them:
  //
  //   * the second `.rc-field` picked up 16px, so the matrix step's two selects were
  //     staggered — "Research area" and its select sat 16px below "AI/ML method";
  //   * a `select` or `textarea` following its label picked up 16px, putting the label
  //     20px from its control where the field asks for 4;
  //   * the DOI field's `input` did not, so one of the three step-2 layouts was correct
  //     and the other two were not, which is what made it read as an alignment bug rather
  //     than as spacing.
  //
  // Measured as GEOMETRY against the field's own `row-gap`, not compared to a literal 4px:
  // the assertion is "the only thing between a label and its control is the gap the field
  // declares", which stays true if that gap is ever retuned and fails the moment anything
  // else contributes. Reading the stylesheet could not have caught this at all — the rules
  // that were in force came from Starlight, not from this component.
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Wrong matrix placement');

  // `expect.soft` throughout, so one run reports every layout that is wrong rather than the
  // first. The three field kinds fail independently — that is the whole shape of the bug —
  // and a hard assertion on the first would have hidden two thirds of it.
  const fields = page.locator('#caail-compose-fields .rc-field');
  await expect(fields).toHaveCount(2);
  const tops = await fields.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  expect.soft(Math.abs(tops[0]! - tops[1]!), 'the two matrix fields start on one line').toBeLessThan(1);

  /** The distance from a control's label to the control, and the gap that should be all of it. */
  const spacing = (label: string) =>
    page.getByLabel(label).evaluate((control) => {
      const field = control.closest('.rc-field')!;
      return {
        declared: parseFloat(getComputedStyle(field).rowGap),
        measured:
          control.getBoundingClientRect().top -
          field.querySelector('label')!.getBoundingClientRect().bottom,
      };
    });

  // All three control tags, because the defect was per-tag: `input` was exempt from
  // Starlight's rule and the other two were not, so checking one would have proved nothing
  // about the others.
  for (const label of ['AI/ML method it should be', 'Research area it should be']) {
    const { declared, measured } = await spacing(label);
    expect(declared, `${label}: the field declares no row gap`).toBeGreaterThan(0);
    expect.soft(Math.abs(measured - declared), `${label}: ${measured}px for a ${declared}px gap`).toBeLessThan(1);
  }

  for (const [reason, label] of [
    ['Wrong or missing DOI', 'The DOI it should have'],
    ['Something else', 'What is wrong with it (optional)'],
  ] as const) {
    await page.goto('./report/?item=paper:214');
    await chooseReason(page, reason);
    const { declared, measured } = await spacing(label);
    expect.soft(Math.abs(measured - declared), `${label}: ${measured}px for a ${declared}px gap`).toBeLessThan(1);
  }
});

test('the reason options are spaced by the list, not by inherited prose margins', async ({
  page,
}) => {
  // Same root cause as the step-2 test above, one step earlier: `.rc-opt` is a `label`, so
  // every option after the first inherited Starlight's 16px. `.rc-opts` is a gapless flex
  // column, so the list's whole visible separation came from a rule that is not this
  // component's and excludes tags for reasons that have nothing to do with it.
  await page.goto('./report/?item=paper:214');
  const options = page.locator('#caail-compose-reasons .rc-opt');
  await expect(options.first()).toBeVisible();

  const { declared, gaps } = await page.locator('#caail-compose-reasons').evaluate((list) => {
    const rows = [...list.querySelectorAll('.rc-opt')].map((el) => el.getBoundingClientRect());
    return {
      declared: parseFloat(getComputedStyle(list).rowGap),
      gaps: rows.slice(1).map((r, i) => r.top - rows[i]!.bottom),
    };
  });

  expect(gaps.length).toBeGreaterThan(1);
  // Asserted before the comparison, because `row-gap` computes to the keyword `normal` when
  // nothing sets it and `parseFloat` turns that into NaN — which fails every comparison
  // below for the right reason while reporting "NaNpx", naming neither the missing gap nor
  // the margin that was standing in for it.
  expect(declared, 'the option list declares no row gap, so its spacing is not its own').toBeGreaterThan(0);
  for (const gap of gaps) expect.soft(Math.abs(gap - declared), `${gap}px for a ${declared}px gap`).toBeLessThan(1);
});

test('the DOI error renders in the danger colour, not body text', async ({ page }) => {
  // The span is built by the script, so `.rc-err` only reaches it via the global form. The
  // dark-theme axe scan cannot catch this: unstyled body text has fine contrast, so losing
  // the colour makes the page MORE accessible by that measure and less legible in fact.
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Wrong or missing DOI');
  await page.getByLabel('The DOI it should have').fill('nope');

  const error = page.locator('#caail-f-doi-err');
  await expect(error).not.toHaveText('');

  // Compared against the TEMPLATE error rather than against a literal colour. Both carry
  // `.rc-err`, so they must render identically; the scoping bug is precisely the case where
  // one does and the other silently does not. A literal would also have to be written in
  // whatever form the browser serialises `oklch()` into, which is a hostage to fortune.
  const [built, template, body] = await Promise.all([
    error.evaluate((el) => getComputedStyle(el).color),
    page.locator('#caail-compose-error').evaluate((el) => getComputedStyle(el).color),
    page.locator('.rc-lede').evaluate((el) => getComputedStyle(el).color),
  ]);
  expect(built).toBe(template);
  expect(built).not.toBe(body);
});

test("a reader's note never reaches the analytics collector", async ({ page }) => {
  // The composer puts the whole correction, note included, into the GitHub link's
  // `details=` parameter, and the site-wide outbound_click handler records `link_url` WITH
  // its query string by design (for a deposit link the query string is the accession). So
  // without the marker attribute, clicking Submit posts the reader's free text to the
  // events collector — while privacy.mdx says search text is the only free text collected.
  //
  // Asserted on what the sink actually receives, not on the attribute being present: the
  // attribute is the mechanism and could be honoured incorrectly.
  await page.addInitScript(() => {
    (window as unknown as { dataLayer: unknown[] }).dataLayer = [];
  });
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Something else');

  const secret = 'zzconfidentialcolleaguenamezz';
  await page.getByLabel(/What is wrong with it/).fill(secret);
  await page.locator(NEXT).click();
  await expect(page.locator(BODY)).toContainText(secret);

  // Follow the composed GitHub link, without leaving the page.
  await page.locator(SUBMIT).evaluate((el) => {
    el.setAttribute('target', '_blank');
    (el as HTMLAnchorElement).click();
  });

  const events = await page.evaluate(
    () => (window as unknown as { dataLayer: unknown[] }).dataLayer,
  );
  const serialised = JSON.stringify(events);
  // The click was recorded...
  expect(serialised).toContain('outbound_click');
  expect(serialised).toContain('github.com');
  // ...but carries neither the note nor the composed body.
  expect(serialised).not.toContain(secret);
  expect(serialised).not.toContain('details');
  // Nor the error class, which arrived as its own parameter when the field became
  // prefillable. The composed body's first line IS the error class, so dropping `details`
  // and keeping `reason` would have re-added by accident exactly what dropping the body
  // was a decision to leave out.
  expect(serialised).not.toContain('reason');
  expect(serialised).not.toContain('Something%20else');
  // And still carries the entry id. Dropping the whole query took this with it, which
  // removed the only per-entry attribution the route has (the page-view beacon strips
  // query strings) while looking like a privacy improvement.
  expect(serialised).toContain('item=paper%3A214');
});

test('an unanswered follow-up is flagged, not just an unusable one', async ({ page }) => {
  // Picking the first reason and pressing Next twice produced a report naming the problem
  // and not the correction, with nothing on screen saying so — under a lede that promises
  // "we write the report for you". The dropped-answer notice covered only the DOI path,
  // which is the rarer case.
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Wrong matrix placement');
  await page.locator(NEXT).click();

  const dropped = page.locator('#caail-compose-dropped');
  await expect(dropped).toBeVisible();
  await expect(dropped).toContainText('names the problem but not what it should be');
  await expect(page.locator(BODY)).not.toContainText('Should be');

  // Answering either axis clears it: a half-answered placement still says something.
  await page.locator(BACK).click();
  await page.getByLabel('Research area it should be').selectOption({ index: 1 });
  await page.locator(NEXT).click();
  await expect(dropped).toHaveText('');
  await expect(page.locator(BODY)).toContainText('Research area should be:');
});

test('a catch-all reason with an empty note is flagged as saying nothing', async ({ page }) => {
  // "Something else" with the note left blank composes two lines that say an entry is wrong
  // and nothing at all about how. That body is prefilled into GitHub's `details` field,
  // which is `required: true` — so the form's own "describe this" gate is satisfied by
  // content-free text and the reader is never asked again. The unanswered-follow-up notice
  // covered the three select kinds and skipped this one, on the grounds that the note is
  // optional; optional is exactly why it is the likeliest to be empty.
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Something else');
  await page.locator(NEXT).click();

  const dropped = page.locator('#caail-compose-dropped');
  await expect(dropped).toBeVisible();
  await expect(dropped).toContainText('names the problem but not what it should be');

  // And it clears as soon as there is something to read, rather than latching.
  await page.locator(BACK).click();
  await page.getByLabel(/What is wrong with it/).fill('The summary says 12 species; the table lists 17.');
  await page.locator(NEXT).click();
  await expect(dropped).toHaveText('');
  await expect(page.locator(BODY)).toContainText('Note: The summary says 12 species');
});

test('the composed problem line carries no form instructions', async ({ page }) => {
  // The reason's label is published verbatim into a public issue. "Something else (describe
  // below)" told the reader of that issue to look below, at nothing.
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Something else');
  await page.locator(NEXT).click();
  await expect(page.locator(BODY)).toContainText('Problem: Something else');
  await expect(page.locator(BODY)).not.toContainText('describe');
});

test('the live regions stay in the accessibility tree while empty', async ({ page }) => {
  // A `role="alert"` / `role="status"` region that is `display: none` at the moment its
  // content changes is not reliably announced by NVDA, JAWS or VoiceOver — and empty is by
  // definition the state immediately before it is written. A `:empty { display: none }`
  // rule therefore silently defeats every announcement these regions exist for, including
  // the clear-and-re-post machinery written to guarantee them: that code can make a region
  // change, it cannot make it present.
  //
  // Zero height is fine and expected; `display: none` is not.
  await page.goto('./report/?item=paper:214');
  await expect(page.locator(COMPOSER)).toBeVisible();

  for (const id of ['#caail-compose-error', '#caail-compose-dropped']) {
    const region = page.locator(id);
    await expect(region).toHaveText('');
    const display = await region.evaluate((el) => getComputedStyle(el).display);
    expect(display, `${id} while empty`).not.toBe('none');
  }

  // And the script-built one, which is empty until the shape check fails.
  await chooseReason(page, 'Wrong or missing DOI');
  const doiError = page.locator('#caail-f-doi-err');
  await expect(doiError).toHaveText('');
  expect(await doiError.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
});

test('the composer is axe-clean on the DARK theme, error messages included', async ({ page }) => {
  // The gap this closes: every other axe scan here runs on the default light scheme, and
  // the palette inverts by lightness, so a colour that passes on white can fail on the
  // dark ground and no scan would say so. It did: the error text was a hardcoded #b3261e,
  // 6.54:1 on white and 2.93:1 on the dark background, on exactly the text that has to be
  // readable.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./report/?item=paper:214');

  // Asserted, not assumed. Starlight sets data-theme from its own script, so without this
  // the whole test could pass while still measuring the light theme.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator(COMPOSER)).toBeVisible();

  // Both error messages on screen at once: the step-1 alert and the DOI shape error.
  await page.locator(NEXT).click();
  await expect(page.locator('#caail-compose-error')).not.toHaveText('');
  const stepOne = await new AxeBuilder({ page }).analyze();
  expect(stepOne.violations, 'dark theme, step 1 with an error').toEqual([]);

  await chooseReason(page, 'Wrong or missing DOI');
  await page.getByLabel('The DOI it should have').fill('nope');
  await expect(page.locator('#caail-f-doi-err')).not.toHaveText('');
  const withError = await new AxeBuilder({ page }).analyze();
  expect(withError.violations, 'dark theme, DOI error').toEqual([]);
});

test('changing the reason clears the answers that belonged to the old one', async ({ page }) => {
  // A stale follow-up would be composed into a report about a different error class,
  // which is a wrong report rather than an incomplete one.
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Wrong or missing DOI');
  await page.getByLabel('The DOI it should have').fill('10.1234/abc');
  await expect(page.locator(BODY)).toContainText('10.1234/abc');

  await page.locator(BACK).click();
  await page.getByRole('radio', { name: /^Wrong licence tier/ }).check();
  await page.locator(NEXT).click();
  await page.locator(NEXT).click();
  await expect(page.locator(BODY)).not.toContainText('10.1234/abc');
  await expect(page.locator(BODY)).toContainText('Problem: Wrong licence tier');
});

test('the review step tells the same story about a DOI as the field did', async ({ page }) => {
  // The field splits its rejection two ways on purpose; the review step used to collapse
  // both into "not shaped like a DOI". So a reader whose DOI was merely too long was told
  // it was well formed on step 2 and malformed on step 3, about one unchanged string.
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Wrong or missing DOI');
  const field = page.getByLabel('The DOI it should have');
  const dropped = page.locator('#caail-compose-dropped');

  await field.fill(`10.1234/${'提'.repeat(100)}`);
  await expect(page.locator('#caail-f-doi-err')).toContainText('longer than any real DOI');
  await page.locator(NEXT).click();
  await expect(dropped).toContainText('longer than any real DOI');
  await expect(dropped).not.toContainText('not shaped like');

  // The malformed branch still reads as it did.
  await page.locator(BACK).click();
  await field.fill('not a doi');
  await page.locator(NEXT).click();
  await expect(dropped).toContainText('not shaped like a DOI');
});

test('a note the report could not carry whole is flagged on the review step', async ({ page }) => {
  // boundNote caps encoded length as well as characters, and a CJK character costs three
  // encoded — so 400 of them compose as 155. The note counter says so, and the counter is
  // on step 2, which is not on screen here. Losing nearly two thirds of the reader's only
  // free-text answer with nothing on the final step saying so is the exact failure this
  // notice was added for, reached through the field it did not cover.
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Something else');
  await page.getByLabel(/What is wrong with it/).fill('提'.repeat(400));
  await page.locator(NEXT).click();

  const dropped = page.locator('#caail-compose-dropped');
  await expect(dropped).toBeVisible();
  await expect(dropped).toContainText('longer than the report can carry');

  // A note that fits entirely says nothing at all.
  await page.locator(BACK).click();
  await page.getByLabel(/What is wrong with it/).fill('The table lists 17 species, the summary says 12.');
  await page.locator(NEXT).click();
  await expect(dropped).toHaveText('');
});

test('a full note field says so, rather than losing a paste in silence', async ({ page }) => {
  // `maxLength` bounds the raw value while the counter measures the collapsed one, and
  // collapsing can shorten by any factor — so a whitespace-heavy paste gets cut by the
  // field while the numbers still show headroom. 1,200 characters that would have reached
  // the report whole arrived as "267 of 400", 132 short, with nothing saying so.
  await page.goto('./report/?item=paper:214');
  await chooseReason(page, 'Something else');
  const field = page.getByLabel(/What is wrong with it/);
  const count = page.locator('#caail-f-note-count');

  // Well under the field's capacity: the ordinary readout, no full-field warning.
  await field.fill('a short note');
  await expect(count).toContainText('characters');
  await expect(count).not.toContainText('field is full');

  // At capacity, whichever way it got there.
  const cap = Number(await field.getAttribute('maxlength'));
  expect(cap).toBeGreaterThan(0);
  await field.fill('a'.repeat(cap));
  await expect(count).toContainText('field is full');
  await expect(count).toContainText(String(cap));
});

test('a note is bounded, and cannot forge a line of the report', async ({ page }) => {
  await page.goto('./report/?item=ds:chickengtex-portal');
  await chooseReason(page, 'Something else');

  const note = page.getByLabel(/What is wrong with it/);
  await note.fill('line one\nEntry: paper:999');
  // The newline is collapsed, so the forged "Entry:" cannot be read as a line the
  // composer wrote. The report still has exactly three lines.
  const body = await page.locator(BODY).textContent();
  expect(body!.split('\n')).toHaveLength(3);
  expect(body).toContain('Note: line one Entry: paper:999');
});

test('a software card links to the report page carrying its frozen sw: id', async ({ page }) => {
  await page.goto('./software/');
  await awaitHydrated(page, 'CatalogBrowser');
  const link = page.locator('.cb-card .report-link').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/\/report\/\?item=sw%3A[a-z0-9-]+$/);
  // The accessible name names the entry, so a screen-reader user hearing the tenth
  // "Report an issue" on the page can still tell which entry it belongs to.
  const label = await link.getAttribute('aria-label');
  expect(label).toMatch(/^Report an issue with .+/);
});

test('a database card links with a db: id, not the software namespace', async ({ page }) => {
  await page.goto('./databases/');
  await awaitHydrated(page, 'CatalogBrowser');
  const href = await page.locator('.cb-card .report-link').first().getAttribute('href');
  expect(href).toMatch(/\/report\/\?item=db%3A[a-z0-9-]+$/);
});

test('a reviews card links with its paper: id', async ({ page }) => {
  await page.goto('./papers/reviews/');
  await awaitHydrated(page, 'ReferenceShelf');
  const href = await page.locator('.px-ref .report-link').first().getAttribute('href');
  expect(href).toMatch(/\/report\/\?item=paper%3A\d+$/);
});

test('an Explorer reference links with its paper: id, from the cell panel', async ({ page }) => {
  // The Explorer renders references only into the side panel, so unlike every other card
  // surface here this link is absent from the served HTML and exists purely at runtime.
  await page.goto('./papers/explorer/');
  await awaitHydrated(page, 'PapersExplorer');
  await page.getByRole('button', { name: /Deep Learning × Cellular Engineering: \d+ papers/ }).click();
  const href = await page.locator('.px-panel .px-ref .report-link').first().getAttribute('href');
  expect(href).toMatch(/\/report\/\?item=paper%3A\d+$/);
});

test('a curated dataset card links with its ds: id', async ({ page }) => {
  await page.goto('./datasets/chicken/');
  const link = page.locator('.ds-card .report-link').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/\/report\/\?item=ds%3A[a-z0-9-]+$/);
});

test('following a card link lands on the report page with that entry resolved', async ({ page }) => {
  await page.goto('./software/');
  await awaitHydrated(page, 'CatalogBrowser');
  const link = page.locator('.cb-card .report-link').first();
  const expected = decodeURIComponent(new URL(await link.getAttribute('href')!, page.url()).search)
    .replace('?item=', '');
  await link.click();
  await expect(page).toHaveURL(/\/report\/\?item=/);
  await expect(page.locator('#caail-report-id-value')).toHaveText(expected);
});

test('the report link does not stretch the badges it sits beside', async ({ page }) => {
  // The link carries a 24px minimum for its tap target, and `.px-badges` used to default
  // to align-items: stretch, so adding it made every DOI/Code/citation pill on the row
  // 24px tall with its text top-aligned. Asserted on the pills, not on the link.
  await page.goto('./papers/reviews/');
  await awaitHydrated(page, 'ReferenceShelf');
  const pill = page.locator('.px-ref .px-bdg.doi').first();
  await expect(pill).toBeVisible();
  const height = await pill.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThan(24);
});

test('the report link trails its meta row whether or not a citation badge precedes it', async ({ page }) => {
  // `space-between` separates two or more children and does nothing for one, so on a card
  // with no citation badge the link would sit flush left and its position would alternate
  // down the grid.
  //
  // The badge-less case is produced by REMOVING a badge rather than by finding a card that
  // lacks one. DOI backfill is an ongoing curation task, so the day it finishes, a spec
  // that required a badge-less card would go red on a data commit touching no code — and
  // would report a layout problem that does not exist.
  await page.goto('./software/');
  await awaitHydrated(page, 'CatalogBrowser');
  const gaps = await page.locator('.cb-card .cb-meta').evaluateAll((rows) => {
    const trailingGap = (row: Element) => {
      const link = row.querySelector('.report-link')!;
      return row.getBoundingClientRect().right - link.getBoundingClientRect().right;
    };
    const withBadge = rows.find((r) => r.querySelector('.cite-badge') && r.querySelector('.report-link'));
    if (!withBadge) return null;
    const before = trailingGap(withBadge);
    withBadge.querySelector('.cite-badge')!.remove();
    return { before, alone: trailingGap(withBadge) };
  });
  expect(gaps).not.toBeNull();
  expect(Math.abs(gaps!.before)).toBeLessThan(1);
  expect(Math.abs(gaps!.alone)).toBeLessThan(1);
});

test("the homepage topics band's correction CTA points at the report page", async ({ page }) => {
  await page.goto('./');
  // Previously a Slack invite, which is not a report path: a reader who noticed a theme
  // looked wrong had nowhere entry-anchored to say so.
  const cta = page.locator('#topics a', { hasText: 'telling us' });
  await expect(cta).toHaveAttribute('href', /\/report\/$/);
});
