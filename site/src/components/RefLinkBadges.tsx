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

/**
 * Each label as a badge shows it: unchanged where it is the only one of its kind on the
 * card, numbered in order where it repeats, so no two links on a card share a name
 * (`['Correction', 'Erratum', 'Correction']` gives `Correction 1`, `Erratum`, `Correction 2`).
 */
function numberRepeats(labels: readonly string[]): string[] {
  return labels.map((label, i) => {
    const before = labels.slice(0, i).filter((l) => l === label).length;
    return labels.filter((l) => l === label).length > 1 ? `${label} ${before + 1}` : label;
  });
}

export default function RefLinkBadges({ r }: { r: RefLinks }) {
  const modelLabels = numberRepeats(r.modelUrls.map(() => 'Model'));
  const noticeLabels = numberRepeats(r.notices.map((n) => n.label));
  return (
    <>
      {r.codeUrl && <a class="px-bdg code" href={r.codeUrl}>⟨⟩ Code</a>}
      {r.dataUrl && <a class="px-bdg data" href={r.dataUrl}>▤ Data</a>}
      {r.modelUrls.map((url, i) => (
        // The accessible name starts with the visible text, then says which weights it opens.
        <a key={`model|${url}`} class="px-bdg models" href={url} aria-label={`${modelLabels[i]}: ${modelName(url)}`} title={`Model weights: ${modelName(url)}`}>
          ◇ {modelLabels[i]}
        </a>
      ))}
      {r.notices.map((n, i) => (
        <a key={`notice|${i}|${n.url}`} class="px-bdg notice" href={n.url} title={`Post-publication notice: ${n.label}`}>
          ⓘ {noticeLabels[i]}
        </a>
      ))}
    </>
  );
}
