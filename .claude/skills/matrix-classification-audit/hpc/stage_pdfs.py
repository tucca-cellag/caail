#!/usr/bin/env python3
"""Stage each ref's PDFs as one `ref-<id>.pdf` for the cluster array, plus refs.txt.

Runs on the machine that has Zotero, since the cluster cannot reach the local
Zotero API. It resolves each ref to its Zotero item the same way
`docling_ingest.py` does, so what gets staged is what the extractor will later
look for.

**It does not build the same input document.** `docling_ingest.resolve_pdfs` takes
`scope.find_pdf_attachment_key`, which is one PDF per item; this merges all of
them. So a ref converted here and the same ref converted by a local
`docling_ingest.py` run differ in their *input*, not merely in extractor version,
and `docs/ref-<id>.json` records neither.

**And the two disagree about what counts as done, in a direction that destroys
work.** `convert_one.py` skips a ref whose `docs/` file exists; `docling_ingest`
skips on `sections/`. The array writes only `docs/`. So in the window between the
array draining and `--respan` succeeding -- or if the respan fails, or ran against
a partial corpus -- a local `docling_ingest.py` run sees no section for any
cluster-converted ref, re-converts every one of them, and **overwrites the merged
`docs/ref-<id>.json` with a single-PDF document**. The refs that lose most are the
merged supplement ones this module exists for, and nothing records the swap.

Run the respan before any local ingest touches the same output directory, or keep
the two corpora apart.

## Why this merges rather than picking one file

`scope.find_pdf_attachment_key` returns a SINGLE pdf per item, which is wrong for
any paper whose methods were published separately. Three refs in this corpus are
exactly that shape: two *Science* papers and a preprint whose main text carries
the model description and results while the methods live in a supplementary PDF.
Converting either file alone loses half the evidence, and letting the resolver
pick whichever it finds first makes the choice silently and differently per ref.

So every PDF attached to the item is merged into one document, main text first
and supplements after. Docling then sees a single paper and `find_methods_span`
locates the methods wherever they actually are.

**The page numbers this produces are merged-document indices**, not the published
article's pagination. For a ref whose methods are in the supplement, a
`methods_pages` of [31, 38] means pages 31-38 of main-text-plus-supplement, which
is neither the article's numbering nor the supplement's own. That is the price of
seeing the whole paper at once, and it is worth paying because the alternative is
not seeing the methods at all.

That trade also decides the ambiguous case below. Two PDFs that both look like
article text are either a duplicate or a supplement this module's pattern does
not recognise, and the filename cannot say which; the ref is merged and recorded
as ambiguous rather than skipped, because merging a duplicate still finds the
methods while skipping a supplement does not.

## Ordering

Supplements go last because the section rule reads in document order, and a
methods heading in the supplement should not be preceded by the supplement's own
front matter appearing before the main text's introduction. The heuristic is the
filename, which is what publishers actually encode: PMC author-manuscript
supplements carry `-supplement-`, and publisher media files are `media-<n>.pdf`.
Anything unrecognised is treated as main text and keeps its relative order, so a
new naming convention degrades to "ordered as Zotero returned it" rather than to
a wrong answer.

Usage:
    python3 stage_pdfs.py --out <dir> [--only N ...] [--matrix-only]
"""
import argparse
import json
import re
import shutil
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
sys.path.insert(0, str(SKILL))
sys.path.insert(0, str(SKILL.parent / "zotero-collection-scope"))

import extract_matrix_corpus as ex  # noqa: E402
import scope  # noqa: E402

