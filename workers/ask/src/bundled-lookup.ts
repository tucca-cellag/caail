/**
 * The lookup over the committed API, bundled into the Worker at deploy.
 *
 * The bundle is the corpus as of the deploy, and the index is the corpus as of
 * its last build, so the two can differ. That is harmless in both directions: a
 * name the bundle knows and the index lacks fetches nothing, and an entry the
 * index holds and the bundle does not know is still found by meaning.
 *
 * Built when the module loads, which is the Worker's startup. Startup has a limit
 * of its own, apart from a request's CPU time, so no request pays for the build:
 * not a refused one, and not the first question an instance answers.
 */
import catalog from '../../../site/public/api/catalog.json';
import papersIndex from '../../../site/public/api/papers-index.json';
import datasets from '../../../site/public/api/datasets.json';
import reports from '../../../site/public/api/reports.json';
import { buildLookup, type Lookup } from './lookup.ts';

export const bundledLookup: Lookup = buildLookup({ catalog, papersIndex, datasets, reports });
