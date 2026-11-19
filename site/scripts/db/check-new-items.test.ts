/**
 * check-new-items.test.ts: the CI guard that refuses a pull request adding a new item to the
 * NDJSON, however it got there, while new items are paused until CAAIL v2.
 *
 * Two layers, each in both directions. The decision (`newItemProblems`) is tested on id sets:
 * an added id or Data on request study is refused, while an edit, a removal, a new topic tag
 * and a split naming a held item pass. The git layer (`checkNewItems`) is tested against a
 * throwaway repository with real base and head commits, so the trailer and the file reads are
 * exercised as CI runs them, and nothing here touches this repository.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  catalogKeys,
  checkNewItems,
  newItemProblems,
  refusalMessage,
  REMINT_TRAILER,
  SPLIT_TRAILER,
  type Trailers,
} from './check-new-items.js';
import { NEW_ITEMS_PAUSED } from './add-item.js';
import { REPO_ROOT } from './lib.js';

// An item's type defaults from its id prefix; a [id, type] pair sets it, so a test can give an
// id whose prefix and type disagree, which schema.sql allows (db:check refuses it later in the
// same CI job) and which the guard must read right on its own.
type Entry = string | [id: string, type: string];
const defaultType = (id: string) => (id.startsWith('topic:') ? 'topic' : id.startsWith('paper:') ? 'paper' : 'software');
const item = (entry: Entry) => {
  const [id, type] = typeof entry === 'string' ? [entry, defaultType(entry)] : entry;
  return JSON.stringify({ id, type, slug: id.split(':')[1] });
};
const study = (doi: string) => JSON.stringify({ doi, page: 'Cow', study: 'A study', statement: 'On request.', ordinal: 0 });
const keys = (ids: Entry[], dois: string[] = []) => catalogKeys(ids.map(item).join('\n') + '\n', dois.map(study).join('\n') + '\n');

const BASE = keys(['sw:held', 'db:held', 'topic:held'], ['10.1/held']);
const splits = (...values: string[]): Trailers => ({ splits: values, remints: [] });
const remints = (...values: string[]): Trailers => ({ splits: [], remints: values });
const NONE = splits();

describe('newItemProblems: what a pull request may change while new items are paused', () => {
  it('refuses a new item id and names it', () => {
    const problems = newItemProblems(BASE, keys(['sw:held', 'db:held', 'topic:held', 'sw:new-tool'], ['10.1/held']), NONE);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('sw:new-tool');
  });

  it('refuses a new paper, database, dataset and field report alike', () => {
    const added = ['paper:999', 'db:new', 'ds:new', 'report:new'];
    const problems = newItemProblems(BASE, keys(['sw:held', 'db:held', 'topic:held', ...added], ['10.1/held']), NONE);
    for (const id of added) expect(problems.some((p) => p.includes(id)), id).toBe(true);
  });

  it('refuses a new Data on request study and names its DOI', () => {
    const problems = newItemProblems(BASE, keys(['sw:held', 'db:held', 'topic:held'], ['10.1/held', '10.2/new']), NONE);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('10.2/new');
  });

  it('passes an edit, which changes no id', () => {
    expect(newItemProblems(BASE, keys(['sw:held', 'db:held', 'topic:held'], ['10.1/held']), NONE)).toEqual([]);
  });

  it('passes a removal', () => {
    expect(newItemProblems(BASE, keys(['sw:held', 'topic:held'], []), NONE)).toEqual([]);
  });

  it('passes a new topic tag, which is a subject label rather than a catalog entry', () => {
    expect(newItemProblems(BASE, keys(['sw:held', 'db:held', 'topic:held', 'topic:new-tag'], ['10.1/held']), NONE)).toEqual([]);
  });

  it('passes a split that names a held item on the base', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held', 'sw:held-part'], ['10.1/held']);
    expect(newItemProblems(BASE, head, splits('sw:held-part from sw:held'))).toEqual([]);
  });

  it('refuses a split whose named item is not on the base', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held', 'sw:held-part'], ['10.1/held']);
    const problems = newItemProblems(BASE, head, splits('sw:held-part from sw:never-held'));
    expect(problems.some((p) => p.includes('sw:never-held') && /not on the base/.test(p))).toBe(true);
    expect(problems.some((p) => p.includes('sw:held-part'))).toBe(true);
  });

  it('refuses a malformed split trailer', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held', 'sw:held-part'], ['10.1/held']);
    const problems = newItemProblems(BASE, head, splits('sw:held-part sw:held'));
    expect(problems.some((p) => p.includes('sw:held-part sw:held') && /<new id> from <held id>/.test(p))).toBe(true);
  });

  it('lets a split cover only the id it names', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held', 'sw:held-part', 'sw:other'], ['10.1/held']);
    const problems = newItemProblems(BASE, head, splits('sw:held-part from sw:held'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('sw:other');
  });

  it('refuses a split whose held item is gone at the head, since a split keeps the item it splits', () => {
    const head = keys(['db:held', 'topic:held', 'sw:held-part'], ['10.1/held']);
    const problems = newItemProblems(BASE, head, splits('sw:held-part from sw:held'));
    expect(problems.some((p) => p.startsWith(`${SPLIT_TRAILER}:`) && /sw:held is gone/.test(p) && p.includes(REMINT_TRAILER))).toBe(true);
    expect(problems).toContain('sw:held-part is a new item');
  });

  it('passes a re-mint whose old id is on the base and gone at the head', () => {
    const head = keys(['db:held', 'topic:held', 'sw:held-renamed'], ['10.1/held']);
    expect(newItemProblems(BASE, head, remints('sw:held-renamed from sw:held'))).toEqual([]);
  });

  it('refuses a re-mint whose old id is still at the head, since a re-mint replaces it', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held', 'sw:held-renamed'], ['10.1/held']);
    const problems = newItemProblems(BASE, head, remints('sw:held-renamed from sw:held'));
    expect(problems.some((p) => p.startsWith(`${REMINT_TRAILER}:`) && /sw:held is still here/.test(p) && p.includes(SPLIT_TRAILER))).toBe(true);
    expect(problems).toContain('sw:held-renamed is a new item');
  });

  it('refuses a re-mint whose old id is not on the base', () => {
    const head = keys(['db:held', 'topic:held', 'sw:held-renamed'], ['10.1/held']);
    const problems = newItemProblems(BASE, head, remints('sw:held-renamed from sw:never-held'));
    expect(problems.some((p) => p.startsWith(`${REMINT_TRAILER}:`) && /sw:never-held is not on the base/.test(p))).toBe(true);
    expect(problems).toContain('sw:held-renamed is a new item');
  });

  it('refuses a malformed re-mint trailer', () => {
    const head = keys(['db:held', 'topic:held', 'sw:held-renamed'], ['10.1/held']);
    const problems = newItemProblems(BASE, head, remints('sw:held-renamed'));
    expect(problems.some((p) => p.startsWith(`${REMINT_TRAILER}: sw:held-renamed:`) && /<new id> from <old id>/.test(p))).toBe(true);
    expect(problems).toContain('sw:held-renamed is a new item');
  });

  it('lets each held item be named once, so one trailer target cannot let many new ids through', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held', 'sw:held-part', 'db:another'], ['10.1/held']);
    const problems = newItemProblems(BASE, head, splits('sw:held-part from sw:held', 'db:another from sw:held'));
    expect(problems.some((p) => p.startsWith(`${SPLIT_TRAILER}: db:another from sw:held:`) && /more than one trailer/.test(p))).toBe(true);
    expect(problems).toContain('db:another is a new item');
    expect(problems).not.toContain('sw:held-part is a new item');
  });

  it('refuses a re-mint to or from a paper id, since a paper id is retired rather than re-minted', () => {
    const base = keys(['paper:5', 'sw:held', 'topic:held']);
    const fromPaper = newItemProblems(base, keys(['paper:349', 'sw:held', 'topic:held']), remints('paper:349 from paper:5'));
    expect(fromPaper.some((p) => p.startsWith(`${REMINT_TRAILER}: paper:349 from paper:5:`) && /paper id/.test(p))).toBe(true);
    expect(fromPaper).toContain('paper:349 is a new item');
    const toPaper = newItemProblems(base, keys(['paper:5', 'paper:349', 'topic:held']), remints('paper:349 from sw:held'));
    expect(toPaper.some((p) => p.startsWith(`${REMINT_TRAILER}: paper:349 from sw:held:`) && /paper id/.test(p))).toBe(true);
    expect(toPaper).toContain('paper:349 is a new item');
  });

  it('refuses a split that mints a paper id, since every new paper is a new reference', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held', 'paper:400'], ['10.1/held']);
    const problems = newItemProblems(BASE, head, splits('paper:400 from sw:held'));
    expect(problems.some((p) => p.startsWith(`${SPLIT_TRAILER}: paper:400 from sw:held:`) && /paper id/.test(p))).toBe(true);
    expect(problems).toContain('paper:400 is a new item');
  });

  it('exempts a topic by its type, not its id prefix', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held', ['topic:newtool', 'software']], ['10.1/held']);
    expect(newItemProblems(BASE, head, NONE)).toContain('topic:newtool is a new item');
  });

  it('reads a paper by its type, so a split cannot mint one under another prefix', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held', ['sw:fake', 'paper']], ['10.1/held']);
    const problems = newItemProblems(BASE, head, splits('sw:fake from sw:held'));
    expect(problems.some((p) => p.startsWith(`${SPLIT_TRAILER}: sw:fake from sw:held:`) && /paper id/.test(p))).toBe(true);
    expect(problems).toContain('sw:fake is a new item');
  });

  it('reads a held topic by its type, so a trailer cannot name one under another prefix', () => {
    const base = keys(['sw:held', ['db:tagish', 'topic']]);
    const problems = newItemProblems(base, keys(['sw:held', ['db:tagish', 'topic'], 'sw:new']), splits('sw:new from db:tagish'));
    expect(problems.some((p) => p.startsWith(`${SPLIT_TRAILER}: sw:new from db:tagish:`) && /topic tag/.test(p))).toBe(true);
  });

  it('refuses a re-mint whose new and old keys are different kinds, saying so', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held', 'sw:new'], []);
    const problems = newItemProblems(BASE, head, remints('sw:new from 10.1/held'));
    expect(problems.some((p) => p.startsWith(`${REMINT_TRAILER}: sw:new from 10.1/held:`) && /same kind/.test(p))).toBe(true);
  });

  it('refuses a split of a paper, since a paper id is never split', () => {
    const base = keys(['paper:12', 'sw:held', 'topic:held']);
    const problems = newItemProblems(base, keys(['paper:12', 'sw:held', 'topic:held', 'db:new']), splits('db:new from paper:12'));
    expect(problems.some((p) => p.startsWith(`${SPLIT_TRAILER}: db:new from paper:12:`) && /paper id/.test(p))).toBe(true);
    expect(problems).toContain('db:new is a new item');
  });

  it('tells a split naming a Data on request DOI that a corrected DOI is a re-mint, not that it is missing', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held'], ['10.1/held', '10.2/new']);
    const problems = newItemProblems(BASE, head, splits('10.2/new from 10.1/held'));
    const line = problems.find((p) => p.startsWith(`${SPLIT_TRAILER}: 10.2/new from 10.1/held:`));
    expect(line).toBeDefined();
    expect(line).toContain(`"${REMINT_TRAILER}:"`);
    expect(line).not.toMatch(/not on the base/);
  });

  it('refuses a topic tag as the held item, since a topic is not a catalog entry', () => {
    const splitHead = keys(['sw:held', 'db:held', 'topic:held', 'sw:new'], ['10.1/held']);
    const split = newItemProblems(BASE, splitHead, splits('sw:new from topic:held'));
    expect(split.some((p) => p.startsWith(`${SPLIT_TRAILER}: sw:new from topic:held:`) && /topic tag/.test(p))).toBe(true);
    expect(split).toContain('sw:new is a new item');
    const remintHead = keys(['sw:held', 'db:held', 'sw:new'], ['10.1/held']);
    const remint = newItemProblems(BASE, remintHead, remints('sw:new from topic:held'));
    expect(remint.some((p) => p.startsWith(`${REMINT_TRAILER}: sw:new from topic:held:`) && /topic tag/.test(p))).toBe(true);
    expect(remint).toContain('sw:new is a new item');
  });

  it('counts a trailer repeated word for word (a cherry-picked commit) once', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held', 'sw:held-part'], ['10.1/held']);
    expect(newItemProblems(BASE, head, splits('sw:held-part from sw:held', 'sw:held-part from sw:held'))).toEqual([]);
  });

  it('passes a re-mint that corrects a Data on request study\'s DOI', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held'], ['10.1/held-corrected']);
    expect(newItemProblems(BASE, head, remints('10.1/held-corrected from 10.1/held'))).toEqual([]);
  });

  it('refuses a DOI re-mint whose old DOI is still listed', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held'], ['10.1/held', '10.2/new']);
    const problems = newItemProblems(BASE, head, remints('10.2/new from 10.1/held'));
    expect(problems.some((p) => p.startsWith(`${REMINT_TRAILER}:`) && /10\.1\/held is still here/.test(p))).toBe(true);
    expect(problems).toContain('the Data on request study 10.2/new is new');
  });

  it('does not let a DOI re-mint cover a new item id', () => {
    const head = keys(['sw:held', 'db:held', 'topic:held', 'sw:new'], []);
    expect(newItemProblems(BASE, head, remints('sw:new from 10.1/held'))).toContain('sw:new is a new item');
  });

  it('reads a DOI in a re-mint trailer whatever its case, since a DOI is case-insensitive and stored lowercase', () => {
    const base = keys(['sw:held'], ['10.1002/bit.7019']);
    const head = keys(['sw:held'], ['10.1002/bit.70190']);
    expect(newItemProblems(base, head, remints('10.1002/BIT.70190 from 10.1002/BIT.7019'))).toEqual([]);
    expect(newItemProblems(base, head, remints('10.1002/BIT.70190 from 10.1002/bit.7019'))).toEqual([]);
  });

  it('counts one re-mint written in two cases (a re-typed cherry-pick) as one declaration', () => {
    const base = keys(['sw:held'], ['10.1002/bit.7019']);
    const head = keys(['sw:held'], ['10.1002/bit.70190']);
    const trailers = remints('10.1002/BIT.70190 from 10.1002/bit.7019', '10.1002/bit.70190 from 10.1002/bit.7019');
    expect(newItemProblems(base, head, trailers)).toEqual([]);
  });

  it('exempts a topic only when its prefix and its type both say topic, so neither alone lets an item through', () => {
    const typedTopic = keys(['sw:held', 'db:held', 'topic:held', ['sw:new-tool', 'topic']], ['10.1/held']);
    expect(newItemProblems(BASE, typedTopic, NONE)).toContain('sw:new-tool is a new item');
    const realTopic = keys(['sw:held', 'db:held', 'topic:held', ['topic:new-tag', 'topic']], ['10.1/held']);
    expect(newItemProblems(BASE, realTopic, NONE)).toEqual([]);
  });

  it('counts one DOI named in two cases as one held key', () => {
    const base = keys(['sw:held'], ['10.1/held']);
    const head = keys(['sw:held'], ['10.1/a', '10.1/b']);
    const problems = newItemProblems(base, head, remints('10.1/a from 10.1/held', '10.1/b from 10.1/HELD'));
    expect(problems.some((p) => /10\.1\/held is named by more than one trailer/.test(p))).toBe(true);
  });
});

describe('refusalMessage', () => {
  it('opens with the pause in public words and says how a split and a re-mint are named', () => {
    const message = refusalMessage(['sw:new-tool is a new item']);
    expect(message).toMatch(/new items are paused until CAAIL v2/);
    expect(message).toContain(`${SPLIT_TRAILER}: <new id> from <held id>`);
    expect(message).toContain(`${REMINT_TRAILER}: <new id> from <old id>`);
    expect(message).toContain('sw:new-tool is a new item');
  });

  it('says a trailer goes in the commit message\'s last paragraph, the only place git reads one', () => {
    expect(refusalMessage(['x']).replace(/\s+/g, ' ')).toMatch(/last paragraph of a commit message/);
  });

  it('says neither trailer is a way to add a new item', () => {
    expect(refusalMessage(['x']).replace(/\s+/g, ' ')).toMatch(/Neither trailer adds a new item: suggest one through an issue instead/);
  });

  it('names no system outside this repository', () => {
    expect(refusalMessage(['x'])).not.toMatch(/https?:\/\//);
  });
});

describe('the hand-written statements of the trailers agree with the guard', () => {
  // The trailer names are typed out where a person reads them; a renamed constant would
  // otherwise leave the docs telling an author to write a trailer the guard ignores.
  const flat = (file: string) => readFileSync(join(REPO_ROOT, file), 'utf-8').replace(/\s+/g, ' ');

  it('the caail-db-authoring note gives both trailers in their full form', () => {
    const note = flat('.claude/skills/caail-db-authoring/SKILL.md');
    expect(note).toContain(`${SPLIT_TRAILER}: <new id> from <held id>`);
    expect(note).toContain(`${REMINT_TRAILER}: <new id> from <old id>`);
  });

  it('the lint-papers.yml step comment names both trailers', () => {
    const workflow = flat('.github/workflows/lint-papers.yml');
    expect(workflow).toContain(`"${SPLIT_TRAILER}:"`);
    expect(workflow).toContain(`"${REMINT_TRAILER}:"`);
  });

  it("CONTRIBUTING.md's list of what CI refuses is every item type but a topic, in the schema's order", () => {
    // The guard refuses every new item whose type is not `topic`, so the list a contributor
    // reads is the schema's type CHECK less `topic`. A type added there without a word here
    // fails this test, rather than leaving CONTRIBUTING.md understating what CI refuses.
    const words: Record<string, string> = {
      paper: 'papers',
      software: 'software',
      database: 'databases',
      dataset: 'datasets',
      report: 'field reports',
    };
    const schema = readFileSync(join(REPO_ROOT, 'site', 'db', 'schema.sql'), 'utf-8');
    const check = schema.match(/type\s+TEXT NOT NULL CHECK \(type IN \(([^)]*)\)\)/);
    expect(check, "schema.sql's items.type CHECK").not.toBeNull();
    const types = [...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((t) => t !== 'topic');
    for (const type of types) {
      expect(words[type], `no word for item type "${type}": add it here and to CONTRIBUTING.md's list`).toBeDefined();
    }
    expect(flat('CONTRIBUTING.md')).toContain(`(${types.map((t) => words[t]).join(', ')})`);
  });
});

describe.runIf(NEW_ITEMS_PAUSED)('checkNewItems reads the base and head commits of a real repository', () => {
  const scratch: string[] = [];
  afterAll(() => { for (const d of scratch) rmSync(d, { recursive: true, force: true }); });

  const git = (repo: string, ...args: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf-8' }).trim();

  /** A repository whose base commit holds two items and one Data on request study. */
  function repo(): { dir: string; base: string } {
    const dir = mkdtempSync(join(tmpdir(), 'caail-new-items-'));
    scratch.push(dir);
    git(dir, 'init', '-q');
    mkdirSync(join(dir, 'site', 'db', 'ndjson'), { recursive: true });
    write(dir, ['sw:held', 'topic:held'], ['10.1/held']);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'base');
    return { dir, base: git(dir, 'rev-parse', 'HEAD') };
  }

  function write(dir: string, ids: string[], dois: string[]): void {
    writeFileSync(join(dir, 'site', 'db', 'ndjson', 'items.ndjson'), ids.map(item).join('\n') + '\n');
    writeFileSync(join(dir, 'site', 'db', 'ndjson', 'datasets_on_request.ndjson'), dois.map(study).join('\n') + '\n');
  }

  function commit(dir: string, message: string, ids: string[], dois: string[]): void {
    write(dir, ids, dois);
    git(dir, 'add', '-A');
    // --allow-empty: a trailer-only commit, or an edit elsewhere, may leave these files as they were.
    git(dir, 'commit', '-q', '--allow-empty', '-m', message);
  }

  it('refuses an item added by hand to the NDJSON', () => {
    const { dir, base } = repo();
    commit(dir, 'add a row by hand', ['sw:held', 'topic:held', 'sw:new-tool'], ['10.1/held']);
    expect(checkNewItems(dir, base).some((p) => p.includes('sw:new-tool'))).toBe(true);
  });

  it('refuses a Data on request study added by hand', () => {
    const { dir, base } = repo();
    commit(dir, 'add a study', ['sw:held', 'topic:held'], ['10.1/held', '10.2/new']);
    expect(checkNewItems(dir, base).some((p) => p.includes('10.2/new'))).toBe(true);
  });

  it('passes an edit and a removal', () => {
    const { dir, base } = repo();
    commit(dir, 'remove an item', ['topic:held'], ['10.1/held']);
    expect(checkNewItems(dir, base)).toEqual([]);
  });

  it('passes a split whose trailer names a held item on the base', () => {
    const { dir, base } = repo();
    commit(dir, `split a held item\n\n${SPLIT_TRAILER}: sw:held-part from sw:held`, ['sw:held', 'topic:held', 'sw:held-part'], ['10.1/held']);
    expect(checkNewItems(dir, base)).toEqual([]);
  });

  it('refuses a split whose trailer names an item that is not on the base', () => {
    const { dir, base } = repo();
    commit(dir, `split\n\n${SPLIT_TRAILER}: sw:held-part from sw:never-held`, ['sw:held', 'topic:held', 'sw:held-part'], ['10.1/held']);
    expect(checkNewItems(dir, base).some((p) => p.includes('sw:never-held'))).toBe(true);
  });

  it('passes a re-mint whose trailer names the id the change replaces', () => {
    const { dir, base } = repo();
    commit(dir, `re-mint a held id\n\n${REMINT_TRAILER}: sw:held-renamed from sw:held`, ['topic:held', 'sw:held-renamed'], ['10.1/held']);
    expect(checkNewItems(dir, base)).toEqual([]);
  });

  it('refuses a re-mint whose old id is still there', () => {
    const { dir, base } = repo();
    commit(dir, `re-mint\n\n${REMINT_TRAILER}: sw:held-renamed from sw:held`, ['sw:held', 'topic:held', 'sw:held-renamed'], ['10.1/held']);
    expect(checkNewItems(dir, base).some((p) => p.startsWith(`${REMINT_TRAILER}:`) && /still here/.test(p))).toBe(true);
  });

  it('reads a trailer value folded onto a second line as one value', () => {
    const { dir, base } = repo();
    commit(dir, `re-mint a held id\n\n${REMINT_TRAILER}: sw:held-renamed from\n sw:held`, ['topic:held', 'sw:held-renamed'], ['10.1/held']);
    expect(checkNewItems(dir, base)).toEqual([]);
  });

  it('reads a split and a re-mint trailer from the same commit', () => {
    const { dir } = repo();
    commit(dir, 'hold a second item', ['sw:held', 'sw:held-2', 'topic:held'], ['10.1/held']);
    const base = git(dir, 'rev-parse', 'HEAD');
    commit(
      dir,
      `split one held item and re-mint another\n\n${SPLIT_TRAILER}: sw:held-part from sw:held\n${REMINT_TRAILER}: sw:held-2-renamed from sw:held-2`,
      ['sw:held', 'sw:held-part', 'sw:held-2-renamed', 'topic:held'],
      ['10.1/held'],
    );
    expect(checkNewItems(dir, base)).toEqual([]);
  });

  it('refuses a head that lacks the items file, rather than reading it as empty', () => {
    const { dir, base } = repo();
    git(dir, 'rm', '-q', 'site/db/ndjson/items.ndjson');
    git(dir, 'commit', '-q', '-m', 'move the items file away');
    expect(() => checkNewItems(dir, base)).toThrow(/site\/db\/ndjson\/items\.ndjson is not at HEAD/);
  });

  it('refuses a head that lacks the Data on request file', () => {
    const { dir, base } = repo();
    git(dir, 'rm', '-q', 'site/db/ndjson/datasets_on_request.ndjson');
    git(dir, 'commit', '-q', '-m', 'move the Data on request file away');
    expect(() => checkNewItems(dir, base)).toThrow(/datasets_on_request\.ndjson is not at HEAD/);
  });

  it('names the file and the commit when a row is not valid JSON, rather than failing with a stack trace', () => {
    const { dir, base } = repo();
    writeFileSync(join(dir, 'site', 'db', 'ndjson', 'items.ndjson'), item('sw:held') + '\n<<<<<<< HEAD\n');
    git(dir, 'commit', '-q', '-am', 'leave a conflict marker');
    expect(() => checkNewItems(dir, base)).toThrow(/site\/db\/ndjson\/items\.ndjson at HEAD is not valid NDJSON/);
  });

  it('names a base that is not a commit in the clone, rather than failing with a stack trace', () => {
    const { dir } = repo();
    expect(() => checkNewItems(dir, '0123456789abcdef0123456789abcdef01234567')).toThrow(/0123456789abcdef0123456789abcdef01234567 is not a commit/);
  });

  it('reads a trailer from any commit in the range, not only the last', () => {
    const { dir, base } = repo();
    commit(dir, `split\n\n${SPLIT_TRAILER}: sw:held-part from sw:held`, ['sw:held', 'topic:held', 'sw:held-part'], ['10.1/held']);
    commit(dir, 'an unrelated edit', ['sw:held', 'topic:held', 'sw:held-part'], ['10.1/held']);
    expect(checkNewItems(dir, base)).toEqual([]);
  });

  it('reads a file the base does not have yet as empty, rather than failing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caail-new-items-'));
    scratch.push(dir);
    git(dir, 'init', '-q');
    mkdirSync(join(dir, 'site', 'db', 'ndjson'), { recursive: true });
    writeFileSync(join(dir, 'site', 'db', 'ndjson', 'items.ndjson'), item('sw:held') + '\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'base, before any Data on request list');
    const base = git(dir, 'rev-parse', 'HEAD');
    commit(dir, 'first Data on request study', ['sw:held'], ['10.2/new']);
    expect(checkNewItems(dir, base)).toEqual(['the Data on request study 10.2/new is new']);
  });

  it('does not count a trailer from before the base', () => {
    const { dir } = repo();
    commit(dir, `split\n\n${SPLIT_TRAILER}: sw:held-part from sw:held`, ['sw:held', 'topic:held'], ['10.1/held']);
    const base = git(dir, 'rev-parse', 'HEAD');
    commit(dir, 'add the part later', ['sw:held', 'topic:held', 'sw:held-part'], ['10.1/held']);
    expect(checkNewItems(dir, base).some((p) => p.includes('sw:held-part'))).toBe(true);
  });
});
