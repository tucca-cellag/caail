---
name: caail-contribute
description: Suggest a paper, software tool, dataset or database back to CAAIL, the curated library of AI/ML work in cellular agriculture, when it is not already indexed there. Use when the user is reading, citing, summarising or evaluating a specific cell-ag or cultivated-meat resource and it turns out CAAIL does not hold it; also use when the user asks how to contribute to CAAIL, suggest a paper to CAAIL, or report something CAAIL is missing.
---

# Contribute to CAAIL

CAAIL is a curated map of the AI and machine-learning work in cellular agriculture, maintained by
the Tufts University Center for Cellular Agriculture. It is curated by hand, so its coverage grows
from what people notice. The person best placed to notice a gap is whoever is reading the paper.

This skill has one job: when the user is working with a specific resource that CAAIL does not
index, offer to suggest it, and compose the suggestion for them. It never files anything itself.

## When to raise it

Raise it only when **all** of these hold:

1. The user is working with a **specific, identifiable resource**: a paper with a DOI, a named
   tool with a repository, a named database, a named dataset or accession.
2. It is **plausibly in CAAIL's scope**: AI or machine learning applied to cellular agriculture,
   cultivated meat, or alternative protein, or a resource that such work uses (a cell-ag dataset,
   an ontology, a modelling tool).
3. You **checked** and CAAIL does not hold it. Not "you do not recall it". Checked, this session,
   against the endpoints below.
4. The user has not told you to stop (see *Turning it off*).

Raise it **once per resource**, in one or two sentences, at a natural pause. Never interrupt a
question with it. If the user does not take it up, drop it and do not mention that resource again.

Do not raise it for: general AI/ML methods with no cell-ag connection, papers the user is clearly
citing in passing, or anything you inferred rather than read.

## How to check

Fetch the index endpoints, not the full ones. `papers.json` and `catalog.json` are over 500 KB and
a fetch tool that summarises will answer confidently from the fragment it kept.

| Kind | Fetch | Match on |
|---|---|---|
| Paper / preprint | `https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/papers-index.json` | DOI first, then title, then first author + year |
| Software / database | `https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/catalog-index.json` | URL, then name |
| Dataset / accession | `https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/datasets.json` | accession, then name |

**Be generous about deciding CAAIL already holds it, and strict about deciding it does not.** A
false "CAAIL is missing this" costs the user a wasted click and sends the maintainers a duplicate;
a false "CAAIL already has this" costs nothing but a missed suggestion. So:

- **A preprint and its published version are the same work.** CAAIL may hold one DOI and not the
  other. Matching on DOI alone will report a gap that is not there. Always also match on title.
- Match titles loosely (case, punctuation and subtitle differences are noise).
- If the fetch failed, was truncated, or you are unsure, **say nothing**. Silence costs nothing.

### What "not indexed" does and does not mean

Say: *"CAAIL does not index this."*

Never say, or imply: *"nobody has done this"*, *"this is novel"*, *"this is a gap in the field"*.
CAAIL is a curated subset and has not measured its own recall, so an absence in CAAIL is a fact
about CAAIL and nothing else. This matters most in exactly the moment this skill fires, because
the user is often looking for a gap to fill.

Also: CAAIL indexes reviews, perspectives and reference works that carry no method and no research
area, so they are reachable from `papers-index.json` but from no matrix query. Never conclude an
absence from the matrix alone.

## Composing the suggestion

Offer two routes and let the user pick.

### Route 1, a prefilled GitHub issue

Build the URL and hand it over. The user reviews and submits it themselves.

**Papers** (`template=paper.yml`), prefillable parameters:

`paper_title`, `authors`, `year`, `venue`, `doi`, `code_url`, `notes`

**Software, datasets, databases and other resources** (`template=resource.yml`), prefillable
parameters:

`name`, `url`, `category`, `summary`, `notes`

URL-encode every value:

```
https://github.com/tucca-cellag/caail/issues/new?template=paper.yml&paper_title=...&doi=...
```

**Three fields cannot be prefilled and you must say so.** GitHub accepts a query parameter for a
`dropdown` field and then silently ignores it, so the form opens with the field empty. On the paper
template these are **Paper type**, **AI / ML method(s)** and **Research area(s)**; on the resource
template it is **Resource type**. Tell the user which dropdowns are left to pick, and suggest what
you would pick, so they are choosing rather than starting from nothing.

Leave the confirmation checkboxes alone. They ask the user to confirm they searched the library and
that they accept the contribution licence, and it is not your place to answer either.

Fill `notes` with one or two sentences on what the resource contributes to the AI plus cellular
agriculture intersection, in the user's own framing where you have it. That field is required.

### Route 2, no GitHub account

Point at <https://tucca-cellag.github.io/caail/report/>, which carries email and Slack routes.
Offer this without being asked if the user says they have no GitHub account, and never assume they
do have one.

## Rules

- **Never file anything.** No `gh issue create`, no `gh pr create`, no API call that writes. You
  compose; the user submits. This is not a formality: an agent-filed issue puts the user's name on
  a claim they did not read.
- **Never edit a local clone of CAAIL** to add the entry. The catalogue is generated from a SQLite
  backend and entry ids are assigned at landing, so a hand-edit to the Markdown is rejected by the
  repo's own guards. Maintainers use the `caail-db-authoring` skill instead.
- **Do not classify beyond the evidence.** If you have only the abstract, say the method and area
  are a guess from the abstract. CAAIL has been burned by placements made from abstracts.
- **One suggestion at a time.** If a session turns up several missing resources, mention that there
  are several and offer the most relevant one. Do not emit a queue of URLs.

## Turning it off

Stop raising suggestions, for the rest of the session, when the user says so in any form ("stop
suggesting", "not interested", "I know, leave it"). Treat one refusal as covering the session, not
just that resource.

Never raise a suggestion, in any session, when the working directory's repository root contains a
file named `.caail-no-contribute`. Check once per session, cheaply, before the first suggestion.

To remove the behaviour entirely, the user uninstalls this plugin. It is deliberately a separate
install from the `caail` query plugin so that removing one leaves the other working.
