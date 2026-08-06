/**
 * Roving-tabindex tab list (WAI-ARIA Tabs pattern), shared by the homepage bands.
 *
 * Extracted when a second section needed it. The keyboard contract — arrows wrap,
 * Home/End jump to the ends, exactly one tab in the tab order at a time — is the part
 * that quietly rots when copy-pasted, because a visual tweak to one copy leaves the
 * other behind and nobody notices until someone navigates by keyboard.
 *
 * Panels are ordinary elements toggled with `hidden`, so before this runs the first
 * panel is already visible and readable. The enhancement adds switching; it is not
 * what makes the content appear.
 */
export function initTabs(listSelector: string): void {
  for (const list of document.querySelectorAll<HTMLElement>(listSelector)) {
    const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    if (tabs.length === 0) continue;

    const select = (i: number, focus: boolean) => {
      tabs.forEach((t, j) => {
        const on = i === j;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls') ?? '');
        if (!panel) return;
        panel.hidden = !on;
        if (!on) return;

        // Replay the enter animation on the panel being shown.
        //
        // The reference implementation is React remounting the panel on a key change,
        // which restarts its CSS animation for free. Without a remount the animation has
        // already run to completion, so removing and re-adding the class does nothing
        // until the style change is flushed — hence the forced reflow between them.
        //
        // Deliberately NOT applied on initial render: this fades from opacity 0, and axe
        // (therefore Lighthouse, therefore the deploy gate) computes contrast through
        // opacity. An audit never clicks a tab, so a click-only animation cannot be
        // sampled mid-fade. See reveal.css for the same constraint bitten the hard way.
        panel.classList.remove('is-enter');
        void panel.offsetWidth;
        panel.classList.add('is-enter');
      });
      // Only pull focus for keyboard-driven moves. Doing it on click too would be
      // harmless here but steals focus from a click that landed on the panel.
      if (focus) tabs[i]!.focus();
    };

    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i, false));
      t.addEventListener('keydown', (e) => {
        const k = e.key;
        if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'Home' && k !== 'End') return;
        e.preventDefault();
        select(
          k === 'Home' ? 0
          : k === 'End' ? tabs.length - 1
          : k === 'ArrowRight' ? (i + 1) % tabs.length
          : (i - 1 + tabs.length) % tabs.length,
          true,
        );
      });
    });
  }
}

/**
 * Copy-to-clipboard for `[data-copy]` buttons under `rootSelector`.
 *
 * Progressive enhancement in both directions: without JS the text is still selectable,
 * and if the clipboard write is refused (insecure context, denied permission) the label
 * is left alone rather than claiming a copy that did not happen.
 */
export function initCopyButtons(rootSelector: string): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>(`${rootSelector} [data-copy]`)) {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy ?? '');
      } catch {
        return;
      }
      btn.classList.add('is-done');
      // Announce to screen readers, which do not see a class or glyph change.
      const live = btn.closest(rootSelector)?.querySelector('output');
      if (live) live.textContent = 'Copied to clipboard';
      window.setTimeout(() => {
        btn.classList.remove('is-done');
        if (live) live.textContent = '';
      }, 2000);
    });
  }
}
