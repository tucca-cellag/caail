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

# Headings that end a methods section, in two tiers. The split is load-bearing.
#
# STRONG headings are ones a paper never nests INSIDE its methods section: it has
# turned to what it found, or to the back matter proper.
STRONG_END_RE = re.compile(
    _NUM + r"(?:"
    r"results?(?:\s+and\s+discussions?)?"
    r"|discussions?(?:\s+and\s+conclusions?)?"
    r"|conclusions?(?:\s+and\s+(?:future\s+work|outlook))?"
    r"|findings"
    r"|acknowledge?ments?"
    r"|references|bibliography|works\s+cited"
    r"|(?:author|competing|conflict)[\s\w]*"
    r"|funding"
    r"|declarations?"
    r")\s*$",
    re.IGNORECASE)

# WEAK headings are back matter that ALSO appears as a methods subsection. A
# paper writes "Ethics statement", "Data availability" or "Code availability"
# under Materials and Methods routinely. Treating these as unconditional
# terminators collapsed the section to its own heading: "Materials and Methods"
# followed by "Ethics statement" yielded 22 characters, and because
# `read_docling_section` only rejected an EMPTY section, that fragment then beat
# the ft-cache and was labelled the better evidence. So they end a section only
# when no strong heading follows -- which is the genuine back-matter case, such
# as a Nature paper whose Online Methods run to Data availability and stop.
WEAK_END_RE = re.compile(
    _NUM + r"(?:"
    r"supp(?:lementary|orting)\s+(?:information|data|material|figures?|tables?)"
    r"|data\s+availability"
    r"|code\s+availability"
    r"|ethics[\s\w]*"
    r"|abbreviations"
    r"|appendix"
    r"|reporting\s+summary"
    r")\s*$",
    re.IGNORECASE)


def is_end_heading(text):
    """True if `text` terminates a section under either tier."""
    return bool(STRONG_END_RE.match(text) or WEAK_END_RE.match(text))

# Headings that mark the end of front matter. `Main` is Nature's house style for
# the opening section and is why ref 41 (ToolUniverse) resolved to nothing at
# all: no heading matched the methods vocabulary, and with no introduction to
# anchor to, the positional strategy had nowhere to start either.
INTRO_HEADING_RE = re.compile(
    _NUM + r"(?:introduction|background|overview|motivation|main)\s*$",
    re.IGNORECASE)

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
        """Index of the heading that ends the section starting at `i`, or None.

        A strong heading wins wherever it appears. A weak one is used only when
        no strong heading follows at all, because a weak heading inside the
        methods section would otherwise truncate it to nothing.
        """
        for j in range(i + 1, len(texts)):
            if STRONG_END_RE.match(texts[j]):
                return j
        for j in range(i + 1, len(texts)):
            if WEAK_END_RE.match(texts[j]):
                return j
        return None

    # Where the front matter ends. A methods-looking heading BEFORE this is not
    # the methods section: it is a contents block listing the sections to come.
    intro = next((i for i, t in enumerate(texts) if INTRO_HEADING_RE.match(t)), None)

    # --- Strategy 1: an explicit methods heading. -------------------------
    #
    # Take the first match that is not front matter. Index 0 gets no special
    # treatment: it is usually the title, but the title is a long sentence that
    # does not match the vocabulary, and on a PDF whose first section_header IS
    # the methods heading, skipping index 0 discarded the only evidence there was.
    # The front-matter guard below is what actually rejects a contents entry.
    for i, t in enumerate(texts):
        if not t or FRONT_MATTER_RE.match(t):
            continue
        if intro is not None and i < intro:
            continue          # listed before the introduction: contents, not section
        if not METHODS_HEADING_RE.match(t):
            continue
        end = end_after(i)
        return {
            "found": True,
            "strategy": "explicit",
            "start": i,
            "end": end,
            "heading": t,
            "end_heading": texts[end] if end is not None else "",
        }

    # --- Strategy 2: the span between introduction and results. -----------
    #
    # Needs no methods vocabulary at all, which is the point: it catches a paper
    # that names its middle section something nobody anticipated.
    if intro is not None:
        start = intro + 1
        # Walk past any further front matter.
        while start < len(texts) and (not texts[start] or FRONT_MATTER_RE.match(texts[start])):
            start += 1
        if start < len(texts) and not is_end_heading(texts[start]):
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
