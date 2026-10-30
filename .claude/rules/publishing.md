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
repo owner, or security-finding vocabulary. The denial requires the three
questions above to be answered explicitly before anything is retried. A
session link or Claude attribution is denied in any destination, private ones
included, before visibility is resolved.

A destination it *cannot resolve* (no `gh`, no working login, no repository it
can read, or a `gh api` call whose endpoint names no single repository) is not
waved through in silence. It announces the failure and names
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
case, since gists are code by nature, so expect a denial to be common there and
read the three questions before taking any of the routes below.

**It ships in this repo, wired through the committed `.claude/settings.json`,
so it protects anyone who clones, not only the machine it was written on.** A
byte-identical copy at `~/.claude/hooks/` covers every other repo; the global
copy detects the project copy and passes through, so `gh` is never queried
twice. Its libraries are vendored in `.claude/scripts/lib/` from
`~/.claude/scripts/lib/`: `unattended.sh`, which tells an attended session from
a subagent and holds the override handling, and the shared shell classifier it
loads beside itself (`shsurface.sh` and the `shsurface.py` parser it runs). Each
is looked for in the repo first, then under `~/.claude`, so a clone with no
`~/.claude` still has them. If `unattended.sh` loads from neither place, the
hook cannot tell who is calling and blocks as it would for a subagent: every
denial is final, with no override file and no prompt, until the file is back
(ClaudeDotFiles #334). If the classifier loads from neither place, the hook
refuses every publish whose body sits in a file. If it loads but python3 or
`shsurface.py` is missing or cut short, the classifier hands the command back
unparsed, and body-file paths are read from the raw text.
`check-public-publish.test.py` checks the hook and the three libraries against
their global twins wherever those exist. Keep them in sync (`diff` them); this
file is likewise mirrored at `~/.claude/docs/rules/publishing.md`, which is the
path the hook itself cites. **Not** `~/.claude/rules/publishing.md`: that is a
condensed always-on summary that points here, so anyone who followed the old
path in this sentence and "resolved" the mismatch would load 120 lines into
every session forever.

A guardrail that lives only in one person's home directory is not a guardrail,
it is a note to self. That is the same defect as citing a path a collaborator
does not have.

**An attended session's denial asks no question (ClaudeDotFiles #212).**
Both denies name the fix: strip the session link or attribution, or revise the
payload to drop the flagged content, and route it privately where one of the
three questions fails. Then they say to reformulate and run it again. In auto
mode that is not always enough: the classifier can refuse the override file as
a bypass, and can refuse a cleaned retry this guard has passed, reading a retry
after a denial as routing around it, since the guard's pass does not reach the
classifier. So each denial also names
the route left open when the mode refuses: the session hands the user a command
and the command that reads its result back (a view of what the publish made or
changed, such as `gh issue view <number> --comments` or
`gh release view <tag>`), the user runs the first with `!`, and the session runs
the read-back. The denial text itself names Benji, the maintainer, since it is
the global copy byte for byte.

A command run with `!` never passes through this hook, so the two denies differ
in what may go to the user. The provenance deny is the last check: its route takes
the reformulated command or the one its override would let through, and it
names one case that may run as written, a payload for which all three questions
are clear. The leak deny runs ahead of the visibility check and the provenance
scan, so its route takes only a reformulated command the guard has passed,
never the blocked one. A false positive there, such as a body quoting an
attribution trailer to discuss the rule, is what its override is for, since the
rest of the guard still runs after it. A body the guard could not read is never
a false positive: use the form its signal names.

Each denial ends with its override line, for when the user has already said the
exact command must run as written. Each deny names its own file:
`/tmp/claude-publish-leak-override-<sha16>` for the session-link and attribution
deny, `/tmp/claude-publish-override-<sha16>` for the provenance deny. Touch the
file or files the deny names, then re-run within 60 seconds: single-use, pinned
to one exact command, and each skips only its own deny. Don't get around the
hook by other means, and don't assume a false positive without checking.

**A subagent gets neither override (ClaudeDotFiles #302).** Its denials name no override file,
and when it runs the command, both files are removed and ignored. Its way
through is a revised payload without the flagged content, with the three
questions applied to the revision; anything it cannot revise away goes in its
report to its caller, not into the publish.
