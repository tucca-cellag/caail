/**
 * private-paths.test.ts: the private working trees must resolve as gitignored.
 *
 * `PRIVATE_TREES` below is the list; it is not restated here, because a prose
 * copy of a constant drifts from it and an earlier draft of this paragraph
 * named four while the constant held six, then six while it held nine.
 * `.env` and `.env.*` carry the credentials.
 * What any of them CONTAIN is deliberately not described: this file is
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
 * WHY THE `docs/` SUBPATHS ARE HERE when `docs/` no longer exists at all.
 * Which ones is `PRIVATE_TREES`'s business, not this paragraph's; an earlier
 * draft named two while the constant held five.
 * The directory was emptied and removed, because nothing in it
 * was documentation for the live library: decision records, process
 * conventions, and one superseded implementation spike whose production form is
 * `site/scripts/db/lib.ts`. The criterion is what a file IS, not whether it is
 * prose; a spike is code and still did not belong there. Their
 * `.gitignore` rules were kept, and that is exactly when a rule looks dead and
 * invites a tidy-up. An agent carrying an older instruction (a cached skill, a
 * stale branch, a session that began before the change) still writes to
 * `docs/superpowers/`, and with the rule deleted that lands an unpublished spec
 * in a public repo with nothing red. Removing the rules is a decision someone
 * can take deliberately; it should not happen by tidying.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { llmsFullSources } from './parser/llms-full.js';
// The PURE module, deliberately not the loader: importing it from the loader
// pulled `astro/loaders` into this guard, so an unrelated Astro breakage
// would take down the check that proves .env is gitignored.
import { CANONICAL_SOURCES } from '../src/content/canonical-sources.js';
import { worktreeIncludeRules } from '../src/lib/canonical-files.js';

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
 * `manuscript/` and `tools/` are deliberately recorded as unanchored, which is
 * their current state rather than an endorsement of it. Unanchored means ANY
 * directory of that name at any depth is ignored, so a future `site/scripts/
 * tools/` would be swallowed on creation with every check green: nothing under
 * `site/scripts/` is in the publishable set, so no guard here would see it.
 * Anchoring them is a behaviour change and therefore a decision, not a tidy-up.
 */
