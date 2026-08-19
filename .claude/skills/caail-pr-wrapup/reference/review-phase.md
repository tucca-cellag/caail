# Step 1: the review phase

> Read this in full when you reach **step 1** of `SKILL.md`. It is the whole review phase.

## Contents

- The level, and why depth comes from rounds rather than from it
- The floor on rounds, by blast radius
- What each round has to do
- **Definitions** (blocking, disposed of, outstanding, the four dispositions, the two endings, the publishing carve-out) — the single source for every load-bearing term
- Severity, who assigns it, and the three Majors-by-definition
- When to stop: the three conditions
- The **scope gate** (per-round, out-of-scope findings)
- The **stop gate** (post-floor, whether to keep reviewing)
- Closing the phase: re-running the local gate for whatever a round touched
- How to review, each rule bought with a real defect
- Why this is more than one pass, and why that is provisional


**The level is always `high`.** Every round, every diff shape:

```
/code-review high origin/main...HEAD
```

(`main` here is this repo's default branch. `ship-pr.sh` derives that name rather than assuming it, so a
fork keeps working; if `preflight` printed a different `Default:`, use that name instead of copying this
line literally.)

Then apply or triage every finding and **run it again on the updated diff**, until the stop rule below
says you are done. It has two endings, and "the findings die out" is only one of them.
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
  what round 2 is for, and the rationale block at the end of this file records an a11y fix creating a different a11y
  regression on PR #185; whether that one crossed files is not recorded, so do not cite it as though it
  were),
  while a pre-existing bug you happened to read in a file you did edit does not. Causation is also what
  keeps this consistent with "check the surfaces the diff did not touch" below: a contradiction this
  change *introduced* one click away is in scope, one that was already there is not.

  **Scope gate.** When a round produces findings you have classified as pre-existing, do not act on that
  classification alone. **Write the triage first, then ask once.** List every pre-existing finding in the
  round's triage with the disposition you propose for it, then put that whole triage to the user as a
  single `AskUserQuestion` whose two options are both answers you can act on: **accept this triage**, or
  **fix all of them here instead**. The second is deliberately the opposite of the default rather than a
  restatement of it: filing is what the bullet above already makes the default, so an option offering it
  again would give the maintainer two labels for one outcome and record nothing. Their answer is the stated reason, recorded rather than assumed. Anything
  finer grained arrives through the **Other** field, which the tool offers beside the options on every
  question, so do not spend an option on "adjust it": an option carries only its own label, and a
  maintainer selecting it would hand you a rejection with no content. Restate whatever comes back as the
  corrected triage and proceed. Do not re-prompt: a second question
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

  **All four dispositions are available, and they are yours to propose** (see Definitions; a pre-existing
  finding that is simply not a defect is **refuted**, not ticketed).** The bullet above insists "not
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
- **Round 3 and beyond, until the stop rule ends it either way.** Each round takes the previous round's triage list,
  so it stops re-deriving candidates an earlier round already refuted.

#### Definitions

These five terms are load-bearing, and this is the **only** place any of them is defined. Everywhere else
in this file points here rather than restating them. That is not tidiness. Three consecutive review rounds
on the change that introduced these gates each found a Major, and every one was the same defect: a rule
written in two places, with the fix applied to one of them. If you change a definition, change it here and
nowhere else.

- **Blocking.** A defect this diff *caused* that has been neither fixed nor refuted, **including one
  deferred to Jira and one declined**. Only fixing or refuting clears it. Blocking items are what
  condition 2 tests; conditions 1 and 3 are separate and equally binding, so "nothing is blocking" is never
  on its own a reason to stop.
- **Disposed of.** A *pre-existing* finding, ticketed or declined. Shown at the gates for context, never
  blocking.
- **Outstanding.** Blocking items **and** disposed-of items together, which is everything a round surfaced
  and did not refute or fix. The gates display all of it; only the blocking part governs whether the
  sequence may end, and only the blocking part is what an ending 2 body is disclosing.
