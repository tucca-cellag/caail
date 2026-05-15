# CAAIL: Cellular Agriculture AI Library

[![Zotero group library](https://img.shields.io/badge/Zotero-caail_group_library-CC2936?logo=zotero&logoColor=white)](https://www.zotero.org/groups/6549203/caail/library)

This repository, CAAIL (Cellular Agriculture AI Library), is a curated, open-source collection of resources dedicated to the intersection of Cellular Agriculture and AI. CAAIL is maintained by [The Tufts University Center for Cellular Agriculture (TUCCA)](https://cellularagriculture.tufts.edu/) — see TUCCA's [GitHub organization](https://github.com/tucca-cellag) for related projects and follow [@tuftscellag](https://twitter.com/tuftscellag) for updates.

# The Goal
Cellular Agriculture faces major technical barriers to wide-spread adoption, particularly around cost, media formulation, and scaling. We believe that AI can provide crucial insights to address these challenges.

This project exists to collect all relevant published materials in one place, serving as a centralized library for researchers, engineers, and students looking to apply AI to cell-ag challenges.

# What's Inside
We organize and host links to public resources across key areas of research:

* [Papers & Preprints](./Papers.md): Core research literature focusing on computational biology, modeling, and machine learning applied to cell culture, bioprocessing, and tissue engineering.
* [Software & Code](./Software.md): Links to open-source tools, code repositories, and specialized algorithms used for media optimization, bioreactor modeling, and image analysis.
* [Datasets](./Datasets.md): Fixed data artifacts — corpora, atlases, and model files (e.g. single-cell pretraining corpora, perturbation atlases, genome-scale metabolic models) you would train or benchmark a model *on*.
* [Databases](./Databases.md): Living, queryable resources — repositories, ontologies, spectral libraries, and structure / compound / pathway databases — that you query for reference, annotation, or lookup. Also catalogues GFI's alternative-protein ecosystem directories.
* [Other Educational Materials](./OtherResources.md): Videos and other resources relevant to the use of AI in cellular agriculture.

# Companion Zotero Library
CAAIL has a companion [Zotero group library](https://www.zotero.org/groups/6549203/caail/library) maintained by core TUCCA members, holding the full-text PDFs of papers under consideration. Its purpose is to give AI coding agents running on TUCCA members' machines direct access to paper full text — so that resources are classified from the actual methods rather than abstracts alone. It is a members-only working library, not a contribution channel: to suggest a resource, use the GitHub workflow in [CONTRIBUTING.md](./CONTRIBUTING.md).

# Contributing
Suggestions of papers, software, datasets, and other resources are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to propose additions via pull request or GitHub issue.

# Citing CAAIL
If you reference CAAIL or build on its curated content, please cite this repository. GitHub renders a "Cite this repository" button in the sidebar from the [`CITATION.cff`](./CITATION.cff) at the repo root.

A recommended human-readable citation:

> Plotts, J., Bromberg, B., Kaplan, D. L., [The Tufts University Center for Cellular Agriculture (TUCCA)](https://cellularagriculture.tufts.edu/), and the [CAAIL Contributors](https://github.com/tucca-cellag/caail/graphs/contributors). (2026). *CAAIL: Cellular Agriculture AI Library* (Version 1.0.0). https://github.com/tucca-cellag/caail

BibTeX:

```bibtex
@misc{caail2026,
  author       = {Plotts, Jim and Bromberg, Benjamin and Kaplan, David L. and {The Tufts University Center for Cellular Agriculture (TUCCA)} and {The CAAIL Contributors}},
  title        = {{CAAIL}: Cellular Agriculture {AI} Library},
  year         = {2026},
  version      = {1.0.0},
  url          = {https://github.com/tucca-cellag/caail},
  note         = {Resource library, MIT licensed}
}
```

When citing a specific catalogued resource (paper, software tool, dataset), cite the original source directly rather than CAAIL — the DOIs and canonical URLs in [Papers.md](./Papers.md), [Software.md](./Software.md), [Datasets.md](./Datasets.md), and [Databases.md](./Databases.md) are authoritative.

# License
&copy; 2026 [The Tufts University Center for Cellular Agriculture (TUCCA)](https://cellularagriculture.tufts.edu/) and CAAIL contributors.

Content in this repository is licensed under the [MIT License](./LICENSE). You are free to use, copy, modify, and redistribute the material — including commercially — provided that the copyright notice and license text are included with substantial portions of the work.
