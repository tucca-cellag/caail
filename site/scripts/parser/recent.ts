/**
 * recent.ts — builds recent.json for the home page "Recently added" panel.
 *
 * Derived at build time from `git log` over the canonical content files, so the
 * list refreshes on every `pnpm parse`/build/deploy and can never go stale. The
 * git call mirrors the momentum snapshot in metrics.ts: a thin execFileSync
 * wrapper, the whole thing guarded so a shallow clone / tarball build degrades to
 * an empty list (the component then renders just its "View the full changelog"
 * link) rather than failing the build.
 *
 * Selection: `--no-merges` so PR-merged additions surface (this repo merges via
 * merge commits, which `--first-parent` would hide); restricted to commits whose
 * Conventional-Commit subject starts with an addition verb, so reorg/relabel
 * commits stay out of a list titled "Recently *added*".
 *
 * Reads git history; never mutates the canonical files.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { RecentSchema, type Recent, type RecentEntry } from './types.js';

/** parser/ → scripts/ → site/ → repo root. */
const DEFAULT_REPO_ROOT: string = fileURLToPath(new URL('../../../', import.meta.url));

/** Canonical content files/dirs whose additions the home page advertises. */
const CONTENT_PATHS: readonly string[] = [
  'Papers.md',
  'Software.md',
  'Databases.md',
  'Datasets',
  'OtherResources.md',
];

/** First Conventional-Commit scope token → the entry kind shown on the card. */
const SCOPE_TO_KIND: Readonly<Record<string, RecentEntry['kind']>> = {
  papers: 'Paper',
  data: 'Dataset',
  datasets: 'Dataset',
  software: 'Software',
  databases: 'Database',
  resources: 'Resource',
};

/** Subject lead verbs that mark a commit as an *addition* (vs. a reorg/relabel). */
const ADDITION_VERBS: readonly string[] = [
  'add',
  'integrate',
  'catalogue',
  'catalog',
  'inventory',
];

/**
 * Ordered keyword → research-area map. The area dot is the one field git can't
 * ground, so it's a best-effort match against the title; first hit wins, and
 * anything unmatched falls back to `tooling` (the neutral "general method/tool"
 * column). Keep the method/cell-biology cues before the generic tooling cues.
 */
const AREA_KEYWORDS: ReadonlyArray<readonly [RecentEntry['area'], readonly string[]]> = [
  ['sensory', ['burger', 'flavor', 'flavour', 'aroma', 'taste', 'sensory', 'mass spec', 'metabolom', 'volatile']],
  ['eval', ['benchmark', 'leaderboard', 'eval']],
  ['bioprocess', ['bioreactor', 'bioprocess', 'scale-up', 'scale up', 'perfusion', 'microcarrier']],
  ['scaffolding', ['scaffold', 'biomaterial', 'hydrogel']],
  ['media', ['media', 'medium', 'growth factor', 'serum']],
  ['cell', ['knockout', 'crispr', 'satellite cell', 'differentiation', 'atlas', 'single-cell', 'scrna', 'rna-seq', 'cell line', 'cell-line', 'lineage', 'transcriptom']],
  ['tooling', ['agent', 'mcp', 'llm', 'foundation model', 'framework', 'tool', 'docs', 'pipeline']],
];

/**
 * Run a git command rooted at `repoRoot`, returning trimmed stdout. stderr is
 * discarded so the guarded failure path (no repo / shallow clone) stays silent.
 */
