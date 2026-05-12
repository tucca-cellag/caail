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

## Metabolic Modeling & Strain Design

This section catalogs the open-source tooling for constraint-based and kinetic metabolic modeling — the computational stack used to build genome-scale metabolic models (GEMs), simulate flux distributions, design strain knockouts, and reason about cell physiology. These tools are the foundation for media-formulation optimization, bioprocess scale-up, and cell-line metabolic engineering in cellular agriculture. For cell-ag-specific GEMs (BtaSBML2986, iES1300, etc.), see the corresponding section in [Data.md](./Data.md).

### [COBRApy](https://github.com/opencobra/cobrapy)

Summary: The de-facto Python package for constraint-based modeling of metabolic networks, hosted by the openCOBRA consortium. Provides FBA, FVA, gene and reaction knockouts, flux sampling (OptGP, ACHR), gap-filling, production envelopes, dynamic FBA, and SBML I/O on a unified `Model` object that integrates cleanly with NumPy / pandas / SymPy. The reference implementation for FBA in the bioinformatics community.

Docs: <http://opencobra.github.io/cobrapy/>.

### [COBRA Toolbox](https://github.com/opencobra/cobratoolbox)

Summary: The MATLAB counterpart to COBRApy, also under the openCOBRA umbrella. Older but more feature-rich for advanced methods (thermodynamics-aware FBA via multiTFA, ME-models via COBRAme, elementary flux modes), and still the production tool of choice in many academic labs. For new cell-ag work, COBRApy is usually the better starting point unless a specific COBRA Toolbox feature is required.

Docs: <https://opencobra.github.io/cobratoolbox>.

### [Memote](https://github.com/opencobra/memote)

Summary: The genome-scale metabolic model test suite, providing automated QC and benchmarking for SBML GEMs. Computes >100 metrics covering annotation completeness, stoichiometric consistency, biomass formulation, growth simulation, and reproducibility, producing a versioned HTML report. Used by BiGG Models and the openCOBRA community as the de-facto curation standard; any cell-ag-specific GEM should be benchmarked with Memote before downstream use.

Docs: <https://memote.readthedocs.io/>.

### [Escher](https://github.com/zakandrewking/escher)

Summary: A web-based tool for building, sharing, and embedding visualizations of metabolic pathway maps, with bi-directional integration to COBRApy via JSON. Supports interactive overlay of flux distributions, reaction knockouts, and metabolite concentrations on hand-drawn or auto-generated pathway maps.

Project page: <https://escher.github.io>.

### [BiGG Models](http://bigg.ucsd.edu/)

Summary: A repository of >75 manually curated, BiGG-standardized genome-scale metabolic models covering bacteria, archaea, fungi, and several eukaryotes, hosted at UCSD (Palsson lab). Each model is provided in SBML, MATLAB `.mat`, and JSON formats, with standardized reaction / metabolite IDs (BiGG nomenclature) that cross-link to MetaNetX, KEGG, and ChEBI. The canonical starting point for any constraint-based modeling work.

### [BioModels](https://www.ebi.ac.uk/biomodels/)

