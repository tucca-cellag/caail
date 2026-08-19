# `ship-pr.sh` reference

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

