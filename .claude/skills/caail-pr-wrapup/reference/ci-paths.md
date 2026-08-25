# CI: what runs when

**The workflows are the source of truth; the table below is a snapshot** (taken 2026-08-20) kept only
so step 5/7 expectations are legible without opening four YAML files. `preflight` computes its answer from the
`LINT_PAPERS_PATHS` / `TEST_PATHS` / `DOCS_PATHS` / `GUARDS_PATHS` lists in `ship-pr.sh`, which mirror the
YAML rather than being read from it. **Each is named for its workflow file** (`<stem uppercased, - to _>_PATHS`), and so is
its `matches_<stem>` wrapper — that coupling is what lets the check derive what to look for instead of
carrying its own list of workflows.

**Those lists are asserted against the YAML** by `check-ci-paths.py`, running in `guards.yml`. It also
checks that every pattern is a form `path_matches` can evaluate, that `pull_request` and `push` filters
agree **on the three workflows that have both** (`docs.yml` is push-only and exempt), and that canonical
content reaches both `test.yml` and `docs.yml`. So the predictors can no longer drift unnoticed, which
they did three times. **This prose table has no such guard** — if it disagrees with the YAML, the YAML
wins and the table is the bug.

| Workflow | Trigger | Paths (snapshot) |
| --- | --- | --- |
| `lint-papers.yml` (matrix ↔ ref lint + `db:check`/`db:verify` + sync guards) | **pull_request** + push to main | `Papers.md`, `Software.md`, `Databases.md`, `OtherResources.md`, `Taxonomy.md`, `Datasets/**`, `CONTRIBUTING.md`, `CLAUDE.md`, `site/scripts/parser/**`, `site/scripts/db/**`, `site/db/**`, `site/public/api/**`, `site/public/setup.md`, `plugin/skills/**`, `skills/**`, `.claude/skills/matrix-classification-audit/**`, `plugin-contribute/**`, `.github/ISSUE_TEMPLATE/**` |
| `test.yml` (Worker config + vitest + Playwright/axe) | **pull_request** + push to main | `site/**`, `workers/**`, root `*.md`, `ResearchAreas/**`, `Methods/**`, `Datasets/**`, `Primers/**`, `.claude/hooks/**`, `.claude/settings.json`, `.github/ISSUE_TEMPLATE/**`, `.github/workflows/test.yml`, `CITATION.cff`, `plugin-contribute/**` |
| `guards.yml` (publish-provenance hook + CI-paths consistency) | **pull_request** + push to main | `.claude/hooks/**`, `.claude/settings.json`, `.claude/skills/caail-pr-wrapup/**`, `.github/workflows/**` |
| `docs.yml` (build + Lighthouse + deploy) | **push to `main` only** | `site/**`, root `*.md`, `ResearchAreas/**`, `Methods/**`, `Datasets/**`, `Primers/**`, `.github/ISSUE_TEMPLATE/**` |

Consequences: `test.yml` runs on almost any `site/**` or root-`*.md` PR, so most PRs have at least the
`test` check. A change confined to `.claude/` **rules or agents** still has no PR checks, and that is
correct because there is nothing to run. **Skills split both ways**, so do not generalise
either direction: `skills/**`, `plugin/skills/**` and `.claude/skills/matrix-classification-audit/**` are
in `lint-papers.yml` and `.claude/skills/caail-pr-wrapup/**` is in `guards.yml`, while the other four
`.claude/skills/*` directories (`caail-db-authoring`, `papers-dataset-audit`, `zotero-collection-scope`,
`zotero-to-caail-sync`) are in no filter and genuinely run nothing. `plugin-contribute/**` is in **both**
`lint-papers.yml` and `test.yml`, which is the one skill directory with a test of its own:
`contribute-form.test.ts` reads its `SKILL.md` as input, and `pnpm parse` aborts when that skill and the
issue templates disagree.

**The full check-free list, which lives here and nowhere else** (`SKILL.md` step 5 points at it rather
than restating it, because the enumeration has already been wrong in both directions once each):
`.claude/` rules and agents, the four unfiltered `.claude/skills/*` directories named above,
`LICENSE`, `.zenodo.json`, and two of the three plugin manifests
(`.claude-plugin/marketplace.json` and `plugin/.claude-plugin/plugin.json`; only `plugin/skills/**` is
filtered, not `plugin/**`). The third, `plugin-contribute/.claude-plugin/plugin.json`, is **not**
check-free: `plugin-contribute/**` is filtered whole, so everything under it runs checks.
**`.gitignore` is NOT check-free**, and was listed here as though it were. It and
`.worktreeinclude` (which this list never claimed) are both in `test.yml`'s two path filters and
in `ship-pr.sh`'s `TEST_PATHS`, so a `.gitignore`-only PR runs the full vitest and Playwright
suites. They earn that: `site/scripts/private-paths.test.ts` and `canonical-files.test.ts` both
assert against them and would otherwise be unreachable from CI on the one edit most likely to
break them. `docs/**` is still genuinely check-free and is omitted above only because the
directory no longer exists; recreate it and this list needs the entry back. On what `preflight` reads, see the lede above; on how current it
is, the paragraph after it, on `check-ci-paths.py`. Neither is restated here. When a check you expected is missing, open the workflow. `.claude/hooks/**` and
`.claude/settings.json` trigger **both** `test.yml` and `guards.yml`, because the two hooks are tested
in different places (`check-public-publish.test.py` in `guards.yml`, `block-generated-edits.py` via
`site/scripts/db/hook.test.ts` in the vitest suite). Editing this skill or **any** workflow triggers
`guards.yml` alone — deliberately, so a prose tweak here does not spend an Astro build, a Playwright
browser install and the axe suite.

**Two paths gaps were fixed on 2026-08-12 and the class is worth remembering**, since `'*.md'` is
ROOT-ONLY in GitHub Actions and every nested canonical directory has to be named: `Taxonomy.md` was in
neither `lint-papers.yml` filter, and `Primers/**` was missing from `docs.yml`, so a Primers-only change
linted, tested, merged and never reached a reader. Both failed silently and in the same direction: the
guard existed, the trigger did not.

`check-ci-paths.py`'s canonical-content assertion now covers that second class specifically, and it was
demonstrated catching it (removing `Primers/**` from `docs.yml` reproduces the original bug and fails
the check). What it does **not** know is when a *new* canonical directory is added: `CONTENT_PATHS` in
that script is the hand-maintained list of what counts as canonical content, so adding a directory means
adding it there too, or the guard will happily confirm that an incomplete set is complete.

