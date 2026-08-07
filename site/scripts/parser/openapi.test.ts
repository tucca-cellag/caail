/**
 * openapi.test.ts — the machine-readable description of the agent API.
 *
 * The failure this guards is not a crash. An agent with these files available locally
 * queried topics.json for `tags` and `themes`, got undefined for both, and concluded the
 * topic data was missing; the real shape is `{ tree, index, corpusDate }` with the
 * inverted index under `index`. Nothing was broken — the shape was simply unknowable
 * without opening the file, and a remote agent cannot open it.
 *
 * So the properties that matter are: the document exists, it is discoverable from the
 * manifest, it describes every endpoint actually emitted, and the bodies really do
 * satisfy it. The last one is the point — a spec that is not checked against the
 * payloads is a second thing to keep in sync, not a guarantee.
 */

import { describe, it, expect } from 'vitest';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { buildAgentApi } from './agent-api.js';
import { PATH_PREFIX } from './openapi.js';
import { buildPapersModel } from './papers.js';
import { buildCatalogModel } from './catalog.js';
import { buildDatasetsModel } from './datasets-entries.js';
import { buildDatasetInventory } from './dataset-inventory.js';
import { buildTopicsModel } from './topics.js';
import { buildTaxonomyModel } from './taxonomy.js';

const papers = buildPapersModel();
const catalog = buildCatalogModel();
const datasets = buildDatasetsModel();
const inventory = buildDatasetInventory();
const topics = buildTopicsModel();
const taxonomy = buildTaxonomyModel();
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const API_DIR = join(REPO_ROOT, 'site', 'public', 'api');
const DATE = '2026-01-01';

const inputs = { papers, catalog, datasets, inventory, topics, taxonomy, corpusDate: DATE };

describe('openapi.json', () => {
  const files = buildAgentApi(inputs);
  const doc = files.find((f) => f.name === 'openapi.json')?.body as any;

  it('is emitted alongside the endpoints it describes', () => {
    // Generated in the same pass as the payloads, so it cannot drift from them.
    expect(doc, 'buildAgentApi emitted no openapi.json').toBeDefined();
    expect(doc.openapi).toMatch(/^3\.1\./);
    expect(doc.jsonSchemaDialect).toBe('https://json-schema.org/draft/2020-12/schema');
  });

  it('describes every endpoint that is actually emitted, and none that is not', () => {
    const emitted = files.map((f) => f.name).filter((n) => n !== 'openapi.json');
    const described = Object.keys(doc.paths).map((p: string) => p.split('/').pop());
    expect(new Set(described)).toEqual(new Set(emitted));
  });

  it('models only GET of a static file — no request bodies, auth or servers', () => {
    // Scope fence from the issue. These are files on a CDN; anything else is a slip.
    expect(doc.servers).toBeUndefined();
    expect(doc.security).toBeUndefined();
    expect(doc.components.securitySchemes).toBeUndefined();
    for (const item of Object.values(doc.paths) as any[]) {
      expect(Object.keys(item)).toEqual(['get']);
      expect(item.get.requestBody).toBeUndefined();
      expect(item.get.parameters).toBeUndefined();
      expect(Object.keys(item.get.responses)).toEqual(['200']);
    }
  });

  it('names the topic keys that were guessed wrong, and rules out the guess', () => {
    // The literal incident: `themes` and `tags` at the top level of topics.json.
    const schemaRef = (doc.paths['/caail/api/topics.json'].get.responses['200'].content[
      'application/json'
    ].schema.$ref as string).split('/').pop()!;
    const topicsSchema = doc.components.schemas[schemaRef];
    expect(Object.keys(topicsSchema.properties).sort()).toEqual(['corpusDate', 'index', 'tree']);
    // additionalProperties: false is what turns "not documented" into "not there", so an
    // agent can rule the guess out rather than conclude the data is missing.
    expect(topicsSchema.additionalProperties).toBe(false);
    // and it says where they actually are, which is the half that makes it actionable
    expect(Object.keys(topicsSchema.properties.tree.properties).sort()).toEqual(['tags', 'themes']);
  });

  it('keeps its path prefix in step with Astro base, which owns that segment', () => {
    // PATH_PREFIX duplicates `/caail` rather than importing astro.config (which would drag
    // the plugin graph into the parser for one string). This is the guard that makes the
    // duplication safe: change `base` and the suite fails instead of the spec silently
    // describing paths that 404 on the deployed site.
    const cfg = readFileSync(join(REPO_ROOT, 'site', 'astro.config.mjs'), 'utf-8');
    const base = /^\s*base:\s*['"]([^'"]+)['"]/m.exec(cfg)?.[1];
    expect(base, 'could not read `base` from astro.config.mjs').toBeTruthy();
    expect(PATH_PREFIX).toBe(`${base}/api/`);
    for (const p of Object.keys(doc.paths)) expect(p.startsWith(PATH_PREFIX)).toBe(true);
  });

  it('does not invite a consumer to join these paths onto the raw mirror', () => {
    // The mirror is the DEFAULT route for the primary consumer (SKILL.md sends agents at
    // the raw URLs), and with no `servers` block these paths only resolve on the Pages
    // origin. Advertising the mirror without saying so produced a 404 by construction.
    const d = doc.info.description as string;
    expect(d).toMatch(/raw\.githubusercontent\.com/);
    expect(d).toMatch(/by filename/i);
    expect(d).toMatch(/tucca-cellag\.github\.io/);
  });

  it('is discoverable from the manifest without opening a file to guess', () => {
    const manifest = files.find((f) => f.name === 'index.json')!.body as any;
    expect(manifest.openapi).toBe('openapi.json');
    expect(manifest.endpoints.map((e: any) => e.path)).toContain('openapi.json');
  });
});

