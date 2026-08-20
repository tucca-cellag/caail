---
name: caail-contribute
description: Suggest a paper, software tool, dataset or database back to CAAIL, the curated library of AI/ML work in cellular agriculture, when it is not already indexed there. Use when the user is reading, citing, summarising or evaluating a specific cell-ag or cultivated-meat resource and it turns out CAAIL does not hold it; also use when the user asks how to contribute to CAAIL, suggest a paper to CAAIL, or report something CAAIL is missing.
disallowed-tools: Bash, Write, Edit, NotebookEdit, Agent
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

**Then check you got the whole file, because a smaller one can truncate too.** Both index endpoints
carry a `count` before their rows, and a `truncationNote` saying what to do. Compare the rows you
actually parsed against `count`. Fewer means you are holding part of the corpus, so you have not
established anything: say which check you could not complete, and offer no suggestion from it. This
is the cheapest way to avoid the false "CAAIL is missing this" that costs a stranger their goodwill.

| Kind | Fetch | Match on |
|---|---|---|
| Paper / preprint | `https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/papers-index.json` | DOI first, then title, then first author + year |
| Software / database | `https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/catalog-index.json` | URL, then name |
| Dataset / accession | `https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/datasets.json` | accession, then name |

**`catalog-index.json` holds software and databases only, and nothing else has an endpoint.**
CAAIL also curates awesome lists, talks, editorials and ecosystem initiatives, reference works and
funding programmes, and **none of them is served by any endpoint you can reach**. A curated
bibliography repository satisfies the "named tool with a repository" trigger above word for word
and will be absent from `catalog-index.json` whether or not CAAIL holds it. So a miss in the
catalogue index is only evidence about software and databases. For anything else, you have not
checked and cannot say you have: tell the user CAAIL may already list it under a page you could
not query, and let them decide whether to look.

**Datasets have no index endpoint, and that bounds what you may conclude from them.** There is no
`datasets-index.json`; `datasets.json` is the full file at roughly 330 KB, so for datasets the
hazard above is unavoidable rather than avoidable. If your fetch returns bytes you can read it
normally. If it summarises, you cannot establish a dataset absence from it at all: say which
accession you could not check, and do not offer a suggestion on that basis.

`datasets.json` carries **two arrays and you must read both**: `entries` (curated portals, atlases
and GEMs) and `inventory` (the per-study deposits). Accessions live on the `inventory` rows, so
checking `entries` alone covers a minority of the corpus and reports a gap for every deposit.

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

## Before you compose: the destination is public and permanent

Everything you put in that issue becomes world-readable the moment the user submits it, and stays
so. GitHub issues can be deleted, but GHArchive captures every public event into a permanently
queryable dataset, so deleting one ten minutes later does not unpublish it.

That matters here more than it would elsewhere, because this skill fires exactly when someone is
**reading** something. Check where the resource came from before composing anything:

- **A published paper, a public repository, a public dataset** is fine. That is the normal case.
- **A manuscript under review, a collaborator's draft, an unpublished preprint, anything under
  embargo or shared in confidence** is not. Do not compose a suggestion for it, and say why: it can
  be suggested once it is public. This includes work the user is reviewing *for* a journal.
- **If you cannot tell, ask.** One question costs a moment; a title and abstract of someone else's
  unpublished work in a public tracker cannot be taken back.

**Describe the resource, not the user's opinion of it.** You will often have their assessment,
because that is what they were doing when this fired, and a suggestion needs a reason the resource
fits rather than a verdict on its quality. "Applies Bayesian optimisation to serum-free media
design" is a reason. "The stats are weak but the media work is worth having" is a private remark
about identifiable authors, and it does not become publishable because it is accurate. If the
user's own framing carries that kind of judgement, summarise the contribution instead and let them
add anything else themselves.

## Composing the suggestion

Offer two routes and let the user pick.

### Route 1, a prefilled GitHub issue

Build the URL and hand it over. The user reviews and submits it themselves.

**Papers** (`template=paper.yml`), prefillable parameters:

`paper_title`, `authors`, `year`, `venue`, `doi`, `code_url`, `notes`

**Papers** (`template=paper.yml`), fields to pick by hand:

`paper_type`, `ai_methods`, `research_areas`

**Software, datasets, databases and other resources** (`template=resource.yml`), prefillable
parameters:

`name`, `url`, `category`, `summary`, `notes`

**Software, datasets, databases and other resources** (`template=resource.yml`), fields to pick by
hand:

`resource_type`

