/**
 * check.ts — integrity + drift guards for the authoring DB, mirroring the
 * generate-data.ts assert pattern (build the model, cross-check invariants, fail
 * loudly with a descriptive error). Runs on the DB rebuilt from committed NDJSON.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:check
 *
 * Guards:
 *  - referential integrity (PRAGMA foreign_key_check) + namespaced-id format +
 *    detail/registry type agreement + id uniqueness;
 *  - business rule: every primary-`## References` paper is cited in >=1 matrix cell
 *    (the matrix<->reference reachability lint, enforced at the source);
 *  - #81 drift: the matrix COLUMN list enumerated in CONTRIBUTING.md / CLAUDE.md
 *    must match the DB areas exactly (the volatile row list is de-enumerated, so
 *    only the stable column axis is guarded);
 *  - #133 axis resolution: Taxonomy.md's three vocabularies may share a label,
 *    so every DB row/column must resolve to a definition under its OWN H2, and
 *    no label may be defined twice within one axis;
 *  - subject-axis bijection: every theme names a research area, every
 *    research area is named by exactly one theme, and every research area has a
 *    ResearchAreas page. Asserted through `area_key`, never by label equality.
 *    Research-area axis only; the method-row axis is deliberately not gated.
 *  - inventory Data cells: a deposit link, `supplementary` or `unavailable`, read by the
 *    parser's own `readDataCell` (checkInventoryCells).
 *  - inventory pages: no page outside INVENTORY_PAGES carries an inventory table
 *    (checkInventoryPages).
 *  - twins: no curated entry and inventory row on one page name the same deposit
 *    (checkEntryRowTwins).
 *  - curated entries' own accessions: keys resolve, values are bare accessions, the column
 *    matches dataset-accessions.json (checkAccessions).
 *  - curated entries' own deposit links: keys resolve, values are http(s) links to a deposit
 *    rather than a paper or a family accession, the column matches dataset-data-links.json
 *    (checkDataLinks).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importNdjson, ACCESSION_EXACT, ACCESSION_SOURCE, idAccession, REPO_ROOT, SITE_ROOT, type Db } from './lib.js';
import { THEME_SLUGS, THEMES, FINE_TAGS, pageOrdinals, DATASET_ACCESSIONS_PATH, DATASET_DATA_LINKS_PATH } from './seed.js';
import { ON_REQUEST_PAGES } from '../parser/datasets.js';
import { strayInventoryTables } from './extract.js';
import { buildTaxonomyModel } from '../parser/taxonomy.js';
import { AREAS } from '../parser/areas.js';
import { MATRIX_SECTION } from '../parser/types.js';
import { seriesRecency, EDITION_SORT_RULE } from '../parser/reports.js';
import type { TaxonomyData } from '../parser/types.js';
import { bareDoi, cachedZenodoType, doiRelation, DOI_SHAPE, isZenodoDoi, itemDoiRelation } from '../parser/doi-relation.js';
import { parseMarkdown } from '../parser/markdown.js';
import { toString as mdastToString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';
import type { Definition, FootnoteDefinition } from 'mdast';
import {
  DATA_CELL_FORMS, fitsDoiLink, labelCells, parseRowCells, readDataCell, readInventoryHeader, statedDoi, WEB_ADDRESS,
  linkDestinations,
  type InventoryHeader,
} from '../parser/dataset-inventory.js';

const MANUAL_LICENSES_PATH = join(SITE_ROOT, 'scripts', 'db', 'licenses-manual.json');
const MANUAL_DOIS_PATH = join(SITE_ROOT, 'scripts', 'db', 'dois-manual.json');
const RELATED_DOIS_PATH = join(SITE_ROOT, 'scripts', 'db', 'dois-related.json');
const SUBSERIES_PATH = join(SITE_ROOT, 'scripts', 'db', 'subseries.json');

export interface CheckResult { label: string; ok: boolean; detail: string; }
const ok = (label: string, cond: boolean, detail = ''): CheckResult => ({ label, ok: cond, detail });

const PREFIX: Record<string, string> = { paper: 'paper', software: 'sw', database: 'db', dataset: 'ds', report: 'report', topic: 'topic' };

export function checkIntegrity(db: Db): CheckResult[] {
  const out: CheckResult[] = [];
  const fk = db.prepare('PRAGMA foreign_key_check').all() as unknown[];
  out.push(ok('no foreign-key violations', fk.length === 0, `${fk.length} violation(s)`));

  const items = db.prepare('SELECT id,type,slug FROM items').all() as { id: string; type: string; slug: string }[];
  const badFormat = items.filter((it) => it.id !== `${PREFIX[it.type]}:${it.slug}`);
  out.push(ok('every id is namespaced and matches its type + slug', badFormat.length === 0,
    badFormat.slice(0, 3).map((i) => i.id).join(', ')));

  const detailType: Array<[string, string | null]> = [
    ['papers', 'paper'], ['catalog', null],
    ['dataset_rows', 'dataset'], ['dataset_entries', 'dataset'], ['reports', 'report'], ['topics', 'topic'],
  ];
  for (const [table, type] of detailType) {
    const orphan = db.prepare(
      `SELECT d.item_id FROM ${table} d LEFT JOIN items i ON i.id=d.item_id WHERE i.id IS NULL`,
    ).all() as unknown[];
    out.push(ok(`every ${table} row has a registry item`, orphan.length === 0, `${orphan.length} orphan(s)`));
    if (type) {
      const wrong = db.prepare(
        `SELECT d.item_id FROM ${table} d JOIN items i ON i.id=d.item_id WHERE i.type<>?`,
      ).all(type) as unknown[];
      out.push(ok(`every ${table} item is type '${type}'`, wrong.length === 0, `${wrong.length} mistyped`));
    }
  }

  // catalog holds two types (software + database), so the single-type check above skips
  // it — assert its items are one of those two (a mistyped id, e.g. a paper: id in a
  // catalog row, would otherwise pass the orphan check and go unflagged).
  const wrongCat = db.prepare(
    "SELECT c.item_id FROM catalog c JOIN items i ON i.id=c.item_id WHERE i.type NOT IN ('software','database')",
  ).all() as { item_id: string }[];
  out.push(ok("every catalog item is type 'software' or 'database'", wrongCat.length === 0,
    wrongCat.slice(0, 3).map((r) => r.item_id).join(', ')));

  // A retired ref_id must NOT also be live in `papers` — that would mean a removed numeric
  // anchor was resurrected (e.g. a curator hand-pasting an old `<a id="N">` block back into
  // Papers.md then re-bootstrapping), violating the never-reuse guarantee.
  const resurrected = db.prepare(
    'SELECT ref_id FROM retired_paper_ids WHERE ref_id IN (SELECT ref_id FROM papers) ORDER BY ref_id',
  ).all() as { ref_id: number }[];
  out.push(ok('no retired ref_id is also live in papers', resurrected.length === 0,
    `resurrected: ${resurrected.slice(0, 5).map((r) => '#' + r.ref_id).join(', ')}`));

  // A `dataset` item lives in EXACTLY one of dataset_rows / dataset_entries — an
  // inventory row XOR a curated entry. Both would double-count; neither is an orphan
  // registry item. (The shared ds: seed set prevents the "both" case at seed time;
  // this guards the committed NDJSON against hand-edits.)
  const both = db.prepare(
    'SELECT item_id FROM dataset_rows WHERE item_id IN (SELECT item_id FROM dataset_entries)',
  ).all() as unknown[];
  out.push(ok('no dataset item is in both dataset_rows and dataset_entries', both.length === 0, `${both.length} in both`));
  const neither = db.prepare(
    `SELECT id FROM items WHERE type='dataset'
       AND id NOT IN (SELECT item_id FROM dataset_rows)
       AND id NOT IN (SELECT item_id FROM dataset_entries)`,
  ).all() as unknown[];
  out.push(ok('every dataset item is in dataset_rows or dataset_entries', neither.length === 0, `${neither.length} in neither`));
  return out;
}

export function checkReachability(db: Db): CheckResult[] {
  const unreachable = db.prepare(
    `SELECT ref_id FROM papers WHERE section='${MATRIX_SECTION}'
       AND ref_id NOT IN (SELECT DISTINCT ref_id FROM matrix_cells) ORDER BY ref_id`,
  ).all() as { ref_id: number }[];
  return [ok('every primary `## References` paper is cited in >=1 matrix cell',
    unreachable.length === 0,
    `unreachable: ${unreachable.slice(0, 8).map((r) => '#' + r.ref_id).join(', ')}`)];
}

/** Parse a "Current … columns …: A, B, C." line's comma list, stripping markdown. */
export function parseList(text: string, re: RegExp): string[] | null {
  const m = text.match(re);
  if (!m) return null;
  return m[1].replace(/\.\s*$/, '').split(',')
    .map((s) => s.replace(/\*\*/g, '').replace(/`/g, '').trim())
    .filter(Boolean);
}

export const COLUMN_SOURCES: Array<[string, RegExp]> = [
  ['CONTRIBUTING.md', /Current matrix columns[^:]*:\s*([^\n]+)/],
  ['CLAUDE.md', /Current columns:\s*([^\n]+)/],
];

export function checkColumnDrift(db: Db, repoRoot: string = REPO_ROOT): CheckResult[] {
  const out: CheckResult[] = [];
  const areas = new Set((db.prepare('SELECT label FROM areas').all() as { label: string }[]).map((r) => r.label));
  for (const [file, re] of COLUMN_SOURCES) {
    const path = join(repoRoot, file);
    if (!existsSync(path)) { out.push(ok(`${file} enumerates the matrix columns`, false, `${file} not found at ${repoRoot}`)); continue; }
    const list = parseList(readFileSync(path, 'utf-8'), re);
    if (!list) { out.push(ok(`${file} enumerates the matrix columns`, false, 'no "Current … columns" line found')); continue; }
    const missing = [...areas].filter((a) => !list.includes(a));
    const phantom = list.filter((c) => !areas.has(c));
    out.push(ok(`${file} column list matches DB areas exactly`, missing.length === 0 && phantom.length === 0,
      `missing from prose: [${missing.join(', ')}]; phantom in prose: [${phantom.join(', ')}]`));
  }
  return out;
}

export function checkTopicTiers(db: Db): CheckResult[] {
  const out: CheckResult[] = [];
  const themes = (db.prepare("SELECT slug FROM topics WHERE tier='theme'").all() as { slug: string }[]).map((r) => r.slug).sort();
  out.push(ok('topics: exactly the 8 expected themes', JSON.stringify(themes) === JSON.stringify(THEME_SLUGS), `got: ${themes.join(', ')}`));
  const badTag = db.prepare(
    "SELECT slug FROM topics WHERE tier='tag' AND (theme_slug IS NULL OR theme_slug NOT IN (SELECT slug FROM topics WHERE tier='theme'))",
  ).all() as { slug: string }[];
  out.push(ok('topics: every fine tag has a valid parent theme', badTag.length === 0, badTag.map((t) => t.slug).join(', ')));
  const badTheme = db.prepare("SELECT slug FROM topics WHERE tier='theme' AND theme_slug IS NOT NULL").all() as { slug: string }[];
  out.push(ok('topics: no theme carries a theme_slug', badTheme.length === 0, badTheme.map((t) => t.slug).join(', ')));
  const badArea = db.prepare('SELECT slug FROM topics WHERE area_key IS NOT NULL AND area_key NOT IN (SELECT key FROM areas)').all() as unknown[];
  out.push(ok('topics: every area_key resolves', badArea.length === 0, `${badArea.length} unresolved`));
  return out;
}

/**
 * Area key → its `ResearchAreas/` deep-dive page, WITHOUT the `.md`.
 *
 * A page slug is not derivable from its key (`cell` → `CellEngineering`), so this
 * join has to be stored somewhere. It is not a DB column because `db:bootstrap`
 * reconstructs `areas` from Papers.md, which carries no page name — a column here
 * would be a field bootstrap could never reproduce. Keeping it in the guard is safe
 * precisely because the guard asserts the map covers the DB's areas EXACTLY, so a
 * column added without a page fails naming the missing key rather than drifting.
 */
const RESEARCH_AREA_PAGES: Record<string, string> = {
  media: 'MediaOptimization',
  cell: 'CellEngineering',
  bioprocess: 'Bioprocess',
  scaffolding: 'Scaffolding',
  sensory: 'SensoryPrediction',
  metabolic: 'MetabolicModeling',
  foodsafety: 'FoodSafetyPrediction',
  tooling: 'AITooling',
};

/**
 * The subject-axis bijection, on the RESEARCH-AREA axis only.
 *
 * The model: subject themes and matrix research areas are two axes over different
 * populations, paired one-to-one by `topics.area_key`, with one deep-dive page per
 * area. This guard is what makes "paired" a fact rather than an intention.
 *
 * It asserts the pairing THROUGH `area_key` and never by comparing labels. That is
 * the whole point, not a stylistic preference: the two axes count different things
 * (a theme tags every content type, a column only matrix-eligible papers), so their
 * populations differ on every pair. A label comparison would therefore
 * pass in exactly the case the guard exists to catch — names that match while the
 * things behind them do not — and the labels are deliberately shaped so they never
 * match anyway (`Bioprocess & Manufacturing` the theme, `Bioprocess & Scale-Up` the
 * column). Comparing them would fail on every correct repo.
 *
 * Deliberately NOT extended to the method-row axis. The original blocker (a bijection
 * over a half-written axis would block every new row on prose) no longer applies now
 * that the axis is complete, but gating on it would move that cost to the next row
 * anyone proposes rather than remove it. Whether to add it is an open curator
 * decision, recorded in `Methods/CLAUDE.md` — not an oversight here. That file asks
 * that the row count not be restated in prose, so it is not restated here.
 */
export function checkAxisBijection(db: Db, repoRoot: string = REPO_ROOT): CheckResult[] {
  const out: CheckResult[] = [];

  // 1. Every theme names a research area. Complements checkTopicTiers, which only
  //    asserts that a NON-NULL area_key resolves and so passes on a null one.
  const keyless = (db.prepare("SELECT slug FROM topics WHERE tier='theme' AND area_key IS NULL").all() as { slug: string }[])
    .map((r) => r.slug);
  out.push(ok('axes: every subject theme names a research area', keyless.length === 0,
    `themes with a null area_key: [${keyless.join(', ')}] — every theme names a research area by design, so a theme without a column reopens a settled decision rather than adding one. The reasoning is the "Cross-cutting subject" entry in GLOSSARY.md, which is its one resolvable home in this tree. Give it an area_key, or change the axis model deliberately.`));

  // 2. Every research area is named by exactly one theme.
  const areaKeys = (db.prepare('SELECT key FROM areas ORDER BY ordinal').all() as { key: string }[]).map((r) => r.key);
  const themeCounts = new Map(areaKeys.map((k) => [k, 0]));
  const unknownKeys: string[] = [];
  for (const r of db.prepare("SELECT area_key FROM topics WHERE tier='theme' AND area_key IS NOT NULL").all() as { area_key: string }[]) {
    // Only count keys that name a real area. Without this an unresolvable key lands in the
    // map with count 1, passes the `!== 1` filter, and the failure message then names the
    // real area that dropped to 0 rather than the bogus key that caused it. `checkTopicTiers`
    // would also fail, but this function is exported and unit-tested on its own.
    if (!themeCounts.has(r.area_key)) { unknownKeys.push(r.area_key); continue; }
    themeCounts.set(r.area_key, (themeCounts.get(r.area_key) ?? 0) + 1);
  }
  const notOne = [...themeCounts].filter(([, n]) => n !== 1).map(([k, n]) => `${k}=${n}`);
  out.push(ok('axes: every research area is named by exactly one theme', notOne.length === 0 && unknownKeys.length === 0,
    `areas whose naming theme count is not 1: [${notOne.join(', ')}]`
    + (unknownKeys.length ? `; themes naming an area that does not exist: [${unknownKeys.join(', ')}]` : '')));

  // 3. Every research area has a deep-dive page, and the map above matches the DB.
  const mapped = new Set(Object.keys(RESEARCH_AREA_PAGES));
  const unmapped = areaKeys.filter((k) => !mapped.has(k));
  const phantom = [...mapped].filter((k) => !areaKeys.includes(k));
  out.push(ok('axes: RESEARCH_AREA_PAGES covers exactly the DB areas', unmapped.length === 0 && phantom.length === 0,
    `areas with no page mapping: [${unmapped.join(', ')}]; mappings for areas that no longer exist: [${phantom.join(', ')}]`));

  // Distinct values, not just a matching key set: two columns mapped to the same filename
  // would pass coverage and both existsSync checks while deep-linking to one page.
  const pageValues = areaKeys.filter((k) => mapped.has(k)).map((k) => RESEARCH_AREA_PAGES[k]);
  const dupPages = [...new Set(pageValues.filter((v, i) => pageValues.indexOf(v) !== i))];
  out.push(ok('axes: no two research areas share a ResearchAreas page', dupPages.length === 0,
    `pages claimed by more than one area: [${dupPages.join(', ')}]`));

  const missingFiles = areaKeys
    .filter((k) => mapped.has(k))
    .filter((k) => !existsSync(join(repoRoot, 'ResearchAreas', `${RESEARCH_AREA_PAGES[k]}.md`)));
  out.push(ok('axes: every research area has a ResearchAreas page on disk', missingFiles.length === 0,
    `areas whose page file is missing: [${missingFiles.map((k) => `${k} → ResearchAreas/${RESEARCH_AREA_PAGES[k]}.md`).join(', ')}]`));

  // 4. The build-time parser keeps its own copy of the column axis, and drift there is
  //    SILENT: `parseMatrix` warns on an unrecognised header and skips the whole column,
  //    so every ref whose only cells sit in it becomes unreachable while the parse still
  //    succeeds. Adding these two columns did exactly that to #145 and #290. Compare key,
  //    label AND order, since papers.json's `areas` array is rendered in this order.
  const dbAreas = db.prepare('SELECT key,label FROM areas ORDER BY ordinal').all() as { key: string; label: string }[];
  const dbSig = dbAreas.map((a) => `${a.key}=${a.label}`);
  const parserSig = AREAS.map((a) => `${a.key}=${a.label}`);
  out.push(ok('axes: parser AREAS registry matches the DB areas (key, label, order)',
    JSON.stringify(dbSig) === JSON.stringify(parserSig),
    `DB:     [${dbSig.join(' | ')}]\n      parser: [${parserSig.join(' | ')}]\n      → update site/scripts/parser/areas.ts`));

  // 5. The seed's THEMES constant is a THIRD copy of this axis, and the most dangerous
  //    one, because `db:bootstrap` re-creates the topic vocabulary from it wholesale
  //    (only `item_topics` survives). A stale entry therefore does not fail — it
  //    silently overwrites curated data on the next bootstrap:
  //      * a theme whose `area` string does not match an area LABEL exactly seeds
  //        `area_key` as null, because `seedTopics` resolves it with
  //        `SELECT key FROM areas WHERE label=?` and falls back to null on a miss;
  //      * a stale `label` re-mints the theme under its old name, which is how the
  //        `Bioprocess & Scale-Up` cross-axis collision would come back.
  //    The label half is invisible to every other guard here: assertion 2 joins on
  //    `area_key` and never compares labels (deliberately, see above), and
  //    `checkTaxonomyAxes` compares only theme cardinality. So it is asserted here.
  // The same area->page join exists a second time in `src/lib/axis-links.ts`, which decides
  // whether a By the Numbers bar links to a deep dive or falls back to a Taxonomy anchor. A
  // missing key there is silent. It cannot be imported here (it reads `import.meta.env` at
  // module scope, which is undefined under tsx), so its key set is asserted from source.
  const axisLinksSrc = readFileSync(join(SITE_ROOT, 'src', 'lib', 'axis-links.ts'), 'utf-8');
  const slugBlock = axisLinksSrc.match(/RESEARCH_AREA_SLUG[^=]*=\s*\{([^}]*)\}/);
  const slugKeys = slugBlock ? [...slugBlock[1].matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]).sort() : [];
  out.push(ok('axes: axis-links RESEARCH_AREA_SLUG covers exactly the DB areas',
    slugBlock !== null && JSON.stringify(slugKeys) === JSON.stringify([...areaKeys].sort()),
    slugBlock === null
      ? 'could not find RESEARCH_AREA_SLUG in src/lib/axis-links.ts'
      : `axis-links: [${slugKeys.join(', ')}]; DB: [${[...areaKeys].sort().join(', ')}]`
        + ' -> a missing key there silently links the bar to a Taxonomy anchor instead of the deep dive'));

  // A correct key set with a typo'd VALUE routes the bar to a 404 instead, which is just
  // as silent. The route slug is the page filename lowercased, so the two maps are
  // cross-checkable without reading a third file.
  const slugPairs = slugBlock ? [...slugBlock[1].matchAll(/^\s*(\w+)\s*:\s*'([^']+)'/gm)] : [];
  const badSlugValue = slugPairs
    .filter((m) => RESEARCH_AREA_PAGES[m[1]] !== undefined)
    .filter((m) => m[2] !== RESEARCH_AREA_PAGES[m[1]].toLowerCase())
    .map((m) => `${m[1]}: '${m[2]}' vs page ${RESEARCH_AREA_PAGES[m[1]]}.md`);
  // Assert the value scrape found as many pairs as the key scrape found keys. Without
  // this the check degrades to green rather than to red: the value regex only matches
  // single-quoted strings, so reformatting the literal to double quotes (or a `}` inside
  // a comment, which truncates the block match) empties `slugPairs`, `badSlugValue` is
  // then trivially empty, and this reports ✓ having tested nothing. A guard whose
  // failure mode is silent success is the defect it exists to close.
  out.push(ok('axes: axis-links route slugs match their ResearchAreas page names',
    badSlugValue.length === 0 && slugPairs.length === slugKeys.length,
    slugPairs.length !== slugKeys.length
      ? `parsed ${slugPairs.length} slug values but ${slugKeys.length} keys — the value scrape in check.ts no longer matches axis-links.ts's formatting, so this check was about to pass without testing anything`
      : `${badSlugValue.join('; ')} -> the By the Numbers bar would 404`));

  const dbThemes = db.prepare("SELECT slug,label,area_key FROM topics WHERE tier='theme' ORDER BY slug")
    .all() as { slug: string; label: string; area_key: string | null }[];
  const areaKeyByLabel = new Map(dbAreas.map((a) => [a.label, a.key]));
  const seedBySlug = new Map(THEMES.map((t) => [t.slug, t]));
  const seedDrift: string[] = [];
  for (const t of dbThemes) {
    const seed = seedBySlug.get(t.slug);
    if (!seed) { seedDrift.push(`${t.slug}: absent from THEMES`); continue; }
    if (seed.label !== t.label) seedDrift.push(`${t.slug}: label '${seed.label}' vs DB '${t.label}'`);
    const seeded = seed.area ? (areaKeyByLabel.get(seed.area) ?? null) : null;
    if (seeded !== t.area_key) {
      seedDrift.push(`${t.slug}: seeds area_key ${seeded === null ? 'null' : `'${seeded}'`} vs DB '${t.area_key}'`
        + (seed.area && seeded === null ? ` (area '${seed.area}' matches no area label)` : ''));
    }
  }
  out.push(ok('axes: seed THEMES reproduces the committed themes (label + area_key)', seedDrift.length === 0,
    `${seedDrift.join('; ')}\n      → update THEMES in site/scripts/db/seed.ts; a bootstrap would otherwise revert the committed topics.ndjson`));

  return out;
}

