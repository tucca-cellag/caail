# Triage Labels

Two independent label axes are in use here. Collapsing them loses information: a
ticket can be `wayfinder:research` **and** `needs-info`, or `wayfinder:task`
**and** `ready-for-agent`.

| Axis | Question it answers | Vocabulary | Written by |
| --- | --- | --- | --- |
| **State** | What is blocking this right now? | the five triage roles below | `/triage`, `tracker-backfill` |
| **Type** | What kind of work resolves this? | `wayfinder:<type>` | `/wayfinder`, `tracker-backfill` |

## State — the five triage roles

The skills speak in terms of five canonical triage roles. This table maps those
roles to the actual label strings used in this repo's tracker.

`/triage` operates on **GitHub** here (see `issue-tracker.md`), so these are
GitHub labels on `tucca-cellag/caail`.

| Label in mattpocock/skills | Label in our tracker | Meaning | Exists? |
| -------------------------- | -------------------- | ------- | ------- |
| `needs-triage`  | `needs-triage`    | Maintainer needs to evaluate this issue  | create on first use |
| `needs-info`    | `needs-info`      | Waiting on reporter for more information | create on first use |
| `ready-for-agent` | `ready-for-agent` | Fully specified, ready for an AFK agent | create on first use |
| `ready-for-human` | `ready-for-human` | Requires human implementation           | create on first use |
| `wontfix`       | `wontfix`         | Will not be actioned                     | **already exists** |

When a skill mentions a role ("apply the AFK-ready triage label"), use the
corresponding label string from this table.

`wontfix` already exists on the repo, so apply it rather than creating a
near-duplicate. The other four do not exist yet; create each the first time it is
genuinely needed rather than seeding all four up front.

## Type — the `wayfinder:` labels

Intrinsic to the work, and applicable to **every** ticket however it was created.
A hand-written ticket that predates `/wayfinder` still has a nature; it simply
never got labelled. Use the same strings `/wayfinder` writes so the repo has one
vocabulary rather than two — the prefix names the vocabulary, not the origin.

| Label | The answer is found by | Signals |
| --- | --- | --- |
| `wayfinder:research`  | reading, measuring, or verifying against a primary source | "audit", "measure", "count", "confirm X with the vendor" |
| `wayfinder:prototype` | running something | rehearsing an untested path in a scratch dir to find what breaks |
| `wayfinder:grilling`  | interviewing whoever holds the decision | the blocker is an undecided question |
| `wayfinder:task`      | building it | a concrete deliverable |

`research` versus `task` is the distinction most often got wrong, and it matters:
a brief is a `task`-shaped artifact, so there is nothing to brief when the work is
to go and measure something. **A backlog that types mostly `research` explains a
missing-briefs result** rather than indicating a problem.

These are Jira labels for `CAAIL` tickets (free-text, no configuration needed) and
GitHub labels for `tucca-cellag/caail` issues (created on first use).

## Category labels

The repo already carries `bug` and `enhancement`, which match the two canonical
category roles one-to-one. Use those; do not create new ones. `documentation`,
`duplicate`, `good first issue`, `help wanted`, `invalid` and `question` also
already exist and should likewise be applied rather than duplicated.

## A note on scope

Unlike a solo private repo, `tucca-cellag/caail` is **public** and
`CONTRIBUTING.md` routes outside contributors to file issues here. So `/triage`'s
premise — issues you did not file — is a live case, not a hypothetical.

`ready-for-agent` is additionally useful as a self-directed queue marker: it says
"this issue is specified well enough to hand to an AFK agent", which is worth
knowing regardless of who wrote it.

Edit the right-hand column of the state table to match whatever vocabulary you
actually use.
