---
name: caail
description: Query CAAIL, a curated library of the AI and machine-learning work in cellular agriculture — 345 papers mapped by AI method against research area, plus the software, databases and per-species datasets the field uses. Use when the user is choosing tools, datasets or databases for a cell-ag experiment, pipeline or analysis; asking what AI methods have been applied to media optimization, cell-line engineering, bioprocess scale-up, scaffolding or sensory prediction; looking for cultivated-meat or alternative-protein data for a species; asking whether something has been studied; or asking what CAAIL contains. Also triggers on cultivated meat, cell-ag, cellular agriculture, alternative protein, and on questions about which dataset or tool to use for a cell-ag problem.
---

# CAAIL

A curated map of AI/ML work in cellular agriculture. Free, MIT-licensed, maintained by the Tufts
University Center for Cellular Agriculture.

Everything is static JSON. Fetch what you need; there is nothing to install or authenticate.

## Start here

Fetch this first. It carries the corpus date, the endpoint list, and counts labelled with the
population they counted.

- https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/index.json

## Which endpoint answers what

Each URL below is complete and fetchable as written.

These are served from GitHub deliberately. Some clients restrict network access to package
managers by default, a list that includes GitHub but not GitHub Pages, and on Team or Enterprise
plans only an organisation owner can widen it. Fetching from GitHub therefore works everywhere
without anyone changing a setting. The same files are also browsable at
https://tucca-cellag.github.io/caail/api/ if you want to read one in a browser.

| Question | Fetch |
|---|---|
| "What should I use for <cell-ag task>?" | https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/topics.json — the inverted index maps a subject to papers, software, databases **and** datasets at once |
| "What AI methods have been applied to <area>?" | https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/matrix.json |
| "Has anyone applied <method> to <area>?" | https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/matrix.json — then read the caveat below |
| "Find me papers on X" | https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/papers.json |
| "What software / databases exist for X?" | https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/catalog.json |
| "What data exists for <species>?" | https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/datasets.json — two arrays: `entries` are curated portals and atlases, `inventory` are the per-study deposits. Filter either by `page` |
| "What does CAAIL mean by <method or area>?" | https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/taxonomy.json — read before trusting or disputing a placement |

The papers endpoint carries DOI, code URL, data URL, topics, license and citation count per entry, so
you can usually answer without fetching anything else.

For "what could I combine my own run with", read `inventory`, not `entries`. The curated entries are
portals, atlases and model files; the inventory rows are the individual deposits, each carrying its
accession, assay type, tissue and size under the source page's own column labels.

## Method names are abbreviated

The matrix rows use short labels: `GNN`, `CNN`, `SVM`, `GAN / VAE`, `Chemometrics`, and several
`Foundation Models: …` variants. A question phrased in full ("graph neural networks") will not match a
row by string equality. Read the `methods` array in the matrix endpoint, or the definitions in the
taxonomy endpoint, and map the question onto a label before concluding anything is absent. Reporting
"not found" because the label differs is a false negative, and it is worse than the absence problem
below because the caveat never fires.

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

The tier governs **redistribution**, not use. Two different questions:

- **Publishing** text, or shipping it in a public tool or dataset: filter on the license tier, and
  **never** on open-access status. Being free to read is not permission to republish — 148 works in
  this corpus carry no license grant at all, including every bronze one, where the publisher's page
  is free but default copyright still applies.
- **Internal use** inside an organisation that already has legitimate access, such as a private RAG
  index behind its own subscriptions: the license tier is not the constraint. What that organisation
  may lawfully read, it may generally index for itself. The constraint is on making it public.

So the tier tells you what you can *ship*, not what you can *work with*.

## Contributing

Gaps and misclassifications are welcome: <https://github.com/tucca-cellag/caail/issues>

## Fallback

If the endpoints above are unreachable, the canonical source is the repository, and its Markdown is
readable directly:

- https://github.com/tucca-cellag/caail
- https://raw.githubusercontent.com/tucca-cellag/caail/main/Papers.md
- https://raw.githubusercontent.com/tucca-cellag/caail/main/Software.md
- https://raw.githubusercontent.com/tucca-cellag/caail/main/Databases.md

The Markdown route cannot enumerate empty matrix cells, so the absence caveat below applies with
even more force: say what you could not check, rather than implying you checked it.
