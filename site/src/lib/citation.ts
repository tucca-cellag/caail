/**
 * Canonical CAAIL citation strings, mirrored verbatim from the repo-root
 * `CITATION.cff` / `README.md` "Citing CAAIL" section. Kept in a `.ts` module
 * (not inline in MDX) because MDX strips the leading indentation from a
 * multiline template literal passed as JSX children; importing the string as an
 * identifier preserves it exactly, so the BibTeX renders and copies with its
 * field indentation intact.
 *
 * If the canonical citation changes (new version, DOI, or author list), update
 * `CITATION.cff` first, then mirror the change here.
 */

export const CAAIL_BIBTEX = `@misc{caail2026,
  author       = {Plotts, Jim and Bromberg, Benjamin and Kaplan, David L. and {The Tufts University Center for Cellular Agriculture (TUCCA)} and {The CAAIL Contributors}},
  title        = {{CAAIL}: Cellular Agriculture {AI} Library},
  year         = {2026},
  version      = {1.0.0},
  doi          = {10.5281/zenodo.20295590},
  publisher    = {Zenodo},
  url          = {https://doi.org/10.5281/zenodo.20295590},
  note         = {Resource library, MIT licensed}
}`;
