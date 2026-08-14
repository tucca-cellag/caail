#!/usr/bin/env python3
"""Guard the attachment classifier that decides what gets converted.

Stdlib only: no Zotero, no network, no PDFs, no docling. Run:

    python3 .claude/skills/matrix-classification-audit/hpc/stage_pdfs.test.py

`SUPPLEMENT_RE` looks cosmetic and is not. A supplement whose filename it does
not recognise is counted as a second main text, and the ref is then reported as
a probable duplicate pair -- so the papers whose methods live in a supplement,
which are the entire reason merging exists, are the ones flagged. The first
version knew two conventions and missed Springer, Elsevier, Wiley and PNAS,
which is most of the corpus's supplements.

Ordering matters for the same reason it matters in `docling_sections`: the
section rule reads in document order, so a supplement placed before the main
text puts its front matter ahead of the article's introduction.
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "stage_pdfs", os.path.join(HERE, "stage_pdfs.py"))
sp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sp)

fails = 0


def check(name, got, want):
    global fails
    ok = got == want
    if not ok:
        fails += 1
    print(f'  [{"PASS" if ok else "FAIL"}] {name}')
    if not ok:
        print(f"         got {got!r}, want {want!r}")


# ---------------------------------------------------------------------------
print("\n=== supplements are recognised across publishers ===")

# Each of these is a real filename shape. The comment names the publisher because
# the next one to be missed will be a publisher nobody thought of, and the list
# is the record of which have been.
SUPPLEMENTS = [
    ("NIHMS2050423-supplement-Supplementary_Material.pdf", "PMC author manuscript"),
    ("media-1.pdf", "OUP / BMC publisher media"),
    ("41586_2024_1234_MOESM1_ESM.pdf", "Springer Nature"),
    ("1-s2.0-S0308814624001234-mmc1.pdf", "Elsevier"),
    ("jcb-2021-sup-0001-figs1.pdf", "Wiley"),
    ("pnas.2201234119.sapp.pdf", "PNAS"),
    ("acs-jafc-supporting-information.pdf", "ACS / RSC"),
    ("paper_si.pdf", "generic supporting-information suffix"),
    ("Supplementary Data.pdf", "the plain word"),
    ("appendix-a.pdf", "appendix"),
    ("Supplemental Information.pdf", "Cell Press"),
    ("Supplemental Material.pdf", "the -al spelling"),
    ("Smith2024_supplement.pdf", "bare 'supplement' as a suffix"),
    ("Supplement.pdf", "bare 'supplement' alone"),
    ("science.abc1234_sm.pdf", "Science"),
]
for fname, who in SUPPLEMENTS:
    check(f"{who}: {fname}", bool(sp.SUPPLEMENT_RE.search(fname)), True)

print("\n=== article PDFs are NOT mistaken for supplements ===")

# The false-positive direction costs the opposite error: a main text sorted after
# the supplement, so the section rule meets the supplement's front matter first.
ARTICLES = [
    "Lee et al. - 2023 - A principal odor map unifies diverse tasks.pdf",
    "Queen et al. - 2025 - ProCyon A multimodal foundation model.pdf",
    "Sarlakifar et al. - 2025 - AllerTrans.pdf",
    "1-s2.0-S0308814624001234-main.pdf",
    "41586_2024_1234_Article.pdf",
    # The false-positive direction, and the reason every alternative is anchored.
    # A Zotero filename embeds the paper's TITLE, and this corpus is about cell
    # culture, so these are ordinary words here rather than exotic edge cases.
    # Each one, unanchored, made the article classify as a supplement -- and if
    # it is the item's only PDF, `n_main` is 0 and the ref is refused outright.
    "Zhang et al. - 2024 - Effect of amino acid supplementation on myoblasts.pdf",
    "Lee et al. - 2023 - Serum-free media supplemented with growth factors.pdf",
    "Kim et al. - 2025 - Appendix-free protocol for scaffold seeding.pdf",
    "Roell et al. - 2022 - Supporting information systems for bioprocess.pdf",
    "Du et al. - 2025 - Supplementing basal medium for bovine satellite cells.pdf",
]
for fname in ARTICLES:
    check(f"article: {fname[:48]}", bool(sp.SUPPLEMENT_RE.search(fname)), False)

# ---------------------------------------------------------------------------
print("\n=== ordering puts the article first and supplements after ===")


def names(ordered):
    return [f for _k, f in ordered]


check("supplement after main text regardless of Zotero's order",
      names(sp.order_main_text_first([
          ("K1", "NIHMS1-supplement-Supplementary_Material.pdf"),
          ("K2", "Lee et al. - 2023 - A principal odor map.pdf"),
      ])),
      ["Lee et al. - 2023 - A principal odor map.pdf",
       "NIHMS1-supplement-Supplementary_Material.pdf"])

check("an already-correct order is preserved",
      names(sp.order_main_text_first([
          ("K1", "Queen et al. - 2025 - ProCyon.pdf"),
          ("K2", "media-1.pdf"),
      ])),
      ["Queen et al. - 2025 - ProCyon.pdf", "media-1.pdf"])

# Two unrecognised names keep Zotero's relative order rather than being reordered
# on a guess. The caller records this case as ambiguous and merges it.
check("unrecognised names keep their given order",
      names(sp.order_main_text_first([
          ("K1", "aaa.pdf"), ("K2", "bbb.pdf"),
      ])),
      ["aaa.pdf", "bbb.pdf"])

check("several supplements all follow the article",
      names(sp.order_main_text_first([
          ("K1", "mmc1.pdf"), ("K2", "article-main.pdf"), ("K3", "mmc2.pdf"),
      ])),
      ["article-main.pdf", "mmc1.pdf", "mmc2.pdf"])

# ---------------------------------------------------------------------------
print("\n=== the three classifier outcomes, which decide what is converted ===")

# `n_main` is the count of attachments that do NOT look like supplements, and it
# selects between three behaviours in `main()`. The count is asserted here rather
# than the branch because the branch needs live Zotero; getting the count wrong is
# what makes the branch wrong.


def n_main(*filenames):
    return sum(1 for f in filenames if not sp.SUPPLEMENT_RE.search(f))


check("article + supplement -> 1 (the normal merge)",
      n_main("Lee et al. - 2023 - A principal odor map.pdf",
             "NIHMS1-supplement-Supplementary_Material.pdf"), 1)

# > 1 is merged and recorded as ambiguous. It cannot be told from a filename
# whether this is a duplicated article or an unrecognised supplement, and merging
# a duplicate still finds the methods while skipping a supplement does not.
check("two article-looking PDFs -> 2 (ambiguous, merged, recorded)",
      n_main("article-v1.pdf", "article-accepted.pdf"), 2)

# 0 is refused. Every attachment looking like a supplement means the article
# itself is probably absent, and staging it would convert supplement-only text
# into a document reported as this paper's full text -- a confident
# has_fulltext over none of the article, which nothing downstream can detect.
check("supplement-only item -> 0 (refused)",
      n_main("NIHMS1-supplement-Supplementary_Material.pdf", "mmc1.pdf"), 0)

check("a lone article -> 1",
      n_main("Sarlakifar et al. - 2025 - AllerTrans.pdf"), 1)

# ---------------------------------------------------------------------------
print()
if fails:
    print(f"FAILED: {fails} check(s)")
    sys.exit(1)
print("all checks passed")
