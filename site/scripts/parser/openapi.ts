/**
 * openapi.ts — describe the agent API with a document generated from the zod schemas,
 * and check every emitted payload against its own schema before it is written.
 *
 * The failure this addresses is not a crash. An agent with these files available locally
 * queried topics.json for `tags` and `themes`, got undefined for both, and concluded the
 * topic data was missing; the real shape is `{ tree, index, corpusDate }`. Nothing was
 * broken — the shape was unknowable without opening the file, and a remote consumer
 * cannot open it. A published schema turns "not documented" into "not there".
 *
 * GENERATED, never hand-written. A hand-written spec drifts from the payloads within a
 * release or two; this one is produced in the same pass that writes them, from the same
 * schemas, and `assertValid` then proves the payloads satisfy it. So the document is a
 * property of the output rather than a claim about it.
 *
 * SCOPE: seven static files served by GET. No request bodies, no parameters, no auth,
 * and deliberately no `servers` block — the paths are the deployed absolute paths, which
 * resolve correctly against the Pages origin without one.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { z } from 'zod';

import {
  ApiCatalogSchema,
  ApiDatasetsSchema,
  ApiManifestSchema,
  ApiMatrixCellSchema,
  ApiMatrixSchema,
  ApiPapersSchema,
  ApiTaxonomySchema,
  ApiTopicIndexEntrySchema,
  ApiTopicsSchema,
  AreaSchema,
  CatalogEntrySchema,
  CellSchema,
  DatasetEntrySchema,
  DatasetInventoryRowSchema,
  ReferenceSchema,
  TopicNodeSchema,
  TopicRefSchema,
} from './types.js';

/** The emitted document's own filename, and the value `index.json` points at. */
export const OPENAPI_FILE = 'openapi.json';

/**
 * Where the files sit on the deployed site. With no `servers` block the OpenAPI default
 * base is `/`, so these resolve against whatever origin the document was fetched from —
 * which is exactly right for https://tucca-cellag.github.io/caail/api/.
 */
const PATH_PREFIX = '/caail/api/';

/** The dialect OpenAPI 3.1 uses, and the one `z.toJSONSchema` emits. */
export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/**
 * One endpoint: the file, the schema its body must satisfy, and the prose an agent reads
 * to decide whether to fetch it. `id` names the schema under `components.schemas`.
 */
export interface ApiEndpointSpec {
  file: string;
  id: string;
  schema: z.ZodType;
  summary: string;
  description: string;
}

/**
 * Every endpoint, in manifest order. This is the single list: `assertValid` validates
 * against it and `buildOpenApiDocument` describes it, so an endpoint cannot be emitted
 * without a schema or described without being emitted (both are asserted in tests).
 */
export const API_ENDPOINTS: readonly ApiEndpointSpec[] = [
  {
    file: 'index.json',
    id: 'Manifest',
    schema: ApiManifestSchema,
    summary: 'Corpus manifest',
    description:
      'Read first. Corpus date, the endpoint list, a pointer to this document, and counts ' +
      'labelled with the population each one counted.',
  },
  {
    file: 'matrix.json',
    id: 'Matrix',
    schema: ApiMatrixSchema,
    summary: 'The complete AI-method × research-area grid',
    description:
      'All method×area cells, INCLUDING those with no indexed paper. papers.json carries ' +
      'only the populated ones, so this is the only endpoint that distinguishes "no paper ' +
      'here" from "I did not find one". Every empty cell carries its own scope caveat: ' +
      'absence in this corpus is not absence in the literature.',
  },
  {
    file: 'papers.json',
    id: 'Papers',
    schema: ApiPapersSchema,
    summary: 'Every reference',
    description:
      'DOI, code URL, data URL, topics, license and citation count per reference. Spans ' +
      'six sections; only References is matrix-eligible, so say which population you counted.',
  },
  {
    file: 'catalog.json',
    id: 'Catalog',
    schema: ApiCatalogSchema,
    summary: 'Software and databases',
    description: 'Open-source tools and query/lookup resources, with topic, license tier and DOI.',
  },
  {
    file: 'datasets.json',
    id: 'Datasets',
    schema: ApiDatasetsSchema,
    summary: 'Curated dataset entries and per-species inventory',
    description:
      'Two arrays. `entries` are the curated portals, atlases and GEMs. `inventory` are the ' +
      'per-study deposits — accession, assay type, tissue, size — keyed by the source page\'s ' +
      'own column labels, since the tables differ per page. Filter either by `page`. Use ' +
      '`inventory` for "what could I combine my own run with".',
  },
  {
    file: 'topics.json',
    id: 'Topics',
    schema: ApiTopicsSchema,
    summary: 'Subject tree and inverted index',
    description:
      'The theme→tag tree is under `tree`; the inverted index (topic slug → item ids across ' +
      'papers, software, databases and datasets) is under `index`. There is no top-level ' +
      '`themes` or `tags`. Start here for "what should I use for X".',
  },
  {
    file: 'taxonomy.json',
    id: 'Taxonomy',
    schema: ApiTaxonomySchema,
    summary: 'What each method and area means in CAAIL',
    description:
      "CAAIL's own definition of every matrix row and column, with exclusion criteria. Read " +
      'before trusting or disputing a placement.',
  },
];