/**
 * Catalog consistency guard: `heading_md` is what `db:emit` writes, but the topic/license
 * folds join on the separate `url` column (and the tally uses `name`). If a hand-edited
 * NDJSON drifts `name`/`url` from `heading_md`'s link, emit stays correct while the folds
 * silently mismatch and the sync guard passes clean. Assert the first link in `heading_md`
 * equals `(name, url)` so the two can't diverge unnoticed.
 */
export function checkCatalogHeadings(db: Db): CheckResult[] {
  const rows = db.prepare('SELECT item_id, name, url, heading_md FROM catalog').all() as
    { item_id: string; name: string; url: string; heading_md: string }[];
  const bad: string[] = [];
  for (const r of rows) {
    // heading_md is emitted as `[name](url)` (+ any trailing curator annotation), so the
    // link is exactly that prefix. Reconstruct and prefix-match rather than regex-parse —
    // a URL or name containing `)` / `]` would break a negated-class capture (false drift).
    if (!r.heading_md.startsWith(`[${r.name}](${r.url})`)) bad.push(r.item_id);
  }
  return [ok('catalog: name/url match the heading_md link', bad.length === 0,
    `mismatched: ${bad.slice(0, 5).join(', ')}`)];
}

/**
 * License provenance guard: `license_source` (auto|manual) is enforced by the schema
 * CHECK, so this guards the app-level invariant the CHECK can't — `license` and
 * `license_source` must be BOTH set or BOTH null. A source without a value is meaningless
 * ("GitHub said X" with no X); a value without a source is worse — the UI treats any
 * non-'manual' provenance as auto-detected, so a hand-edited NDJSON with a license and no
 * source would silently mislabel a curated value as GitHub-auto. Runs on catalog and
 * dataset_entries. Uses `(license IS NULL) <> (license_source IS NULL)` to catch both.
 */
