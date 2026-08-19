---
name: caail-pr-wrapup
description: Use when a finished, locally-green CAAIL feature branch is ready to ship — run the multi-round code review, push it, open a PR to main, watch CI, merge (after confirming), watch the GitHub Pages deploy to green, verify the live site, clean up the worktree/branch, and close out the GitHub issue + Jira ticket. Invoke whenever the user says to ship / wrap up / finish / "open a PR and merge" / "merge and deploy" a branch, asks to watch the deploy, asks to clean up a worktree after merge, or asks to close the ticket for shipped work — even if they don't name the skill. The CAAIL realization of the "Finish & Ship" stage.
---

# CAAIL PR wrap-up

## Overview

This is the **Ship stage** for CAAIL: it takes a feature branch whose work is done, committed, and
locally green, and lands it on `main` and the live site — review rounds → push → PR → cross-model
second angle → checks → merge → GitHub Pages deploy → verify → clean up → close the trackers. CAAIL
deploys only on push to `main` (via `.github/workflows/docs.yml`, which gates on Lighthouse), so
"shipped" means *merged **and** the deploy is green*, not just merged.

**Review here is a phase, not a step.** Step 1 runs `/code-review high`, applies or triages the findings,
and then **reviews again on the updated diff**, repeating until **one of** the stop rule's two endings is
reached. The level is fixed; the depth comes from the number of rounds, and `reference/review-phase.md`
is where that floor is set out in full. The one part
restated below is its default, that a diff matching no row is a 2, and it is restated because an agent that
reads only this file still has to get that right; every other part of the rule lives there alone. The reasoning, and the condition under which the extra
rounds can come back down, is there too. The cross-model pass (step 4) stays, as a cheap extra angle
rather than the safety gate.

**Step 1 usually does not run unattended.** It carries two *kinds* of `AskUserQuestion` pause, not two pauses, and
a run whose floor rounds come back quiet, surface no pre-existing findings *and* change nothing in the
diff fires neither and finishes without asking anything. All three matter, because **"quiet" is condition
2 alone**: a round that found a defect and fixed it is quiet while condition 3 is unmet, and a quiet round
that surfaced a pre-existing finding still fires the scope gate. Either gate can fire more than once and
neither is a budget of one, and each fires only on its own condition rather than on every round, so read
the gates rather than this sentence for when. They are the only two decisions
in the phase that belong to the maintainer rather than to the agent: whether to keep reviewing once the
floor is met (the **stop gate**) and whether a finding this diff did not cause belongs in the PR at all
(the **scope gate**). Both are prose in a phase with no mechanism, so they are worth exactly the reading
of them and no more; `reference/ship-pr-reference.md`'s opening note, that step 1 has no subcommand and
nothing in CI enforces it, says why that matters.

**The two fire at different moments, and collapsing them defeats one of them.** The **scope gate** runs at
every round's triage, *including rounds below the floor*, because a finding's disposition is decided the
moment the finding exists. The **stop gate** runs only once the floor is met, and never below it. So
"rounds 1..floor run unprompted" is true of the stop gate alone, and reading it as covering both hands the
agent back the scope decision the scope gate exists to take away from it.

