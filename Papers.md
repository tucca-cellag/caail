# Paper matrix
This document presents the core research papers at the intersection of Cellular Agriculture and AI. The papers are organized by problem and AI type, to indicate which approaches have been successful in a given research area.

| | [Media Optimization](./ResearchAreas/MediaOptimization.md) | [Cellular Engineering](./ResearchAreas/CellEngineering.md) | [Bioprocess control](./ResearchAreas/Bioprocess.md) | [Scaffolding](./ResearchAreas/Scaffolding.md)  | [Sensory Prediction](./ResearchAreas/SensoryPrediction.md) | [AI Tooling / Methodology](./ResearchAreas/AITooling.md) |
|---|---|---|---|---|---|---|
| [Bayesian Optimization](https://en.wikipedia.org/wiki/Bayesian_optimization) | [Cosenza et al. 2023](#2)<br>[Cosenza et al. 2022](#3)<br>[Yoshida et al. 2023](#15)<br>[Kanda et al. 2022](#16)<br>[Cosenza 2022](#18)<br>[Narayanan et al. 2025](#58) | [Kanda et al. 2022](#16) | [Antonakoudis & Richelle 2026](#59) | | | |
| [Deep Learning](https://en.wikipedia.org/wiki/Deep_learning) | [Nikkhah et al. 2023](#1)<br>[Yoshida et al. 2023](#15)<br>[Cosenza & Block 2021](#17)<br>[Cosenza 2022](#18) | [Chen et al. 2016](#4)<br>[Li et al. 2020](#5)<br>[Ji et al. 2021](#6)<br>[Adduri et al. 2025](#57)<br>[Mathieu et al. 2025](#60)<br>[Magnusson et al. 2024](#122) | [Tamburini et al. 2014](#7) | [Rafieyan et al. 2024](#20)<br>[Andrews et al. 2023](#35) | | |
| [GNN](https://en.wikipedia.org/wiki/Graph_neural_network) | | [Ciortan & Defrance 2022](#8)<br>[Shan et al. 2023](#12)<br>[Wang et al. 2021](#13)<br>[Roohani et al. 2024](#121) | | | [Lee et al. 2023](#14)<br>[Qian et al. 2023](#36) | [Mulyadi et al. 2025](#52) |
| [CNN](https://en.wikipedia.org/wiki/Convolutional_neural_network) | | | [Del Rio‐Chanona et al. 2019](#29)<br>[Rojek et al. 2021](#33) | [Bermejillo Barrera et al. 2021](#19) | [Shen et al. 2024](#11)<br>[Sun et al. 2023](#26) | |
| [GAN](https://en.wikipedia.org/wiki/Generative_adversarial_network) / [VAE](https://en.wikipedia.org/wiki/Variational_autoencoder) | | [Lin et al. 2020](#9)<br>[Zrimec et al. 2022](#10) | | | [Shen et al. 2024](#11) | |
| [Genetic Algorithms](https://en.wikipedia.org/wiki/Genetic_algorithm) | [Nikkhah et al. 2023](#1)<br>[Cosenza & Block 2021](#17) | | [Peng et al. 2013](#30)<br>[Zhang et al. 2020](#31) | | | |
| [SVM](https://en.wikipedia.org/wiki/Support_vector_machine) | [Xu et al. 2014](#21) | [Lao et al. 2022](#22) | [Zhang et al. 2020](#31)<br>[Roell et al. 2022](#32) | [Andrews et al. 2025](#34) |  | |
| [Ensemble Learning](https://en.wikipedia.org/wiki/Ensemble_learning) | | | | | [Du et al. 2025](#27)<br>[Colantonio et al. 2022](#72)<br>[Keller et al. 2017](#80)<br>[Dagan-Wiener et al. 2017](#102)<br>[Margulis et al. 2021](#103)<br>[Margulis et al. 2022](#104)<br>[Ziaikin et al. 2024](#105) | |
| [K-Nearest Neighbors](https://en.wikipedia.org/wiki/K-nearest_neighbors_algorithm) | | | | | [Sun et al. 2026](#28) | |
| [Active Learning](https://en.wikipedia.org/wiki/Active_learning_(machine_learning)) | [Zhang et al. 2023](#23)<br>[Hashizume et al. 2022](#24)<br>[Ozawa et al. 2025](#25)<br>[Narayanan et al. 2025](#58) | | | | | [Pandi et al. 2022](#63) |
| [Foundation Models: Next-Token Prediction](https://en.wikipedia.org/wiki/Generative_pre-trained_transformer) | | [Pearce et al. 2026](#92)<br>[Shen et al. 2023](#115)<br>[Rizvi et al. 2026](#120) | | | | |
| [Foundation Models: Masked Language Modeling](https://en.wikipedia.org/wiki/BERT_(language_model)) | | [Theodoris et al. 2023](#111)<br>[Yang et al. 2022](#112)<br>[Hao et al. 2024](#116)<br>[Cui et al. 2024](#117)<br>[Rosen et al. 2026](#119) | | | | |
| [Foundation Models: LM + Biological Priors](#119) | | [Rosen et al. 2024](#118)<br>[Rosen et al. 2026](#119)<br>[Littman et al. 2025](#123) | | | | |
| [Foundation Models: Cell-State & Perturbation Prediction](#57) | | [Adduri et al. 2025](#57)<br>[Roohani et al. 2024](#121)<br>[Magnusson et al. 2024](#122)<br>[Dong et al. 2026](#124) | | | | |
| [Foundation Models (other modalities)](https://en.wikipedia.org/wiki/Foundation_model) | | | | | | [Sypetkowski et al. 2026](#42)<br>[Su et al. 2026](#88)<br>[Ding et al. 2026](#91) |
| [Scientific Literature & Discovery Agents](./ResearchAreas/AITooling.md#scientific-literature--discovery-agents) | | | | | | [Lála et al. 2023](#44)<br>[Lu et al. 2024](#45)<br>[Skarlinski et al. 2024](#46)<br>[Yamada et al. 2025](#47)<br>[Liu et al. 2026](#53) |
| [General-Purpose Biomedical Agents](./ResearchAreas/AITooling.md#general-purpose-biomedical-agents) | | | | | | [Gao et al. 2025a](#40)<br>[Huang et al. 2025](#49)<br>[Pickard et al. 2025](#94)<br>[Riffle et al. 2025](#95)<br>[Jin et al. 2025](#96)<br>[Dong et al. 2024](#98) |
| [Chemistry / Synthesis Agents](./ResearchAreas/AITooling.md#chemistry--synthesis-agents) | | | | | | [Boiko et al. 2023](#70)<br>[Bran et al. 2024](#71) |
| [Domain-Specific Biomedical Agents](./ResearchAreas/AITooling.md#domain-specific-biomedical-agents) | | [Yu et al. 2026](#90)<br>[Tang et al. 2026](#93)<br>[Hao et al. 2025](#97)<br>[Roohani et al. 2025a](#125)<br>[Youngblut et al. 2025](#126) | | | | [Lee et al. 2025](#43)<br>[Wehling et al. 2025](#50)<br>[Sui et al. 2026](#51)<br>[Ying et al. 2025](#54)<br>[Wang et al. 2025a](#56)<br>[Singh et al. 2023](#66)<br>[Li et al. 2024](#68)<br>[Maeda & Kurata 2023](#69) |
| [Robot Scientists & Lab Automation](https://en.wikipedia.org/wiki/Robot_scientist) | | | [Wang et al. 2025b](#61)<br>[Qiu et al. 2025](#62) | | | [Tiukova et al. 2024](#64)<br>[Brunnsåker et al. 2025](#65) |
| [Benchmarks & Evaluation Frameworks](./ResearchAreas/AITooling.md#benchmarks--evaluation-frameworks) | | | | | | [Sadhuka et al. 2025](#55)<br>[Brouwer et al. 2026](#89)<br>[Mitchener et al. 2025](#108)<br>[Bushuiev et al. 2024](#109)<br>[Sze & Hassoun 2024](#110)<br>[Boiarsky et al. 2024](#113)<br>[Yang et al. 2024](#114)<br>[Chevalley et al. 2025](#127) |
| [Agent Infrastructure (Frameworks, KGs, Protocols)](./ResearchAreas/AITooling.md#agent-infrastructure-frameworks-kgs-protocols) | | | | | | [Gao et al. 2025b](#41)<br>[Lobentanzer et al. 2025](#48)<br>[Ruscone et al. 2025](#67)<br>[Kuehl et al. 2025](#133) |


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

<a id="10">10</a> Zrimec, J., Fu, X., Muhammad, A. S., Skrekas, C., Jauniskis, V., Speicher, N. K., Börlin, C. S., Verendel, V., Chehreghani, M. H., Dubhashi, D., Siewers, V., David, F., Nielsen, J., & Zelezniak, A. (2022). Controlling gene expression with deep generative design of regulatory DNA. *Nature Communications, 13*(1), 5099. https://doi.org/10.1038/s41467-022-32818-8

> **Code**: https://github.com/JanZrimec/ExpressionGAN

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

<a id="22">22</a> Lao, Z., Matsui, Y., Ijichi, S., & Ying, B.-W. (2022). Global coordination of the mutation and growth rates across the genetic and nutritional variety in Escherichia coli. *Frontiers in Microbiology, 13,* 990969. https://doi.org/10.3389/fmicb.2022.990969

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

<a id="49">49</a> Huang, K., Zhang, S., Wang, H., Qu, Y., Lu, Y., Roohani, Y., Li, R., Qiu, L., Li, G., Zhang, J., Yin, D., Marwaha, S., Carter, J. N., Zhou, X., Wheeler, M., Bernstein, J. A., Wang, M., He, P., Zhou, J., Snyder, M., Cong, L., Regev, A., & Leskovec, J. (2025). *Biomni: A General-Purpose Biomedical AI Agent.* bioRxiv. https://doi.org/10.1101/2025.05.30.656746

> **Code**: https://github.com/snap-stanford/Biomni

<a id="50">50</a> Wehling, L., Singh, G., Mulyadi, A. W., Sreenath, R. H., Hermjakob, H., Nguyen, T. V. N., Rückle, T., Mosa, M. H., Cordes, H., Andreani, T., Klabunde, T., Malik Sheriff, R. S., & McCloskey, D. (2025). Talk2Biomodels: AI agent-based open-source LLM initiative for kinetic biological models. *BMC Bioinformatics, 26*(1), 276. https://doi.org/10.1186/s12859-025-06310-1

> **Code**: https://github.com/VirtualPatientEngine/AIAgents4Pharma

<a id="51">51</a> Sui, P., Li, M. M., Gao, S., Shen, W., Giunchiglia, V., Shen, A., Huang, Y., Kong, Z., & Zitnik, M. (2026). *Medea: An omics AI agent for therapeutic discovery.* bioRxiv. https://doi.org/10.64898/2026.01.16.696667

<a id="52">52</a> Mulyadi, A. W., Wehling, L., Kumar, A., Boucher, N., Abdessalem, F., Jager, S., Mosa, M. H., Klabunde, T., Andreani, T., & Singh, G. (2025). *BioMedReasoner: Towards Multi-Hop Reasoning using Path-based Relational Learning on Biomedical Knowledge Graphs* [Poster, NeurIPS 2025 AI for Science Workshop]. https://openreview.net/forum?id=FmDuKzM8f7

<a id="53">53</a> Liu, T., Han, S., Wang, H., Luo, X., Lu, P., Zhu, B., Wang, Y., Li, K., Chen, J., Qu, R., Liu, Y., Cui, X., Yaish, A., Chen, Y., Hao, M., Li, C., Li, K., Lu, Y., Wei, X., Xing, Q., Panescu, A., Wang, M., Annaswamy, V., Sanchez, A., Cloherty, J., Cohan, A., Xu, H., Gerstein, M., Zou, J., & Zhao, H. (2026). *Advancing AI Research Assistants with Expert-Involved Learning.* arXiv. https://doi.org/10.48550/arXiv.2505.04638

<a id="54">54</a> Ying, K., Tyshkovskiy, A., Moldakozhayev, A., Wang, H., Magalhães, C. G. De, Iqbal, S., Garza, A. E., Tskhay, A., Poganik, J. R., Huang, K., Qu, Y., Glubokov, D., Jin, C., Lee, D., Liu, H., Leote, C., Trapp, A., Camillo, L. P. de L., Kerepesi, C., Moqri, M., Zhang, O., Jiang, K., Galkin, F., Zhavoronkov, A., Van Raamsdonk, J. M., Wang, M., Cong, L., Regev, A., Leskovec, J., Wyss-Coray, T., & Gladyshev, V. N. (2025). *Autonomous AI Agents Discover Aging Interventions from Millions of Molecular Profiles.* bioRxiv. https://doi.org/10.1101/2023.02.28.530532

<a id="55">55</a> Sadhuka, S., Prinster, D., Fannjiang, C., Scalia, G., Regev, A., & Wang, H. (2025). *E-valuator: Reliable Agent Verifiers with Sequential Hypothesis Testing.* arXiv. https://doi.org/10.48550/arXiv.2512.03109

<a id="56">56</a> Wang, H., He, Y., Coelho, P. P., Bucci, M., Nazir, A., Chen, B., Trinh, L., Zhang, S., Huang, K., Chandrasekar, V., Chung, D. C., Hao, M., Leote, A. C., Lee, Y., Li, B., Liu, T., Liu, J., Lopez, R., Lucas, T., Ma, M., Makarov, N., McGinnis, L., Peng, L., Ra, S., Scalia, G., Singh, A., Tao, L., Uehara, M., Wang, C., Wei, R., Copping, R., Rozenblatt-Rosen, O., Leskovec, J., & Regev, A. (2025). *SpatialAgent: An autonomous AI agent for spatial biology.* bioRxiv. https://doi.org/10.1101/2025.04.03.646459

<a id="57">57</a> Adduri, A. K., Gautam, D., Bevilacqua, B., Imran, A., Shah, R., Naghipourfar, M., Teyssier, N., Ilango, R., Nagaraj, S., Dong, M., Ricci-Tam, C., Carpenter, C., Subramanyam, V., Winters, A., Tirukkovular, S., Sullivan, J., Plosky, B. S., Eraslan, B., Youngblut, N. D., Leskovec, J., Gilbert, L. A., Konermann, S., Hsu, P. D., Dobin, A., Burke, D. P., Goodarzi, H., & Roohani, Y. H. (2025). *Predicting cellular responses to perturbation across diverse contexts with State.* bioRxiv. https://doi.org/10.1101/2025.06.26.661135

<a id="58">58</a> Narayanan, H., Hinckley, J., Barry, R., Dang, B., Wolffe, L., Atari, A., Tseng, Y., & Love, J. (2025). Accelerating cell culture media development using Bayesian optimization-based iterative experimental design. *Nature Communications, 16.* https://doi.org/10.1038/s41467-025-61113-5

<a id="59">59</a> Antonakoudis, A., & Richelle, A. (2026). Systematic data-driven genome-scale metabolic model reduction for bioprocess modeling: CHO culture case study. *npj Systems Biology and Applications.* https://doi.org/10.1038/s41540-026-00704-4

<a id="60">60</a> Mathieu, T., Légaré, S., Nzekoue, A., Jauré, N., Lester, H., Dias, T., & Kusters, R. (2025). Integrative multi-omics modeling for cultivated meat production, quality, and safety. *Trends in Food Science & Technology, 166,* 105364. https://doi.org/10.1016/j.tifs.2025.105364

<a id="61">61</a> Wang, W., Swain, S., Lee, J., Lin, Z., Canales, B., Aljović, A., Liu, Y., Li, Q., Marin-Llobet, A., Liu, M., Gao, Z., Liu, R., Alvarez-Dominguez, J., & Liu, J. (2025). *Agentic Lab: An Agentic-physical AI system for cell and organoid experimentation and manufacturing.* bioRxiv. https://doi.org/10.1101/2025.11.11.686354

<a id="62">62</a> Qiu, Y., Huang, Z., Wang, Z., Liu, H., Qiao, Y., Hu, Y., Sun, S., Peng, H., Xu, R. X., & Sun, M. (2025). *BioMARS: A Multi-Agent Robotic System for Autonomous Biological Experiments.* arXiv. https://doi.org/10.48550/arXiv.2507.01485

<a id="63">63</a> Pandi, A., Diehl, C., Yazdizadeh Kharrazi, A., Scholz, S., Bobkova, E., Faure, L., Nattermann, M., Adam, D., Chapin, N., Foroughijabbari, Y., Moritz, C., Paczia, N., Cortina, N., Faulon, J.-L., & Erb, T. J. (2022). A versatile active learning workflow for optimization of genetic and metabolic networks. *Nature Communications, 13*(1). https://doi.org/10.1038/s41467-022-31245-z

<a id="64">64</a> Tiukova, I. A., Brunnsåker, D., Bjurström, E. Y., Gower, A. H., Kronström, F., Reder, G. K., Reiserer, R. S., Korovin, K., Soldatova, L. B., Wikswo, J. P., & King, R. D. (2024). *Genesis: Towards the Automation of Systems Biology Research.* arXiv. https://doi.org/10.48550/arXiv.2408.10689

<a id="65">65</a> Brunnsåker, D., Gower, A., Naval, P., Bjurström, E., Kronström, F., Tiukova, I., & King, R. (2025). *Agentic AI Integrated with Scientific Knowledge: Laboratory Validation in Systems Biology.* bioRxiv. https://doi.org/10.1101/2025.06.24.661378

<a id="66">66</a> Singh, A., Kaufmann-Malaga, B., Lerman, J., Dougherty, D., Zhang, Y., Kilbo, A., Wilson, E., Ng, C., Erbilgin, O., Curran, K., Reeves, C., Hung, J., Mantovani, S., King, Z., Ayson, M., Denery, J., Lu, C., Norton, P., Tran, C., Platt, D., Cherry, J., Chandran, S., & Meadows, A. (2023). *An Automated Scientist to Design and Optimize Microbial Strains for the Industrial Production of Small Molecules.* bioRxiv. https://doi.org/10.1101/2023.01.03.521657

<a id="67">67</a> Ruscone, M., Vazquez, M., & Valencia, A. (2025). *Intelligent Tool Orchestration for Rapid Mechanistic Model Prototyping: MCP Servers as AI-Biology Interfaces.* bioRxiv. https://doi.org/10.1101/2025.09.10.675105

<a id="68">68</a> Li, X., Liang, Z., Guo, Z., Liu, Z., Wu, K., Luo, J., Zhang, Y., Liu, L., Sun, M., Huang, Y., Tang, H., Chen, Y., Yu, T., Nielsen, J., & Li, F. (2024). *Leveraging large language models for metabolic engineering design.* bioRxiv. https://doi.org/10.1101/2024.09.09.612023

<a id="69">69</a> Maeda, K., & Kurata, H. (2023). Automatic Generation of SBML Kinetic Models from Natural Language Texts Using GPT. *International Journal of Molecular Sciences, 24*(8), 7296. https://doi.org/10.3390/ijms24087296

<a id="70">70</a> Boiko, D. A., MacKnight, R., Kline, B., & Gomes, G. (2023). Autonomous chemical research with large language models. *Nature, 624,* 570–578. https://doi.org/10.1038/s41586-023-06792-0

<a id="71">71</a> Bran, A. M., Cox, S., Schilter, O., Baldassari, C., White, A. D., & Schwaller, P. (2024). Augmenting large language models with chemistry tools. *Nature Machine Intelligence.* https://doi.org/10.1038/s42256-024-00832-8

<a id="72">72</a> Colantonio, V., Ferrão, L. F. V., Tieman, D. M., Bliznyuk, N., Sims, C., Klee, H. J., Munoz, P., & Resende, M. F. R. (2022). Metabolomic selection for enhanced fruit flavor. *Proceedings of the National Academy of Sciences, 119*(7), e2115865119. https://doi.org/10.1073/pnas.2115865119

> **Code**: https://github.com/Resende-Lab/metabolomic_selection_for_enhanced_fruit_flavor

<a id="80">80</a> Keller, A., Gerkin, R. C., Guan, Y., Dhurandhar, A., Turu, G., Szalai, B., Mainland, J. D., Ihara, Y., Yu, C. W., Wolfinger, R., Vens, C., Schietgat, L., De Grave, K., Norel, R., DREAM Olfaction Prediction Consortium, Stolovitzky, G., Cecchi, G. A., Vosshall, L. B., & Meyer, P. (2017). Predicting human olfactory perception from chemical features of odor molecules. *Science, 355*(6327), 820–826. https://doi.org/10.1126/science.aal2014

<a id="88">88</a> Su, Y., Chen, J., Jiang, Z., Zhong, Z., Wang, L., Liu, Q., & Zhang, Z. (2026). *SpectraLLM: Uncovering the Ability of LLMs for Molecular Structure Elucidation from Multi-Spectral Data.* arXiv. https://doi.org/10.48550/arXiv.2508.08441

<a id="89">89</a> Brouwer, E., Edwards, C., Wu, A., Collier, J., Heimberg, G., Li, X., Subramaniam, M., Hajiramezanali, E., Richmond, D., Hütter, J., Mostafavi, S., & Scalia, G. (2026). *AssayBench: An Assay-Level Virtual Cell Benchmark for LLMs and Agents.* arXiv. https://doi.org/10.48550/arXiv.2605.10876

<a id="90">90</a> Yu, X., Yang, Y., Liu, Q., Du, Y., McSweeney, S., & Lin, Y. (2026). *GenCellAgent: Generalizable, Training-Free Cellular Image Segmentation via Large Language Model Agents.* arXiv. https://doi.org/10.48550/arXiv.2510.13896

<a id="91">91</a> Ding, Y., Qiang, B., Li, S., Zhou, Y., Yu, J., Li, Q., Shi, C., Zhang, L., Wang, Y., Zheng, N., & Liu, Z. (2026). Pretraining a foundation model for small-molecule natural products. *Nature Machine Intelligence*. https://doi.org/10.1038/s42256-026-01226-8

<a id="92">92</a> Pearce, J., Simmonds, S., Mahmoudabadi, G., Krishnan, L., Palla, G., Istrate, A., Tarashansky, A., Nelson, B., Valenzuela, O., Li, D., Quake, S., & Karaletsos, T. (2026). TranscriptFormer: A generative cell atlas across 1.5 billion years of evolution. *Science*. https://doi.org/10.1126/science.aec8514

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

<a id="113">113</a> Boiarsky, R., Singh, N. M., Buendia, A., Amini, A. P., Getz, G., & Sontag, D. (2024). Deeper evaluation of a single-cell foundation model. *Nature Machine Intelligence, 6*(12), 1443–1446. https://doi.org/10.1038/s42256-024-00949-w

<a id="114">114</a> Yang, F., Wang, F., Huang, L., Liu, L., Huang, J., & Yao, J. (2024). Reply to: Deeper evaluation of a single-cell foundation model. *Nature Machine Intelligence, 6*(12), 1447–1450. https://doi.org/10.1038/s42256-024-00948-x

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

<a id="123">123</a> Littman, R., Levine, J., Maleki, S., Lee, Y., Ermakov, V., Qiu, L., Wu, A., Huang, K., Lopez, R., Scalia, G., Biancalani, T., Richmond, D., Regev, A., & Hütter, J. C. (2025). *Gene-embedding-based prediction and functional evaluation of perturbation expression responses with PRESAGE.* bioRxiv. https://doi.org/10.1101/2025.06.03.657653

<a id="124">124</a> Dong, M., Adduri, A., Gautam, D., Carpenter, C., Shah, R., Ricci-Tam, C., Kluger, Y., Burke, D. P., & Roohani, Y. H. (2026). *Stack: In-Context Learning of Single-Cell Biology.* bioRxiv. https://doi.org/10.64898/2026.01.09.698608

<a id="125">125</a> Roohani, Y., Lee, A., Huang, Q., Vora, J., Steinhart, Z., Huang, K., Marson, A., Liang, P., & Leskovec, J. (2025). *BioDiscoveryAgent: An AI Agent for Designing Genetic Perturbation Experiments.* arXiv. https://doi.org/10.48550/arXiv.2405.17631

> **Code**: https://github.com/snap-stanford/BioDiscoveryAgent

<a id="126">126</a> Youngblut, N. D., Carpenter, C., Nayebnazar, A., Adduri, A., Shah, R., Ricci-Tam, C., Prashar, J., Ilango, R., Teyssier, N., Konermann, S., Hsu, P. D., Dobin, A., Burke, D. P., Goodarzi, H., & Roohani, Y. H. (2025). *scBaseCount: an AI agent-curated, uniformly processed, and autonomously updated single cell data repository.* bioRxiv. https://doi.org/10.1101/2025.02.27.640494

<a id="127">127</a> Chevalley, M., Roohani, Y. H., Mehrjou, A., Leskovec, J., & Schwab, P. (2025). A large-scale benchmark for network inference from single-cell perturbation data. *Communications Biology, 8*(1), 412. https://doi.org/10.1038/s42003-025-07764-y

> **Code**: https://github.com/causalbench/causalbench

<a id="133">133</a> Kuehl, M., Schaub, D. P., Carli, F., Heumos, L., Hellmig, M., Fernández-Zapata, C., Kaiser, N., Schaul, J., Kulaga, A., Usanov, N., Krebs, C. F., Panzer, U., Bonn, S., Lobentanzer, S., Saez-Rodriguez, J., & Puelles, V. G. (2025). BioContextAI is a community hub for agentic biomedical systems. *Nature Biotechnology, 43*(11), 1755–1757. https://doi.org/10.1038/s41587-025-02900-9

> **Code**: https://github.com/biocontext-ai

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

## Metabolic Reference Work

This section catalogs foundational primary research papers describing genome-scale metabolic models (GEMs) and related metabolic infrastructure for cellular agriculture. As with the Sensory & Flavor Reference Work above, entries here are primary research where the contribution is the model / data resource itself rather than an applied AI/ML method — the AI/ML work building on these resources lives in the matrix above. Each entry below is the canonical citation for the corresponding data resource in [Datasets.md / Genome-Scale Metabolic Models (GEMs)](./Datasets.md#genome-scale-metabolic-models-gems). Same numeric ID counter as the primary references; no matrix participation.

<a id="81">81</a> Lee, J., Kim, J., Bae, H., Kim, M., Jung, B., Kim, J., Lee, S., & Kim, H. (2024). *Multi-omics analysis and genome-scale metabolic reconstruction of cattle Bos taurus for optimal production of cultured meat.* bioRxiv. https://doi.org/10.1101/2024.12.09.627468

<a id="82">82</a> Salehabadi, E., Motamedian, E., & Shojaosadati, S. A. (2022). Reconstruction of a generic genome-scale metabolic network for chicken: Investigating network connectivity and finding potential biomarkers. *PLOS ONE, 17*(3), e0254270. https://doi.org/10.1371/journal.pone.0254270

<a id="83">83</a> Qiu, S., Kratochvilova, E., Huang, W., Cui, Z., Agnew, T., Yang, A., & Ye, H. (2026). Proteome constrained metabolic modeling of *Sus scrofa* muscle stem cells for cultured meat production. *Metabolic Engineering, 94,* 252–263. https://doi.org/10.1016/j.ymben.2026.01.001

<a id="84">84</a> Zakhartsev, M., Rotnes, F., Gulla, M., Øyås, O., van Dam, J. C. J., Suarez-Diez, M., Grammes, F., Hafþórsson, R., van Helvoirt, W., Koehorst, J. J., Schaap, P. J., Jin, Y., Mydland, L. T., Gjuvsland, A. B., Sandve, S. R., Martins dos Santos, V. A. P., & Vik, J. O. (2022). SALARECON connects the Atlantic salmon genome to growth and feed efficiency. *PLOS Computational Biology, 18*(6), e1010194. https://doi.org/10.1371/journal.pcbi.1010194

<a id="85">85</a> Hefzi, H., Ang, K. S., Hanscho, M., Bordbar, A., Ruckerbauer, D., Lakshmanan, M., Orellana, C. A., Baycin-Hizal, D., Huang, Y., Ley, D., Martinez, V. S., Kyriakopoulos, S., Jiménez, N. E., Zielinski, D. C., Quek, L.-E., Wulff, T., Arnsdorf, J., Li, S., Lee, J. S., Paglia, G., Loira, N., Spahn, P. N., Pedersen, L. E., Gutierrez, J. M., King, Z. A., Lund, A. M., Nagarajan, H., Thomas, A., Abdel-Haleem, A. M., Zanghellini, J., Kildegaard, H. F., Voldborg, B. G., Gerdtzen, Z. P., Betenbaugh, M. J., Palsson, B. O., Andersen, M. R., Nielsen, L. K., Borth, N., Lee, D.-Y., & Lewis, N. E. (2016). A Consensus Genome-scale Reconstruction of Chinese Hamster Ovary Cell Metabolism. *Cell Systems, 3*(5), 434–443.e8. https://doi.org/10.1016/j.cels.2016.10.020

<a id="86">86</a> Brunk, E., Sahoo, S., Zielinski, D. C., Altunkaya, A., Dräger, A., Mih, N., Gatto, F., Nilsson, A., Preciat Gonzalez, G. A., Aurich, M. K., Prlić, A., Sastry, A., Danielsdottir, A. D., Heinken, A., Noronha, A., Rose, P. W., Burley, S. K., Fleming, R. M. T., Nielsen, J., Thiele, I., & Palsson, B. O. (2018). Recon3D enables a three-dimensional view of gene variation in human metabolism. *Nature Biotechnology, 36*(3), 272–281. https://doi.org/10.1038/nbt.4072

<a id="87">87</a> Robinson, J. L., Kocabaş, P., Wang, H., Cholley, P.-E., Cook, D., Nilsson, A., Anton, M., Ferreira, R., Domenzain, I., Billa, V., Limeta, A., Hedin, A., Gustafsson, J., Kerkhoven, E. J., Svensson, L. T., Palsson, B. O., Mardinoglu, A., Hansson, L., Uhlén, M., & Nielsen, J. (2020). An atlas of human metabolism. *Science Signaling, 13*(624), eaaz1482. https://doi.org/10.1126/scisignal.aaz1482

## Foundational Methods Reference Work

This section catalogs the foundational methods and theory papers — from machine learning and from cell biology — that the AI × cell-ag work in the matrix builds upon, but which do not themselves apply a specific AI/ML method to a specific cell-ag problem (otherwise they would live in the matrix). The transformer architecture underlies every entry in the Foundation Models rows; the Waddington-landscape formalism is the conceptual substrate for the Cell-State & Perturbation Prediction row. Same numeric ID counter as the primary references; no matrix participation.

<a id="130">130</a> Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., & Polosukhin, I. (2023). *Attention Is All You Need.* arXiv. https://doi.org/10.48550/arXiv.1706.03762

<a id="131">131</a> Wang, J., Zhang, K., Xu, L., & Wang, E. (2011). Quantifying the Waddington landscape and biological paths for development and differentiation. *Proceedings of the National Academy of Sciences, 108*(20), 8257–8262. https://doi.org/10.1073/pnas.1017017108

## Reviews & Perspectives

This section lists review articles, position papers, and commentaries that survey the field or opine on it, rather than applying a specific AI method to a specific cell-ag problem. Entries here share the same reference-ID counter as the primary references above but do not participate in the matrix.

<a id="37">37</a> Kuhl, E. (2025). AI for food: accelerating and democratizing discovery and innovation. *npj Science of Food, 9*(1). https://doi.org/10.1038/s41538-025-00441-8

<a id="38">38</a> McNulty, M. J., Stout, A. J., & Kaplan, D. L. (2025). Meating the moment. *EMBO Reports, 26*(13), 3229–3235. https://doi.org/10.1038/s44319-025-00492-8

<a id="39">39</a> Datta, B., Buehler, M. J., Chow, Y., Gligoric, K., Jurafsky, D., Kaplan, D. L., Ledesma-Amaro, R., Del Missier, G., Neidhardt, L., Pichara, K., Sanchez-Lengeling, B., Schlangen, M., St. Pierre, S. R., Tagkopoulos, I., Thomas, A., Watson, N. J., & Kuhl, E. (2026). Artificial Intelligence for Food Innovation. *arXiv.* https://doi.org/10.48550/arXiv.2509.21556

<a id="76">76</a> Wang, Y., Tuccillo, F., Lampi, A.-M., Knaapila, A., Pulkkinen, M., Kariluoto, S., Coda, R., Edelmann, M., Jouppila, K., Sandell, M., Piironen, V., & Katina, K. (2022). Flavor challenges in extruded plant-based meat alternatives: A review. *Comprehensive Reviews in Food Science and Food Safety, 21*(3), 2898–2929. https://doi.org/10.1111/1541-4337.12964

<a id="78">78</a> Mittermeier-Kleßinger, V. K., Hofmann, T., & Dawid, C. (2021). Mitigating Off-Flavors of Plant-Based Proteins. *Journal of Agricultural and Food Chemistry, 69*(32), 9202–9207. https://doi.org/10.1021/acs.jafc.1c03398

<a id="79">79</a> Alasi, S. O., Sanusi, M. S., Sunmonu, M. O., Odewole, M. M., & Adepoju, A. L. (2024). Exploring recent developments in novel technologies and AI integration for plant-based protein functionality: A review. *Journal of Agriculture and Food Research, 15,* 101036. https://doi.org/10.1016/j.jafr.2024.101036

<a id="132">132</a> Todhunter, M. E., Jubair, S., Verma, R., Saqe, R., Shen, K., & Duffy, B. (2024). Artificial intelligence and machine learning applications for cultured meat. *Frontiers in Artificial Intelligence, 7,* 1424012. https://doi.org/10.3389/frai.2024.1424012

<a id="128">128</a> Bunne, C., Roohani, Y., Rosen, Y., Gupta, A., Zhang, X., Roed, M., Alexandrov, T., AlQuraishi, M., Brennan, P., Burkhardt, D. B., Califano, A., Cool, J., Dernburg, A. F., Ewing, K., Fox, E. B., Haury, M., Herr, A. E., Horvitz, E., Hsu, P. D., Jain, V., Johnson, G. R., Kalil, T., Kelley, D. R., Kelley, S. O., Kreshuk, A., Mitchison, T., Otte, S., Shendure, J., Sofroniew, N. J., Theis, F., Theodoris, C. V., Upadhyayula, S., Valer, M., Wang, B., Xing, E., Yeung-Levy, S., Zitnik, M., Karaletsos, T., Regev, A., Lundberg, E., Leskovec, J., & Quake, S. R. (2024). How to build the virtual cell with artificial intelligence: Priorities and opportunities. *Cell, 187*(25), 7045–7063. https://doi.org/10.1016/j.cell.2024.11.015

<a id="129">129</a> Roohani, Y. H., Hua, T. J., Tung, P. Y., Bounds, L. R., Yu, F. B., Dobin, A., Teyssier, N., Adduri, A., Woodrow, A., Plosky, B. S., Mehta, R., Hsu, B., Sullivan, J., Ricci-Tam, C., Li, N., Kazaks, J., Gilbert, L. A., Konermann, S., Hsu, P. D., Goodarzi, H., & Burke, D. P. (2025). Virtual Cell Challenge: Toward a Turing test for the virtual cell. *Cell, 188*(13), 3370–3374. https://doi.org/10.1016/j.cell.2025.06.008
