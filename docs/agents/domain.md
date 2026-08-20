# Domain Docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase.

**Layout: single-context.** One `CONTEXT.md` + `docs/adr/` at the repo root.
There are no monorepo signals here — `site/` is the only package, and the
canonical Markdown at the root has no build step at all.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root
- **`docs/adr/`** — read ADRs that touch the area you're about to work in

If any of these files don't exist, **proceed silently**. Don't flag their
absence; don't suggest creating them upfront. The `/domain-modeling` skill
(reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates
them lazily when terms or decisions actually get resolved.

Both now exist: `CONTEXT.md` at the repo root and one ADR,
`docs/adr/0001-matrix-axis-model.md`.

An ADR records a decision, which is not the same as a description of the
repository. ADR-0001 carries an **Implementation status** section splitting what
has landed from what has not; read it before treating any assertion in that file
as true of the code you are about to touch.

## File structure

```
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   │   ├── 0001-matrix-axis-model.md
│   │   └── 0002-....md
│   └── agents/          ← this directory
└── site/
```

## What already carries domain vocabulary

`CONTEXT.md` is deliberately thin, because two other files already hold most of
what a glossary would:

- **`Taxonomy.md`** is the canonical, CAAIL-specific definition of every matrix
  row (AI/ML method) and column (research area), plus the subject themes. It is
  the **trusted** scope source. The `ResearchAreas/*.md` pages are AI-assisted and
  are explicitly *not* a trusted definition source.
- **`CLAUDE.md`** holds the schema rules, the file-routing rules, and the
  architecture of the SQLite authoring backend.

`CONTEXT.md` therefore points at `Taxonomy.md` for the curation vocabulary rather
than restating it — a hand-typed copy of a definition that already exists
elsewhere is exactly the drift this repo's most expensive recurring bug comes
from. Keep it that way when extending it.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal,
a hypothesis, a test name), use the term as defined in `CONTEXT.md`, falling back
to `Taxonomy.md` for curation terms. Don't drift to synonyms the glossary
explicitly avoids.

If the concept you need isn't defined yet, that's a signal — either you're
inventing language the project doesn't use (reconsider) or there's a real gap
(note it for `/domain-modeling`). For the matrix specifically, a genuine method or
area with no matching row or column is **non-destructive**: keep the paper's
current cell and surface a *proposed* new row/column for curator decision. New
rows and columns are never auto-added.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than
silently overriding:

> _Contradicts ADR-0007 (…) — but worth reopening because…_

Decisions already recorded in `CLAUDE.md` carry the same weight as an ADR until
they are migrated. Two worth knowing before proposing changes: the plugin
deliberately carries **no `version` field** (adding one silently pins the plugin
and breaks update delivery), and the structured catalog is **authored in the
SQLite DB, never by hand-editing the generated Markdown** (a hook blocks it and CI
fails on drift).
