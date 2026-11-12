/** @jsxImportSource preact */
/**
 * RefLinkBadges: a reference's own links as card badges, in order: Code, Data, each
 * model (one badge per URL), and each post-publication notice under its publisher's
 * word (tucca-cellag/caail-planning#656). Shared by the Papers Explorer and the reviews
 * shelf, so the two cards cannot drift. Styling is in papers-explorer.css (`.px-bdg`).
 */
import type { Reference } from '../../scripts/parser/types';

export type RefLinks = Pick<Reference, 'codeUrl' | 'dataUrl' | 'modelUrls' | 'notices'>;

/** What a model link names, for its accessible label: the URL's last path segment, else its host. */
function modelName(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.split('/').filter(Boolean).at(-1) ?? u.host;
  } catch {
    return url;
  }
}

export default function RefLinkBadges({ r }: { r: RefLinks }) {
  return (
    <>
      {r.codeUrl && <a class="px-bdg code" href={r.codeUrl}>⟨⟩ Code</a>}
      {r.dataUrl && <a class="px-bdg data" href={r.dataUrl}>▤ Data</a>}
      {r.modelUrls.map((url, i, all) => {
        const label = all.length > 1 ? `Model ${i + 1}` : 'Model';
        // The accessible name starts with the visible text, then says which weights it opens.
        return (
          <a key={`model|${url}`} class="px-bdg models" href={url} aria-label={`${label}: ${modelName(url)}`} title={`Model weights: ${modelName(url)}`}>
            ◇ {label}
          </a>
        );
      })}
      {r.notices.map((n, i) => (
        <a key={`notice|${i}|${n.url}`} class="px-bdg notice" href={n.url} title={`Post-publication notice: ${n.label}`}>
          ⓘ {n.label}
        </a>
      ))}
    </>
  );
}
