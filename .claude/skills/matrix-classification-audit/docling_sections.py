#!/usr/bin/env python3
"""Locate a paper's methods section in an ordered list of document headings.

This is the structural half of the CAAIL-206 ingestion layer. It deliberately
knows nothing about Docling, PDFs or Zotero: it takes an ordered list of
headings (text, page number) and returns the index span of the methods section.
That keeps it unit-testable without a PDF, which matters because the failure
modes it exists to fix were each found in a real paper and each deserves a test.

Why a heading list rather than raw text
---------------------------------------
The extractor this replaces (`extract_matrix_corpus.extract_methods`) runs a
regex over the flat `.zotero-ft-cache` text and takes a fixed 12,000-character
window from the first match. Measured over the 222 matrix refs that have full
text, 213 (96%) hit that window and are cut mid-section, and it has no end
boundary at all, so short methods sections silently absorb Results and
Discussion. Against a heading list the same job is a choice among ~17 short
strings, which affords rules that are unaffordable over 300,000 characters.

The three failure modes this handles, each observed in the sample
-----------------------------------------------------------------
* **Back-matter methods.** Ref 51 (Medea) puts `Online Methods` on page 22 of
  34, after Discussion. Any rule that assumes methods precedes results, or that
  slices from a fixed fraction of the document, captures none of it.
* **Non-standard section names.** Ref 220 calls it `2 Implementation`, ref 333
  calls it `Experiment`, ref 34 calls it `II. GENETIC ALGORITHM`.
* **Roman numerals.** Ref 34 numbers sections `I.`, `II.`, `III.`; a numbering
  prefix of `\\d+\\.` does not match.

When no heading matches the methods vocabulary at all, fall back to the span
between the introduction and the first results-like section, which requires no
methods vocabulary and handles a paper that simply names its middle section
something unanticipated.
"""
import re

# A leading section number: arabic (`2`, `2.1`), roman (`II.`, `iv`), or a
# lettered subsection (`A.`). Roman numerals are why ref 34 fell through.
_NUM = r"(?:(?:\d+(?:\.\d+)*|[IVXLC]+|[A-Z])[.)]?\s+)?"

# Headings that name a methods section. Ordered vocabulary, not a guess: every
# alternative past the first three was added because a paper in the corpus used
# it and the previous regex missed it.
METHODS_HEADING_RE = re.compile(
    _NUM + r"(?:"
    r"materials\s+and\s+methods"
    r"|(?:online|star|extended|supplementary|detailed)\s+methods?"
    r"|methods?(?:\s+and\s+materials)?"
    r"|methodology"
    r"|experimental(?:\s+(?:section|procedures?|methods?|setup|design))?"
    r"|experiments?(?:\s+(?:setup|design))?"
    r"|implementation(?:\s+details?)?"
    r"|model(?:\s+architecture|\s+design)?"
    r"|system\s+(?:overview|design|architecture|description)"
    r"|(?:our|the|proposed)\s+(?:method|approach|model|framework|architecture|system|pipeline)"
    r"|\w+\s+algorithm"
    r"|algorithms?"
    r"|approach"
    r"|data\s+and\s+methods"
    r")\s*$",
    re.IGNORECASE)

# Headings that end a methods section. A methods section runs until the paper
# turns to what it found or to back matter.
END_HEADING_RE = re.compile(
    _NUM + r"(?:"
    r"results?(?:\s+and\s+discussions?)?"
    r"|discussions?(?:\s+and\s+conclusions?)?"
    r"|conclusions?(?:\s+and\s+(?:future\s+work|outlook))?"
    r"|findings"
    r"|acknowledge?ments?"
    r"|references|bibliography|works\s+cited"
    r"|supp(?:lementary|orting)\s+(?:information|data|material|figures?|tables?)"
    r"|data\s+availability"
    r"|code\s+availability"
    r"|(?:author|competing|conflict)[\s\w]*"
    r"|funding"
    r"|declarations?"
    r"|ethics[\s\w]*"
    r"|abbreviations"
    r"|appendix"
    r")\s*$",
    re.IGNORECASE)

# Headings that mark the end of front matter.
INTRO_HEADING_RE = re.compile(
    _NUM + r"(?:introduction|background|overview|motivation)\s*$", re.IGNORECASE)

# Front-matter headings that must never be mistaken for a section start.
FRONT_MATTER_RE = re.compile(
    r"^\s*(?:abstract|summary|graphical\s+abstract|highlights|keywords|"
    r"open\s*access|table\s+of\s+contents|contents)\s*$", re.IGNORECASE)


def _clean(text):
    """Normalize a heading for matching: collapse whitespace, drop trailing colon."""
    return re.sub(r"\s+", " ", (text or "")).strip().rstrip(":").strip()


def find_methods_span(headings):
    """Return the methods span for an ordered heading list.

    `headings` is a list of dicts with at least a "text" key; "page" is used
    only for reporting. Returns a dict:

        {"found": bool, "strategy": str, "start": int|None, "end": int|None,
         "heading": str, "end_heading": str}

    `start` indexes the methods heading itself; `end` indexes the heading that
    terminates the section, or None when the section runs to the end of the
    document. Callers take items in reading order from the start heading up to
    (not including) the end heading.

    Strategy is one of:
      "explicit"    a heading matched the methods vocabulary
      "positional"  no methods heading; used the span between the introduction
                    and the first results-like heading
      "none"        neither applied
    """
    texts = [_clean(h.get("text")) for h in headings]

    def end_after(i):
        """First index > i whose heading ends a section, else None."""
        for j in range(i + 1, len(texts)):
            if END_HEADING_RE.match(texts[j]):
                return j
        return None

    # --- Strategy 1: an explicit methods heading. -------------------------
    #
    # Skip front matter, and skip any heading at index 0 (the title). Prefer the
    # FIRST match, except that a match which is immediately terminated (no body
    # between it and the next section) is not a real section -- some papers list
    # "Methods" in a contents block before using it for real later.
    candidates = []
    for i, t in enumerate(texts):
        if i == 0 or not t or FRONT_MATTER_RE.match(t):
            continue
        if METHODS_HEADING_RE.match(t):
            candidates.append(i)

    for i in candidates:
        end = end_after(i)
        # A methods heading immediately followed by an end heading contains no
        # subsections and no body headings; still legitimate, so accept it.
        return {
            "found": True,
            "strategy": "explicit",
            "start": i,
            "end": end,
            "heading": texts[i],
            "end_heading": texts[end] if end is not None else "",
        }

    # --- Strategy 2: the span between introduction and results. -----------
    #
    # Needs no methods vocabulary at all, which is the point: it catches a paper
    # that names its middle section something nobody anticipated.
    intro = next((i for i, t in enumerate(texts) if INTRO_HEADING_RE.match(t)), None)
    if intro is not None:
        start = intro + 1
        # Walk past any further front matter.
        while start < len(texts) and (not texts[start] or FRONT_MATTER_RE.match(texts[start])):
            start += 1
        if start < len(texts) and not END_HEADING_RE.match(texts[start]):
            end = end_after(start - 1)
            if end is not None and end > start:
                return {
                    "found": True,
                    "strategy": "positional",
                    "start": start,
                    "end": end,
                    "heading": texts[start],
                    "end_heading": texts[end],
                }

    return {"found": False, "strategy": "none", "start": None, "end": None,
            "heading": "", "end_heading": ""}
