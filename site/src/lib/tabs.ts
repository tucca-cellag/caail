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
  // One timer per ROOT, not per button, because the thing being reset is shared.
  //
  // Each root holds several copy buttons but a single <output>. With a timer per button,
  // copying the prompt and then a command a second later left two timers running against
  // that one element: the first fired at its own 2s mark and wiped the second button's
  // announcement one second into its life. Re-clicking a single button cut short its own
  // `is-done` glyph the same way.
  //
  // Tracking the pending timer and the button currently showing `is-done` per root makes
  // the most recent copy own both, which is what a reader expects it to mean.
  const timers = new WeakMap<Element, number>();
  const marked = new WeakMap<Element, HTMLButtonElement>();

  for (const btn of document.querySelectorAll<HTMLButtonElement>(`${rootSelector} [data-copy]`)) {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy ?? '');
      } catch {
        return;
      }
      const root = btn.closest(rootSelector);
      if (!root) return;

      const pending = timers.get(root);
      if (pending !== undefined) window.clearTimeout(pending);
      marked.get(root)?.classList.remove('is-done');

      btn.classList.add('is-done');
      marked.set(root, btn);
      // Announce to screen readers, which do not see a class or glyph change.
      const live = root.querySelector('output');
      if (live) live.textContent = 'Copied to clipboard';

      timers.set(
        root,
        window.setTimeout(() => {
          btn.classList.remove('is-done');
          if (live) live.textContent = '';
          timers.delete(root);
          marked.delete(root);
        }, 2000),
      );
    });
  }
}
