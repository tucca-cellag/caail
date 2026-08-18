# Issue tracker: split (Jira + GitHub)

This repo uses **two** trackers. Which one an item goes to depends on what the
item is, not on which skill produced it.

| Tracker | Identity | Holds |
| --- | --- | --- |
| **Jira** | project `CAAIL` (private) | The durable record: implementation planning, `/to-spec` and `/to-tickets` output, `/wayfinder` maps and decision tickets, multi-step efforts, anything labelled `disclosure-private` |
| **GitHub** | `tucca-cellag/caail` (**public**), issues enabled | Discrete self-contained requests, anything a PR will close, content suggestions from outside contributors, reproducible bugs in shipped behaviour |

**The Jira site and cloud id are deliberately not recorded here.** This file is
committed to a public repo. Resolve them at runtime: `acli jira auth status`
names the site, and the cloud id is the Keychain entry `JIRA_CLOUD_ID`.

## Routing rule

- **Jira is the default and is never skipped.** Every piece of work gets a Jira
  issue *before* the work starts, not after. A session's reasoning is the
  expensive part and it evaporates on compaction, so anything living only in a
  todo list or a chat transcript is already lost.
- **`/to-spec` and `/to-tickets` write to Jira.** Their output is implementation
  planning by definition.
- **`/wayfinder` writes its map and decision tickets to Jira.**
- **`/triage` operates on GitHub.** It exists for issues you did not file, and on
  a public curation repo those arrive on GitHub. Jira tickets from `/to-tickets`
  are already agent-ready and must **not** be triaged.
- **A GitHub issue is an *additional* venue, never a substitute.** Open one when
  the content is world-safe and outside contributors benefit from seeing it.
  Where both exist, cross-reference each from the other.
- **Anything `disclosure-private` gets no GitHub issue at all.** See the
  disclosure gate below.

## Before creating anything, enumerate BOTH

Not optional, and not a search. Full enumeration, because keyword search has a
recall failure mode that enumeration does not — Jira's text index tokenizes, so
`summary ~ "full text"` and `description ~ "CAAIL-166"` both miss matches you
need. See the `tracker-dedupe` skill.

`~/.claude/hooks/check-tracker-duplicates.sh` enforces this, denying
`gh issue create` and `acli jira workitem create` until the backlog has been
reviewed. There is NO time-based bypass any more (removed 2026-08-18): the hook
enumerates on every create and injects the result, so each ticket is gated
individually and cleared by its own single-use override.

```bash
~/.claude/scripts/tracker-digest.sh --github tucca-cellag/caail
```

Jira is one command; it fetches the project over REST and compacts it:

```bash
~/.claude/scripts/jira-cache.sh list CAAIL
```

The Rovo MCP was removed 2026-08-18, and could not enumerate a board anyway: it
returned 5 issues per response regardless of `maxResults` while advancing
`nextPageToken` by the requested value, so paging at 100 skipped 95 of every 100
and reported the sweep complete.
Page with `nextPageToken` until exhausted.

**Request every one of those fields, every time.** A field you omit comes back as
`-`, indistinguishable from genuinely empty. Omitting `parent` once made ~100
issues look like orphans; they were fine.

The board runs to roughly 90 open issues and nobody holds it in their head, so "I
don't remember one like this" is not evidence. Search for the **concept**, not
your phrasing of it — a ticket about "refs whose classification rests on
something short of full text" is the same work as one about "abstract-only
placements", and no keyword search finds the second from the first.

Enumerate sibling Jira projects too when the subject plausibly spans them; the
`CLAUDE` project (ClaudeDotFiles) has overlapped with this repo before, and the
recorded near-miss crossed exactly that boundary.

**When you find an overlap, prefer editing the existing ticket to filing a new
one.** If both genuinely need to exist, say in each what the boundary is and link
them. An unlinked pair of overlapping tickets is how the same work gets done
twice or not at all.

## Jira conventions

