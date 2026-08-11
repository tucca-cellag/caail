/** @jsxImportSource preact */
/**
 * CaailChatWidget — a small floating "Ask CAAIL" button (bottom-right, every page)
 * that expands into a minimal chat panel. Pure UI: all retrieval + generation happens
 * server-side at PUBLIC_CAAIL_CHAT_API, POST { query } -> { answer }. No API key, no
 * embeddings, no llms-full.txt handling here.
 *
 * Mounted once per page from Footer.astro, but rendered through a PORTAL into
 * document.body rather than in place. Its DOM location very much does matter:
 * Starlight's `.main-pane` sets `isolation: isolate`, which creates a stacking
 * context, and the footer lives inside it. Rendered in place, the widget's
 * `z-index: 50` is scoped to that context, while `.right-sidebar` — a fixed,
 * viewport-height element in a *later sibling* branch — paints above it and
 * swallows the clicks. The button stayed visible but became unclickable on every
 * page with an "On this page" sidebar. No z-index value escapes a stacking
 * context, so the element has to leave it.
 *
 * The portal also removes a race: rendered in place the button was server-rendered
 * and therefore present but inert until `client:idle` hydration attached its
 * handler. Portalled, it exists only once hydrated, so it is never a dead control.
 */
import './chat-widget.css';
import { useEffect, useId, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { renderMarkdown } from '../lib/markdown';

const CHAT_API = import.meta.env.PUBLIC_CAAIL_CHAT_API as string | undefined;
const WORD_LIMIT = 200;
/** Dismissal lasts the browsing session, not forever — sessionStorage, not local. */
const DISMISS_KEY = 'caail-chat-dismissed';
const QUOTA_MESSAGE = "'Ask CAAIL' quota is exceeded, try again later.";
const GENERIC_ERROR_MESSAGE = 'Something went wrong, please try again.';

const wordCount = (text: string) => {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

type Status = 'idle' | 'loading' | 'error';

export default function CaailChatWidget() {
  const panelId = useId();
  // The portal needs document.body, which does not exist during SSR. Rendering
  // null on the server means the island emits no markup and the widget appears
  // on hydration — which is also when it first becomes usable.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [answer, setAnswer] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Lazy initialiser rather than an effect, so a dismissed widget is never
  // rendered even for a frame. Guarded because sessionStorage does not exist
  // during SSR, and throws outright in some privacy modes.
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  const count = wordCount(query);
  const overLimit = count > WORD_LIMIT;
  const canSubmit = status !== 'loading' && count > 0 && !overLimit && !!CHAT_API;

  function closeAndReset() {
    setOpen(false);
    setQuery('');
    setStatus('idle');
    setAnswer(null);
    setErrorMessage(null);
  }

  /** Take the widget off the page for the rest of the session (#128). */
  function dismiss() {
    closeAndReset();
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode or storage disabled — dismissal just won't outlive the page */
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (!canSubmit || !CHAT_API) return;
    setStatus('loading');
    setErrorMessage(null);
    setAnswer(null);
    try {
      const res = await fetch(CHAT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnswer(data.answer as string);
        setStatus('idle');
      } else if (res.status === 429) {
        setErrorMessage(QUOTA_MESSAGE);
        setStatus('error');
      } else {
        setErrorMessage(GENERIC_ERROR_MESSAGE);
        setStatus('error');
      }
    } catch {
      setErrorMessage(GENERIC_ERROR_MESSAGE);
      setStatus('error');
    }
  }

  // Nothing is server-rendered here (the portal needs document.body), so a plain
  // `return null` genuinely removes the widget — there is no adopted SSR markup
  // for a null vdom to leave stranded.
  if (!mounted || dismissed) return null;

  return createPortal(
    <div class="chat-widget">
      {open && (
        <div class="chat-panel" id={panelId} role="dialog" aria-label="Ask CAAIL">
          <div class="chat-panel-header">
            <span class="chat-panel-title">Ask CAAIL</span>
            <button
              type="button"
              class="chat-panel-close"
              aria-label="Close chat"
              onClick={closeAndReset}
            >
              ×
            </button>
          </div>
          <p class="chat-panel-blurb">
            Ask a question, answered by AI using CAAIL's curated papers, datasets, and tools.
          </p>
          <form class="chat-panel-form" onSubmit={handleSubmit}>
            <textarea
              class="chat-panel-input"
              placeholder="What would you like to know?"
              value={query}
              disabled={status === 'loading'}
              onInput={(e) => setQuery((e.target as HTMLTextAreaElement).value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  (e.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
                }
              }}
              rows={3}
            />
            <div class="chat-panel-footer">
              <span></span>
              <button type="submit" class="chat-panel-submit" disabled={!canSubmit}>
                {status === 'loading' ? (
                  <span class="chat-dots-label">
                    Asking
                    <span class="chat-dots" aria-hidden="true">
                      <span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </span>
                  </span>
                ) : (
                  'Ask'
                )}
              </button>
            </div>
          </form>
          {errorMessage && <p class="chat-panel-status chat-panel-status--error">{errorMessage}</p>}
          {answer && (
            <div class="chat-panel-answer" dangerouslySetInnerHTML={{ __html: renderMarkdown(answer) }} />
          )}
        </div>
      )}
      <div class="chat-fab-wrap">
        <button
          type="button"
          class="chat-fab"
          aria-label={open ? 'Close chat' : 'Ask CAAIL a question'}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => (open ? closeAndReset() : setOpen(true))}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="currentColor"
              d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-4.29 3.71A1 1 0 0 1 3 20V5a1 1 0 0 1 1-1z"
            />
          </svg>
        </button>
        {/* Escape hatch for when the button sits on top of something the reader
            needs (#128). Its own control rather than a menu item, because the
            moment you want it is the moment the thing is in your way. */}
        <button
          type="button"
          class="chat-dismiss"
          aria-label="Hide Ask CAAIL for this visit"
          title="Hide Ask CAAIL for this visit"
          onClick={dismiss}
        >
          <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="4"
              stroke-linecap="round"
              d="M5 5l14 14M19 5L5 19"
            />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  );
}
