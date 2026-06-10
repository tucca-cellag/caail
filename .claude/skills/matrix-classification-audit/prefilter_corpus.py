#!/usr/bin/env python3
"""Deterministic, zero-token pre-filter for the matrix-classification audit.

The LLM triage skim is the cost driver: having an LLM read every paper's ~12 KB methods
window is ~1M input tokens for the whole corpus. Most placements, though, are *lexically
obvious* — an SVM paper says "support vector", a benchmark paper says "benchmark". This
pre-filter clears those for free so the LLM skim only ever reads the genuinely-ambiguous
**residual**.

Partition, per current matrix cell:
  - **auto-clear**  the cell is confidently correct: a positive alias for its method row
                    appears in the paper text, AND no trap-blocker string for that row is
                    present, AND the area is corroborated by an area keyword in the paper's
                    own text (never the untrusted ResearchAreas pages).
  - **residual**    everything else.
A paper is auto-cleared only if *all* its cells auto-clear; otherwise the whole paper is
residual and goes to the LLM skim.

INVARIANT — fail toward the LLM. Any uncertainty (unknown row, no alias hit, any trap or
secondary-method signal, missing text) routes to the residual, never to a silent clear.
Adding a new matrix row with no aliases yet only *reduces savings* (its papers fall to the
LLM); it can never silently mis-clear. Correctness degrades safely.

This is NOT a classifier and NOT a replacement for the skim's judgment — it is a high-
precision *clear* filter. Its correctness is established empirically by `--validate`, which
checks it against a prior LLM-skim oracle (`_skim_report.json`): no paper it auto-clears may
be one the skim flagged as a CORRECTION. (Suppressing a skim ADDITIVE/needs-fulltext flag is
the accepted, measured recall-for-cost trade.)

Pure stdlib, zero Claude tokens, deterministic.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# ── CLEARABLE_ROWS: the only method rows the pre-filter is allowed to auto-clear. These are
#    the rows where the method NAME is a reliable lexical signal. Everything else — the
#    Deep-Learning catch-all (skim flagged 13/17), every agent row (auto-clearing risks the
#    wrong agent sub-type), and every Foundation-Model row (task-specific-vs-pretrained is not
#    lexically separable) — is DELIBERATELY excluded and always falls to the LLM residual.
#    This is the empirical lesson from validating against the skim oracle: leaks concentrated
#    entirely in the excluded rows. Adding a row here requires re-running --validate to zero.
CLEARABLE_ROWS = {
    "SVM", "K-Nearest Neighbors", "Ensemble Learning", "Genetic Algorithms", "Active Learning",
    "Bayesian Optimization", "GNN", "CNN", "GAN / VAE", "Reinforcement Learning",
    "Benchmarks & Evaluation Frameworks",
}

# ── Method-row aliases: lowercase substrings whose presence in the paper text SUPPORTS the
#    row. Conservative (precision over recall) — a miss just sends the paper to the LLM.
#    Rows outside CLEARABLE_ROWS still appear here for documentation but never auto-clear.
ALIASES: dict[str, list[str]] = {
    "SVM": ["support vector", "svm", "svr", "libsvm"],
    "K-Nearest Neighbors": ["k-nearest", "knn", "k nearest neighbor", "nearest-neighbor"],
    "Ensemble Learning": ["random forest", "xgboost", "gradient boosting", "gradient-boosting",
                          "adaboost", "lightgbm", "ensemble of", "decision tree", "gbdt",
                          "boosted tree", "extra trees"],
    "Genetic Algorithms": ["genetic algorithm", "evolutionary algorithm", "evolutionary strateg",
                           "nsga", "differential evolution"],
    "Active Learning": ["active learning", "iterative experimental design",
                        "bayesian experimental design", "design-build-test"],
    "Bayesian Optimization": ["bayesian optimization", "bayesian optimisation",
                              "acquisition function", "expected improvement", "qehvi", "qnehvi",
                              "upper confidence bound", "gpyopt", "thompson sampling"],
    "GNN": ["graph neural network", "graph convolution", "gcn", "graph attention", "gat ",
            "message passing", "message-passing", "graph isomorphism", "gin ", "graph autoencoder"],
    "CNN": ["convolutional neural network", "convolutional network", "cnn", "resnet",
            "u-net", "mobilenet", "vgg", "3d convolution"],
    "GAN / VAE": ["generative adversarial", "gan", "variational autoencoder", "vae",
                  "adversarial network", "wasserstein", "pix2pix", "cyclegan"],
    "Reinforcement Learning": ["reinforcement learning", "policy gradient", "ppo", "grpo",
                               "reward function", "q-learning", "rlhf"],
    "Deep Learning": ["deep neural network", "deep learning", "autoencoder", "transformer",
                      "multilayer perceptron", "feedforward neural", "fully connected neural",
                      "lstm", "recurrent neural", "attention network"],
    # Curatorial / agent rows — the label words themselves are the signal.
    "Benchmarks & Evaluation Frameworks": ["benchmark", "evaluation framework", "leaderboard",
                                           "evaluation suite", "test set of"],
    "Domain-Specific Biomedical Agents": ["agent", "agentic"],
    "General-Purpose Biomedical Agents": ["general-purpose", "general purpose", "agent", "agentic"],
    "Scientific Literature & Discovery Agents": ["literature", "retrieval-augmented", "rag",
                                                 "discovery agent", "paper", "citation"],
    "Agent Infrastructure (Frameworks, KGs, Protocols)": ["framework", "knowledge graph",
                                                          "protocol", "mcp", "ecosystem",
                                                          "infrastructure", "orchestrat"],
    "Robot Scientists & Lab Automation": ["robot scientist", "lab automation", "autonomous lab",
                                          "self-driving lab", "robotic", "closed-loop"],
    "Chemistry / Synthesis Agents": ["chemistry", "synthesis", "retrosynthesis", "molecule",
                                     "chemical"],
    # Foundation-Model rows: require an actual foundation-model cue, and gate with traps below.
    "Foundation Models: Cell-State & Perturbation Prediction": ["foundation model", "pretrain",
                                                               "pre-train", "perturbation"],
    "Foundation Models: Masked Language Modeling": ["masked language", "masked pretrain",
                                                    "bert", "masking", "foundation model"],
    "Foundation Models: Next-Token Prediction": ["autoregressive", "next-token", "next token",
                                                 "generative pretrain", "gpt", "causal language"],
    "Foundation Models: LM + Biological Priors": ["foundation model", "pretrain", "language model"],
    "Foundation Models (other modalities)": ["foundation model", "pretrain", "multimodal"],
}

# ── Trap-blockers: substrings whose presence BLOCKS an auto-clear for that row (forces the
#    paper to the LLM). These are the documented method-family traps + the catch-all guards.
TRAPS: dict[str, list[str]] = {
    # "posterior"/"bayesian inference" are too broad — every Gaussian-process BO has a posterior.
    "Bayesian Optimization": ["bayesian flux", "flux estimation", "metrac"],
    # "graph embedding" is too broad — every GNN emits embeddings; trap only the non-learned ones.
    "GNN": ["network propagation", "random walk", "metapath2vec", "node2vec", "skip-gram",
            "interactome"],
    "Deep Learning": ["radial basis", "rbf", "chemometric", "partial least squares", "pls-da",
                      "interactome", "network propagation", "shallow", "one of seven",
                      "compared models", "among 18", "outperformed by", "metapath2vec",
                      "conditional gan", "pix2pix"],
    "CNN": ["surrogate", "flattened", "tabular", "fully connected", "dense network"],
    # A Foundation-Model placement is blocked when the text signals a *task-specific*,
    # not-pretrained model (the FM-row trap).
    "Foundation Models: Cell-State & Perturbation Prediction": ["task-specific", "trained end-to-end",
                                                               "supervised model", "graph neural"],
    "Foundation Models: LM + Biological Priors": ["embeddings as", "uses esm", "esm2 embedding",
                                                  "fixed embedding", "metric learning",
                                                  "task-specific", "node2vec"],
    "Foundation Models: Masked Language Modeling": ["esm2 embedding", "uses esm", "consumes",
                                                    "as input features"],
    "Foundation Models (other modalities)": ["graph isomorphism", "gin ", "task-specific"],
    "Scientific Literature & Discovery Agents": ["mcp", "knowledge graph registry", "tree search",
                                                 "code generation", "fully automated"],
    "Domain-Specific Biomedical Agents": ["general-purpose", "flux balance", "no llm",
                                          "user study", "wizard-of-oz", "rule-based"],
    # A "benchmark" cell is blocked when the paper is actually a correspondence/commentary
    # (not primary) or a dataset paper rather than a benchmark+evaluation framework.
    # "response to"/"data collection" are too common; keep the distinctive correspondence/dataset cues.
    "Benchmarks & Evaluation Frameworks": ["reply to", "matters arising", "rebuttal",
                                           "data descriptor", "we present a dataset",
                                           "we introduce a dataset", "image dataset",
                                           "dataset paper"],
}

# ── Area disqualifiers: substrings that BLOCK an area's corroboration (cell-ag scope guard).
#    Cellular Engineering means animal-cell engineering for cultured food — a bacterial/E.coli
#    study is out of scope even if it says "cell".
AREA_DISQUALIFY: dict[str, list[str]] = {
    "Cellular Engineering": ["e. coli", "escherichia", "bacterial mutation", "microbial evolution"],
}

# ── Strong, distinctive area terms. If one appears for an area the paper is NOT placed in, it
#    signals a missing additive cell (or a scope mismatch) — block the clear and send to LLM.
#    Kept deliberately narrow so it doesn't over-block (e.g. "fermentation" rarely appears in a
#    paper that is purely sensory/scaffolding).
STRONG_AREA_KW: dict[str, list[str]] = {
    "Bioprocess & Scale-Up": ["fermentation", "fed-batch", "bioreactor"],
    "Scaffolding": ["scaffold"],
}

# ── Area keywords: text-grounded corroboration that a paper's area is correct (the paper's own
#    title/abstract/methods — never the untrusted ResearchAreas pages).
AREA_KW: dict[str, list[str]] = {
    "Media Optimization": ["media optim", "medium optim", "serum-free", "culture medium",
                           "media formulation", "media composition"],
    "Cellular Engineering": ["single-cell", "scrna", "single cell", "perturbation", "cell type",
                             "gene expression", "transcriptom", "cell state", "differentiation"],
    "Bioprocess & Scale-Up": ["bioprocess", "fermentation", "bioreactor", "fed-batch", "cho cell",
                              "cell culture process", "metabolic model", "photobioreactor"],
    "Scaffolding": ["scaffold", "tissue engineering", "biomaterial", "tissue growth", "mould"],
    "Sensory Prediction": ["odor", "olfact", "taste", "flavor", "aroma", "bitter", "sensory",
                           "meat quality", "freshness"],
    "AI Tooling / Methodology": ["agent", "framework", "tool", "pipeline", "platform",
                                 "methodology", "knowledge graph"],
    "AI Evaluation & Benchmarking": ["benchmark", "evaluation", "eval", "leaderboard"],
}


def _text(ref: dict) -> str:
    return " ".join(str(ref.get(k, "")) for k in ("title", "abstract", "methods_text")).lower()


def _area_ok(area: str, ref: dict, text: str) -> bool:
    if any(dq in text for dq in AREA_DISQUALIFY.get(area, [])):  # scope guard -> not corroborated
        return False
    return any(kw in text for kw in AREA_KW.get(area, []))       # text-grounded only (no area-page signal)


def cell_clears(method: str, area: str, ref: dict, text: str) -> bool:
    """A single cell auto-clears only on an allowlisted row, a positive alias, no trap, and
    area corroboration."""
    if method not in CLEARABLE_ROWS:                  # excluded row (DL/agent/FM) -> residual
        return False
    aliases = ALIASES.get(method)
    if not aliases or not any(a in text for a in aliases):  # no positive signal -> residual
        return False
    if any(t in text for t in TRAPS.get(method, [])): # trap present -> residual
        return False
    if not _area_ok(area, ref, text):                 # area not corroborated -> residual
        return False
    return True


def _secondary_area_block(placed_areas: set[str], text: str) -> bool:
    """True if a strong, distinctive term for a NON-placed area appears — signals a missing
    additive cell or a scope mismatch, so the paper should go to the LLM, not auto-clear."""
    for area, kws in STRONG_AREA_KW.items():
        if area not in placed_areas and any(kw in text for kw in kws):
            return True
    return False


def partition(corpus_dir: Path):
    """Return (auto_clear_ids, residual_ids, per_paper) over every ref-*.json in corpus_dir."""
    auto_clear, residual, per_paper = [], [], {}
    for rf in sorted(corpus_dir.glob("ref-*.json")):
        ref = json.loads(rf.read_text())
        rid = ref["id"]
        text = _text(ref)
        cells = ref.get("current_cells", [])
        if not cells:
            residual.append(rid)
            per_paper[rid] = {"clear": False, "reason": "no current cells"}
            continue
        placed_areas = {c["area"] for c in cells}
        results = [(c["method"], c["area"], cell_clears(c["method"], c["area"], ref, text)) for c in cells]
        all_clear = all(r[2] for r in results) and not _secondary_area_block(placed_areas, text)
        (auto_clear if all_clear else residual).append(rid)
        per_paper[rid] = {
            "clear": all_clear,
            "cells": [{"method": m, "area": a, "clears": ok} for m, a, ok in results],
        }
    return sorted(auto_clear), sorted(residual), per_paper


# ── Oracle buckets (mirror skim_to_audit_ids / the audit report) ──────────────────────────
def _bucket(issue_types: list[str]) -> str:
    s = set(issue_types)
    if s <= {"needs_fulltext"}:
        return "needs_fulltext"
    if s <= {"missing_cell", "needs_fulltext"}:
        return "additive"
    return "correction"


def validate(corpus_dir: Path, report_path: Path) -> int:
    auto_clear, residual, _ = partition(corpus_dir)
    total = len(auto_clear) + len(residual)
    rep = json.loads(report_path.read_text())
    correction = {r["id"] for r in rep if _bucket(r["issue_types"]) == "correction"}
    additive = {r["id"] for r in rep if _bucket(r["issue_types"]) == "additive"}
    needs_ft = {r["id"] for r in rep if _bucket(r["issue_types"]) == "needs_fulltext"}
    cleared = set(auto_clear)

    leaks = sorted(cleared & correction)               # HARD failure
    add_suppressed = sorted(cleared & additive)         # measured trade
    ft_suppressed = sorted(cleared & needs_ft)          # measured trade

    print(f"corpus            : {total} papers")
    print(f"auto-clear (free) : {len(auto_clear)}  ({100*len(auto_clear)//max(total,1)}% of the LLM skim removed)")
    print(f"residual (-> LLM) : {len(residual)}")
    print()
    print(f"oracle: {len(correction)} corrections, {len(additive)} additive, {len(needs_ft)} needs-fulltext")
    print(f"correction-leak   : {len(leaks)}  {leaks if leaks else '(zero — OK)'}")
    print(f"additive suppressed: {len(add_suppressed)}/{len(additive)}  {add_suppressed}")
    print(f"needs-ft suppressed: {len(ft_suppressed)}/{len(needs_ft)}  {ft_suppressed}")

    traps = {7, 33, 59, 60, 197}
    trap_in_residual = traps <= set(residual)
    print(f"documented traps {sorted(traps)} all in residual: {trap_in_residual}")

    ok = not leaks and trap_in_residual
    print()
    print("RESULT:", "PASS — zero correction-leak, traps preserved" if ok
          else "FAIL — tighten alias/trap tables")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", default="matrix-corpus", help="per-ref corpus dir (default: matrix-corpus)")
    ap.add_argument("--validate", action="store_true",
                    help="check against the skim oracle (_skim_report.json): zero correction-leak")
    ap.add_argument("--report", default="matrix-corpus/_skim_report.json",
                    help="skim oracle for --validate")
    ap.add_argument("--out", default=None,
                    help="write the residual ids (the LLM-skim work-list) as {\"ids\":[...]} to this path")
    args = ap.parse_args()

    corpus = Path(args.dir)
    if not corpus.is_dir():
        print(f"error: corpus dir not found: {corpus}", file=sys.stderr)
        return 1

    if args.validate:
        return validate(corpus, Path(args.report))

    auto_clear, residual, _ = partition(corpus)
    total = len(auto_clear) + len(residual)
    print(f"corpus     : {total} papers")
    print(f"auto-clear : {len(auto_clear)}  ({100*len(auto_clear)//max(total,1)}% of the LLM skim removed for free)")
    print(f"residual   : {len(residual)}  -> LLM-skim only these")
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps({"ids": residual}, indent=2) + "\n")
        print(f"wrote residual work-list -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
