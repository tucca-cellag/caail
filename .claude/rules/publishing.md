# Publishing to Public Places

Filing an issue, opening a PR, commenting, cutting a release, or creating a gist
is **publication**. It is outward-facing and effectively irreversible: GitHub
issues can be deleted but pull requests cannot, edit history stays visible to
anyone with read access, and GHArchive captures every public event in real time
into a permanently queryable public dataset. Deleting something ten minutes
later does not unpublish it.

## The failure this exists to prevent

An agent traced a feature into a private third-party repository, correctly
reported *"this is a private repository owned by an individual"*, and that
repo's source code and unmitigated security posture were published into a public
issue tracker anyway. The provenance fact was sitting in context, in plain
English, and was simply never re-consulted at the moment of publishing.

The lesson is not "read more carefully." It is that **knowing something is
private and remembering it at the moment you publish are different acts**, and
only the second one matters.

## Before publishing anything, answer three questions

**1. Provenance — where did every fact come from?**

Content is publishable only if it originates in the repo you are publishing to,
or in a genuinely public source. Anything learned from a private repository, a
third party's source, or an authenticated API for a repo you do not own is
**private by default**. This includes paraphrase and architectural description,
not just verbatim quotes: saying "their backend logs every query before
validation" discloses the same thing as pasting the line that does it.

Reading something with valid credentials is not permission to republish it.

**2. Security — does this describe a weakness in a live service?**

Missing authentication, absent rate limiting, an exposed credential, an
injection path. These follow coordinated disclosure:

- **Someone else's service** → privately to its owner. Never a public tracker,
  never a commit message, never a PR body.
- **Your own service, unpatched** → do not pair the weakness with a live
  hostname or endpoint. Describe the class of problem, fix it, then discuss it.
- **Your own service, patched** → publish freely.

This is independent of repo visibility. A public description of an unauthenticated
live endpoint is harmful whether the tracker is public or not.

**3. Destination — is a public venue right at all?**

Sometimes the honest answer is a private message to whoever owns the code, and
the tracker entry should not exist in either form.

## Commit messages count

A commit message pushed to a public remote is published. So is a branch name.
Rewriting them requires a force-push, and commits referenced by a pull request
stay fetchable by SHA afterwards regardless. Apply the same three questions
before writing them, not after.

## Subagent provenance

Subagents cross trust boundaries silently. An agent asked to trace a feature will
follow it into whatever it can read, including private repos the working repo
merely links to.

- When dispatching an agent that may read outside the working repo, **require it
  to label each finding with its source repository and that repository's
  visibility**.
- When receiving agent output, **carry those labels forward**. A finding whose
  provenance you cannot state is not publishable.
- An agent reporting that a source is private is a hard signal, not context.
  Treat it as a constraint on every downstream use of that finding.

## Privacy disclosures are the deliberate exception

A privacy policy naming the vendors that receive user data is an obligation
(GDPR Art. 13), not a leak. Naming a processor so readers know where their data
goes is correct even when you learned the architecture from a private repo, and
even when the vendor is a third party.

What separates the two: **the policy states what happens to user data; the leak
states how the service is built and where it is weak.** Publish the first, never
the second.

## Enforcement

`.claude/hooks/check-public-publish.sh` (PreToolUse, Bash) resolves the
destination repo's visibility on every `gh issue/pr/release/gist
create|comment|edit`. On a public destination it always injects the visibility
into context, and denies when the payload carries a fenced code block, a foreign
repo owner, or security-finding vocabulary — requiring the three questions above
to be answered explicitly before an override.

A destination it *cannot resolve* (no `gh`, no working login, no repository it
can read) is not waved through in silence. It announces the failure and names
the cause, treats the destination as public because it cannot be ruled out as
one, and scans the payload anyway. Fail-open is kept for the inputs it has
nothing to work with, such as malformed JSON on stdin. The realistic outage is
mundane: `gh auth status` failing is not something anyone checks before typing
`gh issue create`, and a guard that stops guarding without saying so is still
being counted on.

**`gh gist create` always takes that path**, because a gist has no repository to
resolve. That is intended rather than an oversight: a gist is publication, as
this file says, and a fenced code block in one is exactly the pasted-from-a-
private-repo leak the fence signal exists to catch. It is also the noisiest
case, since gists are code by nature, so expect the override to be the normal
answer there and read the three questions before reaching for it.

**It ships in this repo, wired through the committed `.claude/settings.json`,
so it protects anyone who clones — not only the machine it was written on.** A
byte-identical copy at `~/.claude/hooks/` covers every other repo; the global
copy detects the project copy and passes through, so `gh` is never queried
twice. Keep the two in sync (`diff` them); this file is likewise mirrored at
`~/.claude/rules/publishing.md`.

A guardrail that lives only in one person's home directory is not a guardrail,
it is a note to self. That is the same defect as citing a path a collaborator
does not have.

The override is `touch /tmp/claude-publish-override-<sha16>` then an immediate
re-run: single-use, 60-second TTL, pinned to one exact command. Don't bypass the
hook by other means, and don't assume a false positive without checking.
