/**
 * emit.ts — SQLite -> canonical Markdown, authoring-time only (never in the deploy
 * build). Each emitter is a BLOCK SPLICE: it parses the original file, regenerates
 * only the DB-owned structured blocks (matrix table + reference entries; catalog H3
 * entries; dataset inventory tables) and copies every other block (H1, intros,
 * `## Category definitions`, `> Note` blockquotes, narrative sections, `## Further
 * reading`) through verbatim from source. So editorial prose is preserved and only
 * the structured catalog is regenerated.
 *
 * Fidelity bar is the parser's JSON output, not byte-identity — the regenerated
 * Markdown may reflow whitespace, but re-parsing it must yield identical models
 * (verified in verify.ts). Stable anchors (<a id>, matrix [..](#N), Taxonomy header
 * links) are preserved because they are stored/sliced verbatim.
 */

import { readFileSync } from 'node:fs';
import { parseMarkdown } from '../parser/markdown.js';
import { inlineMd, extractInventory } from './extract.js';
import type { Db } from './lib.js';

// A NUL delimiter for the matrix cell-map key, so a method label ending in a space can
// never collide with a `${method}<sep>${area_key}` from a different pair (labels/keys
// never contain NUL). Written as the \x00 escape so the source stays text-diffable.
const sliceKey = '\x00';

// --- Papers.md -------------------------------------------------------------

/** The GFM matrix table, headers preserved verbatim (Taxonomy links intact). */
export function emitMatrixTable(db: Db): string {
  const areas = db.prepare('SELECT key,header_md FROM areas ORDER BY ordinal').all() as
    { key: string; header_md: string }[];
  const methods = db.prepare('SELECT label,header_md FROM methods ORDER BY ordinal').all() as
    { label: string; header_md: string }[];
  const cells = db.prepare('SELECT method,area_key,ref_id,label FROM matrix_cells ORDER BY ordinal').all() as
    { method: string; area_key: string; ref_id: number; label: string }[];

  const cellMap = new Map<string, { ref_id: number; label: string }[]>();
  for (const c of cells) {
    const k = `${c.method}${sliceKey}${c.area_key}`;
    (cellMap.get(k) ?? cellMap.set(k, []).get(k)!).push(c);
  }

  const lines: string[] = [];
  lines.push(`| | ${areas.map((a) => a.header_md).join(' | ')} |`);
  lines.push(`|${'---|'.repeat(areas.length + 1)}`);
  for (const m of methods) {
    const row = areas.map((a) => {
      const arr = cellMap.get(`${m.label}${sliceKey}${a.key}`);
      return arr ? arr.map((c) => `[${c.label}](#${c.ref_id})`).join('<br>') : '';
    });
    lines.push(`| ${m.header_md} | ${row.join(' | ')} |`);
  }
  return lines.join('\n');
}

/** All reference entries for one `## <section>`, blank-line separated (raw + its verbatim
 *  trailing blockquote run — Code/Data/Models/any label — so every blockquote stays
 *  attached to its own citation regardless of insertions elsewhere in the section). */
function emitSectionRefs(db: Db, section: string): string {
  const rows = db.prepare(
    'SELECT raw,blockquotes_md FROM papers WHERE section=? ORDER BY ordinal',
  ).all(section) as { raw: string; blockquotes_md: string | null }[];
  const parts: string[] = [];
  for (const p of rows) {
    parts.push(p.raw);
    if (p.blockquotes_md) parts.push(p.blockquotes_md);
  }
  return parts.join('\n\n');
}

export function emitPapersFile(db: Db, srcPath: string): string {
  const src = readFileSync(srcPath, 'utf-8');
  const blocks = parseMarkdown(src).children as any[];
  const sliceOf = (b: any) => src.slice(b.position.start.offset, b.position.end.offset);
  // Whitespace-tolerant, to match the real parser's ANCHOR_OPEN_RE (so `<a  id="5">`
  // isn't emitted twice — once from the DB bulk, once via the verbatim fallback).
  const isRefPara = (b: any) => b.type === 'paragraph' && /^<a\s+id="\d+">/.test(sliceOf(b));

  const out: string[] = [];
  let matrixDone = false;
  let currentSection = '';
  const emitted = new Set<string>();

  for (let i = 0; i < blocks.length; ) {
    const b = blocks[i];
    if (!matrixDone && b.type === 'table') { out.push(emitMatrixTable(db)); matrixDone = true; i++; continue; }
    if (b.type === 'heading' && b.depth === 2) { currentSection = inlineMd(b).trim(); out.push(sliceOf(b)); i++; continue; }
    if (isRefPara(b)) {
      if (!emitted.has(currentSection)) { out.push(emitSectionRefs(db, currentSection)); emitted.add(currentSection); }
      i++;
      // Every blockquote trailing a citation is DB-owned (captured in blockquotes_md and
      // re-emitted in the bulk above), so skip the whole run — not just Code/Data.
      while (i < blocks.length && blocks[i].type === 'blockquote') i++;
      continue;
    }
    out.push(sliceOf(b)); i++;
  }
  // A section-emit only fires on an existing `<a id>` paragraph in the SOURCE, so a paper
  // assigned to a section with no citation in the file today would be silently dropped.
  // Fail loudly instead (db:add validates the section upstream; this is the backstop).
  const dbSections = db.prepare('SELECT DISTINCT section FROM papers').all() as { section: string }[];
  const missing = dbSections.map((s) => s.section).filter((s) => !emitted.has(s));
  if (missing.length) {
    throw new Error(
      `emitPapersFile: ${missing.length} paper section(s) have no anchor in ${srcPath} and ` +
        `would be dropped: ${missing.join(', ')}. Add the section heading + a reference to Papers.md first.`,
    );
  }
  return out.join('\n\n') + '\n';
}

