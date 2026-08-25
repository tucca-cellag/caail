# Foundation Models: LM + Biological Priors

This page describes the **Foundation Models: LM + Biological Priors** row of the [Papers.md matrix](../Papers.md): foundation models that pair a language-model backbone with an explicit biological prior, rather than learning everything from expression counts alone. The row's authoritative scope is its [Taxonomy.md definition](../Taxonomy.md#foundation-models-lm--biological-priors); this page synthesizes what currently sits in it.

## Scope boundary

The prior has to be inside the model. A network that merely *consumes* pretrained embeddings as input features belongs in [Deep Learning](./DeepLearning.md) or [GNN](./GNN.md), because the prior is then part of the feature pipeline rather than part of the pretrained model being released. The distinction is what makes the row narrow: most single-cell foundation models tokenize genes by identity and learn the relationships between them, which puts them in [Masked Language Modeling](./FoundationModelsMaskedLM.md) or [Next-Token Prediction](./FoundationModelsNextToken.md) depending on the pretraining objective. This row is for the smaller set that injects a structured, externally-derived representation of biology into the tokenizer or the architecture itself. A paper that merely invokes such a model, as an agent's tool call or a queried service, keeps its own row rather than earning this one.

The row is the sparsest on the method axis, and its neighbours are where the bulk of the foundation-model literature sits. Read it alongside them rather than on its own.

## Cellular Engineering

- [#119 UCE](../Papers.md#119) (Rosen et al. 2026, *bioRxiv*, Leskovec and Quake labs): Universal Cell Embedding maps a single-cell expression profile into a 1,280-dimensional space shared across tissues and species. The biological prior is in the tokenizer: rather than giving each gene a learned identity embedding, UCE represents a gene by the ESM2 protein-language-model embedding of the protein it codes for, averaged over that gene's protein products. Because a gene's token is derived from an amino-acid sequence, a species absent from the training corpus can be embedded without orthology mapping, solved structures, or fine-tuning, and the paper reports an ablation in which protein-derived tokens beat randomly initialized ones on every species except human. The authors apply it to build an Integrated Mega-scale Atlas of 36 million cells across eight species. Code at [snap-stanford/UCE](https://github.com/snap-stanford/UCE), catalogued in [`Software.md`](../Software.md#uce).

The cross-species claim is what makes this row worth separating for cellular agriculture. Livestock single-cell data is sparse relative to human and mouse, and a model whose gene vocabulary is built from protein sequence rather than from a fixed human gene list is one of the few published routes to embedding bovine, porcine, or piscine cells without first assembling a species-specific training corpus. Whether that transfer holds at the resolution a cell-line-engineering decision needs is an open question the paper does not settle, and the [Benchmarks & Evaluation Frameworks](./BenchmarksEvaluation.md) row indexes the work arguing about exactly this class of claim.

## Adjacent methods

- [Foundation Models: Masked Language Modeling](./FoundationModelsMaskedLM.md) and [Foundation Models: Next-Token Prediction](./FoundationModelsNextToken.md): the two pretraining objectives that account for most single-cell foundation models, including the cross-species models UCE is usually compared against.
- [Foundation Models: Cell-State & Perturbation Prediction](./FoundationModelsCellState.md): models whose output is a predicted cell state rather than a general-purpose embedding.
- [GNN](./GNN.md) and [Deep Learning](./DeepLearning.md): where a task-specific network that consumes pretrained embeddings belongs.
- [Benchmarks & Evaluation Frameworks](./BenchmarksEvaluation.md): the evaluation work that tests whether foundation-model gains survive comparison against simpler baselines.

## Further reading

- Research area: [Cellular Engineering](../ResearchAreas/CellEngineering.md), which covers the wider single-cell foundation-model wave this row sits inside.
- Software: [`Software.md`](../Software.md#uce) for UCE, and the [AI Agents & Foundation Models](../Software.md#ai-agents--foundation-models) section for the surrounding tooling.
- Datasets: [`Datasets/HumanReference.md`](../Datasets/HumanReference.md) for the human pretraining corpora that cross-species models adapt from, and the per-species pages under [`Datasets/`](../Datasets/) for the livestock data such a model would be transferred to.
- Field overview: [`AIAgentsFoundationModels.md`](../AIAgentsFoundationModels.md).
