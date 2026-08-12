---
name: caail-install
description: Set up CAAIL for whichever agent is running: query it immediately with nothing installed, or install it into Claude Code (plugin marketplace), Cursor, Windsurf, or any assistant that can fetch a URL so it persists across sessions. Use when the user asks to use, set up or install CAAIL, or says "install CAAIL for me".
---

# Set up CAAIL

The Cellular Agriculture AI Library: a curated map of the AI and machine-learning work in
cellular agriculture. Papers classified by AI method against research area, plus the
software, databases and per-species datasets the field uses.

Everything is static JSON served over HTTPS from GitHub. **There is no account, no
authentication, no rate limit and no server to run**, so the fastest way to use CAAIL is to
fetch it, and installing is only about not having to paste a URL again next time.

Two ways in. Take the first unless the user asked for the second.

## Use it now, with nothing installed

Fetch the manifest and answer from it. Nothing is written anywhere and nothing outlives the
conversation:

<https://raw.githubusercontent.com/tucca-cellag/caail/main/site/public/api/index.json>

It carries the corpus date, every endpoint, and counts each labelled with the population it
counted. Every endpoint under it is a plain GET returning JSON.

For which endpoint answers which question, read the query guide:

<https://raw.githubusercontent.com/tucca-cellag/caail/main/plugin/skills/caail/SKILL.md>

That is the whole zero-install path. Stop here unless the reader wants CAAIL available in
future sessions without pasting a URL.

## Keep it for future sessions

Installing changes nothing about how CAAIL works: it adds no dependency, no service and no
credential. It only puts the query guide where the agent will load it again next time.

## Step 1: work out which client you are in

Do not ask the user to tell you. Determine it, then confirm what you are about to do.

| Signal | Client | Path |
| --- | --- | --- |
| `claude` CLI is on PATH, or you are Claude Code | **Claude Code** | Path A |
| Cursor, Windsurf, Cline, Zed or similar IDE agent | **IDE agent** | Path B |
| Browser assistant with no shell | **No shell** | Path C |

If a shell is available, `claude --version` settles Path A. If it fails or the command
does not exist, you are not in Claude Code — go to Path B.

## Path A — Claude Code (plugin marketplace)

Two commands. Run them, then report what each printed:

```bash
claude plugin marketplace add tucca-cellag/caail
claude plugin install caail@caail
```

`marketplace add` may report that the marketplace is already present. That is not an
error; continue to `install`.

Verify with `claude plugin list` and confirm `caail` appears. The plugin adds one short
skill to the context of every session.

## Path B — IDE agents (Cursor, Windsurf, Cline, …)

These do not implement Claude Code's plugin marketplace, so the two commands above will
fail. Install the skill file instead.

1. Fetch <https://raw.githubusercontent.com/tucca-cellag/caail/main/plugin/skills/caail/SKILL.md>
2. Work out where the client loads project rules from: `.cursor/rules/caail.md` for
   Cursor, `.windsurfrules` for Windsurf, `AGENTS.md` or `CLAUDE.md` for agents that read
   those. If you are unsure which the client uses, ask rather than guess: writing to the
   wrong file leaves the user believing CAAIL is installed when it is not.
3. **Name the file you intend to write and get the user's agreement before writing it.**
   Every one of these paths lives in the user's own repository, and `AGENTS.md` and
   `CLAUDE.md` in particular are usually tracked, shared with collaborators, and already
   full of instructions they wrote themselves. Appending to one is a change to their
   project, not a step in your install. Ask first rather than writing and reporting after.
4. Append; never overwrite. Then say exactly what you added and to which file.

## Path C — no shell (browser assistants)

Nothing can be installed from inside the conversation. Tell the user plainly:

- **claude.ai** — download the skill file and upload it under
  Settings → Customize → Skills → Add → Upload skill. The web app installs skills by
  file upload, not by URL.
- **Anything else** — CAAIL can still be used for the current conversation by fetching
  the skill directly. It will not carry over to a new chat.

## Step 2: confirm it works

Ask CAAIL something that requires the corpus rather than general knowledge:

> Which AI methods has CAAIL indexed for scaffolding, and which method cells are empty?

A correct answer names specific method rows and reports the empty ones with the scope
caveat attached. An answer that lists plausible-sounding papers without citing reference
ids means the skill did not load.

## Rules

- **CAAIL is beta; placements are being re-verified.** The inventory, topic tags and
  per-item metadata are solid, and a method × area placement is a substantive claim about
  the paper — report it as one. Re-verification against full texts tightens precision, so
  allow that an occasional item sits in a closely related cell rather than the ideal one;
  that is very different from it not belonging. Cite the paper itself. `matrix.json`
  carries this as `status` and `placementNote`. Empty cells instead carry `scope`, and
  that caveat is much stronger: absence in CAAIL is weak evidence about the literature.
- **Never claim an install succeeded without verifying it.** Run the check in Step 2, or
  say explicitly that you could not verify.
- **Do not modify a config file you did not read first, and do not write to a tracked one
  without asking.** Several of these paths are shared with the user's own rules and are
  committed to their repository, so an unprompted edit lands in their next diff.
- Endpoints are on `raw.githubusercontent.com`, not GitHub Pages. Code execution
  commonly defaults to allowing package managers only, which covers GitHub but not
  Pages, and on Team and Enterprise plans only an organisation owner can widen that.
