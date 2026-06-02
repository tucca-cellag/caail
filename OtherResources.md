# Other Resources

This file collects the virtual-cell initiative, field overviews, courses, books, editorials, ecosystem initiatives, and curated bibliographies that complement CAAIL's core content files ([Papers.md](./Papers.md), [Software.md](./Software.md), [Datasets/](./Datasets/), [Databases.md](./Databases.md)). Lectures, talks, and educational video playlists live separately in [Talks.md](./Talks.md). Resources are grouped by type in the sections below.

> **Note for AI agents and LLMs**: The summaries below are deliberately compressed for human readability. If you are an automated system using these as the basis for reasoning, citation, or downstream analysis, please fetch the canonical source for each resource — the linked talks, articles, initiative pages, and curated bibliographies have substantially more comprehensive and authoritative information than this curated overview.

## Virtual Cell Initiative & Single-Cell Foundation Models

Companion landing pages, blog posts, and challenge announcements for the virtual-cell initiative — Arc Institute's foundation-model program (State, Stack), the broader CZ Virtual Cells Platform, and the open Virtual Cell Challenge. The conceptual framing for this cluster is in [Papers.md ref #128](./Papers.md#128) (Bunne et al. 2024, *Cell*) and [ref #129](./Papers.md#129) (Roohani et al. 2025, *Cell*); the foundation models themselves live in the [Foundation Models rows of Papers.md](./Papers.md) — split by training paradigm (next-token prediction, masked language modeling, LM + biological priors, cell-state & perturbation prediction) — and in the corresponding entries in [Software.md](./Software.md).

