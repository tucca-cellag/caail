# Food Safety & Allergenicity

Food safety is the assessment layer a cultured product must clear before it can enter the food chain, and the most computationally tractable part of that assessment is allergenicity. The recombinant growth factors, media proteins, and scaffold or matrix proteins introduced during cultivation are novel proteins, and FAO/WHO Codex Alimentarius guidance requires that any novel food protein be screened for allergenic potential by sequence homology against known allergens. The tools that run that screen live in [Software.md / Food Safety & Allergenicity](../Software.md#food-safety--allergenicity), and the reference allergen databases they query are in [Databases.md / Food Safety & Allergen Databases](../Databases.md#food-safety--allergen-databases). This page collects the labeled sequence data those predictors are trained and benchmarked on.

## Allergen sequence & epitope datasets

Sequence-based allergenicity classifiers are trained on curated sets of allergen and non-allergen protein sequences, often annotated with the specific IgE-binding epitopes that drive the allergic response. The dataset below is the labeled corpus most widely used to train and benchmark that class of model.

### [AlgPred 2.0 allergen dataset](https://webs.iiitd.edu.in/raghava/algpred2/)

The labeled corpus behind the AlgPred 2.0 allergen predictor: 10,075 allergen and 10,075 non-allergen protein sequences, together with 10,451 experimentally validated IgE epitopes and a 297-sequence independent validation set (plus a stricter 56-sequence non-redundant subset). It is a standard benchmark for training and evaluating sequence-based allergenicity classifiers, and directly relevant to screening the novel proteins introduced by cultivated meat and precision fermentation. Companion to [Papers.md ref #290](../Papers.md#290) (Sharma et al. 2021, *Briefings in Bioinformatics*); the predictor itself is catalogued in [Software.md / Food Safety & Allergenicity](../Software.md#food-safety--allergenicity).

## Further reading

- Allergenicity-prediction tools: [Software.md / Food Safety & Allergenicity](../Software.md#food-safety--allergenicity).
- Reference allergen databases (WHO/IUIS, AllergenOnline, COMPARE, SDAP 2.0, Allergome, AllFam): [Databases.md / Food Safety & Allergen Databases](../Databases.md#food-safety--allergen-databases).
- Deep-learning allergenicity methods in the matrix: [Papers.md ref #289](../Papers.md#289) (AllerTrans) and [Papers.md ref #290](../Papers.md#290) (AlgPred 2.0), both in the AI Tooling / Methodology column.
- Cell-ag allergenicity reviews: [Papers.md ref #291](../Papers.md#291) (Li et al. 2026) and [Papers.md ref #292](../Papers.md#292) (Ham et al. 2025).