# Publisher conventions for "this file is the supplement, not the article".
#
# Breadth matters more than precision here, because of what a miss costs. An
# unrecognised supplement is counted as a second main text, and the duplicate
# check below then refuses the ref -- so the papers whose methods live in a
# supplement, which are the entire reason merging exists, are the ones dropped.
# The first version of this pattern knew only the PMC convention and one
# publisher's, which is most of the corpus's supplements missed.
SUPPLEMENT_RE = re.compile(
    r"supplement(al|ary)?"   # supplement / supplemental / supplementary, anywhere,
                             # which also covers PMC's NIHMS…-supplement-….pdf and
                             # Cell Press "Supplemental Information.pdf"
    r"|supporting[-_ ]info"  # ACS/RSC "Supporting Information"
    r"|^media-\d+\.pdf$"     # OUP/BMC publisher media
    r"|moesm\d*"             # Springer Nature: 41586_2024_1234_MOESM1_ESM.pdf
    r"|mmc\d+"               # Elsevier: 1-s2.0-…-mmc1.pdf
    r"|-sup-\d+"             # Wiley: …-sup-0001-….pdf
    r"|sapp\.pdf$"           # PNAS: pnas.…sapp.pdf
    r"|[-_]sm\.pdf$"         # Science: science.abc1234_sm.pdf
    r"|[-_]si\d*\.pdf$"      # …_si.pdf / …-si1.pdf
    r"|appendix",
    re.I)


def pdf_attachments(api, group, item_key):
    """Every PDF child of an item, not just the first one.

    `scope.find_pdf_attachment_key` deliberately returns only the first; this is
    the same walk without that truncation. Keys come from `data.key` to match
    how the rest of the toolchain addresses attachment storage directories.

    The request is made here rather than through `scope.fetch_item_children`
    because that helper turns a failed request into an empty list. A transient
    local-Zotero error would then be indistinguishable from an item that
    genuinely has no PDF, and the ref would be dropped as `no-pdf-attachment` --
    the silent miss the rest of this script exists to make visible. Letting the
    error propagate puts it in the caller's per-ref handler, where it is recorded
    as what it is.
    """
    url = f"{api}/groups/{group}/items/{item_key}/children"
    with urllib.request.urlopen(url, timeout=30) as resp:
        children = json.load(resp)
    out = []
    for c in children or []:
        d = c.get("data", {})
        if d.get("contentType") != "application/pdf":
            continue
        # Only stored files have a `storage/<key>/` directory. A `linked_url`
        # attachment (a "Full Text PDF" link) or a `linked_file` pointing outside
        # the Zotero store can never resolve to a path, so counting it would make
        # `len(paths) != len(atts)` permanently true: the ref would be recorded
        # as partial and skipped on every run, advised to "sync Zotero" -- which
        # cannot fix it, because there is nothing to sync.
        if d.get("linkMode") not in ("imported_file", "imported_url"):
            continue
        out.append((d.get("key"), d.get("filename") or ""))
    return out


def order_main_text_first(attachments):
    """Main text first, supplements after, each group keeping Zotero's order."""
    main = [a for a in attachments if not SUPPLEMENT_RE.search(a[1])]
    supp = [a for a in attachments if SUPPLEMENT_RE.search(a[1])]
    return main + supp


