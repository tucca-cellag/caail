# Linear & Regularized Models

This page describes the **Linear & Regularized Models** row of the [Papers.md matrix](../Papers.md): ordinary and penalized linear and logistic regression (LASSO, ridge, elastic net) and linear additive scoring models. The row's authoritative scope is its [Taxonomy.md definition](../Taxonomy.md#linear--regularized-models); this page synthesizes what currently sits in it.

## Scope boundary

The taxonomy separates this row from its three nearest neighbours by mechanism rather than by performance: no kernel or margin, which excludes [SVM](./SVM.md); no trees, bagging or boosting, which excludes [Ensemble Learning](./EnsembleLearning.md); and no restriction to spectral latent-variable projection, which distinguishes it from [Chemometrics](./Chemometrics.md), where PLS is a linear model but a particular one applied to a particular data type.

What the row is *for* is the more useful framing. These models are chosen when the feature set is modest and someone needs to know which features drive the prediction, because the fitted coefficients name them and an L1 penalty selects them outright. Every reference below reports feature importance or propensity as a result in its own right, not just an accuracy number. That is a recurring need in cell-ag work, where a model that says "carbohydrate and targeted moisture content dominate texture" changes a formulation decision in a way that a more accurate but opaque model does not.

## Cellular Engineering

- [#266](../Papers.md#266) (Wang et al. 2023, *Journal of Agricultural and Food Chemistry*, Nanjing Agricultural University): predicts the proliferation and differentiation potency of porcine muscle stem cells from cell morphology, aimed squarely at the batch-to-batch quality variation that makes cultured-meat cell production inconsistent. pMuSCs were sorted (CD31−, CD45−, CD56+, CD29+) from three pigs, cultured across passages 5 to 9 in three lots, with proliferation scored as growth rate and differentiation as the average myosin-heavy-chain stained area after five days. The result that matters methodologically is about *when* to look rather than which model: predictions built on the 36-hour and 60-hour morphological profiles were the best, reaching R² = 0.95 for proliferation and R² = 0.74 for differentiation, and the paper argues that accumulating time-course information about morphological heterogeneity in the population is what makes potency predictable at all. One of the few references in the whole matrix working directly on a livestock cell line intended for cultivated meat.

## Scaffolding

- [#171](../Papers.md#171) (Kircali Ata et al. 2023, *Foods*): predicts the hardness and chewiness of plant-based meat analogs from the proximate composition of the raw materials (protein, fat, carbohydrate, fibre, ash, moisture) plus a targeted moisture content, over data curated from three prior extrusion and mechanical-elongation studies. Ridge is the linear member of a comparison that also includes XGBoost and an MLP, all with built-in feature selection, evaluated leave-one-group-out so a whole source study is held out at a time rather than random rows. Reported MAPE 22.9% for hardness and 14.5% for chewiness. The paper also examines multicollinearity among the composition features and the linearity of the design, which is the sort of diagnostic that belongs to this row specifically. Code and the curated table at [sezinata/FoodML](https://github.com/sezinata/FoodML); the dataset is catalogued in [`Datasets/CrossSpecies.md`](../Datasets/CrossSpecies.md). Also in [Ensemble Learning](./EnsembleLearning.md), and in this row again under Sensory Prediction.

## Sensory Prediction

- [#171](../Papers.md#171) (Kircali Ata et al. 2023, *Foods*): the same texture-prediction work, placed here as well because hardness and chewiness are sensory attributes as much as structural ones. See the description under Scaffolding above.
- [#269 iUmami-SCM](../Papers.md#269) (Charoenkwan et al. 2020, *Journal of Chemical Information and Modeling*): predicts whether a peptide tastes umami from primary sequence alone, using a scoring card method, a linear additive model over propensity scores for the 20 amino acids and the 400 dipeptides. Built on UMP442, 140 umami and 304 non-umami peptides assembled from the literature and BIOPEP-UWM, with bitter peptides used as the negative class and an 80/20 split into UMP-TR and UMP-IND. Reported accuracy 0.865 and MCC 0.679 on the independent set, outperforming the standard ML classifiers it was compared against. The interpretability is the point rather than a side benefit: the propensity scores are analysed directly to characterize which residues and dipeptides carry umami intensity, which is what a formulator can act on. Benchmark data and the scoring-card implementation are catalogued in [`Datasets/Benchmarks.md`](../Datasets/Benchmarks.md#iumami-scm).
- [#339](../Papers.md#339) (Gutiérrez et al. 2018, *Nature Communications*, IBM Research): predicts how humans will describe the smell of a mono-molecular odorant, over the Dravnieks dataset of 128 molecules rated by 507 experts across 146 verbal descriptors, plus the Keller and Vosshall data of 476 molecules rated by 49 individuals. The move that lifts the result is representational: descriptors are embedded as 300-dimensional fastText word vectors trained on 16 billion words, so a descriptor with little training data borrows structure from semantically nearby ones. That raised the number of descriptors predictable at accuracy above 0.5 to around 70, roughly a tenfold increase over prior work, and the authors argue the semantic distances between descriptors amount to an odour wheel. Relevant to cell-ag sensory work because panel vocabulary, not instrument data, is usually the scarce resource.

## Adjacent methods

- [SVM](./SVM.md), [Ensemble Learning](./EnsembleLearning.md), [K-Nearest Neighbors](./KNearestNeighbors.md): the classical models these papers benchmark against, usually in the same table.
- [Chemometrics](./Chemometrics.md): PLS and its relatives, linear models specialized to spectral data.
- [Deep Learning](./DeepLearning.md): the comparison that these small, interpretable feature sets rarely justify.

## Further reading

- Research areas: [Cellular Engineering](../ResearchAreas/CellEngineering.md), [Scaffolding](../ResearchAreas/Scaffolding.md), [Sensory Prediction](../ResearchAreas/SensoryPrediction.md).
- Datasets: [`Datasets/CrossSpecies.md`](../Datasets/CrossSpecies.md) for the meat-analog texture table, [`Datasets/Benchmarks.md`](../Datasets/Benchmarks.md) for the umami-peptide benchmark sets, and [`Datasets/Pig.md`](../Datasets/Pig.md) for porcine data resources.