const PRIVATE_TREES = [
  { root: 'internal-docs/', pattern: '/internal-docs/' },
  { root: 'manuscript/', pattern: 'manuscript/' },
  { root: 'docs/superpowers/', pattern: 'docs/superpowers/' },
  { root: 'docs/research/', pattern: 'docs/research/' },
  // The three docs/ subpaths this repo deleted. They need the rule MORE than
  // the two above, not less: a stale skill or an older session names docs/adr/
  // and docs/agents/ specifically, because that is what CLAUDE.md and
  // CONTEXT.md said until they were removed.
  { root: 'docs/adr/', pattern: 'docs/adr/' },
  { root: 'docs/agents/', pattern: 'docs/agents/' },
  { root: 'docs/spikes/', pattern: 'docs/spikes/' },
  // The highest-stakes rule in .gitignore, and it was unguarded while four
  // lower-stakes ones were not. Its own rationale, verbatim from .gitignore:
  // it "holds the full text of works CAAIL may read but may not redistribute",
  // and committing it to a public repo "is exactly the publication that tier
  // exists to avoid", with git history keeping it fetchable by SHA afterwards.
  { root: 'docling-corpus/', pattern: 'docling-corpus/' },
  // Sits in the same "Local working artifacts" block as manuscript/ and the
  // two docs/ rules, and was the only member of it with no guard.
  { root: 'tools/', pattern: 'tools/' },
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
 * Nothing under `docs/` appears in this list. That is not an oversight: `docs/`
 * has been removed, and asserting that some path under it must stay publishable
 * would encode a publishing policy as a side effect of testing for over-match.
 */
const MUST_STAY_PUBLISHABLE = [
  // DERIVED from the UNION of two enumerations, because neither is complete on
  // its own and the first draft of this used only llmsFullSources().
  //
  //   llmsFullSources()          what is inlined into the served llms-full.txt
  //   CANONICAL_SOURCES          what the docs loader turns into site routes
  //
  // TWO files are loader-only, not one: Taxonomy.md and
  // AIAgentsFoundationModels.md. Both are published routes and neither is in
  // llms-full's list. A draft of this comment claimed a rule swallowing
  // Taxonomy.md would be caught; it would not have been, and losing that file
  // silently takes /taxonomy/ and every row and column definition with it.
  //
  // Worth knowing separately, and NOT fixed here: because they are loader-only,
  // the served llms-full.txt omits both, while its own header calls itself the
  // library's full text. That is pre-existing; this is just the first thing to
  // compute the difference between the two enumerations. Do not read the gap as
  // a single known exception.
  ...new Set([
    ...llmsFullSources(REPO_ROOT),
    ...CANONICAL_SOURCES.files,
    // Both of these are INSIDE the Set, not appended after it, so adding
    // either to llmsFullSources() later (a natural change for the privacy
    // page) does not trip the no-duplicates assertion on a correct edit.
    //
    // privacy.mdx: a route rather than corpus, in neither list. Losing it
    // silently is a compliance problem rather than a content one.
    'site/src/content/docs/privacy.mdx',
    // .env.example: the negation case, and the reason checkIgnore cannot use
    // the exit code alone. `!.env.example` MATCHES and exits 0 while leaving
    // the file publishable, so this entry fails on a correct repo under any
    // exit-code-only reading. It is the regression test for that hole.
    '.env.example',
  ]),

  // DELIBERATELY NOT LISTED: anything under docs/, which no longer exists. An
  // earlier draft probed two files there to catch a rule widened to a bare
  // `docs/`, which made this guard assert a PUBLISHING POLICY as a side effect
  // of testing for over-match, and got one of them backwards against the rule
  // it sat beside. The directory has since been removed entirely: nothing in
  // it was library documentation.
  //
  // What this costs, measured rather than reasoned about, because two earlier
  // drafts of this comment guessed and both were wrong. The `docs/research/`
  // and `docs/superpowers/` rules are still live. Adding a bare `docs/`
  // alongside them is caught by the PATTERN pin above from EITHER position:
  //
  //   docs/ added after  -> check-ignore reports `docs/`, pin fails
  //   docs/ added before -> check-ignore reports `docs/`, pin fails
  //
  // It is not a last-match-wins question. A bare `docs/` excludes the
  // DIRECTORY, so git never descends to consider the deeper pattern, which is
  // the same short-circuit that hides a companion inside a wholly-ignored tree
  // from `.worktreeinclude`. So this list's blind spot is narrower than it
  // looks: it sees nothing under `docs/`, but the pin does.
];

/**
 * The pattern field of one `check-ignore -v` line.
 *
 * Line shape: `<source>:<line>:<pattern>\t<pathname>`. `slice(2)` skips the
 * source and line number, and the `join(':')` puts back any colon inside the
 * pattern itself rather than truncating at it.
 *
 * ONE copy on purpose. Both callers below need to know whether the matching
 * pattern is a NEGATION, and a second hand-rolled copy of this split is how the
 * two would come to disagree about what a negation is: fix a parsing bug in one
 * and the probes and the over-match guard start answering differently, with
 * nothing failing. Same reasoning the repo applies to hand-rolled command
 * parsing.
 */
function patternOf(line: string): string {
  if (!line) return '';
  return line.split('\t')[0].split(':').slice(2).join(':');
}

/**
 * Is this `check-ignore -v` line attributable to a `.gitignore` IN THIS REPO?
 *
 * Two things have to be true at once, and each was bought with a defect on this
 * branch. It has to accept a NESTED gitignore, which reports with its path
 * prefix (`site/.gitignore:2:dist/`), because two guarded paths live under
 * `site/` and matching only the bare name filed a real in-repo regression under
 * "your machine is misconfigured". And it has to reject a source OUTSIDE the
 * repo, because a personal `core.excludesFile` produces an ABSOLUTE path
 * (`/Users/x/.gitignore:1:Papers.md`) and blaming that on the repo sends the
 * reader after a regression that does not exist while CI stays green.
 *
 * The discriminator is the leading slash: git prints an in-repo ignore file as
 * a repo-relative path and an external one absolute. A pattern widened to admit
 * the nested case without that test admits the external case too, which is
 * exactly what happened here: the fix for the first defect reintroduced the
 * second. Measured both directions in the sibling unit test rather than reasoned
 * about, because that is how the reintroduction was found.
 */
function isInRepoGitignore(line: string): boolean {
  if (line.startsWith('/')) return false;
  return /(^|\/)\.gitignore:\d+:/.test(line);
}

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
  const pattern = patternOf(out);
  const negated = pattern.startsWith('!');
  return { matched: res.status === 0 && !negated, out, pattern };
}

