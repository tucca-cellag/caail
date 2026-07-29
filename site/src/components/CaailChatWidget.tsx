/** @jsxImportSource preact */
/**
 * CaailChatWidget — a small floating "Ask CAAIL" button (bottom-right, every page)
 * that expands into a minimal chat panel. Pure UI: all retrieval + generation happens
 * server-side at PUBLIC_CAAIL_CHAT_API, POST { query } -> { answer }. No API key, no
 * embeddings, no llms-full.txt handling here.
 *
 * Mounted once per page (from Footer.astro), like NavCollapse/DataTableViews — it's
 * position:fixed, so its DOM location doesn't matter.
 */
import './chat-widget.css';
import { useId, useState } from 'preact/hooks';
import { renderMarkdown } from '../lib/markdown';

const CHAT_API = import.meta.env.PUBLIC_CAAIL_CHAT_API as string | undefined;
const WORD_LIMIT = 200;
const QUOTA_MESSAGE = "'Ask CAAIL' quota is exceeded — try again later.";
const GENERIC_ERROR_MESSAGE = 'Something went wrong, please try again.';

const wordCount = (text: string) => {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

type Status = 'idle' | 'loading' | 'error';

export default function CaailChatWidget() {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [answer, setAnswer] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const count = wordCount(query);
  const overLimit = count > WORD_LIMIT;
  const canSubmit = status !== 'loading' && count > 0 && !overLimit && !!CHAT_API;

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

  return (
    <div class="chat-widget">
      {open && (
        <div class="chat-panel" id={panelId} role="dialog" aria-label="Ask CAAIL">
          <div class="chat-panel-header">
            <span class="chat-panel-title">Ask CAAIL</span>
            <button
              type="button"
              class="chat-panel-close"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <p class="chat-panel-blurb">Ask a question about CAAIL's curated papers, datasets, and tools.</p>
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
                {status === 'loading' ? 'Asking…' : 'Ask'}
              </button>
            </div>
          </form>
          {status === 'loading' && <p class="chat-panel-status">Thinking…</p>}
          {errorMessage && <p class="chat-panel-status chat-panel-status--error">{errorMessage}</p>}
          {answer && (
            <div class="chat-panel-answer" dangerouslySetInnerHTML={{ __html: renderMarkdown(answer) }} />
          )}
        </div>
      )}
      <button
        type="button"
        class="chat-fab"
        aria-label={open ? 'Close chat' : 'Ask CAAIL a question'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-4.29 3.71A1 1 0 0 1 3 20V5a1 1 0 0 1 1-1z"
          />
        </svg>
      </button>
    </div>
  );
}
