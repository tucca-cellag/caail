---
name: caail-gap-analysis
description: Use when refreshing CAAIL against the published field — runs the multi-agent gap-analysis workflow, verifies candidates, resolves routing, and drafts a GitHub issue of candidate additions (papers, datasets, software, databases, other). The field-gap axis, complementary to the Zotero-sync lifecycle.
---

# CAAIL field-gap analysis

## Overview

The Zotero-sync lifecycle reconciles the repo against *our Zotero library*. This skill reconciles it
against *the published field*: it sweeps recent literature, datasets, software, and databases for resources
CAAIL is missing, and produces a GitHub issue of vetted candidate additions (the worked example is issue
[#32](https://github.com/tucca-cellag/caail/issues/32)).

**The discovery and verification are a saved Workflow; the judgment is this skill — and the judgment is where
it goes wrong.** The workflow only ever *proposes* matrix cells (its synthesizer agents never see the live
matrix), so the operator must confirm every routing claim against the real `Papers.md` before anything is
filed. `CLAUDE.md` is the schema source of truth; this skill is the workflow and does not restate it.

The executable lives at `.claude/workflows/caail-gap-analysis.js`. Finders read the live canonical files at
run time to build their own exclusion sets, so the workflow **auto-adapts as the repo grows** — there is no
baseline to maintain. A second agent adversarially verifies each candidate before it reaches the draft.

## Procedure

1. **Run the workflow.** From the repo root:
   ```
   Workflow({ name: 'caail-gap-analysis' })
   ```
   Optional `args` (defaults match the run that produced #32): `{ categories, maxCompletenessRounds: 2,
   recencyFloorYear: 2010, repoPath: '.' }`. It runs in the background (dozens of agents, ~3–6h wall-clock if
   the host sleeps); watch with `/workflows`. It returns `{ body, total, byCat, byTargetFile, kept }`.
2. **Write the draft.** Save the returned `body` to `gap-analysis-issue-draft.md` (a per-run scratch file —
   **not committed**).
3. **Flag-cleanup against the LIVE matrix (the core judgment step).** The draft will carry `FLAG:` notes such
   as "new matrix row needed" or "not a current column." **Most are false alarms** — the synthesizer only saw
   JSON. For each, read the actual `Papers.md` matrix header and decide:
   - If the row **and** column already exist → re-route the item to that existing cell; delete the flag. Note
     whether the cell is currently **empty** (high-leverage fill).
   - If a row/column genuinely does not exist → leave it as an explicit recommendation (add row linked to its
     Wikipedia article; a new column also needs a `ResearchAreas/*.md` page linked from the header).
4. **Resolve genuine judgment calls by reading the source, not the search summary** (per the verify-citations
   rule). The recurring two:
   - *Paper vs. review/perspective* → if it surveys the field, it goes in `Papers.md` `## Reviews & Perspectives`
     (no matrix cell); if it presents a method/tool, it takes a matrix cell. Open the article to decide.
   - *Which method row* → e.g. a "machine-learning pipeline" that is really Random Forest is **Ensemble
     Learning**, not Active Learning (no AL loop ≠ Active Learning). Read the methods.
5. **Recompute the summary tables** from the *rendered* checkboxes so the reported total cannot drift from
   what's actually listed (the workflow's `total` counts deduped candidates; synthesizers occasionally fold an
   item into prose). Count `- [ ]` items per H3 section and per target file; make both tables consistent.
6. **Spot-check a DOI sample.** Pick ~5 paper DOIs: confirm each resolves (Crossref/`doi.org`, metadata matches)
   **and** is absent from `Papers.md` (grep the DOI). Pick a few dataset accessions; confirm absent from the
   target species page.
7. **File the issue** (only after the user approves filing — it is outward-facing):
   ```
   gh issue create -R tucca-cellag/caail \
     --title "CAAIL field-gap analysis: <N> candidate additions (papers, datasets, software, databases)" \
     --body-file gap-analysis-issue-draft.md \
     --label enhancement --label documentation
   ```
   Then `gh issue view <n>` to confirm the body rendered with intact tables/checkboxes. The issue is a
   *shortlist for maintainers*; actual integration follows the schema (`zotero-to-caail-sync` rules:
   matrix anchor + reference entry in the **same commit**; IDs assigned at landing).

## Routing recap (so the draft files to the right place)

| Item | Target |
|---|---|
| Paper applying an AI/ML method to a cell-ag problem | `Papers.md` matrix cell + `## References` |
| Signed review / position / perspective | `Papers.md` `## Reviews & Perspectives` (no matrix cell) |
| Benchmark paper | the **benchmark triangle**: `Papers.md` ref + `Datasets/Benchmarks.md` data entry (+ `Databases.md` if it has a live leaderboard) |
| Open-source tool / model / framework | `Software.md` |
| Train-on data artifact | `Datasets/` (species page, or `HumanReference.md` / `CHOReference.md` / `Benchmarks.md`) |
| Repository / ontology / registry / directory / "database" | `Databases.md` |
| Course / book / initiative / editorial / awesome-list | `OtherResources.md` |
| Talk / lecture / learning playlist | `Talks.md` or `Primers/` |

## Known pitfalls

| Pitfall | Reality |
|---|---|
| Trusting a "needs a new matrix row/column" FLAG | The synthesizer never sees the live matrix. Check `Papers.md` — the row/column (e.g. Reinforcement Learning, Agent Infrastructure, AI Evaluation & Benchmarking) usually already exists; the item just fills an existing (often empty) cell. |
| `agentType: 'Explore'` on a schema'd `agent()` call | Explore + a forced StructuredOutput schema caused "completed without calling StructuredOutput" failures. The saved workflow uses the default workflow-subagent; keep it that way. |
| Host sleeps mid-run | A wave stalls (seen: `stalled after 21101s`). The workflow journals every step — resume with `Workflow({ scriptPath, resumeFromRunId })`; cached agents return instantly. Don't restart from scratch. |
| Reporting the workflow's `total` verbatim | It counts deduped candidates; synthesizers may render fewer checkboxes. Recompute from rendered `- [ ]` items so tables and total agree. |
| Verifying a paper from the search summary | WebSearch/WebFetch summaries hallucinate. Open the DOI/source for any type, method, or citation claim. |
| Filing without the matrix-coupling note | Integration must land the matrix anchor and the `## References` entry in one commit — the #1 CAAIL error. The issue should remind maintainers of this. |
| Filing autonomously | Filing is outward-facing; confirm with the user before `gh issue create`. The monthly cadence is a *reminder*, not an auto-run. |

## Relationship to the other CAAIL workflows

```
                        Zotero library  ──(repo↔Zotero axis)──►  zotero-collection-scope
                                                                  → zotero-to-caail-sync
                                                                  → papers-dataset-audit
  Published field  ──(field-gap axis)──►  caail-gap-analysis  ───────────────────────────►  GitHub issue of candidates
```

Same destination (a current, complete CAAIL), two different gap axes. This skill finds what the *field* has
that CAAIL lacks; the Zotero-sync skills reconcile what *our library* has that the repo lacks. Run this skill
on a periodic cadence (a monthly reminder); run the Zotero skills whenever the group library drifts ahead.
The two read-only reviewer agents (`caail-citation-reviewer`, `caail-claim-reviewer`) gate *integration-time*
entries; this skill's workflow does its own adversarial verification at *discovery* time.