- **The four dispositions.** **Fixed**, changed in the diff. **Refuted**, shown not to be a defect, with
  the reason stated. **Deferred**, agreed real and filed to Jira. **Declined**, agreed real and left alone.
  Only the first two clear a blocking finding. The last two leave it blocking, which is exactly why
  shipping with either is ending 2 and never ending 1.
- **The two endings.** **Ending 1**: conditions 1, 2 and 3 hold at once, so the floor is met, nothing is
  blocking, and the last round changed nothing. **Ending 2**: the maintainer answered "ship now" at the
  stop gate. There is no third. **Never write "a quiet round" as shorthand for ending 1**: it carries
  condition 2 alone, and a 3-round diff whose round 1 came back quiet satisfies the shorthand while failing
  the ending.
- **The publishing carve-out.** An outstanding finding describing an unpatched weakness in a live service
  is reported only as having been triaged to Jira, naming neither the weakness nor the endpoint. It reaches
  that finding **however it was disposed of**, declined or deferred or scope-gate-routed. A PR cannot be
  deleted, so this binds wherever the body is actually written, which is step 3.

**Severity, and who decides it.** The stop *gate*'s option set turns on whether a **Major** is
**outstanding** (the stop rule's three conditions never mention severity, and a Major found and fixed in
round 1 governs nothing), so classify
every finding yourself and treat the reviewer's own label as evidence rather than as the answer. Across the
rounds run on the change that added this section (**ten by 2026-08-19**, a snapshot, and deliberately
without a command beside it: nothing in the repo counts review rounds, and `git log` counts commits, which
is a different number and would invite exactly the correction this parenthesis exists to prevent) it
emitted three different vocabularies (Major/Minor,
High/Medium/Low, lowercase variants), hybrids like `MEDIUM-HIGH`, and **no labels at all on two rounds**.
A rule that reads a field which is sometimes absent is a rule that is sometimes undefined.

**Three outcomes are Major by definition, whatever label arrives with them**, because they are named by
their consequence in this repo rather than by anyone's severity scale. **They are about what shipping this
PR would do, not about what any one file says**, so they apply to every diff this skill ever ships and not
only to changes to this skill:

1. Shipping would **publish a `disclosure-private` finding**, or any unpatched weakness in a live service,
   into a PR body, commit message or issue. PRs cannot be deleted.
2. Shipping would **merge code no round has read**, without the maintainer having answered "ship now" to
   precisely that.
3. Shipping would **merge below the floor**, or erode the floor so a later run does.

**Beyond those three, a Major is a defect in the change under review that would cause wrong behaviour, data
loss, or a security weakness if merged.** For a content or procedure diff that means a rule an agent
following it would act on wrongly; for a code diff it means the ordinary thing. State it in terms of the
consequence, never the file.

**Two scoping traps, both hit while writing this.** The first: the test classifies a **finding**, never the
run's current state. Unreviewed fixes sitting in the diff at the gate are not Major 2; being asked about
them is the remedy working, and reading the pending state as a finding deadlocks the gate, because the
option it withholds is the only one that ends the run. The second, which is how the first was
over-corrected: scoping the classes to "a finding about this file" made every one of them unmatchable on an
ordinary `site/src/**` diff, so the withholding rule engaged only when this skill reviewed itself. A safety
rule that fires solely on its own test case is not a safety rule. When you are unsure, say which of the three it is nearest and
let the maintainer rule. Do not settle it by quoting the reviewer's label, and do not inflate severity to
justify another round.

