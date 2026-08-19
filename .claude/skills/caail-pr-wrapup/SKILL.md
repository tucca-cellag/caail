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
and then **reviews again on the updated diff**, repeating until the findings die out and the floor for
that diff shape is met. The level is fixed; the depth comes from the number of rounds, and step 1's table
is the only place that floor is written down. The reasoning, and the condition under which the extra
rounds can come back down, is there too. The cross-model pass (step 4) stays, as a cheap extra angle
rather than the safety gate.

**Step 1 is not unattended.** It carries two *kinds* of `AskUserQuestion` pause, not two pauses: the scope
gate can fire on any round, and the stop gate once the floor round has finished and before every round
after it, so a long run holds several of each
and neither is a budget of one (for the exact conditions, and when each is skipped, read the gates rather
than this sentence). They are the only two decisions
in the phase that belong to the maintainer rather than to the agent: whether to keep reviewing once the
floor is met (the **stop gate**) and whether a finding this diff did not cause belongs in the PR at all
(the **scope gate**). Both are prose in a phase with no mechanism, so they are worth exactly the reading
of them and no more; the closing note of the `ship-pr.sh` reference says why that matters.

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
  review fix: it clears the check while leaving the fix out of the diff (step 1, and the Gotchas row).
- **The local gate is green.** Re-verify it now — don't ship on faith. With Node 22 (`source
  ~/.nvm/nvm.sh && nvm use 22`): `pnpm --dir site test`, and when the change touches `site/**` also
  `pnpm --dir site build` and `pnpm --dir site test:e2e` for the affected specs. A red gate means the
  branch isn't ready; fix it before shipping.
- **`gh` is authenticated** (`gh auth status`).
- **If the branch touches `workers/**` at all, deploy the Worker by hand before step 2**:
  `pnpm --dir workers/events run deploy`. No workflow deploys it, so shipping the code does not ship the
  change, and a push publishes a commit message describing behaviour that is not live yet. Check this
  against the whole branch, not just what the review rounds edited: the gate table in step 1 only covers
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
  blocker, but the call is theirs (consistent with step 4 and the Gotchas row; the agent never skips it
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

**The level is always `high`.** Every round, every diff shape:

```
/code-review high origin/main...HEAD
```

(`main` here is this repo's default branch. `ship-pr.sh` derives that name rather than assuming it, so a
fork keeps working; if `preflight` printed a different `Default:`, use that name instead of copying this
line literally.)

Then apply or triage every finding and **run it again on the updated diff**, until the findings die out.
Do this before the push, so fixes land as ordinary commits instead of churn on an open PR.

**Depth comes from the number of rounds, not from the level.** That is a maintainer decision, and it is
what "scale with the diff" means in this skill: a presentational change and a parser change get the same
level and a different number of passes. **Do not reach for a deeper level; add a round instead.** `ultra`
is not an option from here in any case, being user-triggered and billed, so an agent cannot run it.

(This file names no level but `high`, and makes no claim about how the deeper ones behave. That is
deliberate: the review tool moves independently of this repo, and three rounds of review on this very
change gave three different accounts of one of those levels, including whether it exists. An unverifiable
claim about another tool's internals is the kind of fact that rots silently and is believed anyway. The
rule above rests on a maintainer decision, which needs no mechanism to be true.)

**The floor on rounds comes from blast radius.** When a diff spans shapes, the widest one wins, and CAAIL
PRs span shapes routinely. **A diff that matches no row is a 2, never a 1.** Two rounds is the floor for
anything, and a shape nobody thought to list is not evidence that a change is safe.

| Diff shape | Rounds floor |
| --- | --- |
| Prose only: `.claude/` rules, agents and skill manuals (including this file), `docs/**`, editorial prose in a canonical page | 2 |
| Structured catalog: the committed NDJSON, the curated `dois-*.json` / `licenses-manual.json` inputs, and the Markdown `db:emit` regenerates from them | 2 |
| Site code: anything under `site/src/**`, `site/e2e/**`, the parser, or `site/astro.config.mjs` (which carries the analytics beacon and its origin gate, and whose other half, the Worker, is a 3 in the row below) | 3 |
| Everything that regenerates published content or mints public ids: the DB tooling under `site/scripts/db/**` | 3 |
| Trust boundaries and guards: the Worker, the hooks, this skill's own scripts, the workflows | 3 |

**These globs are hand-typed and nothing checks them, so read them as a guide and not as an authority.**
`preflight` prints the changed-path list, which is the input you want, but it does **not** compute these
shapes: it answers which of four workflows fire, and a `site/src/**`-only diff and an editorial-prose-only
diff produce the identical `test: yes / docs: yes / lint-papers: no`. Nothing in its output separates the
3-round row from the 2-round row, so that mapping is yours to make. The machine-checked lists in
`ship-pr.sh` govern *which workflows run*, which is a different question from how much review a change
deserves; where the two disagree about a path, neither is wrong, they are answering different things. When
a diff sits on a boundary, take the deeper row.

`db:check` / `db:verify` output belongs *in* the review of a catalog change, not instead of it: those
assert referential integrity and round-tripping, which is a different question from whether the entry is
right.

**What each round has to do:**

- **Round 1 over the whole branch diff.** Name the range explicitly, and put the level **first**:
  `/code-review high origin/main...HEAD`. The level is read from the first argument only, so
  `/code-review origin/main...HEAD` silently reuses whatever level was last typed in any session, and the
  PR body then claims a level that never ran. The range matters too: nothing is pushed yet, so a default
  that resolves against an upstream has none, and the fallbacks land on either `main...HEAD` or a single
  commit, which reviews one commit of a multi-commit branch.
- **Apply or triage every finding, and default an out-of-scope one to a ticket.** Fixed, or declined with
  a stated reason. "Not acted on" and "not a defect" are different outcomes; only one is free.

  **The scope boundary is causation, not file identity.** A finding this diff *caused* is fixed here; a
  pre-existing one it merely *revealed* gets a ticket, and that is the default rather than the exception.
  Do not use "the files this session edited" as the test, because it is wrong in both directions: a fix in
  one file that breaks another **without editing it** was caused by this diff and belongs here (that is
  what round 2 is for, and the rationale block below records an a11y fix creating a different a11y
  regression on PR #185; whether that one crossed files is not recorded, so do not cite it as though it
  were),
  while a pre-existing bug you happened to read in a file you did edit does not. Causation is also what
  keeps this consistent with "check the surfaces the diff did not touch" below: a contradiction this
  change *introduced* one click away is in scope, one that was already there is not.

  **Scope gate.** When a round produces findings you have classified as pre-existing, do not act on that
  classification alone. **Write the triage first, then ask once.** List every pre-existing finding in the
  round's triage with the disposition you propose for it, then put that whole triage to the user as a
  single `AskUserQuestion` with two options: accept it, or adjust it. Their answer is the stated reason,
  recorded rather than assumed. **"Adjust it" is answered in the question's own free-text field**, and you
  then restate the corrected triage in the round's record and proceed. Do not re-prompt: a second question
  is how the option-per-finding machinery gets rebuilt, one question at a time. The one exception is an adjustment you genuinely cannot resolve, such as "ticket the first
  two" against a list with no stated order: that is a *different* question, so the guard does not reach it,
  and acting on a guessed reading is worse, because a misread disposition is silent. Ask once, narrowly.
  (Whether the prompt offers a free-text field at all is a property of the tool, **observed 2026-08-18**;
  check it rather than trusting this line, as with every other external-tool claim here.)

  Proposing before asking is what keeps this both cheap and honest. The maintainer sees every finding and
  its proposed fate together, instead of approving a label whose contents are disclosed afterwards, and
  the prompt stays two options wide however many findings a round produces. An earlier draft of this gate
  put one option per finding and needed a cap, a bundling rule, a meaning for the unselected ones and a
  resolution for contradictory submissions; four review rounds found defects in that machinery and none in
  the idea underneath it. Do not reintroduce it.

  **All three dispositions are available, and they are yours to propose.** The bullet above insists "not
  acted on" and "not a defect" are different outcomes, so a finding may be ticketed, declined with a
  reason, or fixed here. Declining is a disposition you write into the triage, not an extra button on a
  prompt.

  **Skip the prompt when it has nothing new to ask.** No out-of-scope finding this round, no prompt. A
  finding an earlier round already disposed of is not re-proposed either, whichever way it went: carry its
  disposition forward in the triage list the way a refuted candidate is carried. Ticketed findings carry
  their key, declined ones carry the reason. Without that, every later round re-finds the same
  pre-existing problem and re-asks the identical question, which is the fatigue `CAAIL-269`'s eight-round
  run illustrates.

  Every ticket goes to Jira: search the open board first, per `CLAUDE.md`, and a finding that names an
  unpatched weakness in a live service gets `disclosure-private` and no GitHub issue. **Budget for what
  filing costs, and check rather than assume.** On this maintainer's machine the duplicate guard denies
  each create once and re-enumerates the whole project first, injecting the entire backlog before it lets
  the create through, so four findings is four of those rather than one check covering the batch. Do not
  read that as a property of this repo. Unlike `check-public-publish.sh`, which *does* ship here through
  the committed `.claude/settings.json`, **that guard is
  user-global and not in this repo**, so a fresh clone has none of it, and it has been observed changing
  under a running session without any signal. The instruction is to know which of those you are on before
  a round produces several tickets, not to trust this sentence.

  For the same reason, **let the filing command's output come back rather than redirecting it to a file**.
  On this maintainer's machine a `PostToolUse` recorder reads that response to close Jira's
  read-after-write window, which is real (measured at 1 to 2 seconds) and matters most here, since a round
  files several *related* tickets back to back and relatedness is what makes a duplicate likely.
  Redirecting the output silently disables it. Like the guard above, that recorder is user-global and not
  in this repo, so check rather than assume.

  This codifies what already happens rather than inventing a rule. `CAAIL-79` and `CAAIL-82` were filed
  from a review of `feat/homepage-agent-sections` instead of being fixed in it, and `CAAIL-271` and
  `CAAIL-272` were recorded as residuals from a `/code-review high` over PR #204 and deliberately left
  out of it.
- **Commit the fixes before the next round starts.** Not at the end of the phase: `origin/main...HEAD` is
  a merge-base-to-commit range and **does not include the working tree**. Don't rely on the reviewer
  noticing uncommitted work and folding it in; whether it does is its business, and the range you handed it
  is the one thing you control. So an uncommitted fix risks leaving the next round reading the pre-fix
  code, where it either re-reports what you just fixed or calls the diff sound.
  Either way the defects the fixes *introduced* are invisible to it, which is the one thing the next round
  exists to find.
- **Round 2 over the whole diff again.** Not narrowed to the files round 1 touched: the point of round 2
  is the defects the *fixes* introduced, and a bad fix does not confine its damage to its own file.
- **Round 3 and beyond, until the findings die out.** Each round takes the previous round's triage list,
  so it stops re-deriving candidates an earlier round already refuted.

**When to stop.** All three conditions, not any one of them:

1. The **floor for the widest shape in the diff** has been reached, judged against the diff **as it stands
   now**, not as preflight found it at step 0. A fix can widen the shape and raise its own floor: a
   prose-only PR whose round-1 fix edits `site/src/**` is a 3-round diff from that moment on. Re-check the
   shape after each round's fixes land, since the mandated `preflight` re-run happens after the rounds have
   already stopped and is therefore too late to tell you.
2. The **last round returned no finding that was a defect this diff caused.** Deferring one of those to
   Jira does not satisfy this: "not acted on" and "not a defect" are different outcomes, and a round that
   surfaces three genuine defects and tickets all three has not gone quiet, it has gone unaddressed. A
   **pre-existing** defect, properly ticketed under the scope gate above, does **not** block a quiet
   round. That distinction is load-bearing rather than a nicety. Without it the scope gate makes this
   loop non-terminating, because rounds keep re-finding the same pre-existing problems and each ticketing
   keeps the sequence alive, and the symptom reads as a thorough reviewer rather than as a broken
   procedure. So do not "simplify" condition 2 back to "no defect in this diff" while the scope gate
   exists; the two were written together.
   **A diff-caused defect that was deferred rather than refuted stays outstanding**, and condition 2 is
   judged against that carried set rather than against one round's fresh output. Without that the set the
   stop gate reasons about and the set condition 2 tests are different things: a defect deferred in round
   3 and not re-derived in round 4 would make round 4 "quiet", end the run with no gate firing at all, and
   have the PR body report a quiet ending while known defects shipped unmentioned. Deferring is not
   refuting, and only refuting or fixing clears the set.
3. **Nothing in the diff was changed in response to that round.** Filing a ticket, declining a finding and
   updating the triage list are not changes to the diff and do not re-open the sequence; only an edit to
   the code under review does. Read any other way this condition never clears, since every round produces
   *some* response, which would reinstate the non-termination condition 2 was rewritten to rule out. A
   pre-existing finding the maintainer elects to fix
   here is still a fix no round has seen, so an adjustment at the scope gate electing that fix re-opens the
   sequence exactly as a diff-caused defect would. This condition is not redundant with 2, and dropping it recreates the
   failure the whole phase exists to prevent: a round whose findings were *all* pre-existing satisfies
   condition 2 by construction, so without this the run stops and ships fixes written in response to the
   last round, which is precisely what the "a finding's fix is itself unreviewed code" row forbids.
   **This changes what termination rests on, so do not try to re-derive it later.** Before condition 3 the
   sequence ended when the *diff* went quiet. It now ends when the *maintainer* stops electing fixes,
   which still terminates, because a person choosing to keep fixing is work rather than a loop. It is a
   different argument though, and this rule cannot be proved terminating from the diff alone. It is not
   meant to be.

An empty round does not shorten the floor; it only ends the sequence once the floor is already met **and
nothing is blocking**, since condition 2 is judged against the carried set and not against one round's
fresh output. So a prose diff whose round 1 is empty still gets round 2, and a site-code or guards diff
still gets three.

**Stop gate.** Once the floor is met, ask before every further round. **One question, always the same
shape, two options: run another round, or ship now.** It fires whenever the floor is met and the run would
otherwise continue, which is any state where condition 2 or condition 3 is unmet. It never fires below the
floor.

The question carries four things, and they are what make the answer mean anything:

- **Rounds run so far, against the floor for the diff's shape re-checked now.** Re-check rather than
  reuse: a fix can widen the shape and raise its own floor, and the state right after a fix landed is
  where that happens. If the re-checked floor is no longer met, do not ask at all, and run the remaining
  floor rounds.
- **Everything still outstanding, split into the two kinds that are not the same thing.** **Blocking**
  items are defects this diff caused that have been neither fixed nor refuted, *including any deferred to
  Jira*. **Disposed of** items are pre-existing findings ticketed or declined; they are shown because they
  are part of what the round did, and they do not stop the run. A diff-caused defect that was deferred is
  **blocking**, never disposed of: it is the one item that is both filed and unresolved, and showing it as
  settled at the moment someone chooses whether to ship is the worst place to lose it. Only blocking items
  bear on whether the sequence may end.
- **What has changed since you last asked**, including "nothing". Someone being asked a third time should
  be able to see that it is the same question.
- **Whether the last round changed the diff.** If it did, say that shipping now merges code no round has
  read, and that this file's own rationale block records **two of fourteen defects as introduced by fixes
  to earlier findings**, one an accessibility regression created by the fix for a different accessibility
  finding. Give the number rather than a caution about risk; the point of asking is that they are deciding
  against it.

**"Ship now" is always offerable and only a human may take it.** An agent never chooses it on the
maintainer's behalf, however small the outstanding fixes look. That is the safety property this section
rests on and it has no exceptions.

**So "never merge a fix that no round has seen" is overridable on the record rather than absolute.** That
is a deliberate change. As an absolute it makes the sequence unbounded by construction, since any fix
mandates a round and any round may find something needing a fix: five review rounds on this very change
never reached a stopping state, because a fix was made every round. The rule now binds the agent
absolutely and binds the maintainer only with disclosure.

**The sequence ends in exactly two ways**, and the PR body says which:

1. **A quiet round with nothing blocking.** No prompt is needed to stop, because there is nothing to
   decide. Pre-existing findings ticketed or declined along the way do not prevent this ending; if they
   did, any run that filed a single ticket could never reach either ending and would match no case at all.
2. **The maintainer answers "ship now".** The body names whatever was outstanding, and if the last round
   changed the diff it also says those fixes went unreviewed and gives the reason.

There is deliberately no rule ending the run on the agent's own judgement, and no cap on rounds. Asking is
cheap beside a whole-diff `/code-review high`, and a maintainer who wants ten rounds may have ten.
`CAAIL-269` records eight on PR #205.

**An earlier draft split this by which condition was unmet and gave "another round" a once-per-unchanged-set
budget.** It deadlocked on the commonest run: fixes made, outstanding set unchanged because everything was
fixed rather than deferred, budget spent, and the only offerable option the one an agent may not choose.
Two cases also meant two definitions of "outstanding" and a reachable state that matched neither. One
question with a full payload does the same work without any of it. Do not reintroduce the split.

**The stop gate does not exist below the floor, and must not be added there.** Rounds 1..floor run without
*it*; the scope gate still fires in them and should, so this paragraph is about the stop gate alone.
The floor's only enforcement is that it is written unconditionally: step 1 has no `ship-pr.sh` subcommand
and nothing in CI checks it, so a prompt in front of those rounds would convert a rule into a default, and
a default gets accepted at the end of a long session, which is exactly when this stage runs. The evidence
those rounds rest on is in the rationale block below, and the Gotchas row refusing to collapse step 1 to a
single pass applies just as much to reaching that end through this gate.

**An empty first round on a wide diff is suspicious, not reassuring.** There is no level to raise, so the
answer is to keep going to the floor and to say plainly that a round came back empty on a diff that shape.
An extra pass narrowed to a hot spot is fine on top of a whole-diff round, never instead of one.

**Then close the phase properly**, because moving review before the push removed the only clean-tree
checkpoint that used to sit between editing and shipping:

- **Re-run the local gate for whatever a round touched.** Every fix made here is ungated code: the
  precondition gate was evaluated *before* step 1. Match the gate to what changed, because the mapping is
  not uniform and two of these are easy to get wrong:

  | A round touched | Re-run |
  | --- | --- |
  | `site/**` | `pnpm --dir site test`. If any e2e spec is in scope, `build` **then** `test:e2e`, in that order and never one without the other: `test:e2e` is bare `playwright test`, so `webServer` serves whatever already sits in `site/dist` and a stale build passes green against code your fix never reached. For `site/scripts/parser/**` or `site/scripts/db/**`, add `parse` and commit the `site/public/api/` result, as in the NDJSON row: those paths feed the same CI sync guard |
  | `workers/**` | `pnpm --dir site test` (the Worker's suite runs inside it). Then **deploy the Worker by hand before step 2**, `pnpm --dir workers/events run deploy`: no workflow deploys it, so shipping the code does not ship the change, and pushing publishes a commit message describing behaviour that is not live yet |
  | the committed NDJSON | `db:check` **and** `db:verify`, then `db:emit` and confirm it **introduces nothing new** (the fix itself is still uncommitted, so `git diff` is non-empty by construction; what you are checking is that re-emitting adds no further Markdown change). Then `pnpm --dir site parse` and commit whatever changes under `site/public/api/` and `site/public/setup.md`: those are NDJSON-derived, `pnpm test` does not regenerate them, and `lint-papers.yml`'s API sync guard re-derives them in CI, so skipping this goes red at step 5 after the push |
  | the curated DOI / license / related-DOI inputs (`dois-manual.json`, `licenses-manual.json`, `dois-related.json`) | **`db:reseed-axes` first**, then the NDJSON row above. Those files are inputs that get folded into the NDJSON; until the reseed runs, the intended change is not in the DB at all, so `db:check` passes and `db:emit` produces nothing while nothing you meant to change has happened |
  | `check-public-publish.sh` | `python3 .claude/hooks/check-public-publish.test.py` |
  | `block-generated-edits.py` | `pnpm --dir site test`. Its only coverage is `site/scripts/db/hook.test.ts`, so the publish-hook suite above does **not** exercise it. The two hooks are tested in different places; the CI section below says so too |
  | `ship-pr.sh`, `check-ci-paths.py`, `.github/workflows/**` | `python3 .claude/skills/caail-pr-wrapup/check-ci-paths.py` |
  | canonical Markdown (`Datasets/**`, `Primers/**`, root `*.md`, `Taxonomy.md`), `skills/**`, `plugin/skills/**`, `.claude/settings.json` | `pnpm --dir site test`, **and** `pnpm --dir site parse` followed by `git diff --exit-code -- site/public/api site/public/setup.md`. The second is not optional and `test` does not cover it: `test` never regenerates those artifacts, so the committed API JSON and `setup.md` can disagree with the model and only `lint-papers.yml`'s sync guard notices, at step 5, after the push |
  | anything not listed above | run `pnpm --dir site test` and think about which guard in `lint-papers.yml` and `test.yml` covers the path. A shape nobody listed is not a shape nothing checks |

  Note `pnpm --dir site build` rewrites tracked files under `site/public/api/`, so running it can dirty the
  tree. **Do not reflexively discard that.** Those files are real output: if your fix changed anything the
  parser reads, the new API JSON *is* part of the fix and must be committed with it. Discarding it ships a
  stale endpoint, and nothing catches that, because `lint-papers.yml`'s API sync guard does not fire on
  `site/src/**`, yet `site/src/lib/**` is imported by the parser, so a fix there can change the served
  output while leaving the guard silent. The test: re-run `build` from a clean tree at the commit before
  your fix. Whatever still differs is output your change caused; commit it. Only churn that reproduces
  identically either way is safe to discard.
- **Commit the fixes, then re-run `preflight`.** A fix left uncommitted does not ship, and the failure is
  silent in both directions: the tree you reviewed still looks correct, and the PR body truthfully says
  the finding was fixed. `preflight` is the dirty-tree check and it ran at step 0, before these edits
  existed, so it has to run again. `push` re-asserts the same three preconditions itself, but a guard you
  rely on rather than a step you take is a worse place to discover this.

**How to review, each rule bought with a real defect:**

- **Measure the rendered result; never trust a comment that asserts it.** A source comment claiming a
  value is not evidence about the built page, and when the two disagree the comment is the older of the
  two facts.
- **Check the surfaces the diff did not touch.** A change that states a fact on one page can contradict
  what another page one click away already says. Nothing in the diff shows you that.
- **Coverage is not absence.** axe reports zero violations *on the routes a spec visits*. A new or
  changed route that no spec visits has not been checked, and "no violations" from a suite that never
  loaded it is not a result.
- **A guard added while fixing a finding is not trusted until it has been seen failing on that defect**
  (`CAAIL-221`). A test written only against fixed code proves the code passes the test, which is not the
  claim you need. **Commit the fix and the guard first**, then reproduce the defect on top of the commit,
  run the guard, confirm it fails **with a message naming the real problem**, then get back to the committed
  state with `git restore --source=HEAD --staged --worktree :/`. Use that exact form: bare `git restore` is
  a fatal error (it demands paths), `git checkout --` on an uncommitted fix destroys it with nothing to
  restore from, and `git reset --hard` / `git checkout .` throw away more than the defect. (On this
  maintainer's machine those two are also hook-denied, but that hook is user-global and **not** in this
  repo, so a fresh clone runs them unguarded. Prefer the restore form because it is narrow, not because
  something will stop you.) It restores tracked files but leaves anything new you made while
  reproducing the defect, so finish with `git clean -nd` and remove what it lists. The `-d` matters: plain
  `git clean -n` does not list untracked *directories*, while the push-time check reports them (`?? dir/`),
  so without it you can believe the tree is clean and be refused at step 2 over leftovers you thought were
  gone. Committing first is what
  makes all of this safe. Then say in the PR body that the guard was seen failing.

#### Why this is more than one pass, and why that is provisional

Read this before shortening the procedure. The rounds are not general caution; they compensate for a
specific, measured asymmetry, and they are marked *for now* on purpose.

**The cross-model reviewer is much weaker than the Claude reviewer it sits beside** (maintainer call,
2026-08-12, from having run both across this repo's merges). Its design rationale is decorrelation:
Claude reviewing Claude cannot find the class of error invisible to Claude. That rationale assumes the
non-Claude model is strong enough to exercise the decorrelation, and the models the step 4 reviewer can
currently reach are not. The failure is silent in the worst direction: **a weak reviewer returns few
findings, and few findings read as "clean" rather than as "under-reviewed".** The step runs, the report
looks reassuring, the pipeline goes green, and the ship stage carries a review budget that looks larger
than it is. So the depth has to come from the Claude side instead.

**The evidence that one pass is not enough** (one session, 2026-08-12, PR #185: six files at the first
pass, ten by merge). Three `/code-review high` passes found **14 defects** on that small a diff:

- **Pass 1** found three Starlight style leaks, measured on the built page, **each contradicting a
  comment in the same file that asserted otherwise**.
- **Pass 2** found a hub surface contradicting the homepage band's central claim one click away.
- **Pass 3** found a link-in-text-block contrast failure at **2.99:1** on a route no axe spec visited,
  plus a unit test that checked presence rather than pairing and so passed while crediting one curator
  with another's ORCID.

**Two of the fourteen were introduced while fixing earlier findings**, including an accessibility
regression created by the fix for a different accessibility finding. That is the case a single pass
cannot catch by construction: it reviews a diff that does not yet contain the defect. It is the sharpest
argument for round 2 existing at all, and it is why round 2 re-reads the whole diff rather than the
fixed files.

**Revisit condition.** This is a workaround for a model-availability constraint, not a permanent view of
how much review a diff needs. When a stronger non-Claude model becomes reachable by the step 4 reviewer,
the extra rounds can come back down, because the decorrelated pass will then be doing the work they were
added to replace. Until then, do not "simplify" this to one pass: the shape that produced the 14 findings
above is the shape being kept.

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
  level and how many rounds, and then **which of the stop rule's two endings this run reached**. A quiet
  round with nothing outstanding: say so. The maintainer answering **"ship now"** at the stop gate: say
  that instead, name everything left outstanding, and **if the last round changed the diff, say that those
  fixes were never reviewed and give the reason they gave**. That is the one ending that ships code no
  round has read, so a body that omits it is not merely thin, it is wrong. Write this here, because the
  body is composed here and step 6 checks for it: `ship-pr.sh` has no `edit` subcommand, and by step 6 the
  PR is already open. Findings routed to a ticket by
  the scope gate are named here too, by key, and **the publishing exception below covers them as well**:
  for that exception alone, treat "declined" and "routed to a ticket" as one category, even though this
  file is careful to separate them everywhere else. Deliberately not restated here, because there is one
  copy of that rule and it is a few lines down; two copies drifted apart the moment this sentence was
  written. **Any** finding declined rather than fixed,
  in any round, gets named with its reason, since a reader cannot tell a triaged finding from an
  unnoticed one and the rounds it came from are invisible to them. **The one exception is a declined
  finding that describes an unpatched weakness in a live service** (the events Worker, say): a declined
  finding is by construction unfixed, and this body is world-readable and permanent. That one goes to
  Jira with `disclosure-private`, and the body says only that a finding was triaged there, naming
  neither the weakness nor the endpoint. Publishing it would breach `.claude/rules/publishing.md`.
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
  sound. Step 1's quiet round is what "reviewed" rests on.
- **fix-first** (confirmed correctness/security issues) → stop, fix them, commit + push (this updates the
  open PR), then re-review or proceed once resolved. Don't merge over confirmed real findings. A finding
  strong enough to land here is worth an extra step-1 round on the updated diff, since the fix is now
  unreviewed code. That round can change how the review ended, and the body was composed back at step 3,
  so **amend it with `gh pr edit` rather than leaving the open PR describing an ending that no longer
  happened**. This is the one place the body is written after the PR exists; `ship-pr.sh` has no
  subcommand for it, which is why the command is named here.
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
Per the CI table below, `lint-papers` runs only when the diff touches content/parser paths, and the
deploy is **post-merge**, so not every PR has every check. A PR with **no checks at all** is now a
narrow case: `guards.yml` fires on `.claude/hooks/**`, `.claude/settings.json`, this skill, and **any**
`.github/workflows/**` edit. Genuinely check-free paths include `.claude/` rules and agents, any skill
other than `caail-pr-wrapup`, `docs/**`, `LICENSE`, `CITATION.cff`, `.zenodo.json`, `.gitignore`,
`.github/ISSUE_TEMPLATE/**`, and the two plugin manifests (`.claude-plugin/marketplace.json` and
`plugin/.claude-plugin/plugin.json` — only `plugin/skills/**` is filtered, not `plugin/**`).

The helper reports "no checks reported" and proceeds when that is genuinely the case. **If you expected
a guard to run and it did not, and the diff is not in that list, treat it as a paths-filter gap rather
than expected quiet** — that is the exact failure this skill's own CI section documents twice over.

If a check **fails**, stop — surface it and fix the branch; do not merge red.

### 6. Confirm, then merge
**Pause here.** Merging triggers the public deploy, so confirm with the user before proceeding (unless
they've already said to merge autonomously this run). Weigh **three** inputs, in this order of weight:
step 1's review rounds must have ended one of the two ways the stop rule allows: a quiet round with
nothing blocking, or the maintainer answering "ship now" at the stop gate. In the second case the
findings left outstanding are exactly the ones the PR body names and no others, and if the last round
changed the diff the body also says those fixes went unreviewed. **The one exception is step 3's
publishing carve-out**: a finding describing an unpatched weakness in a live service is deliberately
unnamed, so an unnamed outstanding finding of that kind satisfies this check rather than failing it. Do
not "fix" a failing check here by naming it; that publishes the weakness in a PR that cannot be deleted. **A "ship now" ending does not inherit
the autonomous-merge waiver above**, so confirm the merge explicitly: that answer authorised ending the
review, not merging without being asked;
CI must be green (step 5); and the step 4 cross-model pass must not have left unresolved confirmed issues
(a "fix-first"). A green CI plus a thin cross-model report is **not** a substitute for the first of those:
neither of them reads the diff the way step 1 does. Then:
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh merge <pr>
```
This merges with a merge commit, deletes the remote branch, tolerates the benign "main already checked
out" gotcha (see below), verifies the PR is actually `MERGED`, and prints the **merge commit SHA** you
need for step 7.

### 7. Watch the deploy
```bash
bash .claude/skills/caail-pr-wrapup/ship-pr.sh watch-deploy <merge-sha>
```
This finds the `docs.yml` run for that SHA and blocks until it finishes. Green = build + **Lighthouse
gate** (accessibility ≥0.90 on landing + explorer; performance ≥0.90 on landing) + Deploy to Pages all
passed — *that* is a successful ship. If preflight predicted no deploy (the diff touched no deploy
paths), the helper says so and returns cleanly. **If Lighthouse fails, stop** — read the lhci report
and fix the regression; do not re-run blindly hoping it passes.

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
re-running them reports confusing errors rather than doing anything (see the Gotchas row).

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
  leaked `astro dev` is what the bogus lhci score below is usually blamed on, and a pattern that only says
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

## CI: what runs when

**The workflows are the source of truth; the table below is a snapshot** (taken 2026-08-12) kept only
so step 5/7 expectations are legible without opening four YAML files. `preflight` computes the real
answer from the `LINT_PAPERS_PATHS` / `TEST_PATHS` / `DOCS_PATHS` / `GUARDS_PATHS` lists in
`ship-pr.sh`. **Each is named for its workflow file** (`<stem uppercased, - to _>_PATHS`), and so is
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
| `lint-papers.yml` (matrix ↔ ref lint + `db:check`/`db:verify` + sync guards) | **pull_request** + push to main | `Papers.md`, `Software.md`, `Databases.md`, `OtherResources.md`, `Taxonomy.md`, `Datasets/**`, `CONTRIBUTING.md`, `CLAUDE.md`, `site/scripts/parser/**`, `site/scripts/db/**`, `site/db/**`, `site/public/api/**`, `site/public/setup.md`, `plugin/skills/**`, `skills/**` |
| `test.yml` (Worker config + vitest + Playwright/axe) | **pull_request** + push to main | `site/**`, `workers/**`, root `*.md`, `ResearchAreas/**`, `Datasets/**`, `Primers/**`, `.claude/hooks/**`, `.claude/settings.json`, `.github/workflows/test.yml` |
| `guards.yml` (publish-provenance hook + CI-paths consistency) | **pull_request** + push to main | `.claude/hooks/**`, `.claude/settings.json`, `.claude/skills/caail-pr-wrapup/**`, `.github/workflows/**` |
| `docs.yml` (build + Lighthouse + deploy) | **push to `main` only** | `site/**`, root `*.md`, `ResearchAreas/**`, `Datasets/**`, `Primers/**` |

Consequences: `test.yml` runs on almost any `site/**` or root-`*.md` PR, so most PRs have at least the
`test` check. A change confined to `.claude/` **rules or agents**, or to a skill other than
`caail-pr-wrapup`, still has no PR checks — correct, there is nothing to run. `.claude/hooks/**` and
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

## Gotchas

| Symptom / situation | What it means / do |
| --- | --- |
| **Round 1 comes back empty** on a code-heavy or multi-file diff | Read it as a fact about the review, not about the diff. There is no level to raise (the level is always `high`), so run out the floor and say plainly that a round came back empty on a diff that shape. An extra pass narrowed to a hot spot is fine on top of a whole-diff round, never instead of one. |
| The **stop gate** fires before the floor is met | It should not, and the answer is not to accept it. Rounds 1..floor run without the *stop* gate; it exists only once condition 1 holds, and then on any state where the run would otherwise continue. The **scope gate** does fire in those rounds and should, so do not read one as evidence the other is misfiring. A stop prompt below the floor turns the floor into a default, which is the erosion the next row is about. Run the remaining floor rounds. |
| A round's findings are **all pre-existing**, and the loop will not go quiet | Once they are ticketed under the scope gate **and nothing in the diff was changed in response**, that *is* a quiet round, meaning quiet for condition 2 only: condition 1 still applies, so it does not ship below the floor. Only a defect this diff **caused** blocks a quiet round. If the maintainer elected to fix any of them here, condition 3 applies and the round is not quiet, because that fix is unreviewed code like any other. A loop still running on the same old findings means condition 2 is being read in its pre-scope-gate form, which does not terminate. |
| `push` says **working tree is not clean** and lists files | A step-1 fix was never committed. Not a nuisance check: `preflight` ran before the rounds edited anything, so this is the only thing between an uncommitted fix and a PR that looks correct while missing it. **Commit** what it lists, then re-run `preflight` and push. Stashing a *fix* clears the check while producing exactly the outcome it exists to prevent: the tree goes clean, the push succeeds, and the fix is not in the diff. The stash itself is safe (`refs/stash` is shared across worktrees and survives `git worktree remove --force`, verified), so a fix stashed by mistake is one `git stash pop` away. Stashing unrelated work in progress is fine. |
| `push` says **on the default branch** | You are shipping from a checkout that holds `main` (the primary one usually does). Nothing was pushed. Get onto the feature branch, or run the skill from its worktree. Without this the push would have gone straight to `origin/main`, skipping the PR and every check, with `docs.yml` deploying it. |
| A finding's **fix is itself unreviewed code** | It is, and that is the whole reason for round 2. Two of the fourteen defects in step 1's evidence arrived this way, one an accessibility regression created by the fix for a different accessibility finding. Never merge a fix that no round has seen **unless the maintainer took the stop gate's "ship now" with that stated, which is the one override and is human-only**. An agent may never reach that outcome on its own. |
| Cross-model pass returns **one or two findings, or none** | Normal output for the weaker reviewer; it is not evidence the diff is clean (step 1's rationale). Do not let it stand in for a step-1 round, and do not report it as "reviewed by two models" as if the two carried equal weight. |
| A deeper level than `high` looks warranted | It isn't the lever here: **add a round instead.** `ultra` is not available to an agent regardless, being user-triggered and billed. If you still think the diff needs something other than another round, say so and let the user decide rather than changing the level quietly. |
| Someone proposes collapsing step 1 back to a single pass | Point them at step 1's rationale block and its revisit condition. The rounds compensate for a measured reviewer-strength asymmetry, and the condition for lowering them is a stronger non-Claude reviewer, not a diff that feels small. |
| `gh pr merge --delete-branch` — **two outcomes, both fine** | Which one you get depends on whether anything holds `main`. **(a) Something does** (the primary checkout, or a worktree): gh's post-merge *local* step fails with `fatal: 'main' is already checked out at …`. Benign — the **remote merge already succeeded**; the helper verifies `state==MERGED` and API-deletes the remote branch. **(b) Nothing does:** gh succeeds, which means it **switches this checkout to `main` and deletes the local feature branch itself**. Then step 9's fast-forward is already done and `git branch -d <branch>` answers `error: branch '<branch>' not found` — also benign, and not a sign the merge went wrong. Either way trust `MERGED`, not gh's exit code, and check `git branch --show-current` before assuming where you are. |
| Deploy run fails on **Lighthouse** | A11y/perf regression on landing or explorer. **Hard stop** — read the lhci output, fix it, ship again. Never blind-retry. |
| The cross-model reviewer reports an **auth/login prompt** | Its backend's credential lapsed and cannot be refreshed headlessly. Re-auth **whatever the agent names**, interactively, rather than guessing at a CLI: this skill deliberately does not record which backend it wraps, because that is the agent's business and a stale name here would send you to re-auth something the reviewer never runs. Or skip the pass (step 4 is optional) and let the operator decide. Never hard-block a ship on an unavailable optional reviewer. |
| `lhci` reports a bogus ~0.5 perf score | A stale `astro dev`/preview is holding `:4321`; lhci silently measured it. Free the port (`lsof -ti:4321 | xargs kill`). Only relevant if running Lighthouse locally; CI runners are fresh. |
| Any site command (build/test/lighthouse) | Needs **Node ≥ 22.12**: `source ~/.nvm/nvm.sh && nvm use 22` first; the system default may be older. |
| PR body / commit | **No AI attribution** anywhere in CAAIL git history. |
| GitHub issue still `OPEN` after merge | The `Closes #N` line was missing or malformed — GitHub fails silently on both. Close it by hand (step 10) and don't assume next time; `gh issue view` is the check. |
| Jira ticket left in `In Progress` after a green deploy | Nothing else transitions it — no hook, no workflow, no other skill. Step 10 is the only place it happens, so a skipped step 10 means a permanently stale board. |
| Step 10 fails (Rovo auth, wrong cloud id, `gh` error) | **Bookkeeping only** — the merge and deploy already succeeded. Report which tracker is stale; never retry in a loop or try to unwind the ship. |
| Worktree cleanup | Managed (`EnterWorktree`) → `ExitWorktree` remove. Plain branch → `git branch -d/-D`. Hand-made stale worktree → confirm, then `git worktree remove` + `git branch -D`. |

## `ship-pr.sh` reference

| Subcommand | Effect | Mutates? |
| --- | --- | --- |
| `preflight` | branch/tree/auth checks + CI prediction + route hints | no |
| `push` | `git push -u origin <branch>`; **re-asserts branch, clean tree and auth first** | yes |
| `open-pr <title> <body-file>` | `gh pr create --base main`; prints PR url | yes |
| `watch-checks <pr>` | blocks on checks; 0 if none/clean, non-zero on failure | no |
| `merge <pr>` | **when run from the PR's own branch**, refuses if local `HEAD` differs from the PR head, naming which way it diverged since the remedies are opposite. From any other branch that check cannot mean anything and is skipped, so an unpushed commit is **not** caught there. Then merges + deletes the remote branch (gotcha-handled); prints merge SHA | yes |
| `watch-deploy <merge-sha>` | finds + watches the `docs.yml` run; 0 if no deploy fires | no |
| `verify-live <route>...` | curls each live route; non-zero if any ≠ 200 | no |

**Step 1 has no subcommand, and nothing in CI enforces it.** The rounds are judgment, which is why they
live in this manual rather than in the helper, but that also means the only thing keeping them is someone
reading this file. That is a weaker guarantee than the path-filter check in `guards.yml`, and it is worth
knowing which of the two you are relying on: if a ship skipped the rounds, the PR body is the only place
it would show.

What *is* partly enforced in code is that the fixes reach the PR: `push` refuses a dirty tree (alongside
the branch and auth assertions it shares with `preflight`), and `merge` refuses when local `HEAD` is not
the commit the PR would merge. Between them they cover the uncommitted and unpushed halves of the same
failure, with one gap worth knowing: the `merge` check only runs when you are **on** that PR's branch,
because from anywhere else local `HEAD` says nothing about this PR. Merging PR #A while standing on branch
B is therefore unguarded against an unpushed commit on A. Nothing checks that the rounds happened at all.

**Neither guard has automated coverage.** `check-ci-paths.py` is what CI runs when this script changes,
and it only text-scrapes the `*_PATHS` variables and their `matches_*` wrappers; it never executes
`assert_shippable` or the divergence block. So a refactor could silently turn either into a no-op and
every check would stay green, on the one script whose failure mode is shipping a PR that is missing a fix.
Until there is a harness, treat both as things to re-demonstrate by hand (per the `CAAIL-221` rule above)
whenever you touch them, rather than as things CI is watching.
That is deliberate: a skipped round produces a thin PR body a reader can notice, whereas an uncommitted
fix produces a PR that *looks* right and is missing the fix, and nothing downstream can tell.
