/**
 * private-paths.test.ts: the private working trees must resolve as gitignored.
 *
 * `internal-docs/`, `manuscript/`, `docs/superpowers/` and `docs/research/` are
 * this project's private working trees, and `.env` carries its credentials.
 * What they contain is deliberately not described here: this file is
 * world-readable, and naming private material is disclosure whether or not the
 * material itself ships.
 *
 * Each is protected by exactly one line in `.gitignore`, and until this file
 * existed nothing verified any of those lines was still there. Delete one,
 * reword it, or lose it in a conflict resolution and nothing fails: no build
 * breaks, no test goes red, and the next `git add -A` stages the contents into
 * a repo that is PUBLIC, where pull requests cannot be deleted.
 *
 * Snapshot, 2026-08-25, measured with the `internal-docs/` rule absent:
 * `git add -A --dry-run` reported 43 private paths and looked entirely
 * ordinary. That figure tracks one working directory and will drift;
 * `git add -A --dry-run` prints the real one. It is recorded because the
 * number is the argument, not because it is stable.
 *
 * `.gitignore` is in `test.yml`'s paths filter, so this runs on exactly the
 * edit most likely to break it. Before that filter existed, a PR touching only
 * `.gitignore` triggered no workflow at all.
 *
 * WHY `docs/superpowers/` AND `docs/research/` ARE HERE despite being empty on
 * disk. Until this branch, `CLAUDE.md` and `docs/agents/issue-tracker.md` both
 * directed writers to `docs/superpowers/`; both now point at `internal-docs/`,
 * so nothing tracked routes there any more. The rules stay guarded anyway,
 * because that is precisely when they look dead and invite a tidy-up: an agent
 * carrying the old instruction (a cached skill, an older session, a stale
 * branch) still writes there, and with the rule deleted that lands an
 * unpublished spec in a public repo with nothing red. Removing the rules is a
 * decision someone can take deliberately; it should not happen by tidying.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** scripts/ → site/ → repo root. */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Each private tree with the EXACT `.gitignore` pattern that must match it.
 *
 * Pinning the pattern, not just the source file, is what makes the anchoring
 * verifiable. `/internal-docs/` is anchored to the repo root on purpose: drop
 * the leading slash and a nested `site/src/content/docs/internal-docs/` becomes
 * silently ignored and vanishes from the build. Under a source-only assertion
 * ("some line in .gitignore matched") every probe would still pass, which is
 * why the pattern is pinned; with the pin, that edit fails here immediately.
 * `manuscript/` is deliberately recorded as unanchored, which is its current
 * state rather than an endorsement of it.
 */
const PRIVATE_TREES = [
  { root: 'internal-docs/', pattern: '/internal-docs/' },
  { root: 'manuscript/', pattern: 'manuscript/' },
  { root: 'docs/superpowers/', pattern: 'docs/superpowers/' },
  { root: 'docs/research/', pattern: 'docs/research/' },
];

/**
 * Single-file rules with the same property and higher stakes. `.gitignore`
 * says it in this repo's own words: the repo is public, a pushed secret stays
 * fetchable by SHA, GHArchive captures the event, and a leaked key must be
 * rotated rather than deleted. A guard covering drafts and decision records
 * but not the secrets file would have the severity ordering backwards.
 */
const PRIVATE_FILES = [
  { path: '.env', pattern: '.env' },
  { path: '.env.local', pattern: '.env.*' },
];

/**
 * DERIVED from the two lists above, never hand-listed beside them. Two
 * independently maintained lists is the defect CLAUDE.md calls this repo's
 * most expensive recurring bug: adding a tree to `PRIVATE_TREES` alone would
 * give the tracked-files half with no rule probe, and adding a probe alone
 * would give the rule half with no tracked-files check. Deriving makes that
 * impossible rather than documenting it.
 *
 * EVERY PROBE IS FICTIONAL, and that is a requirement rather than a
 * convenience. `check-ignore --no-index` answers about the RULE, so a made-up
 * path tests exactly what a real one does. An earlier draft named real files
 * and described what a private tree holds, which published the shape of
 * private working material into a world-readable file for no gain, and is
 * irreversible once pushed. Nothing here may name a real private file.
 *
 * Two extensions per tree, because a guard whose probes are all `.md` only
 * tests `.md`: narrowing a rule to match Markdown alone would keep a
 * Markdown-only probe set green while every other private file, credentials
 * included, became committable.
 */
const PROBES = [
  ...PRIVATE_TREES.flatMap(({ root, pattern }) => [
    { path: `${root}probe.md`, pattern },
    { path: `${root}nested/probe.bin`, pattern },
  ]),
  // Spread, not mapped: the flatMap above genuinely derives two probes per
  // tree, these are already in probe shape, and an identity map here would
  // invite a reader to hunt for a transform that is not there.
  ...PRIVATE_FILES,
];

/**
 * The OTHER direction. The checks above prove the private paths are ignored;
 * nothing in them prevents a rule from being far too broad. Widen
 * `docs/research/` to `docs/` and the probes catch the pattern change, but
 * they cannot tell you WHAT ELSE the widened rule swallowed. That is this
 * list's job: canonical content silently stops being published, vanishing from
 * `llms-full.txt` and the homepage counts, with everything else green.
 *
 * Note the two halves catch different edits and neither subsumes the other. A
 * widening that keeps the pattern text intact (adding a NEW broad rule rather
 * than editing an existing one) changes no probe at all, and only this list
 * sees it.
 *
 * `docs/adr/` is the sharpest case and is here on purpose: two of its sibling
 * directories under `docs/` ARE ignored, so a rule widened from
 * `docs/research/` to `docs/` would be invisible to every assertion above.
 */
