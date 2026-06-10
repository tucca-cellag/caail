---
name: zotero-to-caail-sync
description: Use when new papers, datasets, tools, or resources have been added to the caail Zotero group library and the CAAIL repo needs to be brought back in sync — or when auditing/reconciling CAAIL against Zotero.
---

# Syncing the caail Zotero library into CAAIL

## Overview

The caail Zotero group library (ID `6549203`) drifts ahead of this repo:
members stash items there faster than they land in the markdown files. This
skill reconciles the two. **The mechanical steps are scripted; the judgment
steps are not — and the judgment is where it goes wrong.**

`CLAUDE.md` is the schema source of truth (with `Datasets/CLAUDE.md` and
`ResearchAreas/CLAUDE.md` for the per-directory schemas). This skill is the
*workflow*; it does not restate schema rules — read `CLAUDE.md` for them.

This skill places a paper in the matrix *when it is added*. To re-audit matrix
placements already in `Papers.md` — and to add multi-category cross-listings
grounded in a paper's methods section — use the `matrix-classification-audit`
skill (Phase 4) and its `caail-classification-reviewer` subagent instead.

## Procedure

1. **Preconditions.** Zotero desktop running, Preferences → Advanced → "Allow
   other applications…" enabled, caail group synced locally.
2. **Run the diff script** — it paginates the whole library (it is >400 items,
   far past one API page), dedups within Zotero, and triages every item:
   ```bash
   python3 .claude/skills/zotero-to-caail-sync/zotero_diff.py
   ```
   `MISSING` = identifier and domain both absent (likely a real gap).
   `REVIEW` = the URL's domain is already in the repo (usually the same
   resource under a different link — confirm, do not assume).
3. **Verify every candidate by name**, not by the script's bucket. The script
   matches identifiers; it cannot know that `arxiv.org/abs/2410.23326` and
   `doi.org/10.48550/arXiv.2410.23326` are the same paper, or that a tool's
   homepage and its paper are one resource. Grep the repo for the tool/paper
   *name* before deciding.
4. **Classify** each genuine gap → target file (see rules below).
5. **Add** each item in its file's schema (per `CLAUDE.md`; for any entry in
   `Datasets/`, the per-page schema lives in `Datasets/CLAUDE.md`). For
   `Papers.md`, edit the matrix cell and the `## References` entry **in the
   same commit**.