// --- Software.md / Databases.md --------------------------------------------

export function emitCatalogFile(db: Db, srcPath: string, type: 'software' | 'database'): string {
  const src = readFileSync(srcPath, 'utf-8');
  const blocks = parseMarkdown(src).children as any[];
  const sliceOf = (b: any) => src.slice(b.position.start.offset, b.position.end.offset);
  const isEntry = (b: any) => b.type === 'heading' && b.depth === 3 && (b.children as any[]).some((c) => c.type === 'link');

  // Preserve, per group, the H2 heading + its intro prose (blocks between the H2 and
  // the first entry). Entries themselves come from the DB, so add/remove/reorder work.
  const preamble: string[] = [];
  const groupMeta = new Map<string, { heading: string; intro: string[] }>();
  let cur: string | null = null;
  let sawEntry = false;
  for (const b of blocks) {
    if (b.type === 'heading' && b.depth === 2) {
      cur = inlineMd(b).trim();
      groupMeta.set(cur, { heading: sliceOf(b), intro: [] });
      sawEntry = false;
      continue;
    }
    if (cur === null) { preamble.push(sliceOf(b)); continue; } // before the first group
    if (isEntry(b)) { sawEntry = true; continue; }             // entries are DB-owned
    if (!sawEntry) groupMeta.get(cur)!.intro.push(sliceOf(b));  // group intro prose
  }

  const entries = db.prepare(
    'SELECT heading_md,body_md,grp FROM catalog WHERE item_id IN (SELECT id FROM items WHERE type=?) ORDER BY ordinal',
  ).all(type) as { heading_md: string; body_md: string; grp: string }[];
  const byGroup = new Map<string, typeof entries>();
  const order: string[] = [];
  for (const e of entries) {
    if (!byGroup.has(e.grp)) { byGroup.set(e.grp, []); order.push(e.grp); }
    byGroup.get(e.grp)!.push(e);
  }

  const out = [...preamble];
  const emitGroup = (grp: string) => {
    const meta = groupMeta.get(grp) ?? { heading: `## ${grp}`, intro: [] };
    out.push(meta.heading, ...meta.intro);
    for (const e of byGroup.get(grp) ?? []) out.push(`### ${e.heading_md}` + (e.body_md ? `\n\n${e.body_md}` : ''));
  };
  // Source groups first, in document order — so a group emptied by a removal keeps its
  // H2 heading + intro prose (dropping them would be silent data loss). Then any groups
  // that exist only in the DB (newly added), in first-appearance order.
  for (const grp of groupMeta.keys()) emitGroup(grp);
  for (const grp of order) if (!groupMeta.has(grp)) emitGroup(grp);
  return out.join('\n\n') + '\n';
}

// --- Datasets/<page>.md ----------------------------------------------------

/**
 * Regenerate the DB-owned structured regions of a `Datasets/<page>.md` page — the
 * `## Complete data inventory` table AND the curated `### …` entries (featured
 * atlases / GEMs / reference entries) — from the DB, splicing every narrative block
 * through verbatim. Entries use stored `heading_md` (raw H3, GNPS fidelity lesson)
 * + `body_md`, consumed in document order (== seed ordinal order).
 */
export function emitDatasetPage(db: Db, srcPath: string, page: string): string {
  const src = readFileSync(srcPath, 'utf-8');
  const blocks = parseMarkdown(src).children as any[];
  const sliceOf = (b: any) => src.slice(b.position.start.offset, b.position.end.offset);
  const inv = extractInventory(srcPath);
  const rows = db.prepare('SELECT cells_json FROM dataset_rows WHERE page=? ORDER BY ordinal').all(page) as
    { cells_json: string }[];
  const entries = db.prepare('SELECT heading_md,body_md FROM dataset_entries WHERE page=? ORDER BY ordinal').all(page) as
    { heading_md: string; body_md: string }[];

  const out: string[] = [];
  let section = '';
  let invEmitted = false; // only the FIRST table in the inventory section is DB-owned
  let entryIdx = 0;
  for (let i = 0; i < blocks.length; ) {
    const b = blocks[i];
    if (b.type === 'heading' && b.depth === 2) { section = inlineMd(b).trim(); out.push(sliceOf(b)); i++; continue; }
    // A curated dataset entry (any H3 outside the inventory section) — DB-owned.
    if (b.type === 'heading' && b.depth === 3 && section !== 'Complete data inventory') {
      const e = entries[entryIdx++];
      if (!e) { out.push(sliceOf(b)); i++; continue; } // more H3s than DB entries: leave verbatim
      out.push(`### ${e.heading_md}` + (e.body_md ? `\n\n${e.body_md}` : ''));
      i++;
      // Skip the DB-owned body blocks up to the next H2/H3. Nested H4+ sub-sections are part
      // of THIS entry's body_md (extract captures them), so they must be skipped here too —
      // stopping at any heading would re-emit the H4 slice on the next loop turn (double-emit).
      while (i < blocks.length && !(blocks[i].type === 'heading' && blocks[i].depth <= 3)) i++;
      continue;
    }
    if (b.type === 'table' && section === 'Complete data inventory' && inv && !invEmitted) {
      invEmitted = true;
      const header = inv.header;
      const lines = [`| ${header.join(' | ')} |`, `|${'---|'.repeat(header.length)}`];
      for (const r of rows) lines.push(`| ${(JSON.parse(r.cells_json) as string[]).join(' | ')} |`);
      out.push(lines.join('\n'));
      i++;
      continue;
    }
    out.push(sliceOf(b)); i++;
  }
  return out.join('\n\n') + '\n';
}
