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
  const srcDir = posix.dirname(options.sourcePath);
  return (tree: Root) => {
    visit(tree, 'link', (node: any) => {
      const url: string = node.url;
      // External (scheme:), intra-page (#…), or protocol-relative (//…) → leave.
      if (/^[a-z]+:/i.test(url) || url.startsWith('#') || url.startsWith('//')) return;
      const [rawPath, anchor] = url.split('#');
      // A link to a directory (trailing slash, e.g. `./Datasets/`) resolves to
      // that directory's README index, mirroring how GitHub serves the folder.
      const path = rawPath.endsWith('/') ? rawPath + 'README.md' : rawPath;
      if (!/\.md$/i.test(path)) return;
      const repoRel = posix.normalize(posix.join(srcDir, path)).replace(/^\.\//, '');
      const idBase = repoRel.replace(/\.md$/i, '');
      const id = CAAIL_PAGES.idForSourcePath(idBase);
      if (CAAIL_PAGES.byId(id)) {
        node.url = `${base}/${id}/`;
        return;
      }
      let dedicated: string | undefined;
      try {
        dedicated = dedicatedLink(repoRel, anchor);
      } catch (e) {
        // Name the file holding the bad link, not only the file it points at.
        throw new Error(`${options.sourcePath}: ${(e as Error).message}`);
      }
      if (dedicated) {
        node.url = `${base}${dedicated}`;
      } else {
        node.url = `${GITHUB_BLOB_BASE}/${repoRel}${anchor ? '#' + anchor : ''}`;
      }
    });
  };
}
