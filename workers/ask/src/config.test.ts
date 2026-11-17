/**
 * The seam between the handler and its deployment config.
 *
 * Every binding is read off `env` at runtime but declared in wrangler.toml, and
 * nothing else connects the two names: `wrangler deploy --dry-run` validates the
 * config without comparing it to the code. A config-side rename is caught here; a
 * code-side one fails every handler test, because test-env.ts supplies the
 * wrangler.toml names.
 *
 * These are presence assertions on literal lines, not a TOML parse, as in the
 * events Worker's config test. Reformatting the file fails them, the safe
 * direction for a guard.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INDEX_NAME } from './settings.ts';

const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const eventsConfig = readFileSync(new URL('../../events/wrangler.toml', import.meta.url), 'utf8');

/** The body of a `[table]` or `[[array]]` block, up to the next top-level header. */
function block(source: string, header: string): string {
  const start = source.indexOf(`\n${header}\n`);
  if (start < 0) throw new Error(`wrangler.toml has no ${header} block`);
  const rest = source.slice(start + header.length + 2);
  const next = rest.search(/^\[(?!ratelimits\.simple\]|observability\.logs\])/m);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('wrangler.toml declares what the handler reads', () => {
  it.each([
    ['AI', '[ai]', /^\s*binding\s*=\s*"AI"\s*$/m],
    ['INDEX', '[[vectorize]]', /^\s*binding\s*=\s*"INDEX"\s*$/m],
    ['RECORDS', '[[analytics_engine_datasets]]', /^\s*binding\s*=\s*"RECORDS"\s*$/m],
    ['RATE_LIMITER', '[[ratelimits]]', /^\s*name\s*=\s*"RATE_LIMITER"\s*$/m],
    ['ALLOWED_ORIGIN', '[vars]', /^\s*ALLOWED_ORIGIN\s*=\s*"\S+"\s*$/m],
    ['MODEL_ID', '[vars]', /^\s*MODEL_ID\s*=\s*"@cf\/\S+"\s*$/m],
  ])('declares env.%s', (_name, header, pattern) => {
    expect(block(config, header)).toMatch(pattern);
  });

  it('binds the index the build writes to', () => {
    expect(block(config, '[[vectorize]]')).toMatch(new RegExp(`^\\s*index_name\\s*=\\s*"${INDEX_NAME}"\\s*$`, 'm'));
  });

  it('writes the question records to their own dataset, apart from the events dataset', () => {
    expect(block(config, '[[analytics_engine_datasets]]')).toMatch(/^\s*dataset\s*=\s*"caail_ask"\s*$/m);
    expect(eventsConfig).not.toMatch(/^\s*dataset\s*=\s*"caail_ask"\s*$/m);
  });
});

describe('the rate limit', () => {
  const limits = block(config, '[[ratelimits]]');
  const namespaceOf = (source: string) => block(source, '[[ratelimits]]').match(/^\s*namespace_id\s*=\s*"(\d+)"/m)?.[1];

  it('allows 10 questions per 60 seconds', () => {
    expect(limits).toMatch(/^\s*limit\s*=\s*10\s*$/m);
    expect(limits).toMatch(/^\s*period\s*=\s*60\s*$/m);
  });

  // Wrangler rejects any other period; this front-loads that failure into the suite.
  it('sets a period the platform accepts', () => {
    expect(limits).toMatch(/^\s*period\s*=\s*(10|60)\s*$/m);
  });

  // Bindings that share a namespace_id share counters, so a shared id would let
  // event posts spend the question budget and the reverse.
  it('counts in its own namespace, not the events Worker\'s', () => {
    expect(namespaceOf(config)).toMatch(/^\d+$/);
    expect(namespaceOf(config)).not.toBe(namespaceOf(eventsConfig));
  });
});

describe('what is logged', () => {
  // Invocation logs carry the request, the response and related metadata.
  it('turns invocation logs off', () => {
    expect(block(config, '[observability.logs]')).toMatch(/^\s*invocation_logs\s*=\s*false\s*$/m);
  });

  // The one line each failure writes is the only trace a failure leaves, with
  // invocation logs off, so custom logs stay on.
  it('keeps custom logs on', () => {
    expect(block(config, '[observability]')).toMatch(/^\s*enabled\s*=\s*true\s*$/m);
  });

  // An AI Gateway logs prompts and responses by default. The binding declares
  // nothing but its name; index.test.ts checks that no call passes a gateway.
  it('declares the AI binding with nothing routing it through a gateway', () => {
    const settings = block(config, '[ai]').replace(/#.*$/gm, '').trim();
    expect(settings).toBe('binding = "AI"');
  });
});
