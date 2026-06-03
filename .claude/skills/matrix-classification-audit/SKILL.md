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

**Asymmetric burden (the #33 lesson).** Removing a *correct* entry is worse than
leaving a debatable one. A **scope**-based removal / area-move / NOT-PRIMARY must
therefore clear a higher bar than an additive placement, because it works against
the curators' intent. The hardening that enforces this:

- The corpus carries `cited_in_research_areas` per ref — area pages that already
  cite the paper. A non-empty value is a strong *intentional-placement → KEEP*
  prior (this alone catches #33, which `ResearchAreas/Bioprocess.md` cites).
- Every reviewer verdict is tagged `nature: method-accuracy | scope`.
  **method-accuracy** ("the paper doesn't use this technique") is factual and
  needs only skeptics. **scope** ("not cell-ag enough") additionally must defeat
  an independent **steelman defender** (which reads the `ResearchAreas/<Area>.md`
  page + the philosophy), and, only if still unresolved, a **gated
  domain-relevance** web check. Ties go to KEEP.
- A general-purpose method with no specific cell-ag application is a **MOVE to
  `AI Tooling / Methodology`, not a removal**. Removal/NOT-PRIMARY is reserved for
  papers with **no plausible cell-ag connection at all**.

## Procedure

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
   `current_cells`, `abstract`, `methods_text`, `has_fulltext`, and
   `cited_in_research_areas` (the Layer-1 KEEP prior). Refs with no indexed PDF
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

   The workflow returns `{summary, applied, kept_by_review, per_ref}`: `applied` =
   changes that survived (additive adds, method-accuracy fixes, and any scope
   removal that beat the defender+domain); `kept_by_review` = scope proposals the
   steelman overturned (with the deciding layer). Be conservative: scope removals
   are the exception, not the default.

4. **Apply** the `applied` changes to `Papers.md` — matrix cells only:
   - **Adds**: insert the `[label](#N)` anchor into the new cell. The reference
     already exists; do not touch `## References`.
   - **Moves / removes**: only if the ref still appears in ≥1 cell afterward.
   - **`NOT-PRIMARY` / scope removals**: heavier judgment — surface for explicit
     human confirmation, do not auto-apply. Present `kept_by_review` alongside so
     the human sees what the steelman saved.
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
| Removing a paper because "its example isn't literally cell-ag" | Over-strict scope = the #33 failure. Check `cited_in_research_areas` + the `ResearchAreas/<Area>.md` scope first; a general method is a MOVE to AI Tooling, not a removal. |
| Treating a scope removal like a method-accuracy fix | Scope removals must beat the steelman defender (+ gated domain check); method-accuracy needs only skeptics. |
| Committing without `lint:papers` | The lint is the only thing that reliably catches a dangling anchor or an orphaned primary ref. |
