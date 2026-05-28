#!/usr/bin/env python3
"""Scope a Zotero collection (or several) for CAAIL ingest.

Recursively enumerates every paper-type item in the given collection(s),
including items in sub-subcollections (Zotero's /items endpoint does NOT
auto-recurse — a subtle pitfall that this script fixes once). For each
item, pulls DOI, title, creators (verbatim), abstract, date, venue, and —
when a PDF attachment with a populated full-text cache exists — the
paper's Data Availability section. Cross-references every candidate
against the current CAAIL repo three ways (exact DOI / arXiv-bioRxiv ID
variants / fuzzy first-author + year regex) and emits a categorized
actionable-vs-already-in-repo report.

This is the Phase 1 (scoping) script for the sync workflow. The
zotero-to-caail-sync skill consumes the report to drive Phase 2 (drafting
and reviewer-gated commits).

Usage:
    scope.py --group <GROUP_ID> --collection <KEY> [--collection <KEY> ...]
             [--repo <PATH>] [--zotero-storage <PATH>]
             [--api <URL>] [--json]

Defaults:
    --repo            = the CAAIL repo root inferred from this script's
                        location (works inside .claude/skills/<name>/).
    --zotero-storage  = ~/Zotero/storage
    --api             = http://localhost:23119/api  (the local Zotero API
                        — Preferences → Advanced → "Allow other apps").

Examples:
    # Scope Benji's Cell Ag Library AI/ML and Odor/Flavor collections:
    scope.py --group 5178481 --collection TVZ38IIX --collection 77LM68C2

    # Same, JSON output for piping into another tool:
    scope.py --group 5178481 --collection TVZ38IIX --json

The script is stdlib-only Python 3 — no pip install, no virtual env.
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path


# ---------------------------------------------------------------------------
# Zotero API helpers
# ---------------------------------------------------------------------------

PAGE = 100


def _get(url, timeout=20):
    """GET a Zotero local-API URL, returning parsed JSON. Exits on failure."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.load(resp)
    except urllib.error.URLError as exc:
        sys.exit(
            f"ERROR: cannot reach the Zotero local API at {url} ({exc}).\n"
            "Open Zotero, enable Preferences > Advanced > 'Allow other "
            "applications on this computer to communicate with Zotero', "
            "and sync the group library locally.")


def _paginate(base_url):
    """Yield all items by paginating /items endpoints (start/limit)."""
    out, start = [], 0
    while True:
        sep = "&" if "?" in base_url else "?"
        page = _get(f"{base_url}{sep}start={start}&limit={PAGE}&format=json")
        out.extend(page)
        if len(page) < PAGE:
            return out
        start += PAGE


def fetch_subcollections(api, group, collection_key):
    """Return all immediate child collections of `collection_key`."""
    return _get(f"{api}/groups/{group}/collections/{collection_key}"
                f"/collections?format=json&limit=100")


def fetch_collection_items(api, group, collection_key):
    """Return the items directly attached to a collection (not its children)."""
    # Zotero's /items endpoint does include items in *direct* subcollections
    # for many API versions, but the behavior is inconsistent across the
    # local API and the web API. To be safe, we treat each collection as a
    # *flat* container here and rely on fetch_all_items_in_tree() to
    # explicitly recurse via fetch_subcollections().
    return _paginate(f"{api}/groups/{group}/collections/{collection_key}"
                     f"/items?format=json")


def fetch_all_items_in_tree(api, group, root_key, *, _seen=None):
    """Recursively walk the collection tree rooted at `root_key`.

    Returns a dict keyed by Zotero item key. Each value is the full Zotero
    item dict; the `_in_collections` field is added listing the path of
    collection keys (parent → leaf) the item was found under.

    This is the bug-fix that the prior ad-hoc enumeration was missing.
    """
    if _seen is None:
        _seen = {}
    # Items directly in this collection
    for it in fetch_collection_items(api, group, root_key):
        key = it.get("key")
        if not key:
            continue
        rec = _seen.setdefault(key, it)
        rec.setdefault("_in_collections", set()).add(root_key)
    # Recurse into subcollections
    for sub in fetch_subcollections(api, group, root_key):
        sub_key = sub.get("key")
        if sub_key:
            fetch_all_items_in_tree(api, group, sub_key, _seen=_seen)
    return _seen


def fetch_item_children(api, group, item_key):
    """Return child attachments / notes of an item (used to find PDFs)."""
    try:
        return _get(f"{api}/groups/{group}/items/{item_key}"
                    f"/children?format=json")
    except SystemExit:
        return []


