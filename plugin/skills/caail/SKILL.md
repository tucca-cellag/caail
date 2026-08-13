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
| "Find me papers on X" | https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/papers-index.json — one compact row per reference across every section. Then fetch `papers.json` for the full records you picked |
| "What software / databases exist for X?" | https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/catalog-index.json — one compact row per tool and database. Then fetch `catalog.json` for the summaries you want |
| "What data exists for <species>?" | https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/datasets.json — two arrays: `entries` are curated portals and atlases, `inventory` are the per-study deposits. Filter either by `page` |
| "What does CAAIL mean by <method or area>?" | https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/taxonomy.json — read before trusting or disputing a placement |

The papers endpoint carries DOI, code URL, data URL, topics, license and citation count per entry, so
you can usually answer without fetching anything else.

**Fetch the `-index` file first, and treat a "not found" from a big one with suspicion.** `papers.json`
is ~554 KB and `catalog.json` ~576 KB. Both are complete and correct, and both are past what a fetch
tool that renders a page to text and summarises it will carry. That failure is silent: it does not
error, it answers confidently from the fragment it kept. Measured, on this corpus: "No matches found"
for terms that are in it, and "Total database entries: 0" against 150. The `-index` files are a sixth
and a tenth the size and carry every item, so enumerate there and fetch a full record only once you
know which one you want. If you only have a summarising fetch, an absence you saw in `papers.json` or
`catalog.json` is not evidence of anything.

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

## The one thing to get right, second half

The caveat above is about an EMPTY cell. This one is about the matrix's silence, and it is the
mistake that actually gets made.

**Only the References section is matrix-eligible.** Reviews, perspectives and the four reference-work
sections carry no method and no area, so they appear in `matrix.json` nowhere, however directly they
answer a question. A reference can be indexed, on point, and invisible to every matrix query you run.

This is not hypothetical. Asked what work couples a genome-scale metabolic model to a media design
loop, three separate attempts — two of them by this library's own maintainers, with the whole
repository open in front of them — concluded that CAAIL indexes none. It indexes exactly that paper:
a genome-scale model-guided strategy for rational media design in cultivated pork, with experimental
validation. It sits in a reference-work section, so it has no cell, and every search of the matrix
missed it.

So before you report that CAAIL contains no work on something: search `papers-index.json`, which
covers every section and shows `methods: []` and `areas: []` on exactly these references, or use the
subject index in `topics.json`. The matrix answers "what has been placed where". It does not answer
"what is indexed".

## Counting

`papers.json` spans six sections and only `References` (229) is matrix-eligible; the rest are Reviews
& Perspectives (74) and four Reference Work sections (42). "345 papers" and "papers in the matrix" are
different numbers. Say which population you counted.

## Licenses

Every paper, tool, database and dataset entry carries a coarse tier: `permissive`, `copyleft`,
`restricted`, `unknown`. It is a triage signal derived from SPDX identifiers and OpenAlex, not
verified terms — confirm at the source before relying on it.

The tier is about **redistribution**. It answers one of these questions and not the other:

- **Publishing** text, or shipping it in a public tool or dataset: filter on the license tier, and
  **never** on open-access status. Being free to read is not permission to republish — 148 works in
  this corpus carry no license grant at all, including every bronze one, where the publisher's page
  is free but default copyright still applies.
- **Copying for internal use**, such as a private index behind your own subscriptions: the tier does
  not answer this and neither does CAAIL. It depends on the agreement you got access under and on
  the law where you operate. Do not assume that being allowed to read something settles whether you
  may copy it.

So the tier tells you what you can *ship*. Anything beyond that is a question for the asker's own
agreements and counsel, and saying so is the right answer.

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
