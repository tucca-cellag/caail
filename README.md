# CAAIL: Cellular Agriculture AI Library

[![Website](https://img.shields.io/badge/Website-caail.tufts.edu-002E6D?logo=github&logoColor=white)](https://caail.tufts.edu/) [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.20295590.svg)](https://doi.org/10.5281/zenodo.20295590) [![Zotero group library](https://img.shields.io/badge/Zotero-caail_group_library-CC2936?logo=zotero&logoColor=white)](https://www.zotero.org/groups/6549203/caail/library) [![Slack](https://img.shields.io/badge/Slack-join_the_community-4A154B?logo=slack&logoColor=white)](./Community.md)

> **CAAIL is in beta.** We're re-checking earlier classifications and reorganizing the research areas for v2. [See the roadmap](https://caail.tufts.edu/curation/#6-roadmap) · [Tell us what you think](https://caail.tufts.edu/community/)

🌐 **Explore the library on the web at [caail.tufts.edu](https://caail.tufts.edu/)**, a searchable site built from the Markdown in this repository, with a papers explorer, a citation network, datasets by species and more.

CAAIL, the Cellular Agriculture AI Library, is a curated, open-source collection of resources at the intersection of cellular agriculture and AI. CAAIL is maintained by [The Tufts University Center for Cellular Agriculture (TUCCA)](https://cellularagriculture.tufts.edu/): see TUCCA's [GitHub organization](https://github.com/tucca-cellag) for related projects.

# The Goal
Cellular agriculture faces technical and economic barriers to wide adoption, particularly cost, media formulation and scale-up. CAAIL collects published work, tools and data at the intersection of AI and cellular agriculture, for researchers, engineers and students who want to apply one to the other.

CAAIL records what has been researched and takes no position on whether a given approach works.

# What's Inside
We organize and host links to public resources across key areas of research:

* [Papers & Preprints](./Papers.md): Core research literature focusing on computational biology, modeling, and machine learning applied to cell culture, bioprocessing, and tissue engineering.
* [Software & Code](./Software.md): Links to software tools (open-source and proprietary), code repositories, and specialized algorithms used for media optimization, bioreactor modeling, and image analysis.
* [Datasets](./Datasets/): corpora, atlases, sequencing deposits and model files you would train or benchmark a model *on*, on per-species pages (cow, pig, chicken, fish and more) plus cross-species reference and AI/ML benchmark pages.
* [Databases](./Databases.md): Living, queryable resources (repositories, ontologies, spectral libraries, and structure / compound / pathway databases) that you query for reference, annotation, or lookup. Also catalogues GFI's alternative-protein ecosystem directories.
* [Reference Works](./ReferenceWorks.md): a cell-ag textbook and the *Encyclopedia of Meat Sciences*, with a DOI-resolvable chapter index.
* [Awesome Lists](./AwesomeLists.md): Community-maintained "awesome lists" and curated bibliographies for the AI, single-cell, and bioinformatics literature cell-ag work draws on (rendered with GitHub metrics on the site).
* [Funding & Grants](./Funding.md): organizations that fund the field, and their grant programs.
* [Other Resources](./OtherResources.md): Journal editorials and opinion on AI in science, and cellular-agriculture ecosystem initiatives (research centers, consortia, and convening efforts).

# Companion Zotero Library
CAAIL has a companion [Zotero group library](https://www.zotero.org/groups/6549203/caail/library) maintained by core TUCCA members, holding the full-text PDFs of papers under consideration. It lets AI coding agents on TUCCA members' machines read the full text of the papers it holds, so that a resource is classified from its methods and not from its abstract alone. It is a members-only working library, so to suggest a resource, use the GitHub workflow in [CONTRIBUTING.md](./CONTRIBUTING.md).

The [Curation Methodology](https://caail.tufts.edu/curation/) page explains how each paper's methods section is located from the PDF's own headings, how much of the matrix that currently covers, and what a placement does and does not establish.

# Contributing
Suggestions of papers, software, datasets, and other resources are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to propose additions via pull request or GitHub issue.

# Community
CAAIL has a public Slack workspace for questions, work in progress, and discussion that does not fit an issue. Resource suggestions are accepted there as well, without opening an issue or holding a GitHub account. [Community.md](./Community.md) lists the channels, the join link, and the community norms. The Slack workspace and the issue tracker are both governed by our [Code of Conduct](./CODE_OF_CONDUCT.md).

# Citing CAAIL
If you reference CAAIL or build on its curated content, please cite this repository. GitHub renders a "Cite this repository" button in the sidebar from the [`CITATION.cff`](./CITATION.cff) at the repo root.

A recommended human-readable citation:

> Plotts, J., Bromberg, B., Kaplan, D. L., [The Tufts University Center for Cellular Agriculture (TUCCA)](https://cellularagriculture.tufts.edu/), and the [CAAIL Contributors](https://github.com/tucca-cellag/caail/graphs/contributors). (2026). *CAAIL: Cellular Agriculture AI Library* (Version 1.0.0). Zenodo. https://doi.org/10.5281/zenodo.20295590

BibTeX:

```bibtex
@misc{caail2026,
  author       = {Plotts, Jim and Bromberg, Benjamin and Kaplan, David L. and {The Tufts University Center for Cellular Agriculture (TUCCA)} and {The CAAIL Contributors}},
  title        = {{CAAIL}: Cellular Agriculture {AI} Library},
  year         = {2026},
  version      = {1.0.0},
  doi          = {10.5281/zenodo.20295590},
  publisher    = {Zenodo},
  url          = {https://doi.org/10.5281/zenodo.20295590},
  note         = {Resource library, MIT licensed}
}
```

When citing a specific catalogued resource (paper, software tool, dataset), cite the original source directly rather than CAAIL: the DOIs and canonical URLs in [Papers.md](./Papers.md), [Software.md](./Software.md), [Datasets/](./Datasets/), and [Databases.md](./Databases.md) are authoritative.

# License
&copy; 2026 [The Tufts University Center for Cellular Agriculture (TUCCA)](https://cellularagriculture.tufts.edu/) and CAAIL contributors.

Content in this repository is licensed under the [MIT License](./LICENSE). You are free to use, copy, modify, and redistribute the material (including commercially) provided that the copyright notice and license text are included with substantial portions of the work.