function git(repoRoot: string, args: string[]): string {
  return execFileSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/** First keyword match wins; unmatched titles default to `tooling`. */
function classifyArea(title: string): RecentEntry['area'] {
  const haystack = title.toLowerCase();
  for (const [area, keywords] of AREA_KEYWORDS) {
    if (keywords.some((kw) => haystack.includes(kw))) return area;
  }
  return 'tooling';
}

/**
 * Turn a Conventional-Commit subject into a card entry, or null if it isn't an
 * addition to a catalogued content file.
 *
 * `feat(papers): add Tac et al. 2026 burger paper (#236)`
 *   → { kind: 'Paper', title: 'Tac et al. 2026 burger paper', area: 'sensory' }
 */
function parseSubject(date: string, subject: string): RecentEntry | null {
  // type(scope): rest  — scope required (it carries the kind).
  const m = /^[a-z]+\(([^)]+)\):\s*(.+)$/i.exec(subject);
  if (!m) return null;
  const kind = SCOPE_TO_KIND[m[1].split(',')[0].trim().toLowerCase()];
  if (!kind) return null;

  let rest = m[2].trim();
  const verb = ADDITION_VERBS.find((v) =>
    new RegExp(`^${v}\\b`, 'i').test(rest),
  );
  if (!verb) return null;

  // Strip the lead verb and any trailing " (#NN)" issue/PR ref → noun phrase.
  let title = rest
    .slice(verb.length)
    .replace(/\s*\(#\d+\)\s*$/, '')
    .trim();
  if (!title) return null;
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return { date, kind, title, area: classifyArea(title) };
}

/**
 * Build the home page "Recently added" list (newest first) from git history.
 *
 * @param repoRoot  Repository root (defaults to the canonical root).
 * @param limit     Max entries to keep (default 5 — what the panel shows).
 * @returns Validated, deduped entries; an empty array if git history is
 *          unavailable (shallow clone / tarball) — never throws on that.
 */
export function buildRecentModel(
  repoRoot: string = DEFAULT_REPO_ROOT,
  limit = 5,
): Recent {
  let lines: string[];
  try {
    const out = git(repoRoot, [
      'log',
      '--no-merges',
      '--date=short',
      // %ad <unit-separator> %s — the separator can't appear in a subject.
      '--format=%ad\x1f%s',
      '--',
      ...CONTENT_PATHS,
    ]);
    lines = out ? out.split('\n') : [];
  } catch {
    return RecentSchema.parse([]);
  }

  const entries: RecentEntry[] = [];
  const seenTitles = new Set<string>();
  for (const line of lines) {
    // git log is already newest-first; don't re-sort (preserves intra-day order).
    if (entries.length >= limit) break;
    const sep = line.indexOf('\x1f');
    if (sep < 0) continue;
    const entry = parseSubject(line.slice(0, sep), line.slice(sep + 1));
    if (!entry || seenTitles.has(entry.title)) continue;
    seenTitles.add(entry.title);
    entries.push(entry);
  }

  return RecentSchema.parse(entries);
}

/**
 * ISO author-date of the newest *addition* commit for a given content kind, drawn
 * from the SAME git selection buildRecentModel uses (`--no-merges`, addition-verb +
 * scope filter via parseSubject, across all CONTENT_PATHS). This is what the
 * "By the Numbers" momentum snapshot reads for "last updated", so it can never
 * disagree with the home page "Recently added" list — "days since newest paper
 * added" is exactly the date of the newest Paper in that list.
 *
 * Kind-based (not path-based) on purpose: a paper addition is `feat(papers): add …`
 * regardless of which file it touched, and the recency list is grouped by kind too.
 *
 * @returns ISO date string, or null if no matching addition exists / git history is
 *          unavailable (shallow clone / tarball) — never throws on that.
 */
export function lastAdditionDate(
  kind: RecentEntry['kind'],
  repoRoot: string = DEFAULT_REPO_ROOT,
): string | null {
  let lines: string[];
  try {
    const out = git(repoRoot, [
      'log',
      '--no-merges',
      // %aI <unit-separator> %s — full ISO author date; the separator can't appear
      // in a subject.
      '--format=%aI\x1f%s',
      '--',
      ...CONTENT_PATHS,
    ]);
    lines = out ? out.split('\n') : [];
  } catch {
    return null;
  }

  for (const line of lines) {
    // git log is newest-first; the first kind-matching addition wins.
    const sep = line.indexOf('\x1f');
    if (sep < 0) continue;
    const entry = parseSubject(line.slice(0, sep), line.slice(sep + 1));
    if (entry && entry.kind === kind) return line.slice(0, sep);
  }
  return null;
}
