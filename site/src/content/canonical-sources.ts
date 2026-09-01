/**
 * canonical-sources.ts — which repo-root files the docs loader turns into routes.
 *
 * WHY THIS IS ITS OWN MODULE, and not part of `loaders/caail-docs-loader.ts`
 * where it used to live. `site/scripts/private-paths.test.ts` is the guard that
 * proves `.env` and every private working tree are gitignored, and it needs this
 * list to know what must STAY publishable. Importing it from the loader dragged
 * `astro/loaders` and the whole Astro module graph into that guard: an Astro
 * major bump, a change to that package's export map, or any error thrown at the
 * loader's top level would take the guard down for a reason with nothing to do
 * with what it guards, and the failure would name a module the test has no
 * business touching.
 *
 * WHAT THE CONSTRAINT ACTUALLY IS: a property of this module's dependency
 * CLOSURE, not of its import count. Nothing reachable from here may throw while
 * being evaluated, because that throw lands during COLLECTION of the guard and
 * reports `Tests no tests` rather than a publishing failure.
 *
 * So this file may import a project module that is itself inside the checked
 * closure, and may import nothing else. `pure-modules.test.ts` walks that
 * closure rather than checking one level, so the permission and the guarantee
 * are the same fact. Adding a bare specifier here, or to anything reachable
 * from here, fails that test.
 *
 * TWO SEPARATE HAZARDS, AND THE WALK ONLY ADDRESSES ONE. An earlier draft of
 * this comment said a pure in-repo sibling "cannot introduce an evaluation
 * throw", and the sibling added in the same commit did exactly that:
 * `topLevelSources()` throws on a `group: 'top'` page with no `source`, so
 * computing `files` at module scope put that throw back into the guard's
 * collection, under a different door from the one the walk closes. Measured by
 * deleting one `source` field: `Tests no tests`, no private-tree probe run,
 * and the very test written to name the cause collapsed with the rest.
 *
 * The walk bounds what may be IMPORTED. It says nothing about what may THROW.
 * That is why `files` below is a getter: evaluation is deferred to first
 * access, which happens inside a lazy function or a test body in every reader,
 * so the throw fails one assertion instead of aborting a file. Its callers do
 * not change, and `private-paths.test.ts` made its own enumeration lazy for
 * this exact reason before this module existed.
 */

import { CAAIL_PAGES } from './caail-pages.ts';

/**
 * Canonical source files to ingest, as paths relative to the repo root.
 *
 *   - Every top-level `*.md` in `dirs` is considered (enumerated with
 *     `fs.readdir` — no extra glob dependency needed).
 *   - `files` is the individual top-level files, DERIVED from `CAAIL_PAGES`
 *     rather than written out here. It was a literal, and being a literal is
 *     what let a second reader of the same set carry six of the seven names:
 *     the prototype branch's per-route Markdown endpoint omitted
 *     `Community.md`, so `/community/` was the one page on the site with no
 *     Markdown twin and no Copy-as-Markdown control. Deriving it means the
 *     next reader has one list to call rather than a list to copy.
 *
 * Each candidate is resolved to a route id via `CAAIL_PAGES.idForSourcePath`;
 * any file whose id has no `CAAIL_PAGES` entry (e.g. the `CLAUDE.md` files in
 * those directories) is skipped, so the directory scan is allowed to be broad.
 */
export const CANONICAL_SOURCES = {
  dirs: ['ResearchAreas', 'Methods', 'Datasets'],
  /**
   * A GETTER, not a value. See "TWO SEPARATE HAZARDS" above: this derivation
   * can throw, and at module scope that throw aborts collection of the guard
   * that imports this file rather than failing one test.
   */
  get files(): readonly string[] {
    return CAAIL_PAGES.topLevelSources();
  },
} as const;