def resolve_collection_name(api, group, name_query):
    """Find a collection by its display name. Case-insensitive substring match.

    Returns the first match's key, or None.
    """
    # We can't recurse into every collection up front cheaply. Walk the top
    # level, then recurse only when needed.
    def walk(parent_key=None):
        if parent_key is None:
            colls = _get(f"{api}/groups/{group}/collections/top"
                         f"?format=json&limit=100")
        else:
            colls = fetch_subcollections(api, group, parent_key)
        for c in colls:
            if name_query.lower() in (c.get("data", {})
                                       .get("name", "")
                                       .lower()):
                return c.get("key")
            sub = walk(c.get("key"))
            if sub:
                return sub
        return None
    return walk()


# ---------------------------------------------------------------------------
# Per-item evidence pull
# ---------------------------------------------------------------------------

def find_pdf_attachment_key(api, group, item_key):
    """Return the first PDF attachment's Zotero key, or None."""
    for c in fetch_item_children(api, group, item_key):
        if c.get("data", {}).get("contentType") == "application/pdf":
            return c.get("data", {}).get("key")
    return None


DATA_AVAIL_RE = re.compile(
    r"(data\s+availab\w*|availability\s+of\s+data|code\s+availab\w*|"
    r"data\s+statement)[^\n]{0,400}",
    re.IGNORECASE)


