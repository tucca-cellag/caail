/**
 * The agent API's schema stamp (tucca-cellag/caail-planning#153): what it hashes, what it
 * refuses, and how the counter moves. The stamp lifecycle runs against stamps written to a
 * scratch directory, with fixed hashes standing in for the shape, so these tests read no
 * repo state except in the last block, which checks the committed stamp itself.
 */

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RefusalError } from '../db/lib.js';
import { buildOpenApiDocument } from './openapi.js';
import {
  currentSchemaHash,
  inspectSchemaStamp,
  parseSchemaStamp,
  readStampedSchemaVersion,
  SCHEMA_STAMP_COMMAND,
  schemaHashOf,
  stampSchema,
} from './schema-stamp.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function scratchStamp(contents?: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'schema-stamp-')), 'api-schema-stamp.json');
  if (contents !== undefined) writeFileSync(path, contents, 'utf-8');
  return path;
}

describe('schemaHashOf', () => {
  it('ignores the corpus date and the schema version, which live outside paths and components', () => {
    expect(schemaHashOf(buildOpenApiDocument('2000-01-01', 1))).toBe(
      schemaHashOf(buildOpenApiDocument('2099-12-31', 42)),
    );
  });

  it('moves when a response schema gains a field, and when an endpoint is reworded', () => {
    const doc = buildOpenApiDocument('2000-01-01', 1) as any;
    const base = schemaHashOf(doc);
    const field = structuredClone(doc);
    field.components.schemas.Manifest.properties.extra = { type: 'string' };
    expect(schemaHashOf(field)).not.toBe(base);
    // Endpoint prose is part of `paths`, so it counts as shape: a consequence of hashing
    // paths whole, recorded here so it is not mistaken for a bug.
    const prose = structuredClone(doc);
    const first = Object.keys(prose.paths)[0]!;
    prose.paths[first].get.description += ' Reworded.';
    expect(schemaHashOf(prose)).not.toBe(base);
  });

  it('ignores the order of object keys but not of array items', () => {
    expect(schemaHashOf({ paths: { a: 1, b: 2 }, components: { x: { c: 1, d: 2 } } })).toBe(
      schemaHashOf({ components: { x: { d: 2, c: 1 } }, paths: { b: 2, a: 1 } }),
    );
    expect(schemaHashOf({ paths: [1, 2], components: {} })).not.toBe(schemaHashOf({ paths: [2, 1], components: {} }));
  });

  it('refuses a document with no paths or no components, rather than hashing nothing', () => {
    expect(() => schemaHashOf({ components: {} })).toThrow(/no `paths` or no `components`/);
    expect(() => schemaHashOf({ paths: {} })).toThrow(/no `paths` or no `components`/);
    expect(() => schemaHashOf(null)).toThrow(/no `paths` or no `components`/);
  });

  it('pins no envelope note in components, so rewording one cannot move the hash', () => {
    // A note typed as a literal would put its wording into the hashed shape. Every property
    // named *Note must accept any string. At least three exist, so this cannot pass empty.
    const { components } = buildOpenApiDocument('2000-01-01', 1) as any;
    const found: string[] = [];
    const walk = (node: unknown, at: string): void => {
      if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${at}[${i}]`));
      if (node === null || typeof node !== 'object') return;
      const props = (node as { properties?: Record<string, any> }).properties;
      for (const [key, schema] of Object.entries(props ?? {})) {
        if (key.endsWith('Note')) {
          found.push(`${at}.${key}`);
          expect(schema.type, `${at}.${key}`).toBe('string');
          expect(schema.const, `${at}.${key}`).toBeUndefined();
          expect(schema.enum, `${at}.${key}`).toBeUndefined();
        }
      }
      for (const [k, v] of Object.entries(node)) walk(v, `${at}.${k}`);
    };
    walk(components, 'components');
    expect(found.length).toBeGreaterThanOrEqual(3);
  });
});

describe('parseSchemaStamp', () => {
  it('accepts exactly a whole version of 1 or more and a lowercase sha256', () => {
    expect(parseSchemaStamp(JSON.stringify({ version: 3, sha256: A }))).toEqual({ stamp: { version: 3, sha256: A } });
  });

  it.each([
    ['not JSON', '{ version: 3', /not valid JSON/],
    ['an array', '[]', /not a JSON object/],
    ['an extra key', JSON.stringify({ version: 1, sha256: A, date: '2026-11-23' }), /not exactly version and sha256/],
    ['a missing key', JSON.stringify({ sha256: A }), /not exactly version and sha256/],
    ['version 0', JSON.stringify({ version: 0, sha256: A }), /version 0/],
    ['a fractional version', JSON.stringify({ version: 1.5, sha256: A }), /version 1.5/],
    ['a string version', JSON.stringify({ version: '1', sha256: A }), /version "1"/],
    ['an uppercase sha256', JSON.stringify({ version: 1, sha256: A.toUpperCase() }), /sha256/],
    ['a short sha256', JSON.stringify({ version: 1, sha256: 'abc' }), /sha256/],
  ])('refuses %s', (_label, text, problem) => {
    const parsed = parseSchemaStamp(text);
    expect('problem' in parsed && parsed.problem).toMatch(problem);
  });
});

describe('the stamp lifecycle', () => {
  it('reads the version of a stamp that matches the shape', () => {
    const path = scratchStamp(JSON.stringify({ version: 4, sha256: A }));
    expect(inspectSchemaStamp(path, A).problem).toBeNull();
    expect(readStampedSchemaVersion(path, A)).toBe(4);
  });

  it('refuses a stale stamp, naming both hashes and the command that re-stamps it', () => {
    const path = scratchStamp(JSON.stringify({ version: 4, sha256: A }));
    expect(inspectSchemaStamp(path, B).problem).toMatch(new RegExp(`${A.slice(0, 12)}.*${B.slice(0, 12)}`));
    expect(() => readStampedSchemaVersion(path, B)).toThrow(/shape changed after it was stamped/);
    expect(() => readStampedSchemaVersion(path, B)).toThrow(SCHEMA_STAMP_COMMAND);
  });

  it('refuses a missing stamp when reading', () => {
    expect(() => readStampedSchemaVersion(scratchStamp(), A)).toThrow(/does not exist/);
  });

  it('bumps the version by one on a change of shape, then leaves a matching stamp alone', () => {
    const path = scratchStamp(JSON.stringify({ version: 4, sha256: A }));
    expect(stampSchema(path, B)).toMatchObject({ changed: true, stamp: { version: 5, sha256: B } });
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({ version: 5, sha256: B });
    expect(stampSchema(path, B)).toMatchObject({ changed: false, stamp: { version: 5, sha256: B } });
  });

  it('refuses a stamp left with conflict markers, and writes nothing, since its version is unknown', () => {
    const conflicted = '<<<<<<< HEAD\n{"version": 5}\n=======\n{"version": 5}\n>>>>>>> other\n';
    const path = scratchStamp(conflicted);
    expect(() => stampSchema(path, B)).toThrow(RefusalError);
    expect(() => stampSchema(path, B)).toThrow(/version is unknown/);
    expect(readFileSync(path, 'utf-8')).toBe(conflicted);
  });

  it('refuses a missing stamp without --init, writes version 1 with it, and refuses --init over a stamp', () => {
    const path = scratchStamp();
    expect(() => stampSchema(path, A)).toThrow(/does not exist/);
    expect(existsSync(path)).toBe(false);
    expect(stampSchema(path, A, { init: true })).toMatchObject({ changed: true, stamp: { version: 1, sha256: A } });
    expect(() => stampSchema(path, B, { init: true })).toThrow(/would reset its counter/);
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({ version: 1, sha256: A });
  });
});

describe('the committed stamp', () => {
  it('matches the shape the schemas describe: a change of shape needs a deliberate re-stamp', () => {
    const found = inspectSchemaStamp();
    expect(found.problem, `${found.problem}. Run ${SCHEMA_STAMP_COMMAND}.`).toBeNull();
    expect(found.actual).toBe(currentSchemaHash());
  });
});
