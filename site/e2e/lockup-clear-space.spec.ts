import { test, expect } from '@playwright/test';
import { LOCKUP_ASSET_HEIGHT, LOCKUP_T_CAP_HEIGHT } from '../src/lib/tucca-lockup';

/**
 * The lockup's clear space: nothing within one cap height of the "T" of the mark.
 *
 * Everything that could intrude is collected and tested against the mark's box grown by
 * that distance: text (by its line boxes, not its element's box), images and icons, and
 * border lines, which is how the hairline rules above the footer and the hero's router
 * would intrude.
 */
const PLACEMENTS = [
  { route: './', selector: '.hero-attrib .tl', where: 'the hero' },
  { route: './about/', selector: '.caail-footer .tl', where: 'the footer' },
];

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  for (const { route, selector, where } of PLACEMENTS) {
    test(`at ${viewport.width}px nothing intrudes on the lockup's clear space in ${where}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(route);
      const lockup = page.locator(selector);
      await lockup.scrollIntoViewIfNeeded();
      const found = await lockup.evaluate(
        (a, { cap, height }) => {
          const mark = a.querySelector('.tl-mark')!.getBoundingClientRect();
          const clear = (mark.height * cap) / height - 0.5;
          const zone = { l: mark.left - clear, r: mark.right + clear, t: mark.top - clear, b: mark.bottom + clear };
          const hits = (r: { left: number; right: number; top: number; bottom: number }) =>
            r.right > zone.l && r.left < zone.r && r.bottom > zone.t && r.top < zone.b && r.right > r.left && r.bottom > r.top;
          const own = (n: Node) => a.contains(n) || (n instanceof Element && n.classList.contains('tl-name')) || n.parentElement?.classList.contains('tl-name');
          const shown = (el: Element) => {
            const s = getComputedStyle(el);
            return s.visibility !== 'hidden' && s.clipPath !== 'inset(50%)';
          };
          const out: string[] = [];

          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!n.textContent?.trim() || own(n) || !n.parentElement || !shown(n.parentElement)) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            for (const r of range.getClientRects()) if (hits(r)) out.push(`text "${n.textContent.trim().slice(0, 40)}"`);
          }
          for (const el of document.body.querySelectorAll('*')) {
            if (own(el) || !shown(el)) continue;
            const box = el.getBoundingClientRect();
            if ((el instanceof SVGSVGElement || el instanceof HTMLImageElement) && hits(box)) out.push(`<${el.tagName.toLowerCase()}> ${el.className}`);
            const s = getComputedStyle(el);
            const sides = [
              ['top', { left: box.left, right: box.right, top: box.top, bottom: box.top + parseFloat(s.borderTopWidth) }],
              ['bottom', { left: box.left, right: box.right, top: box.bottom - parseFloat(s.borderBottomWidth), bottom: box.bottom }],
              ['left', { left: box.left, right: box.left + parseFloat(s.borderLeftWidth), top: box.top, bottom: box.bottom }],
              ['right', { left: box.right - parseFloat(s.borderRightWidth), right: box.right, top: box.top, bottom: box.bottom }],
            ] as const;
            for (const [side, line] of sides) {
              const style = s.getPropertyValue(`border-${side}-style`);
              if (style !== 'none' && style !== 'hidden' && hits(line)) out.push(`${side} border of <${el.tagName.toLowerCase()} class="${el.className}">`);
            }
          }
          return { clear: Math.round(clear * 10) / 10, out: [...new Set(out)] };
        },
        { cap: LOCKUP_T_CAP_HEIGHT, height: LOCKUP_ASSET_HEIGHT },
      );
      expect(found.clear, 'the clear space measured as nothing').toBeGreaterThan(10);
      expect(found.out, `within ${found.clear}px of the lockup`).toEqual([]);
    });
  }
}
