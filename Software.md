# Software & Code

This library collects open-source tools that apply computational methods and AI related to cellular agriculture. Be sure to check [Papers](./Papers.md) for code that's associated with a Cellular Agriculture paper.

## Media Optimization & Cell Line Engineering

### [AlphaFold](https://github.com/google-deepmind/alphafold)

Summary: Predicts the 3D structure of proteins from their amino acid sequence using deep learning. Can be used for design and engineering of cost-effective recombinant growth factors and signaling molecules. Predicting protein structure helps optimize stability, activity, and binding affinity, reducing the high cost associated with media components.

### [Protein Language Models](https://github.com/ISYSLAB-HUST/Protein-Language-Models)

Summary: This is a collection of links to Protein Language Models, which are models trained to predict structure and function. Can be used for the design and engineering of cost-effective recombinant growth factors and signaling molecules.

### [foldseek](https://github.com/steineggerlab/foldseek)

Summary: Search large protein databases using monomers and multimers. Can be used to find known structures to infer function or guide engineering efforts of a new or target protein.

## Bioprocess Modeling & Scaling
This category includes simulation and modeling tools for optimizing the  bioreactor environment.

### [OpenFOAM](https://www.openfoam.com/)

Summary: An open-source suite for Computational Fluid Dynamics (CFD) Used to model and a variety of environmental factors within bioreactors, to ensure viable conditions at scale.

### [CompuCell3D](https://github.com/CompuCell3D/CompuCell3D)

Summary: A modeling environment for simulating cell-cell and cell-environment interactions. Enables the modeling of complex phenomena like cell proliferation, nutrient gradients within thick tissues, and the mechanics of cells interacting with scaffolds.

### [PhysiCell](https://github.com/MathCancer/PhysiCell/)

Summary: A physics-based framework specialized for multi-cell simulations. Can be used to model complex cell behaviors, including differentiation and nutrient limitations in tissue cultures.

## AI Agents & Foundation Models

This section catalogs general-purpose AI infrastructure — agent frameworks, foundation models for biology, and tool ecosystems — that can be applied across cellular agriculture problems. See also the `AI Tooling / Methodology` column in [Papers.md](./Papers.md) for the research papers describing these systems.

### [ToolUniverse](https://github.com/mims-harvard/ToolUniverse)

Summary: An ecosystem for building AI scientists from any language or reasoning model, providing a unified interface across open- and closed-weight models and a shared tool/data/analysis environment. Provides infrastructure that bespoke biomedical AI agent projects have historically had to reinvent. Companion to the Gao et al. 2025 paper introducing ToolUniverse ([Papers.md ref #41](./Papers.md#41)).

Project page: <https://aiscientist.tools/>. Docs: <https://zitniklab.hms.harvard.edu/ToolUniverse/>.

### [Biomni](https://github.com/snap-stanford/Biomni)

Summary: A general-purpose biomedical AI agent from Stanford's SNAP lab (Leskovec group) that performs autonomous multi-step research workflows across drug discovery, genomics, clinical analysis, and adjacent biomedical domains. Companion to the Huang et al. 2025 paper ([Papers.md ref #49](./Papers.md#49)).

Project page: <https://biomni.stanford.edu>. AWS tutorial (Biomni + Bedrock AgentCore): <https://aws.amazon.com/blogs/machine-learning/build-a-biomedical-research-agent-with-biomni-tools-and-amazon-bedrock-agentcore-gateway/>.

### [AIAgents4Pharma](https://github.com/VirtualPatientEngine/AIAgents4Pharma)

Summary: An open-source AI-agent platform from VirtualPatientEngine targeting drug discovery and pharmaceutical R&D. Hosts a family of LLM-based agents — Talk2Biomodels (kinetic biological models), Talk2KnowledgeGraphs, Talk2Cells, and Talk2Scholars — that share infrastructure for tool use and reasoning over biomedical resources. Companion to the Wehling et al. 2025 Talk2Biomodels paper ([Papers.md ref #50](./Papers.md#50)).

Docs: <https://virtualpatientengine.github.io/AIAgents4Pharma/>.

### [AI Scientist](https://github.com/SakanaAI/AI-Scientist)

Summary: Sakana AI's framework for fully automated open-ended scientific discovery via large language models, performing end-to-end idea generation, experimentation, and paper drafting. Version 2 ([SakanaAI/AI-Scientist-v2](https://github.com/SakanaAI/AI-Scientist-v2)) extends the system to workshop-level automated discovery via agentic tree search. Companion to Lu et al. 2024 ([Papers.md ref #45](./Papers.md#45)) and Yamada et al. 2025 ([Papers.md ref #47](./Papers.md#47)).

Project home: <https://sakana.ai/>.

### [PaperQA](https://github.com/Future-House/paper-qa)

Summary: An open-source retrieval-augmented generative agent for answering questions over scientific literature with verified citations, from the [FutureHouse](https://www.futurehouse.org/) research lab. Released as PaperQA in 2023 and substantially extended in PaperQA2 (2024), which achieves superhuman synthesis accuracy on literature questions. Companion to [Papers.md ref #44](./Papers.md#44) (PaperQA, Lála et al. 2023) and [ref #46](./Papers.md#46) (PaperQA2, Skarlinski et al. 2024).

FutureHouse cookbook (docs): <https://futurehouse.gitbook.io/futurehouse-cookbook>. Commercial spinout — Edison Scientific: <https://edisonscientific.com/> ([docs](https://docs.edisonscientific.com)).

### [Seqera AI / Co-Scientist](https://docs.seqera.io/platform-cloud/seqera-ai/)

Summary: Seqera Cloud's AI assistant for bioinformatics workflows, providing an interactive co-scientist that helps users author and debug Nextflow pipelines, query workflow run data, and interpret results. Accessible through the Seqera CLI and Seqera Platform; no companion paper at time of curation.
