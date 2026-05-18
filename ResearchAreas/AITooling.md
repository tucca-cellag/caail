# AI Tooling / Methodology

This page describes the **AI Tooling / Methodology** column of the [Papers.md matrix](../Papers.md) — general-purpose AI methods, foundation models, agent frameworks, benchmarks, and infrastructure that could be applied across many cellular-agriculture problems but haven't yet been deployed against any specific one. As of late 2026 this is the highest-traffic column in the matrix, reflecting both the rapid expansion of AI-for-biology research and CAAIL's curatorial decision to track these foundational methods even when their cell-ag application is implicit rather than demonstrated.

The boundary between this column and the applied columns is intentionally pragmatic: a paper that introduces a general method **and** demonstrates it on a cell-ag problem belongs in the applied column for that problem; a paper that introduces a general method without a cell-ag deployment belongs here. As the column has grown, it is now sub-divided into seven method-architecture clusters that each occupy their own matrix row. The sections below mirror those clusters, plus a short section for AI Tooling-column refs that live in other method rows and a final section cross-referencing unpublished agent software catalogued in [`Software.md`](../Software.md). Closely paired is the [AI Evaluation & Benchmarking](./AIEvaluation.md) column, which catalogues papers whose primary contribution is an evaluation suite, benchmark, or eval methodology *for* the tools in this column.

## Foundation Models for Biology

Pretrained transformer models — distinct from agents in that they predict or generate without invoking external tools or planning multi-step workflows. They are the substrate downstream agentic systems build on, and the cluster where the boundary between "method paper" and "applied paper" is most often pragmatic rather than principled.

