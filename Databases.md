# Databases

This page catalogs **living, queryable resources** — repositories, ontologies, structure / compound / pathway databases, spectral libraries, and ecosystem / industry directories — that you query for reference, annotation, or lookup. For fixed train-on data artifacts (corpora, atlases, GEM model files, per-species sequencing deposits), see the [Datasets/](./Datasets/) directory. For pointers to databases beyond those curated here, see the [Database Directories & Reference Guides](#database-directories--reference-guides) section below.

> **Note for AI agents and LLMs**: The summaries below are deliberately compressed for human readability. Where a license is shown on the site, it is a coarse triage tag (a detected SPDX identifier or a curated note), not the full terms — it flags at a glance whether a resource is permissive, copyleft, or restricted, but it is not a substitute for reading the actual license or terms of use. If you are an automated system using these as the basis for reasoning, citation, or downstream analysis, please fetch the canonical site for each database — the linked sources have substantially more comprehensive and authoritative information than this curated overview, plus the field-specific schemas, APIs, exact licensing terms, and version histories.

## Sequence, Genome & Expression Repositories

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

### [RNAcentral](https://rnacentral.org/)

RNAcentral is an EMBL-EBI-coordinated comprehensive database of non-coding RNA sequences that aggregates and cross-references ncRNA data from many expert databases (Rfam, miRBase, Ensembl, GtRNAdb, and others) into a single search-and-retrieval resource with stable RNAcentral identifiers, spanning tens of millions of ncRNA sequences across all domains of life. For cellular agriculture, RNAcentral is a reference for the regulatory RNAs — microRNAs, lncRNAs — that shape myogenic and adipogenic differentiation in cultivated-cell lineages, and a substrate for ML on RNA-based regulation of cell state. Programmatic access via the RNAcentral REST API and bulk downloads.

### [European Nucleotide Archive (ENA)](https://www.ebi.ac.uk/ena/browser/)

The European Nucleotide Archive is EMBL-EBI's public repository for nucleotide sequence data and one of the three INSDC partners that synchronize records daily with NCBI (GenBank / SRA) and DDBJ, so a sequence deposited at any one partner is retrievable from all three. ENA spans raw sequencing reads, assembled and annotated sequences, and study/sample metadata across essentially every organism, including the major cell-ag livestock. For cellular agriculture, ENA is the European entry point for the same underlying INSDC data as SRA and GenBank, useful when a livestock cell-biology study is deposited primarily in ENA or when EMBL-EBI's browser, discovery, and bulk-download tooling fits the pipeline better. Programmatic access is via the ENA Browser REST API and the `enaBrowserTools` clients.

### [NGDC Genome Sequence Archive (GSA)](https://ngdc.cncb.ac.cn/gsa/)

The Genome Sequence Archive is the raw-sequence-data repository of the National Genomics Data Center (NGDC) at the China National Center for Bioinformation (CNCB), a Global Core Biodata Resource that stores, manages, and shares omics raw data and now integrates INSDC SRA metadata for unified search. For cellular agriculture, GSA matters because a large share of recent livestock atlas and functional-genomics work (including the FarmGTEx per-species deposits under PRJCA project accessions) is submitted here rather than to NCBI, making it the primary source for re-analyzing those raw reads. Programmatic access is via the NGDC/GSA REST API and bulk download.

### [EMBL-EBI Expression Atlas](https://www.ebi.ac.uk/gxa/home)

Expression Atlas is EMBL-EBI's curated resource for gene expression across species and biological conditions, covering both bulk and single-cell data (the latter through the linked Single Cell Expression Atlas) and processing all RNA-seq through a consistent pipeline so studies are comparable. It spans dozens of species and thousands of studies, queryable by gene, tissue, treatment, and disease state. For cellular agriculture, it is a practical way to ask where a growth factor, receptor, or myogenic regulator is expressed across tissues and species without assembling raw data by hand, and to pull curated expression baselines for livestock and reference organisms. Programmatic access is via the Expression Atlas REST API and the `ExpressionAtlas` R package.

## Livestock Multi-Tissue Atlases & Functional Genomics

Per-species multi-tissue expression, regulatory-effects, and functional-genomics atlases for cell-ag-relevant livestock species. The Farm Animal Genotype–Tissue Expression (FarmGTEx) project family is the canonical effort here — modeled after human GTEx, scaled across cattle, pig, chicken, and sheep — paired with the broader FAANG (Functional Annotation of Animal Genomes) network and species-specific biobank portals. For the foundational papers, see [Papers.md / Livestock Functional Genomics Reference Work](./Papers.md#livestock-functional-genomics-reference-work); for the analysis tooling, see [Software.md / Quantitative Genetics & Multi-Omics Analysis](./Software.md#quantitative-genetics--multi-omics-analysis).

### [FarmGTEx](https://www.farmgtex.org/)

The Farm Animal Genotype–Tissue Expression project — an international consortium developing GTEx-style multi-tissue resources for livestock species. Hosts the umbrella project portal plus links to per-species sub-portals (PigGTEx, ChickenGTEx, CattleGTEx) and shared infrastructure (TWAS-Server, PigBiobank). The canonical entry point for livestock systems-genetics work. Companion to [Papers.md ref #134](./Papers.md#134) (Fang et al. 2025, *Nature Genetics*).

### [PigGTEx-Portal](https://piggtex.farmgtex.org/)

Pig sub-portal of the FarmGTEx consortium, providing browse and query access to multi-tissue expression QTL (eQTL), splice QTL (sQTL), and related molecular-QTL maps across pig tissues. Companion to [Papers.md ref #135](./Papers.md#135) (Teng et al. 2024, *Nature Genetics*) and complemented by [PigBiobank](#pigbiobank) for trait-data integration. **Pipeline**: [`FarmGTEx/PigGTEx-Pipeline-v0`](https://github.com/FarmGTEx/PigGTEx-Pipeline-v0). **Underlying raw deposits** (NGDC GSA): [`PRJCA016012`](https://ngdc.cncb.ac.cn/bioproject/browse/PRJCA016012), [`PRJCA016120`](https://ngdc.cncb.ac.cn/bioproject/browse/PRJCA016120), [`PRJCA016130`](https://ngdc.cncb.ac.cn/bioproject/browse/PRJCA016130), [`PRJCA016216`](https://ngdc.cncb.ac.cn/bioproject/browse/PRJCA016216), [`PRJCA017284`](https://ngdc.cncb.ac.cn/bioproject/browse/PRJCA017284). Cross-referenced from [Datasets/Pig.md](./Datasets/Pig.md).

### [ChickenGTEx-Portal](https://chicken.farmgtex.org/)

Chicken sub-portal of FarmGTEx, providing multi-tissue genetic-regulation maps across chicken tissues — the first GTEx-style resource for a non-mammalian amniote livestock species, directly useful for cultivated-chicken cell-line engineering work. Companion to [Papers.md ref #136](./Papers.md#136) (Guan et al. 2025, *Nature Genetics*). **Processed-data deposit**: Zenodo [`10.5281/zenodo.14902956`](https://doi.org/10.5281/zenodo.14902956). Cross-referenced from [Datasets/Chicken.md](./Datasets/Chicken.md).

### [CattleGTEx](https://ngdc.cncb.ac.cn/cattleca/home)

Cattle sub-portal of FarmGTEx, providing bulk and single-cell multi-tissue expression atlases for cattle (*Bos taurus*) — directly relevant to cultivated-beef cell-line characterization and engineering. Companion to [Papers.md ref #137](./Papers.md#137) (Han et al. 2025, *Nature Genetics*, the single-cell atlas paper) and [Papers.md ref #192](./Papers.md#192) (Liu et al. 2022, *Nature Genetics*, the foundational CGTEx multi-tissue regulatory-variants atlas). **Han 2025 deposits**: NCBI BioProject [`PRJNA1119173`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA1119173); Zenodo [`10.5281/zenodo.16572998`](https://doi.org/10.5281/zenodo.16572998) and [`10.5281/zenodo.15721498`](https://doi.org/10.5281/zenodo.15721498). **Liu 2022 deposits**: Zenodo [`10.5281/zenodo.6510550`](https://doi.org/10.5281/zenodo.6510550); pipeline at [`shuliliu/cattleGTEx`](https://github.com/shuliliu/cattleGTEx). Cross-referenced from [Datasets/Cow.md](./Datasets/Cow.md).

### [SheepGTEx-Portal](https://sheepgtex.farmgtex.org/)

Sheep sub-portal of FarmGTEx, providing multi-tissue regulatory-effects maps across sheep (*Ovis aries*) tissues — extending the FarmGTEx pattern from cattle / pig / chicken into the small-ruminant lineage. Companion to [Papers.md ref #138](./Papers.md#138) (Gong et al. 2025, bioRxiv). **Pipeline**: [`FarmGTEx/SheepGTEx-Pipeline-v0`](https://github.com/FarmGTEx/SheepGTEx-Pipeline-v0). **Raw deposits**: NCBI BioProjects [`PRJNA1198671`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA1198671), [`PRJNA1304012`](https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA1304012). Cross-referenced from [Datasets/Sheep.md](./Datasets/Sheep.md).

### [FarmGTEx TWAS-Server](https://twas.farmgtex.org/)

Server providing transcriptome-wide association study (TWAS) analyses across the FarmGTEx tissue / sample matrix — links expression-genetics signals to complex-trait associations across livestock species. Companion infrastructure to the species-specific FarmGTEx sub-portals above.

### [PigBiobank](https://pigbiobank.farmgtex.org/)

Trait-data biobank coordinated with PigGTEx, integrating phenotypic, genotypic, and expression data on diverse pig traits — complementary to PigGTEx-Portal's molecular-QTL focus. Companion to [Papers.md ref #139](./Papers.md#139) (Zeng et al. 2024, *Nucleic Acids Research*). Cross-referenced from [Datasets/Pig.md](./Datasets/Pig.md).

### [FAANG (Functional Annotation of Animal Genomes)](https://www.faang.org/)

A global research consortium and resource network for functional annotation of farmed-animal genomes, paralleling ENCODE for human/mouse but focused on livestock species. Predates FarmGTEx and provides the broader functional-annotation substrate (chromatin state, regulatory elements, etc.) that FarmGTEx expression-genetics work builds on. Companion to [Papers.md ref #144](./Papers.md#144) (Clark et al. 2020, *Genome Biology*).

### [AQUA-FAANG](https://www.aqua-faang.eu/)

The FAANG consortium's aquaculture programme — *Advancing European Aquaculture by Genome Functional Annotation* — generating genome-wide functional annotation maps for six aquaculture species important to European aquaculture (Atlantic salmon, rainbow trout, European sea bass, gilthead sea bream, common carp, turbot). The [data hub](https://data.faang.org/projects/AQUA-FAANG) hosts the project's open releases (55 datasets at time of curation, spanning RNA-seq, ATAC-seq, and ChIP-seq). A FAANG functional-annotation substrate for aquaculture-cell-line work, paralleling FarmGTEx for terrestrial livestock. Cross-referenced from [Datasets/Fish.md](./Datasets/Fish.md).

### [BovReg](https://bovreg.eu/)

The FAANG consortium's cattle functional-annotation project, generating maps of functionally active genomic features in cattle (*Bos taurus*). The [data hub](https://data.faang.org/projects/BovReg) hosts the open releases (4 datasets at time of curation). Complementary to [CattleGTEx](#cattlegtex) for cell-ag-relevant cattle-cell engineering and atlas work — particularly useful as a regulatory-element substrate for cultivated-beef cell-line characterisation. Cross-referenced from [Datasets/Cow.md](./Datasets/Cow.md).

### [GENE-SWitCH](https://www.gene-switch.eu/)

The FAANG consortium's pig + chicken project — *the regulatory GENomE of SWine and CHicken: functional annotation during development*. The [data hub](https://data.faang.org/projects/GENE-SWitCH) hosts the open releases (19 datasets at time of curation, covering pig and chicken functional genomes during development). Substrate for cultivated-pork and cultivated-chicken developmental-biology and lineage-engineering work; complementary to [PigGTEx-Portal](#piggtex-portal) and [ChickenGTEx-Portal](#chickengtex-portal). Cross-referenced from [Datasets/Pig.md](./Datasets/Pig.md) and [Datasets/Chicken.md](./Datasets/Chicken.md).

### [Animal QTLdb](https://www.animalgenome.org/cgi-bin/QTLdb/index)

The Animal QTLdb, hosted at Iowa State University's animalgenome.org, collects publicly reported trait-mapping data mapped to livestock genomes, spanning cattle, pig, chicken, sheep, goat, horse, and rainbow trout. It catalogs over 300,000 QTL and trait-association records, alongside GWAS results, candidate genes, and copy-number variations, all keyed to measured traits and genome assemblies. For cellular agriculture, it is the canonical trait-to-locus reference for the muscle-growth, fat-deposition, and meat-quality traits that inform cell-line selection and engineering targets in cultivated meat. Data is browsable per species and downloadable in GFF and tab-delimited formats for programmatic use.

### [Bgee](https://www.bgee.org/)

Bgee is a curated database of gene-expression patterns across multiple animal species, built exclusively from healthy wild-type samples so that expression calls reflect normal physiology rather than disease or perturbation states. It integrates RNA-seq, single-cell RNA-seq, and older expression assays under a consistent annotation and quality pipeline, and is maintained by the SIB Swiss Institute of Bioinformatics and the University of Lausanne. For cellular agriculture, Bgee supports cross-species expression comparison, letting a gene characterized in human or mouse be checked against its expression in bovine, porcine, chicken, or fish tissues so that media components and engineered constructs can be reasoned about across cell-ag species. Programmatic access is available through the Bgee R packages (BgeeDB) and a SPARQL endpoint.

## Cell-Culture Media & Growth-Factor Databases

Media formulation is a central cost and optimization lever in cultivated meat, where serum replacement and growth-factor sourcing dominate production economics. These resources catalogue defined media, serum-free formulations, and the component-level chemistry and interaction data that ML models of media optimization train on.

### [MediaAssist](https://mediaassist.ncl.res.in/)

MediaAssist is a database supporting the design and optimization of cell-culture medium, developed by the Gadgil group at CSIR-National Chemical Laboratory (Pune). It catalogues 39 medium components across sugars, amino acids, vitamins, and trace metals, and for each provides formulation parameters (reported concentrations), chemical properties (solubility, stability), biological parameters (specific uptake rates, nutrient transporters), and 292 curated component co-dependencies affecting growth, viability, stability, product expression, and nutrient transport. For cellular agriculture, MediaAssist is a structured starting point for rational serum-free media design and for building priors into media-optimization ML, filling a gap other databases do not cover ([Gadgil et al. 2025](https://doi.org/10.1093/nar/gkaf982), *Nucleic Acids Research*).

### [FCS-Free Database](https://fcs-free.sites.uu.nl/)

The FCS-Free Database, maintained by the 3Rs Centre Utrecht at Utrecht University, is a searchable overview of commercially available serum-free media and cell-culture supplements plus alternative medium compositions reported in the literature, indexed to the cell types they support. It exists to help researchers phase out Fetal Calf Serum (also called Fetal Bovine Serum), which is harvested from bovine fetuses during slaughter of pregnant cattle. Replacing FBS is one of the central goals of cultivated-meat media development, and this database is the primary lookup for identifying candidate serum-free formulations for a given cell line (RRID: SCR_018769).

### [MediaDive](https://mediadive.dsmz.de/)

MediaDive is DSMZ's cultivation-media database, described as the largest collection of its kind, holding 3,338 culture-media formulations, 5,905 solutions, 1,244 ingredients, and growth data for over 48,000 microbial strains, developed with partners including JCM, CCAP, and NBRC. It provides a medium builder, solution finder, and medium-comparison tools. For cellular agriculture, MediaDive is the reference for microbial and host-organism growth media relevant to precision-fermentation routes to recombinant growth factors and media proteins.

### [MediaDB](https://mediadb.systemsbiology.net/)

MediaDB is a database of chemically-defined growth media maintained by the Price Lab at the Institute for Systems Biology, compiling media formulations from primary literature for fully sequenced organisms, with emphasis on species that have genome-scale metabolic models. It exposes searchable records for compounds, media formulations, organisms, biomass compositions, and growth data. For cellular agriculture, MediaDB is useful for parameterising and reconstructing genome-scale metabolic models of production organisms and for connecting defined-media compositions to organism phenotypes, complementing the GEM resources in the [Datasets/](./Datasets/) directory.

## Protein & Structure Databases

These data sources are helpful for computational tasks related to engineering recombinant growth factors, signaling molecules, and other media components, and for understanding protein-level cell biology.

### [UniProt](https://www.uniprot.org/)

UniProt is the central knowledge base for protein sequence and functional information, jointly maintained by the SIB, EMBL-EBI, and PIR. It comprises SwissProt (manually curated, ~570K entries) and TrEMBL (computationally derived, ~250M entries), with each entry providing sequence, functional annotations, GO terms, post-translational modifications, subcellular localization, cross-references to structure databases, and supporting literature. For cellular agriculture, UniProt is the canonical reference for growth factors, signaling proteins, transcription factors, and metabolic enzymes — including the recombinant FGF2, IGF1, TGF-β, and HGF variants and their orthologs across bovine, porcine, chicken, and fish species used in cultivated-meat media. Programmatic access via the UniProt REST API, SPARQL endpoint, and downloadable XML / FASTA / TSV bulk files.

### [OMA (Orthologous Matrix) Browser](https://omabrowser.org/)

The OMA (Orthologous Matrix) Browser is a curated database of orthologous relationships among genes across thousands of genomes, maintained at ETH Zürich and the SIB, providing pairwise orthologs, OMA Groups, and Hierarchical Orthologous Groups plus Gene Ontology inferences — computed from complete proteomes without a user-supplied reference. For cellular agriculture, OMA is directly useful for cross-species transfer: mapping a characterised human or mouse growth factor, transcription factor, or metabolic enzyme to its orthologs in bovine, porcine, chicken, and fish so that media components and engineered constructs can be ported across cell-ag species. Programmatic access via the OMA REST API, a Python client (`omadb`), and bulk downloads.

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

### [ProteomeXchange](https://www.proteomexchange.org/)

ProteomeXchange is the consortium that coordinates standardised submission and dissemination of mass-spectrometry proteomics data across its member repositories — [PRIDE](#pride) (above), MassIVE, PeptideAtlas, jPOST, iProX, and Panorama Public — assigning each dataset a stable `PXD` accession under a common submission and metadata standard. It is the single entry point for discovering public proteomics datasets regardless of which member repository physically hosts the data. For cellular agriculture, ProteomeXchange is the umbrella index for finding cell-line, tissue, and spent-media proteomics deposits — useful for assembling cross-study training sets for protein-expression ML. Programmatic access via the ProteomeXchange REST API.

## Glycomics & Glycoprotein Databases

Glycosylation governs the activity, stability, and immunogenicity of recombinant growth factors and the cell-surface glycans that mediate cell–cell and cell–scaffold interactions — making glycan-structure and protein-glycosylation databases relevant to media-protein engineering and cultivated-tissue cell biology.

### [GlyGen](https://www.glygen.org/)

GlyGen is an integrated glycoinformatics knowledge base that retrieves, harmonises, and cross-links glycan structures, glycosylation sites, glycoproteins, glycogenes, and glycan-related enzymes from many primary sources into a single queryable resource, developed by a consortium led from the University of Georgia and The George Washington University and funded by the NIH Glycoscience Common Fund. For cellular agriculture, GlyGen is useful for understanding and engineering the glycosylation of recombinant media proteins (growth factors, cytokines) where glycoform affects activity and half-life, and for mapping the glycogene complement of cell-ag species. Programmatic access via the GlyGen API and bulk downloads.

### [GlyTouCan](https://glytoucan.org/)

GlyTouCan is the international glycan structure repository — the registry that assigns globally unique, stable accession numbers to glycan structures regardless of how completely they are characterised, supported by the Japanese glycoinformatics community. It is the canonical identifier authority that downstream glycomics resources (including GlyGen and GlyConnect) reference. For cellular agriculture, GlyTouCan provides the stable glycan identifiers needed to annotate and compare glycoforms of recombinant proteins and cell-surface glycans across datasets. Programmatic access via REST and SPARQL endpoints.

### [GlyConnect](https://glyconnect.expasy.org/)

GlyConnect is the SIB / ExPASy glycoprotein database, linking proteins to their experimentally observed glycosylation sites and the glycan structures attached at each site, integrated with UniProt and GlyTouCan identifiers. For cellular agriculture, GlyConnect is useful for looking up the site-specific glycosylation of growth factors and other media-relevant glycoproteins, informing the design of recombinant variants with controlled glycoforms. Programmatic access via the GlyConnect API.

## Cell Line & Single-Cell Reference Atlases

Resources cataloging cell-line identities, properties, and single-cell expression patterns — central to cell-ag work on cell-line characterization, immortalization, and differentiation.

### [Cellosaurus](https://www.cellosaurus.org/)

Cellosaurus is a knowledge resource on cell lines maintained by the Swiss Institute of Bioinformatics (SIB) as part of the ExPASy infrastructure, cataloging over 170,000 cell lines across human, rodent, bovine, porcine, chicken, fish, and other species. Each entry provides a standardized Cellosaurus identifier (`CVCL_XXXX`), parent / derivative relationships, species of origin, tissue / disease context, donor demographics, known karyotype and STR profiles, authenticity status (notably flagging misidentified or contaminated lines), and cross-references to physical-repository deposits (ATCC, ECACC, RIKEN, JCRB, and others). For cellular agriculture, Cellosaurus is the canonical resource for resolving cell-line identity in published cultivated-meat literature and for sourcing background on bovine satellite cells, immortalized fibroblast lines, fish embryonic stem cell lines, and other species-specific cell lines under active investigation. Data is freely downloadable as flat OBO / TXT files and queryable via a REST API.

### [Human Cell Atlas (HCA)](https://www.humancellatlas.org/)

The Human Cell Atlas is an international consortium effort to construct comprehensive single-cell reference maps of every human cell type, integrating contributions from hundreds of labs across thousands of donors and dozens of tissues. The HCA Data Portal hosts harmonized scRNA-seq, snRNA-seq, scATAC-seq, and spatial transcriptomics datasets with consistent metadata schemas, cell-type ontologies, and processing pipelines, totaling tens of millions of annotated cells. For cellular agriculture, HCA is a primary reference for understanding cellular heterogeneity within target tissues (distinguishing satellite cells from interstitial fibroblasts in skeletal muscle, mapping adipocyte subtypes in white adipose tissue), validating differentiation trajectories in cultivated cells, and benchmarking cell-state engineering interventions against in vivo references. Programmatic access via the HCA Data Portal API and the integrated cellxgene Census.

### [Tabula Sapiens](https://tabula-sapiens-portal.ds.czbiohub.org/)

Tabula Sapiens is a molecular reference atlas of the human body from the Tabula Sapiens Consortium (Chan Zuckerberg Initiative / CZ Biohub) — a multi-organ single-cell transcriptomic map of over 1.1 million cells across 28 organs from 24 donors, processed through one consistent pipeline so cell types are directly comparable across tissues. For cellular agriculture, Tabula Sapiens is a cross-tissue reference for the cell types relevant to cultivated meat (skeletal-muscle satellite cells, adipocytes, fibroblasts, endothelial cells) and a benchmark for single-cell foundation-model evaluation; despite the human focus it transfers to livestock through orthology and cross-species models. Available through the project portal and CZ CELLxGENE.

### [CZ CELLxGENE](https://cellxgene.cziscience.com/)

CZ CELLxGENE is the Chan Zuckerberg Initiative's platform for exploring and analyzing public single-cell data, providing harmonized scRNA-seq and multi-omics datasets aggregated from hundreds of studies (including Human Cell Atlas data) under consistent metadata standards. The CELLxGENE Census provides programmatic access to tens of millions of harmonized cells across human and mouse, exposed through a TileDB-backed Python / R API that supports fast queries by gene, tissue, disease, or assay. For cellular agriculture, cellxgene is the most practical source for assembling cross-study training sets (e.g. all skeletal muscle stem cells in the Census) for ML models of cell-type classification, perturbation prediction, and trajectory inference. Programmatic access via the `cellxgene-census` Python and R packages.

### [scBaseCount](https://github.com/ArcInstitute/arc-virtual-cell-atlas/blob/main/scBaseCount/README.md)

scBaseCount is Arc Institute's AI-agent-curated, uniformly processed, and continuously updated single-cell RNA-seq repository — an agentic pipeline continuously mines public scRNA-seq studies and reprocesses them into a single harmonised count-matrix reference spanning many organisms. For cellular agriculture it is a large, harmonised cross-study source for assembling reference and training sets across species, complementary to CZ CELLxGENE. It is also catalogued as a train-on corpus in [Datasets/HumanReference.md](./Datasets/HumanReference.md#scbasecount); companion to [Papers.md ref #126](./Papers.md#126) (Youngblut et al. 2025).

## Muscle & Functional Gene Sets

These curated muscle gene sets and co-expression resources are the functional-genomics reference layer for cultivated-muscle work: enrichment analysis of satellite-cell and myotube transcriptomes, and lookup of which genes move together during myogenesis.

### [Muscle Gene Sets (sys-myo)](https://www.sys-myo.com/muscle_gene_sets/)

Muscle Gene Sets is a curated collection of roughly 1,517 muscle-related gene sets in GMT format, assembled by the sys-myo group for enrichment analysis in the neuromuscular field ([Malatras et al. 2019](https://doi.org/10.1186/s13395-019-0196-z), *Skeletal Muscle*). For cellular agriculture it is a ready-made reference for testing whether the transcriptome of cultivated bovine or porcine satellite cells, myoblasts, or differentiating myotubes is enriched for myogenic, sarcomeric, or metabolic muscle programs, feeding directly into GSEA / over-representation pipelines that characterize cell-line identity and differentiation state.

### [MyoMiner](https://www.sys-myo.com/myominer/)

MyoMiner is the sys-myo group's muscle gene co-expression explorer, a sibling resource to Muscle Gene Sets that reports pairwise co-expression across large collections of normal and pathological muscle samples ([Malatras et al. 2020](https://doi.org/10.1186/s12920-020-0712-3), *BMC Medical Genomics*). For cultivated-muscle work it helps surface genes co-regulated with known myogenic regulators (MYOD1, PAX7, MYF5), suggesting candidate markers and network partners for characterizing or engineering satellite-cell proliferation and differentiation.

## Cellular Aging & Senescence

Replicative limits, senescence entry, and the senescence-associated secretory phenotype (SASP) are central concerns for cultivated-meat cell lines that must proliferate for many population doublings without transformation. These resources catalogue the genes, transcriptomic panels, secreted factors, and telomerase machinery that define aging and immortalization.

### [Human Ageing Genomic Resources (HAGR)](https://genomics.senescence.info/)

HAGR is a suite of aging and longevity databases (GenAge for ageing-related genes, AnAge for cross-species longevity records, and others) maintained by the de Magalhães group ([Tacutu et al. 2018](https://doi.org/10.1093/nar/gkx1042), *Nucleic Acids Research*). For cellular agriculture, HAGR is a substrate for reasoning about replicative and longevity limits when selecting or engineering cell lines: AnAge's species-level lifespan and cell-turnover records and GenAge's gene sets inform which pathways bound proliferative capacity in bovine, porcine, avian, and fish cells.

### [CellAge](https://genomics.senescence.info/cells/)

CellAge is a curated database of genes associated with cellular senescence, part of the HAGR family, linking each gene to the experimental evidence that it drives or suppresses senescence ([Avelar et al. 2020](https://doi.org/10.1186/s13059-020-01990-9), *Genome Biology*). For cultivated-cell lines it provides a vetted list of senescence-regulating genes to monitor or target when extending proliferative lifespan without resorting to full transformation.

### [SenMayo](https://doi.org/10.1038/s41467-022-32552-1)

SenMayo is a 125-gene transcriptomic panel of senescence and SASP markers, curated to detect senescent cells across tissues and usable across species, distributed as supplementary gene lists and through enrichment libraries ([Saul et al. 2022](https://doi.org/10.1038/s41467-022-32552-1), *Nature Communications*). For cellular agriculture it is a practical scoring signature for flagging senescence burden in cultivated muscle and fat cultures from bulk or single-cell RNA-seq, a readout for comparing media formulations, passage number, or immortalization strategies.

### [CSGene](https://bioinfo-minzhao.org/csgene/)

CSGene is a literature-curated database of roughly 500 cell-senescence genes with their associated pathways and disease links ([Zhao et al. 2016](https://doi.org/10.1038/cddis.2015.414), *Cell Death & Disease*). It is a broader complement to CellAge for cultivated-meat cell-line work, widening the candidate set of senescence regulators to screen when troubleshooting proliferative arrest in long-term cultures.

### [SASP Atlas](https://www.saspatlas.com/)

The SASP Atlas is a proteomic atlas of senescence-associated secretory phenotype factors, cataloguing the proteins that senescent cells release under different senescence inducers ([Basisty et al. 2020](https://doi.org/10.1371/journal.pbio.3000599), *PLOS Biology*; raw data at MassIVE MSV000083468). For cellular agriculture it is a spent-media and secretome reference: the SASP protein catalogue helps interpret conditioned-medium proteomics from aging cultures and distinguish healthy paracrine signaling from senescence-driven secretion that can degrade tissue quality.

### [The Telomerase Database](https://telomerase.us/)

The Telomerase Database compiles telomerase RNA and TERT protein sequences, structures, and mutations across more than 100 eukaryotic species ([Podlevsky et al. 2008](https://doi.org/10.1093/nar/gkm700), *Nucleic Acids Research*). For cultivated-meat cell lines, where controlled telomerase (TERT) reactivation is a common immortalization route, it is the reference for TERT and telomerase-RNA sequence and structure across bovine, porcine, avian, and fish species when designing species-matched immortalization constructs.

## Stemness Signatures

Cultivated meat depends on maintaining and directing stem and progenitor cells (satellite cells, adipogenic progenitors, pluripotent lines). These resources let you test whether a transcriptome carries a stemness signature and compare it against curated stem-cell reference expression.

### [StemChecker](http://stemchecker.sysbiolab.eu/)

StemChecker is a web tool and database for discovering and exploring stemness signatures in gene sets, testing an input list against curated stem-cell gene signatures and transcription-factor targets ([Pinto et al. 2015](https://doi.org/10.1093/nar/gkv529), *Nucleic Acids Research*). For cellular agriculture it offers a quick assessment of whether cultivated satellite cells or induced lines retain a stem/progenitor expression program, useful for tracking loss of stemness across passages or media conditions.

### [StemMapper](http://stemmapper.sysbiolab.eu/)

StemMapper is a curated gene-expression database for stem-cell lineage analysis from the same lab as StemChecker, providing manually curated, quality-controlled transcriptomes across many stem and progenitor cell types ([Pinto et al. 2018](https://doi.org/10.1093/nar/gkx921), *Nucleic Acids Research*). For cultivated-cell work it is a reference panel for benchmarking the expression state of candidate cell lines against established stem and differentiated profiles.

## ECM & Matrisome

Scaffolding and tissue structure in cultivated meat depend on the extracellular matrix (ECM) that cells secrete and remodel. These resources define the matrisome (the full ECM protein complement) and its interaction networks for enrichment analysis and scaffold-biology reasoning.

### [Matrisome gene sets (NABA, MSigDB C2)](https://www.gsea-msigdb.org/gsea/msigdb/)

The NABA matrisome gene sets, hosted in the MSigDB C2 collection, partition the ECM into a core matrisome (collagens, ECM glycoproteins, proteoglycans) and matrisome-associated categories (ECM regulators, secreted factors, ECM-affiliated proteins), following the in-silico matrisome definition of [Naba et al. 2012](https://doi.org/10.1074/mcp.M111.014647) (*Molecular & Cellular Proteomics*). They are the ECM analog of the muscle gene sets above: for cultivated meat they let you run enrichment analysis on scaffolding and ECM-deposition transcriptomes or proteomes to quantify how much matrix a cell line produces and of which type.

### [MatrisomeDB 2.0](https://matrisomedb.org/)

MatrisomeDB is an ECM-protein proteomics knowledge base that aggregates mass-spectrometry evidence for matrisome proteins across many studies, tissues, and disease contexts, with peptide-to-domain mapping and 3D sequence-coverage visualization ([Shao et al. 2023](https://doi.org/10.1093/nar/gkac1009), *Nucleic Acids Research*). Coverage spans human, mouse, and xenograft samples across categories from collagens to secreted factors. For cellular agriculture it is a reference for which ECM proteins are experimentally observed in muscle, fat, cartilage, and other tissues, informing scaffold-composition targets and the interpretation of cultivated-tissue ECM proteomics.

### [MatrixDB](https://matrixdb.univ-lyon1.fr/)

MatrixDB is a database of extracellular-matrix interactions, cataloguing experimentally supported interactions among ECM proteins, proteoglycans, glycosaminoglycans, and their partners, with a Network Explorer for browsing ECM interaction networks ([Samarasinghe et al. 2024](https://doi.org/10.1093/nar/gkae1088), *Nucleic Acids Research*). For cultivated meat it supports graph-based reasoning about ECM assembly and cell-matrix adhesion, relevant to designing scaffolds and predicting how secreted matrix components will self-organize in engineered tissue.

## Codon Usage & Sequence-Design Databases

Codon optimization shapes how well a transgene, recombinant growth factor, or reporter expresses in a chosen host, so per-organism codon-usage statistics and tRNA-gene inventories are direct reference data for construct design in cultivated-cell engineering and precision fermentation.

### [Kazusa Codon Usage Database](https://www.kazusa.or.jp/codon/)

The Kazusa Codon Usage Database, maintained at the Kazusa DNA Research Institute, provides per-organism codon-usage tables computed from GenBank protein-coding sequences, covering more than 35,000 organisms. Its companion Countcodon program computes a usage table from a user-supplied sequence. For cellular agriculture, it is a quick reference for the codon preferences of expression hosts and of the livestock species whose genes are being cloned, informing codon-optimized designs of recombinant media proteins and engineered constructs. Note that the tables derive from an older GenBank flat-file release, so pair it with a continuously updated resource such as CoCoPUTs when current statistics matter.

### [CoCoPUTs (Codon and Codon Pair Usage Tables)](https://dnahive.fda.gov/dna.cgi?cmd=cuts_main)

CoCoPUTs, part of the HIVE-CUTs family hosted by HIVE at the US FDA (from the Kimchi-Sarfaty group), reports the relative usage of both individual codons and codon pairs for every species with sequence data in GenBank and RefSeq, preferring RefSeq assemblies where available, and is regularly updated. Beyond raw tables it provides codon-usage-bias metrics (ENC, ENCP), codon-pair heatmaps, and downloadable data files. For cellular agriculture, it is the current, broad-coverage reference for codon and codon-pair optimization of transgenes and recombinant growth factors in cultivated-cell and fermentation hosts, and a more up-to-date alternative to the Kazusa tables.

### [GtRNAdb (Genomic tRNA Database)](https://gtrnadb.ucsc.edu/)

GtRNAdb, maintained by the Lowe Lab at UC Santa Cruz, catalogs genomic tRNA-gene predictions from tRNAscan-SE across thousands of sequenced genomes spanning bacteria, archaea, and eukaryotes, with searchable, alignable, and downloadable tRNA-gene sets. For cellular agriculture, the tRNA-gene complement of a host genome complements codon-usage tables when reasoning about translational supply for codon-optimized constructs, and helps flag rare-codon liabilities in recombinant-protein designs for cultivated-cell and fermentation systems.

## Plasmid & Reagent Repositories

Shared, quality-controlled plasmid and reagent repositories are the practical supply chain behind cell-line engineering, giving cultivated-meat labs access to the expression vectors, CRISPR tools, and reporters that immortalization and differentiation work depends on.

### [Addgene](https://www.addgene.org/)

Addgene is a nonprofit plasmid repository that distributes research plasmids on behalf of thousands of depositing labs, alongside ready-to-use viral vectors (AAV and lentivirus preparations) and recombinant antibodies, with standardized quality control and full sequence records for each item. For cellular agriculture, Addgene is the canonical source for the CRISPR/Cas systems, expression and reporter vectors, and lineage-reprogramming constructs used to immortalize and engineer livestock cell lines, and its per-plasmid maps and sequences double as a reference for construct design. Materials are requested through the Addgene website with associated depositor and publication metadata.

## Biological & Food Ontologies

Shared ontologies give cell-ag data a consistent, machine-readable vocabulary, so that cell types, food products, and source organisms are annotated with stable identifiers that AI systems and cross-study integrations can rely on rather than free-text labels.

### [FoodOn](https://foodon.org/)

FoodOn is a farm-to-fork food ontology and open member of the OBO Foundry, providing a controlled vocabulary of over 9,600 food-product categories along with source organisms (the animal, plant, and fungal parts that bear a food role), harvest and processing states, and production methods. For cellular agriculture, FoodOn supplies standard terms for describing cultivated products, feedstocks, and ingredient source organisms, supporting FAIR annotation of datasets and interoperability with food-science and regulatory data. It is developed openly on GitHub and exportable in standard ontology formats.

### [Cell Ontology (CL)](https://obophenotype.github.io/cell-ontology/)

The Cell Ontology is an OBO Foundry ontology covering canonical, natural biological cell types, giving each type a stable identifier and structured relationships to related types. For cellular agriculture, CL is the standard vocabulary for annotating the cell types in single-cell datasets of cultivated-relevant lineages (satellite cells, fibroblasts, adipocytes, endothelial cells), so that cross-study and cross-species single-cell references align on cell identity rather than ad hoc labels. It is browsable via the EBI Ontology Lookup Service and downloadable from its GitHub releases.

## Pathways, Metabolism & Metabolic Models

Resources for cell-ag work on media formulation, metabolic engineering, and bioprocess optimization — where understanding metabolic networks, enzyme kinetics, and metabolite concentrations is central.

### [KEGG PATHWAY](https://www.kegg.jp/kegg/pathway.html)

KEGG (Kyoto Encyclopedia of Genes and Genomes) is one of the most widely used pathway databases, maintained by the Kanehisa Laboratory at Kyoto University, providing manually curated maps of >500 reference metabolic, signaling, and disease pathways. KEGG PATHWAY entries link genes, proteins, compounds, and reactions across thousands of organisms, with each pathway available as a structured KGML XML file suitable for ML pipelines that need graph structure. For cellular agriculture, KEGG is the canonical reference for central metabolism (glycolysis, TCA cycle, oxidative phosphorylation, fatty-acid biosynthesis) that drives proliferation in cultivated cells, signaling pathways (Wnt, FGF, IGF, TGF-β) that govern differentiation, and amino-acid biosynthesis pathways relevant to serum-free media design. Programmatic access via the KEGG REST API (free for non-commercial use; commercial licensing applies).

License: Non-commercial

### [Reactome](https://reactome.org/)

Reactome is a free, open-source, curated database of human (and increasingly other species) biological pathways, jointly developed by the Ontario Institute for Cancer Research, EMBL-EBI, and other partners. It models pathways as hierarchically organized reactions with explicit participants, modifiers, and regulatory relationships, supporting pathway enrichment analysis and integration with expression data. For cellular agriculture, Reactome's strengths are its detailed signaling-pathway annotations (myogenic regulatory factor cascades, FGF / IGF / Wnt signaling) and its open data model — entries are freely downloadable as BioPAX, SBML, SBGN, and tab-delimited formats, enabling unrestricted use in ML pipelines without the commercial licensing constraints of KEGG. Programmatic access via the Reactome ContentService REST API and a Cypher-queryable Neo4j graph database.

### [WikiPathways](https://www.wikipathways.org/)

WikiPathways is a community-curated database of biological pathways under an open data model (CC0 license), hosted by Maastricht University and the Gladstone Institutes, providing >3,000 curated pathways across human, mouse, and a range of other species. Pathways are stored in GPML (a custom XML format) but exported in BioPAX, SBML, and other standards; the open editorial model means coverage is broader and more uneven than KEGG / Reactome but includes useful cell-ag-adjacent pathways (myogenesis, adipogenesis, livestock-specific metabolism). Programmatic access via a Web Service API, the `rWikiPathways` R package, and a Cytoscape app for direct pathway import.

License: CC0-1.0

### [PathBank](https://pathbank.org/)

PathBank is the Wishart lab's comprehensive, visual database of metabolic, signaling, drug, and disease pathways across model organisms, providing more than 600,000 machine-readable pathways — one of the largest pathway collections available — with labeled metabolites, proteins, and reactions, and downloads available in several machine-readable formats. For cellular agriculture, PathBank complements KEGG and Reactome with broad, exportable mammalian pathway coverage for the metabolic and signaling context of media supplements and differentiation, and integrates with the Wishart lab's HMDB / SMPDB / BMDB resources already catalogued here. Free open access.

### [Human Metabolome Database (HMDB)](https://hmdb.ca/)

HMDB is a freely available, comprehensive database of human metabolites and their associated biological roles, maintained by the Wishart Lab at the University of Alberta. It contains >220,000 entries spanning endogenous metabolites, drugs, food components, and environmental compounds, with each entry providing chemical / physical properties, biofluid concentrations, biological functions, metabolic-pathway memberships, and analytical detection methods. For cellular agriculture, HMDB is useful for understanding native human metabolite ranges that cultivated cells should produce or consume, identifying candidate small molecules for media supplementation, and as a substrate for ML predicting metabolic responses to media changes. Programmatic access via downloadable XML and SDF files and a REST API for selected queries.

### [Bovine Metabolome Database (BMDB)](https://www.bovinedb.ca/)

BMDB is a comprehensive resource of metabolites found in beef cattle (*Bos taurus*), maintained by the Wishart Lab at the University of Alberta — the same group that hosts HMDB, FooDB, and DrugBank, providing consistent schema and analytical methodology across all four resources. It catalogs tens of thousands of entries describing endogenous metabolites, dietary nutrients, and exogenous compounds detected in bovine biofluids (serum, milk, urine) and tissues (muscle, liver, adipose), with each entry providing chemical / physical properties, biofluid concentrations, biological roles, pathway memberships, and analytical methods of detection. For cultivated beef development, BMDB is the closest available reference for serum metabolite profiles, muscle and adipose tissue metabolomes, and feedstock-derived compound landscapes — directly relevant to serum-free media formulation, growth medium optimization, and flavor-precursor identification in cultivated meat products.

### [BRENDA](https://www.brenda-enzymes.org/)

BRENDA (BRaunschweig ENzyme DAtabase) is the most comprehensive collection of enzyme information available, maintained at the Technische Universität Braunschweig, covering >90,000 enzyme entries with detailed kinetic parameters, substrate specificities, inhibitors, optimal reaction conditions, and reaction mechanisms aggregated from primary literature. Each entry provides Km, Vmax, Kcat, Ki, optimal pH and temperature, organism-specific variations, and links to associated metabolic pathways. For cellular agriculture, BRENDA is the canonical source of enzyme kinetic data needed for kinetic models of cell metabolism, flux-balance analysis of metabolic engineering interventions, and ML models predicting media component effects on metabolic flux. Programmatic access via the BRENDA SOAP API and downloadable text files for academic use.

### [SABIO-RK](https://sabio.h-its.org/)

SABIO-RK (System for the Analysis of Biochemical Pathways – Reaction Kinetics) is a curated database of biochemical reactions and their kinetic data, maintained at HITS (Heidelberg), providing reaction-level rate laws, kinetic parameters (Km, kcat, Vmax, Ki), and the experimental conditions under which they were measured, with each entry traceable to its primary publication. It complements [BRENDA](#brenda)'s enzyme-centric kinetics with a reaction- and rate-law-centric view suited to building kinetic models. For cellular agriculture, SABIO-RK supplies the rate laws and parameters needed to parameterise kinetic / dynamic metabolic models of cultivated-cell metabolism and bioprocess behaviour. Programmatic access via the SABIO-RK REST API.

### [SMPDB (Small Molecule Pathway Database)](https://smpdb.ca/)

SMPDB is the Wishart lab's curated database of small-molecule pathways, with over 600 interactive visual pathway maps spanning human metabolism, signaling, drug action, disease processes, and physiological functions. Each pathway entry provides labeled compounds, enzymes, transporters, and reactions in a custom interactive viewer, with links to HMDB / DrugBank / UniProt cross-references. For cellular agriculture, SMPDB serves as a visualization-rich complement to KEGG and Reactome for understanding the metabolic context of media supplements, growth factors, and signaling pathways relevant to cultivated cells. Free open access; data exportable as SBML, BioPAX, KGML, and PWML.

### [BioCyc / MetaCyc](https://biocyc.org/)

BioCyc is an SRI International–maintained collection of >20,000 organism-specific Pathway / Genome Databases (PGDBs), built on the MetaCyc reference pathway database. MetaCyc itself catalogs >3,000 experimentally elucidated metabolic pathways across all domains of life, with >18,000 reactions and >19,000 metabolites; BioCyc PGDBs extend this to specific organisms with computationally predicted pathways. For cellular agriculture, BioCyc is the canonical reference for non-mammalian metabolism — particularly the yeast and bacterial PGDBs used in precision-fermentation alt-protein work, and emerging livestock-species PGDBs that complement species-specific GEMs. MetaCyc is freely accessible at <https://metacyc.org/>; BioCyc has tiered access with substantial free use plus subscription-based bulk download.

### [BiGG Models](http://bigg.ucsd.edu/)

Summary: A repository of >75 manually curated, BiGG-standardized genome-scale metabolic models covering bacteria, archaea, fungi, and several eukaryotes, hosted at UCSD (Palsson lab). Each model is provided in SBML, MATLAB `.mat`, and JSON formats, with standardized reaction / metabolite IDs (BiGG nomenclature) that cross-link to MetaNetX, KEGG, and ChEBI. The canonical starting point for any constraint-based modeling work ([King et al. 2016](https://doi.org/10.1093/nar/gkv1049), *Nucleic Acids Research*).

### [MetaNetX / MNXref](https://www.metanetx.org/)

MetaNetX is a repository and reconciliation layer for genome-scale metabolic models and biochemical reaction networks, maintained at the SIB, whose MNXref namespace maps and cross-links metabolite and reaction identifiers across BiGG, KEGG, ChEBI, MetaCyc, Reactome, and other resources into a unified nomenclature. It does not provide enzyme kinetic parameters; its value is automated identifier reconciliation and model comparison / curation. For cellular agriculture, MetaNetX is the connective tissue for curating and merging the cell-ag livestock GEMs catalogued in the [Datasets/](./Datasets/) directory, resolving the namespace mismatches that block model integration. Programmatic access via the MetaNetX API and bulk downloads.

### [BioModels](https://www.ebi.ac.uk/biomodels/)

Summary: A free, open-source repository of mathematical models of biological and biomedical systems, hosted by EMBL-EBI, containing thousands of curated SBML models spanning metabolism, signaling, cell-cycle, immunology, and pharmacokinetics. Models are versioned, peer-reviewed via the Curation Service, and accessible programmatically via a REST API. Endorsed companion to the Talk2Biomodels agent ([Papers.md ref #50](./Papers.md#50)).

### [Rhea](https://www.rhea-db.org/)

Rhea is an expert-curated database of biochemical reactions maintained at the SIB, describing reactions with chemically balanced participants defined against the ChEBI ontology and cross-linked to UniProt enzymes. It is a reference reaction set used in genome-scale metabolic-model reconstruction and enzyme annotation. For cellular agriculture, Rhea supplies the curated reaction definitions needed to build and check GEMs of cultivated-cell metabolism and to connect media metabolites to the enzymes that transform them. Programmatic access via REST and SPARQL endpoints and bulk downloads.

### [Virtual Metabolic Human (VMH)](https://www.vmh.life/)

VMH integrates human metabolism, gut-microbial metabolism, nutrition, and disease into a single queryable resource, hosting the Recon human metabolic reconstructions, the AGORA microbiome models, and a database of food-derived metabolites. For cellular agriculture, VMH is useful for reasoning about human-relevant metabolic capacities and for sourcing food-metabolite and nutrition data when designing or benchmarking media formulations. Programmatic access via a REST API and bulk downloads.

### [Metabolomics Workbench](https://www.metabolomicsworkbench.org/)

The Metabolomics Workbench is the NIH Common Fund's metabolomics data repository and analysis platform, hosting thousands of deposited studies with raw and processed MS / NMR data plus the integrated Metabolite Database and RefMet reference nomenclature. For cellular agriculture, it is both a source of training and comparison data for spent-media and tissue metabolomics and a standardized-naming reference (RefMet) for harmonizing metabolite identifiers across studies. Programmatic access via the REST API.

## Mass Spectrometry Spectral Databases

Reference spectral data resources for compound identification in mass-spectrometry workflows — essential analytical infrastructure for flavor metabolomics, off-flavor characterization, and spent-media analysis in cultivated meat. Pair these databases with the MS preprocessing / annotation tools in [Software.md / Mass Spectrometry & Chemometrics](./Software.md#mass-spectrometry--chemometrics).

### [MassBank](https://massbank.eu/)

MassBank is the world's first open-access mass-spectrometry spectral database, hosted as a federation of European, Japanese, and US instances with >400,000 spectra contributed by >50 institutions. Each entry provides the recorded mass spectrum, instrumental parameters, fragmentation conditions, and the precursor compound identity (InChI, SMILES, structure). For cellular agriculture, MassBank is foundational reference data for identifying volatile and non-volatile metabolites in cultivated tissues, characterizing off-flavors, and analyzing spent media — particularly when paired with MS-DIAL, MZmine 3, or SIRIUS for automated annotation. Programmatic access via REST API; bulk records available via Git.

### [NIST Chemistry WebBook](https://webbook.nist.gov/chemistry/)

The US National Institute of Standards and Technology's reference compendium of chemistry data, covering >100,000 compounds with thermochemical data (heats of formation, enthalpies), gas chromatography retention indices, mass spectra, infrared / UV / NMR spectra, and ion energetics. For cellular agriculture, the NIST WebBook is the canonical reference for confirming media component identity via spectroscopic comparison (matching unknown GC-MS peaks against the NIST EI library is standard practice) and for thermodynamic calculations in metabolic engineering. Free open-web access; the bundled NIST 23 EI library (commercial) is the industry-standard companion for GC-MS workflows.

### [MetaboLights](https://www.ebi.ac.uk/metabolights/)

MetaboLights is a public open-access repository for metabolomics experiments hosted at EMBL-EBI — the metabolomics analog of GEO (transcriptomics) or PRIDE (proteomics). Each study deposit includes raw MS / NMR data, processed datasets, sample / treatment metadata in ISA-Tab format, and standardized study-protocol annotations. For cellular agriculture, MetaboLights hosts experiments directly relevant to flavor metabolomics, fermentation chemistry, and cell-culture spent-media analysis — a primary source of training data for sensory-prediction ML and benchmark datasets for analytical pipeline validation. Programmatic access via REST API; bulk download via FTP.

### [GNPS](https://gnps.ucsd.edu/) (cross-listed)

The Global Natural Products Social Molecular Networking platform from the Dorrestein lab at UCSD provides community-curated MS/MS reference spectral libraries — the database aspect listed here — alongside Feature-Based Molecular Networking, Ion Identity Molecular Networking, and analog-search tooling, which together make it primarily an analysis platform. Full entry and platform-level capabilities are in [Software.md / Mass Spectrometry & Chemometrics](./Software.md#gnps); this dual-listing surfaces it as a spectral database for readers browsing Databases.md.

### [MoNA (MassBank of North America)](https://mona.fiehnlab.ucdavis.edu/)

MoNA is an open, metadata-rich repository of mass spectra hosted by the Fiehn Lab at UC Davis, aggregating experimental and in-silico EI, LC-MS/MS, and GC-MS spectra (millions of records) with structures and searchable metadata. It complements the federated [MassBank](#massbank) project as a large, freely downloadable North American contribution hub. For cellular agriculture, MoNA is reference data for annotating volatiles and metabolites in cultivated tissues and spent media, pairing well with MS-DIAL and other Fiehn-Lab tooling. Programmatic access via REST API and bulk downloads.

### [METLIN](https://metlin.scripps.edu/)

METLIN is a large metabolite and small-molecule MS/MS reference library developed at Scripps Research (Siuzdak lab), providing experimental fragmentation spectra across multiple collision energies and adducts for a large set of molecular standards. For cellular agriculture, METLIN supports confident identification of metabolites and flavor-relevant small molecules in untargeted metabolomics of cultivated cells and media. Access requires free registration.

### [SDBS (Spectral Database for Organic Compounds)](https://sdbs.db.aist.go.jp/)

SDBS is a free spectral database of organic compounds maintained by Japan's National Institute of Advanced Industrial Science and Technology (AIST), providing EI mass spectra, 1H / 13C NMR, IR, Raman, and ESR spectra for tens of thousands of compounds. For cellular agriculture, SDBS is a cross-technique reference for confirming the identity of media components, flavor compounds, and metabolites when matching experimental spectra. Free interactive web access.

### [SpectraBase](https://spectrabase.com/)

SpectraBase is a free spectral repository from Wiley that aggregates hundreds of thousands of IR, NMR, mass, UV-Vis, and Raman spectra with structure and text search. For cellular agriculture, SpectraBase is a convenient fallback reference for spectral identification of flavor precursors, media additives, and metabolites not covered by the domain-specific libraries above. Free web access.

### [Raman Open Database](https://solsa.crystallography.net/rod/)

The Raman Open Database is an open-access collection of Raman spectra built on the Crystallography Open Database infrastructure, distributing raw spectra with structural and provenance metadata under open licenses. For cellular agriculture, it is a reference for Raman-based process analytics, where inline Raman spectroscopy is used to monitor nutrients, metabolites, and cell state in bioreactors. Bulk and programmatic access via the COD-style download interfaces.

### [Golm Metabolome Database (GMD)](http://gmd.mpimp-golm.mpg.de/)

GMD, maintained at the Max Planck Institute of Molecular Plant Physiology, is a reference resource for GC-MS-based metabolite profiling, providing EI mass spectra and retention-index information for metabolites and their trimethylsilyl derivatives. It complements the LC-MS-weighted libraries above with the GC-MS reference data central to volatile and derivatized-metabolite workflows. For cellular agriculture, GMD supports identification of primary metabolites and flavor-relevant volatiles in GC-MS analyses of cultivated tissues and spent media ([Kopka et al. 2005](https://doi.org/10.1093/bioinformatics/bti236), *Bioinformatics*).

## Chemistry & Compound Databases

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

### [COCONUT (COlleCtion of Open Natural prodUcTs)](https://coconut.naturalproducts.net/)

COCONUT is one of the largest open, aggregated collections of natural-product structures, unifying entries from dozens of source databases into a single de-replicated, freely downloadable resource with structures, predicted properties, and source provenance. For cellular agriculture, COCONUT is a reference for plant- and microbial-derived flavor, aroma, and bioactive compounds that appear as media components or flavor precursors. Free web access, REST API, and bulk downloads.

## Flavor & Taste Compound Databases

Curated databases of flavor molecules, taste-active compounds, and odor descriptors — the analytical reference layer for sensomics work on cultivated meat, alt-protein flavor optimization, and any cell-ag effort that needs to map detected volatiles to known organoleptic properties.

### [FlavorDB / FlavorDB2](https://cosylab.iiitd.edu.in/flavordb/)

FlavorDB is a comprehensive database of flavor molecules developed by the Complex Systems Lab at IIIT-Delhi (Bagler group). The original release ([Garg et al. 2018](https://doi.org/10.1093/nar/gkx957), *Nucleic Acids Research*) catalogued 25,595 flavor molecules across 936 ingredients, integrating data from FooDB, BitterDB, SuperSweet, and Flavornet. FlavorDB2 ([Goel et al. 2024](https://doi.org/10.1111/1750-3841.17298), *Journal of Food Science*) extends coverage with regulatory status, consumption statistics, taste/aroma threshold values, reported food uses, and synthesis pathways. For cellular agriculture, FlavorDB2 is a key reference for connecting volatile compounds detected in cultivated tissues (e.g., GC-MS of cultivated pork fat or salmonid muscle) to known flavor characteristics, organoleptic thresholds, and food applications.

### [BitterDB](https://bitterdb.agri.huji.ac.il/)

BitterDB is a curated database of bitter compounds and bitter taste receptors (T2Rs), maintained at the Hebrew University of Jerusalem (Niv group). Contains hundreds of compounds with chemical properties, sources, and human T2R-binding data; companion tools (BitterPredict, BitterMatch, BitterMasS) leverage the data for predictive modeling. For cellular agriculture and alt-protein work, BitterDB is essential for identifying and predicting bitter off-flavors — a primary sensory barrier in plant-based protein products and a potential concern in cultivated tissues with elevated metabolite content.

Canonical references: [Papers.md #99](./Papers.md#99) (Wiener et al. 2012, *NAR*) for the original release; [Papers.md #100](./Papers.md#100) (Dagan-Wiener et al. 2019, *NAR*) for the 2019 update; [Papers.md #101](./Papers.md#101) (Ziaikin et al. 2025, *NAR*) for the 2024 update. Related ML / analytical papers from the same group are in matrix [refs #102](./Papers.md#102), [#103](./Papers.md#103), [#104](./Papers.md#104), [#105](./Papers.md#105) and Sensory & Flavor Reference Work [ref #106](./Papers.md#106).

### [Pherobase](https://www.pherobase.com/)

A comprehensive database of insect and animal pheromones, semiochemicals, and other behaviorally active compounds, maintained by Ashraf El-Sayed. Contains tens of thousands of compounds with biological activity, taxonomic distribution, and analytical data (GC retention indices, mass spectra). For cellular agriculture, Pherobase has indirect but useful relevance — many flavor-active compounds in meat / dairy / fish are downstream of pheromonal or species-specific biochemistry, and the database serves as a reference for distinguishing odor compounds that evolved for animal-animal signaling versus those that drive food-grade flavor perception.

### [Flavornet](https://www.flavornet.org/)

Flavornet, maintained at Cornell by Acree and Arn, is a database of GC olfactometry (GC-O) results — compound identities keyed to Kováts retention indices on standard GC columns plus consensus odor descriptors from sensory panels. The original open-access reference for matching sniff-port observations to molecular identities in GC-O work. For cellular agriculture, Flavornet is the canonical lookup table for connecting volatile compounds detected in cultivated tissues, fermented alt-protein products, and spent media to their human-perceived odor profiles.

### [The Good Scents Company](https://www.thegoodscentscompany.com/)

A long-established industry reference platform for the flavor, fragrance, food, and cosmetics industries, providing odor descriptors, organoleptic properties, regulatory status, and supplier information for thousands of aroma chemicals and natural extracts. While maintained by the F&F industry rather than as an academic resource, GoodScents is widely cross-referenced in flavor research papers and is the de-facto industry-standard descriptor source for many compounds not formally characterized in academic odor-threshold compendia.

### [FooDB](https://foodb.ca/)

FooDB is a large open database of food constituents, chemistry, and biology — covering both macronutrients and the thousands of micro-constituents (flavor and aroma compounds among them) found in foods, with chemical, taxonomic, and concentration data. It is one of the upstream sources integrated into [FlavorDB](#flavordb--flavordb2). For cellular agriculture, FooDB is a reference for the compound composition of conventional foods — a comparison baseline when characterizing the metabolite and flavor profile of cultivated tissues and alt-protein products.

### [ChemTastesDB](https://doi.org/10.5281/zenodo.5747393)

ChemTastesDB is a curated, machine-learning-ready database of 2,944 organic and inorganic tastants labeled across nine taste classes (the five basic tastes plus non-sweet, tasteless, multitaste, and miscellaneous), distributed openly on Zenodo with molecular structures and chemical identifiers ([Rojas et al. 2022](https://doi.org/10.1016/j.fochms.2022.100090), *Food Chemistry: Molecular Sciences*). For cellular agriculture, it is a labeled training set for taste-classification models that flag sweet, bitter, or umami character in compounds detected in cultivated tissues and alt-protein formulations.

### [VCF (Volatile Compounds in Food)](https://www.vcf-online.nl/)

VCF is a specialized database of volatile compounds identified in foods, cataloging roughly 10,000 volatiles across hundreds of food products including meat, poultry, and seafood, with occurrence data drawn from the analytical literature. For cellular agriculture, VCF is a targeted reference for mapping volatiles detected in cultivated meat and seafood to their known occurrence in conventional counterparts. Full access is licensed (subscription/paid); the public site documents coverage and access terms.

License: Proprietary

### [OlfactionBase](https://olfactionbase.com/)

OlfactionBase is a curated repository of odors, odorants and odorless compounds, olfactory receptors, and odorant-receptor interactions across human and mouse, integrating physicochemical and ADMET properties with receptor and odorant-binding-protein data ([Sharma et al. 2022](https://doi.org/10.1093/nar/gkab763), *Nucleic Acids Research*). For cellular agriculture, it links aroma-active compounds detected in cultivated tissues to the receptors and perceptual descriptors that govern how they are smelled, complementing GC-olfactometry references like Flavornet.

### [UmamiMeta](https://hwwlab.com/Webserver/umamimeta)

UmamiMeta is a web server that predicts whether a peptide is umami directly from its amino-acid sequence, using a protein-language-model classifier trained on a large curated set of umami and non-umami peptides, and reports predicted binding to umami taste receptors. For cellular agriculture it offers a fast sequence-to-taste screen for candidate flavor peptides, such as those released by proteolysis of cultured-muscle or scaffold proteins, when designing the savory profile of cultivated-meat products. Companion to [Papers.md ref #267](Papers.md#267) (He et al. 2025).

## Lipidomics Databases

Intramuscular fat and lipid profile shape cultivated-meat flavor and texture, so lipid identity and nomenclature need a consistent reference layer. These resources standardize lipid structures and the classification/shorthand naming that lipidomics workflows depend on.

### [LIPID MAPS](https://www.lipidmaps.org/)

LIPID MAPS is the reference lipidomics resource maintained by an international consortium, pairing the LIPID MAPS Structure Database (LMSD) of curated lipid structures with the community lipid classification and shorthand-nomenclature standard that most lipidomics software follows. For cellular agriculture, LIPID MAPS is the canonical reference for identifying and naming the fatty acids, triacylglycerols, and phospholipids that define intramuscular-fat composition, mouthfeel, and lipid-derived flavor precursors in cultivated meat. Programmatic access via the LIPID MAPS REST API and bulk structure downloads.

### [SwissLipids](https://www.swisslipids.org/)

SwissLipids is an SIB-maintained knowledge resource of curated lipid structures organized in a hierarchical classification, each cross-linked to biological context through Rhea reactions, UniProt enzymes, and literature evidence. For cellular agriculture, SwissLipids connects the lipid species in a cultivated-cell or tissue profile to the enzymes and reactions that produce them, supporting metabolic reasoning about fat deposition and lipid-pathway engineering. Programmatic access via a REST API and bulk downloads.

### [LipidBank](https://lipidbank.jp/)

LipidBank is the Japanese Conference on the Biochemistry of Lipids' open database of natural lipids, cataloging thousands of entries across fatty acids, glycerolipids, sphingolipids, steroids, and related classes with structures, spectral data, and literature references. For cellular agriculture, LipidBank is a complementary lookup for lipid identity and properties alongside LIPID MAPS and SwissLipids. It is a long-standing resource that remains reachable but is updated infrequently.

## Seafood Species Reference Databases

Open-access databases for cataloguing seafood species' biological and culinary characteristics, surfaced by [GFI's alternative-seafood data initiative](https://gfi.org/resource/aggregating-data-for-alternative-seafood/). For cellular agriculture these are direct reference data for the cultivated-seafood sub-domain — complementary to the SALARECON salmon GEM in [Datasets/Fish.md](./Datasets/Fish.md#salarecon--salmo-salar-atlantic-salmon).

### [PISCES — Phylogenetic Index of Seafood CharactEriStics](https://gfi.org/resource/aggregating-data-for-alternative-seafood/)

PISCES organizes seafood data by phylogenetic relationships, grouping species taxonomically — *Salmo salar* (Atlantic salmon) and *Salmo trutta* (sea trout) sit together under genus *Salmo*. Each species entry compiles cell-line availability, nutritional data, and volatile compounds relevant to cultivated- and plant-based-seafood development. Distributed as an AirTable base linked from the GFI landing page. The canonical taxonomic reference for cultivated-seafood candidate species. Companion to [ATLAS](#atlas--archetype-library-for-alternative-seafood) below, which groups the same species by culinary archetype rather than phylogeny.

### [ATLAS — ArcheType Library for Alternative Seafood](https://gfi.org/resource/aggregating-data-for-alternative-seafood/)

ATLAS groups seafood species into culinary archetypes — *Salmo salar* under "salmon" and *Salmo trutta* under "trout" — and ranks archetypes across sustainability, animal-welfare, public-health, and US-market-size metrics to help prioritize candidate species for alternative-seafood development. Accessed via the GFI landing page, with a ranking tool hosted on mybinder.org. The species-prioritization complement to [PISCES](#pisces--phylogenetic-index-of-seafood-characteristics)'s taxonomic indexing.

## Literature & Bibliographic Databases

Free open-access search platforms for agricultural research literature — useful for cellular agriculture as context resources covering animal nutrition, feed-stream economics, livestock genetics, food technology regulation, and broader agricultural science that intersects with cell-ag at the technology / commercial / regulatory boundary.

### [AGRIS (FAO)](https://agris.fao.org/)

AGRIS is the United Nations Food and Agriculture Organization's global agricultural research index, providing access to over 12 million bibliographic records covering food, agriculture, environment, and rural development since 1970. Each record includes title, authors, abstract, subject keywords (drawn from the multilingual AGROVOC ontology), and full-text links where available. For cellular agriculture, AGRIS is the most comprehensive free index for international agricultural research — useful for feed formulation, plant-based media components, livestock nutrition, and crop-genomics work that intersects with cell-ag.

### [USDA National Agricultural Library Search](https://search.nal.usda.gov/)

The National Agricultural Library Search is the USDA's federated search platform across its digital collections, including PubAg (agricultural research literature), the NAL Catalog, and other USDA-curated resources. For cellular agriculture, NAL Search is the canonical entry point for USDA-funded research on animal nutrition, feed efficiency, livestock genetics, food technology, and food safety — relevant context for cultivated-meat scaling economics, regulatory engagement, and feed-stream cost analysis. Free open access; AGRICOLA-derived records are included alongside open-access NAL collections.

### [GFI Alternative Protein Literature Library](https://gfi.org/resource/alternative-protein-literature-library/)

GFI's curated collection of alternative-protein research resources spanning plant-based, cultivated, and fermentation-derived proteins, maintained by its science and technology team. GFI's nearest analogue to CAAIL's own curation, though not AI-scoped or version-controlled.

## Database Directories & Reference Guides

Meta-resources — catalogues of databases and curated library guides — that index the broader data landscape. Useful as starting points for locating biological, chemical, and food-science resources beyond those curated here.

### [Wikipedia: List of biological databases](https://en.wikipedia.org/wiki/List_of_biological_databases)

A community-maintained index of biological databases, grouped by type — meta-databases, model-organism, nucleic-acid, protein, pathway, taxonomic, and more. A broad navigation layer for biological data resources beyond those catalogued here.

### [Wikipedia: List of chemical databases](https://en.wikipedia.org/wiki/List_of_chemical_databases)

A community-maintained list of websites and databases of chemical information. Complements the [Chemistry & Compound Databases](#chemistry--compound-databases) section above as a broader navigation layer for chemistry data resources.

### [UArk Food Science Research Guide](https://libguides.uark.edu/FoodScience/Databases)

The University of Arkansas Libraries' research guide for food science, listing relevant databases, journals, and statistical resources — a curated entry point into food-science literature and data infrastructure.

## Regulatory & Food-Safety Databases

Cultivated-meat and cell-ag products move through novel-food, GRAS, and premarket-consultation review before reaching market. These are the primary regulatory-status lookups for tracking which products, ingredients, and substances have cleared review in the US and EU.

### [FDA GRAS Notice Inventory](https://www.hfpappexternal.fda.gov/scripts/fdcc/index.cfm?set=GRASNotices)

The FDA's Generally Recognized As Safe (GRAS) Notice Inventory lists substances for which a notifier has submitted a GRAS conclusion to the FDA, along with the agency's response letter for each. For cellular agriculture, it is the lookup for confirming the regulatory standing of media components, enzymes, and other ingredients used in cultivated-meat production, and for finding precedent GRAS notices when preparing a submission.

### [FDA Inventory of Completed Pre-market Consultations for Human Food Made with Cultured Animal Cells](https://www.hfpappexternal.fda.gov/scripts/fdcc/index.cfm?set=animalcellculturefoods)

This FDA inventory lists every cultured-animal-cell food that has completed a pre-market consultation with the agency, giving each a Cell Culture Consultation (CCC) file number and publishing the product description, the sponsor's safety submission, the FDA's response letter, and the agency's scientific memo. It is the authoritative US record of which cultivated-meat products have cleared FDA pre-market review, directly relevant to anyone tracking the regulatory pathway or benchmarking a product's approval status.

### [EU Novel Food](https://food.ec.europa.eu/food-safety/novel-food_en)

The European Commission's Novel Food pages host the regulatory framework and the searchable Union list of authorised novel foods, plus the Novel Food Catalogue indicating the status of foods and ingredients under Regulation (EU) 2015/2283. Cultivated meat and many cell-ag-derived ingredients fall under the novel-food regime in the EU, so this is the primary reference for whether a given product or ingredient is authorised, pending, or requires an application in the European market.

### [FDA Substances Added to Food](https://www.hfpappexternal.fda.gov/scripts/fdcc/index.cfm?set=FoodSubstances)

The FDA's Substances Added to Food inventory (formerly EAFUS) is a searchable list of substances added to food in the United States, recording each substance's regulatory basis (food additive, GRAS, prior-sanctioned, and related categories) and used-for information. For cellular agriculture, it is a fast lookup for the US regulatory status and permitted uses of media ingredients, processing aids, and additives that may appear in a cultivated-meat product or its production process.

### [EFSA OpenFoodTox](https://www.efsa.europa.eu/en/data-report/chemical-hazards-database-openfoodtox)

OpenFoodTox is EFSA's open chemical-hazards database, providing structured summaries of hazard-assessment data for individual substances drawn from EFSA's risk assessments, covering food additives and flavourings, pesticides, contaminants, food-contact materials, feed additives, and nutrients. For cellular agriculture, OpenFoodTox is a reference for the toxicological reference points (health-based guidance values, points of departure) of media components and potential process-derived substances, useful when assembling the safety dossier for an EU novel-food or feed submission.

## Ecosystem & Industry Directories

GFI's curated public directories cataloguing the people, companies, supply chain, opportunities, and regulatory status of the alternative-protein and cellular-agriculture field. These are the "domain neighbours" of CAAIL — they catalogue *who is doing the work and where it is being sold*, complementary to CAAIL's catalogue of papers, software, datasets, and educational material. New Harvest's initiatives covering the same space are not databases or directories: the funding programs (AICAI, the Cellular Agriculture Science Engine) live in [Funding & Grants](./Funding.md), and the convening Cultured Meat Safety Initiative lives in [OtherResources.md / Cell-Ag Ecosystem Initiatives](./OtherResources.md#cell-ag-ecosystem-initiatives) instead. Two non-GFI additions sit alongside the GFI directories: Pando, a commercial *in vitro* plant knowledge base from Foray Bioscience (plant-side cell-ag), and the Food Systems Dashboard (last entry), a macro food-systems data resource that situates cultivated-meat and alt-protein work in its broader dietary and policy context.

### [GFI Alternative Protein Researcher Directory](https://gfi.org/resource/alternative-protein-researcher-directory/)

GFI's global directory of researchers working on plant-based meat, cultivated meat, and fermentation. Complementary to CAAIL: GFI catalogues *people and labs*, CAAIL catalogues their *outputs*.

### [GFI Alternative Protein Company Database](https://gfi.org/resource/alternative-protein-company-database/)

GFI's catalogue of alternative-protein companies, including funding status and impact-investment context — the industry-side map of the field.

### [GFI APAC Alternative Protein Ecosystem Database](https://gfi-apac.org/industry/alternative-protein-ecosystem-database/)

GFI APAC's regional B2B directory of ingredient and equipment suppliers, pilot plants, consultants, and other supply-chain partners across the Asia-Pacific cell-ag ecosystem.

### [GFI Database of Solutions for the Alternative Protein Industry](https://gfi.org/solutions/)

GFI's catalogue of startup ideas, commercial opportunities, research projects, and investment priorities across the alternative-protein supply chain.

### [GFI Where Cultivated Meat Can Be Sold](https://gfi.org/resource/where-cultivated-meat-can-be-sold/)

GFI's live tracker of countries where cultivated meat has regulatory approval for sale, with associated companies and product formats — the kind of dynamic regulatory data CAAIL links to rather than duplicates.

### [Pando (Foray Bioscience)](https://pando.foraybio.com/)

An AI research workspace and searchable *in vitro* plant knowledge base from Foray Bioscience, a company growing plant products and "seeds" from cells. Pando lets plant scientists search and reason over what Foray describes as the largest *in vitro* plant (tissue-culture and micropropagation) knowledge base, supporting plant-side cell-culture R&D — the plant counterpart to the animal-cell-culture resources that dominate CAAIL. Commercial (freemium, with a free tier alongside paid plans) and recently launched (2026); it is a proprietary platform rather than an open public scientific repository, so it is catalogued here as an industry knowledge resource.

### [Food Systems Dashboard](https://www.foodsystemsdashboard.org/)

A web-based tool from the Global Alliance for Improved Nutrition (GAIN), Johns Hopkins University, Cornell University, and the FAO that compiles and visualizes national- and subnational-level food-systems data to inform food policy (introduced by Fanzo et al. 2020, *Nature Food*, [10.1038/s43016-020-0077-y](https://doi.org/10.1038/s43016-020-0077-y)). Organized around three pillars — *Describe, Diagnose, Decide* — it brings together over 300 indicators from 50+ public and private sources (UN agencies, the World Bank, CGIAR, Euromonitor) spanning agricultural production, food availability and affordability, diets and nutrition, livelihoods, climate, environment, resilience, and governance, plus the external drivers shaping them; the Diagnose view scores 39 indicators per country and the Decide view offers 87 evidence-based policies and actions. For cellular agriculture, it supplies macro food-systems context (dietary, sustainability, and policy framing) that situates cultivated-meat and alternative-protein interventions, complementary to CAAIL's molecular, dataset, and tooling resources.

## Benchmark Leaderboards & Results Trackers

Live, continuously-updated leaderboards and results trackers for AI/ML benchmarks — the database side of the **Paper + Dataset + Database** triangle catalogued in the [AI Evaluation & Benchmarking](./ResearchAreas/AIEvaluation.md) research area. The benchmark datasets themselves live in [`Datasets/Benchmarks.md`](./Datasets/Benchmarks.md); this section catalogues only the *results-tracking* surfaces.

### [CASP — Prediction Center](https://predictioncenter.org/)

The Prediction Center hosts CASP (Critical Assessment of Structure Prediction) — the long-running community experiment and results tracker for protein-structure-prediction methods, run biennially since 1994, providing an independent assessment of prediction methods against experimental structures. AlphaFold2's breakthrough accuracy was independently assessed here at CASP14 (2020). For cellular agriculture, CASP is the canonical reference point for judging structure-prediction tools applied to growth factors, recombinant ECM and scaffold proteins, and other engineered proteins in cultivated-meat workflows.

### [CompBioBench v1 Leaderboard](https://huggingface.co/spaces/Genentech/compbiobench-leaderboard-v1)

Genentech's open leaderboard hosted on Hugging Face Spaces, tracking model performance on the 100-task CompBioBench v1 computational-biology benchmark. Provides a vendor-neutral, continuously-updated comparison point for cell-ag teams evaluating LLMs and agents on bioinformatics tasks before deploying them downstream. The underlying benchmark data — questions plus the BAM/FASTQ/H5AD/MTX/TSV bioinformatics artifacts each task operates over — is catalogued separately at [`Datasets/Benchmarks.md / CompBioBench v1`](./Datasets/Benchmarks.md#compbiobench-v1) (canonical home: the `Genentech/compbiobench-data-v1` Hugging Face Dataset). Companion to [Papers.md ref #150](./Papers.md#150) (Nair et al. 2026), the bioRxiv methods paper describing the benchmark.

### [Humanity's Last Exam Leaderboard](https://lastexam.ai/)

The official results tracker at `lastexam.ai` for Humanity's Last Exam, ranking frontier models on the 2,500-question closed-ended benchmark at the frontier of human knowledge. The companion benchmark *data* is catalogued at [`Datasets/Benchmarks.md / Humanity's Last Exam`](./Datasets/Benchmarks.md#humanitys-last-exam); paired with [Papers.md ref #158](./Papers.md#158) (Phan et al. 2026). A continuously-updated ceiling check on frontier reasoning for cell-ag teams choosing a general-purpose model.

### [MMLU-Pro Leaderboard](https://huggingface.co/spaces/TIGER-Lab/MMLU-Pro)

The live leaderboard on Hugging Face Spaces for the reasoning-focused MMLU-Pro benchmark, tracking model accuracy across its 14 disciplines. The companion benchmark *data* is catalogued at [`Datasets/Benchmarks.md / MMLU-Pro`](./Datasets/Benchmarks.md#mmlu-pro); paired with [Papers.md ref #157](./Papers.md#157) (Wang et al. 2024). A vendor-neutral general-reasoning comparison point for sizing up models before cell-ag-specific evaluation.

### [ProteinGym Leaderboard](https://www.proteingym.org/)

The live leaderboard hosted at `proteingym.org` for the ProteinGym variant-effect benchmark — separate substitution and indel boards covering supervised and zero-shot model categories. The companion benchmark *data* is catalogued at [`Datasets/Benchmarks.md / ProteinGym`](./Datasets/Benchmarks.md#proteingym); paired with [Papers.md ref #148](./Papers.md#148) (Notin et al. 2023). The dominant variant-effect leaderboard in protein-engineering ML — directly relevant to any cell-ag protein-engineering work (growth factors, scaffolds, recombinant ECM proteins) selecting a protein language model.

### [SWE-bench Leaderboard](https://www.swebench.com/)

The official leaderboard at `swebench.com` tracking agent and model performance across the SWE-bench leaderboards — the Full set plus the Verified, Lite, Multilingual, and Multimodal variants — by the percentage of real GitHub issues resolved with a test-passing patch. The companion benchmark *data* is catalogued at [`Datasets/Benchmarks.md / SWE-bench`](./Datasets/Benchmarks.md#swe-bench); paired with [Papers.md ref #155](./Papers.md#155) (Jimenez et al. 2024). The standard tracker for whether a coding agent can be trusted with the bioinformatics-pipeline and analysis-code maintenance cell-ag teams increasingly delegate.
