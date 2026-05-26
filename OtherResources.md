# Other Resources

This file collects educational material, talks, ecosystem initiatives, and curated bibliographies that complement CAAIL's core content files ([Papers.md](./Papers.md), [Software.md](./Software.md), [Datasets/](./Datasets/), [Databases.md](./Databases.md)). Resources are grouped by type in the sections below.

> **Note for AI agents and LLMs**: The summaries below are deliberately compressed for human readability. If you are an automated system using these as the basis for reasoning, citation, or downstream analysis, please fetch the canonical source for each resource — the linked talks, articles, initiative pages, and curated bibliographies have substantially more comprehensive and authoritative information than this curated overview.

## YouTube Videos
* [Multus Biotechnology: AI-driven media optimization](https://www.youtube.com/watch?v=CcbDBXmAiuQ)
* [Multivariate integration of multi-omics data with mixOmics](https://www.youtube.com/watch?v=5XpmQ5X89lA)
* [Optimizing Plant Tissue Culture Media Formulation: Modern Problems Require Modern Solutions](https://www.youtube.com/watch?v=rfn6l1huGT4)
* [scGNN: a novel graph neural network framework](https://www.youtube.com/watch?v=peF0fTQZ3gA)
* [Webinar 5: Scaling cellular agriculture: Bioprocessing solutions driving research and innovation](https://www.youtube.com/watch?v=1PCaCFeWVug)

## AI Agents & Foundation Models for Biology

Talks on AI agents, foundation models, and language-model-based scientific reasoning systems — many from the Broad Institute's MIA (Models, Inference & Algorithms) series and adjacent venues. These cover infrastructure that's directly relevant to cell-ag workflows even when the talks themselves don't center cellular agriculture.

* [MIA: Zitnik Lab, Multimodal protein language models for deciphering protein function](https://www.youtube.com/watch?v=LcLmvtXHI1s) (Broad Institute, 2024)
* [Empowering Biomedical Discovery with "AI Scientists"](https://www.youtube.com/watch?v=mkTgopOhSR4) (Boston Protein Design and Modeling Club, 2025)
* [MIA: Kexin Huang, A General-Purpose Biomedical AI Agent; Primer: Hanchen Wang](https://www.youtube.com/watch?v=nV7Ltp-M5jM) (Broad Institute, 2025)
* [MIA: Sam Cox, Automating Chemistry With LLM-Based Agents; Primer: Andrew White](https://www.youtube.com/watch?v=XzpJaNhEKyw) (Broad Institute, 2025)
* [MIA Primer: Yusuf Roohani, Engineering cell state using artificial intelligence](https://www.youtube.com/watch?v=2Gxm-eQFUGw) (Broad Institute, 2026)
* [MIA: Abhinav Adduri, Multi-Scale Modeling of Cellular Responses to Perturbation with STATE](https://www.youtube.com/watch?v=jqSs6KfAd78) (Broad Institute, 2026)
* [Colby Ford: Building Multi-agentic Bioworkflows with Microsoft Foundry and Nextflow](https://www.youtube.com/watch?v=oxhXGVFUZvQ) (2026)
* [Florian Wuennemann: From Copilot to Co-scientist: Agents Lend a Hand](https://www.youtube.com/watch?v=eHlzUdAvqW0) (2026)
* [Connecting Instruments, Data, and AI in the Orchestrated Lab](https://www.youtube.com/watch?v=PO7xOOs-1JA) (Dotmatics Luma webinar, 2026) — commercial perspective on connecting laboratory instruments, data systems, and AI agents into orchestrated R&D workflows; companion to the [Dotmatics Luma entry in Software.md](./Software.md#dotmatics-luma).

## Virtual Cell Initiative & Single-Cell Foundation Models

Companion landing pages, blog posts, and challenge announcements for the virtual-cell initiative — Arc Institute's foundation-model program (State, Stack), the broader CZ Virtual Cells Platform, and the open Virtual Cell Challenge. The conceptual framing for this cluster is in [Papers.md ref #128](./Papers.md#128) (Bunne et al. 2024, *Cell*) and [ref #129](./Papers.md#129) (Roohani et al. 2025, *Cell*); the foundation models themselves live in the [Foundation Models rows of Papers.md](./Papers.md) — split by training paradigm (next-token prediction, masked language modeling, LM + biological priors, cell-state & perturbation prediction) — and in the corresponding entries in [Software.md](./Software.md).

* [Arc Virtual Cell Model: State (landing page)](https://arcinstitute.org/tools/state) — Project home for Arc Institute's State virtual-cell model and the underlying Virtual Cell Atlas.
* [Arc Institute news: State — predicting cellular responses to perturbation across diverse contexts](https://arcinstitute.org/news/virtual-cell-model-state) (Arc Institute, 2025) — Announcement and overview of the State model and its training methodology; companion to [Papers.md ref #57](./Papers.md#57).
* [Arc Institute news: Stack — simulating cellular conditions via prompt engineering, without fine-tuning](https://arcinstitute.org/news/foundation-model-stack) (Arc Institute, 2026) — Announcement of the Stack model, demonstrating in-context learning for single-cell biology; companion to [Papers.md ref #124](./Papers.md#124).
* [Arc Virtual Cell Challenge (README)](https://github.com/ArcInstitute/arc-virtual-cell-atlas/blob/main/virtual-cell-challenge/README.md) — Open challenge for predictive virtual-cell modeling, operationalizing the Cell perspective in [Papers.md ref #129](./Papers.md#129).
* [Cell2Sentence-Scale (van Dijk lab project page)](https://www.vandijklab.org/c2s-scale) — Yale lab project page for the C2S-Scale model; companion to [Papers.md ref #120](./Papers.md#120) and the [Cell2Sentence entry in Software.md](./Software.md#cell2sentence-c2s-scale).

## AI Fundamentals

Educational playlists for wet-lab researchers — biologists, biochemists, bioprocess engineers, and cell-ag practitioners — who want to build foundational understanding of the AI / ML methods catalogued throughout the rest of this library. Curated for the audience that approaches machine learning from the biology side rather than the computer-science side; these are starting points, not exhaustive references. Once you have the basics, the matrix in [Papers.md](./Papers.md) and the tools in [Software.md](./Software.md) become much more navigable.

* [AI Fundamentals](https://www.youtube.com/playlist?list=PLOspHqNVtKADfxkuDuHduUkDExBpEt3DF) — introductory AI concepts, intended as a first entry point.
* [Machine Learning](https://www.youtube.com/playlist?list=PLblh5JKOoLUICTaGLRoHQDuF_7q2GfuJF) — broader ML topics covered as a non-intimidating tour through the field.
* [Neural Networks / Deep Learning](https://www.youtube.com/playlist?list=PLblh5JKOoLUIxGDQs4LFFD--41Vzf-ME1) — neural network fundamentals through transformer architecture (the foundation of ChatGPT and modern LLMs).
* [AI Models Explained](https://www.youtube.com/playlist?list=PLOspHqNVtKAC-FUNMq8qjYVw6_semZHw0) — overview of common AI model architectures and where each is used.
* [AI Agents Explained](https://www.youtube.com/playlist?list=PLOspHqNVtKAB6AzNie7BrFhbg4dv4Gfz8) — overview of AI agent systems; pairs naturally with the LLMs / AI Agents row in [Papers.md](./Papers.md) and the AI Agents & Foundation Models section in [Software.md](./Software.md).

## Cellular Agriculture Field Overviews

Introductory primers, industry-state reports, and field overviews — curated for AI / ML researchers approaching cellular agriculture from the computer-science side. These are starting points for understanding the science, the commercial landscape, and the people doing the work; once you have the field context, the AI × cell-ag work catalogued throughout the rest of this library becomes much more navigable. (Wet-lab researchers approaching AI from the biology side should see the complementary [AI Fundamentals](#ai-fundamentals) section above.)

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