Hierarchy is **Workstream** (hierarchy level 1) → **Task** (0) → **Sub-task**
(-1). A Workstream is a body of related work with a shared thesis; Tasks hang off
it via `parent`. Retroactive Workstreams recording completed work are an
established pattern here, not clutter.

Statuses are **To Do** (transition id `21`) → **In Progress** (`31`) → **Done**
(`41`). All three are global and always available. **Transition to In Progress
when work actually starts**, not at the end — a board where everything jumps To
Do → Done records no reasoning and answers no question about where time went.

### Descriptions carry reasoning, not just instructions

State the thesis, what superseded what and why, the central vulnerability of the
argument, and which options were rejected. When the full record lives in a
gitignored working file, name that path. A description that only says what to do
is a description that will be re-derived from scratch in three weeks.

### Fields available on Task

The project exposes no others worth using; `Category` has no configured options.

| Field | Key | Use |
| --- | --- | --- |
| Priority | `priority` | Highest / High / Medium / Low / Lowest |
| Start date | `customfield_10015` | When work is expected to begin |
| Due date | `duedate` | Loose plan, not a commitment |
| Original estimate | `timetracking` | Rough hours |
| Labels | `labels` | The taxonomy below |

**Priority is argued, never inherited.** Do not take a CVSS score, a linter
severity, or a source rubric's framing as the priority. Score against this
project's actual exposure and say why in the description. A build-time-only
advisory rated critical upstream is not critical here.

### Label taxonomy

Flat lowercase-hyphen strings, combined freely. Jira labels are free-text, so no
configuration is needed.

- Kind: `finding` · `workflow`
- Domain: `security` · `supply-chain` · `ci-cd` · `testing` · `observability` ·
  `a11y` · `perf` · `tooling` · `content` · `docs` · `verification` · `licensing`
- Disclosure: `disclosure-private` · `disclosure-public-ok`
- Flow type: `wayfinder:research` · `wayfinder:prototype` · `wayfinder:grilling` ·
  `wayfinder:task` — see `triage-labels.md` for how this axis differs from the
  triage-state axis
- Workstream-scoped prefixes (`phase-*`, `lane-*`, `rubric-*`) are minted per
  workstream and documented in that workstream's description.

**`disclosure-private` is a hard gate, not a hint.** It marks content that must
not reach the public repo in any form: unmitigated weaknesses in a live service,
unpublished analysis, named individuals, and anything derived from paid or
third-party material. Paraphrase discloses as much as a quote. Once a weakness is
fixed the label can be dropped and the finding discussed freely.

### Blocking edges

**`Blocks` is not `Relates`.** `Relates` says two tickets are about the same
subject; `Blocks` says one cannot start until the other is finished. Only
`Blocks` makes a ticket grabbable, which is the mechanic behind tracer-bullet
tickets: any ticket whose blockers are Done can be picked up.

`acli jira workitem link create --out <blocked> --in <blocker> --type Blocks
--yes` — note acli's `--in` is the INWARD side, which is the blocker. Without
these, `/to-tickets` output degrades to a flat list sequenced by hand.

A **wrong** edge is worse than a missing one: a missing edge costs a moment of
thought, a false edge creates a gate that stops work which was actually ready,
and nothing will tell you it is wrong. Add one only where the dependency is
structural.

### Operations

- **Create**: `acli jira workitem create --project CAAIL --type Task --summary "..." --description-file <f> --json`. Pass `--json`: without it acli prints only the key, and the reconcile hook needs the numeric id.
- **Read**: `~/.claude/scripts/jira-cache.sh show CAAIL CAAIL-nn` (description and comments, ADF flattened to text).
- **Transition**: `acli jira workitem transition --key CAAIL-nn --status "Done" --yes`.
- **Comment**: `acli jira workitem comment create --key CAAIL-nn --body-file <f>`.
- **Link**: `acli jira workitem link create --out CAAIL-nn --in CAAIL-mm --type Relates --yes` (`link type` lists them). `acli jira workitem link delete --id <linkId>` is the ONLY way to remove one here — the MCP had no delete verb and the read-only API token cannot write.