**Set `title` as well.** It is not a form field, it is GitHub's built-in issue title, and it is the
one parameter neither list above covers. Leave it out and the issue is created under the template's
literal placeholder, so the tracker fills with entries called `[Paper] <Author YEAR — short title>`.
Follow the placeholder's shape: `[Paper] Cosenza 2024 — multi-fidelity Bayesian media design`, or
`[Resource] <name>` on the resource template.

URL-encode every value:

```
https://github.com/tucca-cellag/caail/issues/new?template=paper.yml&title=...&paper_title=...&doi=...
```

**The pick-by-hand fields cannot be prefilled, and you must say so.** GitHub accepts a query
parameter for a `dropdown` field and then silently ignores it, so the form opens with that field
empty however carefully you built the URL. Name the ones on the template you are using, by the
label the form shows, and suggest what you would pick, so the user is choosing rather than starting
from nothing. Both lists above are reconciled against the templates at build time, so read them
rather than counting from memory.

**The method and area dropdowns are a coarse triage list and do not track the live matrix**, which
carries more method rows than the form offers. So do not treat the options as the vocabulary: name
the real method and area from
<https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/taxonomy.json> in the
free-text field, and suggest the nearest option, or `Other`, for the dropdown itself. A maintainer
assigns the final cell, so a precise sentence in the notes is worth more than a forced dropdown
pick, and claiming a row that does not exist is worse than either.

Leave the confirmation checkboxes alone. They ask the user to confirm they searched the library and
that they accept the contribution licence, and it is not your place to answer either.

**The free-text field is required on both templates, and it is not the same field.** On
`paper.yml` it is `notes`. On `resource.yml` it is `summary`, which becomes the body text of the
published entry, while `notes` there is optional and is for anything that did not fit a structured
field. Write one or two sentences on what the resource contributes to the AI plus cellular
agriculture intersection, bearing in mind the public-destination rule above: the user's framing is
useful where it explains the fit, and is not to be transcribed where it is a judgement about the
authors.

### Route 2, no GitHub account

Point at <https://tucca-cellag.github.io/caail/community/>, where proposing an addition is handled
and where suggestions go in Slack without a GitHub account. Hand over the summary you would have
put in the issue, so the user has something to paste rather than starting again. Offer this without
being asked if the user says they have no GitHub account, and never assume they have one.

Say **Slack**, not email. The only addresses on that page are the Code of Conduct report contacts,
and directing a resource suggestion to them is worse than giving no route at all.

**Not `/report/`.** That page is for an entry CAAIL already has that is wrong, its composer only
renders for a supplied entry id, and its GitHub route opens the correction template. Sending
someone there moments after telling them their paper is *missing* asks them which existing entry
they are correcting. Use it only when the user's point is that a real entry is wrong.

## Rules

- **Never file anything.** No `gh issue create`, no `gh pr create`, no API call that writes. You
  compose; the user submits. This is not a formality: an agent-filed issue puts the user's name on
  a claim they did not read.

  The `disallowed-tools` line in this skill's frontmatter backs that up rather than restating it:
  it removes `Bash`, `Write`, `Edit`, `NotebookEdit` and `Agent` from the pool while the skill is
  active, so the `gh issue create` path and every local write are gone, and the restriction clears
  when the user sends their next message. **`Agent` is on that list for the same reason as the
  rest**, and it is the one people leave off: removing a tool from this agent does nothing if this
  agent can spawn a subagent that still has it, so delegation is the cheapest way around a per-tool
  removal and injected text asking for it reads as ordinary work. That matters because this skill reads text an attacker may
  control: a prompt-injected paper should not be one instruction-following lapse away from filing a
  public, undeletable issue under the user's name.

  **It is a backstop, not a proof, and the difference is worth holding.** The field is Claude Code
  only, so on any other client the written rule is all there is. It removes named tools, so it
  cannot reach an MCP server the user happens to have installed that can write to GitHub. **Do not
  read it as making this guarantee structural** — an earlier draft of this file said exactly that
  about `allowed-tools`, which turned out to *grant* pre-approval rather than restrict anything, so
  the sentence claimed an enforcement that did not exist. The rule above is what binds.
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

Never raise a suggestion, in any session, when a file named `.caail-no-contribute` sits in **the
working directory**. Check for it with `Read` or `Glob`, once per session, before the first
suggestion.

The working directory rather than the repository root, because those are the same place only when
the session was started there. Resolving a repository root means `git rev-parse --show-toplevel`,
and `Bash` is removed while this skill is active, so an opt-out documented at the root would be one
this skill cannot reliably find: a user who put the file there and then worked from a subdirectory
would have a silencer that silently does nothing, which is worse than not offering one.

To remove the behaviour entirely, the user uninstalls this plugin. It is deliberately a separate
install from the `caail` query plugin so that removing one leaves the other working.