- [#42 OmicsLM](../Papers.md#42) (Sypetkowski et al. 2026) — a multimodal LLM connecting quantitative transcriptomic profiles with natural-language biological tasks; a candidate substrate for any cell-ag work involving omics interpretation, particularly in cellular-engineering contexts where scRNA-seq is already the dominant readout (refs [5](../Papers.md#5), [8](../Papers.md#8), [9](../Papers.md#9), [12](../Papers.md#12), [13](../Papers.md#13)).
- [#88 SpectraLLM](../Papers.md#88) (Su et al. 2026) — an LLM pretrained and fine-tuned to reason over multi-spectral data (IR, Raman, UV-Vis, NMR, MS) in a shared language space for end-to-end molecular structure prediction; the spectral analogue of OmicsLM for sensomics workflows (see also [SensoryPrediction.md](./SensoryPrediction.md)).
- [#91 NP Foundation Model](../Papers.md#91) (Ding et al. 2026, *Nat Machine Intelligence*) — a pretrained foundation model for small-molecule natural products; substrate for downstream tasks ranging from media-component prediction to flavor-precursor discovery.
- [#92 TranscriptFormer](../Papers.md#92) (Pearce et al. 2026, *Science*) — a generative cell atlas trained across 1.5 billion years of evolution and 12 species; the closest existing cross-species transcriptomic foundation model, with direct cell-ag utility for translating biological knowledge between bovine, porcine, chicken, salmonid, and other livestock cells where annotated reference data is sparse. Catalogued at `Foundation Models × Cellular Engineering` rather than `× AI Tooling` because its primary cell-ag relevance is direct: cross-species transcriptomic reasoning is the cellular-engineering substrate. See also the [TranscriptFormer software entry](../Software.md#transcriptformer).

## Scientific Literature & Discovery Agents

Agents focused on the scientific research process itself — retrieving and synthesizing literature, generating hypotheses, drafting papers. They are not domain-specific to biology, but the literature, methods, and ideation patterns relevant to cell-ag are squarely within their operating envelope.

- [#44 PaperQA](../Papers.md#44) (Lála et al. 2023, FutureHouse) — canonical retrieval-augmented agent for answering questions over scientific literature with verified citations.
- [#46 PaperQA2](../Papers.md#46) (Skarlinski et al. 2024, FutureHouse) — extends PaperQA with superhuman synthesis of scientific knowledge.
- [#45 The AI Scientist](../Papers.md#45) (Lu et al. 2024, Sakana AI) — first end-to-end framework for fully automated open-ended discovery: idea generation, experiment design, paper drafting.
- [#47 The AI Scientist-v2](../Papers.md#47) (Yamada et al. 2025, Sakana AI) — workshop-level extension using agentic tree search.
- [#53 ARIEL](../Papers.md#53) (Liu et al. 2026) — biomedical AI research assistant with expert-involved learning.

## General-Purpose Biomedical Agents

Broad biomedical-reasoning agents designed to handle multiple sub-domains within drug discovery, biomarker discovery, or generalist biomedical research. Distinct from the domain-specific cluster below in that they pitch themselves as horizontal platforms rather than vertical tools.

- [#40 TxAgent](../Papers.md#40) (Gao et al. 2025, Zitnik lab) — AI agent for therapeutic reasoning across a universe of 211 biomedical tools.
- [#49 Biomni](../Papers.md#49) (Huang et al. 2025, Stanford SNAP / Leskovec) — general-purpose biomedical AI agent across drug discovery, genomics, and clinical analysis.
- [#94 BRAD](../Papers.md#94) (Pickard et al. 2025, *Bioinformatics*) — automatic biomarker discovery and enrichment.
- [#95 OLAF](../Papers.md#95) (Riffle et al. 2025) — Open Life Science Analysis Framework for conversational bioinformatics; agent-pipe-router architecture.
- [#96 STELLA](../Papers.md#96) (Jin et al. 2025) — self-evolving LLM agent for biomedical research.
- [#98 BioMANIA](../Papers.md#98) (Dong et al. 2024) — conversational chatbot-per-Python-tool framework for simplifying bioinformatics data analysis.

## Chemistry / Synthesis Agents

Foundational LLM-agent patterns from chemistry. Both papers share a common template (LLM + curated chemistry tools + autonomous experiment loop) and have been the dominant reference for tool-augmented LLM design in the broader biomedical-agent literature.

- [#70 Coscientist](../Papers.md#70) (Boiko et al. 2023, *Nature*) — GPT-4 autonomous chemistry research system; the foundational pattern for tool-augmented LLMs in the natural sciences.
- [#71 ChemCrow](../Papers.md#71) (Bran et al. 2024, *Nat Machine Intelligence*) — GPT-4 + 18 chemistry tools for synthesis planning, drug discovery, and materials design.

## Domain-Specific Biomedical Agents

Agents specialized for a single biomedical task or sub-domain. Narrower scope than the general-purpose cluster above, but often the most directly transferable to cell-ag because the underlying tasks (sequencing analysis, perturbation prediction, metabolic-model reasoning, spatial biology) are also the tasks cell-ag workflows depend on.

- [#43 Lee NGS](../Papers.md#43) (Lee et al. 2025) — agentic AI for NGS downstream analysis (differential-expression workflows for users without computational backgrounds).
- [#50 Talk2Biomodels](../Papers.md#50) (Wehling et al. 2025, *BMC Bioinformatics*) — agent for kinetic biological models (SBML); the kinetic-modeling member of the AIAgents4Pharma Talk2X family.
- [#51 Medea](../Papers.md#51) (Sui et al. 2026, Zitnik lab) — omics AI agent for therapeutic discovery.
- [#54 ClockBase Agent](../Papers.md#54) (Ying et al. 2025) — autonomous agent mining methylation/RNA-seq data for aging interventions.
- [#56 SpatialAgent](../Papers.md#56) (Wang et al. 2025) — autonomous agent for spatial biology research.
- [#66 Lila](../Papers.md#66) (Singh et al. 2023, Carbonell group) — automated scientist for microbial strain design.
- [#68 Li LLMs ME](../Papers.md#68) (Li et al. 2024) — RAG-augmented LLMs for metabolic-engineering design.
- [#69 KinModGPT](../Papers.md#69) (Maeda & Kurata 2023) — GPT-driven generation of SBML kinetic models from natural-language texts.

Sibling refs in this row's `× Cellular Engineering` cell — cell-engineering-specific agentic work — include [#90 GenCellAgent](../Papers.md#90) (Yu et al. 2026, training-free cellular image segmentation), [#93 CellForge](../Papers.md#93) (Tang et al. 2026, agentic design of virtual cell models), and [#97 PerTurboAgent](../Papers.md#97) (Hao et al. 2025, self-planning agent for sequential Perturb-seq).

## Robot Scientists & Lab Automation

Closed-loop autonomous research systems integrating LLM agents with wet-lab execution. The cluster spans 25+ years of "Robot Scientist" work from the King group (Adam → Eve → Genesis) extended by recent LLM-era multi-agent systems.

- [#64 Genesis](../Papers.md#64) (Tiukova et al. 2024, King group) — third-generation robot scientist for systems biology.
- [#65 AutonoMS](../Papers.md#65) (Brunnsåker et al. 2025) — agentic AI integrated with scientific knowledge for laboratory validation in systems biology.

Sibling refs in this row's `× Bioprocess Control` cell — applied multi-agent lab automation for cell and organoid manufacturing — include [#61 Agentic Lab](../Papers.md#61) (Wang et al. 2025) and [#62 BioMARS](../Papers.md#62) (Qiu et al. 2025). See also [MetabolicModeling.md](./MetabolicModeling.md) for the broader closed-loop FBA / strain-design context.

## Agent Infrastructure (Frameworks, KGs, Protocols)

Substrate platforms — agent frameworks, biomedical knowledge-graph backends, and tool-orchestration protocols — that downstream agents are built on. These are the papers that don't introduce a specific agent but introduce the scaffolding that bespoke agent projects have historically had to reinvent.

- [#41 ToolUniverse](../Papers.md#41) (Gao et al. 2025) — ecosystem for democratizing AI scientists from any open- or closed-weight model; companion to [TxAgent](#general-purpose-biomedical-agents) (#40) and the rest of the Zitnik-lab agent stack.
- [#48 BioCypher](../Papers.md#48) (Lobentanzer et al. 2025, *Nat Biotech*) — knowledge-graph platform purpose-built for biomedical applications of LLMs.
- [#67 MCP Servers for biology](../Papers.md#67) (Ruscone et al. 2025, Saez-Rodriguez lab) — Model Context Protocol server implementations as AI-biology interfaces (NeKo, MaBoSS, PhysiCell).

## Other AI methodology in the AI Tooling column

Two papers in the AI Tooling column live outside the LLM/agent taxonomy above and don't fit any of the eight clusters:

- [#52 BioMedReasoner](../Papers.md#52) (Mulyadi et al. 2025, NeurIPS 2025 AI4Science Workshop) — multi-hop reasoning via path-based relational learning on biomedical knowledge graphs (lives in the [GNN](https://en.wikipedia.org/wiki/Graph_neural_network) row).
- [#63 Pandi et al.](../Papers.md#63) (2022, *Nat Comms*) — versatile active-learning workflow for optimization of genetic and metabolic networks (lives in the [Active Learning](https://en.wikipedia.org/wiki/Active_learning_(machine_learning)) row).

## Related Software (Not in Matrix)

A growing number of AI-agent tools are released as open-source platforms or commercial products without a separate companion paper. They don't appear in the matrix (which catalogues papers, not tools) but are catalogued in [`Software.md`](../Software.md#ai-agents--foundation-models), and they fill important gaps in the agent landscape:

- [K-Dense-AI](../Software.md#k-dense-ai) — co-scientist ecosystem combining the commercial K-Dense Web platform with an open-source stack of Agent Skills (`scientific-agent-skills`, 120+ skills wrapping scientific Python libraries including `cobrapy`, `pyopenms`, `scanpy`/`scvi-tools`, `rdkit`/`datamol`), the `k-dense-byok` desktop client, the `mimeo` skill-generation tool, and `claude-scientific-writer`. Directly composable with Claude Code, Cursor, and other code-execution agents.
- [Superpowers](../Software.md#superpowers) (`obra/superpowers`) — one of the most-starred general-purpose Claude Code skill collections (Jesse "obra" Vincent). Domain-agnostic skills for planning, debugging, code review, and execution that compose cleanly with the cell-ag-specific skill packs above.
- [Skill Seekers](../Software.md#skill-seekers) — meta-tool that converts documentation websites, GitHub repos, and PDFs into Claude AI skills with automatic conflict detection. The closest existing automation for the pattern an AI-augmented cell-ag lab needs as it scales: turn a new wet-lab protocol, bioinformatics package, or GitHub library into a skill that the lab's agents can call directly.
- [AI Research Skills Library](../Software.md#ai-research-skills-library) (`orchestra-research/AI-research-SKILLs`) — open-source skills library covering AI research and ML engineering infrastructure (vLLM, Megatron, GRPO, HuggingFace). Relevant for cell-ag teams building or fine-tuning their own biology foundation models or running large-scale agentic workflows.
- [AIAgents4Pharma](../Software.md#aiagents4pharma) — beyond the published [Talk2Biomodels](../Papers.md#50) (#50), the platform hosts three sibling Talk2X agents — **Talk2KnowledgeGraphs**, **Talk2Cells**, and **Talk2Scholars** — that share infrastructure but lack standalone papers at time of curation.
- [Seqera AI / Co-Scientist](../Software.md#seqera-ai--co-scientist) — Seqera Cloud's AI assistant for Nextflow pipeline authoring, debugging, and workflow-run analysis.
- [Dotmatics Luma](../Software.md#dotmatics-luma) — commercial lab-orchestration platform connecting laboratory instruments, data systems, and AI assistance; representative of the commercial-tooling layer cell-ag startups increasingly evaluate as they scale beyond bench-scale workflows.

## Further reading

- Software: [AI Agents & Foundation Models](../Software.md#ai-agents--foundation-models) section in `Software.md`.
- Adjacent research areas: [AI Evaluation & Benchmarking](./AIEvaluation.md), [Media Optimization](./MediaOptimization.md), [Cellular Engineering](./CellEngineering.md), [Bioprocess Control](./Bioprocess.md), [Sensory Prediction](./SensoryPrediction.md), [Metabolic Modeling](./MetabolicModeling.md).
- Talks: [AI Agents & Foundation Models for Biology](../OtherResources.md#ai-agents--foundation-models-for-biology) section in `OtherResources.md`.
