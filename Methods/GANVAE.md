# GAN / VAE

This page describes the **GAN / VAE** row of the [Papers.md matrix](../Papers.md): deep generative models, generative adversarial networks and variational autoencoders, used for data synthesis, augmentation, or generative dimensionality reduction. The row's authoritative scope is its [Taxonomy.md definition](../Taxonomy.md#gan--vae); this page synthesizes what currently sits in it.

## Scope boundary

What puts a paper here is that the generative objective is doing the work. A network that happens to contain an encoder is not enough: the reference must use adversarial training, a variational latent, or both, to synthesize data, augment a small dataset, or learn a latent space that a downstream task then reads. A discriminative convolutional model belongs in [CNN](./CNN.md), and a network that is simply deep belongs in [Deep Learning](./DeepLearning.md).

The row is small and unusually spread out, with references in four of the six columns. That spread is the interesting part: the same two architectures show up as a sequence designer, a dimensionality reducer, a physics surrogate, and a data augmenter, which are four different jobs sharing one mathematical idea.

## Cellular Engineering

- [#9 DR-A](../Papers.md#9) (Lin et al. 2020, *BMC Bioinformatics*): casts dimensionality reduction of single-cell RNA-seq as an adversarial variational autoencoder, combining the adversarial-autoencoder construction (where the encoder doubles as a GAN generator and a discriminator forces the latent code toward a prior) with the variational autoencoder's KL-regularized latent. The target problem is the one that makes scRNA-seq hard for classical methods: very high dimension plus an abundance of dropout zeros. Benchmarked against PCA, ZIFA, scVI, SAUCIE, t-SNE and UMAP, with clustering quality on held-out cells as the yardstick.
- [#10 ExpressionGAN](../Papers.md#10) (Zrimec et al. 2022, *Nature Communications*): designs synthetic regulatory DNA to hit a specified mRNA level, training a GAN directly on paired genomic and transcriptomic data from *S. cerevisiae* rather than on a mutagenesis library. The scope is what distinguishes it: the model generates the whole gene regulatory structure, promoter, 5' UTR, 3' UTR and terminator, instead of a short promoter window, over 3,814 regulatory-structure sequences balanced across 30 expression bins so the generator sees the full expression range uniformly. Despite high sequence divergence from natural DNA, 57% of the highly-expressed synthetic sequences beat highly-expressed natural controls when measured in vivo. Code at [JanZrimec/ExpressionGAN](https://github.com/JanZrimec/ExpressionGAN), data at [Zenodo](https://doi.org/10.5281/zenodo.6811225).

The pairing is worth noting for a cell-line engineering programme: one model compresses measured cell states into a usable latent, the other generates DNA parts that put a cell into a chosen state. Neither has been demonstrated on a livestock cell line.

## Scaffolding

- [#35](../Papers.md#35) (Andrews et al. 2023, *Physical Biology*): trains a pix2pix image-to-image model to predict how a cell-laden hydrogel will self-organize inside a tethered mould, replacing a contractile-network dipole-orientation biophysical simulation with a learned surrogate. The training set is the notable engineering: 6,400 moulds generated automatically by a script that samples 3 to 6 polygon vertices, places tethers at random radii, and then applies one of five duplication regimes (single-mirror, double-mirror, cyclic, dihedral, or irregular rotation) so the corpus spans a controlled range of symmetries rather than a hand-drawn set, with 100 further cases held out. The paper is proof-of-concept and names pharmaceutical testing, regenerative medicine and future scaffold and 3D-bioprinting work as targets. Its sibling, [#34](../Papers.md#34), puts a [genetic algorithm](./GeneticAlgorithms.md) on top of a surrogate of the same framework to search mould designs.

## Sensory Prediction

- [#11](../Papers.md#11) (Shen et al. 2024, *Food Chemistry*): discriminates four salted goose breeds by fusing HS-SPME/GC-MS and GC-IMS volatiles, E-nose and E-tongue signals, quantitative descriptive analysis, and free amino-acid and 5'-nucleotide measurements. The generative component is InfoGAN, used to expand a small composite dataset before several base classifiers are trained on it and their predictions fused by dynamic weighting; an ablation reported in the paper finds the ensemble step is what carries the generalization gain. Reported accuracy 95%, RMSE 0.080, F1 0.9460. It is a clean illustration of the augmentation use of this row rather than the design use, and it sits in [CNN](./CNN.md), [Ensemble Learning](./EnsembleLearning.md) and [SVM](./SVM.md) as well.

## AI Tooling / Methodology

- [#238](../Papers.md#238) (Pande et al. 2026, *bioRxiv*): trains a supervised variational autoencoder on 118,263 bulk RNA-seq samples assembled from TCGA, GTEx and ARCHS4 and mapped to 42 UBERON tissue categories, compressing 16,115 genes into a 121-dimensional latent. It reports 94.9% balanced accuracy on tissue of origin, finds tissue identity rather than data source to be the latent space's primary organizing axis, and validates on an independent cohort of 734 paediatric tumour samples at 84.6% agreement. Two things make it useful here beyond the result. It fills a stated gap, that pretrained foundation models are common for single-cell but scarce for bulk RNA-seq, which matters because bulk is still what most cell-ag labs generate. And it reports a scaling experiment across 38K, 75K and 118K training sets in which reconstruction fidelity improved with each expansion but with diminishing returns, which is directly relevant to anyone deciding how much data to assemble before training. It carries no cell-ag application, which is why it sits in the tooling column. Code at [BIMSBbioinfo/atlas_tissue_representation](https://github.com/BIMSBbioinfo/atlas_tissue_representation).

## Adjacent methods

- [Deep Learning](./DeepLearning.md) and [CNN](./CNN.md): where a discriminative network belongs, including the convolutional predictors several of these papers use as components.
- [Foundation Models: Masked Language Modeling](./FoundationModelsMaskedLM.md), [Next-Token Prediction](./FoundationModelsNextToken.md) and [Cell-State & Perturbation Prediction](./FoundationModelsCellState.md): the later, larger generative-pretraining wave that supersedes the VAE-as-embedding use in single-cell work.
- [Genetic Algorithms](./GeneticAlgorithms.md): the search layer built on top of the scaffolding surrogate in [#34](../Papers.md#34).
- [Ensemble Learning](./EnsembleLearning.md): the fusion step that carries [#11](../Papers.md#11)'s reported gain.

## Further reading

- Research areas: [Cellular Engineering](../ResearchAreas/CellEngineering.md), [Scaffolding](../ResearchAreas/Scaffolding.md), [Sensory Prediction](../ResearchAreas/SensoryPrediction.md), [AI Tooling / Methodology](../ResearchAreas/AITooling.md).
- Datasets: the per-species pages under [`Datasets/`](../Datasets/), and [`Datasets/HumanReference.md`](../Datasets/HumanReference.md) for the human bulk and single-cell compendia these models are trained on.
