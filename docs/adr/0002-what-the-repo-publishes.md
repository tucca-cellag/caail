---
status: accepted
date: 2026-08-24
---

# What this repository publishes is decided by one test, and it is not about access

`tucca-cellag/caail` is public. Until now nothing stated which of its own working files
belonged in a public repository, so each was decided when it was written and the answers
did not agree: the outreach roster and drafts are gitignored, the design docs are
gitignored, the agent skills are committed, the hooks are committed, and the tracker
conventions are committed. Some of those were deliberate. Some are simply where the file
landed.

**The test, from now on:**

> Is it part of how the library is made and used, or is it how one person organises their
> own time?

The first is published. The second is not.

| Published | Withheld |
| --- | --- |
| The curated content, its schema, and the contracts around it | Project-management mechanics: tracker conventions, ticket workflow, board state |
| The curation methodology, including the parts only members can run | Credentials, and any path that authenticates |
| How to contribute, and how to consume the library (API, skill, plugin) | Outreach: rosters, drafts, replies, relationships |
| Guards that protect anyone who clones the repository | Personal scheduling, prioritisation and working notes |

## Access is not the test, and this is the part most likely to be got wrong

The obvious formulation, *does it help someone who clones the repository*, is wrong, and
the repository already contains the counterexample. The Zotero curation skills only work
for someone inside a private group library, so that test says withhold them. They should
be published anyway.

The reason is what CAAIL is. For a **curated** library the curation method is not
backstage, it is the product: a reader deciding whether to trust a classification is
answered by how classifications are made. Publishing a method nobody else can execute is
still publishing something they can evaluate, and evaluation is most of what a curated
resource is for.

So a file can be entirely unusable by an outside reader and still belong in public. What
decides it is the question the file answers, not who can act on it.

## The test that was actually being applied, and what it let through

Before this ADR the working rule was closer to *is it a secret or a weakness*, taken from
`.claude/rules/publishing.md`. That rule is correct for what it governs, which is
disclosure harm, and it is not a scope rule. Applied as one it passes almost everything,
because most working documents contain neither a secret nor a weakness.

What it passed: roughly 165 lines of tracker mechanics in `docs/agents/issue-tracker.md`,
serving a tracker that is single-user and will not be shared. Nothing in those lines is
sensitive. They simply answer no question a reader or a contributor has.

What it then let through, on 2026-08-24: a section documenting **how to authenticate a
write** to that tracker, added to the same file because the file was already the place
where tracker things went. It was caught by a review round rather than by any rule, and it
was caught on the strength of a reviewer noticing that a public repository was involved at
all. That is the drift this ADR exists to stop: not a leak, but a category boundary nobody
had drawn, so each addition looked like it matched the file it was joining.

## Considered options

**Access-gating: does it help someone who clones.** Rejected above. Falsified by the
Zotero skills, which fail the test and should be published.

**Secret-or-weakness.** Rejected. It is a disclosure-harm rule, already in force, and it
answers a different question. Keeping it as the scope rule is what produced the state this
ADR corrects.

**Publish everything, and treat the transparency as an asset.** A real option for an open
library, and it was not chosen for a narrow reason: the withheld column contains other
people. Rosters, replies and relationships are not this project's to publish, and a rule
that permits them is wrong however comfortable the rest of the material is.

**Withhold everything operational.** Rejected because it takes the curation methodology
with it, which is the strongest evidence the library has of being careful.

## Consequences

Three follow immediately.

**`docs/agents/issue-tracker.md` splits.** The public file keeps the routing rule, the
GitHub conventions and the publishing constraint. The tracker mechanics move to a
gitignored sibling, which reaches worktrees through `.worktreeinclude`. That mechanism was
verified rather than assumed: every worktree created after that file existed received its
copy, including one created six minutes later, and every worktree predating it did not.
`.worktreeinclude` therefore becomes load-bearing, and is committed for the same reason.

**A gap appears the moment the test is applied.** The Docling ingestion layer is curation
methodology, so it is published by this rule, and it is currently documented nowhere a
reader can reach: not in `CONTRIBUTING.md`, not in `README.md`, not on the site. It exists
in an agent-skill directory and in a private tracker. The work is tracked; explaining it is
not. Filed as CAAIL-316.

**New files get judged, not defaulted.** The test is short enough to state in `CLAUDE.md`,
which is the file that loads every session, so the next borderline document is decided
rather than placed.

## Implementation status

Accepted, delivery partial.

- The test is stated here and in `CLAUDE.md`. **Done.**
- The mechanism: the `*.local.md` ignore rule, and `.worktreeinclude` committed so those
  companions reach worktrees. **Done, here.**
- The first migration under it, splitting `docs/agents/issue-tracker.md`. **Not yet.**
  Follows immediately in its own change, so this decision can be read and argued without
  a 200-line move on top of it.
- The Docling methodology page. **Not started**, tracked as CAAIL-316.
- The rest of the repository has **not** been re-examined against this test. `CLAUDE.md`
  itself carries internal workflow at a size its own hygiene rule flags, and the ship-stage
  skill is borderline under the test. Neither is changed here. Nothing in this ADR should be
  read as a claim that the repository currently complies with it.