Summary: A free, open-source repository of mathematical models of biological and biomedical systems, hosted by EMBL-EBI, containing thousands of curated SBML models spanning metabolism, signaling, cell-cycle, immunology, and pharmacokinetics. Models are versioned, peer-reviewed via the Curation Service, and accessible programmatically via a REST API. Endorsed companion to the Talk2Biomodels agent ([Papers.md ref #50](./Papers.md#50)).

### [COPASI](https://github.com/copasi/COPASI)

Summary: A software application for simulation and analysis of biochemical networks and their dynamics, supporting deterministic ODE integration, stochastic Gillespie simulation, steady-state analysis, parameter estimation, sensitivity analysis, and metabolic control analysis. Cross-platform GUI plus Python bindings via `basico`; used as the simulation backend by Talk2Biomodels.

Project page: <https://copasi.org>.

### [Tellurium](https://github.com/sys-bio/tellurium)

Summary: A Python environment for modeling and simulating biological systems built around libRoadRunner (fast SBML simulator), Antimony (human-readable model language), and notebook-friendly workflows. Bridges between SBML, ODE simulation, parameter scans, and Python-native scripting. Maintained by the Sauro lab at University of Washington.

Project page: <http://tellurium.analogmachine.org/>.

### [RAVEN Toolbox](https://github.com/SysBioChalmers/RAVEN)

Summary: A MATLAB toolbox for genome-scale metabolic model reconstruction, curation, and analysis, maintained by the Nielsen lab at Chalmers. Provides automated reconstruction from KEGG, MetaCyc, or template models, gap-filling, model curation tools, and integration with COBRA Toolbox; widely used to build species-specific GEMs in food, fermentation, and biopharma settings.

Docs: <http://sysbiochalmers.github.io/RAVEN/>.

### [StrainDesign](https://github.com/klamt-lab/straindesign)

Summary: A Python package built on COBRApy that consolidates the strain-design MILP family — OptKnock, OptCouple, RobustKnock, Minimal Cut Sets (MCS / advanced MCS) — into a single API for in-silico engineering of metabolic networks. Useful beyond microbial work for identifying knockouts in cultivated mammalian cell GEMs that redirect flux toward biomass while suppressing lactate accumulation.

### [CNApy](https://github.com/cnapy-org/CNApy)

Summary: An integrated visual environment for metabolic modeling that wraps COBRApy with a GUI for FBA, FVA, Elementary Flux Modes, thermodynamic methods, Minimal Cut Sets, OptKnock, RobustKnock, OptCouple, and other strain-design techniques. Strong fit for teaching and for users who prefer interactive exploration over notebook-based work.

Docs: <https://cnapy-org.github.io/CNApy-guide/>.

**Agent integration.** Code-execution agents (Cursor, Claude Code, Biomni) can invoke any of these tools as Python; for COBRApy specifically, the [`cobrapy` skill from K-Dense-AI's scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/scientific-skills/cobrapy) (see the [K-Dense-AI entry below](#k-dense-ai)) provides curated recipes that make this reliable in agent loops.

## Mass Spectrometry & Chemometrics

Tooling for mass-spectrometry-based proteomics and metabolomics workflows, plus multivariate statistical analysis ("chemometrics") of the resulting data. Used heavily in flavor / off-flavor metabolomics, spent-media analysis for cultivated meat, and sensory-instrumental data fusion. See also the [`pyopenms` skill](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/scientific-skills/pyopenms) in [K-Dense-AI](#k-dense-ai) for an agent-callable wrapper around OpenMS.

### [OpenMS / pyOpenMS](https://github.com/OpenMS/OpenMS)

An open-source C++ framework with Python bindings (pyOpenMS) for mass-spectrometry data analysis, from raw spectra processing through quantitative proteomics and metabolomics. Maintained by an international consortium led by the Kohlbacher lab (Tübingen); OpenMS 3 (Pfeuffer et al. 2024, *Nat Methods*) provides a modular toolkit (TOPP), Python bindings, KNIME nodes, Galaxy wrappers, and integrations with nf-core pipelines (e.g. nf-core/quantms). Widely used for flavor metabolomics, off-flavor characterization, and as a building block in larger workflow-manager pipelines.

Project page: <https://openms.de/>. pyOpenMS docs: <https://pyopenms.readthedocs.io/>.

### [ropls](http://bioconductor.org/packages/ropls/)

An R package on Bioconductor implementing PCA, PLS, OPLS, and OPLS-DA for chemometric analysis of metabolomics and other -omics data (Thévenot et al. 2015, *J Proteome Res*). Provides the multivariate engine in the Workflow4Metabolomics Galaxy platform and is widely used in flavor / sensory metabolomics for sensory-instrumental correlation, biomarker discovery, and quality-control modeling. See also [`ropls` in the K-Dense-AI scientific-agent-skills collection](https://github.com/K-Dense-AI/scientific-agent-skills) for an agent-callable wrapper.

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

### [K-Dense-AI](https://github.com/K-Dense-AI)

K-Dense-AI is an AI co-scientist ecosystem combining a commercial agent platform ([K-Dense Web](https://k-dense.ai), which autonomously executes complex science / engineering / healthcare / finance tasks end-to-end) with a substantial open-source stack of agent infrastructure:

- **[scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills)** — A multi-domain collection of 120+ "Agent Skills" wrapping scientific Python libraries and platforms in Claude Code / Cursor / Antigravity-compatible format. Each skill provides curated recipes, code examples, and discovery prompts for one library. Cell-ag-relevant skills include `cobrapy` (FBA / metabolic modeling — see [Metabolic Modeling & Strain Design](#metabolic-modeling--strain-design)), `pyopenms` (mass spectrometry), `scanpy` / `scvi-tools` / `anndata` (single-cell analysis), `rdkit` / `datamol` / `medchem` (cheminformatics), `biopython` / `bioservices` / `gget` (bioinformatics utilities), `cellxgene-census`, `pyzotero`, and many others.
- **[k-dense-byok](https://github.com/K-Dense-AI/k-dense-byok)** — A bring-your-own-key desktop client that runs the Scientific Agent Skills locally with your own LLM API keys.
- **[mimeo](https://github.com/K-Dense-AI/mimeo)** — A tool for "mimeographing" an expert's knowledge into a `SKILL.md` / `AGENTS.md` file consumable by Claude Code or similar agents.
- **[mimeographs](https://github.com/K-Dense-AI/mimeographs)** — A collection of persona-based agent skills (founders, philosophers, scientists) generated with mimeo.
- **[claude-scientific-writer](https://github.com/K-Dense-AI/claude-scientific-writer)** — A Claude-Code-compatible general-purpose scientific writing agent.

Not an MCP server but a documentation-and-prompt-context layer that pairs well with code-execution agents like Biomni, Cursor, and Claude Code.

Project page: <https://k-dense.ai>.

### [Seqera AI / Co-Scientist](https://docs.seqera.io/platform-cloud/seqera-ai/)

Summary: Seqera Cloud's AI assistant for bioinformatics workflows, providing an interactive co-scientist that helps users author and debug Nextflow pipelines, query workflow run data, and interpret results. Accessible through the Seqera CLI and Seqera Platform; no companion paper at time of curation.
