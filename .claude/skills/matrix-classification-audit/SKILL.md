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

## Procedure

1. **Preconditions.** Zotero desktop running, Preferences → Advanced → "Allow
   other applications…" enabled, caail group (`6549203`) synced locally. Papers'
   PDFs full-text-indexed (so `.zotero-ft-cache` files exist).

2. **Extract the corpus** — pre-pull each matrix ref's methods text so the
   adversarial review is deterministic and resumable:
   ```bash
   python3 .claude/skills/matrix-classification-audit/extract_matrix_corpus.py
   ```
   Writes `matrix-corpus.json` (gitignored): per matrix-participating ref, its
   `id`, `doi`, `title`, `current_cells` (the `(method, area)` pairs it sits in
   today), `abstract`, `methods_text`, and `has_fulltext`. Refs with no indexed
   PDF come through `has_fulltext: false` — they are reviewed from abstract +
   literature APIs at lower confidence, not skipped.

3. **Adversarial classification (Workflow).** Fan out over the corpus:
   - **Proposer** (`agentType: caail-classification-reviewer`): given a ref's
     methods text and current cells, return the defensible cell set, any
     `MISPLACED`/`UNSUPPORTED` current cells, `MISSING-CELL` additions (each with
     a methods span + confidence), and a `NOT-PRIMARY` flag.
   - **Skeptics** (≥3 independent, per *proposed change*): each prompted to
     **refute** the change ("the paper does NOT apply method X"; "the area is
     really Y"; default to refuted if the span does not clearly support it). A
     change survives only on majority (≥2/3) non-refutal. The proposer never
     reviews its own proposal.

   The Workflow returns a structured change list: per ref `add_cells`,
   `remove_cells`, `move_cells`, `flag_not_primary`, each with surviving-vote
   count + supporting span. Be conservative: a cross-listing lands only with a
   load-bearing methods span that survives the skeptics. Log any ref reviewed
   abstract-only.

4. **Apply** the surviving changes to `Papers.md` — matrix cells only:
   - **Adds**: insert the `[label](#N)` anchor into the new cell. The reference
     already exists; do not touch `## References`.
   - **Moves / removes**: only if the ref still appears in ≥1 cell afterward.
   - **`NOT-PRIMARY`**: moving a paper out of the matrix into
     `## Reviews & Perspectives` (and dropping its cells) is a heavier judgment
     call — surface it for explicit human confirmation, do not auto-apply.
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
| Committing without `lint:papers` | The lint is the only thing that reliably catches a dangling anchor or an orphaned primary ref. |
