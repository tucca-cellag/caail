# Paper matrix
This document presents the core research papers at the intersection of Cellular Agriculture and AI. The papers are organized by problem and AI type, to indicate which approaches have been successful in a given research area.

| | Media Optimization | Cellular Engineering | Bioprocess control | Scaffolding  | Sensory Prediction |
|---|---|---|---|---|---| 
| [Bayesian Optimization](https://en.wikipedia.org/wiki/Bayesian_optimization) | [1](#1),[2](#2),[3](#3),[4](#4),[5](#5),[19](#19),[20](#20),[22](#22) | [4](#4),[5](#5),[20](#20) | [4](#4) | | |
| [Deep Learning](https://en.wikipedia.org/wiki/Deep_learning) | [19](#19),[21](#21),[22](#22) | [6](#6),[7](#7),[8](#8),[9](#9), | | [24](#24) | |
| [Neural Networks](https://en.wikipedia.org/wiki/Neural_network) | [1](#1),[21](#21),[22](#22) | | [4](#4),[10](#10),[11](#11) | [24](#24) | |
| [Genetic Algorithms](https://en.wikipedia.org/wiki/Genetic_algorithm) | [1](#1),[3](#3) | [4](#4),[5](#5) | | 
| [GAN](https://en.wikipedia.org/wiki/Generative_adversarial_network) / [VAE](https://en.wikipedia.org/wiki/Variational_autoencoder) | | [12](#12),[13](#13),[14](#14) | | | [15](#15) |
| [GNN](https://en.wikipedia.org/wiki/Graph_neural_network) | | [16](#16),[17](#17)| | | [18](#18) |
| [CNN](https://en.wikipedia.org/wiki/Convolutional_neural_network) | | | | [23](#23) | [15](#15) |
| [SVM](https://en.wikipedia.org/wiki/Support_vector_machine) | [25](#25) | [4](#4),[26](#26) | |  |  |
| [Active Learning](https://en.wikipedia.org/wiki/Active_learning_(machine_learning)) | [27](#27),[28](#28),[29](#29) | | |  | |


## References

<a id="1">1</a> Nikkhah, A., Rohani, A., Zarei, M., Kulkarni, A., Batarseh, F. A., Blackstone, N. T., & Ovissipour, R. (2023). Toward sustainable culture media: Using artificial intelligence to optimize reduced-serum formulations for cultivated meat. *Science of The Total Environment, 894,* 164988. https://doi.org/10.1016/j.scitotenv.2023.164988

<a id="2">2</a> Cosenza, Z., Block, D. E., Baar, K., and Chen, X. (2023). Multi-objective Bayesian
algorithm automatically discovers low-cost high-growth serum-free media for cellular
agriculture application. *Eng. Life Sci.* 23:e2300005. doi: 10.1002/elsc.202300005

<a id="3">3</a> Cosenza, Z., Astudillo, R., Frazier, P. I., Baar, K., and Block, D. E. (2022). Multi-
information source Bayesian optimization of culture media for cellular agriculture.
*Biotechnol. Bioeng.* 119, 2447–2458. doi: 10.1002/bit.28132

<a id="4">4</a> Hesami, M., & Jones, A. M. P. (2020). Application of artificial intelligence models and optimization algorithms in plant cell and tissue culture. *Applied Microbiology and Biotechnology*, 104(22), 9449–9485. doi: 10.1007/s00253-020-10888-2

<a id="5">5</a> Biswas, D., Chakraborty, A., Mukherjee, S., & Ghosh, B. (2023). Hairy root culture: A
potent method for improved secondary metabolite production of solanaceous plants
\[Review\] *Frontiers in Plant Science*, 14. doi: 10.3389/fpls.2023.1197555,
2023.

<a id="6">6</a> Chen, Y., Li, Y., Narayan, R., Subramanian, A., and Xie, X. (2016). Gene expression inference with deep learning. *Bioinformatics* 32, 1832–1839. doi: 10.1093/bioinformatics/btw074

<a id="7">7</a> Li, X., Wang, K., Lyu, Y., Pan, H., Zhang, J., Stambolian, D., et al. (2020). Deep learning enables accurate clustering with batch effect removal in single-cell RNA-seq analysis. *Nat. Commun.* 11:2338. doi: 10.1038/s41467-020-15851-3

<a id="8">8</a> Athaya, T., Ripan, R. C., Li, X., and Hu, H. (2023). Multimodal deep learning approaches for single-cell multi-omics data integration. *Brief. Bioinform.* 24:bbad313. doi: 10.1093/bib/bbad313

<a id="9">9</a> Ji, Y., Zhou, Z., Liu, H., and Davuluri, R. V. (2021). DNABERT: pre-trained bidirectional encoder representations from transformers model for DNA-language in genome. *Bioinformatics* 37, 2112–2120. doi: 10.1093/bioinformatics/btab083

<a id="10">10</a> Fan, R., Ebrahimi, M., Quitmann, H., Aden, M., & Czermak, P. (2016). An innovative optical sensor for the online monitoring and control of biomass concentration in a membrane bioreactor system for lactic acid production. *Sensors*, 16(3).

<a id="11">11</a> Tamburini, E., Marchetti, M. G., & Pedrini, P. (2014). Monitoring key parameters in bioprocesses using near-infrared technology. *Sensors*, 14(10), 18941–18959.

<a id="12">12</a> Ciortan, M., and Defrance, M. (2021). GNN-based embedding for clustering scRNAseq data. *Bioinformatics* 38, 1037–1044. doi: 10.1093/bioinformatics/btab787

<a id="13">13</a> Lin, E., Mukherjee, S., and Kannan, S. (2020). A deep adversarial variational autoencoder model for dimensionality reduction in single-cell RNA sequencing analysis. *BMC Bioinformatics* 21:64. doi: 10.1186/s12859-020-3401-5

<a id="14">14</a> Zrimec, J., Fu, X., Muhammad, A. S., Skrekas, C., Jauniskis, V., Speicher, N. K., et al. (2022). Controlling gene expression with deep generative design of regulatory DNA. *Nat. Commun.* 13:5099. doi: 10.1038/s41467-022-32818-8

<a id="15">15</a> Shen, C., Wang, R., Jin, Q., Chen, X., Cai, K., & Xu, B. (2024). Chemometrics methods, sensory evaluation and intelligent sensory technologies combined with GAN-Based integrated deep-learning framework to discriminate salted goose breeds. *Food Chemistry*, 461, Article 140919. doi: 10.1016/j.foodchem.2024.140919

<a id="16">16</a> Shan, Y., Yang, J., Li, X., Zhong, X., and Chang, Y. (2023). GLAE: a graph-learnable auto-encoder for single-cell RNA-seq analysis. *Inf. Sci.* 621, 88–103. doi: 10.1016/j.ins.2022.11.049

<a id="17">17</a> Wang, J., Ma, A., Chang, Y., Gong, J., Jiang, Y., Qi, R., et al. (2021). scGNN is a novel graph neural network framework for single-cell RNA-Seq analyses. *Nat. Commun.* 12:1882. doi: 10.1038/s41467-021-22197-x

<a id="18">18</a> Lee, B. K., Mayhew, E. J., Sanchez-Lengeling, B., Wei, J. N., Qian, W. W., Little, K. A., et al. (2023). A principal odor map unifies diverse tasks in olfactory perception. *Science* 381, 999–1006. doi: 10.1126/science.ade4401

<a id="19">19</a> Yoshida, K., Watanabe, K., Chiou, T.-Y., & Konishi, M. (2023). High throughput optimization of medium composition for Escherichia coli protein expression using deep learning and Bayesian optimization. *Journal of Bioscience and Bioengineering, 135*(2), 127–133. https://doi.org/10.1016/j.jbiosc.2022.12.004

<a id="20">20</a> Kanda, G. N., Tsuzuki, T., Terada, M., Sakai, N., Motozawa, N., Masuda, T., Nishida, M., Watanabe, C. T., Higashi, T., Horiguchi, S. A., Kudo, T., Kamei, M., Sunagawa, G. A., Matsukuma, K., Sakurada, T., Ozawa, Y., Takahashi, M., Takahashi, K., & Natsume, T. (2022). Robotic search for optimal cell culture in regenerative medicine. *eLife, 11,* e77007. https://doi.org/10.7554/eLife.77007

<a id="21">21</a> Cosenza, Z., & Block, D. E. (2021). A generalizable hybrid search framework for optimizing expensive design problems using surrogate models. *Engineering Optimization, 53*(10), 1772–1785. https://doi.org/10.1080/0305215X.2020.1826466

<a id="22">22</a> Cosenza, Z. A. (2022). *Sequential Learning Methods for the Experimental Optimization of Cell Culture Media for Cellular Agriculture* [UC Davis]. https://escholarship.org/uc/item/119489fc

<a id="23">23</a> Bermejillo Barrera, M. D., Franco-Martínez, F., & Díaz Lantada, A. (2021). Artificial Intelligence Aided Design of Tissue Engineering Scaffolds Employing Virtual Tomography and 3D Convolutional Neural Networks. *Materials, 14*(18), 5278. https://doi.org/10.3390/ma14185278

<a id="24">24</a> Rafieyan, S., Ansari, E., & Vasheghani-Farahani, E. (2024). A practical machine learning approach for predicting the quality of 3D (bio)printed scaffolds. *Biofabrication, 16*(4), 045014. https://doi.org/10.1088/1758-5090/ad6374

<a id="25">25</a> Xu, J., Yan, F., Li, Z., Wang, D., Sheng, H., & Liu, Y. (2014). Serum-Free Medium Optimization Based on Trial Design and Support Vector Regression. *BioMed Research International, 2014,* 1–7. https://doi.org/10.1155/2014/269305

<a id="26">26</a> Lao, Z., Matsui, Y., Ijichi, S., & Ying, B.-W. (2022). Global coordination of the mutation and growth rates across the genetic and nutritional variety in Escherichia coli. *Frontiers in Microbiology, 13,* 990969. https://doi.org/10.3389/fmicb.2022.990969

<a id="27">27</a> Zhang, S., Aida, H., & Ying, B.-W. (2023). Employing Active Learning in Medium Optimization for Selective Bacterial Growth. *Applied Microbiology, 3*(4), 1355–1369. https://doi.org/10.3390/applmicrobiol3040091

<a id="28">28</a> Hashizume, T., Ozawa, Y., & Ying, B.-W. (2022). *Employing active learning in the optimization of culture medium for mammalian cells.* https://doi.org/10.1101/2022.12.24.521878

<a id="29">29</a> Ozawa, Y., Hashizume, T., & Ying, B.-W. (2025). A data-driven approach for cell culture medium optimization. *Biochemical Engineering Journal, 214,* 109591. https://doi.org/10.1016/j.bej.2024.109591
