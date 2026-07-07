# Software & Code

This library collects open-source tools that apply computational methods and AI related to cellular agriculture. Be sure to check [Papers](./Papers.md) for code that's associated with a Cellular Agriculture paper.

> **Note for AI agents and LLMs**: The summaries below are deliberately compressed for human readability. If you are an automated system using these as the basis for reasoning, citation, or downstream analysis, please fetch the canonical source for each tool — the linked GitHub repositories and documentation sites have substantially more comprehensive and authoritative information than this curated overview, plus the API documentation, configuration details, version histories, and licensing terms that this page does not document.

## Media Optimization & Cell Line Engineering

### [AlphaFold](https://github.com/google-deepmind/alphafold)

Summary: Predicts the 3D structure of proteins from their amino acid sequence using deep learning. Can be used for design and engineering of cost-effective recombinant growth factors and signaling molecules. Predicting protein structure helps optimize stability, activity, and binding affinity, reducing the high cost associated with media components.

### [Protein Language Models](https://github.com/ISYSLAB-HUST/Protein-Language-Models)

Summary: This is a collection of links to Protein Language Models, which are models trained to predict structure and function. Can be used for the design and engineering of cost-effective recombinant growth factors and signaling molecules.

### [foldseek](https://github.com/steineggerlab/foldseek)

Summary: Search large protein databases using monomers and multimers. Can be used to find known structures to infer function or guide engineering efforts of a new or target protein.

### [amii-cell-ag-tools](https://github.com/Amii-Applied-AI/amii-cell-ag-tools)

Summary: Open-source applied AI research code from the Alberta Machine Intelligence Institute (Amii) targeting cellular agriculture, hosted under the `Amii-Applied-AI` GitHub organization. The repository collects two Python subprojects: `protein-thermostability-data-tools` (code used in the development of a public protein thermostability dataset) and `active-learning-for-cell-media` (active-learning analysis applied to cell media optimization). MIT-licensed.

### [ESMFold](https://github.com/facebookresearch/esm)

Summary: An end-to-end single-sequence protein structure predictor built on the ESM-2 protein language model — it predicts structure directly from one sequence with no multiple-sequence alignment, avoiding the alignment search that MSA-dependent predictors require. For cellular agriculture, useful for quickly validating the fold of engineered growth-factor analogs and other recombinant media proteins. (The `facebookresearch/esm` repository also hosts the ESM-2 / ESM-1b protein language models.)

### [ColabFold](https://github.com/sokrypton/ColabFold)

