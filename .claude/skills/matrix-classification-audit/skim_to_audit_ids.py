#!/usr/bin/env python3
"""Turn batched triage-skim outputs into the gate's `_audit_ids.json`.

Stage 1 of the cost-efficient matrix audit emits, per paper, a pinned-schema
triage verdict (keep | flag). The skim agents write their batches as JSON files
under `matrix-corpus/_skim/`. This script reads every batch, validates it
against the pinned schema, dedupes the flagged ids, and writes the gate's
bootstrap file `matrix-corpus/_audit_ids.json` as `{"ids":[...]}`.

Design rules (each answers an adversarial-review blocker/concern):

- **ids only (C2).** `_audit_ids.json` carries the flagged ids and nothing else.
  The skim's `suggested_dest`/`reason` are written to a *separate* human report
  (`_skim_report.json`) and must NEVER be injected into a gate prompt — the gate
  proposer re-derives every verdict independently.
- **recall is sticky.** If an id appears in more than one batch with conflicting
  verdicts, `flag` wins (a false flag costs one gate proposer; a missed flag is
  an unaudited wrong placement).
- **coverage is checked, not assumed (B3).** Every matrix ref must be skimmed
  exactly once. Ids present in `matrix-corpus.json` but absent from the skim
  outputs are surfaced loudly as MISSING — an un-skimmed paper is an unaudited
  gap, not a silent `keep`.
- **cost ceiling is visible (C1).** Prints the flag count and a floor agent
  estimate; warns hard when the flag set exceeds the abort ceiling (a recall-
  biased skim flagging > CEILING means the skim over-flagged — tighten and
  re-skim rather than launch an expensive gate).

Pure stdlib, zero Claude tokens, deterministic and re-runnable.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Pinned skim output schema (the SKILL.md rubric emits exactly this).
VALID_VERDICTS = {"keep", "flag"}
VALID_ISSUE_TYPES = {
    "wrong_method",
    "wrong_area_scope",
    "missing_cell",
    "taxonomy_gap",
    "not_primary",
    "needs_fulltext",
}
# Flag set larger than this => the skim over-flagged; stop and tighten the
# rubric rather than launch a gate that approaches the failed full-corpus cost.
ABORT_CEILING = 60


def _load_batch(path: Path) -> list[dict]:
    """Read one skim batch file. Accepts a bare list, or an object wrapping the
    list under `results`/`verdicts`/`papers` (tolerant of how an agent framed it)."""
    data = json.loads(path.read_text())
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("results", "verdicts", "papers", "items"):
            if isinstance(data.get(key), list):
                return data[key]
        # A single-record object is also valid.
        if "id" in data and "verdict" in data:
            return [data]
    raise ValueError(
        f"{path.name}: expected a JSON array of skim records (or an object "
        f"wrapping one under 'results'); got {type(data).__name__}"
    )


def _validate(rec: dict, src: str) -> list[str]:
    """Return a list of human-readable problems with one skim record (empty = OK)."""
    errs: list[str] = []
    if not isinstance(rec.get("id"), int):
        errs.append(f"{src}: 'id' must be an int, got {rec.get('id')!r}")
    if rec.get("verdict") not in VALID_VERDICTS:
        errs.append(f"{src}: 'verdict' must be one of {sorted(VALID_VERDICTS)}, "
                    f"got {rec.get('verdict')!r}")
    its = rec.get("issue_types", [])
    if not isinstance(its, list):
        errs.append(f"{src}: 'issue_types' must be a list, got {type(its).__name__}")
    else:
        bad = [t for t in its if t not in VALID_ISSUE_TYPES]
        if bad:
            errs.append(f"{src}: unknown issue_types {bad}; allowed {sorted(VALID_ISSUE_TYPES)}")
    if rec.get("verdict") == "flag" and not its:
        errs.append(f"{src} (id={rec.get('id')}): a 'flag' must name ≥1 issue_type")
    if not isinstance(rec.get("reason", ""), str):
        errs.append(f"{src} (id={rec.get('id')}): 'reason' must be a string")
    return errs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--skim-dir", default="matrix-corpus/_skim",
                    help="directory of skim batch JSON files (default: matrix-corpus/_skim)")
    ap.add_argument("--out", default="matrix-corpus/_audit_ids.json",
                    help="gate bootstrap file to write (default: matrix-corpus/_audit_ids.json)")
    ap.add_argument("--report", default="matrix-corpus/_skim_report.json",
                    help="human-facing flag report with reasons/suggestions (never fed to the gate)")
    ap.add_argument("--corpus", default="matrix-corpus.json",
                    help="corpus index, used to verify every ref was skimmed (default: matrix-corpus.json)")
    ap.add_argument("--ceiling", type=int, default=ABORT_CEILING,
                    help=f"flag-count abort ceiling (default: {ABORT_CEILING})")
    args = ap.parse_args()

    skim_dir = Path(args.skim_dir)
    if not skim_dir.is_dir():
        print(f"error: skim dir not found: {skim_dir}", file=sys.stderr)
        return 1
    batch_files = sorted(p for p in skim_dir.glob("*.json"))
    if not batch_files:
        print(f"error: no *.json skim batches in {skim_dir}", file=sys.stderr)
        return 1

    # Read + validate every record; collect the latest verdict per id (flag sticky).
    verdict_by_id: dict[int, str] = {}
    record_by_id: dict[int, dict] = {}
    errors: list[str] = []
    n_records = 0
    for bf in batch_files:
        try:
            recs = _load_batch(bf)
        except (ValueError, json.JSONDecodeError) as e:
            errors.append(str(e))
            continue
        for rec in recs:
            n_records += 1
            src = bf.name
            recerrs = _validate(rec, src)
            if recerrs:
                errors.extend(recerrs)
                continue
            rid = rec["id"]
            v = rec["verdict"]
            # flag is sticky across duplicate appearances (recall bias).
            if verdict_by_id.get(rid) == "flag":
                v = "flag"
            verdict_by_id[rid] = v
            if v == "flag" or rid not in record_by_id:
                record_by_id[rid] = rec

    if errors:
        print("SKIM OUTPUT VALIDATION FAILED — fix the batches and re-run:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 2

    flagged = sorted(i for i, v in verdict_by_id.items() if v == "flag")
    kept = sorted(i for i, v in verdict_by_id.items() if v == "keep")

    # Coverage check (B3): every matrix ref must be skimmed exactly once.
    missing: list[int] = []
    corpus = Path(args.corpus)
    if corpus.is_file():
        all_ids = {r["id"] for r in json.loads(corpus.read_text()).get("refs", [])}
        missing = sorted(all_ids - set(verdict_by_id))
        extra = sorted(set(verdict_by_id) - all_ids)
        if extra:
            print(f"warning: {len(extra)} skimmed id(s) not in corpus: {extra}", file=sys.stderr)
    else:
        print(f"warning: {corpus} not found — skipping coverage check", file=sys.stderr)

    # Write the gate bootstrap file — IDS ONLY (C2).
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"ids": flagged}, indent=2) + "\n")

    # Write the human-facing report (reasons + suggestions) — NEVER fed to the gate.
    report = [
        {
            "id": record_by_id[i]["id"],
            "issue_types": record_by_id[i].get("issue_types", []),
            "reason": record_by_id[i].get("reason", ""),
            "suggested_dest": record_by_id[i].get("suggested_dest", ""),
        }
        for i in flagged
    ]
    rep = Path(args.report)
    rep.parent.mkdir(parents=True, exist_ok=True)
    rep.write_text(json.dumps(report, indent=2) + "\n")

    # Per-issue-type tally (a flag can carry several).
    by_type: dict[str, int] = {t: 0 for t in sorted(VALID_ISSUE_TYPES)}
    for i in flagged:
        for t in record_by_id[i].get("issue_types", []):
            by_type[t] += 1

    n_skimmed = len(verdict_by_id)
    print(f"skimmed   : {n_skimmed} unique ids  ({n_records} records across {len(batch_files)} batches)")
    print(f"keep      : {len(kept)}")
    print(f"flag      : {len(flagged)}  -> {out}")
    for t, n in by_type.items():
        if n:
            print(f"            {t}: {n}")
    if missing:
        print(f"\n⚠ MISSING COVERAGE: {len(missing)} corpus ref(s) never skimmed "
              f"(unaudited gap, NOT a silent keep): {missing}", file=sys.stderr)
    # Cost guard (C1): proposer floor = 12 skim + F proposers; skeptics add ~4·(real changes).
    print(f"\ngate cost (floor): ~{12 + len(flagged)} agents "
          f"(12 skim + {len(flagged)} proposers) + ~4 per warranted change")
    if len(flagged) > args.ceiling:
        print(f"\n⚠⚠ FLAG COUNT {len(flagged)} EXCEEDS CEILING {args.ceiling} — "
              f"the skim likely over-flagged. STOP: tighten the rubric and re-skim "
              f"rather than launch a near-full-corpus gate.", file=sys.stderr)
    if missing:
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