export function checkLicenses(db: Db): CheckResult[] {
  const out: CheckResult[] = [];
  for (const table of ['catalog', 'dataset_entries']) {
    const bad = db.prepare(
      `SELECT item_id FROM ${table} WHERE (license IS NULL) <> (license_source IS NULL)`,
    ).all() as { item_id: string }[];
    out.push(ok(`${table}: license and license_source are both set or both null`, bad.length === 0,
      bad.slice(0, 3).map((r) => r.item_id).join(', ')));
  }
  return out;
}

/**
 * Manual-override resolution guard: `seedLicenses` applies `licenses-manual.json` by EXACT
 * url (catalog) / `ds:` id (datasets). An override whose key doesn't match a real entry
 * (a trailing-slash drift, a typo, a removed entry) is silently dropped — the entry falls
 * back to the auto cache or shows "unknown" with no error. Assert every committed override
 * key resolves so curator drift fails db:check instead of vanishing. Absent file = no-op.
 */
export function checkManualLicenseKeys(db: Db, manualPath: string = MANUAL_LICENSES_PATH): CheckResult[] {
  if (!existsSync(manualPath)) return [ok('licenses-manual.json: overrides resolve', true, 'file absent')];
  const manual = JSON.parse(readFileSync(manualPath, 'utf-8')) as
    { catalog?: Record<string, string>; datasets?: Record<string, string> };
  const catUrls = new Set((db.prepare('SELECT url FROM catalog').all() as { url: string }[]).map((r) => r.url));
  const dsIds = new Set((db.prepare('SELECT item_id FROM dataset_entries').all() as { item_id: string }[]).map((r) => r.item_id));
  const badCat = Object.keys(manual.catalog ?? {}).filter((u) => !catUrls.has(u));
  const badDs = Object.keys(manual.datasets ?? {}).filter((id) => !dsIds.has(id));
  return [
    ok('licenses-manual.json: every catalog override url matches a catalog entry',
      badCat.length === 0, `unmatched: ${badCat.slice(0, 3).join(', ')}`),
    ok('licenses-manual.json: every datasets override id matches a dataset entry',
      badDs.length === 0, `unmatched: ${badDs.slice(0, 3).join(', ')}`),
  ];
}

/**
 * DOI provenance guard — the DOI analog of checkLicenses. `doi_source` (auto|manual) is
 * enforced by the schema CHECK; this guards the app-level invariant it can't: `doi` and
 * `doi_source` must be BOTH set or BOTH null (a source without a value is meaningless; a
 * value without a source would mislabel its provenance). Runs on catalog + dataset_entries.
 */
export function checkDois(db: Db): CheckResult[] {
  const out: CheckResult[] = [];
  for (const table of ['catalog', 'dataset_entries']) {
    const bad = db.prepare(
      `SELECT item_id FROM ${table} WHERE (doi IS NULL) <> (doi_source IS NULL)`,
    ).all() as { item_id: string }[];
    out.push(ok(`${table}: doi and doi_source are both set or both null`, bad.length === 0,
      bad.slice(0, 3).map((r) => r.item_id).join(', ')));
  }
  return out;
}

/**
 * Manual-DOI resolution guard — the DOI analog of checkManualLicenseKeys. `seedDois` applies
 * `dois-manual.json` by EXACT url (catalog) / `ds:` id (datasets); an override whose key
 * doesn't match a real entry is silently dropped. Assert every committed override key
 * resolves so curator drift fails db:check instead of vanishing. Absent file = no-op.
 */
export function checkManualDoiKeys(db: Db, manualPath: string = MANUAL_DOIS_PATH): CheckResult[] {
  if (!existsSync(manualPath)) return [ok('dois-manual.json: overrides resolve', true, 'file absent')];
  const manual = JSON.parse(readFileSync(manualPath, 'utf-8')) as
    { catalog?: Record<string, string>; datasets?: Record<string, string> };
  const catUrls = new Set((db.prepare('SELECT url FROM catalog').all() as { url: string }[]).map((r) => r.url));
  const dsIds = new Set((db.prepare('SELECT item_id FROM dataset_entries').all() as { item_id: string }[]).map((r) => r.item_id));
  const badCat = Object.keys(manual.catalog ?? {}).filter((u) => !catUrls.has(u));
  const badDs = Object.keys(manual.datasets ?? {}).filter((id) => !dsIds.has(id));
  return [
    ok('dois-manual.json: every catalog override url matches a catalog entry',
      badCat.length === 0, `unmatched: ${badCat.slice(0, 3).join(', ')}`),
    ok('dois-manual.json: every datasets override id matches a dataset entry',
      badDs.length === 0, `unmatched: ${badDs.slice(0, 3).join(', ')}`),
  ];
}

/**
 * Related-version DOIs (#102): every `dois-related.json` override key must resolve (like
 * checkManualDoiKeys), and each row's stored `related_dois` must be a JSON array of bare
 * lowercase DOIs that does NOT repeat the row's own primary `doi` (which would double-count
 * in the aggregate badge). Absent file = no key check, but stored columns are still validated.
 */
export function checkRelatedDois(db: Db, relatedPath: string = RELATED_DOIS_PATH): CheckResult[] {
  const out: CheckResult[] = [];
  if (existsSync(relatedPath)) {
    const rel = JSON.parse(readFileSync(relatedPath, 'utf-8')) as
      { catalog?: Record<string, string[]>; datasets?: Record<string, string[]> };
    const catUrls = new Set((db.prepare('SELECT url FROM catalog').all() as { url: string }[]).map((r) => r.url));
    const dsIds = new Set((db.prepare('SELECT item_id FROM dataset_entries').all() as { item_id: string }[]).map((r) => r.item_id));
    const badCat = Object.keys(rel.catalog ?? {}).filter((u) => !catUrls.has(u));
    const badDs = Object.keys(rel.datasets ?? {}).filter((id) => !dsIds.has(id));
    out.push(ok('dois-related.json: every catalog override url matches a catalog entry',
      badCat.length === 0, `unmatched: ${badCat.slice(0, 3).join(', ')}`));
    out.push(ok('dois-related.json: every datasets override id matches a dataset entry',
      badDs.length === 0, `unmatched: ${badDs.slice(0, 3).join(', ')}`));
  }
  const bareRe = DOI_SHAPE;
  const problems: string[] = [];
  // Track each related DOI -> the distinct RESOURCE keys carrying it, to catch a sibling
  // DOI listed under two different resources (a cross-resource double-count). The key is
  // the catalog url (so a dual-listed sw:/db: pair sharing a url isn't a false positive)
  // or the ds: item_id for dataset entries.
  const doiToKeys = new Map<string, Set<string>>();
  for (const table of ['catalog', 'dataset_entries']) {
    const rows = db.prepare(`SELECT item_id, url, doi, related_dois FROM ${table} WHERE related_dois IS NOT NULL`)
      .all() as { item_id: string; url: string | null; doi: string | null; related_dois: string }[];
    for (const r of rows) {
      const key = table === 'catalog' ? (r.url ?? r.item_id) : r.item_id;
      let arr: unknown;
      try { arr = JSON.parse(r.related_dois); } catch { problems.push(`${r.item_id}: related_dois not JSON`); continue; }
      if (!Array.isArray(arr)) { problems.push(`${r.item_id}: related_dois not an array`); continue; }
      const seen = new Set<string>();
      for (const d of arr) {
        if (typeof d !== 'string' || d !== d.toLowerCase() || !bareRe.test(d)) { problems.push(`${r.item_id}: bad DOI '${String(d)}'`); continue; }
        if (d === r.doi) problems.push(`${r.item_id}: related_dois repeats the primary doi`);
        if (seen.has(d)) problems.push(`${r.item_id}: related_dois has duplicate ${d}`);
        seen.add(d);
        (doiToKeys.get(d) ?? doiToKeys.set(d, new Set()).get(d)!).add(key);
      }
    }
  }
  for (const [d, keys] of doiToKeys) {
    if (keys.size > 1) problems.push(`related DOI ${d} is listed under ${keys.size} different resources (double-count)`);
  }
  out.push(ok('related_dois: valid bare arrays, no primary overlap, no cross-resource or in-array dup',
    problems.length === 0, problems.slice(0, 3).join('; ')));
  return out;
}

/**
 * SuperSeries membership (tucca-cellag/caail-planning#226): every `subseries.json` key must resolve to a
 * dataset_rows item, and each stored array must hold bare uppercase accessions with no
 * duplicate, none of which is the parent row's own accession.
 *
 * The last two matter more than they look. Self-membership is the confusion that produced
 * the defect — a SuperSeries accession reads like a dataset and is not one — and an
 * accession claimed by two DIFFERENT parents means one of them is wrong, since a GEO
 * subseries has exactly one parent.
 *
 * The parent's own accession is taken from its frozen `ds:` id rather than from its cells,
 * because a row's Description now legitimately names its members and a cell scan could not
 * tell a mention from a claim. A `-N` suffix is stripped first: `ds:gse158430-2` is the
 * SAME GEO accession as `ds:gse158430`, fanned out per species, so those rows share their
 * member list by design and must not read as a cross-parent conflict.
 *
 * Note what this deliberately does NOT do: it never asks whether the member list is
 * COMPLETE. Only the repository knows that, and a guard over our own index cannot detect
 * that our index is missing something — which is exactly why this defect shipped green.
 */
export function checkSubseries(db: Db, subseriesPath: string = SUBSERIES_PATH): CheckResult[] {
  const out: CheckResult[] = [];
  if (existsSync(subseriesPath)) {
    const file = JSON.parse(readFileSync(subseriesPath, 'utf-8')) as { datasets?: Record<string, string[]> };
    const rowIds = new Set((db.prepare('SELECT item_id FROM dataset_rows').all() as { item_id: string }[]).map((r) => r.item_id));
    const bad = Object.keys(file.datasets ?? {}).filter((id) => !rowIds.has(id));
    out.push(ok('subseries.json: every override id matches a dataset inventory row',
      bad.length === 0, `unmatched: ${bad.slice(0, 3).join(', ')}`));
  }
  const problems: string[] = [];
  /** member accession -> the distinct PARENT accessions claiming it. */
  const memberToParents = new Map<string, Set<string>>();
  const rows = db.prepare('SELECT item_id, subseries FROM dataset_rows WHERE subseries IS NOT NULL')
    .all() as { item_id: string; subseries: string }[];
  for (const r of rows) {
    // ds:gse158430-2 -> GSE158430: the per-species fan-out of one accession. Shared with the
    // parser rather than re-derived here, so the two cannot drift; the inline copy this
    // replaces also mis-read `e-mtab-9622` as `E-MTAB`, collapsing every ArrayExpress row.
    const parentAcc = idAccession(r.item_id);
    let arr: unknown;
    try { arr = JSON.parse(r.subseries); } catch { problems.push(`${r.item_id}: subseries not JSON`); continue; }
    if (!Array.isArray(arr)) { problems.push(`${r.item_id}: subseries not an array`); continue; }
    if (arr.length === 0) { problems.push(`${r.item_id}: subseries is empty (use NULL, not [])`); continue; }
    const seen = new Set<string>();
    for (const a of arr) {
      if (typeof a !== 'string' || a !== a.toUpperCase() || !ACCESSION_EXACT.test(a)) { problems.push(`${r.item_id}: bad accession '${String(a)}'`); continue; }
      if (a === parentAcc) problems.push(`${r.item_id}: lists itself (${a}) as its own subseries`);
      if (seen.has(a)) problems.push(`${r.item_id}: duplicate member ${a}`);
      seen.add(a);
      (memberToParents.get(a) ?? memberToParents.set(a, new Set()).get(a)!).add(parentAcc);
    }
  }
  for (const [a, parents] of memberToParents) {
    if (parents.size > 1) problems.push(`${a} is claimed by ${parents.size} different parents (${[...parents].join(', ')}); a subseries has exactly one`);
  }
  out.push(ok('subseries: valid accession arrays, no self-membership, one parent each',
    problems.length === 0, problems.slice(0, 3).join('; ')));
  return out;
}

