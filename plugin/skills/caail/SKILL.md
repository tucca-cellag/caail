---
name: caail
description: Query CAAIL, a curated library of the AI and machine-learning work in cellular agriculture — 345 papers mapped by AI method against research area, plus the software, databases and per-species datasets the field uses. Use when the user is choosing tools, datasets or databases for a cell-ag experiment, pipeline or analysis; asking what AI methods have been applied to media optimization, cell-line engineering, bioprocess scale-up, scaffolding or sensory prediction; looking for cultivated-meat or alternative-protein data for a species; asking whether something has been studied; or asking what CAAIL contains. Also triggers on cultivated meat, cell-ag, cellular agriculture, alternative protein, and on questions about which dataset or tool to use for a cell-ag problem.
---

# CAAIL

A curated map of AI/ML work in cellular agriculture. Free, MIT-licensed, maintained by the Tufts
University Center for Cellular Agriculture.

Everything is static JSON. Fetch what you need; there is nothing to install or authenticate.

**Base:** `https://tucca-cellag.github.io/caail/api/`

## Start here

Fetch `index.json` first. It carries the corpus date, the endpoint list, and counts labelled with the
population they counted.

## Which endpoint answers what

| Question | Endpoint |
|---|---|
| "What should I use for <cell-ag task>?" | `topics.json` — the inverted index maps a subject to papers, software, databases **and** datasets at once |
| "What AI methods have been applied to <area>?" | `matrix.json` |
| "Has anyone applied <method> to <area>?" | `matrix.json`, then read the caveat below |
| "Find me papers on X" | `papers.json` |
| "What software / databases exist for X?" | `catalog.json` |
| "What data exists for <species>?" | `datasets.json` |
| "What does CAAIL mean by <method or area>?" | `taxonomy.json` — read this before trusting or disputing a placement |

`papers.json` entries carry DOI, code URL, data URL, topics, license and citation count, so you can
usually answer without fetching anything else.

## The one thing to get right

`matrix.json` enumerates **all 175 method×area cells**, including the 107 with no indexed paper. An
empty cell means **CAAIL contains no paper classified there**. It does **not** mean no such work
exists. CAAIL is a curated subset, not a census, and it has not measured its own recall.

Every empty cell carries a `scope` field saying exactly this. Pass that caveat on to the user rather
than reporting a gap in CAAIL as a gap in the field.

Correct: *"CAAIL indexes no paper applying graph neural networks to scaffolding as of 2026-08-06.
That is a gap in this curated corpus, not established absence in the literature."*

Wrong: *"Nobody has applied graph neural networks to scaffolding."*

## Counting

`papers.json` spans six sections and only `References` (229) is matrix-eligible; the rest are Reviews
& Perspectives (74) and four Reference Work sections (42). "345 papers" and "papers in the matrix" are
different numbers. Say which population you counted.

## Licenses

Every paper, tool, database and dataset entry carries a coarse tier: `permissive`, `copyleft`,
`restricted`, `unknown`. It is a triage signal derived from SPDX identifiers and OpenAlex, not
verified terms — confirm at the source before relying on it.

If you are selecting text to store or index, filter on the license tier, **never** on open-access
status. Being free to read is not permission to redistribute: 48 works in this corpus are openly
readable with no license grant at all.

## Contributing

Gaps and misclassifications are welcome: <https://github.com/tucca-cellag/caail/issues>

## Fallback

If the site is unreachable, the canonical source is the repository. Per-table NDJSON lives at
`https://raw.githubusercontent.com/tucca-cellag/caail/main/site/db/ndjson/` and the human-readable
Markdown is at the repo root.