**Majors are fixed, never deferred.** They may be **refuted**, which means showing the finding is not a
defect and saying why, because "not acted on" and "not a defect" are different outcomes here as everywhere
else in this phase. They may not be agreed real and left in.

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
shape.** Propose one of the four dispositions (see Definitions) for every outstanding finding first, the
same way the scope gate does, and remember that **declining or deferring a blocking finding does not
clear it**, so a triage full of those is an ending 2 and must be offered as one, then offer **two options: accept this triage and run another round, or ship now, leaving
everything outstanding unfixed and named in the body.** In the Definitions' vocabulary those findings end
up **declined**, agreed real and left alone, which is what ship-now does to them. Do not report them as
**refuted**: that word is reserved for a finding shown not to be a defect, and using it here would undo the
disclosure this ending exists to force. Anything finer grained arrives through **Other**. Since condition 3 is absolute, a
triage that proposes **newly** any fix *is* another round; there is no third option where a fix proposed
here lands and the run still ends. Fixes that landed in earlier rounds are a different matter entirely:
they are why condition 3 is unmet and the gate fired at all, and "ship now" ends the run with them in the
diff, which is the ending's whole point. It fires whenever the floor is met and the run would
otherwise continue, which is any state where condition 2 or condition 3 is unmet. It never fires below the
floor.

The question carries four things, and they are what make the answer mean anything:

- **Rounds run so far, against the floor for the diff's shape re-checked now.** Re-check rather than
  reuse: a fix can widen the shape and raise its own floor, and the state right after a fix landed is
  where that happens. If the re-checked floor is no longer met, do not ask at all, and run the remaining
  floor rounds.
- **Everything outstanding, labelled blocking or disposed of** as Definitions sets those out. Get the
  labels right rather than restating them here: a diff-caused defect that was deferred *or declined* is
  blocking, and showing it as settled at the moment someone chooses whether to ship is the worst possible
  place to lose it.
- **What has changed since you last asked**, including "nothing". Someone being asked a third time should
  be able to see that it is the same question.
- **Whether the last round changed the diff.** If it did, say that shipping now merges code no round has
  read, and that this file's own rationale block records **two of fourteen defects as introduced by fixes
  to earlier findings**, one an accessibility regression created by the fix for a different accessibility
  finding. Give the number rather than a caution about risk; the point of asking is that they are deciding
  against it.

**When any Major is outstanding, the gate still fires but "ship now" is not among the options.** The two
it does offer are **accept this triage and run another round** and **refute one of the Majors, saying which
and why in Other**, because a one-option question is not a question and the tool requires at least two
(**observed 2026-08-19**; check rather than trust, as with every external-tool claim here). A refutation
with no reason is not a refutation, so if that second option comes back empty, treat it as no answer and
**ask once, narrowly**, exactly as the scope gate does for an adjustment you cannot resolve. Do not refute
it yourself: nothing here ends a run on the agent's own judgement. Do not suppress
the whole prompt instead: the maintainer should see a Major round rather than
be routed around it, and they can still overrule through **Other**, which is theirs. What an agent may not
do is *offer* the option.

**Only an unambiguous "ship now" is one.** A hedged or conditional reply, "ship it once the a11y thing is
fixed", is not a ship: it is an instruction to do the condition and ask again. Read it that way even when
it plainly means "stop bothering me", because the alternative is an agent deciding a qualified yes was
close enough and merging code no round has read.

**Otherwise "ship now" is always offerable, and only a human may take it.** An agent never chooses it on the
maintainer's behalf, however small the outstanding fixes look. That is the safety property this section
rests on and it has no exceptions.

**So "never merge a fix that no round has seen" is overridable on the record rather than absolute.** That
is a deliberate change. As an absolute it makes the sequence unbounded by construction, since any fix
mandates a round and any round may find something needing a fix: by the time this rule was written, five
review rounds on this very change had reached no stopping state, because a fix was made every round. The rule now binds the agent
absolutely and binds the maintainer only with disclosure.

**The sequence ends in exactly two ways**, and the PR body says which:

1. **Ending 1**, as defined above: conditions 1, 2 and 3 holding at once. No prompt is needed to stop,
   because there is nothing to decide. Pre-existing findings ticketed or declined along the way do not prevent this ending; if they
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
those rounds rest on is in the rationale block at the end of this file, and the row in
`reference/gotchas.md` refusing to collapse step 1 to a
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
  | `block-generated-edits.py` | `pnpm --dir site test`. Its only coverage is `site/scripts/db/hook.test.ts`, so the publish-hook suite above does **not** exercise it. The two hooks are tested in different places; `reference/ci-paths.md` says so too |
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

