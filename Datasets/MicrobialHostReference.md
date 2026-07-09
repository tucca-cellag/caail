# Microbial Host Reference

Precision fermentation is the microbial-host branch of cellular agriculture: engineered yeast and other microbes are used to secrete recombinant growth factors, media proteins, and animal-protein analogues that feed or replace the animal-cell side of the field. Genome-scale metabolic models (GEMs) of the standard production hosts are the reference substrate for that work — they parameterize media and feed design, predict growth and secretion on defined carbon sources, and provide the constraint-based scaffold that strain-engineering campaigns optimize against. This page collects the consensus GEMs for the two dominant precision-fermentation hosts, *Saccharomyces cerevisiae* and *Komagataella phaffii* (*Pichia pastoris*). Like the human and CHO reference pages in this directory, these are host-organism reference reconstructions rather than cultivated-meat-species data — the modeling substrate the precision-fermentation side of cell-ag builds on.

## Genome-scale metabolic models

GEMs are SBML-formatted reconstructions of an organism's metabolic network — every reaction, metabolite, and gene-protein-reaction mapping — and are the input data structure for the constraint-based modeling tools in [Software.md / Metabolic Modeling & Strain Design](../Software.md#metabolic-modeling--strain-design). The reconstructions below are the microbial-host counterparts to the mammalian GEMs on the [CHO](./CHOReference.md) and [Human](./HumanReference.md) reference pages.

### Yeast9 — *Saccharomyces cerevisiae* (precision-fermentation host reference)

Yeast9 is the community-curated consensus genome-scale metabolic model for *Saccharomyces cerevisiae* (Zhang, Sánchez, Li, et al. 2024, *Molecular Systems Biology*), the latest generation of the long-running consensus *S. cerevisiae* reconstruction. It ships as versioned SBML with continuous community curation at [`SysBioChalmers/yeast-GEM`](https://github.com/SysBioChalmers/yeast-GEM). *S. cerevisiae* is the workhorse chassis for precision-fermentation routes to recombinant proteins and food molecules, so Yeast9 is the reference network for media and feed design, flux prediction, and strain-design campaigns on the yeast side of cell-ag — including the *S. cerevisiae* fermentation-aroma modeling in [Papers.md ref #27](../Papers.md#27) (Du et al. 2025). Published: [`10.1038/s44320-024-00060-7`](https://doi.org/10.1038/s44320-024-00060-7).

### iMT1026 / iMT1026 v3.0 — *Komagataella phaffii* (*Pichia pastoris*)

iMT1026 is the genome-scale metabolic reconstruction of *Komagataella phaffii* (*Pichia pastoris*), integrating and validating earlier Pichia models with updated protein-glycosylation, lipid, and energy metabolism (Tomàs-Gamisans, Ferrer, & Albiol 2016, *PLOS ONE*). The v3.0 update fine-tunes the model for improved prediction of growth on methanol or glycerol as sole carbon sources (Tomàs-Gamisans, Ferrer, & Albiol 2018, *Microbial Biotechnology*) — the carbon sources that matter most for methylotrophic Pichia bioprocesses. *K. phaffii* is a leading host for secreted recombinant proteins, and constraint-based media/feed design on this model is directly the kind of work cell-ag precision fermentation depends on — the Bayesian-optimization media campaign that lifted recombinant-protein productivity in *K. phaffii* in [Papers.md ref #58](../Papers.md#58) (Narayanan et al. 2025) is a worked example of that host. The SBML reconstructions are distributed as supplementary files with the two source publications; there is no dedicated code repository. Published: [`10.1371/journal.pone.0148031`](https://doi.org/10.1371/journal.pone.0148031) (iMT1026); [`10.1111/1751-7915.12871`](https://doi.org/10.1111/1751-7915.12871) (iMT1026 v3.0).

## Further reading

- Constraint-based and kinetic modeling tools: [Software.md / Metabolic Modeling & Strain Design](../Software.md#metabolic-modeling--strain-design).
- Canonical GEM repositories (BiGG Models, BioModels) and pathway / metabolome databases: [Databases.md / Pathways, Metabolism & Metabolic Models](../Databases.md#pathways-metabolism--metabolic-models).
- Microbial and host-organism growth-media references: [MediaDB](../Databases.md#mediadb) and [MediaDive](../Databases.md#mediadive) in `Databases.md`.
- Mammalian-cell reference reconstructions: [CHO](./CHOReference.md) (biopharma-adjacent) and [Human](./HumanReference.md) (cross-species template).
- Cell-ag livestock GEMs on the per-species pages: [Cow](./Cow.md), [Pig](./Pig.md), [Chicken](./Chicken.md), [Fish](./Fish.md).
- Media-optimization context: [ResearchAreas/MediaOptimization.md](../ResearchAreas/MediaOptimization.md).
