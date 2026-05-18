# AI Evaluation & Benchmarking

This page describes the **AI Evaluation & Benchmarking** column of the [Papers.md matrix](../Papers.md) — peer-reviewed and preprint research whose primary contribution is an **evaluation dataset, benchmark suite, leaderboard, or evaluation methodology** for AI systems applied to biology and the broader natural sciences. The column is a sibling to [AI Tooling / Methodology](./AITooling.md), separating two questions that had been getting tangled: *what AI tools and agents have been built* (AI Tooling) versus *how well do they actually work, and how do we measure that* (this column).

CAAIL's curatorial stance is that **evaluation is now the limiting reagent** for AI-for-biology research. Foundation models, agent frameworks, and tool-augmented LLMs are released faster than the cell-ag community can assess them; without standardized benchmarks it is impossible to tell which model genuinely advances the state of a task and which one fits a vendor demo. The papers in this column are the substrate any cell-ag team should consult before deciding to deploy a new model in media optimization, cellular engineering, bioprocess control, scaffolding, sensory prediction, or any of the other applied columns.

The boundary between this column and AI Tooling is pragmatic: a paper that introduces a benchmark **and** uses it to score a new model goes here (the benchmark is the durable contribution); a paper that introduces a model and uses an existing benchmark to evaluate it goes in AI Tooling or the appropriate applied column. Evaluation methodology papers — work on verifier reliability, hypothesis-testing protocols, and meta-evaluation — also live here.

## Benchmarks & Evaluation Frameworks

### Comparison

