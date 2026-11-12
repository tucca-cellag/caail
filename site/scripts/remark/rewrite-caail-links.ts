import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { posix } from 'node:path';
import { CAAIL_PAGES } from '../../src/content/caail-pages.ts';
import { dedicatedLink, GITHUB_BLOB_BASE } from '../dedicated-links.ts';

/**
 * Rewrite internal `.md` links in the canonical Markdown so they resolve
 * correctly on the rendered site.
 *
 * - A link whose target is a rendered M2 page (present in `CAAIL_PAGES`) becomes
 *   the site route `${base}/<id>/` (any cross-file `#anchor` is dropped).
 * - A link to a file served at a dedicated route (a card or island page in
 *   `DEDICATED_ROUTES`, e.g. `./FieldReports.md`) becomes that route when
 *   `dedicatedLink` can resolve it: always for a bare link, and for an anchored
 *   one only when the anchor is known to exist there (see dedicated-links.ts).
 *   An unresolvable anchor keeps its GitHub blob, which deep-links, rather
 *   than landing the reader at the top of a page that mints its own ids.
 * - Any other internal `.md` target (deferred pages, missing files) becomes a
 *   GitHub blob URL `${GITHUB_BLOB_BASE}/<repo-relative-path><#anchor>`.
 * - External (`http(s):`, `mailto:`, protocol-relative `//`) and intra-page
 *   (`#section`) links are left untouched.
 *
 * `options.sourcePath` is the canonical file's repo-relative path,
 * e.g. "Datasets/Cow.md".
 */
export function rewriteCaailLinks(options: { base: string; sourcePath: string }) {
  const base = options.base.replace(/\/$/, '');
  return (tree: Root) => {
    visit(tree, 'link', (node: any) => {
      const url = resolveCaailHref(node.url, options.sourcePath, base);
      if (url !== undefined) node.url = url;
    });
  };
}

/**
 * Where a link written in the canonical file at `sourcePath` resolves, by the rules
 * above, with site routes under `base` (no trailing slash). Undefined for a link
 * left as written: external, intra-page (`#…`), protocol-relative, or not to a
 * `.md` file. The agent API resolves the Markdown it serves with this too, so an
 * agent gets the link a reader of the same page gets (tucca-cellag/caail-planning#348).
 */
export function resolveCaailHref(url: string, sourcePath: string, base: string): string | undefined {
  // External (scheme:), intra-page (#…), or protocol-relative (//…) → leave.
  if (/^[a-z]+:/i.test(url) || url.startsWith('#') || url.startsWith('//')) return undefined;
  const [rawPath, anchor] = url.split('#');
  // A link to a directory (trailing slash, e.g. `./Datasets/`) resolves to
  // that directory's README index, mirroring how GitHub serves the folder.
  const path = rawPath.endsWith('/') ? rawPath + 'README.md' : rawPath;
  if (!/\.md$/i.test(path)) return undefined;
  // A root-relative path (`/Papers.md`) is read from the repo root, as GitHub reads it.
  const repoRel = (path.startsWith('/') ? posix.normalize(path.slice(1)) : posix.normalize(posix.join(posix.dirname(sourcePath), path)))
    .replace(/^\.\//, '');
  const id = CAAIL_PAGES.idForSourcePath(repoRel.replace(/\.md$/i, ''));
  if (CAAIL_PAGES.byId(id)) return `${base}/${id}/`;
  let dedicated: string | undefined;
  try {
    dedicated = dedicatedLink(repoRel, anchor);
  } catch (e) {
    // Name the file holding the bad link, not only the file it points at.
    throw new Error(`${sourcePath}: ${(e as Error).message}`);
  }
  return dedicated ? `${base}${dedicated}` : `${GITHUB_BLOB_BASE}/${repoRel}${anchor ? '#' + anchor : ''}`;
}
