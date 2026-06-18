---
name: caail-pr-wrapup
description: Use when a finished, reviewed, locally-green CAAIL feature branch is ready to ship — push it, open a PR to main, watch CI, merge (after confirming), watch the GitHub Pages deploy to green, verify the live site, and clean up the worktree/branch. Invoke whenever the user says to ship / wrap up / finish / "open a PR and merge" / "merge and deploy" a branch, asks to watch the deploy, or asks to clean up a worktree after merge — even if they don't name the skill. The CAAIL realization of the "Finish & Ship" stage.
---

# CAAIL PR wrap-up

## Overview

This is the **Ship stage** for CAAIL: it takes a feature branch whose work is done, committed, and
locally green, and lands it on `main` and the live site — push → PR → checks → merge → GitHub Pages
deploy → verify → clean up. CAAIL deploys only on push to `main` (via `.github/workflows/docs.yml`,
which gates on Lighthouse), so "shipped" means *merged **and** the deploy is green*, not just merged.

The brittle, repeatable machinery lives in **`ship-pr.sh`** (in this skill's directory): pushing,
opening the PR, watching checks, merging with the known worktree gotcha handled, finding + watching
the deploy run, and curling the live routes. This manual keeps the judgment with you: re-running the
local gate, composing the PR body, **pausing to confirm before the merge** (it triggers a public
deploy) and before deleting a hand-made worktree, and the worktree cleanup itself.

This is a **skill, not an agent**, on purpose: it *acts* (push/merge/deploy), and the cleanup uses
`ExitWorktree`, which only works in the main session — a subagent can't switch the parent session's
directory. Run the phases below in order, in the main session, pausing where noted.

Run the helper from the repo (worktree) root: `bash .claude/skills/caail-pr-wrapup/ship-pr.sh <sub>`.

## Preconditions (stop if any fail)

- **On a feature branch, never `main`.** Ideally a worktree created by `EnterWorktree` this session.
- **Working tree clean.** Commit or stash first.
- **The local gate is green.** Re-verify it now — don't ship on faith. With Node 22 (`source
  ~/.nvm/nvm.sh && nvm use 22`): `pnpm --dir site test`, and when the change touches `site/**` also
  `pnpm --dir site build` and `pnpm --dir site test:e2e` for the affected specs. A red gate means the
  branch isn't ready; fix it before shipping.
- **`gh` is authenticated** (`gh auth status`).

## Procedure

### 0. Pre-flight
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh preflight
```
This confirms the branch/tree/auth, lists the changed paths, and — from the real CI path filters —
predicts **whether `lint-papers` will run on the PR** and **whether `docs.yml` will deploy on merge**,
plus the routes worth verifying live. Read its output: it tells you what to expect in steps 3 and 5.
Then re-run the local gate (above) if you haven't this session.

### 1. Push
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh push
```

### 2. Open the PR
Compose the title and body yourself, then write the body to a temp file and open the PR:
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh open-pr "<title>" /tmp/pr-body.md
```
- **Title:** Conventional Commits, Angular flavor — `<type>(<scope>): <subject>`. CAAIL scopes:
  `papers`, `software`, `data`/`datasets`, `databases`, `resources`, `research-areas`, `site`, `docs`,
  `chore`, `fix`. Reuse the lead commit's subject when it already fits.
- **Body:** what changed and *why*; the research area(s)/AI method(s) or routes it touches; and the
  verification you already ran (tests/build/e2e, reviewer agents). **No AI attribution** — CAAIL
  commits and PRs never carry "Co-Authored-By: Claude" or "Generated with" lines.

### 3. Watch the checks
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh watch-checks <pr>
```
Per the CI table below, `lint-papers` runs only when the diff touches content/parser paths; the deploy
is **post-merge**, so a `site/`-config-only or `.claude/`-only PR legitimately has **no checks** (the
helper reports that and proceeds). If a check **fails**, stop — surface it and fix the branch; do not
merge red.

### 4. Confirm, then merge
**Pause here.** Merging triggers the public deploy, so confirm with the user before proceeding (unless
they've already said to merge autonomously this run). Then:
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh merge <pr>
```
This merges with a merge commit, deletes the remote branch, tolerates the benign "main already checked
out" gotcha (see below), verifies the PR is actually `MERGED`, and prints the **merge commit SHA** you
need for step 5.

### 5. Watch the deploy
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh watch-deploy <merge-sha>
```
This finds the `docs.yml` run for that SHA and blocks until it finishes. Green = build + **Lighthouse
gate** (accessibility ≥0.90 on landing + explorer; performance ≥0.90 on landing) + Deploy to Pages all
passed — *that* is a successful ship. If preflight predicted no deploy (the diff touched no deploy
paths), the helper says so and returns cleanly. **If Lighthouse fails, stop** — read the lhci report
and fix the regression; do not re-run blindly hoping it passes.

### 6. Verify live
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh verify-live <route> [<route> ...]   # '' = homepage
```
Use the routes preflight suggested. Beyond the 200 check the helper does, add a content assertion for
what you changed — e.g. `curl -s <url> | grep` for a new heading, the corrected link target, or the
absence of a stale `./X.md` link — so you confirm the *content* shipped, not just that the page exists.

### 7. Clean up
- **Fast-forward local `main`** so the primary checkout matches the deploy:
  `git fetch origin main && git merge --ff-only origin/main` (run it in the primary checkout; you can't
  fast-forward `main` while a worktree holds another branch).
- **This session's managed worktree** (made by `EnterWorktree`): call `ExitWorktree` with
  `action: "remove"` and `discard_changes: true` — safe because the commits are now on `origin/main`.
  It removes the worktree + branch and returns the session to the primary checkout.
- **A plain branch** (no worktree): `git branch -d <branch>` (use `-D` if it was squashed/cherry-picked
  so the SHA differs from what landed).
- **A stale/superseded worktree someone made by hand** (e.g. a predecessor of this work): **confirm
  with the user first**, then `git worktree remove <path>` and `git branch -D <branch>`.
- **Stop any background preview server** still holding `:4321`.

## CI: what runs when

Derived from `.github/workflows/`. Know this so step 3/5 expectations are right (the helper computes it
for you in preflight, but the source of truth is here):

| Workflow | Trigger | Paths |
| --- | --- | --- |
| `lint-papers.yml` | **pull_request** + push to main | `Papers.md`, `Software.md`, `Databases.md`, `OtherResources.md`, `Datasets/**`, `site/scripts/parser/**` |
| `docs.yml` (build + Lighthouse + deploy) | **push to `main` only** | `site/**`, root `*.md`, `ResearchAreas/**`, `Datasets/**` |

Consequences: a PR that touches only `site/` config (e.g. `astro.config.mjs`) or only `.claude/` has
**no PR checks**. The deploy's `*.md` glob is **root-only**, so a `Primers/**`-only change neither lints
nor deploys — preflight will say "no deploy expected", which is correct, not a bug.

## Gotchas

| Symptom / situation | What it means / do |
| --- | --- |
| `gh pr merge` errors `fatal: 'main' is already checked out at …` | **Benign.** gh's post-merge *local* branch step fails because the primary checkout holds `main`; the **remote merge already succeeded**. The helper verifies `state==MERGED` and API-deletes the remote branch. Trust `MERGED`, not gh's exit code. |
| Deploy run fails on **Lighthouse** | A11y/perf regression on landing or explorer. **Hard stop** — read the lhci output, fix it, ship again. Never blind-retry. |
| `lhci` reports a bogus ~0.5 perf score | A stale `astro dev`/preview is holding `:4321`; lhci silently measured it. Free the port (`lsof -ti:4321 | xargs kill`). Only relevant if running Lighthouse locally; CI runners are fresh. |
| Any site command (build/test/lighthouse) | Needs **Node ≥ 22.12**: `source ~/.nvm/nvm.sh && nvm use 22` first; the system default may be older. |
| PR body / commit | **No AI attribution** anywhere in CAAIL git history. |
| Worktree cleanup | Managed (`EnterWorktree`) → `ExitWorktree` remove. Plain branch → `git branch -d/-D`. Hand-made stale worktree → confirm, then `git worktree remove` + `git branch -D`. |

## `ship-pr.sh` reference

| Subcommand | Effect | Mutates? |
| --- | --- | --- |
| `preflight` | branch/tree/auth checks + CI prediction + route hints | no |
| `push` | `git push -u origin <branch>` | yes |
| `open-pr <title> <body-file>` | `gh pr create --base main`; prints PR url | yes |
| `watch-checks <pr>` | blocks on checks; 0 if none/clean, non-zero on failure | no |
| `merge <pr>` | merge + delete remote branch (gotcha-handled); prints merge SHA | yes |
| `watch-deploy <merge-sha>` | finds + watches the `docs.yml` run; 0 if no deploy fires | no |
| `verify-live <route>...` | curls each live route; non-zero if any ≠ 200 | no |
