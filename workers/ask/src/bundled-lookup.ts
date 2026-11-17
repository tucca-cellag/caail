/**
 * The lookup over the committed API, bundled into the Worker at deploy.
 *
 * The bundle is the corpus as of the deploy, and the index is the corpus as of
 * its last build, so the two can differ. That is harmless in both directions: a
 * name the bundle knows and the index lacks fetches nothing, and an entry the
 * index holds and the bundle does not know is still found by meaning.
 *
 * Built on first use rather than at load, so a GET or a refused request never
 * pays for it.
 */
import catalog from '../../../site/public/api/catalog.json';
import papersIndex from '../../../site/public/api/papers-index.json';
import datasets from '../../../site/public/api/datasets.json';
import reports from '../../../site/public/api/reports.json';
import { buildLookup, type Lookup } from './lookup.ts';

let built: Lookup | undefined;

export function bundledLookup(): Lookup {
  built ??= buildLookup({ catalog, papersIndex, datasets, reports });
  return built;
}