const MUST_STAY_PUBLISHABLE = [
  'Papers.md',
  'Datasets/Cow.md',
  'docs/adr/0002-what-the-repo-publishes.md',
  'docs/agents/issue-tracker.md',
  'site/src/content/docs/privacy.mdx',
  // The negation case, and the reason checkIgnore cannot use the exit code
  // alone. `!.env.example` MATCHES and exits 0 while leaving the file
  // publishable, so this entry fails on a correct repo under any
  // exit-code-only reading. It is the regression test for that hole.
  '.env.example',
];

/** `<source>:<line>:<pattern>\t<pathname>` */
function checkIgnore(path: string) {
  // --no-index is load-bearing for the same reason canonical-files.test.ts
  // gives: in index-aware mode git check-ignore never reports a TRACKED path,
  // so the moment one of these was committed (the exact failure) the check
  // would go quiet and pass. Asking about the rule instead is the only form
  // that stays honest after the defect has already happened.
  const res = spawnSync('git', ['check-ignore', '--no-index', '-v', path], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
  // 0 = a pattern matched, 1 = none did. Anything else means the check did not
  // run, and an unchecked check must fail rather than pass quietly.
  expect(res.error, `git check-ignore could not run for ${path}`).toBeUndefined();
  expect([0, 1], `git check-ignore exited ${res.status} for ${path}`).toContain(res.status);
  const out = (res.stdout ?? '').trim();

  // EXIT 0 MEANS "A PATTERN MATCHED", NOT "IS IGNORED", and conflating the two
  // is a real hole rather than pedantry. A NEGATION matches and exits 0 while
  // leaving the path publishable:
  //
  //   git check-ignore --no-index -v .env.example
  //     -> .gitignore:53:!.env.example   exit 0, and it is NOT ignored
  //
  // So a future `!internal-docs/<anything>` would keep its probe green while
  // the path became publishable, which is the exact failure this file exists
  // to prevent. Read the pattern field and honour the `!`.
  const pattern = out ? (out.split('\t')[0] ?? '').split(':').slice(2).join(':') : '';
  const negated = pattern.startsWith('!');
  return { matched: res.status === 0 && !negated, out, pattern };
}

describe('the private working trees stay out of the public repo', () => {
  // One `it` per probe rather than a loop, so a run that breaks two rules
  // reports both. A single loop aborts on the first failure, and the reviewer
  // fixes one line, re-runs, and meets the second on the next round.
  it.each(PROBES)('gitignores $path, by the $pattern rule in this repo', ({ path, pattern }) => {
    const { matched, out } = checkIgnore(path);
    expect(
      matched,
      `${path} is NOT gitignored: private working material is committable into a public repo`,
    ).toBe(true);

    // LIMIT: check-ignore reads the WORKING-TREE .gitignore, not
    // HEAD:.gitignore, so this proves the rule is in the repo's own file and
    // not in a personal exclude source. It does NOT prove the rule is
    // committed: an unstaged local re-add passes here and would fail in CI,
    // which is the right way round but is not what "committed" would mean.
    //
    // Not hypothetical: this machine's .git/info/exclude carries `.env`, so
    // without the source half the `.env` probe passes even with the committed
    // rule deleted.
    expect(
      out,
      `${path} is ignored, but by a rule outside this repo's .gitignore `
        + `(a personal core.excludesFile or .git/info/exclude), so nothing `
        + `here guarantees it for anyone else`,
    ).toMatch(/^\.gitignore:\d+:/);

    // The PATTERN, not just the source. This is what pins the anchoring.
    expect(
      out,
      `${path} is ignored by a different pattern than expected. The rule may `
        + `have been widened or narrowed; both change what is published.`,
    ).toMatch(new RegExp(`^\\.gitignore:\\d+:${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\t`));
  });

  it('has no tracked files under any private tree', () => {
    // The rule above can be present and correct while a file committed before
    // it was added stays tracked forever, since .gitignore does not apply
    // retroactively to the index.
    // Both lists, not just the trees. PRIVATE_FILES previously had the rule
    // half and no tracked-files half, which is the same desync the PROBES
    // docstring claims deriving makes impossible: the probes were derived and
    // then this pathspec was hand-written from one of the two lists. Since
    // --no-index is deliberately blind to tracked-ness, nothing caught a
    // committed .env, the path this file calls highest-stakes: `git add -f
    // .env` kept every test green. Exact paths, never a glob: `.env.*` as a
    // pathspec would also match the tracked .env.example template.
    const roots = [
      ...PRIVATE_TREES.map(({ root }) => root),
      ...PRIVATE_FILES.map(({ path }) => path),
    ];
    const res = spawnSync('git', ['ls-files', '--', ...roots], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    expect(res.error, 'git ls-files could not run').toBeUndefined();
    expect(res.status, `git ls-files exited ${res.status}`).toBe(0);
    expect(
      (res.stdout ?? '').trim(),
      'these private files are TRACKED and will be published',
    ).toBe('');
  });

  it.each(MUST_STAY_PUBLISHABLE)('does not over-match and swallow %s', (path) => {
    const { matched, out } = checkIgnore(path);
    expect(
      matched,
      `${path} IS gitignored (${out}). A private-path rule has been widened `
        + `and is now swallowing canonical content, which silently disappears `
        + `from the published site and from llms-full.txt.`,
    ).toBe(false);
  });
});
