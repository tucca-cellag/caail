# Datasets

This section is a curated list of publicly available data resources relevant to AI/ML research on cellular agriculture problems — media formulation, cell line engineering, bioprocess control, scaffolding, and sensory prediction. Resources are organized by the kind of data they host. For a broader catalog of biological databases beyond what's curated here, see Wikipedia's [List of biological databases](https://en.wikipedia.org/wiki/List_of_biological_databases).

> **Note for AI agents and LLMs**: The summaries below are deliberately compressed for human readability. If you are an automated system using these as the basis for reasoning, citation, or downstream analysis, please fetch the canonical site for each database — the linked sources have substantially more comprehensive and authoritative information than this curated overview, plus the field-specific schemas, APIs, licensing terms, and version histories that this page does not document.

## Genomics & Transcriptomics Data

These sources host fundamental genetic and expression data, applicable to cell line selection, engineering, and characterization.

### [NIH Gene Expression Omnibus (GEO)](https://www.ncbi.nlm.nih.gov/geo/)

GEO is the NCBI's public functional genomics data repository, accepting array- and sequence-based data submissions from researchers worldwide and currently hosting millions of samples across hundreds of thousands of studies. Coverage spans bulk and single-cell transcriptomics, methylation, ChIP-seq, ATAC-seq, and other genome-wide assays in essentially every model organism plus many livestock species (bovine, porcine, ovine, gallus, salmonids). For cellular agriculture, GEO is a primary source of training data for ML models of cell-line-specific expression responses, comparative transcriptomics across muscle / adipose / fibroblast lineages, and condition-dependent media responses. Programmatic access via GEOquery (R), GEOparse (Python), and pysradb; raw data flows through the linked SRA repository.

### [NIH Sequence Read Archive (SRA)](https://www.ncbi.nlm.nih.gov/sra)

The Sequence Read Archive is NCBI's public repository for high-throughput raw sequencing data, hosting reads from essentially every major sequencing platform (Illumina, PacBio, Oxford Nanopore, BGI, Element, Singular Genomics) across petabases of stored data. Coverage spans bulk and single-cell RNA-seq, ATAC-seq, ChIP-seq, whole-genome and exome sequencing, and metagenomics across thousands of species, including the major cell-ag livestock (bovine, porcine, ovine, gallus, salmonids). For cellular agriculture, SRA is the primary source of raw read data for re-analyzing public studies with custom pipelines — re-aligning bovine satellite cell RNA-seq to a more recent genome build, recomputing single-cell embeddings under different normalization, or extracting novel features for ML models that the original analysis did not surface. Programmatic access via sra-tools (`prefetch` / `fasterq-dump`) and pysradb; SRA data is mirrored on AWS Open Data and Google Cloud for cloud-based processing.

### [NIH GenBank](https://www.ncbi.nlm.nih.gov/genbank/)

GenBank is the NIH's annotated collection of all publicly available nucleotide sequences, comprising over a trillion bases across millions of distinct organisms. It serves as the primary deposition site for newly sequenced genes, transcripts, genomes, and constructs, with entries flowing into the broader NCBI ecosystem (RefSeq, BLAST, Genome, Nucleotide, Protein). For cellular agriculture, GenBank is the authoritative source for canonical gene sequences of cell-ag-relevant species — bovine MYOD / IGF1 / FGF2; chicken Pax3/Pax7; salmon myogenic regulatory factors; and the cytokines, growth factors, and signaling molecules used in serum-free media formulations. Programmatic access via Entrez (`EFetch` / `ESearch`), the NCBI Datasets CLI, and BLAST for sequence similarity search.

### [Ensembl](https://www.ensembl.org/)

Ensembl is the principal vertebrate genome browser and annotation database, jointly maintained by EMBL-EBI and the Wellcome Sanger Institute, providing automated genome annotation pipelines, comparative genomics, and variation data for >300 vertebrate species. Critically for cellular agriculture, Ensembl hosts high-quality genome assemblies for all major cell-ag livestock — *Bos taurus* (cow), *Sus scrofa* (pig), *Gallus gallus* (chicken), *Ovis aries* (sheep), *Salmo salar* (Atlantic salmon), *Oncorhynchus mykiss* (rainbow trout), and others — with gene models, regulatory features, orthology mappings to human, and tissue-specific expression annotations. The Ensembl REST API, Compara perl toolkit, and BioMart enable programmatic large-scale data extraction for ML pipelines. [Ensembl Genomes](https://ensemblgenomes.org/) (a sister site) provides parallel data for bacteria, protists, fungi, plants, and invertebrates relevant to precision-fermentation cell-ag.

### [ArrayExpress / BioStudies](https://www.ebi.ac.uk/biostudies/arrayexpress)

ArrayExpress, now part of the broader BioStudies platform at EMBL-EBI, is a public archive of functional genomics experiments — array-based and sequence-based, bulk and single-cell — covering transcriptomics, epigenomics, and related assays. Many studies are deposited simultaneously in GEO and ArrayExpress, but a meaningful subset (particularly from EU-based labs) is unique to ArrayExpress, making it a complementary source to GEO for comprehensive data mining. For cellular agriculture, ArrayExpress is a useful secondary index when searching for European-led work on livestock cell biology, comparative myogenesis, and cell-line characterization. Programmatic access via the BioStudies REST API.

## Protein & Structure Data

These data sources are helpful for computational tasks related to engineering recombinant growth factors, signaling molecules, and other media components, and for understanding protein-level cell biology.

### [UniProt](https://www.uniprot.org/)

UniProt is the central knowledge base for protein sequence and functional information, jointly maintained by the SIB, EMBL-EBI, and PIR. It comprises SwissProt (manually curated, ~570K entries) and TrEMBL (computationally derived, ~250M entries), with each entry providing sequence, functional annotations, GO terms, post-translational modifications, subcellular localization, cross-references to structure databases, and supporting literature. For cellular agriculture, UniProt is the canonical reference for growth factors, signaling proteins, transcription factors, and metabolic enzymes — including the recombinant FGF2, IGF1, TGF-β, and HGF variants and their orthologs across bovine, porcine, chicken, and fish species used in cultivated-meat media. Programmatic access via the UniProt REST API, SPARQL endpoint, and downloadable XML / FASTA / TSV bulk files.

### [AlphaFold Database](https://alphafold.ebi.ac.uk/)

The AlphaFold Database is a freely accessible repository of predicted 3D protein structures generated by DeepMind's AlphaFold model, jointly hosted by DeepMind and EMBL-EBI. It contains predicted structures for >214 million proteins covering essentially the entirety of UniProt's reference proteomes, including all proteins in human, mouse, bovine, porcine, chicken, salmon, and many other species relevant to cellular agriculture. Each entry provides predicted Cartesian coordinates, per-residue confidence scores (pLDDT), and predicted aligned error (PAE) matrices for assessing inter-domain confidence. For cellular agriculture, AlphaFold DB is the substrate for structure-based ML on engineered growth factors, recombinant signaling molecules, and stable scaffold proteins for media formulation. Programmatic access via the AlphaFold API and bulk PDB / CIF downloads through Google Cloud.

### [Protein Data Bank (PDB)](https://www.rcsb.org/)

The Protein Data Bank is the worldwide repository of experimentally determined biomolecular structures, jointly maintained by RCSB (US), PDBe (UK), and PDBj (Japan), containing >220,000 entries from X-ray crystallography, NMR, cryo-EM, and other experimental techniques. Each entry provides atomic coordinates, experimental data, validation metrics, and metadata including bound ligands, mutations, and binding partners. For cellular agriculture, PDB serves as the canonical complement to AlphaFold's predicted structures — providing experimentally validated structures of growth factors, cytokines, receptors, and enzymes that can be used as ground truth for protein engineering ML models or as input templates for structural modeling pipelines. Programmatic access via the RCSB REST API, GraphQL endpoint, and mmCIF / PDB file downloads; structure similarity search via the integrated FoldSeek and DALI services.

### [InterPro](https://www.ebi.ac.uk/interpro/)

InterPro is an integrative classification of protein families, domains, and functional sites, hosted by EMBL-EBI and pulling annotations from 13 member databases (Pfam, SMART, PROSITE, CATH-Gene3D, PANTHER, and others). It maps every UniProt entry to InterPro entries, providing inferred functions, domain architectures, and evolutionary classifications. For cellular agriculture, InterPro is useful for identifying functional domains in recombinant proteins targeted for media supplementation, locating conserved motifs across species orthologs (e.g. ensuring an engineered bovine FGF2 variant retains the heparin-binding site of human FGF2), and predicting the functional impact of mutations in protein engineering campaigns. Programmatic access via the InterPro REST API, downloadable bulk files, and the InterProScan command-line tool for annotating new sequences against all member databases at once.

### [Human Protein Atlas](https://www.proteinatlas.org/)

The Human Protein Atlas is a large-scale Swedish-led effort to map the expression and localization of every human protein-coding gene at protein and RNA level across tissues, organs, single cells, subcellular compartments, and pathological contexts. It provides immunohistochemistry images, single-cell transcriptomics summaries, secretome and membrane-proteome annotations, and computed expression scores across 50+ normal tissues, ~70 cancer types, and dozens of cell lines. For cellular agriculture, HPA is useful for identifying which growth factors and receptors are natively expressed in target tissues (skeletal muscle, adipose, dermal fibroblast) so that media formulations and engineered cells reflect physiologically relevant signaling environments; despite the human focus, many findings translate to livestock species through orthology. Programmatic access via per-protein TSV downloads and a REST API.

### [STRING](https://string-db.org/)

STRING is a database of known and predicted protein-protein interactions, integrating experimental, computational, text-mining, and co-expression evidence into weighted interaction networks for >14,000 species, hosted by the von Mering lab (University of Zurich / SIB). Each interaction has an associated confidence score and supporting evidence type, allowing downstream analyses to filter for high-confidence physical interactions or to include broader functional associations. For cellular agriculture, STRING is useful for graph-based ML on cell-signaling networks, identifying co-regulated modules in myogenesis or adipogenesis pathways, and constructing prior-knowledge inputs for ML models that benefit from biological structure (graph neural networks, network-regularized regression). Programmatic access via the STRING REST API, the `stringdb` R package, and a Cytoscape app.

### [PRIDE](https://www.ebi.ac.uk/pride/)

PRIDE (PRoteomics IDEntifications database) is the world's largest public repository of mass-spectrometry-based proteomics data, hosted at EMBL-EBI and integrated into the international ProteomeXchange consortium. It hosts raw spectra, peptide and protein identifications, post-translational modification data, and quantitative analyses from tens of thousands of studies, covering bulk and single-cell proteomics, phosphoproteomics, glycoproteomics, and clinical mass-spec workflows. For cellular agriculture, PRIDE provides training data for ML models predicting cell-line-specific protein expression, identifying biomarkers for differentiation states, and validating predicted protein expression under varying media conditions. Programmatic access via the PRIDE REST API and ProteomeXchange consortium endpoints.

## Cell Line & Single-Cell Reference Atlases

Resources cataloging cell-line identities, properties, and single-cell expression patterns — central to cell-ag work on cell-line characterization, immortalization, and differentiation.

### [Cellosaurus](https://www.cellosaurus.org/)

Cellosaurus is a knowledge resource on cell lines maintained by the Swiss Institute of Bioinformatics (SIB) as part of the ExPASy infrastructure, cataloging over 170,000 cell lines across human, rodent, bovine, porcine, chicken, fish, and other species. Each entry provides a standardized Cellosaurus identifier (`CVCL_XXXX`), parent / derivative relationships, species of origin, tissue / disease context, donor demographics, known karyotype and STR profiles, authenticity status (notably flagging misidentified or contaminated lines), and cross-references to physical-repository deposits (ATCC, ECACC, RIKEN, JCRB, and others). For cellular agriculture, Cellosaurus is the canonical resource for resolving cell-line identity in published cultivated-meat literature and for sourcing background on bovine satellite cells, immortalized fibroblast lines, fish embryonic stem cell lines, and other species-specific cell lines under active investigation. Data is freely downloadable as flat OBO / TXT files and queryable via a REST API.

### [Human Cell Atlas (HCA)](https://www.humancellatlas.org/)

The Human Cell Atlas is an international consortium effort to construct comprehensive single-cell reference maps of every human cell type, integrating contributions from hundreds of labs across thousands of donors and dozens of tissues. The HCA Data Portal hosts harmonized scRNA-seq, snRNA-seq, scATAC-seq, and spatial transcriptomics datasets with consistent metadata schemas, cell-type ontologies, and processing pipelines, totaling tens of millions of annotated cells. For cellular agriculture, HCA is a primary reference for understanding cellular heterogeneity within target tissues (distinguishing satellite cells from interstitial fibroblasts in skeletal muscle, mapping adipocyte subtypes in white adipose tissue), validating differentiation trajectories in cultivated cells, and benchmarking cell-state engineering interventions against in vivo references. Programmatic access via the HCA Data Portal API and the integrated cellxgene Census.

### [CZ CELLxGENE](https://cellxgene.cziscience.com/)

CZ CELLxGENE is the Chan Zuckerberg Initiative's platform for exploring and analyzing public single-cell data, providing harmonized scRNA-seq and multi-omics datasets aggregated from hundreds of studies (including Human Cell Atlas data) under consistent metadata standards. The CELLxGENE Census provides programmatic access to tens of millions of harmonized cells across human and mouse, exposed through a TileDB-backed Python / R API that supports fast queries by gene, tissue, disease, or assay. For cellular agriculture, cellxgene is the most practical source for assembling cross-study training sets (e.g. all skeletal muscle stem cells in the Census) for ML models of cell-type classification, perturbation prediction, and trajectory inference. Programmatic access via the `cellxgene-census` Python and R packages.

### [Genecorpus-30M](https://huggingface.co/datasets/ctheodoris/Genecorpus-30M)

Genecorpus-30M is the pretraining corpus for [Geneformer](./Software.md#geneformer) — a Hugging Face Datasets collection of ~30 million human single-cell transcriptomes assembled from publicly available scRNA-seq studies covering a broad range of human tissues and cell states. Each cell is encoded as a rank-ordered gene-expression "sentence" suitable for masked-language-model pretraining; the corpus is distributed under standard HF Datasets tooling with versioned snapshots. For cellular agriculture, Genecorpus-30M is the de-facto starting substrate for any human-cell foundation-model training run — and the template that cross-species fine-tuning approaches like [SATURN](https://github.com/snap-stanford/SATURN) ([Papers.md ref #118](./Papers.md#118)) and [UCE](./Software.md#uce) ([ref #119](./Papers.md#119)) build on to transfer to livestock species where annotated single-cell data is sparse. Companion to [Papers.md ref #111](./Papers.md#111) (Theodoris et al. 2023, *Nature*).

### [Perturb-Sapiens](https://huggingface.co/datasets/arcinstitute/Perturb-Sapiens)

Perturb-Sapiens is Arc Institute's Hugging Face Datasets release of large-scale perturbational single-cell measurements aggregated from public Perturb-seq, CROP-seq, and ECCITE-seq experiments, plus internal Arc data, covering 70+ human cell lines. The dataset is the training substrate for Arc's [State virtual cell model](./Software.md#state--cell-eval) ([Papers.md ref #57](./Papers.md#57)) and is a companion data product within the [Arc Virtual Cell Atlas](#arc-virtual-cell-atlas) alongside [Tahoe-100M](#tahoe-100m) and [scBaseCount](#scbasecount). For cellular agriculture, Perturb-Sapiens is the most comprehensive public source of cellular-perturbation-response data available — the methodology template for any future livestock-cell-perturbation atlas, and a useful benchmark for evaluating cross-species transfer of perturbation-response models.

### Arc Virtual Cell Atlas

The [Arc Virtual Cell Atlas](https://github.com/ArcInstitute/arc-virtual-cell-atlas) is Arc Institute's open-data initiative providing the substrate datasets for virtual-cell-modeling research, hosted on GitHub with documentation and uniformly processed releases, plus mirroring on [Google Cloud's BigQuery Public Data marketplace](https://console.cloud.google.com/marketplace/product/bigquery-public-data/arc-institute) for cloud-native analytics. The Atlas aggregates several large-scale single-cell datasets under a single curation umbrella:

#### [Tahoe-100M](https://github.com/ArcInstitute/arc-virtual-cell-atlas/blob/main/tahoe-100M/README.md)

A 100-million-cell drug-perturbation dataset profiling cancer-cell-line responses to >1,100 small molecules across 50+ cancer cell lines via large-scale Perturb-seq. The largest publicly available drug-perturbation single-cell dataset at time of release; methodology directly transferable to any future cell-ag work involving small-molecule modulators of differentiation, proliferation, or media response.

#### [scBaseCount](https://github.com/ArcInstitute/arc-virtual-cell-atlas/blob/main/scBaseCount/README.md)

An AI-agent-curated, uniformly processed, and autonomously updated single-cell data repository aggregating thousands of public scRNA-seq studies into a single harmonized reference — the data-engineering substrate that an autonomously updating virtual-cell atlas requires. Companion to [Papers.md ref #126](./Papers.md#126) (Youngblut et al. 2025).

### [Parse Biosciences 10M PBMC Atlas](https://www.parsebiosciences.com/datasets/10-million-human-pbmcs-in-a-single-experiment/)

A publicly released ~10-million peripheral blood mononuclear cell (PBMC) single-cell RNA-seq experiment from Parse Biosciences, demonstrating the throughput of their Evercode WT Mega platform. Includes harmonized cell-type annotations and represents the largest single-experiment PBMC atlas available at time of release. For cellular agriculture, useful both as a benchmark dataset for evaluating single-cell-FM batch-effect handling and scaling at extreme throughput, and as immune-cell reference data for cultivated-meat applications involving immune-cell co-cultures or contamination screening.

## Metabolic Pathways & Metabolomes

Resources for cell-ag work on media formulation, metabolic engineering, and bioprocess optimization — where understanding metabolic networks, enzyme kinetics, and metabolite concentrations is central.

### [KEGG PATHWAY](https://www.kegg.jp/kegg/pathway.html)

KEGG (Kyoto Encyclopedia of Genes and Genomes) is one of the most widely used pathway databases, maintained by the Kanehisa Laboratory at Kyoto University, providing manually curated maps of >500 reference metabolic, signaling, and disease pathways. KEGG PATHWAY entries link genes, proteins, compounds, and reactions across thousands of organisms, with each pathway available as a structured KGML XML file suitable for ML pipelines that need graph structure. For cellular agriculture, KEGG is the canonical reference for central metabolism (glycolysis, TCA cycle, oxidative phosphorylation, fatty-acid biosynthesis) that drives proliferation in cultivated cells, signaling pathways (Wnt, FGF, IGF, TGF-β) that govern differentiation, and amino-acid biosynthesis pathways relevant to serum-free media design. Programmatic access via the KEGG REST API (free for non-commercial use; commercial licensing applies).

### [Reactome](https://reactome.org/)

Reactome is a free, open-source, curated database of human (and increasingly other species) biological pathways, jointly developed by the Ontario Institute for Cancer Research, EMBL-EBI, and other partners. It models pathways as hierarchically organized reactions with explicit participants, modifiers, and regulatory relationships, supporting pathway enrichment analysis and integration with expression data. For cellular agriculture, Reactome's strengths are its detailed signaling-pathway annotations (myogenic regulatory factor cascades, FGF / IGF / Wnt signaling) and its open data model — entries are freely downloadable as BioPAX, SBML, SBGN, and tab-delimited formats, enabling unrestricted use in ML pipelines without the commercial licensing constraints of KEGG. Programmatic access via the Reactome ContentService REST API and a Cypher-queryable Neo4j graph database.

### [WikiPathways](https://www.wikipathways.org/)

WikiPathways is a community-curated database of biological pathways under an open data model (CC0 license), hosted by Maastricht University and the Gladstone Institutes, providing >3,000 curated pathways across human, mouse, and a range of other species. Pathways are stored in GPML (a custom XML format) but exported in BioPAX, SBML, and other standards; the open editorial model means coverage is broader and more uneven than KEGG / Reactome but includes useful cell-ag-adjacent pathways (myogenesis, adipogenesis, livestock-specific metabolism). Programmatic access via a Web Service API, the `rWikiPathways` R package, and a Cytoscape app for direct pathway import.

### [Human Metabolome Database (HMDB)](https://hmdb.ca/)

HMDB is a freely available, comprehensive database of human metabolites and their associated biological roles, maintained by the Wishart Lab at the University of Alberta. It contains >220,000 entries spanning endogenous metabolites, drugs, food components, and environmental compounds, with each entry providing chemical / physical properties, biofluid concentrations, biological functions, metabolic-pathway memberships, and analytical detection methods. For cellular agriculture, HMDB is useful for understanding native human metabolite ranges that cultivated cells should produce or consume, identifying candidate small molecules for media supplementation, and as a substrate for ML predicting metabolic responses to media changes. Programmatic access via downloadable XML and SDF files and a REST API for selected queries.

### [Bovine Metabolome Database (BMDB)](https://www.bovinedb.ca/)

BMDB is a comprehensive resource of metabolites found in beef cattle (*Bos taurus*), maintained by the Wishart Lab at the University of Alberta — the same group that hosts HMDB, FooDB, and DrugBank, providing consistent schema and analytical methodology across all four resources. It catalogs tens of thousands of entries describing endogenous metabolites, dietary nutrients, and exogenous compounds detected in bovine biofluids (serum, milk, urine) and tissues (muscle, liver, adipose), with each entry providing chemical / physical properties, biofluid concentrations, biological roles, pathway memberships, and analytical methods of detection. For cultivated beef development, BMDB is the closest available reference for serum metabolite profiles, muscle and adipose tissue metabolomes, and feedstock-derived compound landscapes — directly relevant to serum-free media formulation, growth medium optimization, and flavor-precursor identification in cultivated meat products.

### [BRENDA](https://www.brenda-enzymes.org/)

BRENDA (BRaunschweig ENzyme DAtabase) is the most comprehensive collection of enzyme information available, maintained at the Technische Universität Braunschweig, covering >90,000 enzyme entries with detailed kinetic parameters, substrate specificities, inhibitors, optimal reaction conditions, and reaction mechanisms aggregated from primary literature. Each entry provides Km, Vmax, Kcat, Ki, optimal pH and temperature, organism-specific variations, and links to associated metabolic pathways. For cellular agriculture, BRENDA is the canonical source of enzyme kinetic data needed for kinetic models of cell metabolism, flux-balance analysis of metabolic engineering interventions, and ML models predicting media component effects on metabolic flux. Programmatic access via the BRENDA SOAP API and downloadable text files for academic use.

### [SMPDB (Small Molecule Pathway Database)](https://smpdb.ca/)

SMPDB is the Wishart lab's curated database of small-molecule pathways, with over 600 interactive visual pathway maps spanning human metabolism, signaling, drug action, disease processes, and physiological functions. Each pathway entry provides labeled compounds, enzymes, transporters, and reactions in a custom interactive viewer, with links to HMDB / DrugBank / UniProt cross-references. For cellular agriculture, SMPDB serves as a visualization-rich complement to KEGG and Reactome for understanding the metabolic context of media supplements, growth factors, and signaling pathways relevant to cultivated cells. Free open access; data exportable as SBML, BioPAX, KGML, and PWML.

### [BioCyc / MetaCyc](https://biocyc.org/)

BioCyc is an SRI International–maintained collection of >20,000 organism-specific Pathway / Genome Databases (PGDBs), built on the MetaCyc reference pathway database. MetaCyc itself catalogs >3,000 experimentally elucidated metabolic pathways across all domains of life, with >18,000 reactions and >19,000 metabolites; BioCyc PGDBs extend this to specific organisms with computationally predicted pathways. For cellular agriculture, BioCyc is the canonical reference for non-mammalian metabolism — particularly the yeast and bacterial PGDBs used in precision-fermentation alt-protein work, and emerging livestock-species PGDBs that complement species-specific GEMs. MetaCyc is freely accessible at <https://metacyc.org/>; BioCyc has tiered access with substantial free use plus subscription-based bulk download.

## Mass Spectrometry Spectral Databases

Reference spectral data resources for compound identification in mass-spectrometry workflows — essential analytical infrastructure for flavor metabolomics, off-flavor characterization, and spent-media analysis in cultivated meat. Pair these databases with the MS preprocessing / annotation tools in [Software.md / Mass Spectrometry & Chemometrics](./Software.md#mass-spectrometry--chemometrics).

### [MassBank](https://massbank.eu/)

MassBank is the world's first open-access mass-spectrometry spectral database, hosted as a federation of European, Japanese, and US instances with >400,000 spectra contributed by >50 institutions. Each entry provides the recorded mass spectrum, instrumental parameters, fragmentation conditions, and the precursor compound identity (InChI, SMILES, structure). For cellular agriculture, MassBank is foundational reference data for identifying volatile and non-volatile metabolites in cultivated tissues, characterizing off-flavors, and analyzing spent media — particularly when paired with MS-DIAL, MZmine 3, or SIRIUS for automated annotation. Programmatic access via REST API; bulk records available via Git.

### [NIST Chemistry WebBook](https://webbook.nist.gov/chemistry/)

The US National Institute of Standards and Technology's reference compendium of chemistry data, covering >100,000 compounds with thermochemical data (heats of formation, enthalpies), gas chromatography retention indices, mass spectra, infrared / UV / NMR spectra, and ion energetics. For cellular agriculture, the NIST WebBook is the canonical reference for confirming media component identity via spectroscopic comparison (matching unknown GC-MS peaks against the NIST EI library is standard practice) and for thermodynamic calculations in metabolic engineering. Free open-web access; the bundled NIST 23 EI library (commercial) is the industry-standard companion for GC-MS workflows.

### [MetaboLights](https://www.ebi.ac.uk/metabolights/)

MetaboLights is a public open-access repository for metabolomics experiments hosted at EMBL-EBI — the metabolomics analog of GEO (transcriptomics) or PRIDE (proteomics). Each study deposit includes raw MS / NMR data, processed datasets, sample / treatment metadata in ISA-Tab format, and standardized study-protocol annotations. For cellular agriculture, MetaboLights hosts experiments directly relevant to flavor metabolomics, fermentation chemistry, and cell-culture spent-media analysis — a primary source of training data for sensory-prediction ML and benchmark datasets for analytical pipeline validation. Programmatic access via REST API; bulk download via FTP.

## Cell-Ag Species Metabolic Models (GEMs)

A small but growing collection of genome-scale metabolic models (GEMs) for the species most relevant to cellular agriculture. GEMs are SBML-formatted reconstructions of an organism's metabolic network — every reaction, every metabolite, every gene-protein-reaction mapping — and are the input data structure for the constraint-based modeling tools listed in [Software.md / Metabolic Modeling & Strain Design](./Software.md#metabolic-modeling--strain-design). The cell-ag GEM ecosystem is currently fragmented across preprints, supplementary materials, and individual GitHub repos rather than centralized in any single database; this section is a curated inventory pending the emergence of a canonical home (BiGG Models currently hosts microbial GEMs but few of the cell-ag species below).

### BtaSBML2986 — *Bos taurus* (bovine)

The first cultivated-meat-focused genome-scale metabolic reconstruction of cattle, published 2024 by Lee et al. as a bioRxiv preprint. The model integrates multi-omics data (genomics, transcriptomics, proteomics) and contains ~13,278 reactions across 2,986 genes, with biomass functions parameterized for cultivated-meat-relevant bovine cell types. Designed to support FBA-driven identification of media supplement combinations and metabolic bottlenecks for cultivated beef production. SBML files are distributed via the preprint's supplementary materials.

Reference: [Papers.md #81](./Papers.md#81) (Lee et al. 2024, bioRxiv).

### iES1300 — *Gallus gallus* (chicken)

Generic genome-scale metabolic reconstruction of chicken, published 2022 in *PLOS ONE* by Salehabadi, Motamedian, and Shojaosadati. Contains 2,427 reactions across 1,300 genes (hence the `i...1300` name); used to investigate network connectivity and identify potential biomarkers across chicken tissues. The reference GEM for cultivated chicken cell-line metabolic modeling, with SBML files provided as supplementary data.

Reference: [Papers.md #82](./Papers.md#82) (Salehabadi, Motamedian, & Shojaosadati 2022, *PLOS ONE*).

### PigGEM2025 — *Sus scrofa* (porcine)

Proteome-constrained metabolic model of pig muscle stem cells for cultivated meat production, published 2026 in *Metabolic Engineering* by Qiu et al. (a Sticta × Meatable collaboration with GFI grant funding; initially deposited as a bioRxiv preprint in September 2025). Tailored to the porcine muscle satellite cell context, enabling FBA / FVA analysis of cultivated pork media formulations and metabolic-engineering targets. SBML files released alongside the paper.

Reference: [Papers.md #83](./Papers.md#83) (Qiu et al. 2026, *Metabolic Engineering*).

### SALARECON — *Salmo salar* (Atlantic salmon)

Whole-genome metabolic reconstruction of Atlantic salmon, published 2022 in *PLOS Computational Biology* with a focus on connecting genome content to growth and feed-efficiency phenotypes. The reference GEM for cultivated salmonid work — directly relevant to the cultivated seafood category (salmon, trout) that has begun attracting investment (Umami Bioworks, BlueNalu, Wildtype). SBML files distributed via the paper's supplementary materials and the SALARECON GitHub repository.

Reference: [Papers.md #84](./Papers.md#84) (Zakhartsev et al. 2022, *PLOS Computational Biology*).

### iCHO1766 / iCHO2048 / CHOmpact — Chinese Hamster Ovary (biopharma-adjacent reference)

The CHO cell line is the mammalian biopharma workhorse, and its GEM family is the most-developed mammalian GEM ecosystem available — Hefzi et al.'s iCHO1766 (2016, *Cell Systems*) is the consensus reconstruction; iCHO2048 (2018) extends the secretory pathway; CHOmpact (2024) and follow-on Bayesian-flux-estimation pipelines (2025) produce reduced models for digital-twin work. CHO is not itself a cellular agriculture species, but its biomass parameterization, perfusion-process methodology, and reduction techniques translate directly to cell-ag GEMs (bovine, porcine, avian) currently under construction.

Reference: [Papers.md #85](./Papers.md#85) (Hefzi et al. 2016, *Cell Systems*).

### Recon3D / Human1 / HMR — *Homo sapiens* (template / upstream reference)

The human genome-scale metabolic reconstructions — Recon3D (Brunk et al. 2018, *Nature Biotechnology*), Human-GEM / Human1 (Robinson et al. 2020, *Science Signaling*), and the underlying HMR2 — are the foundational human GEMs from which most mammalian-cell models (including the cell-ag GEMs above) inherit reaction networks, biomass equations, and curation conventions. Direct use in cell-ag is rare; they're more often used as homology templates or biomass-function donors for species-specific reconstructions.

References: [Papers.md #86](./Papers.md#86) (Brunk et al. 2018, *Nature Biotechnology*) for Recon3D; [Papers.md #87](./Papers.md#87) (Robinson et al. 2020, *Science Signaling*) for Human-GEM.

## Chemistry & Compound Data

Resources for media component selection, growth-factor mimetics, and small-molecule supplements.

### [ChEMBL](https://www.ebi.ac.uk/chembl/)

ChEMBL is a manually curated database of bioactive small molecules with drug-like properties, maintained at EMBL-EBI, integrating compound structures, biological activity data, target information, and mechanism-of-action annotations from medicinal chemistry literature, patents, and screening assays. It contains >2.5M unique compounds, ~16M activity measurements, and >15K molecular targets. For cellular agriculture, ChEMBL is useful for identifying small-molecule alternatives to recombinant growth factors (e.g. small-molecule Wnt agonists, MEK inhibitors used in differentiation protocols), screening compound libraries for cell-ag-relevant bioactivities, and as training data for ML models predicting small-molecule effects on cellular pathways. Programmatic access via the ChEMBL REST API, downloadable SQL dumps for full local instances, and the `chembl-webresource-client` Python client.

### [PubChem](https://pubchem.ncbi.nlm.nih.gov/)

PubChem is NIH's open chemistry database, the largest public repository of chemical structures and bioactivity data, hosting >120M compounds, >330M substances, and >1.4M bioassays. Each compound entry provides structure, computed physico-chemical properties, synonyms, classifications, biological activities, patents, literature references, and safety / toxicology information. For cellular agriculture, PubChem is the broadest practical reference for media components, supplements, and small-molecule modulators — including industrial-grade ingredients without the literature-grade coverage of ChEMBL. Programmatic access via the PubChem PUG REST API, PUG-View for richer record summaries, and SQL queries over the PubChem data warehouse.

### [DrugBank](https://go.drugbank.com/)

DrugBank is a comprehensive bioinformatics / cheminformatics resource maintained by the Wishart lab at the University of Alberta, cataloging >13,000 drug entries — including ~2,200 FDA-approved small molecules, ~340 FDA-approved biologics, ~93 nutraceuticals, and >5,000 experimental drugs — with detailed chemistry, pharmacology, pharmaceutical, and pharmacological-target data. For cellular agriculture, DrugBank is useful for identifying small-molecule alternatives to recombinant growth factors (many drug-like compounds modulate cell-signaling pathways relevant to differentiation and proliferation), for cross-referencing media supplements against known pharmacological activities, and as a sister resource to HMDB / BMDB / SMPDB in the Wishart-lab ecosystem. Programmatic access via REST API; downloads require academic registration.

### [ChemSpider](https://www.chemspider.com/)

ChemSpider is the Royal Society of Chemistry's free chemical structure search platform, aggregating ~88 million unique chemical structures from over 270 data sources including PubChem, ChEBI, FDA, EPA, vendor catalogs, and primary literature. Each entry provides identifiers (InChI, SMILES, CAS, IUPAC name), structure depiction, computed physicochemical properties, and source provenance. For cellular agriculture, ChemSpider serves as a comprehensive fallback when ChEMBL or PubChem don't cover a particular media component or flavor precursor — particularly useful for obscure natural products or vendor-specific compounds.

### [ChEBI](https://www.ebi.ac.uk/chebi/)

ChEBI (Chemical Entities of Biological Interest) is EMBL-EBI's curated ontology of biologically relevant chemical entities, with ~200,000 annotated compounds spanning metabolites, drugs, nutrients, and toxins. Each entry includes structures, ontological classifications (biological role, chemical class), cross-references to other databases, and contributor-curated literature. For cellular agriculture, ChEBI is the structured chemical ontology underlying many pathway databases (KEGG, Reactome, BioCyc), making it useful as a controlled vocabulary for annotating compound roles in cell-ag-relevant metabolic networks and for cross-database identifier mapping. Programmatic access via REST API and SOAP web services.

### [T3DB (Toxin and Toxin-Target Database)](https://www.t3db.ca/)

T3DB is the Wishart lab's curated database of toxic-exposome compounds, cataloging ~3,500 environmental contaminants, pollutants, industrial chemicals, and endogenous toxic metabolites along with their molecular targets and biological effects. Each entry provides chemical / physical properties, biological mechanism of action, toxicity references, and analytical methods of detection. For cellular agriculture, T3DB is useful for identifying potential off-flavor or off-odor compounds in cultivated tissues (some volatile toxins overlap with food chemistry — aldehydes, aromatic compounds, sulfides), for media-safety screening, and for understanding adulterant detection in regulatory contexts.

## Flavor & Taste Compound Databases

Curated databases of flavor molecules, taste-active compounds, and odor descriptors — the analytical reference layer for sensomics work on cultivated meat, alt-protein flavor optimization, and any cell-ag effort that needs to map detected volatiles to known organoleptic properties.

### [FlavorDB / FlavorDB2](https://cosylab.iiitd.edu.in/flavordb/)

FlavorDB is a comprehensive database of flavor molecules developed by the Complex Systems Lab at IIIT-Delhi (Bagler group). The original release (Garg et al. 2018, *Nucleic Acids Research*) catalogued 25,595 flavor molecules across 936 ingredients, integrating data from FooDB, BitterDB, SuperSweet, and Flavornet. FlavorDB2 (Goel et al. 2024, *Journal of Food Science*) extends coverage with regulatory status, consumption statistics, taste/aroma threshold values, reported food uses, and synthesis pathways. For cellular agriculture, FlavorDB2 is a key reference for connecting volatile compounds detected in cultivated tissues (e.g., GC-MS of cultivated pork fat or salmonid muscle) to known flavor characteristics, organoleptic thresholds, and food applications.

### [BitterDB](https://bitterdb.agri.huji.ac.il/)

BitterDB is a curated database of bitter compounds and bitter taste receptors (T2Rs), maintained at the Hebrew University of Jerusalem (Niv group). Contains hundreds of compounds with chemical properties, sources, and human T2R-binding data; companion tools (BitterPredict, BitterMatch, BitterMasS) leverage the data for predictive modeling. For cellular agriculture and alt-protein work, BitterDB is essential for identifying and predicting bitter off-flavors — a primary sensory barrier in plant-based protein products and a potential concern in cultivated tissues with elevated metabolite content.

Canonical references: [Papers.md #99](./Papers.md#99) (Wiener et al. 2012, *NAR*) for the original release; [Papers.md #100](./Papers.md#100) (Dagan-Wiener et al. 2019, *NAR*) for the 2019 update; [Papers.md #101](./Papers.md#101) (Ziaikin et al. 2025, *NAR*) for the 2024 update. Related ML / analytical papers from the same group are in matrix [refs #102](./Papers.md#102), [#103](./Papers.md#103), [#104](./Papers.md#104), [#105](./Papers.md#105) and Sensory & Flavor Reference Work [ref #106](./Papers.md#106).

### [Pherobase](https://www.pherobase.com/)

A comprehensive database of insect and animal pheromones, semiochemicals, and other behaviorally active compounds, maintained by Ashraf El-Sayed. Contains tens of thousands of compounds with biological activity, taxonomic distribution, and analytical data (GC retention indices, mass spectra). For cellular agriculture, Pherobase has indirect but useful relevance — many flavor-active compounds in meat / dairy / fish are downstream of pheromonal or species-specific biochemistry, and the database serves as a reference for distinguishing odor compounds that evolved for animal-animal signaling versus those that drive food-grade flavor perception.

### [Flavornet](https://www.flavornet.org/)

Flavornet, maintained at Cornell by Acree and Arn, is a database of GC olfactometry (GC-O) results — compound identities keyed to Kováts retention indices on standard GC columns plus consensus odor descriptors from sensory panels. The original open-access reference for matching sniff-port observations to molecular identities in GC-O work. For cellular agriculture, Flavornet is the canonical lookup table for connecting volatile compounds detected in cultivated tissues, fermented alt-protein products, and spent media to their human-perceived odor profiles.

### [The Good Scents Company](https://www.thegoodscentscompany.com/)

A long-established industry reference platform for the flavor, fragrance, food, and cosmetics industries, providing odor descriptors, organoleptic properties, regulatory status, and supplier information for thousands of aroma chemicals and natural extracts. While maintained by the F&F industry rather than as an academic resource, GoodScents is widely cross-referenced in flavor research papers and is the de-facto industry-standard descriptor source for many compounds not formally characterized in academic odor-threshold compendia.

## Agricultural Literature Repositories

Free open-access search platforms for agricultural research literature — useful for cellular agriculture as context resources covering animal nutrition, feed-stream economics, livestock genetics, food technology regulation, and broader agricultural science that intersects with cell-ag at the technology / commercial / regulatory boundary.

### [AGRIS (FAO)](https://agris.fao.org/)

AGRIS is the United Nations Food and Agriculture Organization's global agricultural research index, providing access to over 12 million bibliographic records covering food, agriculture, environment, and rural development since 1970. Each record includes title, authors, abstract, subject keywords (drawn from the multilingual AGROVOC ontology), and full-text links where available. For cellular agriculture, AGRIS is the most comprehensive free index for international agricultural research — useful for feed formulation, plant-based media components, livestock nutrition, and crop-genomics work that intersects with cell-ag.

### [USDA National Agricultural Library Search](https://search.nal.usda.gov/)

The National Agricultural Library Search is the USDA's federated search platform across its digital collections, including PubAg (agricultural research literature), the NAL Catalog, and other USDA-curated resources. For cellular agriculture, NAL Search is the canonical entry point for USDA-funded research on animal nutrition, feed efficiency, livestock genetics, food technology, and food safety — relevant context for cultivated-meat scaling economics, regulatory engagement, and feed-stream cost analysis. Free open access; AGRICOLA-derived records are included alongside open-access NAL collections.