### No GitHub-Jira integration

The two trackers stay **deliberately separate**. No GitHub for Jira app, no smart
commits, no cross-linking automation. Consequences to work with rather than
around:

- **Ticket transitions are explicit.** Nothing transitions a Jira ticket from a
  commit. Call `acli jira workitem transition --key CAAIL-nn --status "Done"
  --yes` deliberately.
- **A commit message referencing `CAAIL-nn` is a human-readable pointer only.**
  It creates no link on either side. Same for a `#nn` GitHub reference in a Jira
  ticket.
- **Cross-tracker relationships are recorded by hand**, as prose in the ticket
  body or as a `Relates` link where both ends are Jira. This is why enumerating
  both trackers before creating anything is load-bearing: no automation would
  surface an overlap for you.

## GitHub conventions

Use the `gh` CLI; it infers the repo from `git remote -v` inside the clone.

- **Create**: `gh issue create --title "..." --body "..."` (heredoc for multi-line).
- **Read**: `gh issue view <number> --comments`.
- **List**: `gh issue list --state all --json number,title,body,labels,comments`.
- **Comment**: `gh issue comment <number> --body "..."`
- **Label**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

### The repo is public, and that is a hard constraint

Issue bodies, PR bodies, commit messages, branch names **and `.gitignore`
comments** are all world-readable. GitHub issues can be deleted but **pull
requests cannot**, and GHArchive permanently captures every public event into a
queryable dataset. Deleting something ten minutes later does not unpublish it.

Before filing or commenting, confirm every quoted path, code block and
architectural detail originates in *this* repo. Anything read from a private repo
or a third party's source is not publishable, and paraphrase discloses as much as
a quote. Findings about a weakness in someone else's live service go to its owner
privately, never a tracker.

Enforced at the Bash layer by `.claude/hooks/check-public-publish.sh`, wired in
the committed `.claude/settings.json`. Full rule: `.claude/rules/publishing.md`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if external PRs should enter the
triage queue; `/triage` reads this flag.)_

`gh pr create` is deliberately not gated by the duplicate hook — a PR is tied to
a branch and is not duplicate-prone the same way, and gating it would tax every
ship.

## When a skill says "publish to the issue tracker"

Apply the routing rule above. Planning → Jira `CAAIL`. Discrete world-safe
request → GitHub `tucca-cellag/caail`. When in doubt, Jira, because Jira is never
the wrong venue and GitHub sometimes is.

## When a skill says "fetch the relevant ticket"

`jira-cache.sh show CAAIL CAAIL-nn` for a key, `gh issue view <n> --comments` for a `#n`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is one issue with **child** tickets. On Jira:

- **Map**: a `Workstream` in `CAAIL`, holding the Notes / Decisions-so-far / Fog
  body. The Workstream type is what this project already uses for exactly this
  "set of related work toward a larger deliverable" shape.
- **Child ticket**: a `Task` with the map Workstream as its `parent`. Record the
  ticket type as a `wayfinder:<type>` label — `research`, `prototype`,
  `grilling`, or `task`.
- **Blocking**: `acli jira workitem link create --out <blocked> --in <blocker>
  --type Blocks --yes`. A ticket is unblocked when every blocker is Done
  (`statusCategory.key == "done"`, rather than matching a status name).
  `~/.claude/scripts/jira-cache.sh blockers CAAIL` computes this across the whole
  board, and separates tickets whose blockers are ALL Done — those are falsely
  parked, and the dead edges should be removed with `link delete`.
- **Frontier query**: open Tasks under the map Workstream with no open blocker
  and no assignee; first in map order wins.
- **Claim**: assign to self — the session's first write.
- **Resolve**: comment the answer, transition to Done, then append a context
  pointer to the map's Decisions-so-far.

Research findings land on a throwaway `research/<name>` branch with a context
pointer from the ticket, per `/research`. Note that `.gitignore` excludes
`docs/superpowers/`, so design docs written there stay local and are referenced
by path from the ticket rather than committed.