export const INVENTORY_CELLS_LABEL =
  `dataset_rows: every Data cell is ${DATA_CELL_FORMS}`;

export const ON_REQUEST_LABEL =
  'datasets_on_request: every row has a bare DOI that fits a link and that no inventory row\'s Paper ' +
  'cell links and no curated entry\'s doi or heading link names, a non-Benchmarks dataset page, a study and a ' +
  'statement that fit a table cell, a statement that renders as stored, and an ordinal counting its page\'s ' +
  'list from 0';

/**
 * The accession families `ACCESSION_SOURCE` admits, as a curator reads them (`GSE…, PRJ…, E-MTAB-…`):
 * each alternative's literal prefix, so a family added there is named here without a second edit.
 */
export const ACCESSION_FAMILIES = ACCESSION_SOURCE.split('|')
  .map((alt) => `${alt.match(/^[A-Z-]+/)?.[0] ?? alt}…`)
  .join(', ');

export const ACCESSIONS_LABEL =
  'dataset_entries.accessions: every dataset-accessions.json key is a curated dataset entry, every value a ' +
  'non-empty list of distinct repository accessions its heading or description names, and the stored column ' +
  'matches the file';

/** A curated entry as the entry-list guards read it. */
interface ListEntry { item_id: string; url: string | null; doi: string | null; heading_md: string; body_md: string }

/** One value of an entry's list: the key it is compared by and the text it must appear as, or why it is refused. */
type ListValue = { key: string; text: string } | { problem: string };

/** A character that always continues a link written in prose. */
const ADDRESS_CHAR = /[A-Za-z0-9\-_~/=&%+@$]/;

