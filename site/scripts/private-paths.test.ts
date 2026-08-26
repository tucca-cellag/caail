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
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The PURE module, deliberately not the loader: importing it from the loader
// pulled `astro/loaders` into this guard, so an unrelated Astro breakage
// would take down the check that proves .env is gitignored.
import { CANONICAL_SOURCES } from '../src/content/canonical-sources.js';
import { worktreeIncludeRules } from '../src/lib/worktree-include.js';
import { patternOf, isInRepoGitignore, isCheckIgnoreLine } from '../src/lib/gitignore-report.js';

/** scripts/ → site/ → repo root. */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * ONE enumeration, computed LAZILY and then reused.
 *
 * Both halves of that matter and each was bought with a defect.
 *
 * Reused, because the containment assertion once called `llmsFullSources()` a
 * second time and compared it against an array built from a first call, which
 * asserts that two consecutive filesystem walks agree rather than that the union
 * was built from this enumeration.
 *
 * Lazy, because the first repair made it a module-scope const, and this file is
 * the guard proving `.env` and the private trees are gitignored. `dirMarkdown`
 * does a `readdirSync` per canonical directory, so a renamed directory threw
 * during COLLECTION. Measured: the run reports `Tests no tests` and an ENOENT
 * naming the directory, and not one of the private-tree probes executes. The run
 * is red, so CI does catch it, but every probe is gone and the message sends the
 * reader after a missing folder rather than a publishing regression.
 *
 * WHAT THIS DOES NOT BUY, stated because the first version of this comment
 * claimed more than the change achieves. Laziness defers the `readdirSync`
 * calls; it does not defer MODULE EVALUATION. The eager
 * `import { llmsFullSources } from './parser/llms-full.js'` above still pulls in
 * that module and its own transitive imports, so a top-level throw anywhere in
 * that chain reproduces `Tests no tests` exactly as before. On `main` this file
 * imported nothing from the project and could not be reached at all; it can
 * still be reached now, just not by the specific route that was measured. Fully
 * closing it means the guard importing no project module, which is a larger
 * change than this branch should carry.
 */
let llmsFullCache: string[] | undefined;
async function llmsFull(): Promise<string[]> {
  // DYNAMIC, so the import happens inside a test body rather than during
  // collection. Making the walk lazy was not enough on its own: an eager
  // `import` of parser/llms-full.js pulls in that module and its transitive
  // chain, and a top-level throw anywhere in it aborts collection of THIS file,
  // which reports `Tests no tests` with not one probe run. Measured on this
  // branch before the accessor existed.
  //
  // With this gone, every remaining project import here is a module asserted
  // import-free by pure-modules.test.ts, which is what makes that guard's
  // premise true rather than aspirational.
  llmsFullCache ??= (await import('./parser/llms-full.js')).llmsFullSources(REPO_ROOT);
  return llmsFullCache;
}

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
let publishableCache: string[] | undefined;
/**
 * LAZY for the same reason `llmsFull()` is: this array is built from a
 * filesystem walk, and computing it at module scope makes a renamed directory
 * take down every probe in this file during collection rather than failing the
 * one assertion that depends on it. Measured before this was changed: the run
 * reported `Tests no tests`.
 */
