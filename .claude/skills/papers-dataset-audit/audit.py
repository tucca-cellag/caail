#!/usr/bin/env python3
"""
papers-dataset-audit — Phase 3 of the Zotero workflow.

For every reference in Papers.md, locate its Zotero record (caail group first,
Benji's second), pull the PDF's full-text cache, scan for deposit accessions
and code/data URLs near a Data Availability heading, and report whether each
accession is already cited somewhere in the repo. The result is a Markdown
report listing ORPHAN findings (paper has accession X, repo doesn't cite X)
for human review — handed off to zotero-to-caail-sync for integration.

Stdlib-only. Targets the local Zotero API at http://localhost:23119.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Iterable

# ---------- accession patterns ----------

ACCESSION_PATTERNS = [
    # NCBI
    (r"\bGSE\d{4,7}\b", "GEO"),
    (r"\bGSM\d{5,8}\b", "GEO-sample"),
    (r"\bGPL\d{3,6}\b", "GEO-platform"),
    (r"\bSRP\d{5,8}\b", "SRA-project"),
    (r"\bSRR\d{5,9}\b", "SRA-run"),
    (r"\bSRX\d{5,9}\b", "SRA-experiment"),
    (r"\bSRS\d{5,9}\b", "SRA-sample"),
    (r"\bPRJ[A-Z]{2}\d{4,8}\b", "BioProject"),
    (r"\bSAM[NED][A-Z]?\d{6,12}\b", "BioSample"),
    # ENA/EBI
    (r"\bE-MTAB-\d+\b", "ArrayExpress"),
    (r"\bPXD\d{5,8}\b", "PRIDE"),
    (r"\bMTBLS\d{2,6}\b", "MetaboLights"),
    (r"\bMSV\d{6,9}\b", "MassIVE"),
    # NGDC / CNCB (China)
    (r"\bCRA\d{4,8}\b", "NGDC-GSA"),
    (r"\bGSA\d{6,8}\b", "NGDC-GSA-altform"),
    (r"\bGVM\d{6,8}\b", "NGDC-GVM"),
    (r"\bOMIX\d{5,8}\b", "NGDC-OMIX"),
    (r"\bCNP\d{6,8}\b", "CNGB"),
    # Synapse / Sage
    (r"\bsyn\d{5,9}\b", "Synapse"),
    # Zenodo / Figshare / OSF
    (r"\bzenodo\.org/records?/(\d{5,8})\b", "Zenodo"),
    (r"\b10\.5281/zenodo\.(\d{5,8})\b", "Zenodo-DOI"),
    (r"\bfigshare\.com/(?:articles?|s)/[\w\-]+/?\S*\b", "Figshare"),
    (r"\bosf\.io/[\w\-]+\b", "OSF"),
    # Code repos
    (r"\bgithub\.com/[\w\-\.]+/[\w\-\.]+\b", "GitHub"),
    (r"\bgitlab\.com/[\w\-\.]+/[\w\-\.]+\b", "GitLab"),
    (r"\bbitbucket\.org/[\w\-\.]+/[\w\-\.]+\b", "Bitbucket"),
    (r"\bhuggingface\.co/(?:datasets|spaces)/[\w\-/]+\b", "HuggingFace-data"),
    (r"\bhuggingface\.co/[\w\-]+/[\w\-]+\b", "HuggingFace-model"),
    # ProteinDataBank / PDB
    (r"\bPDB\s*(?:id|ID|:)\s*([0-9][A-Z0-9]{3})\b", "PDB"),
    # KEGG / Reactome — exclude common false positives via word boundaries
    (r"\bhsa\d{5}\b", "KEGG-pathway"),
]

DATA_AVAILABILITY_HEADERS = [
    "Data availability",
    "Data Availability",
    "DATA AVAILABILITY",
    "Data and code availability",
    "Code availability",
    "Accession code",
    "Accession codes",
    "Data sharing",
    "Materials and Data Availability",
    "Availability of data",
]

# noise URLs that show up in publisher templates / refs / journal landing pages
NOISE_GITHUB = {
    "github.com/articles", "github.com/articles.",
    "github.com/articles)",
}
NOISE_URLS_PREFIX = (
    "github.com/articles", "github.com/biopharm",
)


def fetch_json(url: str, timeout: int = 15):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


# ---------- Papers.md parsing ----------

REF_PATTERN = re.compile(
    r'<a id="(\d+)">\1</a>\s+(.*?)(?=\n<a id="\d+">|\n##\s|\Z)',
    re.S,
)
DOI_PATTERN = re.compile(r"https?://doi\.org/([^\s)<]+)", re.I)
ARXIV_PATTERN = re.compile(r"arxiv\.org/(?:abs|pdf)/([\d\.v]+)", re.I)
OPENREVIEW_PATTERN = re.compile(r"openreview\.net/(?:forum|pdf)\?id=([\w\-]+)", re.I)


def parse_papers_md(path: Path) -> list[dict]:
    """Extract (ref_id, doi, alt_id, raw_block) tuples."""
    text = path.read_text(encoding="utf-8")
    out = []
    for m in REF_PATTERN.finditer(text):
        ref_id = m.group(1)
        block = m.group(2).strip()
        block_short = block[:1000].replace("\n", " ")
        doi_m = DOI_PATTERN.search(block)
        arxiv_m = ARXIV_PATTERN.search(block)
        openrev_m = OPENREVIEW_PATTERN.search(block)
        out.append(
            {
                "ref": ref_id,
                "doi": doi_m.group(1).rstrip(".,;:") if doi_m else None,
                "arxiv": arxiv_m.group(1) if arxiv_m else None,
                "openreview": openrev_m.group(1) if openrev_m else None,
                "block_snippet": block_short,
            }
        )
    return out


# ---------- Zotero index ----------


def build_zotero_index(api_base: str, groups: Iterable[int]) -> dict:
    """Build {doi.lower(): [(group, key, itemType, title)]} index across libraries."""
    idx = defaultdict(list)
    title_idx = defaultdict(list)
    for g in groups:
        start = 0
        while True:
            url = f"{api_base}/groups/{g}/items?format=json&limit=100&start={start}"
            try:
                page = fetch_json(url)
            except Exception as e:
                sys.stderr.write(f"  [warn] group {g} fetch failed at start={start}: {e}\n")
                break
            if not page:
                break
            for it in page:
                d = it.get("data", {})
                if d.get("itemType") in ("attachment", "note"):
                    continue
                doi = (d.get("DOI") or "").strip().lower()
                key = d.get("key")
                itype = d.get("itemType")
                title = (d.get("title") or "").strip()
                # also pick up arxiv URLs in the url field
                url_f = (d.get("url") or "")
                if doi:
                    idx[doi].append((g, key, itype, title))
                am = ARXIV_PATTERN.search(url_f) or ARXIV_PATTERN.search(d.get("extra") or "")
                if am:
                    idx[f"arxiv:{am.group(1).rstrip('v0123456789') or am.group(1)}"].append(
                        (g, key, itype, title)
                    )
                    # also raw arxiv id
                    idx[f"arxiv:{am.group(1)}"].append((g, key, itype, title))
                if title:
                    norm = re.sub(r"\s+", " ", title.lower())[:80]
                    title_idx[norm].append((g, key, itype, title))
            start += len(page)
            if len(page) < 100:
                break
    return {"by_doi": dict(idx), "by_title": dict(title_idx)}


def find_zotero(ref: dict, zindex: dict) -> tuple[int, str, str] | None:
    by_doi = zindex["by_doi"]
    by_title = zindex["by_title"]
    if ref["doi"]:
        for k, hits in by_doi.items():
            if k == ref["doi"].lower():
                g, key, itype, _ = hits[0]
                return g, key, itype
    if ref["arxiv"]:
        # try arxiv prefix
        for k, hits in by_doi.items():
            if k.endswith(ref["arxiv"].lower()) or k.startswith("arxiv:" + ref["arxiv"]):
                g, key, itype, _ = hits[0]
                return g, key, itype
    # Title-fragment fallback: take the longest non-trivial word from the citation block
    block = ref["block_snippet"]
    title_m = re.search(r"\.\s\*?([A-Z][^.*]{8,120})\.?\s*\*", block)
    if title_m:
        title_norm = re.sub(r"\s+", " ", title_m.group(1).strip().lower())[:80]
        if title_norm in by_title:
            g, key, itype, _ = by_title[title_norm][0]
            return g, key, itype
    return None


def find_pdf_ftcache(api_base: str, group: int, item_key: str, storage: Path) -> Path | None:
    try:
        kids = fetch_json(f"{api_base}/groups/{group}/items/{item_key}/children?format=json")
    except Exception:
        return None
    for c in kids:
        cd = c.get("data", {})
        if cd.get("itemType") == "attachment" and cd.get("contentType") == "application/pdf":
            ftc = storage / cd["key"] / ".zotero-ft-cache"
            if ftc.is_file():
                return ftc
    return None


# ---------- accession extraction ----------


def find_data_availability_window(text: str) -> tuple[int, int] | None:
    """Return (start, end) of the data-availability section in the text, if any."""
    earliest = None
    for h in DATA_AVAILABILITY_HEADERS:
        m = re.search(re.escape(h), text)
        if m and (earliest is None or m.start() < earliest):
            earliest = m.start()
    if earliest is None:
        return None
    # Window: 600 chars after the heading, OR until next "References"/"Acknowledgments" section.
    window_end = earliest + 1500
    cut = re.search(r"\b(?:References|Acknowledg|Competing interests|Declarations|Author contributions)\b", text[earliest:window_end])
    if cut:
        window_end = earliest + cut.start()
    return earliest, window_end


def extract_accessions(text: str) -> dict:
    """Find accessions in text, classified by data-availability proximity."""
    da_window = find_data_availability_window(text)

    high = defaultdict(list)  # in DA window
    low = defaultdict(list)   # elsewhere

    for pat, label in ACCESSION_PATTERNS:
        for m in re.finditer(pat, text):
            token = m.group(0)
            # Skip noise patterns
            if any(token.lower().startswith(p) for p in NOISE_URLS_PREFIX):
                continue
            if token.lower() in NOISE_GITHUB:
                continue
            in_da = da_window is not None and da_window[0] <= m.start() < da_window[1]
            bucket = high if in_da else low
            bucket[label].append(token)

    # dedupe while preserving order
    def dedupe(d):
        return {k: list(dict.fromkeys(v)) for k, v in d.items()}

    return {
        "high_confidence": dedupe(high),
        "low_confidence": dedupe(low),
        "da_window_found": da_window is not None,
    }


# ---------- repo cross-reference ----------


def build_repo_corpus(repo: Path) -> str:
    """Concatenate every .md under the repo for grep."""
    parts = []
    for path in repo.rglob("*.md"):
        # skip skill internals, hidden dirs
        if any(p.startswith(".") for p in path.relative_to(repo).parts):
            continue
        try:
            parts.append(path.read_text(encoding="utf-8", errors="ignore"))
        except Exception:
            continue
    return "\n\n".join(parts)


def cite_status(token: str, corpus: str) -> bool:
    """Return True if token (case-insensitive) appears in corpus."""
    return token.lower() in corpus.lower()


# ---------- main ----------


def main() -> int:
    p = argparse.ArgumentParser(
        description="Audit Papers.md refs for deposit accessions missing from Datasets/"
    )
    here = Path(__file__).resolve()
    repo_default = here.parents[3]
    p.add_argument("--papers", default=str(repo_default / "Papers.md"))
    p.add_argument("--repo", default=str(repo_default))
    p.add_argument("--zotero-storage", default=str(Path.home() / "Zotero" / "storage"))
    p.add_argument("--api", default="http://localhost:23119/api")
    p.add_argument(
        "--groups",
        default="6549203,5178481",
        help="Comma-separated Zotero group IDs to search (caail first by default)",
    )
    p.add_argument("--json", action="store_true", help="Emit JSON instead of Markdown")
    p.add_argument(
        "--include-low-confidence",
        action="store_true",
        help="Include accessions that don't appear near a Data Availability heading",
    )
    p.add_argument("--refs", help="Comma-separated subset of Papers.md ref IDs to audit")
    args = p.parse_args()

    papers_path = Path(args.papers)
    repo_path = Path(args.repo)
    storage = Path(args.zotero_storage)
    groups = [int(g) for g in args.groups.split(",")]

    sys.stderr.write(f"papers-dataset-audit: parsing {papers_path}\n")
    refs = parse_papers_md(papers_path)
    if args.refs:
        wanted = set(args.refs.split(","))
        refs = [r for r in refs if r["ref"] in wanted]
    sys.stderr.write(f"  {len(refs)} refs to audit\n")

    sys.stderr.write(f"  building Zotero index across groups {groups}…\n")
    zindex = build_zotero_index(args.api, groups)
    sys.stderr.write(f"  {len(zindex['by_doi'])} DOI keys / {len(zindex['by_title'])} title keys\n")

    sys.stderr.write(f"  loading repo corpus from {repo_path}…\n")
    corpus = build_repo_corpus(repo_path)
    sys.stderr.write(f"  {len(corpus):,} chars\n")

    findings = []
    for ref in refs:
        rec = {"ref": ref["ref"], "doi": ref["doi"], "arxiv": ref["arxiv"]}
        z = find_zotero(ref, zindex)
        if z is None:
            rec["status"] = "NO_ZOTERO"
            findings.append(rec)
            continue
        group, key, itype = z
        rec["zotero"] = {"group": group, "key": key, "itemType": itype}
        ftc = find_pdf_ftcache(args.api, group, key, storage)
        if ftc is None:
            rec["status"] = "NO_PDF"
            findings.append(rec)
            continue
        text = ftc.read_text(encoding="utf-8", errors="ignore")
        accs = extract_accessions(text)
        rec["da_window_found"] = accs["da_window_found"]
        rec["accessions"] = accs
        orphans = []
        matched = []
        for cat, lst in accs["high_confidence"].items():
            for tok in lst:
                (matched if cite_status(tok, corpus) else orphans).append((cat, tok))
        if args.include_low_confidence:
            for cat, lst in accs["low_confidence"].items():
                for tok in lst:
                    (matched if cite_status(tok, corpus) else orphans).append((cat, tok))
        rec["orphans"] = orphans
        rec["matched"] = matched
        if orphans:
            rec["status"] = "ORPHAN"
        elif matched:
            rec["status"] = "MATCHED"
        elif accs["high_confidence"] or accs["low_confidence"]:
            rec["status"] = "MATCHED"  # accessions found but only low-conf and we didn't include them
        else:
            rec["status"] = "NO_DATA"
        findings.append(rec)

    if args.json:
        print(json.dumps(findings, indent=2))
        return 0

    # Markdown report
    by_status = defaultdict(list)
    for r in findings:
        by_status[r["status"]].append(r)

    out = []
    out.append("# Papers.md → Datasets/ audit report\n")
    out.append(f"**Papers.md path:** `{papers_path.relative_to(repo_path)}`")
    out.append(f"**Refs audited:** {len(findings)}")
    out.append(f"**Zotero groups searched:** {groups}")
    out.append("")
    out.append("| Status | Count | Meaning |")
    out.append("| --- | --- | --- |")
    out.append(f"| ORPHAN | {len(by_status['ORPHAN'])} | Paper has a deposit/code link the repo does NOT cite — likely missing |")
    out.append(f"| MATCHED | {len(by_status['MATCHED'])} | Paper has deposit/code link(s) and at least one already appears in the repo |")
    out.append(f"| NO_DATA | {len(by_status['NO_DATA'])} | No accession/repo URL found in PDF — likely review/methodology |")
    out.append(f"| NO_PDF | {len(by_status['NO_PDF'])} | Zotero record found but no PDF/ft-cache yet |")
    out.append(f"| NO_ZOTERO | {len(by_status['NO_ZOTERO'])} | Paper not located in either Zotero library |")
    out.append("")

    if by_status["ORPHAN"]:
        out.append("## ORPHANs (action items)\n")
        for r in by_status["ORPHAN"]:
            out.append(f"### #{r['ref']} (DOI `{r['doi']}`)\n")
            for cat, tok in r["orphans"]:
                out.append(f"- **{cat}**: `{tok}`")
            if r["matched"]:
                out.append("\n_Also matched in-repo:_")
                for cat, tok in r["matched"]:
                    out.append(f"  - {cat}: `{tok}`")
            out.append("")

    if by_status["NO_ZOTERO"]:
        out.append("## NO_ZOTERO (papers not findable in either Zotero library)\n")
        for r in by_status["NO_ZOTERO"]:
            out.append(f"- #{r['ref']}  DOI `{r['doi']}`  arXiv `{r['arxiv']}`")
        out.append("")

    if by_status["NO_PDF"]:
        out.append("## NO_PDF (paper in Zotero but PDF not attached / not indexed)\n")
        for r in by_status["NO_PDF"]:
            out.append(
                f"- #{r['ref']}  DOI `{r['doi']}`  group {r['zotero']['group']} key {r['zotero']['key']}"
            )
        out.append("")

    out.append("## MATCHED (sanity check — these were caught)\n")
    for r in by_status["MATCHED"][:50]:
        toks = ", ".join(f"`{t}`" for _, t in r["matched"][:5])
        out.append(f"- #{r['ref']}: {toks}")
    if len(by_status["MATCHED"]) > 50:
        out.append(f"- … {len(by_status['MATCHED']) - 50} more")
    out.append("")

    print("\n".join(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
