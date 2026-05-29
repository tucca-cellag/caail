import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { posix } from 'node:path';
import { CAAIL_PAGES } from '../../src/content/caail-pages.ts';

const GITHUB_BLOB_BASE = 'https://github.com/tucca-cellag/caail/blob/main';

/**
 * Rewrite internal `.md` links in the canonical Markdown so they resolve
 * correctly on the rendered site.
 *
 * - A link whose target is a rendered M2 page (present in `CAAIL_PAGES`) becomes
 *   the site route `${base}/<id>/` (any cross-file `#anchor` is dropped).
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
      const [path, anchor] = url.split('#');
      if (!/\.md$/i.test(path)) return;
      const repoRel = posix.normalize(posix.join(srcDir, path)).replace(/^\.\//, '');
      const idBase = repoRel.replace(/\.md$/i, '');
      const id = CAAIL_PAGES.idForSourcePath(idBase);
      if (CAAIL_PAGES.byId(id)) {
        node.url = `${base}/${id}/`;
      } else {
        node.url = `${GITHUB_BLOB_BASE}/${repoRel}${anchor ? '#' + anchor : ''}`;
      }
    });
  };
}
