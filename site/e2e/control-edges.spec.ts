import { test, expect, type Page } from '@playwright/test';

async function useScheme(page: Page, scheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: scheme });
}

/** Asserted, not assumed: Starlight sets data-theme from its own script. */
async function expectTheme(page: Page, scheme: 'light' | 'dark') {
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
}

/**
 * Form controls' edges, WCAG 1.4.11: a text box or select whose only boundary is its
 * border needs that border at 3:1 against what is around it and against its own fill.
 * Axe has no rule for this, so it is measured: each colour is read as computed and
 * turned into sRGB by painting it on a canvas, which handles whatever syntax the
 * browser reports (oklch included).
 */
async function edgeContrast(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    const rgba = (css: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    // The opaque colour behind an element: its own background composited over its
    // ancestors' until one is opaque, ending on white if none is.
    const behind = (start: Element | null) => {
      const layers: { r: number; g: number; b: number; a: number }[] = [];
      for (let n = start; n; n = n.parentElement) {
        const c = rgba(getComputedStyle(n).backgroundColor);
        if (c.a > 0) layers.push(c);
        if (c.a >= 1) break;
      }
      let out = { r: 255, g: 255, b: 255 };
      for (const l of layers.reverse()) {
        out = { r: l.r * l.a + out.r * (1 - l.a), g: l.g * l.a + out.g * (1 - l.a), b: l.b * l.a + out.b * (1 - l.a) };
      }
      return out;
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ratio = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const style = getComputedStyle(el);
    const edge = rgba(style.borderTopColor);
    return {
      width: parseFloat(style.borderTopWidth),
      outside: Math.round(ratio(edge, behind(el.parentElement)) * 100) / 100,
      inside: Math.round(ratio(edge, behind(el)) * 100) / 100,
    };
  });
}

const CONTROLS = [
  { route: './software/', selectors: ['.cb-search', '.cb-select'] },
  { route: './papers/explorer/', selectors: ['.px-search', '.px-select'] },
  { route: './papers/network/', selectors: ['.ng-select'] },
  { route: './papers/reviews/', selectors: ['.rs-search'] },
];

for (const scheme of ['light', 'dark'] as const) {
  for (const { route, selectors } of CONTROLS) {
    test(`form controls on ${route} have a 3:1 edge in the ${scheme} theme`, async ({ page }) => {
      await useScheme(page, scheme);
      await page.goto(route);
      await expectTheme(page, scheme);
      for (const sel of selectors) {
        await expect(page.locator(sel).first()).toBeVisible();
        const c = await edgeContrast(page, sel);
        expect(c.width, `${sel} has no border to measure`).toBeGreaterThan(0);
        expect.soft(c.outside, `${sel}: edge against the page around it`).toBeGreaterThanOrEqual(3);
        expect.soft(c.inside, `${sel}: edge against its own fill`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  test(`the report form's fields have a 3:1 edge in the ${scheme} theme`, async ({ page }) => {
    await useScheme(page, scheme);
    await page.goto('./report/?item=paper:214');
    await expectTheme(page, scheme);
    await page.getByRole('radio', { name: /^Wrong or missing DOI/ }).check();
    await page.locator('#caail-compose-next').click();
    const sel = '#caail-f-doi';
    await expect(page.locator(sel)).toBeVisible();
    const c = await edgeContrast(page, sel);
    expect(c.width, `${sel} has no border to measure`).toBeGreaterThan(0);
    expect.soft(c.outside, `${sel}: edge against the page around it`).toBeGreaterThanOrEqual(3);
    expect.soft(c.inside, `${sel}: edge against its own fill`).toBeGreaterThanOrEqual(3);
  });
}