describe('attributing an ignore rule to this repo or to the developer', () => {
  // BOTH DIRECTIONS, because this predicate has now been wrong in each of them
  // on this branch, and each wrong answer sends the reader somewhere useless.
  //
  // Too narrow (`startsWith('.gitignore:')`) filed a real in-repo regression in
  // a nested gitignore under "your local git config is hiding published content
  // from you". Too wide (`/(^|\/)\.gitignore:\d+:/`, the fix for that) put a
  // developer's personal core.excludesFile back under "a rule in this repo has
  // been widened", which is the misdirection the split was added to prevent.
  //
  // The second was introduced BY the fix for the first and survived four review
  // rounds, so the shape is pinned here rather than exercised only through the
  // batch check, where it is reachable only on a machine that happens to carry
  // one of these paths in a personal exclude file. CI has no such file, so CI
  // can never reach it.
  const cases: Array<{ line: string; inRepo: boolean; why: string }> = [
    {
      line: '.gitignore:9:/internal-docs/\tinternal-docs/x',
      inRepo: true,
      why: 'the root .gitignore, reported repo-relative',
    },
    {
      line: 'site/.gitignore:2:dist/\tsite/dist/x',
      inRepo: true,
      why: 'a NESTED in-repo .gitignore, reported with its path prefix',
    },
    {
      line: '/Users/someone/.gitignore:1:Papers.md\tPapers.md',
      inRepo: false,
      why: 'a personal core.excludesFile, reported as an ABSOLUTE path',
    },
    {
      line: '.git/info/exclude:1:Papers.md\tPapers.md',
      inRepo: false,
      why: 'a per-clone exclude file, which is not a .gitignore at all',
    },
  ];

  for (const { line, inRepo, why } of cases) {
    it(`${inRepo ? 'claims' : 'disclaims'} ${why}`, () => {
      expect(isInRepoGitignore(line), why).toBe(inRepo);
    });
  }
});

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

  it('.worktreeinclude carries internal-docs/ as a DIRECTORY pattern', () => {
    // Presence, not effect — but the effect was measured before this was
    // written, which is what makes presence worth asserting. Verified in a
    // fresh worktree: the tree arrives with this line and does not without it,
    // and worktrees are this repo's normal working shape.
    //
    // The SHAPE is what this pins. A file glob cannot reach inside a
    // wholly-ignored directory (that is why *.local.md does not deliver a
    // companion placed in one), so "tidying" this to a glob would silently
    // stop delivering the tree while still looking like a rule for it.
    const rules = worktreeIncludeRules(
      readFileSync(join(REPO_ROOT, '.worktreeinclude'), 'utf-8'),
    );
    expect(
      rules,
      '.worktreeinclude lost its internal-docs/ directory rule, so a worktree '
        + 'session can no longer reach the working-documentation tree',
    ).toContain('/internal-docs/');
  });

  it('has a non-trivial publishable set to check', () => {
    // WHY THIS EXISTS: everything below is derived, and an empty list would pass
    // asserting nothing, because `check-ignore --stdin` on no input exits 1 with
    // empty stdout, which is the passing case.
    //
    // It used to be a hand-typed `> 50` under a comment claiming "the numbers
    // are deliberately not written down". Both halves were wrong: the number was
    // written down, and it had roughly fifteen of slack, so dropping Datasets/
    // (13 pages) still passed it. Derived instead, from the two enumerations
    // themselves, so it cannot go stale as the corpus grows.
    const fromLlmsFull = llmsFullSources(REPO_ROOT);
    const fromLoader = CANONICAL_SOURCES.files;

    // Each source is non-empty. This is what the floor was actually protecting
    // against, and it says so directly rather than through a proxy count.
    expect(fromLlmsFull.length, 'llmsFullSources() enumerated nothing').toBeGreaterThan(0);
    expect(fromLoader.length, 'CANONICAL_SOURCES.files is empty').toBeGreaterThan(0);

    // EVERY file from each source survives into the union. The previous version
    // probed one literal per source (Taxonomy.md for the loader, Papers.md for
    // llms-full) and reasoned that this proved both contributed. It did not: the
    // two enumerations already overlap on five files, so the moment Taxonomy.md
    // is added to llmsFullSources() (the natural fix for the gap noted above)
    // the entire CANONICAL_SOURCES half could be deleted with both probes still
    // green. Containment has no such hole.
    for (const f of fromLlmsFull) {
      expect(MUST_STAY_PUBLISHABLE, `${f} reached the union from llms-full and was lost`).toContain(f);
    }
    for (const f of fromLoader) {
      expect(MUST_STAY_PUBLISHABLE, `${f} reached the union from the docs loader and was lost`).toContain(f);
    }

    // EVERY canonical directory, not just one. llmsFullSources expands these
    // itself, and the union spreads only CANONICAL_SOURCES.files, so a dropped
    // dirMarkdown call would remove a whole directory from the guard with
    // nothing failing: Primers/ is 3 pages, so the total falls well inside a
    // `> 50` floor and a single Methods/ probe never notices.
    // A FIXED list, deliberately not derived from CANONICAL_SOURCES.dirs.
    // Deriving the expectation from one of the two things being guarded means
    // removing a directory there silently shrinks this check: llms-full would
    // still contribute its pages, the floor would still pass, and nothing goes
    // red. This is the property being asserted, so it is stated.
    for (const dir of ['Datasets', 'ResearchAreas', 'Methods', 'Primers']) {
      expect(
        MUST_STAY_PUBLISHABLE.some((p) => p.startsWith(`${dir}/`)),
        `${dir}/ contributes nothing to the publishable set, so a rule `
          + `swallowing it would go unnoticed`,
      ).toBe(true);
    }

    // NO no-duplicates assertion here, deliberately. MUST_STAY_PUBLISHABLE is
    // built by spreading a Set, so `new Set(x).size === x.length` holds for
    // every possible input including one where both enumerations collapsed to
    // a single element. It read as load-bearing and could never fail. The two
    // enumerations genuinely do overlap (five files are in both), so the Set is
    // doing real work; asserting the result of it is asserting nothing.
  });

  it('does not over-match and swallow anything the build publishes', () => {
    // ONE process for the whole set, not one per path: check-ignore reads a
    // batch on --stdin and prints a line only for paths that MATCHED, so
    // silence is the passing case.
    const res = spawnSync('git', ['check-ignore', '--no-index', '-v', '--stdin'], {
      cwd: REPO_ROOT,
      input: MUST_STAY_PUBLISHABLE.join('\n'),
      encoding: 'utf-8',
    });
    expect(res.error, 'git check-ignore could not run').toBeUndefined();
    expect([0, 1], `git check-ignore exited ${res.status}`).toContain(res.status);

    // A NEGATION matches and prints, while leaving the path publishable, so
    // filter those out rather than treating any output as failure. This is the
    // same `!` that makes the exit code alone unusable in checkIgnore above,
    // and `.env.example` is in the set precisely to exercise it.
    const matched = (res.stdout ?? '')
      .split('\n')
      .filter((l) => l.trim())
      .filter((l) => !patternOf(l).startsWith('!'));

    // SPLIT BY SOURCE before asserting. checkIgnore pins `.gitignore:` for
    // exactly this reason and the first version of this batched test dropped
    // it, which is a regression of a fix made earlier on this branch: a
    // developer carrying one of these paths in a personal core.excludesFile or
    // .git/info/exclude would get a red run blaming the repo's .gitignore,
    // while CI (which has no such file) stayed green. That sends the reviewer
    // after a regression that does not exist.
    // Which lines count as in-repo is isInRepoGitignore's business, and both
    // directions are pinned in its own test rather than only through this one.
    const fromRepo = matched.filter(isInRepoGitignore);
    const fromElsewhere = matched.filter((l) => !isInRepoGitignore(l));

    expect(
      fromRepo,
      'a rule in this repo\'s .gitignore has been widened and is now swallowing '
        + 'content the build publishes, which disappears from llms-full.txt and '
        + 'the homepage counts with everything else green',
    ).toEqual([]);

    expect(
      fromElsewhere,
      'these published paths are ignored by a rule OUTSIDE this repo (a personal '
        + 'core.excludesFile or .git/info/exclude). Nothing is wrong with the '
        + 'repo; your local git config is hiding published content from you',
    ).toEqual([]);
  });
});
