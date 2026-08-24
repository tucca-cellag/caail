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
  43, after Discussion. Any rule that assumes methods precedes results, or that
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
_NUM = r"(?:(?:\d+(?:\.\d+)*|[IVXLC]+|[A-Z])\s*[.)|]?\s+)?"

# Headings that name a methods section. Ordered vocabulary, not a guess: every
# alternative past the first three was added because a paper in the corpus used
# it and the previous regex missed it.
#
# Two tiers again, for a different reason. An UNAMBIGUOUS anchor ("Materials and
# Methods", "STAR METHODS") may carry trailing text, because PDF layout runs the
# next heading onto the same line often enough to matter: ref 92 prints
# "Materials and methods summary Data curation and processing" and ref 259
# prints "Methods Materials". Requiring end-of-string there loses a real section.
# A bare or generic anchor ("Methods", "Approach") must still match the whole
# heading, or a results heading like "Methods for X outperformed Y" would win.
_METHODS_ANCHOR = (
    r"materials\s+and\s+methods(?:\s+summary)?"
    r"|methods?\s+(?:and\s+)?materials"
    r"|(?:online|star|extended|supplementary|detailed)\s*[+★*]?\s*methods?"
    r"|methods?\s+summary|summary\s+of\s+methods?"
)

METHODS_HEADING_RE = re.compile(
    _NUM + r"(?:"
    # Unambiguous anchors: trailing text allowed.
    rf"(?:{_METHODS_ANCHOR})\b.*"
    # Generic anchors: must match the whole heading.
    r"|(?:"
    r"methods?"
    r"|methodology"
    r"|experimental(?:\s+(?:section|procedures?|methods?|setup|design))?"
    r"|experiments?(?:\s+(?:setup|design))?"
    r"|implementation(?:\s+details?)?"
    r"|model(?:\s+architecture|\s+design)?"
    # "Coscientist system architecture" (ref 70): Nature articles name the
    # architecture section after the system, so allow a leading word.
    r"|(?:\w+\s+)?system\s+(?:overview|design|architecture|description)"
    r"|(?:our|the|proposed)\s+(?:method|approach|model|framework|architecture|system|pipeline)"
    r"|\w+\s+algorithm"
    r"|algorithms?"
    r"|approach"
    r"|data\s+and\s+methods"
    r")\s*"
    r")$",
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
    # Science prints "REFERENCES AND NOTES" (refs 14, 80, 92); requiring
    # "references" to end the heading missed every one of them.
    r"|references(?:\s+and\s+notes)?|bibliography|works\s+cited"
    r"|literature\s+cited"
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


# Decorative glyphs some publishers print before a section heading. ACS sets its
# headings as "■ MATERIALS AND METHODS", which matched nothing until these were
# stripped; ref 105 resolved to no section at all because of one square.
_DECOR_RE = re.compile(r"^[\s■▪●◇◆★☆§*†‡•~_=–—-]+")


# Headings that introduce a data- or code-availability statement, which is where
# a paper names the accessions it deposited. Measured across the 303 ingested
# documents, 128 carry one, in at least 14 spellings differing by case, by the
# word "statement", and by whether data and code are announced together.
AVAILABILITY_HEADING_RE = re.compile(
    _NUM + r"(?:"
    r"(?:data|code|software)\s+(?:and\s+(?:code|data|materials?)\s+)?"
    r"availability(?:\s+statement)?"
    r"|availability\s+of\s+(?:data|code|materials?)[\s\w]*"
    r"|data\s+and\s+(?:code|materials?)\s+availability[\s\w]*"
    r"|accession\s+(?:codes?|numbers?)"
    r"|data\s+access(?:ibility)?(?:\s+statement)?"
    r"|resource\s+availability"
    r"|key\s+resources\s+table"
    r"|data\s+deposition"
    r")\s*$",
    re.IGNORECASE)


def find_labeled_spans(headings, pattern):
    """Every span whose heading matches `pattern`, as (start, end) index pairs.

    Unlike the methods section, an availability statement is short back matter,
    usually one or two paragraphs, and a paper often prints several in a row
    ("Data availability" then "Code availability"). So each span runs only to the
    NEXT heading of any kind rather than to the next strong one: extending
    further would swallow the acknowledgements and the reference list, and an
    accession scraped out of a reference list is a citation of someone else's
    deposit, which is the exact confusion this is meant to remove.

    `end` is None when the span runs to the end of the document.
    """
    texts = [_clean(h.get("text")) for h in headings]
    out = []
    for i, t in enumerate(texts):
        if not t or not pattern.match(t):
            continue
        end = i + 1 if i + 1 < len(texts) else None
        out.append({"start": i, "end": end, "heading": t,
                    "end_heading": texts[end] if end is not None else ""})
    return out


def _clean(text):
    """Normalize a heading for matching.

    Collapses whitespace, strips publisher decoration from the front, and drops
    a trailing colon. Section *numbering* is not stripped here -- `_NUM` handles
    it inside each pattern, so that a heading which is only a number stays
    distinguishable from one with no numbering at all.
    """
    t = re.sub(r"\s+", " ", (text or "")).strip()
    t = _DECOR_RE.sub("", t)
    return t.rstrip(":").strip()


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
    # Index 0 gets no special treatment: it is usually the title, but the title
    # is a long sentence that does not match the vocabulary, and on a PDF whose
    # first section_header IS the methods heading, skipping index 0 discarded the
    # only evidence there was. The front-matter and pre-introduction guards are
    # what actually reject a contents entry.
    candidates = []
    for i, t in enumerate(texts):
        if not t or FRONT_MATTER_RE.match(t):
            continue
        if intro is not None and i < intro:
            continue          # listed before the introduction: contents, not section
        if METHODS_HEADING_RE.match(t):
            candidates.append(i)

    if candidates:
        def span_size(i):
            end = end_after(i)
            return (end if end is not None else len(texts)) - i

        # Prefer the FIRST candidate. Overriding that on span size alone is
        # wrong for a document with several legitimate methods sections: ref 18
        # is a dissertation whose every chapter has one, and "the biggest" picks
        # a chapter arbitrarily. So override only when the first looks like a
        # pointer rather than a section -- ref 115 prints "STAR + METHODS" on
        # page 11 as a cross-reference to the real section on page 14 -- which
        # means a nearly empty first span AND a substantially larger later one.
        best = candidates[0]
        if span_size(best) < 3:
            bigger = [i for i in candidates[1:] if span_size(i) >= 4]
            if bigger:
                best = max(bigger, key=span_size)
        end = end_after(best)
        return {
            "found": True,
            "strategy": "explicit",
            "start": best,
            "end": end,
            "heading": texts[best],
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