6. **Verify every entry** with the dedicated reviewer subagents (see "Verify
   every entry before committing" below).
7. **Integrity check** (see below), then commit with the repo's
   conventional-commit scopes (`papers`, `software`, `data`, `databases`,
   `resources`).

## Classification rules

| Item | Goes to |
|---|---|
| Paper applying an AI/ML **method** to a cell-ag problem | `Papers.md` matrix + `## References` |
| Benchmark paper | `Papers.md` **and** the benchmark triangle — see below |
| Signed review / position / perspective paper | `Papers.md` `## Reviews & Perspectives` (no matrix cell) |
| Journal **editorial / news / News & Views** (e.g. Nature `d41586-` DOIs, usually unsigned) | `OtherResources.md` `## Editorials & Opinion` — **never** `Papers.md` |
| Software / model / framework (`computerProgram`, or a paper whose subject is a tool that is *not* an AI method) | `Software.md` |
| Vendor **documentation** webpage | fold as a link into the existing `Software.md` entry for that tool — no standalone entry |
| Train-on data artifact | the `Datasets/` directory — route to the matching species page, or to `HumanReference.md` / `CHOReference.md` / `Benchmarks.md` (see `Datasets/CLAUDE.md`) |
| Repository / ontology / registry / directory / "database" | `Databases.md` |
| Initiative / program / video / course | `OtherResources.md` |

**Benchmark triangle is mandatory** (`CLAUDE.md` "Benchmark placement"). A
benchmark gets a `Papers.md` ref **and** a `Datasets/Benchmarks.md` entry for its
data **and** a `Databases.md` entry if it has a live leaderboard. Even a
species-flavored benchmark (e.g. a hypothetical cattle-cell perturbation eval)
still lands in `Datasets/Benchmarks.md`, not its species page —
`Datasets/Benchmarks.md` is the canonical home for benchmark *data* regardless
of species. The `Datasets/Benchmarks.md` entry does **not** require its own
Zotero record — derive the canonical data home (HF dataset / GitHub) yourself.
Do not skip the triangle because "it is a general-CS benchmark" or "there is no
data record in Zotero."

A paper whose subject is a non-AI tool already catalogued in `Software.md`/
`Databases.md` (e.g. the MS-DIAL or COBRApy method paper) is **not** a
`Papers.md` gap — the tool is already represented. Leave it.

## Identifiers & citations — extract, never recall

Build every APA citation from the Zotero item's `creators` array, copied
**verbatim**. Do not reconstruct author initials from memory — that fabricates
citations (a real, observed failure). APA 21+-author rule: list the first 19
authors, then `…`, then the final author. Journal italic with `*…*`; DOI as a
full `https://doi.org/…` URL.

The same rule binds every **identifier** — DOIs, arXiv IDs, deposit accessions,
repo URLs: extract them from the source (the Zotero record, `Papers.md`, the
PDF), never type them from memory or hand-build a scan-input list of them. Any
URL written into the repo is **liveness-checked before commit** (`curl -sI` for
HTTP 200, or `gh repo view` for a GitHub repo).

## Verify every entry before committing

No new or changed entry is committed until a dedicated, **read-only** reviewer
subagent has audited it. This holds for **every** new or changed entry without
exception — including a one-line metadata addition, a `> **Code**:` blockquote,
or a single deposit-URL cross-reference. Inline verification (e.g. a Crossref
check in the same turn) does **not** substitute for dispatching the subagent.
The reviewers cannot edit — they only return `SUPPORTED` / `UNSUPPORTED` /
`CONTRADICTED` verdicts — and the agent that wrote an entry must never review
it. There are two tracks, and a benchmark goes through both (its `Papers.md`
ref and its `Datasets/Benchmarks.md` / `Databases.md` entries).

**Track 1 — `Papers.md` reference entries → `caail-citation-reviewer`.**
A bibliographic-fidelity check against the version of record (Crossref +
publisher): the title is the *article* title, not a benchmark/tool/project name;
the author list, order, and initials are correct; the APA 21+-author rule lands
on the genuine final author; year, venue, volume/issue/pages, and DOI all match;
any `> **Code**:` repo is the paper's real repository. This is a metadata check —
no source full text required.

**Track 2 — prose entries (`Datasets/`, `Databases.md`, `Software.md`,
`OtherResources.md`) → `caail-claim-reviewer`.**
Every factual claim — counts, sizes, dates, licences, "first / largest / only",
any statement of what a tool or method *does* — is checked against the **source
full text**. Get that full text first: for a paper, prefer the caail Zotero
library's locally indexed copy (`get_fulltext` / the Zotero local API) — raw
text, no `WebFetch` summarization layer, paywall-free; for tools / datasets /
webpages, fetch the canonical page, README, or dataset card in full. An abstract
or dataset-card blurb is not sufficient.

Dispatch the reviewer with the drafted entry text and the source URLs/DOIs, then
**revise until clean** — every flagged item corrected, softened to exactly what
the source supports, or deleted; re-review if anything changed materially.

Recalled facts — "running since 1994", "the first to…", a remembered version
number — are the highest-risk and the whole reason this step exists. A claim you
cannot ground is not "probably fine"; ground it or cut it.

## Same work, two DOIs

A work stashed as both an arXiv preprint and a published article has **two
different DOIs**, so the script cannot merge them — it reports both. Add the
work **once**, citing the peer-reviewed version; suppress the preprint.

## Integrity check (Papers.md)

- Every new reference ID appears in ≥1 matrix cell (or in Reviews & Perspectives).
- Every matrix `[…](#N)` anchor resolves to an existing `<a id="N">`.
- IDs are sequential from max+1; never renumber existing IDs.
- `grep -oE 'id="[0-9]+"' Papers.md | sort -nt'"' -k2` — no duplicates/gaps.

## Common mistakes

| Mistake | Reality |
|---|---|
| Querying `items/top?limit=100` once | The library is >400 items. Paginate, or the script does it for you. |
| Looking up an item with `q=<DOI>` | The local API's `q=` search does not reliably match DOIs — it returns spurious hits. Build a client-side DOI index by paginating the library (as `scope.py` / `audit.py` do) and match against that. |
| Hand-typing an identifier or committing an unchecked URL | Extract every DOI / arXiv ID / accession / repo URL from the source; liveness-check any URL (`curl -sI`, `gh repo view`) before commit. |
| Trusting the script's MISSING list as-is | It flags identifier mismatches as missing. Verify each by name. |
| Skipping the `Datasets/Benchmarks.md`/`Databases.md` side of a benchmark | The triangle is mandatory; "general-CS benchmark" is not an exemption. |
| Filing a Nature `d41586-` editorial in `Papers.md` Reviews | Editorials/news → `OtherResources.md` `## Editorials & Opinion`. |
| Writing author initials from memory | Copy `creators` verbatim from the Zotero record; `caail-citation-reviewer` checks them against the Crossref record. |
| Writing a count, date, or "first/largest" from memory | `caail-claim-reviewer` verifies every specific claim against source full text, or it is cut. |
| Verifying a claim against only the abstract or dataset card | Abstracts omit and misstate. `caail-claim-reviewer` verifies against full text. |
| Adding a reference without touching the matrix | Matrix + references change in one commit — the #1 CAAIL error. |
