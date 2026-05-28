---
name: papers-dataset-audit
description: Use when checking whether papers already cited in Papers.md have deposit accessions, code repos, or companion data that are NOT yet inventoried in Datasets/ (or cross-referenced from Software.md / Databases.md). Parses Papers.md, looks up each ref in the Zotero local API, extracts accession patterns from the PDF's Data-Availability section, and reports ORPHANs that need human review before integration. Phase 3 of the Zotero workflow — sibling to `zotero-collection-scope` (Phase 1) and `zotero-to-caail-sync` (Phase 2).
---

# Auditing Papers.md for missing dataset entries

## Overview

This skill answers *"of the papers I'm already citing, which ones mention a deposit accession or companion data I haven't catalogued?"*. The full sync workflow has three phases:

```
Phase 1: zotero-collection-scope   (what's in this Zotero collection?)
Phase 2: zotero-to-caail-sync      (how do I integrate identified gaps?)
Phase 3: papers-dataset-audit      (do papers I already cite have datasets I missed?)
```

`papers-dataset-audit` is Phase 3. It complements scope/sync by catching the case where a paper is correctly in `Papers.md` but its referenced deposit accession (GEO `GSE…`, SRA `PRJNA…`, NGDC `CRA…`, Synapse `syn…`, Zenodo, Figshare, a GitHub code release, etc.) was never cross-referenced from a `Datasets/` / `Software.md` / `Databases.md` entry.

The output is a Markdown report (or JSON, with `--json`) classifying each ref as:

- **`ORPHAN`** — paper has a deposit/repo URL the CAAIL repo does NOT cite
- **`MATCHED`** — paper has deposit/repo URL(s) and at least one is already cited in the repo
- **`NO_DATA`** — paper PDF has no accession pattern or repo URL — typically a review, methodology, or commentary
- **`NO_PDF`** — Zotero record found but no PDF/ft-cache is available yet (open the paper in Zotero to trigger indexing)
- **`NO_ZOTERO`** — paper not located in either Zotero library (the Zotero index couldn't match the DOI or arXiv ID)

Each ORPHAN block lists the accessions / URLs that triggered the orphan plus, if applicable, the in-repo matches that DID resolve — so the reviewer can quickly judge "is this a real gap or just a method paper analyzing public data?"

## When to use

- After a sync pass adds new `Papers.md` refs (e.g. at the end of a `zotero-to-caail-sync` flow), to confirm no companion data was missed.
- Before declaring a PR ready, as a structural QA pass.
- Periodically (monthly?) to detect drift — papers added with code blockquotes get cited, but their underlying data deposits sometimes don't get followed up.
- Whenever a reviewer suspects "we cite X but don't actually have its data."

## Procedure

1. **Preconditions.** Zotero desktop running, Preferences → Advanced → "Allow other applications…" enabled, both relevant group libraries (caail `6549203`, Benji's `5178481` by default) synced locally with PDFs attached.

2. **Run the audit:**

   ```bash
   python3 .claude/skills/papers-dataset-audit/audit.py
   ```

   Add `--refs 187,170,171` to audit a subset, `--json` for machine-readable output, `--include-low-confidence` to surface accessions found outside the Data-Availability section (noisier, but catches papers whose deposit pointers live elsewhere).

3. **Read the ORPHAN section** top-down. For each ORPHAN:
   - Is this a deposit the paper itself created (real gap) or a prior dataset the paper re-analyzes (noise)? Open the PDF's Data Availability section in Zotero to disambiguate.
   - If it's a real gap, classify the right target file: `Datasets/<species>.md` for a species-scoped deposit, `Datasets/CHOReference.md` / `Datasets/HumanReference.md` / `Datasets/CrossSpecies.md` for reference substrate, `Software.md` for a code release, `Databases.md` for a queryable portal.
   - Hand off the gap to `zotero-to-caail-sync` Phase 2 for drafting + claim-reviewer-gated commit.

4. **Don't action ORPHANs without reviewer review.** The audit is a discovery tool — every drafted entry still needs the standard reviewer-subagent verification per `zotero-to-caail-sync`.

## What audit.py does (one-paragraph summary)

Parse `Papers.md` for every `<a id="N">N</a>` anchor and its DOI / arXiv ID. Index both Zotero libraries by DOI + arXiv-ID + normalized-title. For each ref, locate the Zotero record, find the attached PDF and `.zotero-ft-cache`, run a regex sweep for ~30 accession patterns (GEO, SRA, BioProject, BioSample, ArrayExpress, PRIDE, MetaboLights, MassIVE, NGDC GSA/GVM/OMIX, Synapse, Zenodo, Figshare, OSF, GitHub, GitLab, Bitbucket, HuggingFace, PDB, KEGG). Classify each hit by proximity to a Data-Availability heading. For each high-confidence hit, grep the concatenated repo markdown — if the accession appears anywhere, mark MATCHED; otherwise ORPHAN. Emit a Markdown or JSON report.

## Output structure

```text
# Papers.md → Datasets/ audit report

**Refs audited:** <N>
**Zotero groups searched:** [<id1>, <id2>]

| Status | Count | Meaning |
| ORPHAN | … | … |
| MATCHED | … | … |
| NO_DATA | … | … |
| NO_PDF | … | … |
| NO_ZOTERO | … | … |

## ORPHANs (action items)
### #<ref> (DOI `<doi>`)
- **<accession-type>**: `<accession>`
_Also matched in-repo:_ <accessions that DID resolve>

## NO_ZOTERO / NO_PDF / MATCHED (sanity tables)
```

## Known pitfalls

| Pitfall | Reality |
|---|---|
| Integration / foundation-model papers flag many GEO accessions that aren't new deposits. | These papers cite dozens of prior public datasets to demonstrate batch integration or pretraining scope. The Data-Availability window catches some, but if the paper's DA section is written as "we re-analyzed GSE…, GSE…, GSE…" the audit will flag them as orphans even though they're not new data. Human reviewer must disambiguate. |
| GitHub URLs to "publications" / "articles" repos. | Some publisher templates contain spurious `github.com/articles…` patterns. The script filters obvious noise patterns but if a paper references many tangential repos, expect some false positives. |
| BioProject `PRJNA…` IDs cited as prior-work data are flagged. | Same shape as the GEO problem above. The DA-section heuristic helps but isn't perfect. |
| arXiv preprints with the same paper as their published-VoR sibling. | If a preprint is in Zotero with one DOI and its peer-reviewed version is in `Papers.md` with another, the audit's Zotero lookup may go to the preprint (which often has different supplementary structure). Cross-check the DOI of the located Zotero record. |
| Some Zotero records lack a populated `.zotero-ft-cache` (recently added PDFs). | Open the paper once in Zotero to trigger full-text indexing, or run the script after a sync. Affected refs show `NO_PDF` even though a PDF is attached. |
| Tool repos already in `Software.md` may appear as orphans. | A `> **Code**:` blockquote in `Papers.md` doesn't count as a `Datasets/` cross-reference; the audit specifically reports the case where the deposit URL appears nowhere in the entire repo corpus. If you see a GitHub URL flagged but recognize it as already-in-Software.md, the audit's actually right: the *specific URL string* isn't in any file. Either add it to the relevant `Software.md` / `Datasets/` entry or accept the orphan as informational. |
| Zenodo deposits frequently associated with code repos may double-flag. | A `github.com/X/Y` + `10.5281/zenodo.NNNN` pair is common — the Zenodo deposit is often the code-release archive. Both are valid CAAIL data points but one entry can cover both. |

## CLI reference

```text
usage: audit.py [--papers PATH] [--repo PATH] [--zotero-storage PATH]
                [--api URL] [--groups CSV] [--refs CSV] [--json]
                [--include-low-confidence]

required: none — defaults assume CAAIL repo layout

optional:
  --papers PATH                Path to Papers.md (default: <repo>/Papers.md)
  --repo PATH                  CAAIL repo root (default: 3 levels up from script)
  --zotero-storage PATH        Zotero/storage path for PDF ft-caches
                               (default: ~/Zotero/storage)
  --api URL                    Local Zotero API base URL
                               (default: http://localhost:23119/api)
  --groups CSV                 Zotero group IDs to search, in order
                               (default: 6549203,5178481)
  --refs CSV                   Audit only this comma-separated list of ref IDs
  --json                       Emit JSON instead of Markdown
  --include-low-confidence     Also report accessions outside the Data-
                               Availability window (default: only DA-window hits)
```

## Example invocation

Audit the entire Papers.md (193 refs at time of writing):

```bash
python3 .claude/skills/papers-dataset-audit/audit.py > /tmp/audit-report.md
```

Audit a subset:

```bash
python3 .claude/skills/papers-dataset-audit/audit.py --refs 187,170,171,135,136
```

Audit one ref and emit JSON for downstream tooling:

```bash
python3 .claude/skills/papers-dataset-audit/audit.py --refs 187 --json
```

Expected order-of-magnitude output (verified by dogfood May 2026 against 193 refs):

- ~70 MATCHED (deposit URLs already cited somewhere in the repo)
- ~40 ORPHAN (deposits flagged for human triage)
- ~70 NO_DATA (reviews, methodology overviews, perspective papers)
- ~10 NO_PDF (PDF attached but ft-cache not yet built)
- ~1 NO_ZOTERO (citations without DOI / arXiv ID that can't be auto-located)

## Relationship to the other Zotero-workflow skills

```
+---------------------------------+    +-----------------------------------+    +-----------------------------------+
| zotero-collection-scope         | -> | zotero-to-caail-sync              | -> | papers-dataset-audit              |
| (Phase 1: enumeration)          |    | (Phase 2: classification + draft  |    | (Phase 3: reverse audit of        |
|                                 |    |  + reviewer + commit)             |    |  Papers.md ↔ Datasets/ coverage)  |
| - Recursive collection walk     |    | - Per-gap classification          |    | - Parse Papers.md refs            |
| - Per-item evidence pull        |    | - Verbatim citation from Zotero   |    | - Pull DA-section accessions      |
| - 3-way repo cross-reference    |    | - caail-citation-reviewer agent   |    | - Grep repo for each accession    |
| - GAP / IN_REPO / NO_DOI report |    | - caail-claim-reviewer agent      |    | - ORPHAN / MATCHED / NO_DATA      |
+---------------------------------+    | - Scoped commit per stage         |    +-----------------------------------+
                                       +-----------------------------------+
```

Each phase can run standalone; together they cover the discovery → integration → coverage-verification lifecycle.