async function mustStayPublishable(): Promise<string[]> {
  publishableCache ??= [
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
    ...(await llmsFull()),
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
  // from `.worktreeinclude`.
  //
  // A THIRD DRAFT OF THIS SENTENCE, after two guessed and both were wrong, so
  // this one was measured in a scratch repo rather than reasoned about. With
  // `.gitignore` = `docs/`, check-ignore reports
  // `.gitignore:1:docs/\tsite/src/content/docs/privacy.mdx`. Two entries in this
  // very list live under a directory named `docs`, so the batch check DOES go
  // red on a bare `docs/` rule. The draft this replaces said the opposite, which
  // would have told anyone later moving those two entries that they were
  // removing coverage that did not exist.
  ];
  return publishableCache;
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
    {
      line: 'C:/Users/someone/.gitignore:1:Papers.md\tPapers.md',
      inRepo: false,
      why: 'a Windows personal excludes file, which has NO leading slash',
    },
    {
      line: '../shared/.gitignore:1:Papers.md\tPapers.md',
      inRepo: false,
      why: 'a RELATIVE excludes file outside the repo, with no leading separator at all',
    },
    {
      line: 'site/../.gitignore:9:/internal-docs/\tinternal-docs/x',
      inRepo: true,
      why: 'a path that walks out and back in, so it never leaves the repo',
    },
  ];

  for (const { line, inRepo, why } of cases) {
    it(`${inRepo ? 'claims' : 'disclaims'} ${why}`, () => {
      expect(isInRepoGitignore(line), why).toBe(inRepo);
    });
  }

  // THE PATTERN HALF, on the same shapes, because the two questions were once
  // answered by two different splits in one module: it handled a Windows drive
  // letter in the source test and broke on it in the pattern test, fifteen lines
  // apart. A fixed-index split on `:` returns `1:!probe` there, which does not
  // start with `!`, so the NEGATION check passes a path a rule has un-ignored.
  // The exit code cannot see that either, which is why the pattern is read at all.
  const patterns: Array<{ line: string; pattern: string; why: string }> = [
    { line: '.gitignore:53:!.env.example\t.env.example', pattern: '!.env.example', why: 'a negation in the root file' },
    { line: 'site/.gitignore:2:dist/\tsite/dist/x', pattern: 'dist/', why: 'a nested file' },
    { line: 'C:/Users/x/.gitignore:1:!probe\tprobe', pattern: '!probe', why: 'a source carrying its own colon' },
    { line: 'not a check-ignore line', pattern: '', why: 'a line of the wrong shape' },
  ];

  for (const { line, pattern, why } of patterns) {
    it(`reads the pattern from ${why}`, () => {
      expect(patternOf(line), why).toBe(pattern);
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
    //
    // THE SAME PREDICATE the batch check uses, deliberately. This assertion
    // carried its own root-anchored copy of the split, so a rule relocated into
    // a nested in-repo .gitignore reported as `site/.gitignore:2:...`, failed
    // here, and told the reader their personal git config was at fault. That is
    // the misdirection isInRepoGitignore was extracted to end, and having it in
    // two forms in one file is exactly what patternOf's docstring above argues
    // against. Latent rather than live today, since every guarded root is
    // top-level and a nested file cannot match one, but it bites on the next
    // entry added to PRIVATE_TREES.
    expect(
      isInRepoGitignore(out),
      `${path} is ignored, but by a rule outside this repo (a personal `
        + `core.excludesFile or .git/info/exclude), so nothing here guarantees `
        + `it for anyone else. The reporting source was: ${out}`,
    ).toBe(true);

    // The PATTERN, not just the source. This is what pins the anchoring.
    expect(
      out,
      `${path} is ignored, but not by the expected rule in the ROOT .gitignore. `
        + `This pin is deliberately location-specific as well as pattern-specific, `
        + `so it fails on a widening, on a narrowing, AND on a verbatim move into `
        + `a nested .gitignore. The check above already established the rule is `
        + `somewhere in this repo, so compare against that one before concluding `
        + `the pattern changed: if it passed and this failed, the rule moved.`,
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

});

describe('.worktreeinclude delivers what a worktree needs', () => {
  // THE MEASURED LITERAL, written here and reached from nowhere else.
  //
  // It went through two wrong homes first. A bare index into PRIVATE_TREES,
  // which this branch then inserted three entries into, so a fourth at the head
  // would have repointed it at another tree. Then a lookup by name in that same
  // list, which is better but still couples this to the GITIGNORE pattern, and
  // the two files are different formats answering different questions: git's
  // ignore syntax there, the harness's copy syntax here. Dropping the leading
  // slash in .gitignore is a legitimate edit that changes nothing about worktree
  // delivery, and it would have made this assertion demand the new spelling in a
  // file nobody had measured it against.
  const MEASURED_WORKTREE_RULE = '/internal-docs/';

  // A SEPARATE describe on purpose. This asserts the OPPOSITE property to the
  // block above: that a private tree IS copied into a worktree, rather than
  // that it stays out of the public repo. Both matter and they are different
  // failures, so a red run here must not read as a leak. Under the previous
  // heading a reviewer triaging a failure saw 'the private working trees stay
  // out of the public repo' over a message about losing ACCESS to one, which
  // inverts the urgency: this is a delivery regression with no publication
  // risk at all.
  it('.worktreeinclude carries the exact directory rule that was measured', () => {
    // Presence, not effect — but the effect was measured before this was
    // written, which is what makes presence worth asserting. Verified in a
    // fresh worktree: the tree arrives with this line and does not without it,
    // and worktrees are this repo's normal working shape.
    //
    // This pins the exact rule that was MEASURED, not the shape in general.
    // Widening it to accept any equivalent-looking directory rule would assert
    // something nobody has run: only this form was verified in a fresh worktree,
    // and .worktreeinclude's matching is the harness's rather than git's. So the
    // failure message says the measured rule is gone and explicitly declines to
    // claim the tree is. A file glob cannot reach inside a
    // wholly-ignored directory (that is why *.local.md does not deliver a
    // companion placed in one), so "tidying" this to a glob would silently
    // stop delivering the tree while still looking like a rule for it.
    const rules = worktreeIncludeRules(
      readFileSync(join(REPO_ROOT, '.worktreeinclude'), 'utf-8'),
    );
    expect(
      rules,
      'the exact rule measured to deliver the working-documentation tree into a '
        + 'worktree is no longer in .worktreeinclude. If it was REPLACED rather '
        + 'than deleted, the tree may still arrive and this message is wrong '
        + 'about that: measure the replacement in a fresh worktree before '
        + 'trusting it, because a file glob cannot reach inside a wholly-ignored '
        + 'directory and would look right while delivering nothing',
      // NOT a second hand-typed copy: the same string the gitignore pin uses, so
      // renaming the tree cannot leave this assertion green against a stale
      // literal while the ignore probe fails elsewhere, splitting one failure
      // into two that look unrelated.
    ).toContain(MEASURED_WORKTREE_RULE);
  });
});

describe('the build\'s published content is not swallowed', () => {
  // A THIRD describe, and the boundary matters for triage rather than tidiness.
  // These two are the PUBLICATION guards: they fail when a .gitignore rule has
  // widened and is eating content the build serves. An earlier attempt to split
  // the worktree-delivery assertion out of the private-trees block moved the
  // boundary without checking what fell inside it, so both of these ended up
  // under '.worktreeinclude delivers what a worktree needs', whose own comment
  // tells a triaging reviewer that a red run there carries no publication risk.
  // That is the exact inversion the split was made to prevent, pointed the other
  // way: the heading was reassuring about the one failure here that is not.

  it('derives a publishable set that is non-empty, complete and real', async () => {
    const publishable = await mustStayPublishable();

    // WHY THIS EXISTS: everything below is derived, and an empty list would pass
    // asserting nothing, because `check-ignore --stdin` on no input exits 1 with
    // empty stdout, which is the passing case.
    //
    // It used to be a hand-typed `> 50` under a comment claiming "the numbers
    // are deliberately not written down". Both halves were wrong: the number was
    // written down, and it had roughly fifteen of slack, so dropping Datasets/
    // (13 pages) still passed it. Derived instead, from the two enumerations
    // themselves, so it cannot go stale as the corpus grows.
    const fromLlmsFull = await llmsFull();
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
      expect(publishable, `${f} reached the union from llms-full and was lost`).toContain(f);
    }
    for (const f of fromLoader) {
      expect(publishable, `${f} reached the union from the docs loader and was lost`).toContain(f);
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
    const GUARDED_DIRS = ['Datasets', 'ResearchAreas', 'Methods', 'Primers'];
    for (const dir of GUARDED_DIRS) {
      expect(
        publishable.some((p) => p.startsWith(`${dir}/`)),
        `${dir}/ contributes nothing to the publishable set, so a rule `
          + `swallowing it would go unnoticed`,
      ).toBe(true);
    }

    // AND THE OTHER DIRECTION, which the fixed list cannot give on its own.
    // The union spreads CANONICAL_SOURCES.files and never CANONICAL_SOURCES
    // .dirs, so the loader's directory half reaches this set only by way of
    // llmsFullSources' own dirMarkdown calls. Add a directory to the loader
    // (which is what Methods/CLAUDE.md tells you to do for a new canonical
    // directory) without adding a matching dirMarkdown line, and not one of its
    // pages enters the publishable set: the fixed list above does not mention
    // it, so nothing goes red, and a .gitignore rule swallowing the whole
    // directory would delete every one of those routes from the site with the
    // suite green.
    //
    // Asserting the fixed list COVERS the loader's dirs closes that without
    // deriving it from them, so removal is still caught by the list being
    // fixed and addition is now caught here.
    // EVERY ENTRY EXISTS ON DISK. Without this the set can rot silently: rename
    // Community.md, or typo one in canonical-sources.ts, and the loader's
    // idForSourcePath lookup returns undefined and `continue`s, the build emits
    // only a warning, and `git check-ignore` answers perfectly happily about a
    // pathname that is not there and reports no match. So the over-match guard
    // goes green while the entry it was supposed to protect has stopped
    // referring to anything. The file's whole argument is derive rather than
    // type, and the directory loop below covers directories only.
    for (const f of publishable) {
      expect(
        existsSync(join(REPO_ROOT, f)),
        `${f} is in the publishable set but does not exist on disk, so the `
          + `over-match check silently guards nothing for it. Either it was `
          + `renamed and an enumeration still names the old path, or it was `
          + `deleted and should leave the enumeration too`,
      ).toBe(true);
    }

    // AND THE OTHER SOURCE. GUARDED_DIRS was reconciled against the loader's
    // dirs only, so a directory reaching the union through llmsFullSources'
    // own dirMarkdown calls, and not through the loader, entered the set with no
    // membership assertion at all. Derived from what actually arrived rather
    // than from a second hand-typed list.
    const dirsInUnion = [...new Set(
      publishable.filter((f) => f.includes('/')).map((f) => f.split('/')[0]),
    )].filter((d) => !d.endsWith('.md') && !d.endsWith('.mdx') && d !== 'site');
    for (const dir of dirsInUnion) {
      expect(
        GUARDED_DIRS,
        `${dir}/ contributes pages to the publishable set but nothing asserts it `
          + `contributes any, so a rule swallowing the whole directory would be `
          + `caught only incidentally. Add it to GUARDED_DIRS`,
      ).toContain(dir);
    }

    for (const dir of CANONICAL_SOURCES.dirs) {
      expect(
        GUARDED_DIRS,
        `${dir}/ is a canonical directory in the docs loader but nothing here `
          + `guards it. Add it to GUARDED_DIRS, and add a dirMarkdown call for `
          + `it in llmsFullSources, or its pages are in no enumeration at all`,
      ).toContain(dir);
    }

    // NO no-duplicates assertion here, deliberately. The publishable set is
    // built by spreading a Set, so `new Set(x).size === x.length` holds for
    // every possible input including one where both enumerations collapsed to
    // a single element. It read as load-bearing and could never fail. The two
    // enumerations genuinely do overlap (five files are in both), so the Set is
    // doing real work; asserting the result of it is asserting nothing.
  });

  it('does not over-match and swallow anything the build publishes', async () => {
    // ONE process for the whole set, not one per path: check-ignore reads a
    // batch on --stdin and prints a line only for paths that MATCHED, so
    // silence is the passing case.
    const res = spawnSync('git', ['check-ignore', '--no-index', '-v', '--stdin'], {
      cwd: REPO_ROOT,
      input: (await mustStayPublishable()).join('\n'),
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
    // EVERY MATCHED LINE MUST PARSE, asserted before anything is read out of it.
    // patternOf returns '' for a line it cannot read and '' does not start with
    // '!', so an unparseable line would be filtered as a positive, non-negated
    // match: the one reading that lets a swallowed path through unnoticed.
    const unreadable = matched.filter((l) => !isCheckIgnoreLine(l));
    expect(
      unreadable,
      'git check-ignore printed lines this parser cannot read, so the negation '
        + 'filter above could not have been applied to them. Treat the whole run '
        + 'as unreliable rather than as a pass',
    ).toEqual([]);

    // ONE pass, so the halves are complementary by construction. Two filters,
    // one negated, is how the second-copy divergence this file spent four
    // commits closing began: the predicate changes in one and not the other.
    const fromRepo: string[] = [];
    const fromElsewhere: string[] = [];
    for (const l of matched) (isInRepoGitignore(l) ? fromRepo : fromElsewhere).push(l);

    // SOFT, so BOTH report. A hard expect on the first throws and the second
    // never runs, which is the failure this file's probe loop was written as
    // one `it` per probe to avoid: a reviewer fixes the repo rule, re-runs, and
    // only then discovers their local config was hiding something too. The two
    // conditions are independent and can hold at once.
    expect.soft(
      fromRepo,
      'a rule in this repo\'s .gitignore has been widened and is now swallowing '
        + 'content the build publishes, which disappears from llms-full.txt and '
        + 'the homepage counts with everything else green',
    ).toEqual([]);

    expect.soft(
      fromElsewhere,
      'these published paths are ignored by a rule OUTSIDE this repo (a personal '
        + 'core.excludesFile or .git/info/exclude). Nothing is wrong with the '
        + 'repo; your local git config is hiding published content from you',
    ).toEqual([]);
  });
});