describe('emitted payloads are validated against their own schema', () => {
  it('rejects a body that does not match, rather than writing it', () => {
    // The other half of the issue: agent-api.ts spread already-built models straight to
    // disk. A model that changed shape would have shipped, and the spec would have been
    // a claim about the payload rather than a property of it.
    expect(() =>
      buildAgentApi({ ...inputs, catalog: { software: 'not an array', databases: [] } }),
    ).toThrow(/catalog\.json/i);
  });

  it('rejects an EXTRA key too, since the schema forbids additional properties', () => {
    // zod's default parse silently STRIPS unknown keys, which would let a payload ship
    // carrying a field its own advertised schema declares invalid.
    expect(() =>
      buildAgentApi({ ...inputs, taxonomy: { ...taxonomy, surprise: 1 } }),
    ).toThrow(/taxonomy\.json/i);
  });

  it('rejects an extra key NESTED INSIDE AN ARRAY ITEM, not just at the payload root', () => {
    // Found by a cross-model review, and the reason the check is ajv-against-the-emitted-
    // schema rather than zod: `.strict()` does NOT cascade into nested schemas, so with a
    // root-only check `catalog.software[0].sneaky` validated cleanly and was written to
    // disk — into a file whose own published schema says additionalProperties: false.
    //
    // The previous version of the test above injected only at the root, which is exactly
    // the case that already worked. A test that exercises the passing case and calls it
    // coverage is worse than no test, because it reads as a guarantee.
    const poisoned = {
      ...catalog,
      software: catalog.software.map((e, i) => (i === 0 ? { ...e, sneaky: true } : e)),
    };
    expect(() => buildAgentApi({ ...inputs, catalog: poisoned })).toThrow(/catalog\.json/i);
    // and it names the offending property, so the failure is actionable
    expect(() => buildAgentApi({ ...inputs, catalog: poisoned })).toThrow(/sneaky/);
  });

  it('rejects a bad value deep inside a nested array item', () => {
    // Same class, different shape: a wrong TYPE rather than an extra key, two levels down.
    const poisoned = {
      ...datasets,
      entries: datasets.entries.map((e, i) => (i === 0 ? { ...e, topics: 'not-an-array' } : e)),
    };
    expect(() => buildAgentApi({ ...inputs, datasets: poisoned })).toThrow(/datasets\.json/i);
  });
});

describe('the shipped openapi.json', () => {
  it('exists on disk where the manifest points', () => {
    expect(existsSync(join(API_DIR, 'openapi.json'))).toBe(true);
  });

  it('validates the files actually sitting next to it, per a real 2020-12 validator', () => {
    // Two independent things are being checked here, and only the second is new.
    //
    // The build already validates each body with zod (assertValid). But that checks the
    // payload against the SOURCE schema, whereas a consumer checks it against the
    // PUBLISHED one, and `z.toJSONSchema` sits between the two. Running ajv closes that
    // gap: it is the same act a consumer performs, so an infidelity in the translation
    // fails here rather than in someone else's codegen.
    //
    // And it reads the committed artifacts rather than the freshly built models, since
    // those two can disagree — which is what the CI sync guard exists to catch.
    const doc = JSON.parse(readFileSync(join(API_DIR, 'openapi.json'), 'utf-8'));
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    // Register the whole document under an id so `caail#/components/schemas/X` resolves
    // by JSON pointer exactly the way an OpenAPI consumer resolves it.
    ajv.addSchema({ $id: 'caail', components: doc.components });

    for (const [path, item] of Object.entries(doc.paths) as [string, any][]) {
      const name = path.split('/').pop()!;
      const ref = item.get.responses['200'].content['application/json'].schema.$ref as string;
      const validate = ajv.compile({ $ref: `caail${ref}` });
      const body = JSON.parse(readFileSync(join(API_DIR, name), 'utf-8'));
      expect(
        validate(body) || JSON.stringify(validate.errors?.slice(0, 5), null, 2),
        `${name} does not satisfy ${ref}`,
      ).toBe(true);
    }
  });
});

describe('llms.txt', () => {
  it('points an agent at the schema before it starts guessing shapes', () => {
    const txt = readFileSync(join(REPO_ROOT, 'site', 'public', 'llms.txt'), 'utf-8');
    expect(txt).toMatch(/openapi\.json/);
  });
});
