/**
 * scan-licenses.ts — curated license candidate generator (`pnpm scan:licenses`).
 *
 * MANUAL / opt-in, and NON-mutating: it never edits the catalog. For every entry
 * that is still untagged (no auto cache hit, no manual `License:` line) it looks
 * for a license and prints a review table + writes candidate JSON. A human then
 * hand-checks the evidence and adds the confirmed `License:` lines (which render
 * as dashed "verify before commercial use" tags).
 *
 * This is the counterpart to `fetch:licenses`: that populates the AUTO cache with
 * GitHub's own authoritative SPDX matches only; this covers everything GitHub's
 * matcher can't (non-GitHub databases, and GitHub repos it returns NOASSERTION
 * for). Both stay network-quarantined — `parse`/`build` never call them.
 *
 * Techniques (in order, first hit wins):
 *   1. GitHub `/license` DEEP-READ — classify the LICENSE file text. Emitted as
 *      REVIEW only (never high-confidence): GitHub returns NOASSERTION precisely
 *      because the license is non-standard, and a text classifier mislabels those
 *      (a BSD-header non-commercial license reads as BSD, a CC-BY-NC as CC0), so
 *      these MUST be human-verified before use.
 *   2. Crossref — for doi.org entries, the work's `license[].URL`.
 *   3. Website subpages — fetch the homepage, then follow same-domain
 *      license/terms/legal links AND canonical license URLs (creativecommons.org
 *      /gnu.org/…), plus probe common paths (/license, /license.php, /terms, …).
 *      A hit on the resource's OWN domain or a canonical license URL is `high`;
 *      a homepage-only mention is `medium`. Cross-domain generic pages (a repo's
 *      GitHub ToS, a Wikipedia article, a metadata namespace) are NOT trusted —
 *      that was the dominant false-positive source.
 *
 * Registry enrichment (re3data `dataLicense`, Wikidata P275) is a documented
 * follow-up — see the notes at the bottom of this file.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildCatalogModel } from './catalog.js';
import { repoFromUrl } from './licenses.js';
import { classifyLicenseText } from './license-classify.js';

const OUT = fileURLToPath(new URL('./license-scan.json', import.meta.url));
const UA = 'CAAIL-license-scan';
const CANONICAL_LICENSE_HOSTS = new Set(['creativecommons.org', 'www.gnu.org', 'gnu.org', 'opensource.org', 'spdx.org', 'cran.r-project.org', 'www.r-project.org']);
const LICENSE_LINK_RE = /(licen[sc]e|licensing|terms|legal|copyright|disclaimer|data[\s_-]?policy|usage)/i;
const COMMON_PATHS = ['/license', '/license.php', '/license.html', '/licence', '/terms', '/terms-of-use', '/legal', '/licensing', '/copyright', '/data-policy'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, ms = 22000): Promise<string | null> {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal, redirect: 'follow' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': UA };
  const t = process.env.GITHUB_TOKEN?.trim();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

const strip = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const host = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
function sameSite(a: string, b: string): boolean {
  const [x, y] = [host(a), host(b)];
  return !!x && (x === y || x.endsWith('.' + y) || y.endsWith('.' + x));
}
const canonicalLicenseUrl = (u: string): boolean => { try { const url = new URL(u); return CANONICAL_LICENSE_HOSTS.has(url.hostname) && /licen[sc]e/i.test(url.pathname); } catch { return false; } };

interface Candidate { catalog: string; group: string; slug: string; name: string; url: string; license: string; confidence: 'high' | 'medium' | 'review'; via: string; evidence: string; quote: string; }

async function scanGithubLicense(repo: string): Promise<Omit<Candidate, 'catalog' | 'group' | 'slug' | 'name' | 'url'> | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/license`, { headers: ghHeaders() });
    if (!res.ok) return null;
    const j = (await res.json()) as { license?: { spdx_id?: string }; content?: string };
    if (!j.content) return null;
    const hit = classifyLicenseText(Buffer.from(j.content, 'base64').toString('utf8'));
    // Deep-read is REVIEW only — GitHub couldn't classify it, so neither can we with confidence.
    if (hit) return { license: hit.license, confidence: 'review', via: 'github-license', evidence: `https://github.com/${repo}/blob/HEAD/LICENSE`, quote: hit.quote };
  } catch { /* ignore */ }
  return null;
}