def grep_data_availability(ftcache_path):
    """Extract the Data Availability snippet from a Zotero ft-cache file.

    Returns up to 300 characters of context, or None.
    """
    if not ftcache_path or not os.path.isfile(ftcache_path):
        return None
    try:
        with open(ftcache_path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError:
        return None
    match = DATA_AVAIL_RE.search(text)
    if not match:
        return None
    start = match.start()
    return text[start:start + 300].strip()


# ---------------------------------------------------------------------------
# Cross-reference against the repo
# ---------------------------------------------------------------------------

REPO_TOP_FILES = ["Papers.md", "Software.md", "Databases.md",
                  "OtherResources.md", "README.md", "CONTRIBUTING.md"]
REPO_DIRS = ["Datasets", "ResearchAreas"]


def load_repo_blob(repo_root):
    """Concatenate every markdown file the script knows to look at."""
    parts = []
    for name in REPO_TOP_FILES:
        p = Path(repo_root) / name
        if p.is_file():
            parts.append(p.read_text(encoding="utf-8"))
    for sub in REPO_DIRS:
        d = Path(repo_root) / sub
        if d.is_dir():
            for p in sorted(d.glob("*.md")):
                parts.append(p.read_text(encoding="utf-8"))
    return "\n".join(parts)


def doi_variants(doi):
    """Return DOI plus the arXiv / bioRxiv / Zenodo bare-ID variants.

    Lets us match `10.48550/arXiv.2410.23326` against `arxiv.org/abs/2410.23326`
    in the repo, and similarly for `10.1101/...` bioRxiv DOIs against
    `biorxiv.org/.../2410.23326`.
    """
    out = [doi]
    if doi.startswith("10.48550/arXiv."):
        out.append(doi.split("arXiv.", 1)[1])
    if doi.startswith("10.1101/"):
        out.append(doi.split("10.1101/", 1)[1])
    if doi.startswith("10.5281/zenodo."):
        out.append(doi.split("zenodo.", 1)[1])
    return out


# Words to ignore when picking distinctive title fragments — too generic
# to disambiguate (every other muscle paper has "single-cell").
TITLE_STOPWORDS = {
    "the", "a", "an", "of", "in", "on", "for", "and", "or", "to", "with",
    "by", "from", "at", "as", "is", "are", "be", "this", "that", "these",
    "those", "based", "via", "using", "using", "use", "uses", "analysis",
    "analyses", "approach", "approaches", "study", "studies", "paper",
    "review", "reviews", "single", "cell", "cells", "rna", "seq", "atlas",
    "data", "molecular", "novel", "new", "comprehensive", "comparative",
    "muscle", "skeletal", "bovine", "porcine", "chicken", "fish", "duck",
    "cattle", "pig", "cultured", "cultivated", "meat", "satellite",
}


def _distinctive_title_words(title):
    """Pick the longest non-stopword title tokens for disambiguation."""
    toks = re.findall(r"[A-Za-z][A-Za-z\-]{3,}", title or "")
    return [t for t in toks if t.lower() not in TITLE_STOPWORDS]


def match_against_repo(doi, title, first_last, year, repo_blob):
    """Three-stage match: exact DOI / DOI variant / fuzzy author+year+title.

    Returns one of:
        ("DOI", <matched-string>)
        ("VARIANT", <matched-string>)
        ("AUTHOR+YEAR+TITLE", "<context snippet>")
        None

    Fuzzy match REQUIRES first-author surname + year + at least one
    distinctive title word all to appear within a 200-char window —
    plain author+year is too permissive (every other muscle paper has
    a "Cai 2024" or "Huang 2021" somewhere in the repo).
    """
    blob_l = repo_blob.lower()
    if doi:
        if doi.lower() in blob_l:
            return ("DOI", doi)
        for v in doi_variants(doi):
            if v != doi and v.lower() in blob_l:
                return ("VARIANT", v)
    if not (first_last and year):
        return None
    distinctive = _distinctive_title_words(title)
    if not distinctive:
        return None
    # Pick the top-2 longest distinctive words — these are the most domain-
    # specific terms in the title (e.g. "flavoromics", "Heterogeneity",
    # "ChickenGTEx") and serve as strong disambiguators.
    distinctive_sorted = sorted(distinctive, key=lambda w: -len(w))
    long_terms = [w for w in distinctive_sorted if len(w) >= 7][:2]
    if not long_terms:
        return None  # title has no distinctive long words — too generic to match
    # Tight window (40 chars) keeps surname and year within the same
    # citation, not adjacent citations on the same matrix line.
    au_year_pat = re.compile(
        rf"\b{re.escape(first_last)}\b.{{0,40}}\b{re.escape(year)}\b",
        re.IGNORECASE | re.DOTALL)
    # Continuation-author rejection: if pre-text ends with an initial+period
    # (optionally followed by comma+space), the surname we found is mid-
    # list, not first-author. Rules out matches like "Ozawa, Y.,
    # Hashizume, T., ... (2025)" when scoping Hashizume's own 2025 paper.
    continuation_pat = re.compile(r"\w\.\s*,?\s*$")
    for m in au_year_pat.finditer(repo_blob):
        pre = repo_blob[max(0, m.start() - 30):m.start()]
        if continuation_pat.search(pre):
            continue
        ctx_start = max(0, m.start() - 120)
        ctx_end = min(len(repo_blob), m.end() + 250)
        window = repo_blob[ctx_start:ctx_end]
        window_l = window.lower()
        if any(w.lower() in window_l for w in long_terms):
            return ("AUTHOR+YEAR+TITLE", window[:200].strip())
    return None


# ---------------------------------------------------------------------------
# Skill-rule "leave it" hinting
# ---------------------------------------------------------------------------

SKILL_RULE_TOOLS = [
    # Tools whose method papers are typically "leave it" per the
    # zotero-to-caail-sync skill rule. The presence of any of these as a
    # standalone word in the candidate's title flags it for human review.
    "COBRApy", "COBRA Toolbox", "RAVEN", "merlin", "GECKO", "ModelSEED",
    "Pathway Tools", "Escher", "BiGG", "MS-DIAL", "MS2Query", "MetFrag",
    "SIRIUS", "XCMS", "MZmine", "Workflow4Metabolomics", "FlavorDB",
    "FooDB", "BitterDB", "MetaCyc", "MassBank", "GNPS", "pyOpenMS",
    "memote", "COPASI", "Tellurium",
]


def skill_rule_hint(title):
    """Return matching tool name(s) if this title triggers a SKILL_RULE flag."""
    hits = []
    for tool in SKILL_RULE_TOOLS:
        if re.search(rf"\b{re.escape(tool)}\b", title or "", re.IGNORECASE):
            hits.append(tool)
    return hits


# ---------------------------------------------------------------------------
# Item normalization
# ---------------------------------------------------------------------------

def normalize_item(it):
    """Pull the fields scope.py cares about out of a raw Zotero record."""
    d = it.get("data", {})
    creators = d.get("creators", []) or []
    first_last = creators[0].get("lastName", "") if creators else ""
    year_match = re.search(r"\b(\d{4})\b", d.get("date", "") or "")
    year = year_match.group(1) if year_match else ""
    return {
        "key": it.get("key"),
        "itemType": d.get("itemType"),
        "doi": (d.get("DOI") or "").strip(),
        "title": (d.get("title") or "").strip(),
        "creators": creators,
        "n_creators": len(creators),
        "first_last": first_last,
        "year": year,
        "date": d.get("date", ""),
        "venue": d.get("publicationTitle", "") or d.get("bookTitle", "")
                  or d.get("proceedingsTitle", "") or "",
        "abstract": (d.get("abstractNote") or "").strip(),
        "url": (d.get("url") or "").strip(),
        "in_collections": sorted(it.get("_in_collections", set())),
    }


# ---------------------------------------------------------------------------
# Report rendering
# ---------------------------------------------------------------------------

def render_markdown(report, collection_labels):
    """Render the human-readable Markdown report."""
    out = []
    out.append(f"# Zotero collection scope report\n")
    out.append(f"**Group:** {report['group']}  ")
    out.append(f"**Collections scoped:** "
               f"{', '.join(collection_labels[k] for k in report['collections'])}\n")
    s = report["summary"]
    out.append(f"**Totals:** {s['total']} distinct paper-type items "
               f"(of {s['raw_total']} raw including attachments/notes). "
               f"In repo: {s['in_repo_doi']} by DOI / "
               f"{s['in_repo_fuzzy']} by author+year. "
               f"GAPS: {s['gaps']}. No-DOI: {s['no_doi']}.\n")
    out.append("\n## Items\n")
    out.append("| Status | DOI | First author · year | Title | Collections |\n")
    out.append("|---|---|---|---|---|\n")
    for item in report["items"]:
        status = item["status"]
        if status[0] in ("DOI", "VARIANT"):
            status_str = f"IN_REPO ({status[0]})"
        elif status[0] == "AUTHOR+YEAR+TITLE":
            status_str = "IN_REPO (fuzzy)"
        elif status[0] == "GAP":
            status_str = "**GAP**"
        elif status[0] == "SKILL_RULE":
            status_str = "GAP (skill-rule?)"
        else:
            status_str = status[0]
        colls = ", ".join(collection_labels.get(k, k)
                          for k in item["in_collections"])
        first = (f"{item['first_last']}{' ' + item['year'] if item['year'] else ''}"
                 if item['first_last'] else "—")
        title_short = item["title"][:80].replace("|", "·")
        doi_show = item["doi"] or "—"
        out.append(f"| {status_str} | `{doi_show}` | {first} | {title_short} | {colls} |\n")

    # Per-item evidence
    out.append("\n## Per-item evidence\n")
    for item in report["items"]:
        if item["status"][0] in ("DOI", "VARIANT"):
            continue  # don't bloat report with already-in-repo items' evidence
        out.append(f"\n### {item['key']} — `{item['doi'] or 'no-DOI'}`\n")
        out.append(f"- **Title:** {item['title']}\n")
        out.append(f"- **Authors ({item['n_creators']}):** "
                   f"{_render_creators(item['creators'])}\n")
        out.append(f"- **Date / Venue:** "
                   f"{item['date'][:10] if item['date'] else '—'}"
                   f" · {item['venue'] or '—'}\n")
        if item["status"][0] == "AUTHOR+YEAR+TITLE":
            out.append(f"- **In-repo match (fuzzy):** "
                       f"`{item['status'][1]}`\n")
        if item["status"][0] == "SKILL_RULE":
            out.append(f"- **Skill-rule hint:** tool(s) flagged in title: "
                       f"{item['status'][1]}\n")
        if item["abstract"]:
            out.append(f"- **Abstract:** "
                       f"{item['abstract'][:400]}"
                       f"{'…' if len(item['abstract']) > 400 else ''}\n")
        if item.get("data_avail"):
            out.append(f"- **Data availability (PDF):** "
                       f"`{item['data_avail'][:300]}`\n")
        elif item.get("pdf_key"):
            out.append(f"- **PDF attached** "
                       f"(key `{item['pdf_key']}`) — no ft-cache yet\n")
        else:
            out.append(f"- **No PDF attached.**\n")

    # Gap summary
    out.append("\n## Summary: GAPS grouped by collection\n")
    for coll_key in report["collections"]:
        label = collection_labels.get(coll_key, coll_key)
        gaps = [it for it in report["items"]
                if it["status"][0] in ("GAP", "SKILL_RULE")
                and coll_key in it["in_collections"]]
        if not gaps:
            continue
        out.append(f"\n### {label} ({len(gaps)} gaps)\n")
        for it in gaps:
            tag = " [SKILL_RULE]" if it["status"][0] == "SKILL_RULE" else ""
            out.append(f"- `{it['doi'] or 'no-DOI':38}` "
                       f"{it['first_last']} {it['year']} · "
                       f"{it['title'][:75]}{tag}\n")
    return "".join(out)


def _render_creators(creators):
    """Render a creators array verbatim (CAAIL convention)."""
    parts = []
    for c in creators[:8]:
        fn, ln = c.get("firstName", "").strip(), c.get("lastName", "").strip()
        if fn or ln:
            parts.append(f"{fn} {ln}".strip())
    if len(creators) > 8:
        parts.append(f"… +{len(creators) - 8}")
    return ", ".join(parts) if parts else "—"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Scope a Zotero collection for CAAIL ingest.")
    parser.add_argument("--group", required=True,
                        help="Zotero group library ID (e.g. 5178481)")
    parser.add_argument("--collection", action="append", default=[],
                        help="Zotero collection key (repeatable)")
    parser.add_argument("--collection-name", action="append", default=[],
                        help="Resolve a collection by display name (repeatable)")
    parser.add_argument("--repo", default=None,
                        help="CAAIL repo root (default: 3 levels up from script)")
    parser.add_argument("--zotero-storage",
                        default=os.path.expanduser("~/Zotero/storage"),
                        help="Path to Zotero/storage for PDF ft-caches")
    parser.add_argument("--api", default="http://localhost:23119/api",
                        help="Local Zotero API base URL")
    parser.add_argument("--json", action="store_true",
                        help="Emit JSON instead of Markdown")
    args = parser.parse_args()

    repo = Path(args.repo) if args.repo \
        else Path(__file__).resolve().parents[3]

    # Resolve collection-name → key
    collection_keys = list(args.collection)
    collection_labels = {}
    for k in collection_keys:
        # Get the label for display
        try:
            info = _get(f"{args.api}/groups/{args.group}/collections/{k}"
                        f"?format=json")
            collection_labels[k] = info.get("data", {}).get("name", k)
        except SystemExit:
            collection_labels[k] = k
    for name in args.collection_name:
        k = resolve_collection_name(args.api, args.group, name)
        if not k:
            sys.exit(f"ERROR: no collection matching name '{name}'")
        collection_keys.append(k)
        collection_labels[k] = name
    if not collection_keys:
        sys.exit("ERROR: pass at least one --collection or --collection-name.")

    # Enumerate items (recursive)
    seen = {}
    for k in collection_keys:
        # Walk this tree, threading `seen` so dupes across collections merge
        fetch_all_items_in_tree(args.api, args.group, k, _seen=seen)

    raw_total = len(seen)
    # Drop attachments and notes
    items = [normalize_item(it) for it in seen.values()
             if it.get("data", {}).get("itemType") not in ("attachment", "note")]

    # Cross-reference + enrich
    repo_blob = load_repo_blob(repo)
    summary = {"total": len(items), "raw_total": raw_total,
               "in_repo_doi": 0, "in_repo_fuzzy": 0,
               "gaps": 0, "no_doi": 0}
    for item in items:
        if not item["doi"]:
            summary["no_doi"] += 1
            item["status"] = ("NO_DOI", None)
            continue
        match = match_against_repo(item["doi"], item["title"],
                                    item["first_last"], item["year"],
                                    repo_blob)
        if match:
            item["status"] = match
            if match[0] in ("DOI", "VARIANT"):
                summary["in_repo_doi"] += 1
            else:
                summary["in_repo_fuzzy"] += 1
            continue
        # It's a gap — check skill-rule hint
        hits = skill_rule_hint(item["title"])
        if hits:
            item["status"] = ("SKILL_RULE", ", ".join(hits))
        else:
            item["status"] = ("GAP", None)
        summary["gaps"] += 1
        # Pull PDF + data-availability evidence for actionable items
        pdf_key = find_pdf_attachment_key(args.api, args.group, item["key"])
        item["pdf_key"] = pdf_key
        if pdf_key:
            ftc = os.path.join(args.zotero_storage, pdf_key, ".zotero-ft-cache")
            item["data_avail"] = grep_data_availability(ftc)
        else:
            item["data_avail"] = None

    report = {
        "group": args.group,
        "collections": collection_keys,
        "summary": summary,
        "items": items,
    }

    if args.json:
        # Serialize, dropping the creators arrays' object structure into
        # plain dicts and dropping the in_collections set's set type.
        for it in items:
            it["in_collections"] = list(it["in_collections"])
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        sys.stdout.write(render_markdown(report, collection_labels))


if __name__ == "__main__":
    main()