/**
 * Compiled validators for the PUBLISHED schemas, one per endpoint, built once.
 *
 * Validating with ajv against the emitted JSON Schema rather than with `schema.parse()`
 * is the whole point, and it was not the original design. Zod's `.strict()` does NOT
 * cascade: with a root-only strict check, an unknown key nested inside an array item
 * (`catalog.software[0].sneaky`) validated cleanly and was written to disk, into a file
 * whose own published schema says `additionalProperties: false`. A cross-model review
 * caught it; the test above now covers it.
 *
 * `z.toJSONSchema` already emits `additionalProperties: false` at EVERY level — for plain
 * `z.object` as much as for `z.strictObject` — so checking the generated document closes
 * the gap by construction, at any nesting depth, and cannot rot when someone adds a new
 * nested type. It is also the more faithful check: this is the schema a consumer holds.
 */
let compiled: Map<string, ValidateFunction> | null = null;

function apiValidators(): Map<string, ValidateFunction> {
  if (compiled) return compiled;
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  // Register the components block under an id so `caail#/components/schemas/X` resolves
  // by JSON pointer exactly the way an OpenAPI consumer resolves it.
  ajv.addSchema({ $id: 'caail', components: { schemas: componentSchemas() } });
  compiled = new Map(
    API_ENDPOINTS.map((e) => [
      e.file,
      ajv.compile({ $ref: `caail#/components/schemas/${e.id}` }),
    ]),
  );
  return compiled;
}

/**
 * Validate one emitted body against its endpoint's schema.
 *
 * Called before the files are written, so a model that changed shape fails the build
 * instead of shipping. The error names the file, because a bare instance path is not
 * enough to find which of seven payloads went wrong.
 *
 * BOTH checks run, and they catch different things. Zod is the source schema and can
 * express constraints JSON Schema cannot round-trip, so it runs first for its clearer
 * message; ajv then checks the payload against the document consumers actually receive,
 * which is what closes the nested-object gap above. Neither subsumes the other.
 *
 * `openapi.json` itself is exempt: it is the description, not a described response, and
 * schema-ing it would just be re-implementing the OpenAPI meta-schema.
 */
export function assertValid(file: string, body: unknown): void {
  const spec = API_ENDPOINTS.find((e) => e.file === file);
  if (!spec) return;

  const fail = (issues: string[], total: number): never => {
    throw new Error(
      `agent-api: ${file} does not match its published schema ` +
        `(components.schemas.${spec.id}), so it was not written:\n` +
        issues.slice(0, 5).join('\n') +
        (total > 5 ? `\n  …and ${total - 5} more` : ''),
    );
  };

  const zod = spec.schema.safeParse(body);
  if (!zod.success) {
    fail(
      zod.error.issues.map((i) => `  ${i.path.join('.') || '<root>'}: ${i.message}`),
      zod.error.issues.length,
    );
  }

  const validate = apiValidators().get(file)!;
  if (!validate(body)) {
    const errs = validate.errors ?? [];
    fail(
      errs.map((e) => {
        const extra = (e.params as { additionalProperty?: string } | undefined)
          ?.additionalProperty;
        return `  ${e.instancePath || '<root>'}: ${e.message}${extra ? ` — "${extra}"` : ''}`;
      }),
      errs.length,
    );
  }
}

