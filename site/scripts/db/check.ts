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
 *    no label may be defined twice within one axis.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importNdjson, REPO_ROOT, SITE_ROOT, type Db } from './lib.js';
import { THEME_SLUGS } from './seed.js';
import { buildTaxonomyModel } from '../parser/taxonomy.js';
import type { TaxonomyData } from '../parser/types.js';

const MANUAL_LICENSES_PATH = join(SITE_ROOT, 'scripts', 'db', 'licenses-manual.json');
const MANUAL_DOIS_PATH = join(SITE_ROOT, 'scripts', 'db', 'dois-manual.json');
const RELATED_DOIS_PATH = join(SITE_ROOT, 'scripts', 'db', 'dois-related.json');
const SUBSERIES_PATH = join(SITE_ROOT, 'scripts', 'db', 'subseries.json');

export interface CheckResult { label: string; ok: boolean; detail: string; }
const ok = (label: string, cond: boolean, detail = ''): CheckResult => ({ label, ok: cond, detail });

const PREFIX: Record<string, string> = { paper: 'paper', software: 'sw', database: 'db', dataset: 'ds', topic: 'topic' };

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
    ['dataset_rows', 'dataset'], ['dataset_entries', 'dataset'], ['topics', 'topic'],
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
    `SELECT ref_id FROM papers WHERE section='References'
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
  const bareRe = /^10\.\d{4,9}\/\S+$/;
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
 * SuperSeries membership (CAAIL-258): every `subseries.json` key must resolve to a
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
  const accRe = /^(?:GSE\d+|PRJ[A-Z]+\d+|E-MTAB-\d+|CRA\d+|PXD\d+)$/;
  const problems: string[] = [];
  /** member accession -> the distinct PARENT accessions claiming it. */
  const memberToParents = new Map<string, Set<string>>();
  const rows = db.prepare('SELECT item_id, subseries FROM dataset_rows WHERE subseries IS NOT NULL')
    .all() as { item_id: string; subseries: string }[];
  for (const r of rows) {
    // ds:gse158430-2 -> GSE158430: the per-species fan-out of one accession.
    const parentAcc = r.item_id.slice(3).replace(/-\d+$/, '').toUpperCase();
    let arr: unknown;
    try { arr = JSON.parse(r.subseries); } catch { problems.push(`${r.item_id}: subseries not JSON`); continue; }
    if (!Array.isArray(arr)) { problems.push(`${r.item_id}: subseries not an array`); continue; }
    if (arr.length === 0) { problems.push(`${r.item_id}: subseries is empty (use NULL, not [])`); continue; }
    const seen = new Set<string>();
    for (const a of arr) {
      if (typeof a !== 'string' || a !== a.toUpperCase() || !accRe.test(a)) { problems.push(`${r.item_id}: bad accession '${String(a)}'`); continue; }
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

/**
 * Taxonomy axis guard: every matrix row and column must resolve to a definition
 * under *its own* H2 vocabulary in Taxonomy.md.
 *
 * The file defines three vocabularies that may legitimately share a label — the
 * `Bioprocess & Scale-Up` matrix column and the `Bioprocess & Scale-Up` subject
 * theme are different things with the same name. A whole-file flatten therefore
 * loses one of them silently, and the pre-existing guards could not see it:
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

/** Run every guard against a DB. Returns all results (ok + failing). */
export function runChecks(db: Db, repoRoot: string = REPO_ROOT): CheckResult[] {
  return [...checkIntegrity(db), ...checkReachability(db), ...checkColumnDrift(db, repoRoot),
    ...checkTaxonomyAxes(db, repoRoot),
    ...checkTopicTiers(db), ...checkCatalogHeadings(db), ...checkLicenses(db), ...checkManualLicenseKeys(db),
    ...checkDois(db), ...checkManualDoiKeys(db), ...checkRelatedDois(db), ...checkSubseries(db)];
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
