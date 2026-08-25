# Hybrid Mechanistic-ML Models

This page describes the **Hybrid Mechanistic-ML Models** row of the [Papers.md matrix](../Papers.md): models that couple a first-principles description of the process to a learned component, so that neither half stands alone. The row's authoritative scope is its [Taxonomy.md definition](../Taxonomy.md#hybrid-mechanistic-ml-models); this page synthesizes what currently sits in it.

## Scope boundary

**The row is earned by the coupling, not by the network.** That is the whole discriminator, and it cuts in two directions that are easy to get backwards.

It admits a paper whose learned part is small. Both references here supply a neural network to a structure that is mechanistic on its own terms, and in one of them the network is a single hidden layer of eight to ten nodes. Read as an architecture that is not deep, which is true; read as a contribution, the architecture is not the point, and [Deep Learning](./DeepLearning.md)'s text explicitly disowns shallow models. Without this row, a paper like that has no home its own row's definition will accept.

It excludes a paper whose network is large but whose physics is not in the deployed model. A purely data-driven model trained on simulation output is not hybrid: the first-principles structure generated the data and was then discarded. Neither is an ensemble that averages several learned models and calls the combination hybrid, which is a distinct and common use of the word. Both cases keep their own rows.

A paper with a genuinely deep network **and** a mechanistic core can hold this row and [Deep Learning](./DeepLearning.md) at once, and one of the two below does.

## Bioprocess & Scale-Up

- [#205](../Papers.md#205) (Yang et al. 2024, *Industrial & Engineering Chemistry Research*): a physics-informed neural network for fed-batch mammalian cell culture, where the first-principles component is a Monod-kinetics ODE system over viable cell density, glucose, glutamine, lactate, ammonia and titer. What distinguishes it from the usual arrangement is stated directly in the methods: "Unlike traditional hybrid modeling schemes where FPM and DDM components are combined as submodels in a semiparametric manner, predetermined in an a priori configuration. PINN completely incorporates the FPM into the training process, resulting in a neural network model that subsumes the FPM components." The coupling is therefore in the objective rather than the topology, with the loss carrying a data-fitting term alongside a term penalising deviation from the mechanistic right-hand side, evaluated by automatic differentiation. Assessed against five benchmark models built on identical mechanistic equations and process data, split into non-hybrid (the calibrated first-principles model and two pure data-driven models, one of them a linear regression over previous sampling times) and hybrid categories. Also in [Deep Learning](./DeepLearning.md), which it earns separately.
- [#255](../Papers.md#255) (Narayanan et al. 2020, *Biotechnology and Bioengineering*): Hybrid-EKF, where the cell-culture system is written as mass balances over viable cell density, glucose, glutamine, lactate, ammonia and titer, and "ANNs with State, W, and Z as the input are used to compensate for the lack of deterministic understanding of the specific rates." The network fills exactly the term the mechanistic model cannot supply, which is the row's shape in its clearest form. It is a single hidden layer with L2 regularization, tuned by fivefold cross-validation to eight nodes on the simulated dataset and ten on the real one. An extended Kalman filter then combines the model's predictions with noisy online measurements, so the hybrid model is the state estimator rather than an offline predictor. Developed first on a simulated fed-batch dataset of one hundred fourteen-day experiments and then applied unchanged to a real industrial dataset, and benchmarked against the historical-PLS2 industrial standard in two variants, one coupled to the same filter and one reading measurements directly. Worth noting for anyone sizing a study: the paper reports comparable hybrid accuracy from about fifteen experiments.

## Adjacent methods

- [Deep Learning](./DeepLearning.md): where a purely data-driven bioprocess surrogate belongs, and where [#205](../Papers.md#205) also sits. The boundary is whether the deployed model still contains the governing equations.
- [Bayesian Optimization](./BayesianOptimization.md): the other route to working under a tight experimental budget. A hybrid model reduces how much data a prediction needs; an acquisition function reduces how many experiments are run.
- [Reinforcement Learning](./ReinforcementLearning.md): shares the control-and-monitoring setting, without the first-principles core.
- [Comparative Studies](./ComparativeStudies.md): both references above benchmark themselves against several alternatives, but neither is primarily a method study, so neither takes that row.

## Further reading

- Research area: [Bioprocess & Scale-Up](../ResearchAreas/Bioprocess.md), the only column this row currently occupies.
- Scope: the [Taxonomy.md definition](../Taxonomy.md#hybrid-mechanistic-ml-models), which is the trusted source for what belongs here.