/**
 * Sub-shapes that recur across endpoints, named so they become one `$ref`-ed definition
 * rather than being inlined at every use site (TopicRef alone appears in four).
 *
 * Registering is what hoists a schema: `z.toJSONSchema` inlines anything not in the
 * registry. Naming them also makes the document legible to the reader it exists for,
 * since "a Reference" is a thing an agent can hold onto and an anonymous 24-property
 * object repeated three times is not.
 */
const SHARED_SCHEMAS: ReadonlyArray<readonly [string, z.ZodType]> = [
  ['TopicRef', TopicRefSchema],
  ['TopicNode', TopicNodeSchema],
  ['TopicIndexEntry', ApiTopicIndexEntrySchema],
  ['Area', AreaSchema],
  ['MatrixCell', ApiMatrixCellSchema],
  ['Cell', CellSchema],
  ['Reference', ReferenceSchema],
  ['CatalogEntry', CatalogEntrySchema],
  ['DatasetEntry', DatasetEntrySchema],
  ['DatasetInventoryRow', DatasetInventoryRowSchema],
];

/**
 * Lift the zod schemas into `components.schemas` via a registry.
 *
 * `io: 'output'` is what makes this describe the FILE rather than the constructor input:
 * a field with a `.default()` is optional going in but always present coming out, and
 * describing it as optional would tell an agent to handle an absence that cannot occur.
 */
function componentSchemas(): Record<string, unknown> {
  const registry = z.registry<{ id: string }>();
  for (const e of API_ENDPOINTS) registry.add(e.schema, { id: e.id });
  for (const [id, schema] of SHARED_SCHEMAS) registry.add(schema, { id });

  const { schemas } = z.toJSONSchema(registry, {
    uri: (id) => `#/components/schemas/${id}`,
    io: 'output',
  }) as { schemas: Record<string, Record<string, unknown>> };

  // The dialect is declared once at the document root (`jsonSchemaDialect`), and `$id`
  // restates the key it is already filed under. Both are noise inside components.
  const out: Record<string, unknown> = {};
  for (const [id, schema] of Object.entries(schemas)) {
    const { $schema: _schema, $id: _id, ...rest } = schema;
    out[id] = rest;
  }
  return out;
}

/**
 * Build the OpenAPI 3.1 document.
 *
 * `info.version` carries the corpus date rather than a release number: these are data
 * endpoints, and "which corpus is this" is the only version question a consumer has.
 */
export function buildOpenApiDocument(corpusDate: string): unknown {
  const paths: Record<string, unknown> = {};
  for (const e of API_ENDPOINTS) {
    paths[`${PATH_PREFIX}${e.file}`] = {
      get: {
        operationId: `get${e.id}`,
        summary: e.summary,
        description: e.description,
        responses: {
          '200': {
            description: e.summary,
            content: {
              'application/json': { schema: { $ref: `#/components/schemas/${e.id}` } },
            },
          },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    jsonSchemaDialect: JSON_SCHEMA_DIALECT,
    info: {
      title: 'CAAIL agent API',
      version: corpusDate,
      summary: 'Static JSON endpoints describing the Cellular Agriculture AI Library.',
      description:
        'Seven static JSON files, served by GET, with nothing to install or authenticate. ' +
        'Generated from the same schemas that validate the payloads, in the same build step ' +
        'that writes them. The same files are also fetchable from ' +
        'https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/, which ' +
        'some clients can reach when GitHub Pages is not allow-listed.',
      license: {
        name: 'MIT (CAAIL curation). Linked third-party resources keep their own licenses.',
        identifier: 'MIT',
      },
    },
    // `x-` extension rather than a bare key: an unknown non-extension field at the root
    // makes the document invalid against the OpenAPI 3.1 schema.
    'x-corpus-date': corpusDate,
    paths,
    components: { schemas: componentSchemas() },
  };
}
