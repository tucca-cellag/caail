# Chemistry / Synthesis Agents

This page describes the **Chemistry / Synthesis Agents** row of the [Papers.md matrix](../Papers.md): LLM agents specialized for chemistry, covering synthesis planning, molecular reasoning, and autonomous chemical experimentation. The row's authoritative scope is its [Taxonomy.md definition](../Taxonomy.md#chemistry--synthesis-agents); this page synthesizes what currently sits in it.

## Scope boundary

The row is for agents whose *domain* is chemistry, which is narrower than it first sounds. An agent that reads the chemistry literature belongs in [Scientific Literature & Discovery Agents](./LiteratureDiscoveryAgents.md); one that drives instruments without a chemistry-specific tool layer belongs in [Robot Scientists & Lab Automation](./RobotScientistsLabAutomation.md); one that reasons over biological rather than chemical entities belongs in [Domain-Specific Biomedical Agents](./DomainSpecificBiomedicalAgents.md). What puts a paper here is that the tools the LLM is given are chemistry tools: reaction prediction, retrosynthesis, molecular property calculation, safety screening.

Both references sit in the [AI Tooling / Methodology](../ResearchAreas/AITooling.md) column, because neither is applied to a cellular-agriculture problem. They are catalogued because the architecture transfers: media formulation, scaffold chemistry, and flavor-molecule design are all chemistry problems posed in a cell-ag setting, and these two papers are the reference implementations of an LLM planning and executing chemical work.

## AI Tooling / Methodology

- [#70 Coscientist](../Papers.md#70) (Boiko et al. 2023, *Nature*): a GPT-4 system that designs, plans and executes chemical experiments, demonstrated across six tasks including optimization of palladium-catalysed cross-couplings. The architecture is the durable contribution and is worth reading structurally: a Planner module holds the reasoning loop and is given a four-command action space, `GOOGLE` (web search, itself an LLM), `PYTHON` (calculation, run in an isolated Docker container so a generated script cannot reach the host), `DOCUMENTATION` (retrieval and summarization of an instrument API) and `EXPERIMENT` (execution against real hardware). The documentation and experiment commands were demonstrated against the Opentrons Python API and Emerald Cloud Lab's Symbolic Lab Language, so the same pattern covers both a benchtop liquid handler and a cloud lab. The Planner can also repair its own code when execution errors come back, which is what turns a one-shot generation into a loop. Catalogued in [`Software.md`](../Software.md#coscientist).
- [#71 ChemCrow](../Papers.md#71) (Bran et al. 2024, *Nature Machine Intelligence*): GPT-4 augmented with 18 expert-designed chemistry tools, organized as general, molecular, and reaction tools and wired together through LangChain on a ReAct-style reasoning loop. The agent planned and executed syntheses of an insect repellent and three organocatalysts, and guided discovery of a novel chromophore. Two details matter beyond the headline. The tool layer includes a literature-search tool built on `paper-qa` with OpenAI embeddings over a FAISS index, so the agent grounds answers in documents rather than in weights, which is the same retrieval pattern the [literature-agent row](./LiteratureDiscoveryAgents.md) is built around. And the pipeline includes a safety check that halts execution when an input molecule is identified as a controlled chemical, one of the few published agent designs where refusal is a component rather than a prompt instruction. Evaluation combined LLM-based and expert human assessment. Code at [ur-whitelab/chemcrow-public](https://github.com/ur-whitelab/chemcrow-public).

Read together, the two papers separate a question that is easy to conflate: Coscientist shows an agent closing the loop to physical hardware, ChemCrow shows an agent whose competence comes from a curated tool set rather than from the base model. A cell-ag team building an autonomous formulation or assay loop is choosing along both axes at once.

## Adjacent methods

- [Robot Scientists & Lab Automation](./RobotScientistsLabAutomation.md): the closed-loop experimental systems Coscientist's `EXPERIMENT` command connects to, including work that predates the LLM era.
- [Scientific Literature & Discovery Agents](./LiteratureDiscoveryAgents.md): the retrieval-grounded agents ChemCrow's `LitSearch` tool is drawn from.
- [General-Purpose Biomedical Agents](./GeneralPurposeBiomedicalAgents.md) and [Domain-Specific Biomedical Agents](./DomainSpecificBiomedicalAgents.md): the biology-facing counterparts of the same tool-augmented pattern.
- [Agent Infrastructure (Frameworks, KGs, Protocols)](./AgentInfrastructure.md): the framework and protocol layer these agents are assembled from.
- [Reinforcement Learning](./ReinforcementLearning.md): where chemistry reasoning models post-trained on verifiable problems sit, rather than in this row.

## Further reading

- Research area: [AI Tooling / Methodology](../ResearchAreas/AITooling.md), and the field overview in [`AIAgentsFoundationModels.md`](../AIAgentsFoundationModels.md).
- Software: [`Software.md`](../Software.md#coscientist) for Coscientist, and the [AI Agents & Foundation Models](../Software.md#ai-agents--foundation-models) section for the wider agent tooling.
- Evaluation: [Benchmarks & Evaluation Frameworks](./BenchmarksEvaluation.md), for how well agents of this kind actually perform.
