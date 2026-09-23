/**
 * Canonical Markdown files that the site serves at a dedicated route rather
 * than through the prose loader, keyed by repo-relative path. Routes are
 * base-relative (no `/caail` prefix).
 *
 * These are deliberately NOT in `CAAIL_PAGES`: each route is an island or
 * card page built from a parser model (Papers explorer, Software, Databases,
 * Talks, Awesome Lists, Field Reports, the primer hubs), and registering one
 * there would make the prose loader render a second page at the same route.
 *
 * The one list for both link rewriters, the prose remark transform
 * (`scripts/remark/rewrite-caail-links.ts`) and the primer parser
 * (`scripts/parser/primers.ts`). They kept separate copies until a new card
 * page landed in one and not the other, and every repo-relative link to it on
 * the prose pages quietly shipped as a GitHub blob (CAAIL-374). A new card
 * page is added here and nowhere else.
 */
export const DEDICATED_ROUTES: Readonly<Record<string, string>> = {
  'README.md': '/',
  'Papers.md': '/papers/explorer/',
  'Software.md': '/software/',
  'Databases.md': '/databases/',
  'Talks.md': '/talks/',
  'AwesomeLists.md': '/awesome-lists/',
  'FieldReports.md': '/field-reports/',
  'Primers/CellAg.md': '/primers/cell-ag/',
  'Primers/AI.md': '/primers/ai/',
};