/** Punctuation that ends a sentence or a Markdown link, and continues a link only when more address follows. */
const TRAILING_PUNCT = /[.?#:;,!'()*[\]]/;

/**
 * Whether `text` appears in `prose` as a whole token: not inside a longer accession or link, so a
 * value missing its last digit, or a link cut short, is not found inside the full one. A link
 * continues past any address character (`ADDRESS_CHAR`), and past punctuation (`TRAILING_PUNCT`)
 * that more address follows, so `…view?acc` is not found inside `…view?acc=ERP1`, nor `…/zenodo`
 * inside `…/zenodo.11357327`, while a link that ends a sentence (`….`) or a Markdown link (`…)`) is
 * whole. An accession continues only past a letter, digit, `_`, `-` or `/`: one followed by `.` and
 * digits is that accession with a version suffix.
 */
function namedIn(prose: string, text: string): boolean {
  const link = /^https?:\/\//i.test(text);
  for (let i = prose.indexOf(text); i !== -1; i = prose.indexOf(text, i + 1)) {
    const before = prose[i - 1] ?? '';
    const next = prose[i + text.length] ?? '';
    const then = prose[i + text.length + 1] ?? '';
    const continues = link
      ? ADDRESS_CHAR.test(next) || (TRAILING_PUNCT.test(next) && ADDRESS_CHAR.test(then))
      : /[A-Za-z0-9_\-/]/.test(next);
    if (!/[A-Za-z0-9]/.test(before) && !continues) return true;
  }
  return false;
}

/** A link's path, query and fragment: what follows its scheme and host, so a host is never read. */
const pathOf = (url: string): string => url.replace(/^https?:\/\/[^/?#]*/i, '');

/**
 * The end of an identifier that is a whole path segment or query value: an optional version suffix
 * (`.2`), then the end of the link or a `/`, `?`, `&` or `#`. Its start is a `/` or `=`.
 */
const SEGMENT_END = String.raw`(?:\.\d+)?(?=$|[/?&#])`;

/**
 * Whether `link` names `accession` as a whole path segment, as written, or as a whole query value,
 * in any case. That is the rule the data-links guard refuses a family accession by
 * (`FAMILY_IN_SEGMENT`, `FAMILY_IN_QUERY`), since a path segment can be a name (a repository `cra2`)
 * while a query value is an identifier slot. `…/GSE1`, `…?acc=gse1` and `…/GSE1.2` (a version
 * suffix) name `GSE1`; `…/gse1`, `…acc=GSE12`, a repository `…/Zebrafish-GEM-v2` (for
 * `Zebrafish-GEM`) and a host (`zenodo.org`) do not.
 */
export function accessionNamedIn(link: string, accession: string): boolean {
  const needle = accession.trim();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const path = pathOf(link);
  return new RegExp(`(?<=/)${escaped}${SEGMENT_END}`).test(path)
    || new RegExp(`(?<==)${escaped}${SEGMENT_END}`, 'i').test(path);
}

/**
 * The skeleton the curated entries' list guards share (`checkAccessions`, `checkDataLinks`), as
 * `seedEntryList` is the one fold behind both. Each key in the file must be a curated dataset entry,
 * each value a non-empty list, and each item one `read` accepts. No item may repeat by its key. Each
 * must be named in the entry's own heading or description (tucca-cellag/caail-planning#752, review
 * round 3), so a mistyped accession or link cannot be served as the entry's own deposit: the file is
 * hand-typed beside prose that already names the deposit, and this makes the two agree. The stored
 * column must equal what the file says, so an edit to the file without `db:reseed-axes`, or a
 * hand-edited column, fails here rather than shipping a stale value.
 */
function checkEntryList(
  db: Db, path: string, file: string, column: 'accessions' | 'data_links', label: string, noun: string,
  read: (item: unknown, entry: ListEntry) => ListValue,
): CheckResult[] {
  const problems: string[] = [];
  const manual = readEntryListFile(path, file, problems);
  const entries = new Map((db.prepare('SELECT item_id, url, doi, heading_md, body_md FROM dataset_entries').all() as ListEntry[])
    .map((e) => [e.item_id, e]));
  const expected = new Map<string, string>();
  for (const [id, list] of Object.entries(manual)) {
    const e = entries.get(id);
    if (!e) { problems.push(`${id}: not a curated dataset entry`); continue; }
    if (!Array.isArray(list) || list.length === 0) { problems.push(`${id}: needs a non-empty list of ${noun}`); continue; }
    const seen = new Set<string>();
    const prose = `${e.heading_md}\n${e.body_md}`;
    for (const item of list) {
      const v = read(item, e);
      if ('problem' in v) { problems.push(`${id}: ${v.problem}`); continue; }
      if (seen.has(v.key)) problems.push(`${id}: lists ${v.text} twice`);
      else if (!namedIn(prose, v.text)) {
        problems.push(`${id}: ${v.text} is named nowhere in its heading or description; check it against the entry, or name it there`);
      }
      seen.add(v.key);
    }
    expected.set(id, JSON.stringify(list.map((x) => String(x).trim())));
  }
  for (const r of db.prepare(`SELECT item_id, ${column} AS stored FROM dataset_entries ORDER BY item_id`).all() as { item_id: string; stored: string | null }[]) {
    const want = expected.get(r.item_id) ?? null;
    const have = r.stored ?? null;
    if (have !== want) {
      problems.push(`${r.item_id}: stored ${column} ${have ?? 'NULL'} differ from ${file} (${want ?? 'none'}); run db:reseed-axes`);
    }
  }
  return [ok(label, problems.length === 0, `${problems.length} problem(s): ${problems.slice(0, 10).join('; ')}`)];
}

/**
 * Guard for curated entries' own repository accessions (tucca-cellag/caail-planning#752), the
 * `accessions` column `seedAccessions` folds from `scripts/db/dataset-accessions.json`, through
 * `checkEntryList`. Each item must be exactly one accession of the families in `ACCESSION_SOURCE`,
 * uppercase, with no URL or version suffix: the same vocabulary the `ds:` id minter and the subseries
 * guard use, and the shape `api/datasets.json` serves. A deposit outside those families goes in
 * `dataset-data-links.json` as its link, and the refusal says so.
 */
export function checkAccessions(db: Db, path: string = DATASET_ACCESSIONS_PATH): CheckResult[] {
  return checkEntryList(db, path, 'dataset-accessions.json', 'accessions', ACCESSIONS_LABEL, 'accessions', (a) =>
    typeof a === 'string' && ACCESSION_EXACT.test(a)
      ? { key: a, text: a }
      : { problem: `${JSON.stringify(a)} is not one bare accession (${ACCESSION_FAMILIES}); ` +
          'a deposit outside these families goes in dataset-data-links.json as its link' });
}

/**
 * The `datasets` object of a `{ "datasets": { "ds:…": [...] } }` file, or `{}` when the file is
 * absent. A file that is not JSON, or has no such object, is a problem named by `name`.
 */
function readEntryListFile(path: string, name: string, problems: string[]): Record<string, unknown> {
  if (!existsSync(path)) return {};
  let parsed: unknown = undefined;
  try { parsed = JSON.parse(readFileSync(path, 'utf-8')); } catch { problems.push(`${name} is not JSON`); }
  const datasets = (parsed as { datasets?: unknown } | undefined)?.datasets;
  if (parsed !== undefined && (typeof datasets !== 'object' || datasets === null || Array.isArray(datasets))) {
    problems.push(`${name} has no "datasets" object`);
    return {};
  }
  return (datasets as Record<string, unknown> | undefined) ?? {};
}

export const DATA_LINKS_LABEL =
  'dataset_entries.data_links: every dataset-data-links.json key is a curated dataset entry, every value a ' +
  'non-empty list of distinct http(s) links to a deposit its heading or description names, none a paper, ' +
  'an accession dataset-accessions.json takes, or the entry\'s doi or heading link, and the stored column ' +
  'matches the file';

/** A Zenodo record page, whose DOI Zenodo mints as `10.5281/zenodo.<record>`. */
const ZENODO_RECORD = /^https?:\/\/(?:www\.)?zenodo\.org\/records?\/(\d+)\/?(?:[?#].*)?$/i;

/**
 * An accession of `ACCESSION_SOURCE`'s families as a whole path segment, as the families write it
 * (uppercase), or as a whole query value in any case (`?acc=gse158430`), since a query value is an
 * identifier slot while a path segment can be a name. Captured without a version suffix and read
 * against `pathOf`, so a host, a repository `cra2` and a longer segment such as `GSE1.csv` are not
 * accessions.
 */
const FAMILY_IN_SEGMENT = new RegExp(`(?<=/)(${ACCESSION_SOURCE})${SEGMENT_END}`);
const FAMILY_IN_QUERY = new RegExp(`(?<==)(${ACCESSION_SOURCE})${SEGMENT_END}`, 'i');

/**
 * A deposit link as the twin check and the data-links guard compare it. A link that states a DOI
 * (`statedDoi`: a doi.org link on any host form, or a `doi:` token) is that DOI, bare and lowercase,
 * and so is a Zenodo record page, whose DOI Zenodo mints from its record number. Any other link is
 * compared without its scheme or a trailing slash, and case-insensitively. A host that merely embeds a
 * DOI in its path with no such token is compared as a link, since `statedDoi` will not guess.
 */
const depositKey = (url: string): string => {
  const zenodo = url.match(ZENODO_RECORD);
  const doi = statedDoi(url) ?? (zenodo ? `10.5281/zenodo.${zenodo[1]}` : null);
  return doi ? `DOI ${doi}` : `link ${url.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase()}`;
};

/**
 * The last character of a link copied with the sentence or Markdown around it (`…/FoodML),`): the
 * punctuation `namedIn` lets end a link in prose, so the copy is still found there verbatim.
 */
const COPIED_PUNCT = /[.,;:!?)\]'"*]$/;

/** A DOI-shaped token in a link's path, such as a publisher's `/doi/10.1002/…` page: refused below, never used as a key. */
const PATH_DOI = /^https?:\/\/[^/?#]+\/(?:[^?#]*\/)?(10\.\d{4,9}\/[^\s?#]+)/i;

/**
 * The first query value of a link that is a DOI, decoded, such as PLOS's article page
 * (`…/article?id=10.1371/journal.pone.…`): refused below like `PATH_DOI`, never used as a key.
 */
const queryDoi = (url: string): string | null => {
  const query = url.match(/\?([^#]*)/)?.[1];
  if (!query) return null;
  for (const value of new URLSearchParams(query).values()) {
    const doi = bareDoi(value.trim());
    if (doi) return doi;
  }
  return null;
};

/**
 * Guard for curated entries' own deposit links (tucca-cellag/caail-planning#752), the `data_links`
 * column `seedDataLinks` folds from `scripts/db/dataset-data-links.json`, through `checkEntryList`:
 * the deposits the entry's accessions do not name, such as a Zenodo record or a code repository
 * holding the data. Each item must be one link to an http(s) address with a host (`WEB_ADDRESS`, the
 * Data-cell reader's own test, with no whitespace), and may not end in the punctuation that ends a
 * sentence or a Markdown link (`COPIED_PUNCT`), which is copied with a link rather than part of it.
 *
 * A link may not name a paper. One that states a DOI whose registrant is not a data host is refused,
 * as a Data cell refuses it (`readDataCell`), with the same pointer to the registrant list for a
 * deposit on a host it lacks, and so is one whose path or query value carries such a DOI (a
 * publisher's article page, `PATH_DOI` and `queryDoi`). A publisher page with no DOI in its address
 * (ScienceDirect's `/pii/`) cannot be told from a deposit by its form, and is left to review. Nor
 * may a link repeat what the entry already serves, its `doi` or its heading link, since `dataLinks`
 * is the deposits the entry serves nowhere else. Links are compared by `depositKey`. It checks a link's form and registrant, not that it reaches the deposit.
 *
 * Nor may a link name an accession of the families `dataset-accessions.json` takes as a whole path
 * segment or query value (`FAMILY_IN_SEGMENT`, `FAMILY_IN_QUERY`): that deposit is served as an
 * accession, which is how a consumer and the twin check match it, so the link would hide it from
 * both. And a Zenodo record page is refused in favour of its `https://doi.org/` link, which is how
 * `dataLinks` writes a deposit DOI, so a consumer comparing DOIs finds it.
 */
export function checkDataLinks(db: Db, path: string = DATASET_DATA_LINKS_PATH): CheckResult[] {
  return checkEntryList(db, path, 'dataset-data-links.json', 'data_links', DATA_LINKS_LABEL, 'links', (a, e) => {
    const url = typeof a === 'string' ? a.trim() : '';
    if (!WEB_ADDRESS.test(url) || /\s/.test(url)) return { problem: `${JSON.stringify(a)} is not one link to an http(s) address with a host` };
    if (COPIED_PUNCT.test(url)) {
      return { problem: `${url} ends in "${url.slice(-1)}", punctuation copied with the link: drop it, or percent-encode it if the address needs it` };
    }
    const key = depositKey(url);
    const ownDoi = bareDoi(e.doi);
    if (e.url && depositKey(e.url) === key) return { problem: `${url} is already its heading link` };
    if (ownDoi && key === `DOI ${ownDoi}`) return { problem: `${url} is already its doi` };
    const path = pathOf(url);
    const accession = (path.match(FAMILY_IN_SEGMENT) ?? path.match(FAMILY_IN_QUERY))?.[1]?.toUpperCase();
    if (accession) {
      return { problem: `${url} names ${accession}, an accession of a family dataset-accessions.json takes: list ${accession} there instead` };
    }
    const record = url.match(ZENODO_RECORD)?.[1];
    if (record) {
      return { problem: `${url} is a Zenodo record page: write its DOI link, https://doi.org/10.5281/zenodo.${record}, and name that in the entry` };
    }
    const stated = statedDoi(url);
    const inPath = stated ? null : bareDoi(url.match(PATH_DOI)?.[1]?.replace(/\/+$/, '') ?? null);
    const paper = [stated, inPath, queryDoi(url)].find((d) => d && doiRelation(d) === 'publication');
    if (paper) {
      return { problem: `${url} links ${paper}, whose registrant is not a data host: a paper is the entry's doi, ` +
        'and a deposit on an unlisted host needs its registrant added to DATA_REPOSITORY_REGISTRANTS ' +
        '(site/scripts/parser/doi-relation.ts)' };
    }
    return { key, text: url };
  });
}

export const ENTRY_ROW_TWINS_LABEL =
  'dataset_entries x dataset_rows: no curated entry and inventory row on one page name the same deposit';

export const ZENODO_TWO_WAYS_LABEL =
  'dataset_entries x dataset_rows: no row on an entry\'s page lists as a deposit the Zenodo record the entry reads as a document';

/**
 * A statement stored inside its own quotes: it opens and closes with a mark of one family,
 * matched or not. Double (`"` `“` `”` `„` `«` `»`): only when no other double mark sits inside,
 * since `"Raw" counts and "processed"` is the paper's own quoting. Single (`'` `‘` `’` `‚`):
 * whatever sits inside, since an inner single mark is nearly always an apostrophe
 * (`‘The study’s data …’`).
 */
const WRAPPED_IN_QUOTES = /^(?:["“”„«][^"“”„«»]*["“”»]|['‘’‚].*['’‘])$/s;

/**
 * Whether a statement renders as the words stored. db:emit writes it into a table cell between
 * straight quotes, so that cell is parsed with GFM (remark-gfm, the Markdown GitHub and the
 * site share) and must come back as the same text holding no raw HTML. The test is whether
 * the rendered text changes: any Markdown or HTML that alters it fails (emphasis, code, a
 * backslash escape, an entity reference that decodes, a link, a reference the page defines,
 * among others), since the page would then show different words or markup from the ones the
 * API serves. A backslash before a letter, a bare `&`, and a bare URL or email address pass
 * (GFM links the last two but shows them as written).
 *
 * Two renderings are not modelled. GitHub's own extensions beyond GFM (`$…$` math,
 * `:shortcode:` emoji) are not in remark-gfm. The site's smart punctuation turns straight
 * quotes, `--` and `...` into typographic ones on every page, which changes glyphs, never
 * words.
 *
 * `definitions` is the page's link reference and footnote definitions (`pageDefinitions`),
 * parsed with the cell, since a `[1]` or `[^1]` the page defines renders as a link on that
 * page and as plain text anywhere else.
 */
export function statementRendersAsStored(statement: string, definitions = ''): boolean {
  const cell = `"${statement}"`;
  const table = parseMarkdown(`| s |\n|---|\n| ${cell} |\n\n${definitions}`).children[0];
  const node = table?.type === 'table' ? table.children[1]?.children[0] : undefined;
  if (!node) return false;
  let html = false;
  visit(node, 'html', () => { html = true; });
  return !html && mdastToString(node) === cell;
}

/**
 * A stand-in for every link reference and footnote definition on a page, wherever it sits
 * (GFM resolves one nested in a blockquote or list item document-wide), one per paragraph;
 * '' when it has none. Each is rebuilt from its label alone, since whether a `[1]` or `[^1]`
 * resolves, not where it points, is what changes how a statement renders.
 */
export function pageDefinitions(src: string): string {
  const out: string[] = [];
  visit(parseMarkdown(src), ['definition', 'footnoteDefinition'], (n) => {
    const d = n as Definition | FootnoteDefinition;
    const label = d.label ?? d.identifier;
    out.push(d.type === 'definition' ? `[${label}]: x` : `[^${label}]: x`);
  });
  return out.join('\n\n');
}

/**
 * Shape of the Data on request list (tucca-cellag/caail-planning#750): a bare lowercase DOI (the
 * key, and the Paper cell's target) that holds no `|` and that `fitsDoiLink` accepts, a page from ON_REQUEST_PAGES
 * whose Markdown exists (never Benchmarks), and a non-empty study and statement with no `|` or
 * line break, either of which would break the emitted table. The study also has no leading or
 * trailing whitespace, since the page's table trims its cells and the stored row would then
 * never match the page.
 *
 * The statement is the paper's own words, served verbatim by the API and written raw into the
 * page, so it must also render there as stored (`statementRendersAsStored`), and must not be
 * stored as one quoted span (`WRAPPED_IN_QUOTES`), since the page adds a pair and would show
 * two. A statement that only starts or ends with a quoted word passes.
 *
 * Ordinals count each page's list from 0 in table order, which is what `db:bootstrap` writes
 * from the pages, so adding a row to one page renumbers no other. A hand-typed ordinal that
 * leaves a gap or repeats one fails here rather than reordering the page on the next emit.
 *
 * It also refuses a DOI that any link in an inventory row's Paper cell states, whatever its
 * registrant, or that a curated entry carries in its `doi`
 * column or its heading link, since that study holds public data. Only those places are read,
 * and only for that exact DOI: a row whose Paper cell links the preprint while the list names
 * the journal version, or an entry that mentions the DOI only in its prose, gets past it. It
 * does not check the statement against the paper.
 */
export function checkOnRequest(db: Db, repoRoot: string = REPO_ROOT): CheckResult[] {
  const rows = db.prepare('SELECT doi, page, study, statement, ordinal FROM datasets_on_request ORDER BY page, ordinal, doi')
    .all() as { doi: string; page: string; study: string; statement: string; ordinal: number }[];
  const problems: string[] = [];
  const unsafe = (s: string): boolean => /[|\r\n]/.test(s);
  // A study with public data has an inventory row or a curated entry. Listing it as on request
  // as well would serve one paper as both holding data and holding none, so the list refuses
  // any DOI an inventory row links as its paper or a curated entry carries. The Paper cell is
  // read link by link with statedDoi, not through rowIdentity, whose paperDoi is null when the
  // DOI's registrant is a data host (an OSF preprint, say).
  const held = new Map<string, Set<string>>();
  const hold = (doi: string, id: string): void => { held.set(doi, (held.get(doi) ?? new Set()).add(id)); };
  const headers = new Map<string, InventoryHeader>();
  for (const d of db.prepare('SELECT item_id, page, cells_json FROM dataset_rows').all() as { item_id: string; page: string; cells_json: string }[]) {
    if (!headers.has(d.page)) headers.set(d.page, readInventoryHeader(d.page, repoRoot));
    const h = headers.get(d.page)!;
    const parsed = parseRowCells(d.cells_json);
    const cols = 'header' in h && 'cells' in parsed ? labelCells(h.header, parsed.cells) : null;
    for (const url of linkDestinations(cols?.['Paper'] ?? '')) {
      const doi = statedDoi(url);
      if (doi) hold(doi, d.item_id);
    }
  }
  // An entry can name its paper in its `doi` column, in the doi.org link its heading is built
  // on, or both. The column is filled only by the dois-manual.json fold, not by db:add, so an
  // entry added with a doi.org heading has an empty column until that file gains it.
  for (const e of db.prepare('SELECT item_id, doi, url FROM dataset_entries').all() as { item_id: string; doi: string | null; url: string | null }[]) {
    for (const doi of [bareDoi(e.doi), e.url ? statedDoi(e.url) : null]) if (doi) hold(doi, e.item_id);
  }
  const expected = pageOrdinals(rows.map((r) => r.page));
  const definitions = new Map<string, string>();
  rows.forEach((r, i) => {
    const holders = [...(held.get(r.doi) ?? [])];
    if (holders.length > 0) {
      problems.push(`${r.doi}: also the paper of ${holders.join(' and ')}, which ${holders.length > 1 ? 'hold' : 'holds'} public data, so it does not belong on this list`);
    }
    if (!DOI_SHAPE.test(r.doi) || r.doi !== r.doi.toLowerCase()) problems.push(`${r.doi}: not a bare lowercase DOI`);
    else if (unsafe(r.doi)) problems.push(`${r.doi}: holds a |, which would split its row of the page's table`);
    else if (!fitsDoiLink(r.doi)) {
      problems.push(`${r.doi}: cannot sit whole in its [DOI](https://doi.org/…) link, which takes no <, >, \\, ?, # or % and only balanced parentheses`);
    }
    if (r.ordinal !== expected[i]) {
      problems.push(`${r.doi}: ordinal ${r.ordinal} is out of place; number each page's list 0..n-1 in table order, as db:bootstrap does`);
    }
    const pagePath = join(repoRoot, 'Datasets', `${r.page}.md`);
    if (!ON_REQUEST_PAGES.includes(r.page)) problems.push(`${r.doi}: page "${r.page}" cannot carry a Data on request list`);
    else if (!existsSync(pagePath)) problems.push(`${r.doi}: Datasets/${r.page}.md does not exist`);
    else if (!definitions.has(r.page)) definitions.set(r.page, pageDefinitions(readFileSync(pagePath, 'utf-8')));
    if (!r.study.trim() || unsafe(r.study)) problems.push(`${r.doi}: study is empty or holds a | or line break`);
    else if (r.study !== r.study.trim()) problems.push(`${r.doi}: study starts or ends with whitespace, which the page's table trims away`);
    if (!r.statement.trim() || unsafe(r.statement)) problems.push(`${r.doi}: statement is empty or holds a | or line break`);
    else if (WRAPPED_IN_QUOTES.test(r.statement)) {
      problems.push(`${r.doi}: statement is stored inside its own quotes, and the page adds a pair, so it would show two`);
    } else if (!statementRendersAsStored(r.statement, definitions.get(r.page))) {
      problems.push(`${r.doi}: statement holds Markdown or HTML, so the page would show different words or markup from the ones the API serves`);
    }
  });
  return [ok(ON_REQUEST_LABEL, problems.length === 0, `${problems.length} problem(s): ${problems.slice(0, 10).join('; ')}`)];
}

export const ZENODO_TYPES_LABEL =
  'zenodo types: every Zenodo DOI on a catalog item or curated entry has a recorded resource type (zenodo-types.json)';

/**
 * Every Zenodo DOI a catalog item or curated dataset entry carries must have its Zenodo resource
 * type recorded in `site/scripts/parser/zenodo-types.json`, since the parse reads it to say whether
 * the DOI names the item or a document about it, and refuses a guess (tucca-cellag/caail-planning#760).
 * Reported here as a failed check naming each one, so a curator learns at `db:check` rather than at
 * the parse, and the other guards still run. A cache that cannot be read (malformed JSON, a key that
 * is no DOI, one DOI recorded twice) is reported the same way rather than thrown out of `runChecks`.
 */
export function checkZenodoTypes(db: Db, typeOf: (key: string) => string | undefined = cachedZenodoType): CheckResult[] {
  const missing: string[] = [];
  const rows = db.prepare(
    'SELECT item_id, doi FROM catalog WHERE doi IS NOT NULL UNION ALL SELECT item_id, doi FROM dataset_entries WHERE doi IS NOT NULL',
  ).all() as { item_id: string; doi: string }[];
  try {
    for (const r of rows.sort((a, b) => a.item_id.localeCompare(b.item_id))) {
      const key = bareDoi(r.doi);
      if (key !== null && isZenodoDoi(key) && typeOf(key) === undefined) missing.push(`${r.item_id} (${key})`);
    }
  } catch (err) {
    // The fetch reads the committed file before it writes, so it cannot repair one it cannot read.
    return [ok(ZENODO_TYPES_LABEL, false,
      `zenodo-types.json cannot be read: ${(err as Error).message}; correct it by hand, since fetch:zenodo-types reads it first`)];
  }
  return [ok(ZENODO_TYPES_LABEL, missing.length === 0, missing.length === 0 ? '' :
    `${missing.length} unrecorded: ${missing.join(', ')}; run \`pnpm --dir site fetch:zenodo-types\` and commit zenodo-types.json`)];
}

/**
 * Twin guard (tucca-cellag/caail-planning#752). A curated entry and an inventory row on the same page
 * that name the same deposit list one dataset twice, and the datasets total and `api/datasets.json`
 * count it twice. The integrity check cannot see this: it asserts a dataset id sits in exactly one of
 * the two tables, and twins carry different ids. CrossSpecies held seven such pairs.
 *
 * Deposits are compared, never papers, as decided on that ticket: one paper can describe several
 * deposits, which is how the datasets endpoint reads a paper DOI, so an entry and a row from one paper
 * may be two datasets. An entry's deposits are its `doi` where `itemDoiRelation` reads it as the
 * item's own (a data host's DOI, unless its Zenodo record is a document), its heading link unless
 * that states a paper's DOI or the entry's own document DOI, its `accessions` and its `dataLinks`. A row's
 * deposit is its Data cell, read by the same `readDataCell` that fills the API's `dataUrl`,
 * `dataDoi` and `accession`; a status word names none, and its Paper and Description cells are not
 * read. A link that states a DOI is compared as that DOI, any other link without a trailing slash
 * and case-insensitively, and an accession case-insensitively and without a version suffix, as the
 * endpoint tells consumers to. An accession on one side is also shared when a deposit link on the
 * other names it as a whole path segment, as written, or a whole query value, in any case
 * (`accessionNamedIn`), so an entry's link to an SRA run page meets a row badged with that run, and a
 * row's ENA link meets an entry listing the project, while a repository named `cra2` does not meet a
 * row badged `CRA2`.
 *
 * One more pair is reported, under its own label (`ZENODO_TWO_WAYS_LABEL`) since it is no twin: an
 * entry whose Zenodo DOI's record is a document (tucca-cellag/caail-planning#760) beside a row whose
 * Data cell lists that same record as a deposit. The two read one record two ways, so one is wrong.
 *
 * An entry that names its deposit only in its description is not compared, which is why its deposits
 * belong in `dataset-accessions.json` or `dataset-data-links.json`.
 *
 * It compares within a page only. A resource that covers several species counts once for each species
 * (tucca-cellag/caail-planning#791), so the same deposit on two species pages is not a twin. Two
 * inventory rows on one page that share a deposit are tucca-cellag/caail-planning#715's case, not this
 * one. A row whose cells cannot be read is skipped here, because `checkInventoryCells` already fails
 * it. Each pair is reported once, naming every deposit the two share.
 */
export function checkEntryRowTwins(
  db: Db,
  repoRoot: string = REPO_ROOT,
  headerFor: (page: string) => InventoryHeader = (page) => readInventoryHeader(page, repoRoot),
  zenodoTypeOf: (key: string) => string | undefined = cachedZenodoType,
): CheckResult[] {
  /**
   * A Zenodo DOI's recorded type, or undefined where none can be read: unrecorded, or a cache that
   * cannot be read, both of which `checkZenodoTypes` reports. Only the lookup is guarded, so an
   * error anywhere else in reading a relation still surfaces.
   */
  const zenodoTypeOrNone = (key: string): string | undefined => {
    try {
      return zenodoTypeOf(key);
    } catch {
      return undefined;
    }
  };
  /**
   * A link's key, or null for a link that states a paper's DOI. A link is judged by the plain
   * registrant rule: an entry or row lists it as a deposit, so a data host's DOI there is one.
   */
  const linkKeyOf = (url: string): string | null => {
    const doi = statedDoi(url);
    return doi && doiRelation(doi) !== 'own' ? null : depositKey(url);
  };
  /** A badge or accession as written, without a version suffix after its digits. */
  const unversioned = (a: string): string => a.trim().replace(/(\d)\.\d+$/, '$1');
  /** The key an accession is compared by: unversioned and uppercase. */
  const accessionKey = (a: string): string => `accession ${a.toUpperCase()}`;
  const list = (raw: string | null): string[] => {
    if (!raw) return [];
    try {
      const v: unknown = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch { return []; } // checkAccessions and checkDataLinks name a malformed column
  };
  /**
   * One side's deposits: its keys, its deposit links, and its accessions unversioned but as
   * written, since a link names one in a path segment only as written (`accessionNamedIn`).
   */
  interface Deposits { keys: Set<string>; links: string[]; accessions: string[] }
  const deposits = (doiKey: string | null, links: string[], accessions: string[]): Deposits => {
    const own = links.filter((url) => linkKeyOf(url) !== null);
    const written = accessions.map(unversioned);
    const keys = [doiKey, ...own.map(linkKeyOf), ...written.map(accessionKey)];
    return { keys: new Set(keys.filter((k): k is string => k !== null)), links: own, accessions: written };
  };
  /** The deposits two sides share, by key or by an accession one side's link names. */
  const sharedBy = (a: Deposits, b: Deposits): string[] => {
    const out = new Set([...a.keys].filter((k) => b.keys.has(k)));
    for (const [x, y] of [[a, b], [b, a]] as const) {
      for (const acc of x.accessions) if (y.links.some((url) => accessionNamedIn(url, acc))) out.add(accessionKey(acc));
    }
    return [...out];
  };
  /** page -> the rows on that page that name a deposit. */
  const rowsOn = new Map<string, { id: string; deposits: Deposits }[]>();
  const headers = new Map<string, InventoryHeader>();
  for (const d of db.prepare('SELECT item_id, page, cells_json FROM dataset_rows ORDER BY page, ordinal, item_id')
    .all() as { item_id: string; page: string; cells_json: string }[]) {
    if (!headers.has(d.page)) headers.set(d.page, headerFor(d.page));
    const h = headers.get(d.page)!;
    const parsed = parseRowCells(d.cells_json);
    const cols = 'header' in h && 'cells' in parsed ? labelCells(h.header, parsed.cells) : null;
    if (!cols || !('Data' in cols)) continue;
    const data = readDataCell(cols['Data']!);
    if (data.kind !== 'deposit') continue;
    const rows = rowsOn.get(d.page) ?? [];
    rowsOn.set(d.page, rows);
    rows.push({
      id: d.item_id,
      deposits: deposits(data.doi ? `DOI ${data.doi}` : null, [data.url], data.accession ? [data.accession] : []),
    });
  }
  const problems: string[] = [];
  /** Entry-row pairs that read one Zenodo record two ways, reported apart from twins. */
  const twoWays: string[] = [];
  for (const e of db.prepare('SELECT item_id, page, url, doi, accessions, data_links FROM dataset_entries ORDER BY page, ordinal, item_id')
    .all() as { item_id: string; page: string; url: string | null; doi: string | null; accessions: string | null; data_links: string | null }[]) {
    const doi = bareDoi(e.doi);
    // The entry's own DOI is an item DOI, read as the API serves it (tucca-cellag/caail-planning#760).
    // One whose Zenodo type cannot be read is `checkZenodoTypes`'s to report; here it reads as the
    // registrant says, so the rest of the comparison still runs.
    const zenodo = doi !== null && isZenodoDoi(doi);
    const zenodoType = zenodo ? zenodoTypeOrNone(doi!) : undefined;
    const relation = doi === null ? null
      : zenodo && zenodoType === undefined ? doiRelation(doi)
      : itemDoiRelation(doi, () => zenodoType);
    const own = deposits(
      relation === 'own' ? `DOI ${doi}` : null,
      [...(e.url ? [e.url] : []), ...list(e.data_links)],
      list(e.accessions),
    );
    // An entry whose Zenodo record is a document: its own link to that record names the document,
    // not a deposit, so it is no twin key. A row whose Data cell lists the same record as a deposit
    // reads it the other way, and that is reported as what it is.
    const documentKey = zenodo && relation === 'publication' ? `DOI ${doi}` : null;
    if (documentKey !== null) own.keys.delete(documentKey);
    for (const row of rowsOn.get(e.page) ?? []) {
      if (documentKey !== null && row.deposits.keys.has(documentKey)) {
        twoWays.push(`${e.item_id} reads ${doi} as a document about it (its Zenodo record's type is ${zenodoType}), ` +
          `while ${row.id} on ${e.page} lists that record as a deposit in its Data cell, so one of them is wrong`);
      }
      const keys = sharedBy(own, row.deposits);
      if (keys.length > 0) {
        problems.push(`${e.item_id} and ${row.id} on ${e.page} both name ${keys.join(' and ')}, so one dataset is listed twice; keep one copy`);
      }
    }
  }
  return [
    ok(ENTRY_ROW_TWINS_LABEL, problems.length === 0, `${problems.length} twin(s): ${problems.slice(0, 10).join('; ')}`),
    ok(ZENODO_TWO_WAYS_LABEL, twoWays.length === 0, `${twoWays.length} pair(s): ${twoWays.slice(0, 10).join('; ')}`),
  ];
}

export const INVENTORY_PAGES_LABEL =
  'Datasets pages: only a page in INVENTORY_PAGES carries a "## Complete data inventory" table';

/**
 * Inventory-page guard (tucca-cellag/caail-planning#752, review round 3). Reports every page outside
 * INVENTORY_PAGES that carries a `## Complete data inventory` table, which nothing that counts reads;
 * `strayInventoryTables` says why for each kind of page. `db:emit` and `db:bootstrap` refuse the same
 * pages before writing (`refuseStrayInventory`), so the emit never regenerates such a table empty,
 * and `pnpm parse` refuses them too (`buildDatasetInventory`), since `build` runs no `db:check`.
 * CrossSpecies, which carried one until tucca-cellag/caail-planning#752 removed its rows, is the page
 * most likely to grow one again.
 */
export function checkInventoryPages(repoRoot: string = REPO_ROOT): CheckResult[] {
  const stray = strayInventoryTables(repoRoot);
  return [ok(INVENTORY_PAGES_LABEL, stray.length === 0, stray.join('; '))];
}

/** How many problems one failing run names; the count always covers them all. */
export const INVENTORY_CELLS_SHOWN = 10;

/**
 * Inventory Data-cell vocabulary (tucca-cellag/caail-planning#740). `Datasets/CLAUDE.md` allows a row's
 * Data cell to hold a link to the primary deposit (an accession badge or a named-repository link) or
 * one of two status words, `supplementary` and `unavailable`. A study with nothing else to show gets
 * no row, so any other cell (`on request`, `none named`, a bare accession) fails here, naming the row,
 * the cell and the reason.
 *
 * The cell is read by the parser's own `readDataCell`, the reader `rowIdentity` uses to fill the
 * API's identity fields, rather than by a second copy of the vocabulary, so a cell the API serves with
 * no `dataStatus` is a cell this rejects. That includes a status word in the wrong case, a link whose
 * target is not an http(s) address with a host, a badge whose text is not one identifier, a link
 * whose text names no deposit (`nonDepositLabel` in dataset-inventory.ts), and a link to a DOI whose
 * registrant is not a data host, for which the reason says whether to move it to the Paper cell or
 * add the registrant. It judges a link by its form and, for a DOI, by the DOI's registrant; it does
 * not check that the link reaches the deposit it names. The header comes from the same `readInventoryHeader` the
 * API build uses, which trims labels and refuses a repeated one, and a cell that is not a string is
 * refused before either reader sees it.
 *
 * A page with no Data column, or no table, fails rather than being skipped, so a new table shape
 * cannot drop out of the check.
 */
export function checkInventoryCells(
  db: Db,
  repoRoot: string = REPO_ROOT,
  headerFor: (page: string) => InventoryHeader = (page) => readInventoryHeader(page, repoRoot),
): CheckResult[] {
  const rows = db.prepare('SELECT item_id, page, cells_json FROM dataset_rows ORDER BY page, ordinal, item_id')
    .all() as { item_id: string; page: string; cells_json: string }[];
  const headers = new Map<string, InventoryHeader>();
  /** page -> its one problem, reported once however many rows the page has. */
  const pageProblems = new Map<string, string>();
  const pageProblem = (page: string, problem: string, firstRow: string): void => {
    if (!pageProblems.has(page)) pageProblems.set(page, `page ${page}: ${problem} (first row ${firstRow})`);
  };
  /** page -> rows whose cell count differs from its header, reported as one line per page. */
  const countMismatches = new Map<string, { rows: number; first: string; cells: number; columns: number }>();
  const problems: string[] = [];
  const shown = (cell: string): string => JSON.stringify(cell.length > 80 ? `${cell.slice(0, 77)}...` : cell);
  for (const r of rows) {
    if (!headers.has(r.page)) headers.set(r.page, headerFor(r.page));
    const read = headers.get(r.page)!;
    if ('problem' in read) { pageProblem(r.page, read.problem, r.item_id); continue; }
    const parsed = parseRowCells(r.cells_json);
    if ('problem' in parsed) { problems.push(`${r.item_id}: ${parsed.problem}`); continue; }
    const columns = labelCells(read.header, parsed.cells);
    if (!columns) {
      const seen = countMismatches.get(r.page);
      if (seen) seen.rows += 1;
      else countMismatches.set(r.page, { rows: 1, first: r.item_id, cells: parsed.cells.length, columns: read.header.length });
      continue;
    }
    if ('Data' in columns) {
      const data = readDataCell(columns['Data']!);
      if (data.kind === 'off-schema') problems.push(`${r.item_id}: Data cell ${shown(columns['Data']!)} ${data.reason}`);
    } else {
      pageProblem(r.page, 'has no Data column', r.item_id);
    }
  }
  // One line per page however many rows disagree, so a header edit cannot crowd out the rest.
  const counts = [...countMismatches].map(([page, m]) =>
    `page ${page}: ${m.rows} row(s) have a cell count other than its ${m.columns} columns (first ${m.first} has ${m.cells})`);
  const all = [...pageProblems.values(), ...counts, ...problems];
  const listed = all.slice(0, INVENTORY_CELLS_SHOWN).join('; ');
  return [ok(INVENTORY_CELLS_LABEL, all.length === 0,
    `${all.length} problem(s)${all.length > INVENTORY_CELLS_SHOWN ? `, first ${INVENTORY_CELLS_SHOWN}` : ''}: ${listed}`)];
}

/**
 * Fine-tag seed-drift guard (tucca-cellag/caail-planning#339), the fine-tag analog of the THEMES seed-drift check.
 *
 * `preserveCuratedTopics` folds a curator-minted fine tag the seed lacks but deliberately does
 * NOT overwrite a SEEDED tag from committed, so on re-bootstrap a seeded tag's attributes come
 * from seed.ts's FINE_TAGS. That is only safe if seed.ts and the committed topics.ndjson AGREE
 * for every seeded tag: otherwise a divergence is resolved silently (seed wins on bootstrap),
 * which is the hand-typed-fact-silently-discarded class the repo flags. Themes already have this
 * guard; fine tags did not until now. Assert every seed FINE_TAG resolves to a committed topic
 * with the same label + parent theme (and no area_key, a theme-only column), so a drift fails
 * db:check loudly and a curator reconciles seed.ts and the NDJSON rather than one quietly winning.
 */
export function checkFineTagSeedDrift(db: Db): CheckResult[] {
  const rows = db.prepare("SELECT slug,label,theme_slug,area_key FROM topics WHERE tier='tag'").all() as
    { slug: string; label: string; theme_slug: string | null; area_key: string | null }[];
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const problems: string[] = [];
  for (const f of FINE_TAGS) {
    const row = bySlug.get(f.slug);
    if (!row) { problems.push(`${f.slug}: in seed.ts FINE_TAGS but absent from committed topics.ndjson`); continue; }
    if (row.label !== f.label) problems.push(`${f.slug}: label '${row.label}' != seed '${f.label}'`);
    if (row.theme_slug !== f.theme) problems.push(`${f.slug}: theme '${row.theme_slug}' != seed '${f.theme}'`);
    if (row.area_key !== null) problems.push(`${f.slug}: has area_key '${row.area_key}' (fine tags carry none)`);
  }
  return [ok('fine tags: every seed.ts FINE_TAG matches its committed topic (label + parent theme)',
    problems.length === 0, problems.slice(0, 3).join('; '))];
}

/**
 * Field-report series/recency guard (tucca-cellag/caail-planning#332), the reports analog of checkSubseries.
 *
 * The parser DERIVES `current`/`supersededBy` from max(edition_sort) per `series_slug`, and
 * that derivation is only well-defined under the rules `seriesRecency` (parser/reports.ts)
 * states and checks, which live there alone so this docstring cannot drift from them. It calls the
 * same function `deriveReports` does, so on rows the DB import accepts, with the schema's column
 * types, the two report the same problems (see `seriesRecency` for where they can differ). In CI
 * this runs in parallel with the builds that parse, so it can be where a curator first meets a
 * failure, and the detail carries the fix rule for that reason.
 */
export function checkSeries(db: Db): CheckResult[] {
  const rows = db.prepare('SELECT item_id, series_slug, edition_label, edition_sort, ordinal FROM reports').all() as
    { item_id: string; series_slug: string | null; edition_label: string; edition_sort: string; ordinal: number }[];
  const { problems } = seriesRecency(rows);
  const detail = problems.length === 0 ? '' : `${problems.slice(0, 3).join('; ')}. ${EDITION_SORT_RULE}`;
  return [ok('reports series: valid edition label + date, no duplicate or nested dates within a series',
    problems.length === 0, detail)];
}

/**
 * The five foundation-model rows share two clauses, and neither can live in one
 * place above them: `buildTaxonomyModel` keeps only prose under an `###`, so a
 * paragraph introducing the family is dropped and never reaches `taxonomy.json`,
 * which is what `caail-classification-reviewer` and the `caail` plugin skill fetch
 * when disputing a placement. The rows therefore each carry the clauses, and a
 * sentence repeated across five definitions is exactly the thing that rots.
 *
 * Driven off the DB's own row list rather than off prose, so adding a sixth row
 * without the clauses fails here. Renaming every row away from the prefix ends the
 * check quietly, which is the trade: that is a deliberate restructure, not the
 * drift this exists to catch.
 *
 * Scoped to this family on purpose. The raise-for-re-audit sentence also appears on
 * `Ensemble Learning`, `Food Safety Prediction` and `Media Optimization`, and those
 * are NOT guarded, because each is a single row that nobody adds a sibling to. The
 * risk being covered here is a family that grows: a sixth foundation-model row is a
 * realistic edit and would silently arrive without the clauses. Guarding the
 * one-offs would mean typing their names into a list, which is the failure this
 * whole file exists to avoid.
 *
 * These are PRESENCE probes over the definition text, not semantic ones. They
 * answer "does this row still say something about invoking, and about re-auditing",
 * which catches the realistic failure (a new row pasted in without the clauses).
 * They cannot tell an inverted sentence from an upheld one, so a reviewer rewording
 * a clause still has to read what they wrote.
 */
const FM_PREFIX = 'Foundation Models';
const FM_CLAUSES: ReadonlyArray<readonly [string, RegExp]> = [
  // Alternations cover the sanctioned phrasings rather than one spelling, so an
  // editor rewording "invokes" to "calls it as a tool" is not sent back to satisfy
  // a regex.
  ['the built-vs-called exclusion', /invok|calls? (it|one|such)|tool call/i],
  ['the raise-rather-than-unseat clause', /re-audit|raise it .*rather than/i],
];

/**
 * The contribution principle: a row records what a paper CONTRIBUTED, not what
 * appears in its methods section. Stated once in the methods preamble, and
 * restated by the rows whose boundary turns on it, each in its own terms.
 *
 * WHY THIS IS NOT A SECOND HAND-TYPED LIST, which the FM comment above rightly
 * refuses. The preamble names the rows that carry the rule; this guard READS that
 * list out of the prose rather than holding a copy. So there is one list, in the
 * file a curator edits, and the check follows it. Remove a row from the preamble
 * and this stops asking about it, which is correct: the preamble is the statement
 * of which rows are in scope.
 *
 * WHAT THIS DOES NOT DO. CONTRIBUTION_CLAUSE is a fixed VOCABULARY, not a reading
 * of the principle, so adding a fourth row is not free: its clause has to restate
 * the rule in one of the recognised forms, or the pattern has to be widened in the
 * same change. The two rows added alongside this guard are the worked example.
 * Comparative Studies carries the rule in its own words ("the row records a paper's
 * contribution and not its model count") and matches none of these stems, so naming
 * it on the scope line as things stand would fail this check rather than extend it.
 *
 * The FM family stays guarded separately above, by PREFIX, because its risk is
 * different: a sixth foundation-model row arriving without the clauses. That is a
 * growth risk. This one is a drift risk between rows that already exist.
 *
 * THE VACUITY PROBE IS LOAD-BEARING. If the preamble stopped naming any row, the
 * derived list would be empty and the per-row assertion would pass forever while
 * checking nothing. That exact failure — a guard reduced to comparing two empty
 * sets — is what the row/tag parity check below also defends against, and it is
 * the reason both assert their inputs resolve before comparing them.
 *
 * Presence probes, like the FM ones: they answer "does this row still say
 * something about consuming or configuring rather than contributing". They cannot
 * tell an inverted sentence from an upheld one.
 */
const METHODS_H2 = '## AI/ML methods (rows)';
const CONTRIBUTION_SCOPE_MARKER = 'Rows that restate it:';
const CONTRIBUTION_PRINCIPLE = /records what a paper contributed/i;
const CONTRIBUTION_CLAUSE =
  /invok|tool call|merely (evaluat|us|labell|invok)|configur|consum|scored (by|against)/i;

/**
 * Taxonomy axis guard: every matrix row and column must resolve to a definition
 * under *its own* H2 vocabulary in Taxonomy.md.
 *
 * The file defines three vocabularies that may in principle share a label, so a
 * whole-file flatten loses one of them silently. That is not hypothetical: the
 * `Bioprocess & Scale-Up` column and a same-named subject theme collided exactly
 * this way. The theme has since been renamed to `Bioprocess & Manufacturing`
 * and `taxonomy.test.ts` now asserts the two axes share no label at all, so the
 * collision is gone at the source — this guard is defence in depth against a
 * convention a future edit could breach, not a live condition. The pre-existing
 * guards could not see it:
 * `generate-data.ts` asserted the label had a *non-empty* definition (it did,
 * the theme's), and nothing asserted heading uniqueness at all.
 *
 * `buildTaxonomyModel` throws on a within-axis duplicate or an unmapped H2, so
 * this reports that as a failure rather than crashing the run, then checks the
 * DB's own axis labels against the axis-qualified maps.
 */
export function checkTaxonomyAxes(db: Db, repoRoot: string = REPO_ROOT): CheckResult[] {
  const out: CheckResult[] = [];
  const taxonomyPath = join(repoRoot, 'Taxonomy.md');
  if (!existsSync(taxonomyPath)) {
    return [ok('Taxonomy.md parses with every definition on exactly one axis', false,
      `Taxonomy.md not found at ${repoRoot}`)];
  }

  let taxonomy: TaxonomyData;
  try {
    taxonomy = buildTaxonomyModel(taxonomyPath);
  } catch (err) {
    return [ok('Taxonomy.md parses with every definition on exactly one axis', false,
      err instanceof Error ? err.message : String(err))];
  }
  out.push(ok('Taxonomy.md parses with every definition on exactly one axis', true));

  const areas = (db.prepare('SELECT label FROM areas').all() as { label: string }[]).map((r) => r.label);
  const missingAreas = areas.filter((label) => !taxonomy.axes.area[label]?.trim());
  out.push(ok('every DB area is defined under "## Research areas (columns)"', missingAreas.length === 0,
    `missing: [${missingAreas.join(', ')}]`));

  const methods = (db.prepare('SELECT label FROM methods').all() as { label: string }[]).map((r) => r.label);
  const missingMethods = methods.filter((label) => !taxonomy.axes.method[label]?.trim());
  out.push(ok('every DB method is defined under "## AI/ML methods (rows)"', missingMethods.length === 0,
    `missing: [${missingMethods.join(', ')}]`));

  const fmRows = methods.filter((label) => label.startsWith(FM_PREFIX));
  for (const [what, probe] of FM_CLAUSES) {
    const missing = fmRows.filter((label) => !probe.test(taxonomy.axes.method[label] ?? ''));
    out.push(ok(`every "${FM_PREFIX}" row states ${what}`, missing.length === 0,
      `missing from: [${missing.join(', ')}]`));
  }

  // The contribution principle, and the rows the preamble names as restating it.
  // The list is derived from that prose, never held here — see CONTRIBUTION_CLAUSE.
  const taxonomySrc = readFileSync(taxonomyPath, 'utf-8');
  const h2At = taxonomySrc.indexOf(METHODS_H2);
  const preamble = h2At === -1
    ? ''
    : taxonomySrc.slice(h2At + METHODS_H2.length).split('\n### ')[0] ?? '';

  out.push(ok('Taxonomy.md states the contribution principle once, in the methods preamble',
    CONTRIBUTION_PRINCIPLE.test(preamble),
    `the "${METHODS_H2}" preamble no longer states it, so the rows below have nothing to agree ` +
    `with and each is free to drift into its own version`));

  // Read the scope off ONE marked line, not off the whole preamble. Scanning the
  // preamble for any mention picked up `Deep Learning`, which the preamble names
  // only in the paragraph explaining that routing rules are a DIFFERENT rule. A
  // label appearing near a principle is not a label governed by it, and that is
  // the same presence-versus-meaning confusion this principle exists to settle.
  const scopeLine = preamble.split('\n').find((l) => l.includes(CONTRIBUTION_SCOPE_MARKER)) ?? '';
  const namedRows = methods.filter((label) =>
    scopeLine.includes(label) || (label.startsWith(FM_PREFIX) && scopeLine.includes(FM_PREFIX)));
  out.push(ok('the methods preamble names at least one row as restating it', namedRows.length > 0,
    `no DB method label appears on the "${CONTRIBUTION_SCOPE_MARKER}" line (or the line is gone), ` +
    `so the per-row check below would compare an empty set and pass while checking nothing`));

  const missingClause = namedRows.filter(
    (label) => !CONTRIBUTION_CLAUSE.test(taxonomy.axes.method[label] ?? ''));
  out.push(ok('every row the preamble names still carries its contribution clause',
    missingClause.length === 0, `missing from: [${missingClause.join(', ')}]`));

  // The themes axis is guarded by count against the same THEME_SLUGS that
  // checkTopicTiers asserts, so a theme added to Taxonomy.md without a topic
  // record (or the reverse) fails here rather than drifting quietly. Labels are
  // prose and slugs are identifiers, so only the cardinality is comparable.
  //
  // The likely cause of a mismatch is not theme drift, so the message says so:
  // Taxonomy.md's theme section documents the fixed backbone only, and states
  // that "finer tags live under them and are minted only when several items
  // cluster". Fine tags are DB records described in that prose, never `###`
  // headings, so the first one written as a heading would otherwise fail here
  // with a message blaming the wrong thing.
  const themeCount = Object.keys(taxonomy.axes.theme).length;
  out.push(ok(`Taxonomy.md documents exactly the ${THEME_SLUGS.length} backbone themes`,
    themeCount === THEME_SLUGS.length,
    `"## Subject themes (topic tags)" has ${themeCount} "###" heading(s), the DB backbone has ` +
    `${THEME_SLUGS.length}. Fine tags are minted in the DB and described in that section's prose, ` +
    `not written as "###" headings, so a count above the backbone usually means a fine tag was ` +
    `added as a heading rather than that a theme was added or removed.`));

  return out;
}

/**
 * Rows whose membership is duplicated onto the topic axis, and must agree both ways.
 *
 * `Comparative Studies` is the first matrix row minted alongside a fine tag carrying
 * the same fact. That is exactly the "hand-typed fact next to a machine-derived one"
 * shape this repo keeps paying for, and the curator's condition for allowing the
 * duplication at all was that a guard enforce it rather than a comment asking people
 * to remember. So the pairing is asserted in BOTH directions: a ref in the row without
 * the tag, and a ref carrying the tag without the row, each fail here naming the ref.
 *
 * The pair is keyed by method label and topic slug. Both are asserted to resolve
 * before the membership comparison runs, because the way a guard like this usually
 * dies is a rename turning it into a comparison of two empty sets that passes forever.
 */
const ROW_TAG_PAIRS: ReadonlyArray<{ method: string; topic: string }> = [
  { method: 'Comparative Studies', topic: 'comparative-study' },
];

export function checkRowTagParity(db: Db): CheckResult[] {
  const out: CheckResult[] = [];
  for (const { method, topic } of ROW_TAG_PAIRS) {
    const hasMethod = db.prepare('SELECT 1 FROM methods WHERE label=?').get(method) !== undefined;
    const hasTopic = db.prepare('SELECT 1 FROM topics WHERE slug=?').get(topic) !== undefined;
    out.push(ok(`row/tag parity: '${method}' and '${topic}' both resolve`,
      hasMethod && hasTopic,
      `method ${hasMethod ? 'ok' : 'MISSING'}, topic ${hasTopic ? 'ok' : 'MISSING'}`));
    if (!hasMethod || !hasTopic) continue;

    const inRow = (db.prepare('SELECT DISTINCT ref_id FROM matrix_cells WHERE method=?')
      .all(method) as { ref_id: number }[]).map((r) => r.ref_id);
    const tagged = (db.prepare(
      "SELECT CAST(SUBSTR(item_id, 7) AS INTEGER) AS ref_id FROM item_topics"
      + " WHERE topic_id=? AND item_id LIKE 'paper:%'",
    ).all(`topic:${topic}`) as { ref_id: number }[]).map((r) => r.ref_id);

    const rowSet = new Set(inRow);
    const tagSet = new Set(tagged);
    const untagged = inRow.filter((r) => !tagSet.has(r)).sort((a, b) => a - b);
    const unrowed = tagged.filter((r) => !rowSet.has(r)).sort((a, b) => a - b);
    out.push(ok(`row/tag parity: every '${method}' ref carries the '${topic}' tag`,
      untagged.length === 0, `untagged ref(s): ${untagged.join(', ')}`));
    out.push(ok(`row/tag parity: every '${topic}' ref sits in the '${method}' row`,
      unrowed.length === 0, `ref(s) tagged but not in the row: ${unrowed.join(', ')}`));
  }
  return out;
}

/** Run every guard against a DB. Returns all results (ok + failing). */
export function runChecks(db: Db, repoRoot: string = REPO_ROOT): CheckResult[] {
  return [...checkIntegrity(db), ...checkReachability(db), ...checkColumnDrift(db, repoRoot),
    ...checkTaxonomyAxes(db, repoRoot),
    ...checkTopicTiers(db), ...checkAxisBijection(db, repoRoot),
    ...checkCatalogHeadings(db), ...checkLicenses(db), ...checkManualLicenseKeys(db),
    ...checkDois(db), ...checkManualDoiKeys(db), ...checkRelatedDois(db), ...checkSubseries(db),
    ...checkInventoryCells(db, repoRoot), ...checkInventoryPages(repoRoot), ...checkOnRequest(db, repoRoot), ...checkZenodoTypes(db), ...checkEntryRowTwins(db, repoRoot), ...checkAccessions(db), ...checkDataLinks(db),
    ...checkSeries(db), ...checkFineTagSeedDrift(db), ...checkRowTagParity(db)];
}

function main(): void {
  console.log('CAAIL DB integrity + drift check');
  const results = runChecks(importNdjson());
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.label}${r.detail && !r.ok ? `\n      ${r.detail}` : ''}`);
  const failures = results.filter((r) => !r.ok).length;
  console.log(`\n${failures === 0 ? '✓ all checks passed' : `✗ ${failures} check(s) FAILED`}`);
  if (failures) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
