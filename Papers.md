# Paper matrix
This document presents the core research papers at the intersection of Cellular Agriculture and AI. The papers are organized by problem and AI type, to indicate which approaches have been successful in a given research area.

| | [Media Optimization](./ResearchAreas/MediaOptimization.md) | [Cellular Engineering](./ResearchAreas/CellEngineering.md) | [Bioprocess control](./ResearchAreas/Bioprocess.md) | [Scaffolding](./ResearchAreas/Scaffolding.md)  | [Sensory Prediction](./ResearchAreas/SensoryPrediction.md) | [AI Tooling / Methodology](./ResearchAreas/AITooling.md) |
|---|---|---|---|---|---|---|
| [Bayesian Optimization](https://en.wikipedia.org/wiki/Bayesian_optimization) | [2](#2),[3](#3),[15](#15),[16](#16),[18](#18),[58](#58) | [16](#16) | [59](#59) | | | |
| [Deep Learning](https://en.wikipedia.org/wiki/Deep_learning) | [1](#1),[15](#15),[17](#17),[18](#18) | [4](#4),[5](#5),[6](#6),[57](#57),[60](#60) | [7](#7) | [20](#20),[35](#35) | | |
| [GNN](https://en.wikipedia.org/wiki/Graph_neural_network) | | [8](#8),[12](#12),[13](#13)| | | [14](#14),[36](#36) | [52](#52) |
| [CNN](https://en.wikipedia.org/wiki/Convolutional_neural_network) | | | [29](#29), [33](#33) | [19](#19) | [11](#11),[26](#26) | |
| [GAN](https://en.wikipedia.org/wiki/Generative_adversarial_network) / [VAE](https://en.wikipedia.org/wiki/Variational_autoencoder) | | [9](#9),[10](#10) | | | [11](#11) | |
| [Genetic Algorithms](https://en.wikipedia.org/wiki/Genetic_algorithm) | [1](#1),[17](#17) | | [30](#30),[31](#31) | | | |
| [SVM](https://en.wikipedia.org/wiki/Support_vector_machine) | [21](#21) | [22](#22) | [31](#31), [32](#32) | [34](#34) |  | |
| [Ensemble Learning](https://en.wikipedia.org/wiki/Ensemble_learning) | | | | | [27](#27) | |
| [K-Nearest Neighbors](https://en.wikipedia.org/wiki/K-nearest_neighbors_algorithm) | | | | | [28](#28) | |
| [Active Learning](https://en.wikipedia.org/wiki/Active_learning_(machine_learning)) | [23](#23),[24](#24),[25](#25),[58](#58) | | | | | [63](#63) |
| [LLMs](https://en.wikipedia.org/wiki/Large_language_model) / [AI Agents](https://en.wikipedia.org/wiki/Intelligent_agent) | | | [61](#61),[62](#62) | | | [40](#40),[41](#41),[42](#42),[43](#43),[44](#44),[45](#45),[46](#46),[47](#47),[48](#48),[49](#49),[50](#50),[51](#51),[53](#53),[54](#54),[55](#55),[56](#56) |


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

## Reviews & Perspectives

This section lists review articles, position papers, and commentaries that survey the field or opine on it, rather than applying a specific AI method to a specific cell-ag problem. Entries here share the same reference-ID counter as the primary references above but do not participate in the matrix.

<a id="37">37</a> Kuhl, E. (2025). AI for food: accelerating and democratizing discovery and innovation. *npj Science of Food, 9*(1). https://doi.org/10.1038/s41538-025-00441-8

<a id="38">38</a> McNulty, M. J., Stout, A. J., & Kaplan, D. L. (2025). Meating the moment. *EMBO Reports, 26*(13), 3229–3235. https://doi.org/10.1038/s44319-025-00492-8

<a id="39">39</a> Datta, B., Buehler, M. J., Chow, Y., Gligoric, K., Jurafsky, D., Kaplan, D. L., Ledesma-Amaro, R., Del Missier, G., Neidhardt, L., Pichara, K., Sanchez-Lengeling, B., Schlangen, M., St. Pierre, S. R., Tagkopoulos, I., Thomas, A., Watson, N. J., & Kuhl, E. (2026). Artificial Intelligence for Food Innovation. *arXiv.* https://doi.org/10.48550/arXiv.2509.21556
