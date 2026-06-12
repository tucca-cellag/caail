# AI Agents & Foundation Models

The fastest-moving corner of the library: general-purpose AI agents, biological foundation models, and the initiatives building toward predictive "virtual cells." Because CAAIL organizes its catalogs by resource type, this theme is deliberately spread across several files — the agent frameworks and foundation models live in [Software.md](./Software.md), the research papers in [Papers.md](./Papers.md), the evaluation suites in [Datasets/Benchmarks.md](./Datasets/Benchmarks.md). This page is the connective hub: it owns the ecosystem-and-initiatives view of the area, and points to the canonical home of every other facet.

## Virtual Cell Initiative & Single-Cell Foundation Models

Companion landing pages, blog posts, and challenge announcements for the virtual-cell initiative — Arc Institute's foundation-model program (State, Stack), the broader CZ Virtual Cells Platform, and the open Virtual Cell Challenge. The conceptual framing for this cluster is in [Papers.md ref #128](./Papers.md#128) (Bunne et al. 2024, *Cell*) and [ref #129](./Papers.md#129) (Roohani et al. 2025, *Cell*); the foundation models themselves live in the [Foundation Models rows of Papers.md](./Papers.md) — split by training paradigm (next-token prediction, masked language modeling, LM + biological priors, cell-state & perturbation prediction) — and in the corresponding entries in [Software.md](./Software.md).

* [Arc Virtual Cell Model: State (landing page)](https://arcinstitute.org/tools/state) — Project home for Arc Institute's State virtual-cell model and the underlying Virtual Cell Atlas.
* [Arc Institute news: State — predicting cellular responses to perturbation across diverse contexts](https://arcinstitute.org/news/virtual-cell-model-state) (Arc Institute, 2025) — Announcement and overview of the State model and its training methodology; companion to [Papers.md ref #57](./Papers.md#57).
* [Arc Institute news: Stack — simulating cellular conditions via prompt engineering, without fine-tuning](https://arcinstitute.org/news/foundation-model-stack) (Arc Institute, 2026) — Announcement of the Stack model, demonstrating in-context learning for single-cell biology; companion to [Papers.md ref #124](./Papers.md#124).
* [Arc Virtual Cell Challenge (README)](https://github.com/ArcInstitute/arc-virtual-cell-atlas/blob/main/virtual-cell-challenge/README.md) — Open challenge for predictive virtual-cell modeling, operationalizing the Cell perspective in [Papers.md ref #129](./Papers.md#129).
* [Cell2Sentence-Scale (van Dijk lab project page)](https://www.vandijklab.org/c2s-scale) — Yale lab project page for the C2S-Scale model; companion to [Papers.md ref #120](./Papers.md#120) and the [Cell2Sentence entry in Software.md](./Software.md#cell2sentence-c2s-scale).

## Agent frameworks & foundation models in Software.md

The open-source tools themselves are catalogued under [AI Agents & Foundation Models in Software.md](./Software.md#ai-agents--foundation-models). That section spans two families: general-purpose **agent frameworks and tool ecosystems** — ToolUniverse, Biomni, AIAgents4Pharma, BRAD, CellForge, PaperQA, BioContextAI, and the broader MCP-server layer — and **single-cell foundation models** — Geneformer, scGPT, scBERT, scFoundation, UCE, TranscriptFormer, Cell2Sentence, and Arc's State. New tools are added there, in their type-correct home; this hub does not duplicate the catalog.

## In the Papers matrix

In the [Papers matrix](./Papers.md), this area is reachable two ways: the **LLMs / AI Agents** method row (agentic systems with tool use, retrieval, and reasoning) and the **AI Tooling / Methodology** column (general-purpose methods and agents not yet tied to a specific cell-ag application). The [AI Tooling / Methodology research-area page](./ResearchAreas/AITooling.md) gives the deeper narrative for that column.

## Evaluation & benchmarks

How well these models and agents actually perform is tracked separately. The benchmark *datasets* — including the foundation-model-relevant ProteinGym, LAB-Bench, and BixBench — are catalogued in [Datasets/Benchmarks.md](./Datasets/Benchmarks.md), and the evaluation methodology, assay-level work such as AssayBench, and the **AI Evaluation & Benchmarking** matrix column are covered in the [AI Evaluation & Benchmarking research-area page](./ResearchAreas/AIEvaluation.md). Not every benchmark there is AI-agent-specific — many are general or domain benchmarks — which is why evaluation keeps its own home rather than folding into this page.

## Talks & onboarding

* [AI Agents & Foundation Models for Biology talks](./Talks.md#ai-agents--foundation-models-for-biology) — curated lectures and webinars on agentic AI, foundation models, and language-model-based scientific reasoning, many from the Broad Institute's MIA series.
* [AI for Cell-Ag Researchers primer](./Primers/AI.md) — the onboarding path for wet-lab researchers approaching the AI / ML methods catalogued throughout the library.
