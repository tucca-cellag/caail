# Paper matrix
This document presents the core research papers at the intersection of Cellular Agriculture and AI. The papers are organized by problem and AI type, to indicate which approaches have been successful in a given research area.

| | [Media Optimization](./Taxonomy.md#media-optimization) | [Cellular Engineering](./Taxonomy.md#cellular-engineering) | [Bioprocess & Scale-Up](./Taxonomy.md#bioprocess--scale-up) | [Scaffolding](./Taxonomy.md#scaffolding)  | [Sensory Prediction](./Taxonomy.md#sensory-prediction) | [AI Tooling / Methodology](./Taxonomy.md#ai-tooling--methodology) | [AI Evaluation & Benchmarking](./Taxonomy.md#ai-evaluation--benchmarking) |
|---|---|---|---|---|---|---|---|
| [Bayesian Optimization](./Taxonomy.md#bayesian-optimization) | [Cosenza et al. 2022](#3)<br>[Kanda et al. 2022](#16)<br>[Cosenza 2022](#18)<br>[Cosenza et al. 2023](#2)<br>[Yoshida et al. 2023](#15)<br>[Narayanan et al. 2025](#58)<br>[Cosenza et al. 2021](#211)<br>[Tu et al. 2022](#212) | [Kanda et al. 2022](#16) | [Antonakoudis & Richelle 2026](#59) | | | | |
| [Deep Learning](./Taxonomy.md#deep-learning) | [Cosenza 2022](#18)<br>[Yoshida et al. 2023](#15)<br>[Tu et al. 2022](#212) | [Li et al. 2020](#5)<br>[Magnusson et al. 2024](#122)<br>[Adduri et al. 2025](#57)<br>[Xiao et al. 2026](#145)<br>[Rosen et al. 2024](#118)<br>[Littman et al. 2025](#123) | [Del Rio‐Chanona et al. 2019](#29)<br>[Peng et al. 2013](#30)<br>[Chiu & Du 2025](#204)<br>[Yang et al. 2024](#205) | [Rafieyan et al. 2024](#20)<br>[Shin et al. 2025](#215)<br>[Golbabaei et al. 2024](#216) | [Tac et al. 2026](#236) | [Radzikowski & Chen 2026](#197)<br>[Chen et al. 2016](#4) | |
| [GNN](./Taxonomy.md#gnn) | | [Wang et al. 2021](#13)<br>[Ciortan & Defrance 2022](#8)<br>[Shan et al. 2023](#12)<br>[Roohani et al. 2024](#121)<br>[Li et al. 2024](#68) | | | [Lee et al. 2023](#14)<br>[Qian et al. 2023](#36) | [Mulyadi et al. 2025](#52) | |
| [CNN](./Taxonomy.md#cnn) | | [Yang et al. 2025](#218) | [Rojek et al. 2021](#33)<br>[Hevaganinge et al. 2023](#206) | [Bermejillo Barrera et al. 2021](#19) | [Sun et al. 2023](#26)<br>[Shen et al. 2024](#11)<br>[Ulucan et al. 2019](#195)<br>[Gyening et al. 2025](#196) | | |
| [GAN / VAE](./Taxonomy.md#gan--vae) | | [Lin et al. 2020](#9)<br>[Zrimec et al. 2022](#10) | | [Andrews et al. 2023](#35) | [Shen et al. 2024](#11) | [Pande et al. 2026](#238) | |
| [Genetic Algorithms](./Taxonomy.md#genetic-algorithms) | [Cosenza & Block 2021](#17)<br>[Nikkhah et al. 2023](#1)<br>[Hashizume & Ying 2025](#169)<br>[Munroe et al. 2019](#210)<br>[Cosenza et al. 2021](#211) | | [Peng et al. 2013](#30)<br>[Zhang et al. 2020](#31)<br>[Takahashi et al. 2016](#209) | [Andrews et al. 2025](#34) | | | |
| [SVM](./Taxonomy.md#svm) | [Xu et al. 2014](#21) | | [Zhang et al. 2020](#31)<br>[Roell et al. 2022](#32)<br>[Xu et al. 2025](#208) | | [Sun et al. 2023](#26)<br>[Sun et al. 2026](#28)<br>[Colantonio et al. 2022](#72)<br>[Shen et al. 2024](#11) | | |
| [Ensemble Learning](./Taxonomy.md#ensemble-learning) | [Gangwar et al. 2024](#170)<br>[Hashizume & Ying 2025](#169)<br>[Grzesik & Warth 2021](#213) | | [Roell et al. 2022](#32)<br>[Du et al. 2025](#27)<br>[Behdani et al. 2024](#207)<br>[Xu et al. 2025](#208) | [Rafieyan et al. 2024](#20)<br>[Nair et al. 2021](#214)<br>[Serpe et al. 2025](#217) | [Keller et al. 2017](#80)<br>[Dagan-Wiener et al. 2017](#102)<br>[Margulis et al. 2021](#103)<br>[Colantonio et al. 2022](#72)<br>[Kircali Ata et al. 2023](#171)<br>[Ziaikin et al. 2024](#105)<br>[Du et al. 2025](#27)<br>[Shen et al. 2024](#11)<br>[Sun et al. 2026](#28) | | |
| [K-Nearest Neighbors](./Taxonomy.md#k-nearest-neighbors) | | | [Roell et al. 2022](#32) | | [Sun et al. 2026](#28)<br>[Margulis et al. 2022](#104) | | |
| [Chemometrics](./Taxonomy.md#chemometrics) | | | [Tamburini et al. 2014](#7)<br>[Xu et al. 2025](#208) | | | [Thévenot et al. 2015](#198)<br>[Rohart et al. 2017](#199) | |
| [Active Learning](./Taxonomy.md#active-learning) | [Hashizume et al. 2022](#24)<br>[Zhang et al. 2023](#23)<br>[Ozawa et al. 2025](#25)<br>[Narayanan et al. 2025](#58)<br>[Hashizume & Ying 2025](#169) | [Pandi et al. 2022](#63)<br>[Hao et al. 2025](#97) | | | | [Pandi et al. 2022](#63)<br>[King et al. 2004](#182) | |
| [Reinforcement Learning](./Taxonomy.md#reinforcement-learning) | | [Wu et al. 2026](#165)<br>[Rizvi et al. 2026](#120) | [Petsagkourakis et al. 2020](#200)<br>[Oh et al. 2022](#201)<br>[Rajasekhar et al. 2024](#202)<br>[Wu & Cui 2025](#203) | | | [Narayanan et al. 2025](#161) | |
| [Foundation Models: Next-Token Prediction](./Taxonomy.md#foundation-models-next-token-prediction) | | [Shen et al. 2023](#115)<br>[Pearce et al. 2026](#92)<br>[Rizvi et al. 2026](#120)<br>[Cui et al. 2024](#117) | | | | [Su et al. 2026](#88) | |
| [Foundation Models: Masked Language Modeling](./Taxonomy.md#foundation-models-masked-language-modeling) | | [Yang et al. 2022](#112)<br>[Theodoris et al. 2023](#111)<br>[Hao et al. 2024](#116)<br>[Cui et al. 2024](#117)<br>[Ji et al. 2021](#6)<br>[Zeng et al. 2025](#235) | | | | | |
| [Foundation Models: LM + Biological Priors](./Taxonomy.md#foundation-models-lm--biological-priors) | | [Rosen et al. 2026](#119) | | | | | |
| [Foundation Models: Cell-State & Perturbation Prediction](./Taxonomy.md#foundation-models-cell-state--perturbation-prediction) | | [Adduri et al. 2025](#57)<br>[Dong et al. 2026](#124)<br>[Cui et al. 2024](#117)<br>[Rizvi et al. 2026](#120) | | | | | |
| [Foundation Models (other modalities)](./Taxonomy.md#foundation-models-other-modalities) | | | | | | [Sypetkowski et al. 2026](#42)<br>[Ding et al. 2026](#91)<br>[Queen et al. 2025](#224) | |
| [Scientific Literature & Discovery Agents](./Taxonomy.md#scientific-literature--discovery-agents) | | | | | | [Lála et al. 2023](#44)<br>[Lu et al. 2024](#45)<br>[Skarlinski et al. 2024](#46)<br>[Yamada et al. 2025](#47)<br>[Gottweis et al. 2026](#153)<br>[Ghareeb et al. 2026](#154)<br>[Aygün et al. 2026](#166)<br>[Feng et al. 2025](#221)<br>[Gandhi et al. 2025](#222) | |
| [General-Purpose Biomedical Agents](./Taxonomy.md#general-purpose-biomedical-agents) | | | | | | [Dong et al. 2024](#98)<br>[Huang et al. 2025](#49)<br>[Pickard et al. 2025](#94)<br>[Riffle et al. 2025](#95)<br>[Jin et al. 2025](#96)<br>[Zhang et al. 2025](#223)<br>[Xiao et al. 2026](#237) | |
| [Chemistry / Synthesis Agents](./Taxonomy.md#chemistry--synthesis-agents) | | | | | | [Boiko et al. 2023](#70)<br>[Bran et al. 2024](#71) | |
| [Domain-Specific Biomedical Agents](./Taxonomy.md#domain-specific-biomedical-agents) | | [Hao et al. 2025](#97)<br>[Roohani et al. 2025a](#125)<br>[Tang et al. 2026](#93) | | | | [Maeda & Kurata 2023](#69)<br>[Li et al. 2024](#68)<br>[Lee et al. 2025](#43)<br>[Wehling et al. 2025](#50)<br>[Singh et al. 2025](#167)<br>[Ying et al. 2025](#54)<br>[Wang et al. 2025a](#56)<br>[Sui et al. 2026](#51)<br>[Gao et al. 2025a](#40)<br>[Yu et al. 2026](#90)<br>[Youngblut et al. 2025](#126) | |
| [Robot Scientists & Lab Automation](./Taxonomy.md#robot-scientists--lab-automation) | | [Singh et al. 2023](#66)<br>[Kanda et al. 2022](#16) | [Wang et al. 2025b](#61) | | | [King et al. 2004](#182)<br>[Tiukova et al. 2024](#64)<br>[Brunnsåker et al. 2025](#65)<br>[Qiu et al. 2025](#62)<br>[Ghareeb et al. 2026](#154) | |
| [Benchmarks & Evaluation Frameworks](./Taxonomy.md#benchmarks--evaluation-frameworks) | | | | | | | [Sadhuka et al. 2025](#55)<br>[Brouwer et al. 2026](#89)<br>[Mitchener et al. 2025](#108)<br>[Bushuiev et al. 2024](#109)<br>[Sze & Hassoun 2024](#110)<br>[Chevalley et al. 2025](#127)<br>[Laurent et al. 2024](#146)<br>[Gu et al. 2025](#147)<br>[Notin et al. 2023](#148)<br>[Duan et al. 2025](#149)<br>[Nair et al. 2026](#150)<br>[Jimenez et al. 2024](#155)<br>[Rein et al. 2023](#156)<br>[Wang et al. 2024](#157)<br>[Phan et al. 2026](#158)<br>[Wang et al. 2026](#159)<br>[Huang et al. 2026](#164)<br>[Liu et al. 2026](#53)<br>[Adduri et al. 2025](#57)<br>[Miller et al. 2025](#225)<br>[Ahmed et al. 2026](#239) |
| [Agent Infrastructure (Frameworks, KGs, Protocols)](./Taxonomy.md#agent-infrastructure-frameworks-kgs-protocols) | | | | | | [Gao et al. 2025b](#41)<br>[Lobentanzer et al. 2025](#48)<br>[Ruscone et al. 2025](#67)<br>[Kuehl et al. 2025](#133)<br>[Narayanan et al. 2024](#160)<br>[Qiao et al. 2026](#162)<br>[Wang et al. 2025b](#61)<br>[Tang et al. 2026](#93)<br>[Matsumoto et al. 2025](#219)<br>[Glen et al. 2025](#220) | |

## Category definitions

Each matrix axis is defined in **[`Taxonomy.md`](./Taxonomy.md)** — what it covers, what is out of
scope, and how to tell confusable categories apart. A placement records what a paper *actually does*
in its methods, not what it could be applied to. Short form:

**Research areas (columns)**

- **[Media Optimization](./Taxonomy.md#media-optimization)** — designing/optimizing the culture medium (formulations, serum-free, supplements).
- **[Cellular Engineering](./Taxonomy.md#cellular-engineering)** — engineering/characterizing the cells (gene expression, cell-state, perturbation, single-cell analysis).
- **[Bioprocess & Scale-Up](./Taxonomy.md#bioprocess--scale-up)** — running and scaling the bioprocess (reactor design, CFD/mixing, mass transfer, monitoring, control).
- **[Scaffolding](./Taxonomy.md#scaffolding)** — scaffolds and structural biomaterials for tissue form and texture.
- **[Sensory Prediction](./Taxonomy.md#sensory-prediction)** — flavor, odor, taste, texture, color, and freshness/quality.
- **[AI Tooling / Methodology](./Taxonomy.md#ai-tooling--methodology)** — general AI methods/agents/tools not yet tied to a specific cell-ag application.
- **[AI Evaluation & Benchmarking](./Taxonomy.md#ai-evaluation--benchmarking)** — benchmarks and evaluation/verification frameworks for AI performance.

**AI/ML methods (rows)**

- **[Bayesian Optimization](./Taxonomy.md#bayesian-optimization)** — surrogate + acquisition-function sequential experiment selection (≠ Bayesian inference).
- **[Deep Learning](./Taxonomy.md#deep-learning)** — multi-layer neural nets not better described by a more specific row (catch-all).
- **[GNN](./Taxonomy.md#gnn)** — Graph Neural Networks: trained message-passing graph networks (≠ classical network propagation).
- **[CNN](./Taxonomy.md#cnn)** — Convolutional Neural Networks: for image/grid data.
- **[GAN / VAE](./Taxonomy.md#gan--vae)** — Generative Adversarial Networks / Variational Autoencoders: deep generative models for synthesis and embedding.
- **[Genetic Algorithms](./Taxonomy.md#genetic-algorithms)** — population-based evolutionary search.
- **[SVM](./Taxonomy.md#svm)** — Support Vector Machines / regression.
- **[Ensemble Learning](./Taxonomy.md#ensemble-learning)** — tree ensembles and model averaging (random forests, gradient boosting).
- **[K-Nearest Neighbors](./Taxonomy.md#k-nearest-neighbors)** — instance-based prediction by similarity.
- **[Chemometrics](./Taxonomy.md#chemometrics)** — multivariate spectral statistics (PLS / PLS-DA / PCA / OPLS).
- **[Active Learning](./Taxonomy.md#active-learning)** — model-guided iterative design-of-experiments.
- **[Reinforcement Learning](./Taxonomy.md#reinforcement-learning)** — reward-driven policy learning and LLM post-training.
- **[Foundation Models: Next-Token Prediction](./Taxonomy.md#foundation-models-next-token-prediction)** — pretrained autoregressive (GPT-style) models for biology.
- **[Foundation Models: Masked Language Modeling](./Taxonomy.md#foundation-models-masked-language-modeling)** — pretrained masked (BERT-style) single-cell models.
- **[Foundation Models: LM + Biological Priors](./Taxonomy.md#foundation-models-lm--biological-priors)** — foundation models fusing an LM backbone with explicit biological priors.
- **[Foundation Models: Cell-State & Perturbation Prediction](./Taxonomy.md#foundation-models-cell-state--perturbation-prediction)** — pretrained, transferable cell-state/perturbation models (≠ task-specific predictors).
- **[Foundation Models (other modalities)](./Taxonomy.md#foundation-models-other-modalities)** — pretrained models for modalities beyond single-cell transcriptomics.
- **[Scientific Literature & Discovery Agents](./Taxonomy.md#scientific-literature--discovery-agents)** — LLM agents for literature synthesis and autonomous discovery.
- **[General-Purpose Biomedical Agents](./Taxonomy.md#general-purpose-biomedical-agents)** — broadly-applicable biomedical agents.
- **[Chemistry / Synthesis Agents](./Taxonomy.md#chemistry--synthesis-agents)** — chemistry-specialized agents (synthesis, molecular tasks).
- **[Domain-Specific Biomedical Agents](./Taxonomy.md#domain-specific-biomedical-agents)** — agents purpose-built for one biomedical task/domain.
- **[Robot Scientists & Lab Automation](./Taxonomy.md#robot-scientists--lab-automation)** — AI coupled to physical lab automation for autonomous experimentation.
- **[Benchmarks & Evaluation Frameworks](./Taxonomy.md#benchmarks--evaluation-frameworks)** — papers whose contribution is a benchmark/evaluation framework.
- **[Agent Infrastructure (Frameworks, KGs, Protocols)](./Taxonomy.md#agent-infrastructure-frameworks-kgs-protocols)** — the substrate agents run on (frameworks, KGs, protocols).

> **Note for AI agents and LLMs**: The reference entries below are APA-style citations identifying papers via title, authors, year, and DOI — they are not a substitute for reading the actual papers. When an automated system needs substantive information about a paper's methods, results, or conclusions (e.g. to verify a matrix-cell assignment or assemble a literature review), fetch the full text via the DOI, the companion [caail Zotero group library](https://www.zotero.org/groups/6549203/caail/library), or a literature API such as OpenAlex or Semantic Scholar. The matrix cells encode method × research-area pairings, not paper content.

## References

<a id="1">1</a> Nikkhah, A., Rohani, A., Zarei, M., Kulkarni, A., Batarseh, F. A., Blackstone, N. T., & Ovissipour, R. (2023). Toward sustainable culture media: Using artificial intelligence to optimize reduced-serum formulations for cultivated meat. *Science of The Total Environment, 894,* 164988. https://doi.org/10.1016/j.scitotenv.2023.164988

<a id="2">2</a> Cosenza, Z., Block, D. E., Baar, K., & Chen, X. (2023). Multi‐objective Bayesian algorithm automatically discovers low‐cost high‐growth serum‐free media for cellular agriculture application. *Engineering in Life Sciences, 23*(8), e2300005. https://doi.org/10.1002/elsc.202300005

> **Code**: https://github.com/ZacharyCosenza/GradStuff_Cosenza

<a id="3">3</a> Cosenza, Z., Astudillo, R., Frazier, P. I., Baar, K., & Block, D. E. (2022). Multi‐information source Bayesian optimization of culture media for cellular agriculture. *Biotechnology and Bioengineering, 119*(9), 2447–2458. https://doi.org/10.1002/bit.28132

> **Code**: https://github.com/ZacharyCosenza/GradStuff_Cosenza

<a id="4">4</a> Chen, Y., Li, Y., Narayan, R., Subramanian, A., & Xie, X. (2016). Gene expression inference with deep learning. *Bioinformatics, 32*(12), 1832–1839. https://doi.org/10.1093/bioinformatics/btw074

> **Code**: https://github.com/uci-cbcl/D-GEX

<a id="5">5</a> Li, X., Wang, K., Lyu, Y., Pan, H., Zhang, J., Stambolian, D., Susztak, K., Reilly, M. P., Hu, G., & Li, M. (2020). Deep learning enables accurate clustering with batch effect removal in single-cell RNA-seq analysis. *Nature Communications, 11*(1), 2338. https://doi.org/10.1038/s41467-020-15851-3

> **Code**: https://github.com/eleozzr/desc

<a id="6">6</a> Ji, Y., Zhou, Z., Liu, H., & Davuluri, R. V. (2021). DNABERT: pre-trained Bidirectional Encoder Representations from Transformers model for DNA-language in genome. *Bioinformatics, 37*(15), 2112–2120. https://doi.org/10.1093/bioinformatics/btab083

> **Code**: https://github.com/jerryji1993/DNABERT

<a id="7">7</a> Tamburini, E., Marchetti, M., & Pedrini, P. (2014). Monitoring Key Parameters in Bioprocesses Using Near-Infrared Technology. *Sensors, 14*(10), 18941–18959. https://doi.org/10.3390/s141018941

<a id="8">8</a> Ciortan, M., & Defrance, M. (2022). GNN-based embedding for clustering scRNA-seq data. *Bioinformatics, 38*(4), 1037–1044. https://doi.org/10.1093/bioinformatics/btab787

> **Code**: https://github.com/ciortanmadalina/graph-sc

<a id="9">9</a> Lin, E., Mukherjee, S., & Kannan, S. (2020). A deep adversarial variational autoencoder model for dimensionality reduction in single-cell RNA sequencing analysis. *BMC Bioinformatics, 21*(1), 64. https://doi.org/10.1186/s12859-020-3401-5

> **Code**: https://github.com/epierson9/ZIFA

> **Code**: https://github.com/eugenelin1/DRA

<a id="10">10</a> Zrimec, J., Fu, X., Muhammad, A. S., Skrekas, C., Jauniskis, V., Speicher, N. K., Börlin, C. S., Verendel, V., Chehreghani, M. H., Dubhashi, D., Siewers, V., David, F., Nielsen, J., & Zelezniak, A. (2022). Controlling gene expression with deep generative design of regulatory DNA. *Nature Communications, 13*(1), 5099. https://doi.org/10.1038/s41467-022-32818-8

> **Code**: https://github.com/JanZrimec/ExpressionGAN

> **Data**: https://doi.org/10.5281/zenodo.6811225

<a id="11">11</a> Shen, C., Wang, R., Jin, Q., Chen, X., Cai, K., & Xu, B. (2024). Chemometrics methods, sensory evaluation and intelligent sensory technologies combined with GAN-based integrated deep-learning framework to discriminate salted goose breeds. *Food Chemistry, 461,* 140919. https://doi.org/10.1016/j.foodchem.2024.140919

<a id="12">12</a> Shan, Y., Yang, J., Li, X., Zhong, X., & Chang, Y. (2023). GLAE: A graph-learnable auto-encoder for single-cell RNA-seq analysis. *Information Sciences, 621,* 88–103. https://doi.org/10.1016/j.ins.2022.11.049

<a id="13">13</a> Wang, J., Ma, A., Chang, Y., Gong, J., Jiang, Y., Qi, R., Wang, C., Fu, H., Ma, Q., & Xu, D. (2021). scGNN is a novel graph neural network framework for single-cell RNA-Seq analyses. *Nature Communications, 12*(1), 1882. https://doi.org/10.1038/s41467-021-22197-x

> **Code**: https://github.com/juexinwang/scGNN

<a id="14">14</a> Lee, B. K., Mayhew, E. J., Sanchez-Lengeling, B., Wei, J. N., Qian, W. W., Little, K. A., Andres, M., Nguyen, B. B., Moloy, T., Yasonik, J., Parker, J. K., Gerkin, R. C., Mainland, J. D., & Wiltschko, A. B. (2023). A principal odor map unifies diverse tasks in olfactory perception. *Science, 381*(6661), 999–1006. https://doi.org/10.1126/science.ade4401

> **Code**: https://github.com/osmoai/publications/tree/main/lee_et_al_2023

<a id="15">15</a> Yoshida, K., Watanabe, K., Chiou, T.-Y., & Konishi, M. (2023). High throughput optimization of medium composition for Escherichia coli protein expression using deep learning and Bayesian optimization. *Journal of Bioscience and Bioengineering, 135*(2), 127–133. https://doi.org/10.1016/j.jbiosc.2022.12.004

<a id="16">16</a> Kanda, G. N., Tsuzuki, T., Terada, M., Sakai, N., Motozawa, N., Masuda, T., Nishida, M., Watanabe, C. T., Higashi, T., Horiguchi, S. A., Kudo, T., Kamei, M., Sunagawa, G. A., Matsukuma, K., Sakurada, T., Ozawa, Y., Takahashi, M., Takahashi, K., & Natsume, T. (2022). Robotic search for optimal cell culture in regenerative medicine. *eLife, 11,* e77007. https://doi.org/10.7554/eLife.77007

> **Code**: https://github.com/labauto/LabDroid_optimizer

<a id="17">17</a> Cosenza, Z., & Block, D. E. (2021). A generalizable hybrid search framework for optimizing expensive design problems using surrogate models. *Engineering Optimization, 53*(10), 1772–1785. https://doi.org/10.1080/0305215X.2020.1826466

<a id="18">18</a> Cosenza, Z. A. (2022). *Sequential Learning Methods for the Experimental Optimization of Cell Culture Media for Cellular Agriculture* [UC Davis]. https://escholarship.org/uc/item/119489fc

<a id="19">19</a> Bermejillo Barrera, M. D., Franco-Martínez, F., & Díaz Lantada, A. (2021). Artificial Intelligence Aided Design of Tissue Engineering Scaffolds Employing Virtual Tomography and 3D Convolutional Neural Networks. *Materials, 14*(18), 5278. https://doi.org/10.3390/ma14185278

<a id="20">20</a> Rafieyan, S., Ansari, E., & Vasheghani-Farahani, E. (2024). A practical machine learning approach for predicting the quality of 3D (bio)printed scaffolds. *Biofabrication, 16*(4), 045014. https://doi.org/10.1088/1758-5090/ad6374

> **Code**: https://github.com/saeedrafieyan/MLATE

<a id="21">21</a> Xu, J., Yan, F., Li, Z., Wang, D., Sheng, H., & Liu, Y. (2014). Serum-Free Medium Optimization Based on Trial Design and Support Vector Regression. *BioMed Research International, 2014,* 1–7. https://doi.org/10.1155/2014/269305

<a id="23">23</a> Zhang, S., Aida, H., & Ying, B.-W. (2023). Employing Active Learning in Medium Optimization for Selective Bacterial Growth. *Applied Microbiology, 3*(4), 1355–1369. https://doi.org/10.3390/applmicrobiol3040091

<a id="24">24</a> Hashizume, T., Ozawa, Y., & Ying, B.-W. (2022). *Employing active learning in the optimization of culture medium for mammalian cells.* https://doi.org/10.1101/2022.12.24.521878

> **Code**: https://github.com/hashizume711/medium_optimization

<a id="25">25</a> Ozawa, Y., Hashizume, T., & Ying, B.-W. (2025). A data-driven approach for cell culture medium optimization. *Biochemical Engineering Journal, 214,* 109591. https://doi.org/10.1016/j.bej.2024.109591

> **Code**: https://github.com/yuki020527/medium_optimization

<a id="26">26</a> Sun, D., Zhou, C., Hu, J., Li, L., & Ye, H. (2023). Off-flavor profiling of cultured salmonids using hyperspectral imaging combined with machine learning. *Food Chemistry, 408*, 135166. https://doi.org/10.1016/j.foodchem.2022.135166

<a id="27">27</a> Du, L., Wang, S., Chen, Y., Zhu, Z., Sun, H.-X., & Chiu, T.-Y. (2025). Machine learning-based prediction of volatile compounds profiles in Saccharomyces cerevisiae fermentation simulating canned meat. *Npj Science of Food, 9*(1), 92. https://doi.org/10.1038/s41538-025-00435-6

> **Code**: https://github.com/illuminate6060/ML_S.cerevisiae

<a id="28">28</a> Sun, Y., Zhang, Q., Lin, H., Lu, J., Zhang, H., Su, C., Huang, S., Pang, J., & Li, X. (2026). Engineering odor control in algal foods: Machine learning for quality enhancement. *Journal of Food Engineering, 402*, 112676. https://doi.org/10.1016/j.jfoodeng.2025.112676

> **Code**: https://github.com/llllhhhhkkkk/odor-prediction-ML

<a id="29">29</a> Del Rio‐Chanona, E. A., Wagner, J. L., Ali, H., Fiorelli, F., Zhang, D., & Hellgardt, K. (2019). Deep learning‐based surrogate modeling and optimization for microalgal biofuel production and photobioreactor design. *AIChE Journal, 65*(3), 915–923. https://doi.org/10.1002/aic.16473

<a id="30">30</a> Peng, J., Meng, F., & Ai, Y. (2013). Time-dependent fermentation control strategies for enhancing synthesis of marine bacteriocin 1701 using artificial neural network and genetic algorithm. *Bioresource Technology, 138*, 345–352. https://doi.org/10.1016/j.biortech.2013.03.194

<a id="31">31</a> Zhang, L., Chao, B., & Zhang, X. (2020). Modeling and optimization of microbial lipid fermentation from cellulosic ethanol wastewater by Rhodotorula glutinis based on the support vector machine. *Bioresource Technology, 301*, 122781. https://doi.org/10.1016/j.biortech.2020.122781

<a id="32">32</a> Roell, G. W., Sathish, A., Wan, N., Cheng, Q., Wen, Z., Tang, Y. J., & Bao, F. S. (2022). A comparative evaluation of machine learning algorithms for predicting syngas fermentation outcomes. *Biochemical Engineering Journal, 186*, 108578. https://doi.org/10.1016/j.bej.2022.108578

> **Code** https://github.com/garrettroell/SyngasMachineLearning

<a id="33">33</a> Rojek, K., Wyrzykowski, R., & Gepner, P. (2021). AI-Accelerated CFD Simulation Based on OpenFOAM and CPU/GPU Computing. In M. Paszynski, D. Kranzlmüller, V. V. Krzhizhanovskaya, J. J. Dongarra, & P. M. A. Sloot (Eds.), *Computational Science – ICCS 2021* (pp. 373–385). Springer International Publishing. https://doi.org/10.1007/978-3-030-77964-1_29

<a id="34">34</a> Andrews, A. E., Dickinson, H., & Hague, J. P. (2025). *Designing cultured tissue moulds using evolutionary strategies*. arXiv. https://doi.org/10.48550/ARXIV.2508.00769

<a id="35">35</a> Andrews, A. E., Dickinson, H., & Hague, J. P. (2023). Rapid prediction of lab-grown tissue properties using deep learning. *Physical Biology, 20*(6), 066005. https://doi.org/10.1088/1478-3975/ad0019

<a id="36">36</a> Qian, W. W., Wei, J. N., Sanchez-Lengeling, B., Lee, B. K., Luo, Y., Vlot, M., Dechering, K., Peng, J., Gerkin, R. C., Wiltschko, A. B., Bhalla, U. S., & King, A. J. (2023). Metabolic activity organizes olfactory representations. *eLife, 12,* e82502. https://doi.org/10.7554/eLife.82502

> **Code**: https://github.com/osmoai/publications/tree/main/qian_et_al_2023

<a id="40">40</a> Gao, S., Zhu, R., Kong, Z., Noori, A., Su, X., Ginder, C., Tsiligkaridis, T., & Zitnik, M. (2025). *TxAgent: An AI Agent for Therapeutic Reasoning Across a Universe of Tools.* arXiv. https://doi.org/10.48550/arXiv.2503.10970

> **Code**: https://github.com/mims-harvard/TxAgent

<a id="41">41</a> Gao, S., Zhu, R., Sui, P., Kong, Z., Aldogom, S., Huang, Y., Noori, A., Shamji, R., Parvataneni, K., Tsiligkaridis, T., & Zitnik, M. (2025). *Democratizing AI scientists using ToolUniverse.* arXiv. https://doi.org/10.48550/arXiv.2509.23426

> **Code**: https://github.com/mims-harvard/ToolUniverse

<a id="42">42</a> Sypetkowski, M., Krawczyk, J., Smoliński, Ł., Kinas, R., Pietrzak, P., Jetka, T., & Powalski, R. (2026). *OmicsLM: A Multimodal Large Language Model for Multi-Sample Omics Reasoning.* arXiv. https://doi.org/10.48550/arXiv.2605.06728

<a id="43">43</a> Lee, D., Kim, D., Ko, S., Park, S.-Y., & Cho, J. (2025). *Development of an Agentic AI Model for NGS Downstream Analysis Targeting Researchers with Limited Biological Background.* arXiv. https://doi.org/10.48550/arXiv.2512.09964

<a id="44">44</a> Lála, J., O'Donoghue, O., Shtedritski, A., Cox, S., Rodriques, S. G., & White, A. D. (2023). *PaperQA: Retrieval-Augmented Generative Agent for Scientific Research.* arXiv. https://doi.org/10.48550/arXiv.2312.07559

<a id="45">45</a> Lu, C., Lu, C., Lange, R. T., Foerster, J., Clune, J., & Ha, D. (2024). *The AI Scientist: Towards Fully Automated Open-Ended Scientific Discovery.* arXiv. https://doi.org/10.48550/arXiv.2408.06292

> **Code**: https://github.com/SakanaAI/AI-Scientist

<a id="46">46</a> Skarlinski, M. D., Cox, S., Laurent, J. M., Braza, J. D., Hinks, M., Hammerling, M. J., Ponnapati, M., Rodriques, S. G., & White, A. D. (2024). *Language agents achieve superhuman synthesis of scientific knowledge.* arXiv. https://doi.org/10.48550/arXiv.2409.13740

<a id="47">47</a> Yamada, Y., Lange, R. T., Lu, C., Hu, S., Lu, C., Foerster, J., Clune, J., & Ha, D. (2025). *The AI Scientist-v2: Workshop-Level Automated Scientific Discovery via Agentic Tree Search.* arXiv. https://doi.org/10.48550/arXiv.2504.08066

> **Code**: https://github.com/SakanaAI/AI-Scientist-v2

<a id="48">48</a> Lobentanzer, S., Feng, S., Bruderer, N., Maier, A., Wang, C., Baumbach, J., Abreu-Vicente, J., Krehl, N., Ma, Q., Lemberger, T., & Saez-Rodriguez, J. (2025). A platform for the biomedical application of large language models. *Nature Biotechnology, 43*(2), 166–169. https://doi.org/10.1038/s41587-024-02534-3

> **Code**: https://github.com/biocypher/biochatter
> **Data**: https://doi.org/10.5281/zenodo.10777945

<a id="49">49</a> Huang, K., Zhang, S., Wang, H., Qu, Y., Lu, Y., Roohani, Y., Li, R., Qiu, L., Li, G., Zhang, J., Yin, D., Marwaha, S., Carter, J. N., Zhou, X., Wheeler, M., Bernstein, J. A., Wang, M., He, P., Zhou, J., Snyder, M., Cong, L., Regev, A., & Leskovec, J. (2025). *Biomni: A General-Purpose Biomedical AI Agent.* bioRxiv. https://doi.org/10.1101/2025.05.30.656746

> **Code**: https://github.com/snap-stanford/Biomni

<a id="50">50</a> Wehling, L., Singh, G., Mulyadi, A. W., Sreenath, R. H., Hermjakob, H., Nguyen, T. V. N., Rückle, T., Mosa, M. H., Cordes, H., Andreani, T., Klabunde, T., Malik Sheriff, R. S., & McCloskey, D. (2025). Talk2Biomodels: AI agent-based open-source LLM initiative for kinetic biological models. *BMC Bioinformatics, 26*(1), 276. https://doi.org/10.1186/s12859-025-06310-1

> **Code**: https://github.com/VirtualPatientEngine/AIAgents4Pharma

<a id="51">51</a> Sui, P., Li, M. M., Gao, S., Shen, W., Giunchiglia, V., Shen, A., Huang, Y., Kong, Z., & Zitnik, M. (2026). *Medea: An omics AI agent for therapeutic discovery.* bioRxiv. https://doi.org/10.64898/2026.01.16.696667

> **Code**: https://github.com/mims-harvard/Medea
> **Data**: https://huggingface.co/datasets/mims-harvard/MedeaDB

<a id="52">52</a> Mulyadi, A. W., Wehling, L., Kumar, A., Boucher, N., Abdessalem, F., Jager, S., Mosa, M. H., Klabunde, T., Andreani, T., & Singh, G. (2025). *BioMedReasoner: Towards Multi-Hop Reasoning using Path-based Relational Learning on Biomedical Knowledge Graphs* [Poster, NeurIPS 2025 AI for Science Workshop]. https://openreview.net/forum?id=FmDuKzM8f7

<a id="53">53</a> Liu, T., Han, S., Wang, H., Luo, X., Lu, P., Zhu, B., Wang, Y., Li, K., Chen, J., Qu, R., Liu, Y., Cui, X., Yaish, A., Chen, Y., Hao, M., Li, C., Li, K., Lu, Y., Wei, X., Xing, Q., Panescu, A., Wang, M., Annaswamy, V., Sanchez, A., Cloherty, J., Cohan, A., Xu, H., Gerstein, M., Zou, J., & Zhao, H. (2026). *Advancing AI Research Assistants with Expert-Involved Learning.* arXiv. https://doi.org/10.48550/arXiv.2505.04638

<a id="54">54</a> Ying, K., Tyshkovskiy, A., Moldakozhayev, A., Wang, H., Magalhães, C. G. De, Iqbal, S., Garza, A. E., Tskhay, A., Poganik, J. R., Huang, K., Qu, Y., Glubokov, D., Jin, C., Lee, D., Liu, H., Leote, C., Trapp, A., Camillo, L. P. de L., Kerepesi, C., Moqri, M., Zhang, O., Jiang, K., Galkin, F., Zhavoronkov, A., Van Raamsdonk, J. M., Wang, M., Cong, L., Regev, A., Leskovec, J., Wyss-Coray, T., & Gladyshev, V. N. (2025). *Autonomous AI Agents Discover Aging Interventions from Millions of Molecular Profiles.* bioRxiv. https://doi.org/10.1101/2023.02.28.530532

<a id="55">55</a> Sadhuka, S., Prinster, D., Fannjiang, C., Scalia, G., Regev, A., & Wang, H. (2025). *E-valuator: Reliable Agent Verifiers with Sequential Hypothesis Testing.* arXiv. https://doi.org/10.48550/arXiv.2512.03109

<a id="56">56</a> Wang, H., He, Y., Coelho, P. P., Bucci, M., Nazir, A., Chen, B., Trinh, L., Zhang, S., Huang, K., Chandrasekar, V., Chung, D. C., Hao, M., Leote, A. C., Lee, Y., Li, B., Liu, T., Liu, J., Lopez, R., Lucas, T., Ma, M., Makarov, N., McGinnis, L., Peng, L., Ra, S., Scalia, G., Singh, A., Tao, L., Uehara, M., Wang, C., Wei, R., Copping, R., Rozenblatt-Rosen, O., Leskovec, J., & Regev, A. (2025). *SpatialAgent: An autonomous AI agent for spatial biology.* bioRxiv. https://doi.org/10.1101/2025.04.03.646459

> **Code**: https://github.com/Genentech/SpatialAgent

<a id="57">57</a> Adduri, A. K., Gautam, D., Bevilacqua, B., Imran, A., Shah, R., Naghipourfar, M., Teyssier, N., Ilango, R., Nagaraj, S., Dong, M., Ricci-Tam, C., Carpenter, C., Subramanyam, V., Winters, A., Tirukkovular, S., Sullivan, J., Plosky, B. S., Eraslan, B., Youngblut, N. D., Leskovec, J., Gilbert, L. A., Konermann, S., Hsu, P. D., Dobin, A., Burke, D. P., Goodarzi, H., & Roohani, Y. H. (2025). *Predicting cellular responses to perturbation across diverse contexts with State.* bioRxiv. https://doi.org/10.1101/2025.06.26.661135

> **Code**: https://github.com/ArcInstitute/state

<a id="58">58</a> Narayanan, H., Hinckley, J., Barry, R., Dang, B., Wolffe, L., Atari, A., Tseng, Y., & Love, J. (2025). Accelerating cell culture media development using Bayesian optimization-based iterative experimental design. *Nature Communications, 16.* https://doi.org/10.1038/s41467-025-61113-5

> **Data**: https://doi.org/10.5281/zenodo.15466161

<a id="59">59</a> Antonakoudis, A., & Richelle, A. (2026). Systematic data-driven genome-scale metabolic model reduction for bioprocess modeling: CHO culture case study. *npj Systems Biology and Applications.* https://doi.org/10.1038/s41540-026-00704-4

<a id="61">61</a> Wang, W., Swain, S., Lee, J., Lin, Z., Canales, B., Aljović, A., Liu, Y., Li, Q., Marin-Llobet, A., Liu, M., Gao, Z., Liu, R., Alvarez-Dominguez, J., & Liu, J. (2025). *Agentic Lab: An Agentic-physical AI system for cell and organoid experimentation and manufacturing.* bioRxiv. https://doi.org/10.1101/2025.11.11.686354

<a id="62">62</a> Qiu, Y., Huang, Z., Wang, Z., Liu, H., Qiao, Y., Hu, Y., Sun, S., Peng, H., Xu, R. X., & Sun, M. (2025). *BioMARS: A Multi-Agent Robotic System for Autonomous Biological Experiments.* arXiv. https://doi.org/10.48550/arXiv.2507.01485

> **Code**: https://github.com/AlexandreQ27/BioMARS

<a id="63">63</a> Pandi, A., Diehl, C., Yazdizadeh Kharrazi, A., Scholz, S., Bobkova, E., Faure, L., Nattermann, M., Adam, D., Chapin, N., Foroughijabbari, Y., Moritz, C., Paczia, N., Cortina, N., Faulon, J.-L., & Erb, T. J. (2022). A versatile active learning workflow for optimization of genetic and metabolic networks. *Nature Communications, 13*(1). https://doi.org/10.1038/s41467-022-31245-z

<a id="64">64</a> Tiukova, I. A., Brunnsåker, D., Bjurström, E. Y., Gower, A. H., Kronström, F., Reder, G. K., Reiserer, R. S., Korovin, K., Soldatova, L. B., Wikswo, J. P., & King, R. D. (2024). *Genesis: Towards the Automation of Systems Biology Research.* arXiv. https://doi.org/10.48550/arXiv.2408.10689

<a id="65">65</a> Brunnsåker, D., Gower, A., Naval, P., Bjurström, E., Kronström, F., Tiukova, I., & King, R. (2025). *Agentic AI Integrated with Scientific Knowledge: Laboratory Validation in Systems Biology.* bioRxiv. https://doi.org/10.1101/2025.06.24.661378

> **Code**: https://github.com/DanielBrunnsaker/GenExp
> **Data**: https://doi.org/10.5281/zenodo.15730908

<a id="66">66</a> Singh, A., Kaufmann-Malaga, B., Lerman, J., Dougherty, D., Zhang, Y., Kilbo, A., Wilson, E., Ng, C., Erbilgin, O., Curran, K., Reeves, C., Hung, J., Mantovani, S., King, Z., Ayson, M., Denery, J., Lu, C., Norton, P., Tran, C., Platt, D., Cherry, J., Chandran, S., & Meadows, A. (2023). *An Automated Scientist to Design and Optimize Microbial Strains for the Industrial Production of Small Molecules.* bioRxiv. https://doi.org/10.1101/2023.01.03.521657

<a id="67">67</a> Ruscone, M., Vazquez, M., & Valencia, A. (2025). *Intelligent Tool Orchestration for Rapid Mechanistic Model Prototyping: MCP Servers as AI-Biology Interfaces.* bioRxiv. https://doi.org/10.1101/2025.09.10.675105

<a id="68">68</a> Li, X., Liang, Z., Guo, Z., Liu, Z., Wu, K., Luo, J., Zhang, Y., Liu, L., Sun, M., Huang, Y., Tang, H., Chen, Y., Yu, T., Nielsen, J., & Li, F. (2024). *Leveraging large language models for metabolic engineering design.* bioRxiv. https://doi.org/10.1101/2024.09.09.612023

> **Code**: https://github.com/LiLabTsinghua/D2Cell

<a id="69">69</a> Maeda, K., & Kurata, H. (2023). Automatic Generation of SBML Kinetic Models from Natural Language Texts Using GPT. *International Journal of Molecular Sciences, 24*(8), 7296. https://doi.org/10.3390/ijms24087296

> **Code**: https://github.com/kmaeda16/KinModGPT

<a id="70">70</a> Boiko, D. A., MacKnight, R., Kline, B., & Gomes, G. (2023). Autonomous chemical research with large language models. *Nature, 624,* 570–578. https://doi.org/10.1038/s41586-023-06792-0

<a id="71">71</a> Bran, A. M., Cox, S., Schilter, O., Baldassari, C., White, A. D., & Schwaller, P. (2024). Augmenting large language models with chemistry tools. *Nature Machine Intelligence.* https://doi.org/10.1038/s42256-024-00832-8

> **Code**: https://github.com/ur-whitelab/chemcrow-public, https://github.com/ur-whitelab/chemcrow-runs

<a id="72">72</a> Colantonio, V., Ferrão, L. F. V., Tieman, D. M., Bliznyuk, N., Sims, C., Klee, H. J., Munoz, P., & Resende, M. F. R. (2022). Metabolomic selection for enhanced fruit flavor. *Proceedings of the National Academy of Sciences, 119*(7), e2115865119. https://doi.org/10.1073/pnas.2115865119

> **Code**: https://github.com/Resende-Lab/metabolomic_selection_for_enhanced_fruit_flavor

<a id="80">80</a> Keller, A., Gerkin, R. C., Guan, Y., Dhurandhar, A., Turu, G., Szalai, B., Mainland, J. D., Ihara, Y., Yu, C. W., Wolfinger, R., Vens, C., Schietgat, L., De Grave, K., Norel, R., DREAM Olfaction Prediction Consortium, Stolovitzky, G., Cecchi, G. A., Vosshall, L. B., & Meyer, P. (2017). Predicting human olfactory perception from chemical features of odor molecules. *Science, 355*(6327), 820–826. https://doi.org/10.1126/science.aal2014

<a id="88">88</a> Su, Y., Chen, J., Jiang, Z., Zhong, Z., Wang, L., Liu, Q., & Zhang, Z. (2026). *SpectraLLM: Uncovering the Ability of LLMs for Molecular Structure Elucidation from Multi-Spectral Data.* arXiv. https://doi.org/10.48550/arXiv.2508.08441

<a id="89">89</a> Brouwer, E., Edwards, C., Wu, A., Collier, J., Heimberg, G., Li, X., Subramaniam, M., Hajiramezanali, E., Richmond, D., Hütter, J., Mostafavi, S., & Scalia, G. (2026). *AssayBench: An Assay-Level Virtual Cell Benchmark for LLMs and Agents.* arXiv. https://doi.org/10.48550/arXiv.2605.10876

<a id="90">90</a> Yu, X., Yang, Y., Liu, Q., Du, Y., McSweeney, S., & Lin, Y. (2026). *GenCellAgent: Generalizable, Training-Free Cellular Image Segmentation via Large Language Model Agents.* arXiv. https://doi.org/10.48550/arXiv.2510.13896

<a id="91">91</a> Ding, Y., Qiang, B., Li, S., Zhou, Y., Yu, J., Li, Q., Shi, C., Zhang, L., Wang, Y., Zheng, N., & Liu, Z. (2026). Pretraining a foundation model for small-molecule natural products. *Nature Machine Intelligence*. https://doi.org/10.1038/s42256-026-01226-8

> **Code**: https://github.com/mwang87/NP-Classifier

<a id="92">92</a> Pearce, J., Simmonds, S., Mahmoudabadi, G., Krishnan, L., Palla, G., Istrate, A., Tarashansky, A., Nelson, B., Valenzuela, O., Li, D., Quake, S., & Karaletsos, T. (2026). TranscriptFormer: A generative cell atlas across 1.5 billion years of evolution. *Science*. https://doi.org/10.1126/science.aec8514

> **Code**: https://virtualcellmodels.cziscience.com/model/transcriptformer

<a id="93">93</a> Tang, X., Yu, Z., Chen, J., Cui, Y., Shao, D., Wang, W., Wu, F., Zhuang, Y., Shi, W., Huang, Z., Cohan, A., Lin, X., Theis, F., Krishnaswamy, S., & Gerstein, M. (2026). *CellForge: Agentic Design of Virtual Cell Models.* arXiv. https://doi.org/10.48550/arXiv.2508.02276

> **Code**: https://github.com/gersteinlab/CellForge

<a id="94">94</a> Pickard, J., Prakash, R., Choi, M., Oliven, N., Stansbury, C., Cwycyshyn, J., Galioto, N., Gorodetsky, A., Velasquez, A., & Rajapakse, I. (2025). Automatic biomarker discovery and enrichment with BRAD. *Bioinformatics, 41*, btaf159. https://doi.org/10.1093/bioinformatics/btaf159

> **Code**: https://github.com/Jpickard1/BRAD

<a id="95">95</a> Riffle, D., Shirooni, N., He, C., Murali, M., Nayak, S., Gopalan, R., & Lopez, D. (2025). *OLAF: An Open Life Science Analysis Framework for Conversational Bioinformatics Powered by Large Language Models.* arXiv. https://doi.org/10.48550/arXiv.2504.03976

<a id="96">96</a> Jin, R., Zhang, Z., Wang, M., & Cong, L. (2025). *STELLA: Self-Evolving LLM Agent for Biomedical Research.* arXiv. https://doi.org/10.48550/arXiv.2507.02004

<a id="97">97</a> Hao, M., Lee, Y., Wang, H., Scalia, G., & Regev, A. (2025). *PerTurboAgent: A Self-Planning Agent for Boosting Sequential Perturb-seq Experiments.* bioRxiv. https://doi.org/10.1101/2025.05.25.656020

<a id="98">98</a> Dong, Z., Zhou, H., Jiang, Y., Zhong, V., & Lu, Y. (2024). *Simplifying bioinformatics data analysis through conversation* [BioMANIA]. bioRxiv. https://doi.org/10.1101/2023.10.29.564479

<a id="102">102</a> Dagan-Wiener, A., Nissim, I., Ben Abu, N., Borgonovo, G., Bassoli, A., & Niv, M. Y. (2017). Bitter or not? BitterPredict, a tool for predicting taste from chemical structure. *Scientific Reports, 7*(1), 12074. https://doi.org/10.1038/s41598-017-12359-7

<a id="103">103</a> Margulis, E., Dagan-Wiener, A., Ives, R. S., Jaffari, S., Siems, K., & Niv, M. Y. (2021). Intense bitterness of molecules: Machine learning for expediting drug discovery. *Computational and Structural Biotechnology Journal, 19,* 568–576. https://doi.org/10.1016/j.csbj.2020.12.030

<a id="104">104</a> Margulis, E., Slavutsky, Y., Lang, T., Behrens, M., Benjamini, Y., & Niv, M. Y. (2022). BitterMatch: recommendation systems for matching molecules with bitter taste receptors. *Journal of Cheminformatics, 14*(1), 45. https://doi.org/10.1186/s13321-022-00612-9

> **Code**: https://github.com/YuliSl/BitterMatch

<a id="105">105</a> Ziaikin, E., Tello, E., Peterson, D. G., & Niv, M. Y. (2024). BitterMasS: Predicting Bitterness from Mass Spectra. *Journal of Agricultural and Food Chemistry, 72*(18), 10537–10547. https://doi.org/10.1021/acs.jafc.3c09767

<a id="108">108</a> Mitchener, L., Laurent, J. M., Andonian, A., Tenmann, B., Narayanan, S., Wellawatte, G. P., White, A. D., Sani, L., & Rodriques, S. G. (2025). *BixBench: a Comprehensive Benchmark for LLM-based Agents in Computational Biology.* arXiv. https://doi.org/10.48550/arXiv.2503.00096

> **Code**: https://github.com/Future-House/BixBench

<a id="109">109</a> Bushuiev, R., Bushuiev, A., de Jonge, N. F., Young, A., Kretschmer, F., Samusevich, R., Heirman, J., Wang, F., Zhang, L., Dührkop, K., Ludwig, M., Haupt, N. A., Kalia, A., Brungs, C., Schmid, R., Greiner, R., Wang, B., Wishart, D. S., Liu, L.-P., Rousu, J., Bittremieux, W., Rost, H., Mak, T. D., Hassoun, S., Huber, F., van der Hooft, J. J. J., Stravs, M. A., Böcker, S., Sivic, J., & Pluskal, T. (2024). *MassSpecGym: A benchmark for the discovery and identification of molecules.* arXiv (NeurIPS 2024 Spotlight). https://doi.org/10.48550/arXiv.2410.23326

> **Code**: https://github.com/pluskal-lab/MassSpecGym

<a id="110">110</a> Sze, A., & Hassoun, S. (2024). Evaluation of search-enabled pretrained Large Language Models on retrieval tasks for the PubChem database. *Bioinformatics Advances, 5*(1), vbaf064. https://doi.org/10.1093/bioadv/vbaf064

<a id="111">111</a> Theodoris, C. V., Xiao, L., Chopra, A., Chaffin, M. D., Al Sayed, Z. R., Hill, M. C., Mantineo, H., Brydon, E. M., Zeng, Z., Liu, X. S., & Ellinor, P. T. (2023). Transfer learning enables predictions in network biology. *Nature, 618*(7965), 616–624. https://doi.org/10.1038/s41586-023-06139-9

> **Code**: https://huggingface.co/ctheodoris/Geneformer

<a id="112">112</a> Yang, F., Wang, W., Wang, F., Fang, Y., Tang, D., Huang, J., Lu, H., & Yao, J. (2022). scBERT as a large-scale pretrained deep language model for cell type annotation of single-cell RNA-seq data. *Nature Machine Intelligence, 4*(10), 852–866. https://doi.org/10.1038/s42256-022-00534-z

> **Code**: https://github.com/TencentAILabHealthcare/scBERT

<a id="115">115</a> Shen, H., Liu, J., Hu, J., Shen, X., Zhang, C., Wu, D., Feng, M., Yang, M., Li, Y., Yang, Y., Wang, W., Zhang, Q., Yang, J., Chen, K., & Li, X. (2023). Generative pretraining from large-scale transcriptomes for single-cell deciphering. *iScience, 26*(5), 106536. https://doi.org/10.1016/j.isci.2023.106536

> **Code**: https://github.com/deeplearningplus/tGPT

<a id="116">116</a> Hao, M., Gong, J., Zeng, X., Liu, C., Guo, Y., Cheng, X., Wang, T., Ma, J., Zhang, X., & Song, L. (2024). Large-scale foundation model on single-cell transcriptomics. *Nature Methods, 21*(8), 1481–1491. https://doi.org/10.1038/s41592-024-02305-7

> **Code**: https://github.com/biomap-research/scFoundation

<a id="117">117</a> Cui, H., Wang, C., Maan, H., Pang, K., Luo, F., Duan, N., & Wang, B. (2024). scGPT: toward building a foundation model for single-cell multi-omics using generative AI. *Nature Methods, 21*(8), 1470–1480. https://doi.org/10.1038/s41592-024-02201-0

> **Code**: https://github.com/bowang-lab/scGPT

<a id="118">118</a> Rosen, Y., Brbić, M., Roohani, Y., Swanson, K., Li, Z., & Leskovec, J. (2024). Toward universal cell embeddings: integrating single-cell RNA-seq datasets across species with SATURN. *Nature Methods, 21*(8), 1492–1500. https://doi.org/10.1038/s41592-024-02191-z

<a id="119">119</a> Rosen, Y., Roohani, Y., Agrawal, A., Samotorčan, L., Tabula Sapiens Consortium, Quake, S. R., & Leskovec, J. (2026). *Universal Cell Embeddings: A Foundation Model for Cell Biology.* bioRxiv. https://doi.org/10.1101/2023.11.28.568918

> **Code**: https://github.com/snap-stanford/UCE

<a id="120">120</a> Rizvi, S. A., Levine, D., Patel, A., Zhang, S., Wang, E., Perry, C. J., Vrkic, I., Constante, N. M., Fu, Z., He, S., Zhang, D., Tang, C., Lyu, Z., Darji, R., Li, C., Sun, E., Jeong, D., Zhao, L., Kwan, J., Braun, D., Hafler, B., Chung, H., Dhodapkar, R. M., Jaeger, P., Perozzi, B., Ishizuka, J., Azizi, S., & van Dijk, D. (2026). *Scaling Large Language Models for Next-Generation Single-Cell Analysis.* bioRxiv. https://doi.org/10.1101/2025.04.14.648850

> **Code**: https://github.com/vandijklab/cell2sentence

<a id="121">121</a> Roohani, Y., Huang, K., & Leskovec, J. (2024). Predicting transcriptional outcomes of novel multigene perturbations with GEARS. *Nature Biotechnology, 42*(6), 927–935. https://doi.org/10.1038/s41587-023-01905-6

> **Code**: https://github.com/snap-stanford/GEARS

<a id="122">122</a> Magnusson, J. P., Roohani, Y., Stauber, D., Situ, Y., Teba, P. R. de C., Sandberg, R., Leskovec, J., & Qi, L. S. (2024). *PreciCE: Precision engineering of cell fates via data-driven multi-gene control of transcriptional networks.* bioRxiv. https://doi.org/10.1101/2024.11.04.621938

> **Code**: https://github.com/snap-stanford/precice

<a id="123">123</a> Littman, R., Levine, J., Maleki, S., Lee, Y., Ermakov, V., Qiu, L., Wu, A., Huang, K., Lopez, R., Scalia, G., Biancalani, T., Richmond, D., Regev, A., & Hütter, J. C. (2025). *Gene-embedding-based prediction and functional evaluation of perturbation expression responses with PRESAGE.* bioRxiv. https://doi.org/10.1101/2025.06.03.657653

<a id="124">124</a> Dong, M., Adduri, A., Gautam, D., Carpenter, C., Shah, R., Ricci-Tam, C., Kluger, Y., Burke, D. P., & Roohani, Y. H. (2026). *Stack: In-Context Learning of Single-Cell Biology.* bioRxiv. https://doi.org/10.64898/2026.01.09.698608

> **Models**: https://huggingface.co/arcinstitute/Stack-CellxGene45M, https://huggingface.co/arcinstitute/Stack-Large, https://huggingface.co/arcinstitute/Stack-Large-Aligned

<a id="125">125</a> Roohani, Y., Lee, A., Huang, Q., Vora, J., Steinhart, Z., Huang, K., Marson, A., Liang, P., & Leskovec, J. (2025). *BioDiscoveryAgent: An AI Agent for Designing Genetic Perturbation Experiments.* arXiv. https://doi.org/10.48550/arXiv.2405.17631

> **Code**: https://github.com/snap-stanford/BioDiscoveryAgent

<a id="126">126</a> Youngblut, N. D., Carpenter, C., Nayebnazar, A., Adduri, A., Shah, R., Ricci-Tam, C., Prashar, J., Ilango, R., Teyssier, N., Konermann, S., Hsu, P. D., Dobin, A., Burke, D. P., Goodarzi, H., & Roohani, Y. H. (2025). *scBaseCount: an AI agent-curated, uniformly processed, and autonomously updated single cell data repository.* bioRxiv. https://doi.org/10.1101/2025.02.27.640494

> **Code**: https://github.com/ArcInstitute/scRecounter, https://github.com/ArcInstitute/tiledb-soma-loader, https://github.com/ArcInstitute/scBaseCount_analysis

<a id="127">127</a> Chevalley, M., Roohani, Y. H., Mehrjou, A., Leskovec, J., & Schwab, P. (2025). A large-scale benchmark for network inference from single-cell perturbation data. *Communications Biology, 8*(1), 412. https://doi.org/10.1038/s42003-025-07764-y

> **Code**: https://github.com/causalbench/causalbench

<a id="133">133</a> Kuehl, M., Schaub, D. P., Carli, F., Heumos, L., Hellmig, M., Fernández-Zapata, C., Kaiser, N., Schaul, J., Kulaga, A., Usanov, N., Krebs, C. F., Panzer, U., Bonn, S., Lobentanzer, S., Saez-Rodriguez, J., & Puelles, V. G. (2025). BioContextAI is a community hub for agentic biomedical systems. *Nature Biotechnology, 43*(11), 1755–1757. https://doi.org/10.1038/s41587-025-02900-9

> **Code**: https://github.com/biocontext-ai

> **Code**: https://github.com/biocontext-ai/registry, https://github.com/biocontext-ai/knowledgebase-mcp

<a id="145">145</a> Xiao, W., Zheng, J., & Li, S. Z. (2026). *MetaGEM: Bottom-Up Reconstruction of Genome-Scale Metabolic Networks via Deep Enzyme-Metabolite Interaction Modeling.* arXiv. https://doi.org/10.48550/arXiv.2605.14812

<a id="146">146</a> Laurent, J. M., Janizek, J. D., Ruzo, M., Hinks, M. M., Hammerling, M. J., Narayanan, S., Ponnapati, M., White, A. D., & Rodriques, S. G. (2024). *LAB-Bench: Measuring Capabilities of Language Models for Biology Research.* arXiv. https://doi.org/10.48550/arXiv.2407.10362

> **Code**: https://github.com/Future-House/lab-bench

<a id="147">147</a> Gu, K., Shang, R., Jiang, R., Kuang, K., Lin, R.-J., Lyu, D., Mao, Y., Pan, Y., Wu, T., Yu, J., Zhang, Y., Zhang, T. M., Zhu, L., Merrill, M. A., Heer, J., & Althoff, T. (2025). *BLADE: Benchmarking Language Model Agents for Data-Driven Science.* arXiv. https://doi.org/10.48550/arXiv.2408.09667

> **Code**: https://blade-bench.github.io/

<a id="148">148</a> Notin, P., Kollasch, A. W., Ritter, D., van Niekerk, L., Paul, S., Spinner, H., Rollins, N., Shaw, A., Weitzman, R., Frazer, J., Dias, M., Franceschi, D., Orenbuch, R., Gal, Y., & Marks, D. S. (2023). *ProteinGym: Large-Scale Benchmarks for Protein Design and Fitness Prediction.* bioRxiv. https://doi.org/10.1101/2023.12.07.570727

> **Code**: https://github.com/OATML-Markslab/ProteinGym

<a id="149">149</a> Duan, H., Lu, S. Z., Harrigan, C. F., Desai, N., Lu, J., Koziarski, M., Cotta, L., & Maddison, C. J. (2025). *Measuring Scientific Capabilities of Language Models with a Systems Biology Dry Lab.* arXiv. https://doi.org/10.48550/arXiv.2507.02083

<a id="150">150</a> Nair, S., Gunsalus, L., Orcutt-Jahns, B., Rossen, J., Lal, A., De Donno, C., Çelik, M. H., Fletez-Brant, K., Xie, X., Corrada Bravo, H., & Eraslan, G. (2026). *Agentic systems are adept at solving well-scoped, verifiable problems in computational biology.* bioRxiv. https://doi.org/10.64898/2026.04.06.716850

> **Code**: https://github.com/Genentech/compbiobench-runner
> **Data**: https://doi.org/10.5281/zenodo.19443185

<a id="153">153</a> Gottweis, J., Weng, W.-H., Daryin, A., Tu, T., Sirkovic, P., Myaskovsky, A., Glowaty, G., Weissenberger, F., Orlandi, A., Popovici, D., Palepu, A., Rong, K., Tanno, R., Saab, K., Zhang, F., Blum, J., Carroll, A., Kulkarni, K., Tomašev, N., ... Natarajan, V. (2026). Accelerating scientific discovery with Co-Scientist. *Nature.* https://doi.org/10.1038/s41586-026-10644-y

<a id="154">154</a> Ghareeb, A. E., Chang, B., Mitchener, L., Yiu, A., Szostkiewicz, C. J., Shved, D., Gyimesi, G. J., Laurent, J. M., Wright, S. M., Razzak, M. T., White, A. D., Finnemann, S. C., Hinks, M. M., & Rodriques, S. G. (2026). A multi-agent system for automating scientific discovery [Robin]. *Nature.* https://doi.org/10.1038/s41586-026-10652-y

> **Code**: https://github.com/Future-House/robin

> **Data**: https://www.ncbi.nlm.nih.gov/bioproject/?term=PRJNA1464762 (`PRJNA1464762`)

<a id="155">155</a> Jimenez, C. E., Yang, J., Wettig, A., Yao, S., Pei, K., Press, O., & Narasimhan, K. (2024). *SWE-bench: Can Language Models Resolve Real-World GitHub Issues?* arXiv. https://doi.org/10.48550/arXiv.2310.06770

> **Code**: https://github.com/SWE-bench/SWE-bench

<a id="156">156</a> Rein, D., Hou, B. L., Stickland, A. C., Petty, J., Pang, R. Y., Dirani, J., Michael, J., & Bowman, S. R. (2023). *GPQA: A Graduate-Level Google-Proof Q&A Benchmark.* arXiv. https://doi.org/10.48550/arXiv.2311.12022

> **Code**: https://github.com/idavidrein/gpqa

<a id="157">157</a> Wang, Y., Ma, X., Zhang, G., Ni, Y., Chandra, A., Guo, S., Ren, W., Arulraj, A., He, X., Jiang, Z., Li, T., Ku, M., Wang, K., Zhuang, A., Fan, R., Yue, X., & Chen, W. (2024). *MMLU-Pro: A More Robust and Challenging Multi-Task Language Understanding Benchmark.* arXiv. https://doi.org/10.48550/arXiv.2406.01574

> **Code**: https://github.com/TIGER-AI-Lab/MMLU-Pro

<a id="158">158</a> Center for AI Safety, Phan, L., Gatti, A., Li, N., Khoja, A., Kim, R., Ren, R., Hausenloy, J., Zhang, O., Mazeika, M., Hendrycks, D., Scale AI, Han, Z., Hu, J., Zhang, H., Zhang, C. B. C., Shaaban, M., Ling, J., Shi, S., ... Scaramuzza, D. (2026). A benchmark of expert-level academic questions to assess AI capabilities [Humanity's Last Exam]. *Nature, 649*(8099), 1139–1146. https://doi.org/10.1038/s41586-025-09962-4

> **Code**: https://github.com/centerforaisafety/hle

<a id="159">159</a> Wang, M., Lin, R., Hu, K., Jiao, J., Chowdhury, N., Chang, E., & Patwardhan, T. (2026). *FrontierScience: Evaluating AI's Ability to Perform Expert-Level Scientific Tasks.* arXiv. https://doi.org/10.48550/arXiv.2601.21165

> **Data**: https://huggingface.co/datasets/openai/frontierscience

<a id="160">160</a> Narayanan, S., Braza, J. D., Griffiths, R.-R., Ponnapati, M., Bou, A., Laurent, J., Kabeli, O., Wellawatte, G., Cox, S., Rodriques, S. G., & White, A. D. (2024). *Aviary: Training Language Agents on Challenging Scientific Tasks.* arXiv. https://doi.org/10.48550/arXiv.2412.21154

> **Code**: https://github.com/Future-House/aviary

<a id="161">161</a> Narayanan, S. M., Braza, J. D., Griffiths, R.-R., Bou, A., Wellawatte, G., Ramos, M. C., Mitchener, L., Rodriques, S. G., & White, A. D. (2025). *Training a Scientific Reasoning Model for Chemistry* [ether0]. arXiv. https://doi.org/10.48550/arXiv.2506.17238

> **Code**: https://github.com/Future-House/ether0

<a id="162">162</a> Qiao, S., Wei, Y., Fan, J., Wu, B., Zhang, B., Wang, M., Zhu, Y., Zhang, N., Ding, K., Zhang, Q., & Chen, H. (2026). *SciAtlas: A Large-Scale Knowledge Graph for Automated Scientific Research.* arXiv. https://doi.org/10.48550/arXiv.2605.22878

> **Code**: https://github.com/zjunlp/SciAtlas

<a id="164">164</a> Huang, X., Xiao, M., Qin, C., Long, Q., Chen, J., Zhou, Y., & Zhu, H. (2026). *SciHorizon-GENE: Benchmarking LLM for Life Sciences Inference from Gene Knowledge to Functional Understanding.* arXiv. https://doi.org/10.48550/arXiv.2601.12805

> **Code**: https://github.com/CNIC-DSL/SciHorizonGene

> **Data**: https://huggingface.co/datasets/HankHuang/SciHorizon-Gene

<a id="165">165</a> Wu, D., Su, S., Zhang, Y., Sui, E., Lundberg, E., Fox, E. B., & Yeung-Levy, S. (2026). *CellFluxRL: Biologically-Constrained Virtual Cell Modeling via Reinforcement Learning.* arXiv. https://doi.org/10.48550/arXiv.2603.21743

<a id="166">166</a> Aygün, E., Belyaeva, A., Comanici, G., Coram, M., Cui, H., Garrison, J., Johnston, R., Kast, A., McLean, C. Y., Norgaard, P., Shamsi, Z., Smalling, D., Thompson, J., Venugopalan, S., Williams, B. P., He, C., Martinson, S., Plomecka, M., Wei, L., ... Brenner, M. P. (2026). An AI system to help scientists write expert-level empirical software. *Nature.* https://doi.org/10.1038/s41586-026-10658-6

> **Code**: https://github.com/google-research/era

<a id="167">167</a> Singh, G., Wehling, L., Mulyadi, A. W., Sreenath, R. H., Klabunde, T., Andreani, T., & McCloskey, D. (2025). *Talk2Biomodels and Talk2KnowledgeGraphs: AI agent-based application for prediction of patient biomarkers and reasoning over biomedical knowledge graphs* [ICLR 2025 Workshop MLGenX]. https://openreview.net/forum?id=av4QhBNeZo

<a id="169">169</a> Hashizume, T., & Ying, B.-W. (2025). Biology-aware machine learning for culture medium optimization. *New Biotechnology, 89*, 141–151. https://doi.org/10.1016/j.nbt.2025.07.006

<a id="170">170</a> Gangwar, N., Balraj, K., & Rathore, A. S. (2024). Explainable AI for CHO cell culture media optimization and prediction of critical quality attribute. *Applied Microbiology and Biotechnology, 108*(1), 308. https://doi.org/10.1007/s00253-024-13147-w

<a id="171">171</a> Kircali Ata, S., Shi, J. K., Yao, X., Hua, X. Y., Haldar, S., Chiang, J. H., & Wu, M. (2023). Predicting the Textural Properties of Plant-Based Meat Analogs with Machine Learning. *Foods, 12*(2), 344. https://doi.org/10.3390/foods12020344

<a id="182">182</a> King, R. D., Whelan, K. E., Jones, F. M., Reiser, P. G. K., Bryant, C. H., Muggleton, S. H., Kell, D. B., & Oliver, S. G. (2004). Functional genomic hypothesis generation and experimentation by a robot scientist. *Nature, 427*(6971), 247–252. https://doi.org/10.1038/nature02236

<a id="195">195</a> Ulucan, O., Karakaya, D., & Turkan, M. (2019). Meat Quality Assessment based on Deep Learning. *2019 Innovations in Intelligent Systems and Applications Conference (ASYU)*, 1–5. https://doi.org/10.1109/ASYU48272.2019.8946388

<a id="196">196</a> Gyening, R.-M. O. M., Akoto, M. A., Owusu-Agyemang, K., Amoako-Banning, L., Takyi, K., & Appiahene, P. (2025). MeatScan: An image dataset for machine learning-based classification of fresh and spoiled cow meat. *Data in Brief, 62*, 112045. https://doi.org/10.1016/j.dib.2025.112045
> **Data**: https://doi.org/10.5281/zenodo.16764338

<a id="197">197</a> Radzikowski, J., & Chen, J. (2026). Epicure: Navigating the Emergent Geometry of Food Ingredient Embeddings. *arXiv*. https://doi.org/10.48550/arXiv.2605.22391

<a id="200">200</a> Petsagkourakis, P., Sandoval, I. O., Bradford, E., Zhang, D., & del Rio-Chanona, E. A. (2020). Reinforcement learning for batch bioprocess optimization. *Computers & Chemical Engineering, 133*, 106649. https://doi.org/10.1016/j.compchemeng.2019.106649

<a id="201">201</a> Oh, T. H., Park, H. M., Kim, J. W., & Lee, J. M. (2022). Integration of reinforcement learning and model predictive control to optimize semi-batch bioreactor. *AIChE Journal, 68*(6), e17658. https://doi.org/10.1002/aic.17658

<a id="202">202</a> Rajasekhar, N., Radhakrishnan, T. K., & Mohamed, S. N. (2024). Reinforcement learning based temperature control of a fermentation bioreactor for ethanol production. *Biotechnology and Bioengineering, 121*(10), 3114–3127. https://doi.org/10.1002/bit.28784

<a id="203">203</a> Wu, J., & Cui, J. (2025). Multi-objective optimal control of lysine fed-batch based on reinforcement learning. In *Fourth International Conference on High Performance Computing and Communication Engineering (HPCCE 2024)* (Vol. 13630). SPIE. https://doi.org/10.1117/12.3059597

<a id="204">204</a> Chiu, K.-C., & Du, D. (2025). Neural ordinary differential equation-based model predictive controller for regulating glucose concentration in a fed-batch CHO cell bioreactor. *The Canadian Journal of Chemical Engineering, 103*(9), 4329–4342. https://doi.org/10.1002/cjce.25623

<a id="205">205</a> Yang, S., Fahey, W., Truccollo, B., Browning, J., Kamyar, R., & Cao, H. (2024). Hybrid modeling of fed-batch cell culture using physics-informed neural network. *Industrial & Engineering Chemistry Research, 63*(39), 16833–16846. https://doi.org/10.1021/acs.iecr.4c01459

<a id="206">206</a> Hevaganinge, A., Weber, C. M., Filatova, A., Musser, A., Neri, A., Conway, J., Yuan, Y., Cattaneo, M., Clyne, A. M., & Tao, Y. (2023). Fast-training deep learning algorithm for multiplex quantification of mammalian bioproduction metabolites via contactless short-wave infrared hyperspectral sensing. *ACS Omega, 8*(16), 14774–14783. https://doi.org/10.1021/acsomega.3c00861

<a id="207">207</a> Behdani, A. M., Zhao, Y., Yao, G., Wasalathanthri, D., Hodgman, E., Borys, M., Li, G., Khetan, A., Wijesinghe, D., & Leone, A. (2024). Rapid total sialic acid monitoring during cell culture process using a machine learning model based soft sensor. *Biotechnology Progress, 40*(6), e3493. https://doi.org/10.1002/btpr.3493

<a id="208">208</a> Xu, F., Pinto, N., Zhou, G., & Ahuja, S. (2025). Enhancing real-time cell culture process monitoring through the integration of advanced machine learning techniques: A comparative analysis of Raman and capacitance spectroscopies. *Biotechnology Progress, 41*(3), e70013. https://doi.org/10.1002/btpr.70013

<a id="209">209</a> Takahashi, M. B., Rocha, J. C., & Fernández Núñez, E. G. (2016). Optimization of artificial neural network by genetic algorithm for describing viral production from uniform design data. *Process Biochemistry, 51*(3), 422–430. https://doi.org/10.1016/j.procbio.2015.12.005

<a id="210">210</a> Munroe, S., Sandoval, K., Martens, D. E., Sipkema, D., & Pomponi, S. A. (2019). Genetic algorithm as an optimization tool for the development of sponge cell culture media. *In Vitro Cellular & Developmental Biology - Animal, 55*(3), 149–158. https://doi.org/10.1007/s11626-018-00317-0

<a id="211">211</a> Cosenza, Z., Block, D. E., & Baar, K. (2021). Optimization of muscle cell culture media using nonlinear design of experiments. *Biotechnology Journal, 16*(11), 2100228. https://doi.org/10.1002/biot.202100228

> **Code**: https://github.com/ZacharyCosenza/GradStuff_Cosenza

<a id="212">212</a> Tu, F., Bhat, M., Blondin, P., Vincent, P., Sharafi, M., & Benson, J. D. (2022). Machine learning and hypothesis driven optimization of bull semen cryopreservation media. *Scientific Reports, 12*(1), 22328. https://doi.org/10.1038/s41598-022-25104-6

<a id="213">213</a> Grzesik, P., & Warth, S. C. (2021). One-time optimization of advanced T cell culture media using a machine learning pipeline. *Frontiers in Bioengineering and Biotechnology, 9*, 614324. https://doi.org/10.3389/fbioe.2021.614324

<a id="214">214</a> Nair, M., Bica, I., Best, S. M., & Cameron, R. E. (2021). Feature importance in multi-dimensional tissue-engineering datasets: Random forest assisted optimization of experimental variables for collagen scaffolds. *Applied Physics Reviews, 8*(4), 041403. https://doi.org/10.1063/5.0059724

<a id="215">215</a> Shin, J., Kang, R., Hyun, K., Li, Z., Kumar, H., Kim, K., Park, S. S., & Kim, K. (2025). Machine learning-enhanced optimization for high-throughput precision in cellular droplet bioprinting. *Advanced Science, 12*(20), 2412831. https://doi.org/10.1002/advs.202412831

<a id="216">216</a> Golbabaei, M. H., Saeidi Varnoosfaderani, M., Hemmati, F., Barati, M. R., Pishbin, F., & Seyyed Ebrahimi, S. A. (2024). Machine learning-guided morphological property prediction of 2D electrospun scaffolds: The effect of polymer chemical composition and processing parameters. *RSC Advances, 14*(22), 15178–15199. https://doi.org/10.1039/d4ra01257g

<a id="217">217</a> Serpe, M., Lee, C., Povinelli, R., Thyden, R., Perreault, L., He, K., Gaudette, G. R., dos Santos, A. C. F., & Ranger, B. J. (2025). Ultrasound imaging and machine learning for nondestructive sensing in bioreactors. *ACS Omega, 10*(34), 39203–39211. https://doi.org/10.1021/acsomega.5c06107

<a id="218">218</a> Yang, L., Wu, Z., Zhu, H., Ding, S., & Zhou, G. (2025). A method for evaluating the degree of adipogenic differentiation of porcine cells cultured in suspension based on deep learning. *Food Research International, 212*, 116324. https://doi.org/10.1016/j.foodres.2025.116324

<a id="219">219</a> Matsumoto, N., Choi, H., Moran, J., Hernandez, M. E., Venkatesan, M., Li, X., Chang, J.-H., Wang, P., & Moore, J. H. (2025). ESCARGOT: an AI agent leveraging large language models, dynamic graph of thoughts, and biomedical knowledge graphs for enhanced reasoning. *Bioinformatics, 41*(2), btaf031. https://doi.org/10.1093/bioinformatics/btaf031

> **Code**: https://github.com/EpistasisLab/ESCARGOT

<a id="220">220</a> Glen, A. K., Deutsch, E. W., & Ramsey, S. A. (2025). PloverDB: a high-performance platform for serving biomedical knowledge graphs as standards-compliant web APIs. *Bioinformatics, 41*(7), btaf380. https://doi.org/10.1093/bioinformatics/btaf380

> **Code**: https://github.com/RTXteam/PloverDB

<a id="221">221</a> Feng, Y., Wang, J., He, R., Zhou, L., & Li, Y. (2025). A retrieval-augmented knowledge mining method with deep thinking LLMs for biomedical research and clinical support. *GigaScience, 14*, giaf109. https://doi.org/10.1093/gigascience/giaf109

<a id="222">222</a> Gandhi, K., Bolliet, B., & Zubeldia, I. (2025). *Enhancing agentic autonomous scientific discovery with vision-language model capabilities.* arXiv. https://doi.org/10.48550/arXiv.2511.14631

<a id="223">223</a> Zhang, F., Zhao, Y., Zhang, W., & Lai, L. (2025). *BioScientist Agent: Designing LLM-biomedical agents with KG-augmented RL reasoning modules for drug repurposing and mechanistic of action elucidation.* bioRxiv. https://doi.org/10.1101/2025.08.08.669291

<a id="224">224</a> Queen, O., Huang, Y., Calef, R., Giunchiglia, V., Chen, T., Dasoulas, G., Tai, L., Abbadessa, G., Howell, O., Ektefaie, Y., Noori, A., Farkas, I., Brown, J., Cobley, T., Hrovatin, K., Hartvigsen, T., Theis, F., Pentelute, B. L., Zou, J., … Zitnik, M. (2025). *ProCyon: A multimodal foundation model for protein phenotypes.* bioRxiv. https://doi.org/10.1101/2024.12.10.627665

<a id="225">225</a> Miller, H. E., Greenig, M., Tenmann, B., & Wang, B. (2025). *BioML-bench: Evaluation of AI agents for end-to-end biomedical ML.* bioRxiv. https://doi.org/10.1101/2025.09.01.673319

> **Code**: https://github.com/science-machine/biomlbench

<a id="235">235</a> Zeng, Y., Xie, J., Shangguan, N., Wei, Z., Li, W., Su, Y., Yang, S., Zhang, C., Zhang, J., Fang, N., Zhang, H., Lu, Y., Zhao, H., Fan, J., Yu, W., & Yang, Y. (2025). CellFM: a large-scale foundation model pre-trained on transcriptomics of 100 million human cells. *Nature Communications, 16*(1), 4679. https://doi.org/10.1038/s41467-025-59926-5

<a id="236">236</a> Tac, V., Gardner, C. D., & Kuhl, E. (2026). Generative artificial intelligence creates delicious, sustainable, and nutritious burgers. *npj Science of Food, 10*(1), 199. https://doi.org/10.1038/s41538-026-00953-x

<a id="237">237</a> Xiao, M., Qin, C., Chen, J., Cheng, Y., Zhou, Y., & Zhu, H. (2026). *BioHarness: Substrate-aware evidence assembly for biomedical question answering across literature, knowledge bases, and biological atlases.* arXiv. https://doi.org/10.48550/arXiv.2606.19396

> **Code**: https://github.com/coco11563/BioHarness

<a id="238">238</a> Pande, A., Uyar, B., & Akalin, A. (2026). *An atlas-scale generative model for unified representation learning of bulk RNA-seq data.* bioRxiv. https://doi.org/10.64898/2026.06.18.733198

> **Code**: https://github.com/BIMSBbioinfo/atlas_tissue_representation

<a id="239">239</a> Ahmed, M. O., Amale, S. A., Bhavsar, R. D., Chopra, P., Jaimes, A., Kachhwah, A., Kalotra, C. D., Li, P., Li, X., Liao, Y., Roy, R., Senthilselvan, N., Shao, Y., Sharma, A. D., Shrivatsan, A., Xue, R., You, Y., Badkul, A., Xie, L., … Sinitskiy, A. (2026). *Real science is harder than benchmarks: Evaluating advanced AI frameworks on published studies. I. Uncertainty quantification, ML on Therapeutic Data Commons, and agent-based modeling.* bioRxiv. https://doi.org/10.64898/2026.06.24.734302

## Sensory & Flavor Reference Work

This section catalogs foundational primary research and methodology papers in sensory science, flavor chemistry, and analytical sensomics relevant to cellular agriculture, cultivated meat, and alt-protein products. Entries here do not apply a specific AI / ML method to a specific cell-ag problem (otherwise they would live in the matrix), but they are essential reference work — empirical studies, methodology frameworks, and applied chemometric analyses — that any AI/ML application in this space should build on. The same numeric ID counter is shared with the primary references above; no matrix participation.

<a id="73">73</a> Nicolotti, L., Mall, V., & Schieberle, P. (2019). Characterization of Key Aroma Compounds in a Commercial Rum and an Australian Red Wine by Means of a New Sensomics-Based Expert System (SEBES)—An Approach To Use Artificial Intelligence in Determining Food Odor Codes. *Journal of Agricultural and Food Chemistry, 67*(14), 4011–4022. https://doi.org/10.1021/acs.jafc.9b00708

<a id="74">74</a> Spaccasassi, A., Utz, F., Dunkel, A., Aragao Börner, R., Ye, L., De Franceschi, F., Bogicevic, B., Glabasnia, A., Hofmann, T., & Dawid, C. (2024). Screening of a Microbial Culture Collection: Empowering Selection of Starters for Enhanced Sensory Attributes of Pea-Protein-Based Beverages. *Journal of Agricultural and Food Chemistry, 72*(28), 15890–15905. https://doi.org/10.1021/acs.jafc.4c02316

<a id="75">75</a> Lew, E., Yuen, J., Zhang, K., Fuller, K., Frost, S., & Kaplan, D. L. (2024). Chemical and sensory analyses of cultivated pork fat tissue as a flavor enhancer for meat alternatives. *Scientific Reports, 14*(1), 17643. https://doi.org/10.1038/s41598-024-68247-4

<a id="77">77</a> O'Neill, E. N., Ansel, J. C., Kwong, G. A., Plastino, M. E., Nelson, J., Baar, K., & Block, D. E. (2022). Spent media analysis suggests cultivated meat media will require species and cell type optimization. *npj Science of Food, 6*(1), 46. https://doi.org/10.1038/s41538-022-00157-z

<a id="99">99</a> Wiener, A., Shudler, M., Levit, A., & Niv, M. Y. (2012). BitterDB: a database of bitter compounds. *Nucleic Acids Research, 40*(D1), D413–D419. https://doi.org/10.1093/nar/gkr755

<a id="100">100</a> Dagan-Wiener, A., Di Pizio, A., Nissim, I., Bahia, M. S., Dubovski, N., Margulis, E., & Niv, M. Y. (2019). BitterDB: taste ligands and receptors database in 2019. *Nucleic Acids Research, 47*(D1), D1179–D1185. https://doi.org/10.1093/nar/gky974

<a id="101">101</a> Ziaikin, E., David, M., Uspenskaya, S., & Niv, M. Y. (2025). BitterDB: 2024 update on bitter ligands and taste receptors. *Nucleic Acids Research, 53*(D1), D1645–D1652. https://doi.org/10.1093/nar/gkae1044

<a id="106">106</a> Nissim, I., Dagan-Wiener, A., & Niv, M. Y. (2017). The taste of toxicity: A quantitative analysis of bitter and toxic molecules. *IUBMB Life, 69*(12), 938–946. https://doi.org/10.1002/iub.1694

<a id="107">107</a> Wang, M., Carver, J. J., Phelan, V. V., Sanchez, L. M., Garg, N., Peng, Y., Nguyen, D. D., Watrous, J., Kapono, C. A., Luzzatto-Knaan, T., Porto, C., Bouslimani, A., Melnik, A. V., Meehan, M. J., Liu, W.-T., Crüsemann, M., Boudreau, P. D., Esquenazi, E., Sandoval-Calderón, M., ... Bandeira, N. (2016). Sharing and community curation of mass spectrometry data with Global Natural Products Social Molecular Networking. *Nature Biotechnology, 34*(8), 828–837. https://doi.org/10.1038/nbt.3597

<a id="189">189</a> Ramalingam, V., Song, Z., & Hwang, I. (2019). The potential role of secondary metabolites in modulating the flavor and taste of the meat. *Food Research International, 122*, 174–182. https://doi.org/10.1016/j.foodres.2019.04.007

<a id="190">190</a> Muroya, S., Ueda, S., Komatsu, T., Miyakawa, T., & Ertbjerg, P. (2020). MEATabolomics: Muscle and Meat Metabolomics in Domestic Animals. *Metabolites, 10*(5), 188. https://doi.org/10.3390/metabo10050188

<a id="191">191</a> Ali, S., Liao, Z., Cheng, Y., Malhi, I. Y., Wang, Y., Peng, S., & Zhang, L. (2025). Lipidomics in chicken meat flavor chemistry: Current understanding, integrated omics approaches, and future perspectives. *Poultry Science, 104*(11), 105700. https://doi.org/10.1016/j.psj.2025.105700

<a id="193">193</a> Zhou, H., Loo, L. S. W., Ong, F. Y. T., Lou, X., Wang, J., Myint, M. K., Thong, A., Seow, D. C. S., Wibowo, M., Ng, S., Lv, Y., Kwang, L. G., Bennie, R. Z., Pang, K. T., Dobson, R. C. J., Domigan, L. J., Kanagasundaram, Y., & Yu, H. (2025). Cost-effective production of meaty aroma from porcine cells for hybrid cultivated meat. *Food Chemistry, 473*, 142946. https://doi.org/10.1016/j.foodchem.2025.142946

## Metabolic Reference Work

This section catalogs foundational primary research papers describing genome-scale metabolic models (GEMs) and related metabolic infrastructure for cellular agriculture. As with the Sensory & Flavor Reference Work above, entries here are primary research where the contribution is the model / data resource itself rather than an applied AI/ML method — the AI/ML work building on these resources lives in the matrix above. Each entry below is the canonical citation for the corresponding genome-scale metabolic model, catalogued on its species page in the [Datasets/](./Datasets/) directory (BtaSBML2986 on [Cow.md](./Datasets/Cow.md), iES1300 on [Chicken.md](./Datasets/Chicken.md), pcPigMNet2025 and iSsus3744 on [Pig.md](./Datasets/Pig.md), SALARECON on [Fish.md](./Datasets/Fish.md), and the iCHO and Recon3D/Human1 reference models on [CHOReference.md](./Datasets/CHOReference.md) and [HumanReference.md](./Datasets/HumanReference.md)). Same numeric ID counter as the primary references; no matrix participation.

<a id="81">81</a> Lee, J., Kim, J., Bae, H., Kim, M., Jung, B., Kim, J., Lee, S., & Kim, H. (2024). *Multi-omics analysis and genome-scale metabolic reconstruction of cattle Bos taurus for optimal production of cultured meat.* bioRxiv. https://doi.org/10.1101/2024.12.09.627468

<a id="82">82</a> Salehabadi, E., Motamedian, E., & Shojaosadati, S. A. (2022). Reconstruction of a generic genome-scale metabolic network for chicken: Investigating network connectivity and finding potential biomarkers. *PLOS ONE, 17*(3), e0254270. https://doi.org/10.1371/journal.pone.0254270

<a id="83">83</a> Qiu, S., Kratochvilova, E., Huang, W., Cui, Z., Agnew, T., Yang, A., & Ye, H. (2026). Proteome constrained metabolic modeling of *Sus scrofa* muscle stem cells for cultured meat production. *Metabolic Engineering, 94,* 252–263. https://doi.org/10.1016/j.ymben.2026.01.001

<a id="84">84</a> Zakhartsev, M., Rotnes, F., Gulla, M., Øyås, O., van Dam, J. C. J., Suarez-Diez, M., Grammes, F., Hafþórsson, R., van Helvoirt, W., Koehorst, J. J., Schaap, P. J., Jin, Y., Mydland, L. T., Gjuvsland, A. B., Sandve, S. R., Martins dos Santos, V. A. P., & Vik, J. O. (2022). SALARECON connects the Atlantic salmon genome to growth and feed efficiency. *PLOS Computational Biology, 18*(6), e1010194. https://doi.org/10.1371/journal.pcbi.1010194

<a id="85">85</a> Hefzi, H., Ang, K. S., Hanscho, M., Bordbar, A., Ruckerbauer, D., Lakshmanan, M., Orellana, C. A., Baycin-Hizal, D., Huang, Y., Ley, D., Martinez, V. S., Kyriakopoulos, S., Jiménez, N. E., Zielinski, D. C., Quek, L.-E., Wulff, T., Arnsdorf, J., Li, S., Lee, J. S., Paglia, G., Loira, N., Spahn, P. N., Pedersen, L. E., Gutierrez, J. M., King, Z. A., Lund, A. M., Nagarajan, H., Thomas, A., Abdel-Haleem, A. M., Zanghellini, J., Kildegaard, H. F., Voldborg, B. G., Gerdtzen, Z. P., Betenbaugh, M. J., Palsson, B. O., Andersen, M. R., Nielsen, L. K., Borth, N., Lee, D.-Y., & Lewis, N. E. (2016). A Consensus Genome-scale Reconstruction of Chinese Hamster Ovary Cell Metabolism. *Cell Systems, 3*(5), 434–443.e8. https://doi.org/10.1016/j.cels.2016.10.020

<a id="86">86</a> Brunk, E., Sahoo, S., Zielinski, D. C., Altunkaya, A., Dräger, A., Mih, N., Gatto, F., Nilsson, A., Preciat Gonzalez, G. A., Aurich, M. K., Prlić, A., Sastry, A., Danielsdottir, A. D., Heinken, A., Noronha, A., Rose, P. W., Burley, S. K., Fleming, R. M. T., Nielsen, J., Thiele, I., & Palsson, B. O. (2018). Recon3D enables a three-dimensional view of gene variation in human metabolism. *Nature Biotechnology, 36*(3), 272–281. https://doi.org/10.1038/nbt.4072

<a id="87">87</a> Robinson, J. L., Kocabaş, P., Wang, H., Cholley, P.-E., Cook, D., Nilsson, A., Anton, M., Ferreira, R., Domenzain, I., Billa, V., Limeta, A., Hedin, A., Gustafsson, J., Kerkhoven, E. J., Svensson, L. T., Palsson, B. O., Mardinoglu, A., Hansson, L., Uhlén, M., & Nielsen, J. (2020). An atlas of human metabolism. *Science Signaling, 13*(624), eaaz1482. https://doi.org/10.1126/scisignal.aaz1482

<a id="240">240</a> Gomez Romero, S., Vigliotti, M., Ramirez Lopez, V., Nguyen, K., Marchitto, V., & Boyle, N. (2026). *iSsus3744: A genome-scale model-guided strategy for rational media design for cultivated pork.* bioRxiv. https://doi.org/10.64898/2026.05.28.728221

## Foundational Methods Reference Work

This section catalogs the foundational methods and theory papers — from machine learning and from cell biology — that the AI × cell-ag work in the matrix builds upon, but which do not themselves apply a specific AI/ML method to a specific cell-ag problem (otherwise they would live in the matrix). The transformer architecture underlies every entry in the Foundation Models rows; the Waddington-landscape formalism is the conceptual substrate for the Cell-State & Perturbation Prediction row. Same numeric ID counter as the primary references; no matrix participation.

<a id="130">130</a> Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., & Polosukhin, I. (2023). *Attention Is All You Need.* arXiv. https://doi.org/10.48550/arXiv.1706.03762

<a id="131">131</a> Wang, J., Zhang, K., Xu, L., & Wang, E. (2011). Quantifying the Waddington landscape and biological paths for development and differentiation. *Proceedings of the National Academy of Sciences, 108*(20), 8257–8262. https://doi.org/10.1073/pnas.1017017108

<a id="180">180</a> Orth, J. D., Thiele, I., & Palsson, B. Ø. (2010). What is flux balance analysis? *Nature Biotechnology, 28*(3), 245–248. https://doi.org/10.1038/nbt.1614

<a id="181">181</a> Neftci, E. O., & Averbeck, B. B. (2019). Reinforcement learning in artificial and biological systems. *Nature Machine Intelligence, 1*(3), 133–143. https://doi.org/10.1038/s42256-019-0025-4

<a id="184">184</a> Moses, L., & Pachter, L. (2022). Museum of spatial transcriptomics. *Nature Methods, 19*(5), 534–546. https://doi.org/10.1038/s41592-022-01409-2

<a id="185">185</a> Cuperlovic-Culf, M. (2018). Machine Learning Methods for Analysis of Metabolic Data and Metabolic Pathway Modeling. *Metabolites, 8*(1), 4. https://doi.org/10.3390/metabo8010004

<a id="186">186</a> Vijayakumar, S., Magazzù, G., Moon, P., Occhipinti, A., Angione, C., Cortassa, S., & Aon, M. A. (2022). A Practical Guide to Integrating Multimodal Machine Learning and Metabolic Modeling. In *Computational Systems Biology in Medicine and Biotechnology: Methods and Protocols* (pp. 87–122). Springer. https://doi.org/10.1007/978-1-0716-1831-8_5

<a id="187">187</a> Petrany, M. J., Swoboda, C. O., Sun, C., Chetal, K., Chen, X., Weirauch, M. T., Salomonis, N., & Millay, D. P. (2020). Single-nucleus RNA-seq identifies transcriptional heterogeneity in multinucleated skeletal myofibers. *Nature Communications, 11*(1), 6374. https://doi.org/10.1038/s41467-020-20063-w

<a id="188">188</a> Grindberg, R. V., Yee-Greenbaum, J. L., McConnell, M. J., Novotny, M., O’Shaughnessy, A. L., Lambert, G. M., Araúzo-Bravo, M. J., Lee, J., Fishman, M., Robbins, G. E., Lin, X., Venepally, P., Badger, J. H., Galbraith, D. W., Gage, F. H., & Lasken, R. S. (2013). RNA-sequencing from single nuclei. *Proceedings of the National Academy of Sciences, 110*(49), 19802–19807. https://doi.org/10.1073/pnas.1319700110

## Livestock Functional Genomics Reference Work

This section catalogs foundational primary research describing the Farm Animal Genotype–Tissue Expression (FarmGTEx) project and adjacent multi-tissue functional-genomics resources for cell-ag-relevant species (cattle, pig, chicken, sheep). As with the Sensory & Flavor and Metabolic Reference Work sections above, entries here are primary research where the contribution is a large-scale multi-tissue atlas, regulatory-effects map, or annotation resource — substrate that any AI/ML application in livestock cell biology should build on, rather than an applied AI/ML method per se. Same numeric ID counter as the primary references; no matrix participation. Each entry below is the canonical citation for the corresponding data resource in [Databases.md / Livestock Multi-Tissue Atlases & Functional Genomics](./Databases.md#livestock-multi-tissue-atlases--functional-genomics).

<a id="134">134</a> Fang, L., Teng, J., Lin, Q., Bai, Z., Liu, S., Guan, D., Li, B., Gao, Y., Hou, Y., Gong, M., Pan, Z., Yu, Y., Clark, E. L., Smith, J., Rawlik, K., Xiang, R., Chamberlain, A. J., Goddard, M. E., Littlejohn, M., ... Liu, G. E. (2025). The Farm Animal Genotype–Tissue Expression (FarmGTEx) Project. *Nature Genetics, 57*(4), 786–796. https://doi.org/10.1038/s41588-025-02121-5

<a id="135">135</a> Teng, J., Gao, Y., Yin, H., Bai, Z., Liu, S., Zeng, H., Bai, L., Cai, Z., Zhao, B., Li, X., Xu, Z., Lin, Q., Pan, Z., Yang, W., Yu, X., Guan, D., Hou, Y., Keel, B. N., Rohrer, G. A., ... Fang, L. (2024). A compendium of genetic regulatory effects across pig tissues. *Nature Genetics, 56*(1), 112–123. https://doi.org/10.1038/s41588-023-01585-7

<a id="136">136</a> Guan, D., Bai, Z., Zhu, X., Zhong, C., Hou, Y., Zhu, D., Li, H., Lan, F., Diao, S., Yao, Y., Zhao, B., Li, X., Pan, Z., Gao, Y., Wang, Y., Zou, D., Wang, R., Xu, T., Sun, C., ... Fang, L. (2025). Genetic regulation of gene expression across multiple tissues in chickens. *Nature Genetics, 57*(5), 1298–1308. https://doi.org/10.1038/s41588-025-02155-9

<a id="137">137</a> Han, B., Li, H., Zheng, W., Zhang, Q., Chen, A., Zhu, S., Shi, T., Wang, F., Zou, D., Song, Y., Ye, W., Du, A., Fu, Y., Jia, M., Bai, Z., Yuan, Z., Liu, W., Tuo, W., Hope, J. C., MacHugh, D. E., O'Grady, J. F., Madsen, O., Sahana, G., Luo, Y., Lin, L., Li, C., Cai, Z., Li, B., Huang, J., Liu, L., Zhang, Z., Ma, Z., Hou, Y., Liu, G. E., Jiang, Y., Sun, H. Z., Fang, L., & Sun, D. (2025). A multi-tissue single-cell expression atlas in cattle. *Nature Genetics, 57*(10), 2546–2561. https://doi.org/10.1038/s41588-025-02329-5

<a id="138">138</a> Gong, M., Zhuang, Z., Sun, X., Xu, Y., Zhang, H., Wang, Y., Guan, D., Li, R., Lu, X., Bai, Z., Feng, P., Song, M., Tian, M., Lu, J., Wang, M., Lu, X., Wu, D., Su, P., Liu, P., ... Fang, L. (2025). *A multi-tissue atlas of genetic regulatory effects in sheep.* bioRxiv. https://doi.org/10.1101/2025.11.03.686346

<a id="139">139</a> Zeng, H., Zhang, W., Lin, Q., Gao, Y., Teng, J., Xu, Z., Cai, X., Zhong, Z., Wu, J., Liu, Y., Diao, S., Wei, C., Gong, W., Pan, X., Li, Z., Huang, X., Chen, X., Du, J., The PigGTEx Consortium, Zhao, F., Zhao, Y., Ballester, M., Crespo-Piazuelo, D., Amills, M., Clop, A., Karlskov-Mortensen, P., Fredholm, M., Li, P., Huang, R., Tang, G., Li, M., Liu, X., Chen, Y., Zhang, Q., Li, J., Yuan, X., Ding, X., Fang, L., & Zhang, Z. (2024). PigBiobank: a valuable resource for understanding genetic and biological mechanisms of diverse complex traits in pigs. *Nucleic Acids Research, 52*(D1), D980–D989. https://doi.org/10.1093/nar/gkad1080

<a id="140">140</a> Xu, Z., Lin, Q., Cai, X., Zhong, Z., Teng, J., Li, B., Zeng, H., Gao, Y., Cai, Z., Wang, X., Shi, L., Wang, X., Wang, Y., Zhang, Z., Lin, Y., Liu, S., Yin, H., Bai, Z., Wei, C., ... Zhang, Z. (2025). Integrating large-scale meta-GWAS and PigGTEx resources to decipher the genetic basis of complex traits in the pig. *National Science Review, 12*(5), nwaf048. https://doi.org/10.1093/nsr/nwaf048

<a id="141">141</a> Pan, X., Gong, W., Cai, X., Teng, J., Cai, J., Zeng, H., Ayalew, W., Shen, Q., Zhong, Z., Wang, Y., Zhang, W., Tian, Y., Xu, D., Gao, Y., Yin, H., Zhang, Y., Hou, J., Zhou, T., Li, J., Fang, L., Yuan, X., & Zhang, Z. (2026). Multi-Tissue Genetic Regulation of RNA Editing in Pigs. *Advanced Science, 13*(17), e18238. https://doi.org/10.1002/advs.202518238

<a id="142">142</a> Chen, L., Li, H., Teng, J., Wang, Z., Qu, X., Chen, Z., Cai, X., Zeng, H., Bai, Z., Li, J., Pan, X., Yan, L., Wang, F., Lin, L., Luo, Y., Sahana, G., Lund, M. S., Ballester, M., Crespo-Piazuelo, D., Karlskov-Mortensen, P., Fredholm, M., Clop, A., Amills, M., Loving, C., Tuggle, C. K., Madsen, O., Li, J., Zhang, Z., Liu, G. E., Jiang, J., Fang, L., & Yi, G. (2026). Construction of a Multitissue Cell Atlas Reveals Cell-Type-Specific Regulation of Molecular and Complex Phenotypes in Pigs. *Advanced Science, 13*(8), e04961. https://doi.org/10.1002/advs.202504961

<a id="143">143</a> Teng, J., Zhang, W., Gong, W., Chen, J., Gao, Y., Fang, L., & Zhang, Z. (2026). OmiGA for ultra-efficient molecular quantitative trait loci mapping. *Nature Communications, 17*(1), 2680. https://doi.org/10.1038/s41467-026-68978-0

> **Code**: https://omiga.bio/

<a id="144">144</a> Clark, E. L., Archibald, A. L., Daetwyler, H. D., Groenen, M. A. M., Harrison, P. W., Houston, R. D., Kühn, C., Lien, S., Macqueen, D. J., Reecy, J. M., Robledo, D., Watson, M., Tuggle, C. K., & Giuffra, E. (2020). From FAANG to fork: application of highly annotated genomes to improve farmed animal production and welfare. *Genome Biology, 21*(1), 285. https://doi.org/10.1186/s13059-020-02197-8

<a id="192">192</a> Liu, S., Gao, Y., Canela-Xandri, O., Wang, S., Yu, Y., Cai, W., Li, B., Xiang, R., Chamberlain, A. J., Pairo-Castineira, E., D’Mellow, K., Rawlik, K., Xia, C., Yao, Y., Navarro, P., Rocha, D., Li, X., Yan, Z., Li, C., … Fang, L. (2022). A multi-tissue atlas of regulatory variants in cattle. *Nature Genetics, 54*(9), 1438–1447. https://doi.org/10.1038/s41588-022-01153-5

<a id="198">198</a> Thévenot, E. A., Roux, A., Xu, Y., Ezan, E., & Junot, C. (2015). Analysis of the human adult urinary metabolome variations with age, body mass index, and gender by implementing a comprehensive workflow for univariate and OPLS statistical analyses. *Journal of Proteome Research, 14*(8), 3322–3335. https://doi.org/10.1021/acs.jproteome.5b00354
> **Code**: https://bioconductor.org/packages/ropls/

<a id="199">199</a> Rohart, F., Gautier, B., Singh, A., & Lê Cao, K.-A. (2017). mixOmics: An R package for ‘omics feature selection and multiple data integration. *PLoS Computational Biology, 13*(11), e1005752. https://doi.org/10.1371/journal.pcbi.1005752
> **Code**: https://github.com/mixOmicsTeam/mixOmics

## Reviews & Perspectives

This section lists review articles, position papers, and commentaries that survey the field or opine on it, rather than applying a specific AI method to a specific cell-ag problem. Entries here share the same reference-ID counter as the primary references above but do not participate in the matrix.

<a id="37">37</a> Kuhl, E. (2025). AI for food: accelerating and democratizing discovery and innovation. *npj Science of Food, 9*(1). https://doi.org/10.1038/s41538-025-00441-8

<a id="38">38</a> McNulty, M. J., Stout, A. J., & Kaplan, D. L. (2025). Meating the moment. *EMBO Reports, 26*(13), 3229–3235. https://doi.org/10.1038/s44319-025-00492-8

<a id="39">39</a> Datta, B., Buehler, M. J., Chow, Y., Gligoric, K., Jurafsky, D., Kaplan, D. L., Ledesma-Amaro, R., Del Missier, G., Neidhardt, L., Pichara, K., Sanchez-Lengeling, B., Schlangen, M., St. Pierre, S. R., Tagkopoulos, I., Thomas, A., Watson, N. J., & Kuhl, E. (2026). Artificial Intelligence for Food Innovation. *arXiv.* https://doi.org/10.48550/arXiv.2509.21556

<a id="76">76</a> Wang, Y., Tuccillo, F., Lampi, A.-M., Knaapila, A., Pulkkinen, M., Kariluoto, S., Coda, R., Edelmann, M., Jouppila, K., Sandell, M., Piironen, V., & Katina, K. (2022). Flavor challenges in extruded plant-based meat alternatives: A review. *Comprehensive Reviews in Food Science and Food Safety, 21*(3), 2898–2929. https://doi.org/10.1111/1541-4337.12964

<a id="78">78</a> Mittermeier-Kleßinger, V. K., Hofmann, T., & Dawid, C. (2021). Mitigating Off-Flavors of Plant-Based Proteins. *Journal of Agricultural and Food Chemistry, 69*(32), 9202–9207. https://doi.org/10.1021/acs.jafc.1c03398

<a id="79">79</a> Alasi, S. O., Sanusi, M. S., Sunmonu, M. O., Odewole, M. M., & Adepoju, A. L. (2024). Exploring recent developments in novel technologies and AI integration for plant-based protein functionality: A review. *Journal of Agriculture and Food Research, 15,* 101036. https://doi.org/10.1016/j.jafr.2024.101036

<a id="132">132</a> Todhunter, M. E., Jubair, S., Verma, R., Saqe, R., Shen, K., & Duffy, B. (2024). Artificial intelligence and machine learning applications for cultured meat. *Frontiers in Artificial Intelligence, 7,* 1424012. https://doi.org/10.3389/frai.2024.1424012

> **Data**: The article's supplemental Table 1 surveys cultured-meat-relevant datasets (through April 2024) across fish, crustaceans, mollusks, cows, pigs, and chickens. It is the curatorial source for the per-species pages in the [Datasets/](./Datasets/) directory.

<a id="128">128</a> Bunne, C., Roohani, Y., Rosen, Y., Gupta, A., Zhang, X., Roed, M., Alexandrov, T., AlQuraishi, M., Brennan, P., Burkhardt, D. B., Califano, A., Cool, J., Dernburg, A. F., Ewing, K., Fox, E. B., Haury, M., Herr, A. E., Horvitz, E., Hsu, P. D., Jain, V., Johnson, G. R., Kalil, T., Kelley, D. R., Kelley, S. O., Kreshuk, A., Mitchison, T., Otte, S., Shendure, J., Sofroniew, N. J., Theis, F., Theodoris, C. V., Upadhyayula, S., Valer, M., Wang, B., Xing, E., Yeung-Levy, S., Zitnik, M., Karaletsos, T., Regev, A., Lundberg, E., Leskovec, J., & Quake, S. R. (2024). How to build the virtual cell with artificial intelligence: Priorities and opportunities. *Cell, 187*(25), 7045–7063. https://doi.org/10.1016/j.cell.2024.11.015

<a id="129">129</a> Roohani, Y. H., Hua, T. J., Tung, P. Y., Bounds, L. R., Yu, F. B., Dobin, A., Teyssier, N., Adduri, A., Woodrow, A., Plosky, B. S., Mehta, R., Hsu, B., Sullivan, J., Ricci-Tam, C., Li, N., Kazaks, J., Gilbert, L. A., Konermann, S., Hsu, P. D., Goodarzi, H., & Burke, D. P. (2025). Virtual Cell Challenge: Toward a Turing test for the virtual cell. *Cell, 188*(13), 3370–3374. https://doi.org/10.1016/j.cell.2025.06.008

<a id="168">168</a> Ho, Y. Y., Sivakumar, S., Ho, Y. S., & Lakshmanan, M. (2026). Rational design of serum-free media for cultivated meat. *Nature Reviews Bioengineering.* https://doi.org/10.1038/s44222-026-00428-4

<a id="172">172</a> Hashizume, T., & Ying, B.-W. (2024). Challenges in developing cell culture media using machine learning. *Biotechnology Advances, 70*, 108293. https://doi.org/10.1016/j.biotechadv.2023.108293

<a id="173">173</a> Ranpura, S., Maralingannavar, V., Gheorghe, A.-G., Ma, E., Morrissey, J., Betenbaugh, M. J., & Demirhan, D. (2025). Wheels turning: CHO cell modeling moves into a digital biomanufacturing era. *Computational and Structural Biotechnology Journal, 27*, 2796–2813. https://doi.org/10.1016/j.csbj.2025.06.035

<a id="174">174</a> Cai, D., Li, X., Liu, H., Wen, L., & Qu, D. (2024). Machine learning and flavoromics-based research strategies for determining the characteristic flavor of food: A review. *Trends in Food Science & Technology, 154*, 104794. https://doi.org/10.1016/j.tifs.2024.104794

<a id="175">175</a> Gomez Romero, S., & Boyle, N. (2023). Systems biology and metabolic modeling for cultivated meat: A promising approach for cell culture media optimization and cost reduction. *Comprehensive Reviews in Food Science and Food Safety, 22*(4), 3422–3443. https://doi.org/10.1111/1541-4337.13193

<a id="176">176</a> Suthers, P. F., & Maranas, C. D. (2020). Challenges of cultivated meat production and applications of genome-scale metabolic modeling. *AIChE Journal, 66*(6), e16235. https://doi.org/10.1002/aic.16235

<a id="177">177</a> Fang, X., Lloyd, C. J., & Palsson, B. O. (2020). Reconstructing organisms in silico: genome-scale models and their emerging applications. *Nature Reviews Microbiology, 18*(12), 731–743. https://doi.org/10.1038/s41579-020-00440-4

<a id="178">178</a> Gu, C., Kim, G. B., Kim, W. J., Kim, H. U., & Lee, S. Y. (2019). Current status and applications of genome-scale metabolic models. *Genome Biology, 20*(1), 121. https://doi.org/10.1186/s13059-019-1730-3

<a id="179">179</a> Gulati, G. S., D'Silva, J. P., Liu, Y., Wang, L., & Newman, A. M. (2025). Profiling cell identity and tissue architecture with single-cell and spatial transcriptomics. *Nature Reviews Molecular Cell Biology, 26*(1), 11–31. https://doi.org/10.1038/s41580-024-00768-2

<a id="183">183</a> Sparkes, A., Aubrey, W., Byrne, E., Clare, A., Khan, M. N., Liakata, M., Markham, M., Rowland, J., Soldatova, L. N., Whelan, K. E., Young, M., & King, R. D. (2010). Towards Robot Scientists for autonomous scientific discovery. *Automated Experimentation, 2*(1), 1. https://doi.org/10.1186/1759-4499-2-1

<a id="194">194</a> Smith, C. S., Krusinski, L., Cohen, C. A., Kawecki, N. S., Moccio, L., Xie, Q., Cheng, E., Yee, Z., Adler, S., Simpson, D., Marcotte, G., Damoiseaux, R., Park, J. O., Crosbie, R. H., Mayhew, E. J., Garmyn, A. J., Fenton, J. I., & Rowat, A. C. (2026). Design principles of cells for eatability and scalability of cultivated meat. *Trends in Food Science & Technology, 172*, 105731. https://doi.org/10.1016/j.tifs.2026.105731

<a id="60">60</a> Mathieu, T., Légaré, S., Nzekoue, A., Jauré, N., Lester, H., Dias, T., & Kusters, R. (2025). Integrative multi-omics modeling for cultivated meat production, quality, and safety. *Trends in Food Science & Technology, 166,* 105364. https://doi.org/10.1016/j.tifs.2025.105364

<a id="113">113</a> Boiarsky, R., Singh, N. M., Buendia, A., Amini, A. P., Getz, G., & Sontag, D. (2024). Deeper evaluation of a single-cell foundation model. *Nature Machine Intelligence, 6*(12), 1443–1446. https://doi.org/10.1038/s42256-024-00949-w

<a id="114">114</a> Yang, F., Wang, F., Huang, L., Liu, L., Huang, J., & Yao, J. (2024). Reply to: Deeper evaluation of a single-cell foundation model. *Nature Machine Intelligence, 6*(12), 1447–1450. https://doi.org/10.1038/s42256-024-00948-x

<a id="226">226</a> O'Neill, E. N., Cosenza, Z. A., Baar, K., & Block, D. E. (2021). Considerations for the development of cost-effective cell culture media for cultivated meat production. *Comprehensive Reviews in Food Science and Food Safety, 20*(1), 686–709. https://doi.org/10.1111/1541-4337.12678

<a id="227">227</a> Zhou, J., Jiang, J., Han, Z., Wang, Z., & Gao, X. (2025). Streamline automated biomedical discoveries with agentic bioinformatics. *Briefings in Bioinformatics, 26*(5), bbaf505. https://doi.org/10.1093/bib/bbaf505

<a id="228">228</a> Zhou, T., Reji, R., Kairon, R. S., & Chiam, K. H. (2023). A review of algorithmic approaches for cell culture media optimization. *Frontiers in Bioengineering and Biotechnology, 11*, 1195294. https://doi.org/10.3389/fbioe.2023.1195294

<a id="229">229</a> Bloor, M., Mowbray, M., Del Rio Chanona, E. A., & Tsay, C. (2025). *Survey and tutorial of reinforcement learning methods in process systems engineering.* arXiv. https://doi.org/10.48550/arXiv.2510.24272

<a id="230">230</a> Zhou, L., Ling, H., Fu, C., Huang, Y., Sun, M., Yu, W., Wang, X., Li, X., Su, X., Zhang, J., Chen, X., Liang, C., Qian, X., Ji, H., Wang, W., Zitnik, M., & Ji, S. (2025). *Autonomous agents for scientific discovery: Orchestrating scientists, language, code, and physics.* arXiv. https://doi.org/10.48550/arXiv.2510.09901

<a id="231">231</a> Ramos, M. C., Collison, C. J., & White, A. D. (2025). A review of large language models and autonomous agents in chemistry. *Chemical Science, 16*(6), 2514–2572. https://doi.org/10.1039/d4sc03921a

<a id="232">232</a> Freeman, S., Calabro, S., Williams, R., Jin, S., & Ye, K. (2022). Bioink formulation and machine learning-empowered bioprinting optimization. *Frontiers in Bioengineering and Biotechnology, 10*, 913579. https://doi.org/10.3389/fbioe.2022.913579

<a id="233">233</a> Yu, J., Yao, D., Wang, L., & Xu, M. (2025). Machine learning in predicting and optimizing polymer printability for 3D bioprinting. *Polymers, 17*(13), 1873. https://doi.org/10.3390/polym17131873

<a id="234">234</a> Ning, H., Zhou, T., & Joo, S. W. (2023). Machine learning boosts three-dimensional bioprinting. *International Journal of Bioprinting, 9*(4), 739. https://doi.org/10.18063/ijb.739