def merge(paths, dest):
    """Concatenate PDFs into one file. Milliseconds; no rendering, no ML.

    `pypdfium2` is the one non-stdlib import in this skill, and it is deferred
    to here on purpose: every other path through this script -- and every other
    script in the directory -- stays stdlib-only, so a ref with a single PDF
    never needs it installed. It ships as a docling dependency, so any machine
    that can run the ingest already has it.
    """
    import pypdfium2 as pdfium

    out = pdfium.PdfDocument.new()
    for p in paths:
        src = pdfium.PdfDocument(str(p))
        out.import_pages(src)
    out.save(str(dest))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--papers", default=str(SKILL.parents[2] / "Papers.md"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--api", default="http://localhost:23119/api")
    ap.add_argument("--zotero-storage", default=str(Path("~/Zotero/storage").expanduser()))
    ap.add_argument("--group", action="append", default=[])
    ap.add_argument("--only", type=int, action="append", default=[])
    ap.add_argument("--matrix-only", action="store_true")
    args = ap.parse_args()

    groups = args.group or ["6549203", "5178481"]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    storage = Path(args.zotero_storage)

    md = Path(args.papers).read_text(encoding="utf-8")
    _, cell_map = ex.parse_matrix(md)
    refs = ex.parse_references(md)
    matrix_ids = set(cell_map)

    doi_index, url_index = ex.build_indexes(args.api, groups)

    # --only and --matrix-only COMPOSE, matching docling_ingest.py's ordering.
    # Making --only override would let `--only 900 --matrix-only` stage a
    # non-matrix ref without complaint, and leave the two tools disagreeing
    # about the same pair of flags.
    wanted = sorted(set(args.only)) if args.only else sorted(refs)
    if args.matrix_only:
        wanted = [r for r in wanted if r in matrix_ids]

    staged, skipped, merged, partial, ambiguous, suspect = [], [], [], [], [], []

    def write_manifest():
        """Written after every ref, not once at the end.

        An exception mid-loop -- a malformed PDF, or the deferred pypdfium2
        import failing -- would otherwise leave N staged files on disk and no
        refs.txt at all, so the directory looks staged while the documented
        next step (`wc -l < refs.txt`) fails on it.
        """
        # Empty must be a genuinely empty file. "\n".join([]) + "\n" is one
        # newline, so `wc -l < refs.txt` reports 1, the documented submit line
        # launches a one-task array, and "nothing staged" surfaces as a SLURM
        # task failing its `[ -z "$REF" ]` guard instead of as a staging error.
        (out / "refs.txt").write_text(
            "".join(f"{r}\n" for r in staged))
        # `with`, not a bare open(): this runs in a `finally` after every ref
        # precisely so an interrupted run still has a manifest, and a handle
        # closed only by refcounting would leave that manifest truncated on any
        # runtime that does not refcount -- defeating the reason it is written
        # here at all.
        with open(out / "stage-manifest.json", "w", encoding="utf-8") as fh:
            json.dump({"staged": staged, "skipped": skipped,
                       "merged": {str(r): names for r, names in merged},
                       "partial": {str(r): n for r, n in partial},
                       "ambiguous": {str(r): n for r, n in ambiguous},
                       "suspect_join": {str(r): n for r, n in suspect}},
                      fh, indent=2)

    # Written once before the loop as well as after every ref. If `wanted` is
    # empty -- `--only` naming an id that is not in Papers.md, or `--matrix-only`
    # filtering everything out -- the loop body never runs, and a previous run's
    # refs.txt in the same --out would survive intact. The documented next step
    # sizes an array from that file, so the operator would launch against stale
    # content believing they had just re-staged.
    write_manifest()

    for rid in wanted:
        try:
            ref = refs.get(rid)
            if not ref:
                skipped.append((rid, "no-reference"))
                continue
            by_doi = doi_index.get(ref["doi"].lower()) if ref["doi"] else None
            hit = by_doi or (url_index.get(ex._norm_url(ref["url"]))
                             if ref["url"] else None)
            if not hit:
                skipped.append((rid, "not-in-zotero"))
                continue

            group, item = hit
            # Staging is where a wrong join acquires a physical consequence: the
            # other paper's PDF is written to ref-<id>.pdf, the array converts
            # it, and every downstream reader sees a confident has_fulltext with
            # someone else's methods section. Same check as the extractor makes,
            # made here too because this is the copy that ships to the cluster.
            if not by_doi:
                why = ex.check_url_join(rid, ref["url"], item)
                if why:
                    suspect.append((rid, why))
            atts = order_main_text_first(pdf_attachments(args.api, group, item.get("key")))
            paths = []
            for key, _fname in atts:
                d = storage / key
                found = sorted(d.glob("*.pdf")) if d.is_dir() else []
                if found:
                    paths.append(found[0])
            if not paths:
                skipped.append((rid, "no-pdf-attachment"))
                continue

            # An attachment Zotero knows about but has not downloaded (or a
            # linked file with no storage directory) is a silent half-merge:
            # `paths` comes back short, the merge branch may not run at all, and
            # the result is indistinguishable from a genuinely single-PDF ref.
            #
            # So it is SKIPPED, not staged with a note. Staging it converts the
            # supplement alone into a `docs/ref-<id>.json` that looks exactly like
            # a complete one, which is the expensive, invisible error; leaving the
            # ref out is the cheap, visible one. Same choice as `build_indexes`
            # makes on the join, for the same reason.
            if len(paths) != len(atts):
                partial.append((rid, f"only {len(paths)} of {len(atts)} attachments "
                                     f"are on disk"))
                continue

            # More than one non-supplement PDF is EITHER two copies of the same
            # article (a publisher "Full Text PDF" beside an accepted manuscript)
            # OR a supplement whose filename this pattern does not recognise.
            # The two are indistinguishable from the name alone, and the pattern
            # will always be incomplete -- publishers keep inventing conventions,
            # which is the same reason the section rule needs periodic work.
            #
            # So this records rather than decides, and the residual case MERGES.
            # An earlier version skipped instead, which inverted the feature: a
            # supplement under an unrecognised name made the ref look like a
            # duplicate pair, and the papers whose methods live in a supplement --
            # the entire population merging exists for -- were the ones dropped.
            # Merging a genuine duplicate costs distorted page numbers and a
            # doubled availability statement, and the methods are still found;
            # skipping a genuine supplement costs the methods altogether.
            n_main = sum(1 for _k, fname in atts if not SUPPLEMENT_RE.search(fname))
            if n_main > 1:
                ambiguous.append((rid, f"{n_main} PDFs look like main text: "
                                       f"{', '.join(f for _k, f in atts)}"))
            # And the mirror case, which is worse and was unchecked. If EVERY
            # attachment classifies as a supplement, either only the supplement
            # was downloaded or an article filename false-positived on one of the
            # looser alternatives (`supplementary`, `appendix` match anywhere).
            # Nothing else notices: the counts agree so it is not `partial`, and
            # the ref stages, converts, and reports a confident has_fulltext over
            # a document containing none of the article. Staging supplement-only
            # text is the expensive invisible failure, so it is refused.
            elif n_main == 0:
                skipped.append((rid, f"every attachment looks like a supplement, so "
                                     f"the article itself may be missing: "
                                     f"{', '.join(f for _k, f in atts)}"))
                continue

            dest = out / f"ref-{rid}.pdf"
            if len(paths) == 1:
                shutil.copy2(paths[0], dest)
            else:
                merge(paths, dest)
                merged.append((rid, [p.name for p in paths]))
            staged.append(rid)
        except Exception as exc:  # noqa: BLE001 - one bad ref must not strand the rest
            skipped.append((rid, f"{type(exc).__name__}: {exc}"))
        finally:
            write_manifest()

    print(f"staged {len(staged)} refs -> {out}")
    if merged:
        print(f"merged multi-PDF refs ({len(merged)}):")
        for rid, names in merged:
            print(f"  ref {rid}:")
            for n in names:
                print(f"      {n}")
    if suspect:
        print(f"SUSPECT JOIN -- matched a Zotero item only after dropping a URL "
              f"fragment that may carry the paper's identity ({len(suspect)}). "
              f"The wrong paper's PDF would be staged under this ref:")
        for rid, why in suspect:
            print(f"  ref {rid}: {why}")
    if ambiguous:
        print(f"CHECK -- merged, but the attachments could not be classified "
              f"({len(ambiguous)}). Either a supplement this pattern does not "
              f"recognise (fine, and worth adding to SUPPLEMENT_RE) or two copies "
              f"of the same article (converted twice; remove one and re-stage):")
        for rid, why in ambiguous:
            print(f"  ref {rid}: {why}")
    if partial:
        print(f"INCOMPLETE -- some attachments were not on disk ({len(partial)}):")
        for rid, why in partial:
            print(f"  ref {rid}: {why}  (sync Zotero, then re-stage this ref)")
    if skipped:
        print(f"skipped {len(skipped)}:")
        for rid, why in skipped:
            print(f"  ref {rid}: {why}")


if __name__ == "__main__":
    main()
