#!/usr/bin/env python3
"""Guard the URL normalizer that joins Papers.md refs to Zotero items.

Needs no Docling, no Zotero, no network and no gitignored corpus, which is why
CI can run it.

Run:  python3 .claude/skills/matrix-classification-audit/norm_url.test.py

The block that matters is the fragment one. `has_fulltext: false` is read as
"we do not have this paper", but it only ever meant "the matcher could not reach
it". Ref 52 sat in the library with a PDF attached and 63,880 characters indexed
while every report called it missing, because Zotero had stored the URL as
captured -- from a comment anchor, so with `#discussion` on the end -- and the
join saw two different resources. The cost of that gap is not a failed lookup,
it is someone being sent to re-acquire a paper that was already there.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "zotero-collection-scope"))

import extract_matrix_corpus as ex  # noqa: E402

fails = 0


def check(name, got, want):
    global fails
    ok = got == want
    if not ok:
        fails += 1
    print(f'  [{"PASS" if ok else "FAIL"}] {name}')
    if not ok:
        print(f"         got {got!r}, want {want!r}")


def same(name, a, b):
    check(name, (ex._norm_url(a), ex._norm_url(a) == ex._norm_url(b)),
          (ex._norm_url(b), True))


def differ(name, a, b):
    check(name, ex._norm_url(a) == ex._norm_url(b), False)


# ---------------------------------------------------------------------------
print("\n=== fragments: a position within a resource, not another resource ===")

# The real pair. Papers.md cites the forum URL; Zotero captured it from a
# comment anchor.
same("openreview forum vs the same forum with #discussion",
     "https://openreview.net/forum?id=FmDuKzM8f7",
     "https://openreview.net/forum?id=FmDuKzM8f7#discussion")

same("a section anchor does not make a different paper",
     "https://www.nature.com/articles/s41586-020-2649-2",
     "https://www.nature.com/articles/s41586-020-2649-2#Sec12")

check("fragment is stripped, not merely ignored in comparison",
      ex._norm_url("https://example.org/a?b=c#frag"), "example.org/a?b=c")

check("a bare fragment leaves nothing behind",
      ex._norm_url("https://example.org/#top"), "example.org")

# ---------------------------------------------------------------------------
print("\n=== the query string is NOT a fragment and must survive ===")

# OpenReview identifies the paper entirely in the query string, so dropping it
# would collapse every paper on the site to one key -- a far worse failure than
# the one being fixed.
differ("two OpenReview papers stay distinct",
       "https://openreview.net/forum?id=FmDuKzM8f7",
       "https://openreview.net/forum?id=av4QhBNeZo")

check("query string is preserved verbatim",
      ex._norm_url("https://openreview.net/forum?id=FmDuKzM8f7"),
      "openreview.net/forum?id=fmdukzm8f7")

# ---------------------------------------------------------------------------
print("\n=== the pre-existing behaviour still holds ===")

same("scheme is dropped", "https://doi.org/10.1/x", "http://doi.org/10.1/x")
same("case is folded", "https://DOI.org/10.1/X", "https://doi.org/10.1/x")
same("trailing slash is dropped", "https://example.org/a/", "https://example.org/a")
same("surrounding whitespace is stripped",
     "  https://example.org/a  ", "https://example.org/a")

check("None is tolerated", ex._norm_url(None), "")
check("empty string is tolerated", ex._norm_url(""), "")

# A trailing slash before a fragment must still lose both.
check("slash and fragment together",
      ex._norm_url("https://example.org/a/#frag"), "example.org/a")

# ---------------------------------------------------------------------------
print()
if fails:
    print(f"FAILED: {fails} check(s)")
    sys.exit(1)
print("all checks passed")