The brittle, repeatable machinery lives in **`ship-pr.sh`** (in this skill's directory): pushing,
opening the PR, watching checks, merging with the known worktree gotcha handled, finding + watching
the deploy run, and curling the live routes. This manual keeps the judgment with you: re-running the
local gate, **the review rounds and when they stop**, composing the PR body, **pausing to confirm
before the merge** (it triggers a public deploy) and before deleting a hand-made worktree, the worktree
cleanup itself, and closing the trackers once the deploy is actually green.

This is a **skill, not an agent**, on purpose: it *acts* (push/merge/deploy), and the cleanup uses
`ExitWorktree`, which only works in the main session — a subagent can't switch the parent session's
directory. Run the phases below in order, in the main session, pausing where noted.

Run the helper from the repo (worktree) root: `bash .claude/skills/caail-pr-wrapup/ship-pr.sh <sub>`.

## Preconditions (stop if any fail)

- **On a feature branch, never `main`.** Ideally a worktree created by `EnterWorktree` this session.
- **Working tree clean.** Commit first. Stashing is fine for unrelated work in progress, but never for a
  review fix: it clears the check while leaving the fix out of the diff (`reference/review-phase.md`, and
  the matching row in `reference/gotchas.md`).
- **The local gate is green.** Re-verify it now — don't ship on faith. With Node 22 (`source
  ~/.nvm/nvm.sh && nvm use 22`): `pnpm --dir site test`, and when the change touches `site/**` also
  `pnpm --dir site build` and `pnpm --dir site test:e2e` for the affected specs. A red gate means the
  branch isn't ready; fix it before shipping.
- **`gh` is authenticated** (`gh auth status`).
- **If the branch touches `workers/**` at all, deploy the Worker by hand before step 2**:
  `pnpm --dir workers/events run deploy`. No workflow deploys it, so shipping the code does not ship the
  change, and a push publishes a commit message describing behaviour that is not live yet. Check this
  against the whole branch, not just what the review rounds edited: the re-gate table in `reference/review-phase.md` only covers
  files a *round* touched, so a branch whose original commits changed the Worker and whose rounds did not
  would otherwise never be reminded.
- **The PR body is publishable.** `caail` is a **public** repo, so the body, every commit message,
  and the branch name become world-readable, and unlike issues a **PR cannot be deleted**. Before
  composing the body, confirm every quoted path, code block and architectural detail originates in
  *this* repo — anything read from a private repo or a third party's source is not publishable, and
  paraphrase discloses as much as a quote. Nothing may describe an unpatched weakness in a live
  service; that goes to its owner privately. Full rule: **`.claude/rules/publishing.md`** (in this repo).
  **Do not expect the hook to catch it on this path.** `.claude/hooks/check-public-publish.sh` is
  registered in the committed `.claude/settings.json` and does protect anyone who clones this repo, but it
  is a PreToolUse *Bash* hook whose tripwire is anchored to `gh pr create` at command position, and step 3
  opens the PR from **inside** `ship-pr.sh`. It therefore sees nothing here: no deny, and not even the
  visibility announce. On this path you are the only check, which is why `preflight` prints the
  destination's visibility by hand.
- *(optional)* For the step 4 cross-model review, the **Cross-Model Adversarial Reviewer** agent must be
  configured and whatever CLI it wraps must be authenticated. **Don't test for a particular binary, and
  never call one directly**: the agent owns which non-Claude backend it uses and enforces that the model is
  not a Claude one, so probing for a named CLI both mis-reports availability and invites bypassing that
  check. Ask the agent; if it reports itself unavailable or unauthenticated, surface exactly what it said
  and let the operator decide whether to ship without the pass. It's an optional extra angle, not a
  blocker, but the call is theirs (consistent with step 4 and `reference/gotchas.md`; the agent never skips it
  autonomously).

## Procedure

### 0. Pre-flight
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh preflight
```
This confirms the branch/tree/auth, lists the changed paths, and — from the real CI path filters —
predicts **which of `lint-papers`, `test` and `guards` will run on the PR** and **whether `docs.yml`
will deploy on merge**, plus the routes worth verifying live. It tells you what to expect in steps 5
and 7. The changed-path list it prints is also what step 1 reads to pick its floor on rounds. Then re-run
the local gate (above) if you haven't this session.

### 1. Review rounds

**Read [`reference/review-phase.md`](reference/review-phase.md) now and follow it.** It is the whole phase
and it is not optional; what follows here is orientation, not a substitute for it.

Four things that are true whatever the diff, so that skipping the file is visibly wrong rather than merely
undocumented:

- **The level is always `high`.** `/code-review high origin/main...HEAD`, level first, range named. Depth
  comes from the number of rounds, never from reaching for a deeper level.
- **There is a floor on rounds, set by blast radius**, and a diff matching no row is a 2, never a 1.
- **Two `AskUserQuestion` gates live in this phase**, so it may not run unattended: a **scope gate** each
  round for findings this diff did not cause, and a **stop gate** once the floor is met for whether to keep
  reviewing. Neither is an agent's decision to take.
- **Severity is the maintainer's to weigh, never yours to act on.** Findings are graded and shown at the stop
  gate; nothing in the phase withholds an option or forces a round on the strength of a grade.

### 2. Push
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh push
```

### 3. Open the PR
Compose the title and body yourself, then write the body to a temp file and open the PR:
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh open-pr "<title>" /tmp/pr-body.md
```
- **Title:** Conventional Commits, Angular flavor — `<type>(<scope>): <subject>`. CAAIL scopes:
  `papers`, `software`, `data`/`datasets`, `databases`, `resources`, `research-areas`, `site`, `docs`,
  `chore`, `fix`. Reuse the lead commit's subject when it already fits.
- **Body:** what changed and *why*; the research area(s)/AI method(s) or routes it touches; and the
  verification you already ran (tests/build/e2e, reviewer agents). Say **how the review went**: the
  level and how many rounds, and then **which of the stop rule's two endings this run reached**. For
  **ending 1**, say so by naming its three conditions, never as "a quiet round". For **ending 2**, say that
  the maintainer answered **"ship now"** at the stop gate, name everything left outstanding, and **if the last round changed the diff, say that those
  fixes were never reviewed and give the reason they gave**. That is the one ending that ships code no
  round has read, so a body that omits it is not merely thin, it is wrong. Write this here, because the
  body is composed here and step 6 checks for it: `ship-pr.sh` has no `edit` subcommand, and by step 6 the
  PR is already open. Findings routed to a ticket by
  the scope gate are named here too, by key. **The publishing carve-out binds here**, where the body is
  actually written, and it is defined once in the Definitions in `reference/review-phase.md`; for it alone,
  treat "declined" and "routed to a ticket" as one category. **Any** finding declined rather than fixed,
  in any round, gets named with its reason, since a reader cannot tell a triaged finding from an
  unnoticed one and the rounds it came from are invisible to them. **The exception is the publishing
  carve-out in the Definitions in `reference/review-phase.md`**, which governs its own scope; this body is world-readable and
  permanent, and publishing what that carve-out withholds would breach `.claude/rules/publishing.md`.
  **Nothing will stop you**, so decide before you write it: `check-public-publish.sh` is a PreToolUse
  *Bash* hook that matches `gh pr create` at command position, and step 3 runs `gh pr create` **inside**
  `ship-pr.sh`, where the hook cannot see it. On this path there is no deny and not even the visibility
  announce. The judgment is entirely yours. If
  the change added a guard, state that it was seen failing on the defect first (step 1). **No AI
  attribution** — CAAIL commits and PRs never carry "Co-Authored-By: Claude" or "Generated with" lines.
- **Link the trackers.** If this PR resolves a public GitHub issue, include a `Closes #N` line —
  GitHub then closes it on merge, so the close is declarative and can't be forgotten or fail after the
  merge is already irreversible. Name the Jira key (`CAAIL-NNN`) too, so the public record points back
  at the durable one. **The key only, never the ticket's contents** — the CAAIL project is private,
  and a `disclosure-private` ticket gets no quotation, paraphrase or summary in a public PR body
  (`.claude/rules/publishing.md`). If the work has no ticket on either tracker, that is a process
  miss worth saying out loud rather than inventing a reference.

### 4. Cross-model second angle (optional)
A cheap extra angle on the diff, and **not the safety gate**. Step 1 is the gate. The reason for the
demotion is in step 1's rationale: the reachable non-Claude models return few findings, and a thin report
from a weak reviewer is indistinguishable from a clean diff, so nothing load-bearing may rest on it. It
stays in the procedure because the decorrelation is real when it fires and the pass costs little, not
because it is what catches the misses.

Dispatch a cross-model adversarial reviewer agent on this PR's diff — on this maintainer's machine that
is a **user-global** agent, so it may simply not exist in a fresh clone. If no such agent is configured,
say so and move on; this step is optional by design and must never block a ship. Example dispatch:

> Adversarially review the diff for PR #`<pr>` in this repo (run `gh pr diff <pr>`, or
> `git diff origin/main...HEAD` from the worktree root). Return confirmed issues with file:line and a net
> recommendation.

The agent runs its own non-Claude backend read-only through its wrapper script, **verifies every finding
against the actual source** (that backend's output is untrusted, so the agent filters out its
hallucinations), and returns severity-ranked confirmed issues plus a **net
recommendation: ship / fix-first / needs-human-call**. Feed that into the step 6 merge confirmation:
- **ship** → proceed, but read it as "this reviewer found nothing", not as a clean bill of health. It is
  the weaker of the two reviewers, and a thin report is its normal output whether or not the diff is
  sound. Step 1's ending, whichever of the two it was, is what "reviewed" rests on.
- **fix-first** (confirmed correctness/security issues) → stop and fix them, in this order:

  1. **Re-gate the fixes before pushing.** They are ungated code exactly as a review round's are, so run
     the re-gate table in `reference/review-phase.md` for whatever they touched and commit what it
     regenerates. **Read that table's timings relative to the push you are about to make, not to step 2**,
     which is already behind you: a `workers/**` fix has to be deployed by hand *now*, because no workflow
     deploys the Worker and the table's "before step 2" wording is unreachable from here. Nothing
     downstream catches any of this. `preflight`'s dirty-tree guard ran before step 2, and a fix under
     `site/src/lib/**` changes what the parser emits into `site/public/api/**` while `lint-papers.yml`'s
     API sync guard does not fire on `site/src/**`, so a stale endpoint would ship with every check green.
  2. **Commit and push.** This updates the open PR.
  3. **Re-check the floor**, because a fix-first fix is exactly the kind that widens the shape: one
     touching `site/src/**` or a hook turns a prose PR into a 3-round diff. **If the re-checked floor is no
     longer met, run the remaining floor rounds and do not ask**, since the stop gate may never fire below
     the floor. Otherwise the gate fires as usual (the fixes changed the diff, so condition 3 is unmet) and
     the maintainer may answer "ship now" there and end the run without a further round.
  4. **Any fix those rounds produce goes back through items 1 and 2**, re-gated, committed and pushed,
     before you go anywhere near step 5. Nothing downstream will catch it if you don't: `preflight` and
     `push` are both behind you, and `merge` checks only that local `HEAD` matches the PR head, never that
     the tree is clean, so an uncommitted fix from a step-4 round merges silently. That is exactly the
     "PR that looks right and is missing the fix" case `reference/ship-pr-reference.md` says nothing
     downstream can detect.
  5. **Amend the PR body with `gh pr edit`, whichever way the floor re-check went.** The body was composed
     back at step 3 of this skill and can no longer be right: a further round can change how the review
     ended, and a "ship now" here makes this an ending 2 on a PR whose body still claims ending 1. Step 6
     checks ending 2's disclosure against that body, so leaving it unamended either fails a check that
     should pass or passes one that should fail. This is the only place the body is written after the PR
     exists, and `ship-pr.sh` has no subcommand for it, which is why the command is named.

  Don't merge over confirmed real findings.

  **And note the hook property here is the inverse of step 3's.** `gh pr edit` is run by you, at command
  position, so `check-public-publish.sh` *does* see it, unlike the `gh pr create` inside `ship-pr.sh` that
  step 3 says nothing will stop. A fix-first is defined here as confirmed correctness or **security**
  issues, so an amended body describing them is a likely denial on the security vocabulary or a fenced
  code block. That is the guard working. Answer its three questions and rewrite the body so it says what
  changed without describing an unpatched weakness in a live service; reaching for the single-use override
  because the amend is inconvenient is the one response that is always wrong.
- **needs-human-call** → surface the report and let the user decide.

*When to run:* most valuable for **code** diffs (`site/**`). For docs-/config-/`.claude`-only diffs the
code review adds little — either run it in the agent's **design/prose** mode (it still catches logical
gaps in a procedure doc or prose page) or skip it with a one-line reason. The agent guards against piping
secrets into its backend. If it reports an **expired or missing credential** (it can't re-auth headlessly),
pass along what it reported and let the operator decide whether to ship without the cross-model pass: an
unavailable *optional* reviewer must not hard-block the whole ship.

### 5. Watch the checks
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh watch-checks <pr>
```
Per `reference/ci-paths.md`, `lint-papers` runs only when the diff touches content/parser paths, and the
deploy is **post-merge**, so not every PR has every check. A PR with **no checks at all** is now a
narrow case: `guards.yml` fires on `.claude/hooks/**`, `.claude/settings.json`, this skill, and **any**
`.github/workflows/**` edit. **The check-free paths are enumerated once, in `reference/ci-paths.md`, and deliberately not repeated
here.** That list has already been wrong in both directions once each, so a second copy in this file is
the exact hand-typed-fact-beside-another defect the enumeration keeps causing. `preflight` computes the
real answer from the YAML, and the YAML wins over both.

The helper reports "no checks reported" and proceeds when that is genuinely the case. **If you expected
a guard to run and it did not, and the diff is not in that list, treat it as a paths-filter gap rather
than expected quiet**: that is the exact failure `reference/ci-paths.md` documents twice over.

If a check **fails**, stop — surface it and fix the branch; do not merge red.

### 6. Confirm, then merge
**Pause here.** Merging triggers the public deploy, so confirm with the user before proceeding (unless
they've already said to merge autonomously this run). Weigh **three** inputs, in this order of weight:
step 1's review rounds must have genuinely reached an ending, which means **checking ending 1's three
conditions** rather than accepting the label: "it ended" is not evidence, since every run ends somehow.
**For either ending**, the body names every finding that was ticketed or declined along the way, since the
Definitions say both endings disclose all of it and a reader cannot tell an unmentioned finding from an
unnoticed one. **For ending 2** additionally, the findings left outstanding are exactly the ones the body
names and no others, and if the last round changed the diff the body also says those fixes went
unreviewed. **The exception is the publishing
carve-out in the Definitions in `reference/review-phase.md`**, so a finding it withholds satisfies this check by being
disclosed as a `disclosure-private` triage without the weakness or the endpoint named, rather than by
being absent. An outstanding finding that appears nowhere at all fails this check like any other; the
carve-out withholds the details, never the fact that something was triaged. Do not "fix" a failing check here by naming it; that publishes the weakness in a PR that
cannot be deleted. CI must be green (step 5); and the step 4 cross-model pass must not have left unresolved confirmed issues
(a "fix-first"). **A "ship now" answer is not itself an autonomous-merge waiver**: it authorised ending
the review, not merging unasked, so it alone never substitutes for the confirmation above, though a waiver
the user granted separately still stands. A green CI plus a thin cross-model report is **not** a substitute
for the first of those:
neither of them reads the diff the way step 1 does. Then:
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh merge <pr>
```
This merges with a merge commit, deletes the remote branch, tolerates the benign "main already checked
out" gotcha (see `reference/gotchas.md`), verifies the PR is actually `MERGED`, and prints the **merge
commit SHA** you
need for step 7.

### 7. Watch the deploy
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh watch-deploy <merge-sha>
```
This finds the `docs.yml` run for that SHA and blocks until it finishes. Green = build + Lighthouse gate +
Deploy to Pages all passed, and *that* is a successful ship. If preflight predicted no deploy (the diff
touched no deploy paths), the helper says so and returns cleanly.

**Which Lighthouse categories block is deliberately not written here.** `CLAUDE.md` carries that sentence,
`site/scripts/lighthouse-gate.ts` generates it from `site/lighthouserc.json`, and a test asserts it
verbatim, so it cannot drift; a second hand-typed copy can, and this one did, calling performance blocking
when it has been warn-level since `e627e97` and scoping it to the landing page when the assertion matches
every collected URL. Read `CLAUDE.md`'s sentence, or run the generator. **If a *blocking* category fails,
stop**: read the lhci report and fix the regression rather than re-running and hoping.

### 8. Verify live
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh verify-live <route> [<route> ...]   # '' = homepage
```
Use the routes preflight suggested. Beyond the 200 check the helper does, add a content assertion for
what you changed — e.g. `curl -s <url> | grep` for a new heading, the corrected link target, or the
absence of a stale `./X.md` link — so you confirm the *content* shipped, not just that the page exists.

### 9. Clean up
**Check where you are first — `git branch --show-current`.** If step 6 took gh's succeeding path it
already moved you to `main` and deleted the branch, so the first two items below are done and
re-running them reports confusing errors rather than doing anything (see `reference/gotchas.md`).

- **Fast-forward local `main`** so the primary checkout matches the deploy:
  `git fetch origin main && git merge --ff-only origin/main` (run it in the primary checkout; you can't
  fast-forward `main` while a worktree holds another branch). When `main` isn't checked out anywhere,
  `git fetch origin main:main` updates the ref without switching to it.
- **This session's managed worktree** (made by `EnterWorktree`): call `ExitWorktree` with
  `action: "remove"` and `discard_changes: true` — safe because the commits are now on `origin/main`.
  It removes the worktree + branch and returns the session to the primary checkout.
- **A plain branch** (no worktree): `git branch -d <branch>` (use `-D` if it was squashed/cherry-picked
  so the SHA differs from what landed).
- **A stale/superseded worktree someone made by hand** (e.g. a predecessor of this work): **confirm
  with the user first**, then `git worktree remove <path>` and `git branch -D <branch>`.
- **Stop every background preview server this work started, on whatever port it took.** Naming one port
  is not enough: `pnpm preview` is given a free port per run, so real leaks sit on 4370, 4399, 4402-4406
  and anywhere else, and one worktree was found holding five at once, days old, one per e2e attempt.
  `pgrep -f 'astro.mjs (preview|dev)'` finds them regardless of port. Match `dev` as well as `preview`: a
  leaked `astro dev` is what the bogus lhci score in `reference/gotchas.md` is usually blamed on, and a pattern that only says
  `preview` reports a clean machine while one is still holding the port. `ps` the PIDs to see which
  worktree each belongs to before killing anything, since a peer session may have one mid-run.

### 10. Close the loop on the trackers
Do this **last, after step 8 verified the live site** — not at merge time. CAAIL only counts as shipped
once the deploy is green, so a ticket moved to `Done` at merge is a lie whenever Lighthouse fails
afterwards. Both trackers, in this order:

- **GitHub.** The `Closes #N` line from step 3 already closed the issue on merge; confirm rather than
  assume, since a typo'd or missing line fails silently:
  ```bash
  gh issue view <N> --json number,state,stateReason
  ```
  If it's still `OPEN`, close it now with a comment naming the merge SHA — `gh issue close <N> --comment
  "Shipped in <sha>, live at <url>"`.
- **Jira.** `CAAIL` is the durable record and nothing else transitions it, so this step is the only
  thing standing between the board and a permanent backlog of finished work. The Rovo MCP was removed
  2026-08-18, so this goes through `acli`, which needs no cloud id: `acli jira workitem transition --key
  CAAIL-nn --status "Done" --yes`, then `acli jira workitem comment create --key CAAIL-nn --body "Shipped
  in <sha>, live at <url>"` — so the ticket records where the work landed. If the ticket is a `Task` under a `Workstream`, check whether it
  was the last open child; a Workstream whose children are all `Done` should be transitioned too.

Both calls happen **after** the irreversible part of the ship, so a failure here is bookkeeping, not a
broken deploy: report exactly which tracker is out of date and let the user fix it, rather than retrying
in a loop or unwinding anything. If the branch had no ticket on either tracker, say so plainly here —
that is the "Jira first, always" rule having been missed at the *start* of the work, and it is worth
naming so the next piece of work doesn't repeat it.

## Reference files

One level deep, read when the step that names them says to:

- [`reference/review-phase.md`](reference/review-phase.md) — step 1 in full: the definitions, the floor,
  the stop rule, both gates, the re-gate matrix, and the evidence for multiple rounds.
- [`reference/ci-paths.md`](reference/ci-paths.md) — which workflow fires on which paths, for steps 5 and 7.
- [`reference/gotchas.md`](reference/gotchas.md) — symptom to meaning, read when something looks wrong.
- [`reference/ship-pr-reference.md`](reference/ship-pr-reference.md) — the subcommand table and what is
  actually enforced in code.
