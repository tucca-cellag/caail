---
name: matrix-classification-audit
description: Use when re-auditing or revising the Papers.md matrix itself — verifying that papers already in the matrix sit in defensible (AI method × research area) cells, and adding multi-category placements where a paper substantively applies more than one method or spans more than one area. Phase 4 of the Zotero⇄CAAIL lifecycle (after scope → sync → dataset-audit). Grounds every placement in the paper's methods section via the caail Zotero library, and gates each change through the read-only caail-classification-reviewer.
---

# Auditing the Papers.md matrix classification

## What this is for

The forward-ingest workflow (`zotero-to-caail-sync`) places a paper in the
matrix *when it is added*. Nothing re-checks those placements against the paper's
**methods**, and nothing systematically asks "does this paper also belong in
another cell?" This skill closes that gap: it adversarially re-audits matrix
placements and adds warranted **multi-category** cross-listings.

`CLAUDE.md` is the schema source of truth (matrix rules, ID stability, the
matrix↔references invariants). This skill is the *workflow*; it restates no
schema — read `CLAUDE.md`. The companion reviewer is
`.claude/agents/caail-classification-reviewer.md` (read-only, methods-grounded —
distinct from `caail-citation-reviewer`, which only checks bibliography).

**Scope discipline.** This is a *classification* pass. It edits matrix cells
only. It does **not** touch `## References` citation text (author/title/DOI fixes
are `caail-citation-reviewer`'s job) and it never renumbers IDs.

**Asymmetric burden.** Removing a *correct* entry is worse than leaving a
debatable one. A **scope**-based removal / area-move / NOT-PRIMARY must therefore
clear a higher bar than an additive placement. The hardening that enforces this:

- Every decision is grounded in the **paper's own text** measured against the
  `Taxonomy.md` row/column definitions — **never** an "is this paper cited in the
  area page?" signal. The `ResearchAreas/*.md` pages are AI-assisted and stale, so
  that signal is untrusted; the corpus no longer carries it.
- Every reviewer verdict is tagged `nature: method-accuracy | scope`.
  **method-accuracy** ("the paper doesn't use this technique") is factual and
  needs only skeptics. **scope** ("not cell-ag enough") additionally must defeat
  an independent **steelman defender** (which reads the paper + the `Taxonomy.md`
  column definition + the philosophy), and, only if still unresolved, a **gated
  domain-relevance** web check. Ties go to KEEP.
- A general-purpose method with no specific cell-ag application is a **MOVE to
  `AI Tooling / Methodology`, not a removal**. Removal/NOT-PRIMARY is reserved for
  papers with **no plausible cell-ag connection at all**.

**Taxonomy gaps (the missing-row/column case).** Sometimes a paper *is*
legitimate cell-ag research applying a real AI/ML method, but its genuine method
or area has **no matching row/column** — e.g. a Bayesian-*inference* paper when
the matrix only has Bayesian *Optimization*, or a classical network-propagation
paper when the only graph row is the neural **GNN**. Forcing a binary (keep a
wrong row, or remove → orphan) is the wrong move. The reviewer instead emits a
**non-destructive `taxonomy_gap`** verdict, which is the **last resort in the
precedence ladder** — only after (1) drop-the-wrong-cell-keep-via-another and
(2) re-row into an *existing* label both fail:

- A `taxonomy_gap` **keeps the paper's current cell** as an approximation and
  records the unrepresented `axis` (method|area), `proposed_label`,
  `closest_existing` + why it is genuinely insufficient, the methods `span`, and
  a `proposed_definition` (a `Taxonomy.md`-style definition of the new row/area).
  It **never** routes to a removal
  — guaranteed by construction, since gaps never enter the adjudicated change set.
- A final **Taxonomy phase** pools all gaps, a synthesis agent clusters them by
  normalized label, and each cluster of **≥2 papers** is adversarially verified
  ("does an existing row/area already fit? is this a real, recurring category?")
  before it becomes a `proposed_new_rows` / `proposed_new_columns` entry.
  Single-paper gaps are **parked** as `singletons` (keep as-is, revisit when more
  appear). Clustering is only meaningful corpus-wide. In the **cost-efficient run
  path** (below) the *skim* is the corpus-wide pass: it flags every `taxonomy_gap`
  suspect across all 136 refs (liberally), so a **single, un-chunked** gate
  invocation over the flagged subset still sees both members of any real pair and
  clusters them. Chunking the gate by id-range would split a pair across
  invocations and silently lose the cluster — so **don't chunk**. If you doubt the
  skim's gap recall, fall back to the full-corpus gate (omit `_audit_ids.json`),
  which clusters over every ref directly.
- New rows/columns are **never auto-applied** — they are curator-level structural
  changes. A new **row** and a new **column** each need a `Taxonomy.md` definition
  + a matrix header link to it (per
  `CLAUDE.md`). Surface `proposed_new_rows` / `proposed_new_columns` for human
  decision alongside `kept_by_review`.

## Cost-efficient run path (default): batched skim over all → verified gate on flags

Running the full adversarial Workflow over every matrix ref is the **expensive
path of last resort** — it spawns one proposer agent per paper (×136, each
carrying the full reviewer contract) plus skeptics, and burns millions of tokens
re-confirming obviously-correct placements (it exhausted usage mid-run once). The
default is a **cost cascade**: a cheap batched **triage skim** reads every paper
and selects only the ambiguous ones; the verified gate (the Procedure below) then
judges that small flagged subset.

The dominant cost of the full run is the *proposer pass* (136 agents); skeptics /
defender / taxonomy fire only on real proposed changes. The skim replaces the
136-proposer pass with ~12 batched calls, so a false flag costs only **one** gate
proposer. The skim **only selects** which papers reach the gate — it never decides
a change, and its output never enters a gate prompt (the gate proposer re-derives
every verdict independently). It needs only **recall**: a false flag is cheap, a
missed flag is an unaudited wrong placement. So it errs toward flagging.

### Run path

1. **Extract the corpus** (Procedure step 2) so every `matrix-corpus/ref-<id>.json` exists.
1b. **Deterministic pre-filter (free, optional but recommended).** Run
   `prefilter_corpus.py` — a stdlib, zero-token layer that auto-clears the
   lexically-obvious placements (classical-ML and benchmark cells whose method
   alias appears in the paper text, with no trap and a text-corroborated area) and
   emits the **residual** (everything else, incl. all Deep-Learning / agent /
   foundation-model rows, which it never auto-clears). LLM-skim only that residual,
   cutting skim cost. It fails toward the LLM on any uncertainty, and
   `--validate` proves zero correction-leak against a prior skim. Grounded solely
   in the paper's own text — it reads no area-page signal.
2. **No-fulltext pre-pass.** Read each `has_fulltext:false` ref in the main loop
   and decide keep-vs-flag from the abstract: flag `needs_fulltext` **only** when
   the abstract cannot substantiate the current cell's method. A flagged
   no-fulltext paper routes to the gate (which may fetch full text — rate-limited,
   lower-confidence); don't blanket-flag all of them.
3. **Batched skim.** ~12 `Agent` calls (Sonnet), each given ~10–12 contiguous ids,
   reading those ref files and emitting the **pinned schema** below. Write each
   batch to `matrix-corpus/_skim/batch-NN.json`. Keep batches ~10 so per-paper
   attention stays real.
4. **Glue → bootstrap file.** Run the committed glue (stdlib, zero tokens) — it
   validates the batches, dedupes flagged ids (flag is sticky), **verifies every
   ref was skimmed** (an un-skimmed ref is a loud MISSING, not a silent keep), and
   writes `matrix-corpus/_audit_ids.json` as `{"ids":[…]}` (**ids only**; reasons +
   `suggested_dest` go to `_skim_report.json` for the human, never the gate):
   ```bash
   python3 .claude/skills/matrix-classification-audit/skim_to_audit_ids.py
   ```
   It prints the flag count + a floor agent estimate and warns when the flag set
   exceeds the abort ceiling (default 60). **If it exceeds the ceiling, stop and
   tighten the rubric — do not launch the gate** (over-flagging means the skim
   failed; escalating it to a near-full-corpus gate is the cost-failure mode).
5. **Gate on flags, ONE invocation.** Run the Procedure Workflow over the flagged
   subset (it bootstraps from `_audit_ids.json`, workflow line 40). **Never chunk
   by id-range** (see the taxonomy note above — chunking loses gap clusters).

### Skim rubric (recall-biased; tighten *here* when a recall test fails)

Read each `ref-<id>.json` (`citation`, `current_cells`, `abstract`,
`methods_text`, `has_fulltext`) and judge against the `Taxonomy.md` definitions —
never an area-page citation signal. **You are not the
judge** — the downstream gate decides; when a placement is *genuinely debatable*,
**flag it** (route to the gate) rather than reasoning your way to `keep`. Apply in
order:

1. **Known method-family traps (highest priority — these have a lexical tell).**
   Flag `taxonomy_gap` + `wrong_method` when a paper sits in:
   - **Bayesian Optimization** but the methods read as Bayesian *inference*
     (posterior estimation, MCMC, Bayesian networks) — not sequential
     acquisition-function optimization;
   - **GNN** but the methods read as classical graph / network-propagation /
     random-walk methods on a non-learned graph — not a trained graph neural net;
   - **Deep Learning** but the methods read as non-neural (interactome / network
     models, classical ML, statistics);
   - any **Foundation Models** row but the paper is a *task-specific / supervised*
     model that merely performs that row's task (e.g. perturbation prediction)
     rather than a large-scale **pretrained, transferable** foundation model — the
     FM rows require the paper to *be* a foundation model, not just share its task
     (e.g. GEARS is a supervised GNN, not an FM).
2. **Curatorial-cell guard.** If any current cell is in a curatorial/grouping row
   — Benchmarks & Evaluation Frameworks, Domain-Specific / General-Purpose
   Biomedical Agents, Agent Infrastructure, Scientific Literature & Discovery
   Agents, Robot Scientists & Lab Automation, Chemistry / Synthesis Agents, or any
   Foundation Models row — and the paper reads as a *general framework/methodology*
   with no concrete cell-ag application, flag (`wrong_area_scope` / `taxonomy_gap`).
   Bias toward flagging: a single pass is least certain on these rows.
3. **Method-name mismatch.** If the methods/abstract name a technique matching no
   current method row for this paper, flag `wrong_method` (or `taxonomy_gap` if no
   existing row is a clean home).
4. **Missing cell.** If the paper substantively applies a second method or spans a
   second area not currently represented, flag `missing_cell`.
5. **Not primary.** If the paper is a review/perspective placed as primary
   research, flag `not_primary`.
6. **Otherwise `keep`** — every current cell's method is the paper's substantive
   technique and every area is defensible.

### Pinned skim output schema (one object per paper; the glue parses exactly this)

```json
{"id": 60, "verdict": "flag",
 "issue_types": ["taxonomy_gap", "wrong_method"],
 "reason": "interactome / network-propagation model, not a neural net",
 "suggested_dest": "(optional) Network Propagation × Cellular Engineering"}
```

- `verdict`: `"keep"` | `"flag"`; `issue_types ⊆ {wrong_method, wrong_area_scope,
  missing_cell, taxonomy_gap, not_primary, needs_fulltext}`, non-empty iff `flag`.
- `suggested_dest` is optional and for the human report **only** — the glue strips
  it from `_audit_ids.json`, so it never reaches the gate proposer (preserving
  proposer independence).

## Procedure

The verified gate both run paths share. (In the cost-efficient path, step 2 is
already done and step 3 runs over the `_audit_ids.json` flag subset.)

1. **Preconditions.** Zotero desktop running, Preferences → Advanced → "Allow
   other applications…" enabled, caail group (`6549203`) synced locally. Papers'
   PDFs full-text-indexed (so `.zotero-ft-cache` files exist).

2. **Extract the corpus** — pre-pull each matrix ref's methods text so the
   adversarial review is deterministic and resumable:
   ```bash
   python3 .claude/skills/matrix-classification-audit/extract_matrix_corpus.py
   ```
   Writes `matrix-corpus.json` + per-ref `matrix-corpus/ref-<id>.json` (gitignored):
   per matrix-participating ref, its `id`, `doi`, `title`, `citation`,
   `current_cells`, `abstract`, `methods_text`, and `has_fulltext` — grounded
   solely in the paper's own text (no signal from the ResearchAreas pages). Refs with no indexed PDF
   come through `has_fulltext: false` — reviewed from abstract + literature APIs at
   lower confidence (never a basis for a scope removal), not skipped.

3. **Adversarial classification (named Workflow).** The hardened pipeline lives in
   `.claude/workflows/matrix-classification-audit.js`. Build its `args` from the
   corpus and invoke by name:
   ```js
   // args = { dir: "<abs>/matrix-corpus", ids: [...matrix ids...],
   //          methods: [...exact row labels...], areas: [...exact column labels...] }
   Workflow({ name: 'matrix-classification-audit', args })
   ```
   (Build `args` from `matrix-corpus.json`: `dir` = abspath of the per-ref dir,
   `ids` = the ref ids to audit, `methods`/`areas` = the distinct labels.) Phases:
   - **Propose** — each paper reviewed by an agent that *reads the
     `caail-classification-reviewer` contract* and the ref record; returns
     keep/unsupported/misplaced/missing/not_primary, each scope/method tagged.
   - **Verify** — 3 independent skeptics per change (majority non-refute to
     survive). Sufficient for additive + `method-accuracy` changes.
   - **Defend** *(scope removals only)* — an independent steelman reads the
     `ResearchAreas/<Area>.md` page + philosophy and argues to KEEP; the removal
     survives only if it `can_keep:false`.
   - **Ground** *(gated)* — only when the defender can't decide and the call hinges
     on real-world relevance: a web-research agent scores relevance 1–5 (≥3 → keep).
   - **Taxonomy** *(non-destructive)* — pools the `taxonomy_gap`s, clusters them
     (synthesis agent), and adversarially verifies each ≥2-paper cluster into a
     proposed new row/column. Bypasses skeptics/defender entirely — gaps keep the
     paper, never remove it.

   The workflow returns `{summary, applied, kept_by_review, taxonomy, per_ref}`:
   `applied` = changes that survived (additive adds, method-accuracy fixes, and any
   scope removal that beat the defender+domain); `kept_by_review` = scope proposals
   the steelman overturned (with the deciding layer); `taxonomy` =
   `{proposed_new_rows, proposed_new_columns, singletons}` for curator decision.
   Be conservative: scope removals are the exception, not the default.

4. **Apply** the `applied` changes to `Papers.md` — matrix cells only:
   - **Adds**: insert the `[label](#N)` anchor into the new cell. The reference
     already exists; do not touch `## References`.
   - **Moves / removes**: only if the ref still appears in ≥1 cell afterward.
   - **`NOT-PRIMARY` / scope removals**: heavier judgment — surface for explicit
     human confirmation, do not auto-apply. Present `kept_by_review` alongside so
     the human sees what the steelman saved.
   - **`taxonomy.proposed_new_rows` / `proposed_new_columns`**: **never** auto-apply
     — these are curator-level structural changes. A new row or column needs a
     `Taxonomy.md` definition plus the matrix-header link to it (per `CLAUDE.md`).
     Surface them (with supporting refs + the verification verdict) for a human; the
     papers already keep their approximate cells, so nothing is orphaned in the
     meantime. `singletons` are informational (parked until a second paper appears).
   - No process/changelog language in content (no "reclassified", no dates).

5. **Integrity gate** (all must pass before commit):
   ```bash
   pnpm --dir site lint:papers   # 0 hard errors: anchors resolve, no orphans
   pnpm --dir site test          # vitest parser suite (incl. multi-cell test)
   pnpm --dir site parse         # regenerate metrics.json / papers.json
   ```
   Then re-run `caail-classification-reviewer` on a random sample of the
   *applied* cells — with a fresh agent that did not propose them. Every applied
   cell must come back `DEFENSIBLE`.

6. **Commit** with `feat(papers):` / `fix(papers):` scopes. Matrix and any ref
   touch land in the **same commit** (the #1 CAAIL error is splitting them).

## Common mistakes

| Mistake | Reality |
|---|---|
| Adding a cross-listing because the paper *could* apply a method | The matrix records what the paper *does*. Require a load-bearing methods span. |
| Counting a baseline / related-work method as the paper's method | Only the method the paper substantively uses earns a cell. |
| Removing a paper's only cell | Forbidden unless it moves to Reviews & Perspectives. Every primary ref ends in ≥1 cell. |
| Editing the `## References` citation text in this pass | Out of scope — that is `caail-citation-reviewer`'s job. Classification only. |
| Trusting the abstract to confirm a method | Abstracts omit/overstate technique. Ground placements in the methods section. |
| Letting the proposer pass its own placement | The agent that proposes a cell never reviews it. |
| Removing a paper because "its example isn't literally cell-ag" | Over-strict scope. Check the area's `Taxonomy.md` definition against the paper's own methods first; a general method is a MOVE to AI Tooling, not a removal. |
| Treating a scope removal like a method-accuracy fix | Scope removals must beat the steelman defender (+ gated domain check); method-accuracy needs only skeptics. |
| Removing a paper whose real method/area has no row/column | That orphans a legitimate paper. Emit a `taxonomy_gap` instead — keep the cell, propose the new row/column. Only after re-row into an existing label fails. |
| Auto-adding a proposed new row/column | Curator-level change. Each needs a `Taxonomy.md` definition + the matrix-header link. Surface for a human; require a ≥2-paper verified cluster. |
| Chunking the gate by id-range to save cost | The Taxonomy clustering runs inside one invocation — chunking splits a gap pair across runs and silently loses it. Run one invocation over the flag set; if it's too big, the skim over-flagged — tighten it. |
| Trusting a skim `keep` without measuring recall | The skim is the audit's recall floor. A false `keep` ships an unaudited wrong placement. Gate the full sweep on a hand-labelled control batch and spot-check keeps *per row family* (curatorial rows too), not globally. |
| Feeding the skim's `suggested_dest` into the gate | Breaks proposer independence. `_audit_ids.json` is ids-only by construction; suggestions live in `_skim_report.json` for the human. |
| Committing without `lint:papers` | The lint is the only thing that reliably catches a dangling anchor or an orphaned primary ref. |
