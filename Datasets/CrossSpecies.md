# Cross-species reference substrate

Cellular agriculture programs share a layer of engineering substrate that spans species — recombinant growth factors, media-component reference data, screening assays, and related resources whose utility is not tied to a single cultivated-meat species. This page collects the fixed data artifacts in that cross-species layer: entries here apply across livestock, poultry, and aquaculture programs simultaneously, rather than fitting any one per-species page.

The page sits beside [`HumanReference.md`](./HumanReference.md) and [`CHOReference.md`](./CHOReference.md), which together hold cross-species reference *biology* — single-cell pretraining corpora and the human and CHO genome-scale metabolic models from which livestock GEMs inherit network structure. `CrossSpecies.md` complements those reference-biology pages with cross-species engineering *substrate* — protein-engineering and media-optimization data that cultivated-meat programs reuse across species.

## Protein engineering & growth factor reference

### [Growth factor thermostability dataset](https://zenodo.org/records/19339684)

The Ng et al. 2026 Zenodo deposit (DOI [`10.5281/zenodo.19339684`](https://doi.org/10.5281/zenodo.19339684), CC-BY-4.0) is a 513-value catalogue of melting-temperature measurements across growth factors and variants commonly used in cultured meat and seafood production. The dataset combines experimentally measured thermal-shift values with computationally predicted thermostability data; the literature-review component was assembled via a two-stage LLM-assisted workflow (DeepSeek first-pass extraction, then GPT-4.1 refinement after a manual-check step, per the companion repo's README) and is paired with novel thermal-shift measurements. A 15-growth-factor subset additionally carries in silico thermodynamic parameters derived from FoldX. Distributed as a single `Growth_Factor_Thermostability.xlsx` (93.2 kB). The Zenodo record's description frames the dataset as broadly applicable to "cultured meat and seafood production" and does not summarize species coverage at the record level — the spreadsheet itself carries a per-row Species Origin column. Companion data for the [`amii-cell-ag-tools / protein-thermostability-data-tools`](https://github.com/Amii-Applied-AI/amii-cell-ag-tools/tree/main/protein-thermostability-data-tools) module — see [`Software.md` / amii-cell-ag-tools](../Software.md#amii-cell-ag-tools).

## Cell culture media component characterization

### [NMR metabolomics of plant and yeast-based hydrolysates](https://doi.org/10.1016/j.crfs.2024.100855)

The Combe et al. 2024 *Current Research in Food Science* paper is a comprehensive NMR-metabolomics characterization of plant- and yeast-based hydrolysates intended as serum-free media components for cultivated meat. Hydrolysates are one of the dominant valorized-substrate strategies for replacing the 55–95% media-cost component that fetal bovine serum currently fills, but their composition varies sharply by source, and that variability is precisely what NMR-based metabolite profiling can resolve. Catalogued here on `CrossSpecies.md` because hydrolysate selection is a media-substrate question that any cultivated-meat program — bovine, porcine, avian, aquaculture — addresses, and the per-source NMR profiles in this work are reusable across species.

## Complete data inventory

| Resource | Year | Format | Scope | DOI / URL | License |
|---|---|---|---|---|---|
| Growth factor thermostability dataset (Ng et al.) | 2026 | XLSX (single file, 93.2 kB) | 513 melting-temperature values across growth factors and variants used in cultured meat/seafood; 15-protein FoldX in silico subset | [10.5281/zenodo.19339684](https://doi.org/10.5281/zenodo.19339684) | CC-BY-4.0 |
| NMR metabolomics of plant and yeast-based hydrolysates (Combe et al.) | 2024 | NMR metabolite profiles | Comprehensive assessment of plant- and yeast-based hydrolysates intended as serum-free media components for cultivated meat; see paper's data availability statement for accession | [10.1016/j.crfs.2024.100855](https://doi.org/10.1016/j.crfs.2024.100855) | CC-BY (per *Current Research in Food Science* open-access default) |

> **Curation source:** Surfaced via the [caail Zotero group library](https://www.zotero.org/groups/6549203/caail/library) during the project's Zotero-to-CAAIL sync (May 2026 pass).

## Further reading

- [`HumanReference.md`](./HumanReference.md) and [`CHOReference.md`](./CHOReference.md) for cross-species reference biology — single-cell pretraining corpora, human GEMs, and the CHO biopharma substrate that pair with the cross-species engineering substrate catalogued here.
- [`Software.md`](../Software.md) for applied AI research code that uses these artifacts, including [amii-cell-ag-tools](../Software.md#amii-cell-ag-tools) (whose `protein-thermostability-data-tools` module produced the Ng et al. dataset).
- The per-species pages — [`Cow.md`](./Cow.md), [`Pig.md`](./Pig.md), [`Chicken.md`](./Chicken.md), [`Fish.md`](./Fish.md), and the others in this directory — for species-scoped deposits that complement the cross-species substrate here.