* [Arc Virtual Cell Model: State (landing page)](https://arcinstitute.org/tools/state) — Project home for Arc Institute's State virtual-cell model and the underlying Virtual Cell Atlas.
* [Arc Institute news: State — predicting cellular responses to perturbation across diverse contexts](https://arcinstitute.org/news/virtual-cell-model-state) (Arc Institute, 2025) — Announcement and overview of the State model and its training methodology; companion to [Papers.md ref #57](./Papers.md#57).
* [Arc Institute news: Stack — simulating cellular conditions via prompt engineering, without fine-tuning](https://arcinstitute.org/news/foundation-model-stack) (Arc Institute, 2026) — Announcement of the Stack model, demonstrating in-context learning for single-cell biology; companion to [Papers.md ref #124](./Papers.md#124).
* [Arc Virtual Cell Challenge (README)](https://github.com/ArcInstitute/arc-virtual-cell-atlas/blob/main/virtual-cell-challenge/README.md) — Open challenge for predictive virtual-cell modeling, operationalizing the Cell perspective in [Papers.md ref #129](./Papers.md#129).
* [Cell2Sentence-Scale (van Dijk lab project page)](https://www.vandijklab.org/c2s-scale) — Yale lab project page for the C2S-Scale model; companion to [Papers.md ref #120](./Papers.md#120) and the [Cell2Sentence entry in Software.md](./Software.md#cell2sentence-c2s-scale).

## Cellular Agriculture Field Overviews

Introductory primers, industry-state reports, and field overviews — curated for AI / ML researchers approaching cellular agriculture from the computer-science side. These are starting points for understanding the science, the commercial landscape, and the people doing the work; once you have the field context, the AI × cell-ag work catalogued throughout the rest of this library becomes much more navigable. (Wet-lab researchers approaching AI from the biology side should see the complementary [AI Fundamentals](./Talks.md#ai-fundamentals) playlists in Talks.md.)

The Good Food Institute (GFI) publishes the de-facto annual *State of the Industry* reports across three tracks (cultivated, fermentation, plant-based); full PDFs and supplementary data are at GFI's [State of the Industry downloads page](https://gfi.org/resource/state-of-the-industry-downloads/).

* [Introduction to Cellular Agriculture](https://www.youtube.com/watch?v=-0eap5cg6mE) (TUCCA — Tufts University Center for Cellular Agriculture) — primer covering the science, motivation, and current state of the field.
* [Fireside Chat: Bruce Friedrich and David Kaplan](https://www.youtube.com/watch?v=59NrhsHQT0U) (Tufts Future Food Innovation Day, 2026) — conversation between the GFI founder and the TUCCA / Tufts cell-ag program lead on the field's direction.
* [MEAT by Bruce Friedrich](https://meatbook.org/) — book by GFI's founder covering the case for cellular agriculture and alternative proteins.
* [2026 State of the Industry: Cultivated meat, seafood, and ingredients](https://www.youtube.com/watch?v=F1s702taM5o) (GFI, 2026).
* [2026 State of the Industry: Fermentation for meat, seafood, eggs, dairy, and ingredients](https://www.youtube.com/watch?v=eCBclCUZOg0) (GFI, 2026).
* [2026 State of the Industry: Plant-based meat, seafood, eggs, dairy, and ingredients](https://www.youtube.com/watch?v=OEuehZB7YVM) (GFI, 2026).
* [Foundations of Chemical and Biological Engineering I](https://eng.libretexts.org/Bookshelves/Chemical_Engineering/Foundations_of_Chemical_and_Biological_Engineering_I_(Verret_Qiao_Barghout)) (Verret, Qiao & Barghout, UBC) — an open LibreTexts textbook covering process diagrams, reaction chemistry, mass and energy balances, and process control; foundational background for the bioprocess-engineering side of cultivated-meat scale-up.

## Courses

University courses on cellular agriculture — structured entry points into the field, and reference models for curriculum design.

* [Cellular Agriculture Courses (TUCCA)](https://sites.tufts.edu/cellagcourse/) — the Tufts University Center for Cellular Agriculture's open course-materials site, mostly focused on the bioengineering behind cultivated meat, sharing course materials for educators and students. Individual courses:
  * [Cellular Agriculture and Biofabricated Foods (BME 173)](https://sites.tufts.edu/cellagcourse/cellular-agriculture-and-biofabricated-foods-bme-173/) — a lecture course introducing the fundamentals of cellular agriculture and biofabricated foods.
  * [Cellular Agriculture and Cultured Meat Lab (BME 174)](https://sites.tufts.edu/cellagcourse/cell-ag-and-cultured-meat-lab-bme-174/) — a hands-on lab course in which students isolate livestock cells, differentiate them into fat and muscle tissue, generate cultured meat, and analyze the resulting meat constructs.
  * [Sustainable Materials (BME 0193)](https://sites.tufts.edu/cellagcourse/sustainable-materials-course-bme-0193/) — a course on the use of cellular agriculture in the materials industry.
* [TUCCA Education — Courses](https://cellularagriculture.tufts.edu/education/courses) — the Tufts University Center for Cellular Agriculture's official course listing on the center's main site.

## Books

Reference works and textbooks that cell-ag programs draw on for foundational context that doesn't fit any single Papers.md / Software.md / Datasets/ entry. Each entry below includes the canonical ISBN and — where the work is a chaptered reference whose chapter DOIs are individually resolvable — a chapter index with `https://doi.org/...` URLs so AI agents resolving by identifier land back on the parent entry. The chapter index is curated to the chapters most cell-ag-relevant; for the full table of contents, fetch the publisher's reference-work landing page.

### [*Cellular Agriculture: Technology, Society, Sustainability and Science*](https://shop.elsevier.com/books/cellular-agriculture/fraser/978-0-443-18766-7)

Fraser, E. D. G., Kaplan, D. L., Newman, L., & Yada, R. Y. (Eds.). (2023). *Cellular Agriculture: Technology, Society, Sustainability and Science*. Elsevier / Academic Press. ISBN 978-0-443-18766-7. 33 numbered chapters plus glossary.

The foundational cellular agriculture textbook (per New Harvest's editorial framing of the volume) covering the field as a unified whole — the technology stack (cell biology, scaffolding, media optimization, bioprocess), the societal and sustainability framing, and the science-of-the-art chapters across cultivated meat, seafood, and dairy. David L. Kaplan, one of the four editors, directs the Tufts University Center for Cellular Agriculture (TUCCA) from which CAAIL itself originates; the book is a foundational primer for AI / ML researchers approaching cell-ag from the computer-science side, and is structurally complementary to the [Cellular Agriculture Field Overviews](#cellular-agriculture-field-overviews) section above.

### [*Encyclopedia of Meat Sciences*, 3rd edition](https://shop.elsevier.com/books/encyclopedia-of-meat-sciences/dikeman/978-0-323-85198-5)

Dikeman, M. (Ed.). (2024). *Encyclopedia of Meat Sciences* (3rd ed., three-volume set). Academic Press / Elsevier. ISBN 978-0-323-85125-1 (print) / 978-0-323-85198-5 (eBook). (Print release October 2023; 2024 imprint year used by Crossref and the printed copyright page.)

The canonical multi-volume reference work for meat science, updated for 2024. For cellular agriculture, the Encyclopedia is the substrate reference for the meat-science questions cultivated-meat programs ultimately need to answer — what makes meat taste like meat, what determines color/texture/water-holding/protein-functionality, what flavor compounds matter, how the analytical methods are calibrated — framed in conventional-meat terms but applicable substrate for the cultivated counterpart. The chapters below are individually DOI-resolvable; CAAIL catalogues the cell-ag-relevant subset, not the full table of contents (the canonical [reference-work landing page](https://shop.elsevier.com/books/encyclopedia-of-meat-sciences/dikeman/978-0-323-85198-5) has the rest).

Earlier editions also exist in the caail Zotero library: 2nd ed. (Dikeman & Devine, eds., 2014, ISBN 978-0-12-384734-8) and 1st ed. (Jensen, Devine, & Dikeman, eds., 2004, ISBN 978-0-08-092444-1, Vol. 1 [A–F]); the 3rd edition supersedes both for current reference use.

#### Chapter index (cell-ag-relevant subset)

| Cluster | Chapter | Authors | DOI |
| --- | --- | --- | --- |
| **Cell-ag-direct** | Laboratory synthesized meat | S. B. Smith | [10.1016/B978-0-323-85125-1.00168-X](https://doi.org/10.1016/B978-0-323-85125-1.00168-X) |
| **Cell-ag-direct** | Biotechnology approaches in poultry meat production | A. Golkar-Narenji, P. E. Mozdziak | [10.1016/B978-0-323-85125-1.00180-0](https://doi.org/10.1016/B978-0-323-85125-1.00180-0) |
| **Multi-omics methods** | Applications of metabolomics in meat research | F. Kiyimba, S. P. Suman, M. Pfeiffer, G. Mafi, R. Ramanathan | [10.1016/B978-0-323-85125-1.00057-0](https://doi.org/10.1016/B978-0-323-85125-1.00057-0) |
| **Multi-omics methods** | Applications of proteomics in meat research | M. Gagaoua, W. M. Schilling | [10.1016/B978-0-323-85125-1.00123-X](https://doi.org/10.1016/B978-0-323-85125-1.00123-X) |
| **Multi-omics methods** | Bioinformatics: In-depth analyses of omics data in the field of muscle biology and meat biochemistry | F. Kiyimba, M. Gagaoua | [10.1016/B978-0-323-85125-1.00105-8](https://doi.org/10.1016/B978-0-323-85125-1.00105-8) |
| **Modeling** | Modeling in meat science: Microbiology | P. Paulsen, F. J. M. Smulders | [10.1016/B978-0-323-85125-1.00178-2](https://doi.org/10.1016/B978-0-323-85125-1.00178-2) |
| **Flavor & sensory** | Flavor development | R. B. Pegg, F. Shahidi | [10.1016/B978-0-323-85125-1.00205-2](https://doi.org/10.1016/B978-0-323-85125-1.00205-2) |
| **Flavor & sensory** | Flavor development in beef, pork, lamb and goat meat | C. Kerth | [10.1016/B978-0-323-85125-1.00017-X](https://doi.org/10.1016/B978-0-323-85125-1.00017-X) |
| **Flavor & sensory** | Measuring meat flavour | D. Frank | [10.1016/B978-0-323-85125-1.00182-4](https://doi.org/10.1016/B978-0-323-85125-1.00182-4) |
| **Flavor & sensory** | Spices and Flavorings | H. W. Ockerman, L. Basu | [10.1016/B978-0-323-85125-1.00300-8](https://doi.org/10.1016/B978-0-323-85125-1.00300-8) |
| **Bioactives & nutrition** | Nutraceuticals | A. W. Brown | [10.1016/B978-0-323-85125-1.00307-0](https://doi.org/10.1016/B978-0-323-85125-1.00307-0) |
| **Bioactives & nutrition** | Contribution of bioactive compounds from meat | V. Santé-Lhoutellier, V. Ferraro | [10.1016/B978-0-323-85125-1.00189-7](https://doi.org/10.1016/B978-0-323-85125-1.00189-7) |
| **Bioactives & nutrition** | Micronutrients | (chapter-level authors omitted in record) | [10.1016/B978-0-323-85125-1.00094-6](https://doi.org/10.1016/B978-0-323-85125-1.00094-6) |
| **Physicochemistry & quality** | Chemical and physical characteristics of meat — water-holding capacity | R. D. Warner | [10.1016/B978-0-323-85125-1.00164-2](https://doi.org/10.1016/B978-0-323-85125-1.00164-2) |
| **Physicochemistry & quality** | Chemical and physical characteristics of meat — protein functionality | Y. L. Xiong | [10.1016/B978-0-323-85125-1.00037-5](https://doi.org/10.1016/B978-0-323-85125-1.00037-5) |
| **Physicochemistry & quality** | Color and texture deviations | G. Monin, V. Santé-Lhoutellier | [10.1016/B978-0-323-85125-1.00190-3](https://doi.org/10.1016/B978-0-323-85125-1.00190-3) |
| **Analytical methods** | Physicochemical analysis methods | J. R. Andersen, C. T. Pedersen | [10.1016/B978-0-323-85125-1.00320-3](https://doi.org/10.1016/B978-0-323-85125-1.00320-3) |
| **Analytical methods** | Raw material composition analysis | J. G. Sebranek, R. Tarté | [10.1016/B978-0-323-85125-1.00016-8](https://doi.org/10.1016/B978-0-323-85125-1.00016-8) |
| **Analytical methods** | Chemical analysis for specific components — micronutrients and other minor meat components | (see record) | [10.1016/B978-0-323-85125-1.00069-7](https://doi.org/10.1016/B978-0-323-85125-1.00069-7) |
| **Analytical methods** | Chemical analysis sampling and statistical requirements | (see record) | [10.1016/B978-0-323-85125-1.00063-6](https://doi.org/10.1016/B978-0-323-85125-1.00063-6) |

**Cross-references** — where the Encyclopedia's chapter clusters are picked up elsewhere in CAAIL:

- [ResearchAreas/SensoryPrediction.md](./ResearchAreas/SensoryPrediction.md) — the *Flavor & sensory* chapters and the *Bioactives & nutrition* chapters are the conventional-meat reference substrate for the cultivated-counterpart sensomics work catalogued there.
- [ResearchAreas/Bioprocess.md](./ResearchAreas/Bioprocess.md) — the *Modeling in meat science: Microbiology* chapter and the *Physicochemistry & quality* cluster underlie the bioprocess work on cultivated-meat scale-up.
- [Datasets/Cow.md](./Datasets/Cow.md), [Datasets/Pig.md](./Datasets/Pig.md), [Datasets/Chicken.md](./Datasets/Chicken.md) — the species-specific *Flavor development in beef, pork, lamb and goat meat* chapter and the *Biotechnology approaches in poultry meat production* chapter are reference reading paired with the per-species data inventories.

## Editorials & Opinion

Journal editorials, news features, and opinion pieces that survey or comment on the state of AI in science and cellular agriculture — distinct from the peer-reviewed review and position papers in [Papers.md / Reviews & Perspectives](./Papers.md#reviews--perspectives). These are the field's running commentary: useful context on how the research community is framing AI's role, not primary research.

* [Why AI cannot do good science without humans](https://www.nature.com/articles/d41586-026-01551-3) (*Nature* editorial, 2026) — argues that human wisdom, empathy, and "sheer messiness" remain as much a part of scientific progress as process and efficiency, even as "AI scientists" arrive.
* [Teams of AI agents boost speed of research](https://www.nature.com/articles/d41586-026-01596-4) (*Nature* news feature, 2026) — overview of multi-agent AI systems that generate hypotheses, interpret data, and suggest ways to develop medicines.
* [Long-running Claude for scientific computing](https://www.anthropic.com/research/long-running-Claude) (Anthropic) — research post on running Claude as a long-horizon autonomous agent on scientific-computing workloads.
* [Vibe physics: The AI grad student](https://www.anthropic.com/research/vibe-physics) (Anthropic) — research post on using Claude as an AI research collaborator — an "AI grad student" — for physics problems.

## Cell-Ag Ecosystem Initiatives

CAAIL's "adjacent universe" — complementary research programs and initiatives in cellular agriculture. CAAIL itself catalogues *outputs* (papers, software, datasets, educational material); these initiatives produce primary outputs (datasets, working papers) that become cataloguable in CAAIL's core files as they are published. The corresponding *directories and databases* maintained by these organizations live in [Databases.md / Ecosystem & Industry Directories](./Databases.md#ecosystem--industry-directories) and related sections.

### New Harvest initiatives

* [AI in Cellular Agriculture Initiative (AICAI)](https://www.new-harvest.org/artificial-intelligence-in-cellular-agriculture-initiative) — New Harvest's programmatic effort connecting AI / ML researchers with cellular agriculture: funding research (including an ML-for-media-optimization residency) and building open datasets. The closest mission-level analogue to CAAIL, though a research *program* rather than a catalogue.
* [Cellular Agriculture Science Engine](https://www.new-harvest.org/cellular-agriculture-science-engine) — A crowdfunded research-portfolio mechanism (New Harvest with FootPrint Coalition and Experiment.com) that funds cell-ag projects; a source of future cataloguable research outputs.
* [Cultured Meat Safety Initiative (CMSI)](https://www.new-harvest.org/cultured-meat-safety-initiative-cmsi) — A joint New Harvest / Vireo Advisors initiative convening stakeholders on the safety and regulatory science of cultivated products; outputs (datasets, guidance documents) are cataloguable as they are released.

### GFI initiatives

* [GFI: Expanding Access to Cultivated Meat Cell Lines](https://gfi.org/resource/expanding-access-to-cell-lines/) — GFI's initiative addressing limited cell-line access — a core bottleneck for cultivated-meat research — and supporting the development of new lines.

## Curated Bibliographies & Awesome Lists

Community-maintained "awesome lists" and curated bibliographies — living GitHub indexes of papers, tools, and tutorials. None are cell-ag-specific, but each is a high-signal navigation layer for the AI / single-cell / bioinformatics literature and tooling that cell-ag work draws on. Most are continuously updated; treat them as entry points, not snapshots.

**AI & foundation models for single-cell biology**

* [OmicsML/awesome-foundation-model-single-cell-papers](https://github.com/OmicsML/awesome-foundation-model-single-cell-papers) — curated list of foundation-model papers for single-cell omics; the closest external companion to the Foundation Models rows in [Papers.md](./Papers.md).
* [OmicsML/awesome-deep-learning-single-cell-papers](https://github.com/OmicsML/awesome-deep-learning-single-cell-papers) — curated list of deep-learning papers for single-cell analysis.
* [hussius/deeplearning-biology](https://github.com/hussius/deeplearning-biology) — long-running list of deep-learning applications and implementations across biology.

**Single-cell & multi-omics analysis**

* [seandavi/awesome-single-cell](https://github.com/seandavi/awesome-single-cell) — the comprehensive community index of single-cell RNA-seq analysis software.
* [mdozmorov/scRNA-seq_notes](https://github.com/mdozmorov/scRNA-seq_notes) — Mikhail Dozmorov's curated notes on scRNA-seq tools, tutorials, and resources.
* [crazyhottommy/scRNAseq-analysis-notes](https://github.com/crazyhottommy/scRNAseq-analysis-notes) — Ming Tang's working notes on scRNA-seq analysis.
* [mikelove/awesome-multi-omics](https://github.com/mikelove/awesome-multi-omics) — Mike Love's list of multi-omics data-integration methods.
* [crazyhottommy/awesome_spatial_omics](https://github.com/crazyhottommy/awesome_spatial_omics) — curated spatial-omics methods and tools.

**General bioinformatics**

* [danielecook/Awesome-Bioinformatics](https://github.com/danielecook/Awesome-Bioinformatics) — broad curated index of bioinformatics software and resources.
* [j-andrews7/awesome-bioinformatics-benchmarks](https://github.com/j-andrews7/awesome-bioinformatics-benchmarks) — curated list of bioinformatics benchmarking studies — useful when selecting methods for cell-ag pipelines.
* [crazyhottommy/RNA-seq-analysis](https://github.com/crazyhottommy/RNA-seq-analysis) — RNA-seq analysis notes and resources.
* [crazyhottommy/ChIP-seq-analysis](https://github.com/crazyhottommy/ChIP-seq-analysis) — ChIP-seq analysis notes and resources.
* [crazyhottommy/bioinformatics-one-liners](https://github.com/crazyhottommy/bioinformatics-one-liners) — practical command-line one-liners for bioinformatics.
* [crazyhottommy/getting-started-with-genomics-tools-and-resources](https://github.com/crazyhottommy/getting-started-with-genomics-tools-and-resources) — entry-point genomics tooling guide.

**Biomedical NLP & information extraction**

* [caufieldjh/awesome-bioie](https://github.com/caufieldjh/awesome-bioie) — curated resources for biomedical information extraction — relevant to the literature-mining and agentic-AI layer of cell-ag.
