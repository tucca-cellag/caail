# Food Safety Prediction

Cultivation introduces proteins a conventional product never contained: recombinant growth factors, media proteins, scaffold and matrix proteins, and in hybrid products the plant proteins carrying the structure. FAO/WHO Codex Alimentarius guidance requires any novel food protein to be screened for allergenic potential before it enters the food chain, which makes this the point where a computational prediction sits directly on a regulatory path. That is what this research area covers: predicting, from sequence or structure, whether a novel protein is likely to be allergenic, immunogenic, or toxic.

See [`Taxonomy.md`](../Taxonomy.md#food-safety-prediction) for the column's scope, which is the definition a placement is judged against. This page is an AI-assisted overview and is not a definition source.

## What the matrix currently holds, and why it is small

The column is deliberately narrow, and it is worth being precise about why, because the surrounding catalogue is much larger than the column.

One paper sits in the matrix: [ref #290](../Papers.md#290) (AlgPred 2.0, Sharma et al. 2021), a random-forest approach that also maps IgE-binding epitopes. It qualifies on the column's own terms rather than by subject resemblance: it names genetically modified foods and the FAO/Codex guidance in its introduction, and it draws its training corpus from COMPARE and AllergenOnline, the two curated resources built to assess novel food proteins.

A near neighbour deliberately sits elsewhere, and it is the clearest illustration of where this column stops. [Ref #289](../Papers.md#289) (AllerTrans, Sarlakifar et al. 2025) is a protein-language-model allergenicity classifier trained on AlgPred 2.0's own data, so by subject it looks like a member. Its text never mentions food, meat, cultivation, FAO or Codex, and its discussion locates its stakes in medical drug development. It is a general-purpose predictor with no alternative-protein framing, which is precisely the case the scope definition routes to [AI Tooling / Methodology](./AITooling.md), where it sits.

Two further papers survey the area rather than applying a method to it, and so live in `Papers.md`'s Reviews & Perspectives section rather than the matrix: [ref #291](../Papers.md#291) (Li et al. 2026) on allergens in cell-cultured products, and [ref #292](../Papers.md#292) (Ham et al. 2025) on allergenicity assessment and management in cultured meat.

## Not every allergenicity tool is a matrix entry

The gap between the column and the catalogue is mostly not a coverage gap. It follows from what the matrix is for.

The matrix pairs an **AI/ML method** with a research area, so a tool that applies no such method has no row to sit on, however squarely it addresses food safety. A large share of the established allergenicity toolchain is exactly that: sequence-similarity screening against a reference allergen set, of the kind Codex Alimentarius prescribes (a sliding window compared at an identity threshold), or fingerprint comparison by a similarity coefficient. Those are retrieval procedures rather than trained models. They are real, widely used, and regulator-facing, and they are catalogued as tools and databases rather than as matrix placements.

This distinction is invisible from a tool's name, several of which read like classifiers and are not, so it has to be judged from the methods section.

## Tools and data

The catalogued resources in this area outnumber the matrix references several times over:

- **Predictors and screening tools** are in [Software.md / Food Safety & Allergenicity](../Software.md#food-safety--allergenicity).
- **Reference allergen databases** the screens are run against (WHO/IUIS Nomenclature, AllergenOnline, COMPARE, SDAP 2.0, Allergome, AllFam) are in [Databases.md / Food Safety & Allergen Databases](../Databases.md#food-safety--allergen-databases).
- **Regulatory and food-safety registries** (FDA GRAS, FDA cultured-cell pre-market consultations, EU Novel Food, EFSA OpenFoodTox) are in [Databases.md / Regulatory & Food-Safety Databases](../Databases.md#regulatory--food-safety-databases).
- **Labeled training corpora** for sequence-based classifiers are in [Datasets/FoodSafety.md](../Datasets/FoodSafety.md).

## Open challenges for cell-ag

The predictors indexed here are trained on general allergen corpora drawn largely from food, pollen, and venom sources, not on the specific protein population cultivation introduces. Whether performance measured on those corpora transfers to recombinant growth factors, scaffold proteins, or heterologously expressed media components is a question the published evaluations do not answer, since the relevant proteins are largely absent from the training data. The reviews at refs #291 and #292 set out the assessment framework a product is judged against; the modelling work indexed here is upstream of it.

A second open question is what a prediction is worth in a regulatory submission. Codex-style homology screening is prescribed and accepted; a learned classifier's output currently is not, whatever its reported accuracy.

## Further reading

- Definitions: [`Taxonomy.md`](../Taxonomy.md#food-safety-prediction) for this column, and the *Food Safety* subject theme for the wider browse axis, which reaches the databases and datasets the matrix cannot hold.
- Adjacent research areas: [Cellular Engineering](./CellEngineering.md) for the engineered cells producing these proteins, [Media Optimization](./MediaOptimization.md) for the recombinant growth factors and media proteins being screened, and [Sensory Prediction](./SensoryPrediction.md) for spoilage and quality assessment, which is a different question from safety.
- Cross-cutting: [AI Tooling / Methodology](./AITooling.md), which holds general-purpose methods not yet tied to an applied result.