Summary: A fast, accessible implementation of AlphaFold2 (and related models) with GPU-accelerated MSA generation via MMseqs2, runnable in Google Colab or locally. Lowers the compute barrier for cell-ag teams designing growth factors, binders, and other recombinant media components without a local AlphaFold deployment ([Mirdita et al. 2022](https://doi.org/10.1038/s41592-022-01488-1), *Nature Methods*).

### [OmegaFold](https://github.com/HeliXonProtein/OmegaFold)

Summary: A high-resolution de-novo structure predictor that folds proteins directly from primary sequence using a protein language model, without multiple-sequence alignments — aimed at proteins that lack deep evolutionary alignments. Practical for high-throughput structure validation of engineered cell-ag proteins.

### [RFdiffusion](https://github.com/RosettaCommons/RFdiffusion)

Summary: A diffusion-model framework for de novo protein design — unconditional generation, motif scaffolding, symmetric oligomers, and binder design — from the Baker lab. Applicable to engineering novel growth-factor / receptor-binding domains and protein scaffolds for cultivated-meat work ([Watson et al. 2023](https://doi.org/10.1038/s41586-023-06415-8), *Nature*).

### [ProteinMPNN](https://github.com/dauparas/ProteinMPNN)

Summary: A deep-learning inverse-folding model that designs amino-acid sequences for a given protein backbone — the standard sequence-design step in generative pipelines, typically paired with RFdiffusion and a structure predictor. Useful for optimizing the sequence of recombinant media components (growth factors, binders) for expressibility and stability ([Dauparas et al. 2022](https://doi.org/10.1126/science.add2187), *Science*).

### [EvoDiff](https://github.com/microsoft/evodiff)

Summary: A sequence-space diffusion framework (Microsoft Research) that generates novel, diverse proteins directly from evolutionary-scale sequence data, without requiring structure — complementing structure-based design with sequence-first generation of functional proteins such as growth factors.

### [Boltz](https://github.com/jwohlwend/boltz)

Summary: An open, commercially-usable (MIT-licensed) family of diffusion-based biomolecular structure prediction models — Boltz-1 was the first fully open-source model to approach AlphaFold3 accuracy, with later versions (Boltz-2) extending the family — predicting structures of proteins and complexes. Useful for assessing the fold and binding interfaces of engineered growth-factor domains.

### [Chai-1](https://github.com/chaidiscovery/chai-lab)

Summary: A multimodal foundation model for biomolecular structure prediction (Chai Discovery) that folds proteins, nucleic acids, and complexes and can optionally incorporate experimental restraints. Valuable for cell-ag protein engineering where binding geometry and complex structure matter as much as the monomer fold.

### [IgFold](https://github.com/Graylab/IgFold)

Summary: A fast, antibody-specific structure predictor (Gray lab, Johns Hopkins) that models antibody Fv structures and CDR loops directly from sequence. Useful for engineering recombinant antibody fragments used as affinity reagents or bio-scaffolds. Note: distributed under a JHU non-commercial license — check terms before commercial cell-ag use ([Ruffolo et al. 2023](https://doi.org/10.1038/s41467-023-38063-x), *Nature Communications*).

### [AbLang](https://github.com/oxpig/AbLang)

Summary: An antibody-specific language model (Oxford Protein Informatics Group) for antibody sequence representation, restoration of missing residues, and design. Enables rapid engineering of antibody-based scaffolds and binding domains for cell-ag affinity-reagent work.

## Bioprocess Modeling & Scaling
This category includes simulation and modeling tools for optimizing the  bioreactor environment.

### [OpenFOAM](https://www.openfoam.com/)

Summary: An open-source suite for Computational Fluid Dynamics (CFD) Used to model and a variety of environmental factors within bioreactors, to ensure viable conditions at scale.

### [CompuCell3D](https://github.com/CompuCell3D/CompuCell3D)

Summary: A modeling environment for simulating cell-cell and cell-environment interactions. Enables the modeling of complex phenomena like cell proliferation, nutrient gradients within thick tissues, and the mechanics of cells interacting with scaffolds.

### [PhysiCell](https://github.com/MathCancer/PhysiCell/)

Summary: A physics-based framework specialized for multi-cell simulations. Can be used to model complex cell behaviors, including differentiation and nutrient limitations in tissue cultures.

## Metabolic Modeling & Strain Design

This section catalogs the open-source tooling for constraint-based and kinetic metabolic modeling — the computational stack used to build genome-scale metabolic models (GEMs), simulate flux distributions, design strain knockouts, and reason about cell physiology. These tools are the foundation for media-formulation optimization, bioprocess scale-up, and cell-line metabolic engineering in cellular agriculture. For cell-ag-specific GEMs (BtaSBML2986, iES1300, etc.), see the per-species pages in the [`Datasets/`](./Datasets/) directory. For canonical model repositories (BiGG Models, BioModels) and pathway / metabolome databases, see [Databases.md / Pathways, Metabolism & Metabolic Models](./Databases.md#pathways-metabolism--metabolic-models).

### [COBRApy](https://github.com/opencobra/cobrapy)

Summary: The de-facto Python package for constraint-based modeling of metabolic networks, hosted by the openCOBRA consortium. Provides FBA, FVA, gene and reaction knockouts, flux sampling (OptGP, ACHR), gap-filling, production envelopes, dynamic FBA, and SBML I/O on a unified `Model` object that integrates cleanly with NumPy / pandas / SymPy. The reference implementation for FBA in the bioinformatics community ([Ebrahim et al. 2013](https://doi.org/10.1186/1752-0509-7-74), *BMC Systems Biology*).

Docs: <http://opencobra.github.io/cobrapy/>.

### [COBRA Toolbox](https://github.com/opencobra/cobratoolbox)

Summary: The MATLAB counterpart to COBRApy, also under the openCOBRA umbrella. Older but more feature-rich for advanced methods (thermodynamics-aware FBA via multiTFA, ME-models via COBRAme, elementary flux modes), and still the production tool of choice in many academic labs. For new cell-ag work, COBRApy is usually the better starting point unless a specific COBRA Toolbox feature is required. The current protocol is [Heirendt et al. 2019](https://doi.org/10.1038/s41596-018-0098-2) (*Nature Protocols*).

Docs: <https://opencobra.github.io/cobratoolbox>.

### [Memote](https://github.com/opencobra/memote)

Summary: The genome-scale metabolic model test suite, providing automated QC and benchmarking for SBML GEMs. Computes >100 metrics covering annotation completeness, stoichiometric consistency, biomass formulation, growth simulation, and reproducibility, producing a versioned HTML report. Used by BiGG Models and the openCOBRA community as the de-facto curation standard; any cell-ag-specific GEM should be benchmarked with Memote before downstream use.

Docs: <https://memote.readthedocs.io/>.

### [Escher](https://github.com/zakandrewking/escher)

Summary: A web-based tool for building, sharing, and embedding visualizations of metabolic pathway maps, with bi-directional integration to COBRApy via JSON. Supports interactive overlay of flux distributions, reaction knockouts, and metabolite concentrations on hand-drawn or auto-generated pathway maps ([King et al. 2015](https://doi.org/10.1371/journal.pcbi.1004321), *PLOS Computational Biology*).

Project page: <https://escher.github.io>.

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

### [moped](https://gitlab.com/qtb-hhu/moped)

Summary: A Python package (QTB lab, HHU Düsseldorf) serving as an integrative hub for reproducible, scriptable construction, modification, curation, and analysis of metabolic models — importing existing SBML models, supporting metabolic network expansion, and converting directly to COBRApy objects for constraint-based analysis ([Saadat et al. 2022](https://doi.org/10.3390/metabo12040275), *Metabolites*). A lighter-weight on-ramp for building and editing cell-ag GEMs alongside the openCOBRA stack above.

### [mergem](https://lobolab.umbc.edu/mergem/)

Summary: A Python package and command-line tool (Lobo lab, UMBC) for merging, comparing, and translating genome-scale metabolic models via a universal metabolite / reaction identifier mapping, producing curated consensus models; paired with the Fluxer web application for flux visualization. Useful when reconciling draft cell-ag GEMs from different reconstruction pipelines into a single curated model (*NAR Genomics and Bioinformatics*, [`10.1093/nargab/lqae010`](https://doi.org/10.1093/nargab/lqae010)).

**Agent integration.** Code-execution agents (Cursor, Claude Code, Biomni) can invoke any of these tools as Python; for COBRApy specifically, the [`cobrapy` skill from K-Dense-AI's scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/scientific-skills/cobrapy) (see the [K-Dense-AI entry below](#k-dense-ai)) provides curated recipes that make this reliable in agent loops.

## Quantitative Genetics & Multi-Omics Analysis

Open-source toolkits for population-genetics analysis of multi-omics data — molecular QTL mapping, gene-expression genetics, and the computational stack underneath FarmGTEx-style multi-tissue functional-genomics atlases. For livestock-species applications, see the corresponding atlases in [Databases.md / Livestock Multi-Tissue Atlases & Functional Genomics](./Databases.md#livestock-multi-tissue-atlases--functional-genomics) and the foundational papers in [Papers.md / Livestock Functional Genomics Reference Work](./Papers.md#livestock-functional-genomics-reference-work).

### [OmiGA](https://omiga.bio/)

Summary: An ultra-efficient toolkit for molecular quantitative trait loci (molQTL) mapping across multi-omics data, from the Zhang group at China Agricultural University. The performance backbone of the FarmGTEx project family — eQTL, sQTL, mQTL, and other molQTL discovery at livestock-atlas scale, optimized for the throughput needed to handle the FarmGTEx tissue / sample matrices. Companion to [Papers.md ref #143](./Papers.md#143) (Teng et al. 2026, *Nature Communications*). **Reproducibility deposits**: ENA BioProject [`PRJEB58031`](https://www.ebi.ac.uk/ena/browser/view/PRJEB58031), Zenodo [`10.5281/zenodo.10072081`](https://doi.org/10.5281/zenodo.10072081) and [`10.5281/zenodo.18280923`](https://doi.org/10.5281/zenodo.18280923).

### [OmicVerse](https://github.com/omicverse/omicverse)

Summary: A Python framework integrating bulk, single-cell, and spatial RNA-seq analysis — including trajectory and bulk-to-single-cell interpolation (BulkTrajBlend) and multi-omics integration — in one toolkit. Useful for analysing cultivated cell-line transcriptomic data across bulk and single-cell modalities ([Zeng et al. 2024](https://doi.org/10.1038/s41467-024-50194-3), *Nature Communications*).

### [CellRank](https://github.com/scverse/cellrank)

Summary: A Python framework (scverse / Theis lab) for single-cell fate mapping that combines trajectory inference with signals such as RNA velocity to model cell-state transitions and terminal states. Informs understanding of cultivated-cell differentiation dynamics under perturbation or media change.

### [CellChat](https://github.com/jinworks/CellChat)

Summary: An R toolkit for inferring and analysing intercellular communication networks from single-cell and spatial transcriptomics, using a curated ligand–receptor interaction database. Applicable to cell-culture and scaffold / co-culture analysis where cell–cell signalling shapes differentiation ([Jin et al. 2021](https://doi.org/10.1038/s41467-021-21246-9), *Nature Communications*).

### [Giotto Suite](https://github.com/giotto-suite/Giotto)

Summary: An R package suite (Dries lab) for end-to-end spatial-transcriptomics and spatial multi-omics analysis at multiple scales and resolutions, including 2D/3D spatial analysis and cell–cell interaction analysis. Supports analysis of cultivated-tissue structure and microarchitecture.

## Mass Spectrometry & Chemometrics

Tooling for mass-spectrometry-based proteomics and metabolomics workflows, plus multivariate statistical analysis ("chemometrics") of the resulting data. Used heavily in flavor / off-flavor metabolomics, spent-media analysis for cultivated meat, and sensory-instrumental data fusion. See also the [`pyopenms` skill](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/scientific-skills/pyopenms) in [K-Dense-AI](#k-dense-ai) for an agent-callable wrapper around OpenMS.

### [OpenMS / pyOpenMS](https://github.com/OpenMS/OpenMS)

An open-source C++ framework with Python bindings (pyOpenMS) for mass-spectrometry data analysis, from raw spectra processing through quantitative proteomics and metabolomics. Maintained by an international consortium led by the Kohlbacher lab (Tübingen); OpenMS 3 (Pfeuffer et al. 2024, *Nat Methods*) provides a modular toolkit (TOPP), Python bindings, KNIME nodes, Galaxy wrappers, and integrations with nf-core pipelines (e.g. nf-core/quantms). Widely used for flavor metabolomics, off-flavor characterization, and as a building block in larger workflow-manager pipelines.

Project page: <https://openms.de/>. pyOpenMS docs: <https://pyopenms.readthedocs.io/>.

### [MZmine 3](https://mzmine.github.io/)

A modular, open-source platform for LC-MS / GC-MS / IMS-MS data processing, maintained by the Pluskal lab (University of Münster) and the international MZmine consortium. [Schmid et al. 2023](https://doi.org/10.1038/s41587-023-01690-2) (*Nat Biotech*) describes the v3 release with multimodal MS support (LC-MS, IMS-MS, MS-imaging). Provides feature detection, alignment, gap-filling, MS/MS networking integrations (GNPS / FBMN, SIRIUS), and a CLI for batch processing. Standard preprocessor for flavor and natural-products metabolomics workflows.

Source: <https://github.com/mzmine/mzmine>. News and releases from [mzio](https://mzio.io/), the team behind MZmine: <https://mzio.io/mzmine-news/>.

### [MS-DIAL](http://prime.psc.riken.jp/compms/msdial/main.html)

A standalone Windows tool for DIA / DDA MS/MS spectral deconvolution and metabolite / lipid annotation, developed by Tsugawa et al. at RIKEN ([Tsugawa et al. 2015](https://doi.org/10.1038/nmeth.3393), *Nat Methods*; the [2020 *Nat Biotech* lipidomics atlas paper](https://doi.org/10.1038/s41587-020-0531-2) extended MS-DIAL 4 to lipid identification). The de-facto standard for GC-MS deconvolution in flavor and food chemistry labs; ships with extensive built-in spectral libraries.

Source: <https://github.com/systemsomicslab/MsdialWorkbench>.

### [MRMPROBS](https://systemsomicslab.github.io/compms/mrmprobs/main.html)

A C# tool for widely targeted metabolomics that processes multiple reaction monitoring (MRM) / selected reaction monitoring (SRM) data — plus SCAN and DIA MS/MS — developed by Tsugawa et al. (2013, *Analytical Chemistry*), same first author as the MS-DIAL entry above. Evaluates metabolite peaks by posterior probability and provides large-scale visualisation, data curation, and statistical analysis of widely-targeted metabolomics datasets — the targeted-quantitation complement to MS-DIAL's discovery-focused deconvolution.

Distributed via Zenodo: <https://zenodo.org/records/11219831/latest>.

### [XCMS](https://github.com/sneumann/xcms)

The most-cited R / Bioconductor package for LC-MS / GC-MS metabolomics preprocessing, originally [Smith et al. 2006](https://doi.org/10.1021/ac051437y) (*Anal Chem*) and continuously maintained since. Provides nonlinear retention-time alignment, peak picking, grouping, and gap-filling — the analytical workhorse of many academic metabolomics pipelines including the Galaxy-based Workflow4Metabolomics platform.

Bioconductor: <https://bioconductor.org/packages/xcms/>.

### [ProteoWizard / msconvert](https://proteowizard.sourceforge.io/)

A cross-platform C++ library and command-line toolkit for mass-spectrometry data conversion and analysis, maintained by the Mallick lab at Stanford and an international community ([Chambers et al. 2012](https://doi.org/10.1038/nbt.2377), *Nat Biotech*). The `msconvert` utility is the universal first step in essentially every open MS pipeline — converting vendor-locked binary formats (.RAW, .D, .lcd, .wiff) to open standards (mzML, mzXML, MGF) so downstream tools can ingest the data.

Source: <https://github.com/ProteoWizard/pwiz>.

### [SIRIUS + CSI:FingerID](https://bio.informatik.uni-jena.de/software/sirius/)

Java application for in-silico molecular formula determination and structure annotation from MS/MS spectra, maintained by the Böcker lab (University of Jena). SIRIUS 4 ([Dührkop et al. 2019](https://doi.org/10.1038/s41592-019-0344-8), *Nat Methods*) integrates fragmentation-tree-based formula prediction, CSI:FingerID for structure database search, CANOPUS for compound-class prediction, and COSMIC for confidence scoring. Standard tool for de-novo annotation in untargeted metabolomics and natural-products work.

Source: <https://github.com/boecker-lab/sirius>.

### [MetFrag](https://ipb-halle.github.io/MetFrag/)

In-silico fragmenter for MS/MS-based compound identification, originally Wolf et al. 2010 (*BMC Bioinformatics*) and substantially revised in MetFrag Relaunched ([Ruttkies et al. 2016](https://doi.org/10.1186/s13321-016-0115-9), *J Cheminform*). Scores candidate structures from compound databases (PubChem, ChemSpider, KEGG) against measured fragmentation spectra. Integrated into many metabolomics workflows including nf-core/metaboigniter and Workflow4Metabolomics.

Source: <https://github.com/c-ruttkies/MetFragRelaunched>.

### [MS2Query](https://github.com/iomega/ms2query)

A machine-learning-based mass-spectral analogue search tool from the iomega consortium ([de Jonge et al. 2023](https://doi.org/10.1038/s41467-023-37446-4), *Nat Comms*). Uses Spec2Vec and MS2DeepScore embeddings to find spectral analogues in reference libraries, including for compounds without exact matches — directly addressing the long-tail "unknown unknowns" problem in flavor and natural-products metabolomics.

### [MS-FINDER](https://systemsomicslab.github.io/compms/msfinder/main.html)

A standalone tool for in-silico compound identification from MS/MS spectra, developed by Tsugawa et al. at RIKEN as a companion to MS-DIAL. Combines isotope pattern matching, formula prediction, in-silico fragmentation, and database search against curated reference libraries (HMDB, FooDB, ChEBI, PubChem, KEGG) to score candidate structures. Widely used in untargeted flavor metabolomics for annotating unknown compounds from GC-MS / LC-MS spectra.

### [GNPS](https://gnps.ucsd.edu/)

The Global Natural Products Social Molecular Networking platform — a web-based MS/MS analysis platform from the Dorrestein lab at UCSD (Wang et al. 2016, *Nat Biotech*). Provides community-curated reference spectral libraries, Feature-Based Molecular Networking (FBMN), Ion Identity Molecular Networking (IIMN), and analog search via spectral similarity. Standard tool for compound annotation, dereplication, and pattern discovery in flavor and natural-products metabolomics workflows.

*Also listed as a spectral-library reference in [Databases.md / Mass Spectrometry Spectral Databases](./Databases.md#mass-spectrometry-spectral-databases) — dual-listed because the community-curated reference libraries are themselves a queryable database.*

### [ropls](http://bioconductor.org/packages/ropls/)

An R package on Bioconductor implementing PCA, PLS, OPLS, and OPLS-DA for chemometric analysis of metabolomics and other -omics data (Thévenot et al. 2015, *J Proteome Res*). Provides the multivariate engine in the Workflow4Metabolomics Galaxy platform and is widely used in flavor / sensory metabolomics for sensory-instrumental correlation, biomarker discovery, and quality-control modeling. See also [`ropls` in the K-Dense-AI scientific-agent-skills collection](https://github.com/K-Dense-AI/scientific-agent-skills) for an agent-callable wrapper.

### [MetaboAnalyst](https://www.metaboanalyst.ca/)

A comprehensive web-based and R-based platform for statistical, functional, and visual analysis of metabolomics data, maintained by the Xia lab at McGill in collaboration with the Wishart lab (current v6, Pang et al. 2024, *Nucleic Acids Research*). Provides modules for univariate / multivariate statistics, pathway enrichment, network analysis, biomarker discovery, time-series and dose-response analysis, plus a companion R package `MetaboAnalystR` for scripted workflows. The most-cited tool in food metabolomics applications; widely used for sensory-instrumental data analysis in flavor and off-flavor work.

### [mixOmics](https://mixomics.org/)

An R / Bioconductor package for the integration and exploration of single- and multi-omics datasets, maintained by the Le Cao group (University of Melbourne) (Rohart et al. 2017, *PLOS Computational Biology*). Implements PCA, PLS, sparse PLS-DA, and the **DIABLO** method for multi-block supervised classification across heterogeneous data blocks. The methodological standard for fusing sensory panel scores, instrumental volatilome / non-volatilome data, and microbiome / -omics layers — directly applicable to multi-omics flavor and cell-ag quality-prediction work.

### [SensoMineR](https://cran.r-project.org/web/packages/SensoMineR/index.html)

A food-specific R package for the analysis of sensory data, maintained by the Le and Husson group at Agrocampus Ouest (Lê & Husson 2008, *J Sensory Studies*). Implements QDA, napping, sorted napping, projective mapping, preference mapping, and panel performance diagnostics; built on top of FactoMineR. The de-facto open-source tool for descriptive-analysis sensory panel data in academic food science, including alt-protein flavor benchmarking.

## Workflow-Manager Pipelines

Reproducible, container-based workflow-manager pipelines for omics and microbiome analysis — Nextflow / Snakemake / CWL / Galaxy. None of these are sensomics-specific, but each is a directly applicable preprocessing or microbiome layer for cultivated-meat spent-media, fermentation, or flavor-volatilome work. For containerized, reproducible cell-ag analytical pipelines, these are the upstream substrate that any sensomics-aware workflow would be built on.

### [nf-core/metaboigniter](https://nf-co.re/metaboigniter)

A community-curated Nextflow pipeline for untargeted LC-MS metabolomics preprocessing, identification, and analysis within the nf-core consortium. Provides a containerized, parameterizable chain from raw MS data through peak picking (XCMS, CAMERA), alignment, annotation (MetFrag, CSI:FingerID), and statistical analysis. The most directly applicable existing reproducible Nextflow pipeline for flavor and off-flavor metabolomics work in cell-ag contexts.

### [Workflow4Metabolomics (W4M)](https://workflow4metabolomics.usegalaxy.fr/)

A Galaxy-based collaborative research infrastructure for metabolomics, providing a large library of workflow modules for LC-MS, GC-MS, FIA-MS, and NMR preprocessing, identification, and statistical analysis ([Giacomoni et al. 2015](https://doi.org/10.1093/bioinformatics/btu813), *Bioinformatics*). Integrates XCMS, ropls, MetFrag, CAMERA, and many other established tools into a single web-based interface backed by French institutional compute (IFB), accessible without local installation. The closest "one-stop" reproducible food / flavor metabolomics platform; widely used in academic flavor metabolomics work.

### [UmetaFlow](https://github.com/biosustain/snakemake_UmetaFlow)

A Snakemake workflow for untargeted LC-MS/MS metabolomics, maintained by the Biosustain group at DTU (Kontou et al. 2023, *J Cheminform*). Wraps MZmine 3, SIRIUS, GNPS / FBMN, and Ion Identity Molecular Networking (IIMN) into a containerized, parameterizable pipeline that produces feature tables, annotations, and molecular networks from raw MS data. Closest existing Snakemake pipeline that flavor-metabolomics work can build on.

### [nf-core/ampliseq](https://nf-co.re/ampliseq)

A community-curated Nextflow pipeline for amplicon sequencing analysis (16S, 18S, ITS) within the nf-core consortium (Straub et al. 2020). Provides a full preprocessing + ASV-calling + taxonomic-assignment + diversity-analysis chain (Cutadapt → DADA2 → QIIME 2 → Picrust2) suitable for microbiome work in fermented foods, fermentation-based alt-protein, and the microbial communities relevant to cultivated-meat bioreactors. Routinely used for the microbiome arm of multi-omics flavor studies.

### [nf-core/mag](https://nf-co.re/mag)

A community-curated Nextflow pipeline for shotgun metagenomic assembly and binning (Krakau et al. 2022, *NAR Genomics and Bioinformatics*). Produces metagenome-assembled genomes (MAGs) with quality control, taxonomic classification, and functional annotation — the analytical complement to ampliseq for higher-resolution microbial-community profiling. Relevant to cultivated-meat work involving complex bioreactor microbiomes, scaffold biofilms, or fermentation co-culture analysis.

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

### [BRAD](https://github.com/Jpickard1/BRAD)

Summary: A bioinformatics-focused LLM agent (Bioinformatics Retrieval Augmented Digital Assistant) combining retrieval-augmented generation with bioinformatics tool orchestration. Targets automatic biomarker discovery, enrichment analysis, and general bioinformatics automation — patterns that map cleanly onto cell-ag tasks like cell-type marker discovery and pathway-enrichment analysis on cultivated-tissue scRNA-seq. Companion to [Papers.md ref #94](./Papers.md#94) (Pickard et al. 2025, *Bioinformatics*).

### [CellForge](https://github.com/gersteinlab/CellForge)

Summary: An agentic system for the design of virtual cell models from the [Gerstein lab](http://www.gersteinlab.org/) at Yale. Coordinates multiple LLM agents to plan, configure, and execute cell-modeling workflows — directly relevant to cell-ag for cell-type-specific virtual-cell pipelines that media-optimization, perturbation-response prediction, and bioprocess workflows can build on. Companion to [Papers.md ref #93](./Papers.md#93) (Tang et al. 2026).

### [AI Scientist](https://github.com/SakanaAI/AI-Scientist)

Summary: Sakana AI's framework for fully automated open-ended scientific discovery via large language models, performing end-to-end idea generation, experimentation, and paper drafting. Version 2 ([SakanaAI/AI-Scientist-v2](https://github.com/SakanaAI/AI-Scientist-v2)) extends the system to workshop-level automated discovery via agentic tree search; the [AI-Scientist-ICLR2025-Workshop-Experiment](https://github.com/SakanaAI/AI-Scientist-ICLR2025-Workshop-Experiment) repository archives the run whose AI-generated paper passed peer review at an ICLR 2025 workshop. Companion to Lu et al. 2024 ([Papers.md ref #45](./Papers.md#45)) and Yamada et al. 2025 ([Papers.md ref #47](./Papers.md#47)).

Project home: <https://sakana.ai/>.

### [PaperQA](https://github.com/Future-House/paper-qa)

Summary: An open-source retrieval-augmented generative agent for answering questions over scientific literature with verified citations, from the [FutureHouse](https://www.futurehouse.org/) research lab. Released as PaperQA in 2023 and substantially extended in PaperQA2 (2024), which achieves superhuman synthesis accuracy on literature questions. Companion to [Papers.md ref #44](./Papers.md#44) (PaperQA, Lála et al. 2023) and [ref #46](./Papers.md#46) (PaperQA2, Skarlinski et al. 2024).

FutureHouse cookbook (docs): <https://futurehouse.gitbook.io/futurehouse-cookbook>. Commercial spinout — Edison Scientific: <https://edisonscientific.com/> ([docs](https://docs.edisonscientific.com)).

### [Aviary](https://github.com/Future-House/aviary)

Summary: A gymnasium of language-agent environments for challenging scientific tasks, from the [FutureHouse](https://www.futurehouse.org/) lab. Agents are framed as Language Decision Processes (LDP) and trained and evaluated against tasks spanning molecular cloning, scientific-literature QA, and protein stability — providing the reusable training-and-evaluation substrate beneath FutureHouse's task-specific agents. Companion to [Papers.md ref #160](./Papers.md#160) (Narayanan et al. 2024). Apache-2.0; built on the [LDP framework](https://docs.edisonscientific.com/ldp-language-decision-processes), with Aviary docs at <https://docs.edisonscientific.com/aviary>.

### [Finch](https://github.com/Future-House/finch)

Summary: An Aviary-based data-science agent that operates inside Jupyter notebooks, also from [FutureHouse](https://www.futurehouse.org/). It plans and executes notebook-based analyses, pairing the [Aviary](#aviary) environment with the kind of exploratory bioinformatics work — single-cell exploration, media-response analysis — that cell-ag teams increasingly delegate to notebook agents. Apache-2.0; no companion paper at time of curation.

### [K-Dense-AI](https://github.com/K-Dense-AI)

K-Dense-AI is an AI co-scientist ecosystem combining a commercial agent platform ([K-Dense Web](https://k-dense.ai), which autonomously executes complex science / engineering / healthcare / finance tasks end-to-end) with a substantial open-source stack of agent infrastructure:

- **[scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills)** — A multi-domain collection of 120+ "Agent Skills" wrapping scientific Python libraries and platforms in Claude Code / Cursor / Antigravity-compatible format. Each skill provides curated recipes, code examples, and discovery prompts for one library. Cell-ag-relevant skills include `cobrapy` (FBA / metabolic modeling — see [Metabolic Modeling & Strain Design](#metabolic-modeling--strain-design)), `pyopenms` (mass spectrometry), `scanpy` / `scvi-tools` / `anndata` (single-cell analysis), `rdkit` / `datamol` / `medchem` (cheminformatics), `biopython` / `bioservices` / `gget` (bioinformatics utilities), `cellxgene-census`, `pyzotero`, and many others.
- **[k-dense-byok](https://github.com/K-Dense-AI/k-dense-byok)** — A bring-your-own-key desktop client that runs the Scientific Agent Skills locally with your own LLM API keys.
- **[mimeo](https://github.com/K-Dense-AI/mimeo)** — A tool for "mimeographing" an expert's knowledge into a `SKILL.md` / `AGENTS.md` file consumable by Claude Code or similar agents.
- **[mimeographs](https://github.com/K-Dense-AI/mimeographs)** — A collection of persona-based agent skills (founders, philosophers, scientists) generated with mimeo.
- **[claude-scientific-writer](https://github.com/K-Dense-AI/claude-scientific-writer)** — A Claude-Code-compatible general-purpose scientific writing agent.
- **[science-superpowers](https://github.com/K-Dense-AI/science-superpowers)** — A composable computational-science methodology for research agents: 15 auto-triggering skills — 13 covering the research lifecycle (framing falsifiable questions, surveying prior work, designing and **pre-registering** the analysis, reproducible execution, anomaly root-causing, results verification, red-team review, and reporting/archiving) plus two meta skills for authoring and onboarding new skills. A science-domain reimplementation of [obra/superpowers](#superpowers) whose central discipline is pre-registration rather than test-driven development; runs with only the agent harness and a POSIX shell (zero third-party dependencies). MIT-licensed.

Not an MCP server but a documentation-and-prompt-context layer that pairs well with code-execution agents like Biomni, Cursor, and Claude Code.

Project page: <https://k-dense.ai>.

### [Superpowers](https://github.com/obra/superpowers)

Summary: An agentic skills framework and software-development methodology authored by Jesse "obra" Vincent (`obra/superpowers`) — one of the most-starred Claude Code skill collections. Provides domain-agnostic skills for planning, debugging, code review, and execution that compose cleanly with cell-ag-specific skill packs (e.g. [K-Dense-AI's scientific-agent-skills](#k-dense-ai)) when assembling an agent stack for a cell-ag lab. Shell-based, MIT-licensed. K-Dense-AI's [science-superpowers](#k-dense-ai) is a science-domain reimplementation of this methodology for data analysis, swapping test-driven development for pre-registration.

### [Skill Seekers](https://github.com/yusufkaraaslan/Skill_Seekers)

Summary: A meta-tool that converts documentation websites, GitHub repositories, and PDFs into Claude AI skills with automatic conflict detection. The closest existing automation for the pattern an AI-augmented cell-ag lab needs as it scales: turn a new wet-lab protocol PDF, a new bioinformatics package's docs, or a new GitHub library's README into a Claude Code / Cursor skill that the lab's agents can call directly — without hand-curating each integration. Python, MIT-licensed.

### [AI Research Skills Library](https://github.com/orchestra-research/AI-research-SKILLs)

Summary: An open-source library of AI research and engineering skills covering vLLM, Megatron, GRPO, HuggingFace, and the broader LLM training and serving stack — maintained by [Orchestra Research](https://github.com/orchestra-research). Designed to package skills into Claude Code, Codex, or Gemini agents so they operate as fully-equipped AI research agents. Cell-ag teams building or fine-tuning their own biology foundation models (cf. [TranscriptFormer](#transcriptformer)) or running large-scale agentic workflows can pull from this library for the ML-training and serving infrastructure layer rather than reinventing it. MIT-licensed.

### [Seqera AI / Co-Scientist](https://docs.seqera.io/platform-cloud/seqera-ai/)

Summary: Seqera Cloud's AI assistant for bioinformatics workflows, providing an interactive co-scientist that helps users author and debug Nextflow pipelines, query workflow run data, and interpret results. Accessible through the Seqera CLI and Seqera Platform; no companion paper at time of curation.

### [Dotmatics Luma](https://go.dotmatics.com/luma-lab-orchestration)

A commercial lab-orchestration platform from Dotmatics that connects laboratory instruments, data systems, and AI assistance into a unified "connected digital lab" workflow — covering instrument integration, automated data flow, electronic-lab-notebook integration, and agent-assisted experimental planning. Marketed primarily to biopharma and biotech R&D groups; representative of the commercial-tooling layer that cell-ag startups increasingly evaluate as they scale beyond bench-scale workflows. See also the [Dotmatics Luma webinar](./Talks.md#ai-agents--foundation-models-for-biology) in Talks.md for an overview of the platform.

### [scDataset](https://github.com/scDataset/scDataset)

A PyTorch `IterableDataset` for efficient deep-learning training on single-cell omics too large to fit in memory, streaming directly from on-disk AnnData (and other formats) with no prior conversion step. It combines block sampling with batched fetching to approximate random sampling — recovering the minibatch diversity that uniform training needs while avoiding the throughput collapse of true random disk access; on the 100-million-cell Tahoe-100M it reports more than two orders-of-magnitude speedup over true random sampling while matching its downstream accuracy (D'Ascenzo & Cultrera di Montesano 2025, [arXiv:2506.01883](https://doi.org/10.48550/arXiv.2506.01883)). For cell-ag, it is the data-loading layer beneath single-cell foundation-model training (Geneformer, scGPT, scFoundation and the like) on atlas-scale corpora — including [Tahoe-100M](./Datasets/HumanReference.md) — that increasingly inform cellular-engineering and perturbation models.

### [TranscriptFormer](https://virtualcellmodels.cziscience.com/model/transcriptformer)

A family of generative foundation models for single-cell transcriptomics from the Chan Zuckerberg Initiative, trained on up to 112 million cells spanning 1.53 billion years of evolution across 12 species (Pearce et al. 2026, *Science*; see [Papers.md ref #92](./Papers.md#92)). Provides state-of-the-art performance on cell-type classification and supports cross-species reasoning over transcriptomic data — directly relevant to cell-ag for translating biological knowledge between bovine, porcine, chicken, salmonid, and other livestock cells where annotated reference data is sparse (see the per-species pages in [`Datasets/`](./Datasets/) for the cell-ag-relevant data substrate). Distributed via CZI's Virtual Cells Platform with versioned releases.

Quickstart docs: <https://virtualcellmodels.cziscience.com/quickstart/transcriptformer-quickstart>. Announcement: <https://chanzuckerberg.com/blog/transcriptformer-model-overview/>.

### [Geneformer](https://huggingface.co/ctheodoris/Geneformer)

A transformer-based foundation model for transfer learning in network biology from the Theodoris lab (Broad Institute / Gladstone), pretrained on ~30 million human single-cell transcriptomes via rank-encoded masked language modeling. Distributed exclusively through Hugging Face with tokenizer, pretrained weights, and example fine-tuning recipes for cell-type classification, gene-network inference, and *in silico* perturbation prediction; widely used as a single-cell-FM baseline. Companion to [Papers.md ref #111](./Papers.md#111) (Theodoris et al. 2023, *Nature*); pretraining corpus: [Genecorpus-30M in Datasets/HumanReference.md](./Datasets/HumanReference.md#genecorpus-30m).

### [scGPT](https://github.com/bowang-lab/scGPT)

A generative pretrained transformer for single-cell multi-omics from the Wang lab at the University Health Network (Toronto), trained on >33M cells spanning scRNA-seq, scATAC-seq, and CITE-seq. Provides downstream fine-tuning recipes for cell-type annotation, multi-batch integration, gene-regulatory-network inference, and perturbation prediction; one of the most-used baselines for newer single-cell foundation models. Companion to [Papers.md ref #117](./Papers.md#117) (Cui et al. 2024, *Nature Methods*). Documentation: <https://scgpt.readthedocs.io/>.

### [scBERT](https://github.com/TencentAILabHealthcare/scBERT)

An early single-cell BERT-style foundation model for cell-type annotation from Tencent AI Lab Healthcare, treating individual genes as tokens with binned expression values. Released alongside [Papers.md ref #112](./Papers.md#112) (Yang et al. 2022, *Nature Machine Intelligence*); the independent re-evaluation in [ref #113](./Papers.md#113) (Boiarsky et al. 2024) and author reply in [ref #114](./Papers.md#114) (Yang et al. 2024) are core methodological reading for anyone benchmarking new single-cell FMs against existing baselines.

### [scFoundation](https://github.com/biomap-research/scFoundation)

A large-scale foundation model on single-cell transcriptomics from BioMap Research, pretrained on ~50M cells with read-depth-aware encoding that explicitly handles the variable sequencing depths characteristic of public scRNA-seq corpora. Provides downstream applications spanning cell-type annotation, drug-response prediction, and perturbation-effect modeling. Companion to [Papers.md ref #116](./Papers.md#116) (Hao et al. 2024, *Nature Methods*).

### [UCE](https://github.com/snap-stanford/UCE)

Universal Cell Embeddings from Stanford's [SNAP lab](https://snap.stanford.edu/) (Leskovec group) — a single-cell foundation model that represents each cell as an unordered set of expressed genes and each gene by its protein-language-model embedding, enabling zero-shot generalization to species and tissues never seen at training time. Releases include pretrained weights and zero-shot inference scripts for novel cell-type discovery across species. Companion to [Papers.md ref #119](./Papers.md#119) (Rosen et al. 2026, bioRxiv; *Nature*, in press at time of curation). The same lab's earlier [SATURN](https://github.com/snap-stanford/SATURN) method ([ref #118](./Papers.md#118), Rosen et al. 2024, *Nature Methods*) introduced the protein-LM-gene-embedding pattern that UCE generalizes — directly relevant to cell-ag where annotated livestock-species single-cell data is sparse and cross-species transfer is essential.

### [tGPT](https://github.com/deeplearningplus/tGPT)

A generative pretraining model for single-cell deciphering, applying GPT-style autoregressive next-token prediction over gene-expression vocabularies. Smaller and earlier than scGPT or Geneformer, but methodologically important as one of the first demonstrations that next-token-prediction objectives (vs. masked-language-modeling) work for single-cell biology — the lineage that now includes Arc's [State](#state--cell-eval) and [Cell2Sentence](#cell2sentence-c2s-scale). Companion to [Papers.md ref #115](./Papers.md#115) (Shen et al. 2023, *iScience*).

### [Cell2Sentence (C2S-Scale)](https://github.com/vandijklab/cell2sentence)

A framework for treating single-cell expression profiles as natural-language sentences — ordered lists of expressed gene symbols ranked by expression — enabling direct reuse of pretrained LLM architectures (and, in C2S-Scale, billion-parameter scaling) for single-cell biology. From the [van Dijk lab](https://www.vandijklab.org/) at Yale. Companion to [Papers.md ref #120](./Papers.md#120) (Rizvi et al. 2026, bioRxiv). C2S-Scale project page: <https://www.vandijklab.org/c2s-scale>.

### [GEARS](https://github.com/snap-stanford/GEARS)

Graph-Enhanced gene-Activation Response Simulator — a graph neural network for predicting transcriptional outcomes of novel multi-gene CRISPR perturbations, including combinations never observed during training. From Stanford's SNAP lab (Leskovec group). Generalizes single-gene perturbation training data to combinatorial perturbation prediction via co-essentiality and gene-ontology graph priors. Companion to [Papers.md ref #121](./Papers.md#121) (Roohani et al. 2024, *Nature Biotechnology*).

### [State + Cell-Eval](https://github.com/ArcInstitute/state)

Arc Institute's first-generation virtual cell model and companion evaluation framework, designed to predict stem-cell, cancer-cell, and immune-cell responses to drugs, cytokines, and genetic perturbations. Trained on ~170M observational and ~100M perturbational single-cell measurements across 70+ cell lines; uses a bidirectional transformer architecture with self-attention over cell sets and reportedly is the first model to consistently beat simple linear baselines on perturbation-response prediction. Released alongside [`cell-eval`](https://github.com/ArcInstitute/cell-eval), the standardized evaluation framework for virtual-cell models. Companion to [Papers.md ref #57](./Papers.md#57) (Adduri et al. 2025, bioRxiv); see also the [Arc Institute news article on State](./AIAgentsFoundationModels.md) on the AI Agents & Foundation Models page. The follow-on **Stack** model — companion to [Papers.md ref #124](./Papers.md#124) (Dong et al. 2026) — extends State with in-context learning, simulating cellular conditions via prompt engineering without further fine-tuning.

### [BioDiscoveryAgent](https://github.com/snap-stanford/BioDiscoveryAgent)

An LLM-based AI agent from Stanford's SNAP lab for designing genetic-perturbation experiments — including CRISPR-Cas9 single-gene and combinatorial knockouts — by reasoning over gene-function literature, prior screens, and experimental constraints. Demonstrates that an LLM agent with tool use can match or exceed specialized active-learning methods on hit-rate-driven experimental-design tasks. Companion to [Papers.md ref #125](./Papers.md#125) (Roohani et al. 2025, arXiv). Directly applicable to cell-ag as an off-the-shelf experimental-design layer for cell-line-engineering campaigns (selecting which TFs to overexpress for myogenic vs. adipogenic differentiation, or which media-pathway genes to knock down to test rate-limiting steps).

### [CausalBench](https://github.com/causalbench/causalbench)

A large-scale benchmark for evaluating network-inference methods from single-cell perturbation data — including Perturb-seq, CROP-seq, and ECCITE-seq. Built around interventional ground truth from genome-scale CRISPR screens, providing standardized metrics, baselines, and dataset splits for ML methods that infer gene-regulatory networks. Companion to [Papers.md ref #127](./Papers.md#127) (Chevalley et al. 2025, *Communications Biology*).

### [BioContextAI](https://biocontext.ai)

Summary: A community hub for agentic biomedical systems — a registry of biomedical Model Context Protocol (MCP) servers plus a knowledgebase MCP server that exposes curated biomedical resources to LLM agents. Lets cell-ag teams plug standardized biomedical tools and data sources into agent stacks (Claude Code, Cursor, Biomni) without bespoke per-resource integration. Companion to [Papers.md ref #133](./Papers.md#133) (Kuehl et al. 2025, *Nature Biotechnology*). GitHub org: <https://github.com/biocontext-ai>.

### [BioMCP](https://github.com/genomoncology/biomcp)

Summary: A one-binary MCP server from GenomOncology unifying many biomedical knowledge sources — PubTator3, Europe PMC, ClinicalTrials.gov, MyVariant.info, cBioPortal, Reactome, Open Targets, MyDisease.info, MONDO, Monarch, DisGeNET — behind a single Model Context Protocol surface for LLM agents. MIT-licensed; the leanest existing MCP-native bridge between general biomedical literature, clinical-trial, and variant data and an agent stack. Sister project to [BioContextAI](#biocontextai), which catalogues biomedical MCP servers including BioMCP.

### [Context7](https://github.com/upstash/context7)

Summary: An open-source MCP server (and hosted service) from Upstash that injects up-to-date, version-specific library documentation and code examples into LLM prompts, so AI coding agents work from current API docs instead of stale training data. Unlike the biomedical MCP servers above, Context7 is general developer infrastructure — not cell-ag-specific — but it is directly relevant to CAAIL's AI-agent audience: the coding agents that build and maintain cell-ag pipelines, parsers, and analysis tooling depend on accurate, current documentation for the bioinformatics and ML libraries they call. MIT-licensed; hosted at <https://context7.com>.

## Data Standards & Interchange Formats

Open standards and schema languages for representing biological models, data, and processes in machine-readable form. None are AI methods themselves, but each is the substrate that AI-powered extraction, reasoning, and modeling tools depend on — standardized inputs are what make automated cross-study analysis and agentic workflows tractable for cellular agriculture.

### [SBML (Systems Biology Markup Language)](https://sbml.org/)

Summary: The de-facto XML-based standard for representing computational models of biological processes — metabolic networks, signaling pathways, gene-regulatory networks, and kinetic models. SBML is the interchange format for every genome-scale metabolic model catalogued in the per-species pages of the [`Datasets/`](./Datasets/) directory and the lingua franca of the constraint-based and kinetic modeling tools in [Metabolic Modeling & Strain Design](#metabolic-modeling--strain-design). Maintained by the SBML community with libSBML bindings across all major languages.

### [LinkML (Linked data Modeling Language)](https://linkml.io/)

Summary: A schema language for authoring, validating, and transforming structured data models, with first-class support for ontology terms, code generation across languages, and export to JSON-Schema / SHACL / OWL. Increasingly used to define machine-readable metadata schemas for biological datasets and knowledge graphs — the structured backbone that agentic AI systems need in order to reason reliably over cell-ag data resources.

### [Project PISCES (Standard Flowsheet Format)](https://projectpisces.org/)

Summary: Project PISCES (Process Integration & Synthesis using Chemical Engineering Standards) standardizes process flowsheet data into a machine-readable Standard Flowsheet Format (SFF) for AI-powered knowledge extraction and analysis. For cellular agriculture, a standardized flowsheet format is the missing substrate for AI-assisted bioprocess design, scale-up modeling, and techno-economic analysis — letting agents reason over cultivated-meat process designs the way they reason over SBML metabolic models. SFF documentation: <https://projectpisces.org/?page=sff-docs>.

Process-flowsheet background (what SFF standardizes) — for readers approaching this from the AI / biology side, the [LibreTexts *Foundations of Chemical and Biological Engineering* chapter on chemical processes and process diagrams](https://eng.libretexts.org/Bookshelves/Chemical_Engineering/Foundations_of_Chemical_and_Biological_Engineering_I_(Verret_Qiao_Barghout)/01%3A_Introduction_to_Chemical_Processes_and_Process_Diagrams) and the [ScienceDirect "Flowsheet" topic overview](https://www.sciencedirect.com/topics/chemical-engineering/flowsheet) introduce the flowsheet concept and its notation.

Cell-ag application context — [The Unjournal](https://www.unjournal.org/)'s cultivated-meat cost-modeling work, namely the [`unjournal/cm_pq_modeling` repository](https://github.com/unjournal/cm_pq_modeling) and its [techno-economic comparison of cultured-chicken cost models](https://unjournal.github.io/cm_pq_modeling/compare.html), is exactly the kind of bioprocess techno-economic analysis that a standardized flowsheet format like SFF is designed to make reproducible and machine-comparable.

## Biomedical Ontology & Identifier Infrastructure

Tooling for managing biomedical identifiers, ontologies, synonyms, and cross-references — the substrate that AI agents need to reason reliably across the disconnected biomedical resources catalogued throughout CAAIL. The cluster below is the **Biopragmatics Stack**, a unified ecosystem of tools by Charles Tapley Hoyt and collaborators.

### [Biopragmatics Stack](https://biopragmatics.github.io/)

Summary: An interlocking stack of MIT-licensed Python tools and registries supporting biomedical semantics and pragmatics. Each component is independently usable, and together they cover the full lifecycle of biomedical-entity identification, normalization, and cross-linking. Directly relevant to cell-ag agentic workflows that need to reason consistently across the livestock-genomics, metabolic-modeling, sensomics, and chemistry resources elsewhere in CAAIL.

GitHub org: <https://github.com/biopragmatics>. Core components:

- **[Bioregistry](https://bioregistry.io/)** — A registry of biomedical identifier registries, with prefix normalization, identifier resolution, and a REST API. The meta-resource the rest of the stack builds on.
- **[pyobo](https://github.com/biopragmatics/pyobo)** — Python library for using ontologies, terminologies, and biomedical nomenclatures.
- **[bioontologies](https://github.com/biopragmatics/bioontologies)** — Unified access across biomedical ontologies.
- **[biolookup](https://github.com/biopragmatics/biolookup)** — Service for retrieving metadata and ontological information for biomedical entities.
- **[Biolexica](https://github.com/biopragmatics/biolexica)** — Generates and applies coherent biomedical lexical indices for named-entity recognition (NER) and normalization (NEN).
- **[Biosynonyms](https://github.com/biopragmatics/biosynonyms)** — Decentralized database of synonyms for biomedical concepts.
- **[Biomappings](https://github.com/biopragmatics/biomappings)** — Community-curated and predicted equivalences and related mappings between named biological entities not available from primary sources.
- **[SemRA](https://github.com/biopragmatics/semra)** — Semantic Mapping Reasoning Assembler, for assembly and reasoning over semantic mappings at scale ([Hoyt et al. 2025, *Bioinformatics*](https://doi.org/10.1093/bioinformatics/btaf542)).
- **[bioversions](https://github.com/biopragmatics/bioversions)** — Tracks the latest version of each biomedical database — useful as a freshness check across the resources curated in [Databases.md](./Databases.md).
