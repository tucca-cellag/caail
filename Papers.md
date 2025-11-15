# Paper matrix
This document presents the core research papers at the intersection of Cellular Agriculture and AI. The papers are organized by problem and AI type, to indicate which approaches have been successful in a given research area.

| | Media Optimization | Cellular Engineering | Bioprocess control | Scaffolding  | Sensory Prediction |
|---|---|---|---|---|---| 
| [Bayesian Optimization](https://en.wikipedia.org/wiki/Bayesian_optimization) | [2](#2),[3](#3),[15](#15),[16](#16),[18](#18) | [16](#16) | | | |
| [Deep Learning](https://en.wikipedia.org/wiki/Deep_learning) | [1](#1),[15](#15),[17](#17),[18](#18) | [4](#4),[5](#5),[6](#6) | [7](#7) | [20](#20) | |
| [GNN](https://en.wikipedia.org/wiki/Graph_neural_network) | | [8](#8),[12](#12),[13](#13)| | | [14](#14) |
| [CNN](https://en.wikipedia.org/wiki/Convolutional_neural_network) | | | | [19](#19) | [11](#11), [26](#26) |
| [GAN](https://en.wikipedia.org/wiki/Generative_adversarial_network) / [VAE](https://en.wikipedia.org/wiki/Variational_autoencoder) | | [9](#9),[10](#10) | | | [11](#11) |
| [Genetic Algorithms](https://en.wikipedia.org/wiki/Genetic_algorithm) | [1](#1),[17](#17) |  | | 
| [SVM](https://en.wikipedia.org/wiki/Support_vector_machine) | [21](#21) | [22](#22) | |  |  |
| [Ensemble Learning](https://en.wikipedia.org/wiki/Ensemble_learning) | | | | | [27](#27) |
| [K-Nearest Neighbors](https://en.wikipedia.org/wiki/K-nearest_neighbors_algorithm) | | | | | [28](#28) |
| [Active Learning](https://en.wikipedia.org/wiki/Active_learning_(machine_learning)) | [23](#23),[24](#24),[25](#25) | | | | |


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