| Benchmark | Year | Domain | Task style | Scope | Companion |
|---|---|---|---|---|---|
| [#146 LAB-Bench](../Papers.md#146) (Laurent et al. 2024, FutureHouse) | 2024 | Biology research | Practical lab tasks (literature, figure reading, protocols, DNA/protein sequence ops, cloning, database access) | 2,400+ multiple-choice questions across 8 task types | [Datasets.md](../Datasets.md#lab-bench) |
| [#108 BixBench](../Papers.md#108) (Mitchener et al. 2025, FutureHouse) | 2025 | Computational biology | Multi-step bioinformatics workflows derived from peer-reviewed papers and their code/data | 50+ real-world scenarios | [Datasets.md](../Datasets.md#bixbench) |
| [#147 BLADE](../Papers.md#147) (Gu et al. 2025) | 2025 | Data-driven science | Open-ended data-analysis tasks requiring decision-making across analytical paths | 14 datasets, expert decision sequences | [Datasets.md](../Datasets.md#blade) |
| [#149 Duan et al. 2025](../Papers.md#149) | 2025 | Systems biology | LLM-driven dry-lab experimentation in mechanistic ODE models — design, prediction, parameter inference | Multiple systems-bio model suites | — |
| [#109 MassSpecGym](../Papers.md#109) (Bushuiev et al. 2024) | 2024 | Mass spectrometry | MS/MS-spectra → molecular structure (de novo + database retrieval + classification) | 231 k records, NeurIPS 2024 D&B Spotlight | [Datasets.md](../Datasets.md#massspecgym) |
| [#110 PubChem LLM Retrieval Eval](../Papers.md#110) (Sze & Hassoun 2024) | 2024 | Chemistry retrieval | Search-enabled LLMs retrieving structured records from PubChem | Multi-prompt eval over PubChem | — |
| [#148 ProteinGym](../Papers.md#148) (Notin et al. 2023, Marks lab) | 2023 | Protein design | Variant-effect prediction (DMS substitutions + indels) and clinical-variant classification | 200+ DMS assays, ~2.5 M mutated sequences | [Datasets.md](../Datasets.md#proteingym) · [Databases.md leaderboard](../Databases.md#proteingym-leaderboard) |
| [#127 CausalBench](../Papers.md#127) (Chevalley et al. 2025) | 2025 | Single-cell perturbation | Network inference from single-cell perturbation data (framework; data sourced externally) | Large-scale CRISPR-perturbation benchmark | [Software.md](../Software.md#causalbench) |
| [#89 AssayBench](../Papers.md#89) (Brouwer et al. 2026) | 2026 | Virtual cell | Assay-level virtual-cell predictions evaluated against held-out assays | Cross-assay benchmark for LLMs and agents | — |
| [#113 / #114 single-cell FM critique](../Papers.md#113) (Boiarsky et al. 2024 + Yang et al. 2024 reply) | 2024 | Single-cell foundation models | Deeper evaluation of scFM predictions vs. simple baselines | Critical eval + reply | — |
| [#55 E-valuator](../Papers.md#55) (Sadhuka et al. 2025) | 2025 | Verifier reliability | Sequential hypothesis testing for reliable agent verifiers (eval methodology, not a benchmark) | Methodology paper | — |
| BioMysteryBench (Anthropic) | 2026 | Bioinformatics research | Vendor-released eval dataset for frontier-LLM bioinformatics capability | HuggingFace dataset, no companion paper | [Datasets.md](../Datasets.md#biomysterybench) |
| [#150 CompBioBench](../Papers.md#150) (Nair et al. 2026, Genentech) | 2026 | Computational biology | Well-scoped, verifiable agentic tasks across genomics, transcriptomics, epigenomics, single-cell, human genetics, and ML workflows | 100 expert-curated questions with synthetic/scrambled ground truth | [Datasets.md](../Datasets.md#compbiobench-v1) · [Databases.md leaderboard](../Databases.md#compbiobench-v1-leaderboard) |

### Multi-task agent benchmarks

Benchmarks that evaluate agents on broad, multi-step scientific tasks rather than a single predictive sub-task. These are the closest existing eval suites for measuring whether an LLM agent can plan and execute the kind of workflow a cell-ag bioinformatician would delegate to it.

- [#146 LAB-Bench](../Papers.md#146) (Laurent et al. 2024, FutureHouse) — 2,400+ MCQs across literature reading, figure interpretation, protocol design, DNA/protein sequence manipulation, cloning, and database access. The single broadest practical-biology eval at time of curation, and the FutureHouse counterpart to [#108 BixBench](../Papers.md#108). Data + bundled scoring code at [Datasets.md / LAB-Bench](../Datasets.md#lab-bench).
- [#108 BixBench](../Papers.md#108) (Mitchener et al. 2025, FutureHouse) — 205 questions derived from 60 real-world published Jupyter notebooks; complements LAB-Bench's atomized question format with full multi-step task execution. Data + bundled scoring code at [Datasets.md / BixBench](../Datasets.md#bixbench).
- [#147 BLADE](../Papers.md#147) (Gu et al. 2025, EMNLP Findings) — evaluates agents on open-ended data analysis where the "correct" answer is a defensible analytical path, not a single value; built around 14 datasets and expert-annotated ground-truth decision sequences. Pairs with the same authors' [#151 / #152 Gu CHI 2024](../Papers.md#151) studies on how humans actually use AI assistants for analysis. Data + bundled scoring code at [Datasets.md / BLADE](../Datasets.md#blade).
- [#149 Duan et al. 2025](../Papers.md#149) (Maddison group) — uses mechanistic ODE-based systems-biology models as a dry-lab substrate: the LLM proposes experiments, observes simulated outcomes, and updates its understanding, putting iterative scientific reasoning rather than single-shot QA under test.
- **BioMysteryBench** (Anthropic) — vendor-released bioinformatics eval dataset distributed via [Datasets.md / BioMysteryBench](../Datasets.md#biomysterybench), released alongside Anthropic's *Evaluating Claude's bioinformatics research capabilities* study. No companion peer-reviewed paper at time of curation, but useful as a reference point when comparing frontier LLMs on the multi-step bioinformatics tasks cell-ag agents increasingly handle.
- [#150 CompBioBench](../Papers.md#150) (Nair et al. 2026, Genentech) — 100 expert-curated questions across genomics, transcriptomics, epigenomics, single-cell analysis, human genetics, and ML workflows, with ground truth pinned via synthetic/augmented data or metadata-scrambling of real datasets to give each task a single verifiable answer. Agents are evaluated end-to-end from a bare environment, fetching data and tools as needed. Data + bundled bioinformatics artifacts at [Datasets.md / CompBioBench v1](../Datasets.md#compbiobench-v1); live results at [Databases.md / CompBioBench v1 Leaderboard](../Databases.md#compbiobench-v1-leaderboard).

### Domain-specific predictive benchmarks

Benchmarks targeting a single predictive task within a domain — what a model must output is well-defined, so model performance is directly comparable across releases.

- [#148 ProteinGym](../Papers.md#148) (Notin et al. 2023, Marks lab) — the dominant variant-effect benchmark; 200+ deep mutational scanning assays plus clinical variant tasks across substitutions and indels. Directly relevant to any cell-ag protein-engineering work (growth factors, scaffolds, recombinant ECM proteins) that uses a protein language model. Data + bundled scoring code at [Datasets.md / ProteinGym](../Datasets.md#proteingym); live substitution + indel leaderboards at [Databases.md / ProteinGym Leaderboard](../Databases.md#proteingym-leaderboard).
- [#109 MassSpecGym](../Papers.md#109) (Bushuiev et al. 2024, Pluskal lab; NeurIPS 2024 Datasets & Benchmarks Spotlight) — MS/MS → structure benchmark with de novo, database-retrieval, and chemical-class prediction sub-tasks. The cleanest existing substrate for ML-based flavor-compound identification in cell-ag sensomics workflows. Data + bundled scoring code at [Datasets.md / MassSpecGym](../Datasets.md#massspecgym).
- [#110 PubChem LLM Retrieval Eval](../Papers.md#110) (Sze & Hassoun 2024, Tufts) — evaluates how reliably search-enabled LLMs pull structured chemical metadata from PubChem; relevant whenever an agent must verify a compound identifier before passing it downstream into a media-formulation, scaffold-chemistry, or flavor-prediction workflow.

### Cell-state and virtual-cell benchmarks

Benchmarks specific to the foundation-model and virtual-cell research programs that increasingly dominate AI-for-biology. Their cell-ag relevance is direct: livestock cell biology is starting to ride the same single-cell foundation-model wave, and the benchmark debates here will set the bar for what counts as a useful livestock-cell model.

- [#113 Boiarsky et al. 2024](../Papers.md#113) — "Deeper evaluation of a single-cell foundation model" (*Nature Machine Intelligence*) — shows that several headline scFM benchmark wins do not survive comparison against simpler baselines.
- [#114 Yang et al. 2024](../Papers.md#114) — reply from the original scFM authors. The Boiarsky/Yang pair is required reading for any team deciding whether to invest in scFMs vs. classical methods for livestock-cell tasks. The underlying scFM (scBERT) is catalogued at [Software.md / scBERT](../Software.md#scbert).
- [#127 CausalBench](../Papers.md#127) (Chevalley et al. 2025) — large-scale benchmark framework for network inference from single-cell perturbation data; the closest cell-ag-relevant eval suite for any model that promises to infer regulatory networks driving lineage commitment or response to media perturbations. Framework code at [Software.md / CausalBench](../Software.md#causalbench); the benchmark sources data externally (Replogle et al. genome-wide Perturb-seq) rather than bundling its own dataset, so no `Datasets.md` entry.
- [#89 AssayBench](../Papers.md#89) (Brouwer et al. 2026) — assay-level virtual-cell benchmark for LLMs and agents; complements the cell-state benchmarks above by testing whether models can predict assay outcomes rather than gene-expression vectors.

### Evaluation methodology & reliability

The cluster's "meta" papers — work on how evaluation itself is done, rather than a benchmark for a specific task.

- [#55 E-valuator](../Papers.md#55) (Sadhuka et al. 2025) — sequential hypothesis testing for reliable agent verifiers; the closest existing answer to *"how confident should I be that this verifier's pass/fail signal is real?"* for any cell-ag team building an autonomous loop on top of an LLM agent.