async function scanCrossref(url: string): Promise<Omit<Candidate, 'catalog' | 'group' | 'slug' | 'name' | 'url'> | null> {
  const m = /(?:doi\.org\/|\/doi\/)(10\.[^\s"?#]+)/i.exec(url);
  if (!m) return null;
  const body = await get(`https://api.crossref.org/works/${encodeURIComponent(m[1])}`);
  if (!body) return null;
  try {
    for (const l of (JSON.parse(body).message?.license || []) as Array<{ URL?: string }>) {
      const hit = classifyLicenseText(l.URL || '');
      if (hit) return { license: hit.license, confidence: 'high', via: 'crossref', evidence: l.URL!, quote: hit.quote };
    }
  } catch { /* ignore */ }
  return null;
}

async function scanWebsite(entryUrl: string): Promise<Omit<Candidate, 'catalog' | 'group' | 'slug' | 'name' | 'url'> | null> {
  const home = await get(entryUrl);
  if (!home) return null;
  let origin = ''; try { origin = new URL(entryUrl).origin; } catch { /* */ }
  const links = new Set<string>();
  for (const m of home.matchAll(/href="([^"#]+)"/gi)) {
    if (!LICENSE_LINK_RE.test(m[1]) && !/creativecommons\.org\/licenses|gnu\.org\/licenses/i.test(m[1])) continue;
    try { links.add(new URL(m[1], entryUrl).href); } catch { /* */ }
  }
  for (const p of COMMON_PATHS) if (origin) links.add(origin + p);

  const seen = new Set([entryUrl]);
  for (const link of links) {
    if (seen.has(link)) continue; seen.add(link);
    // Trust a subpage only if it's on the resource's own site OR a canonical license URL.
    const trusted = sameSite(link, entryUrl) || canonicalLicenseUrl(link);
    if (!trusted) continue;
    const page = await get(link);
    await sleep(300);
    if (!page) continue;
    // Classify the page text PLUS the URL (a canonical CC/GNU path encodes the license).
    const hit = classifyLicenseText(strip(page) + ' ' + link);
    if (hit) return { license: hit.license, confidence: 'high', via: 'subpage', evidence: link, quote: hit.quote };
  }
  const homeHit = classifyLicenseText(strip(home));
  if (homeHit) return { license: homeHit.license, confidence: 'medium', via: 'homepage', evidence: entryUrl, quote: homeHit.quote };
  return null;
}

async function main(): Promise<void> {
  const cat = buildCatalogModel();
  const untagged = (['software', 'databases'] as const).flatMap((k) =>
    cat[k].filter((e) => !e.license).map((e) => ({ catalog: k, group: e.group, slug: e.slug, name: e.name, url: e.url })),
  );
  // eslint-disable-next-line no-console
  console.log(`scan:licenses — ${untagged.length} untagged entries${process.env.GITHUB_TOKEN ? '' : ' (set GITHUB_TOKEN for GitHub deep-reads)'}`);

  const candidates: Candidate[] = [];
  for (let i = 0; i < untagged.length; i++) {
    const e = untagged[i];
    const repo = repoFromUrl(e.url);
    let r = repo ? await scanGithubLicense(repo) : null;
    if (!r) r = await scanCrossref(e.url);
    if (!r && !repo) r = await scanWebsite(e.url); // never web-scan a github.com URL (its footer links to GitHub's own ToS)
    if (r) candidates.push({ ...e, ...r });
    // eslint-disable-next-line no-console
    console.log(`  [${i + 1}/${untagged.length}] ${e.name}: ${r ? `${r.license} (${r.confidence}, ${r.via})` : 'none'}`);
    if (!repo) await sleep(700);
  }

  const apply = candidates.filter((c) => c.confidence === 'high');
  const review = candidates.filter((c) => c.confidence !== 'high');
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), apply, review }, null, 2) + '\n', 'utf-8');
  // eslint-disable-next-line no-console
  console.log(`\nscan:licenses — ${apply.length} high-confidence, ${review.length} for review. Wrote ${OUT}.`);
  // eslint-disable-next-line no-console
  console.log('Review the evidence for EACH candidate (false positives happen — e.g. a photo-credit CC, a footer subscription) before adding a `License:` line.');
}

main();

// ---------------------------------------------------------------------------
// Follow-up (not yet implemented): registry enrichment for databases —
//   - re3data.org: GET /api/v1/repositories → match by homepage/name, then
//     /api/beta/repository/{id} for `dataLicense[].dataLicenseName`.
//   - Wikidata: SPARQL `?item wdt:P856 <homepage>; wdt:P275 ?license`.
// Both are authoritative but need fuzzy entity-matching + a human review pass.
// ---------------------------------------------------------------------------
