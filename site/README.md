# CAAIL site

The CAAIL documentation website (Astro Starlight). It is a generated navigation layer over the canonical Markdown in the repo root — never a replacement; site work must not modify the canonical `*.md` files.

- Design system: see the repo-root `DESIGN.md`.
- Project/build notes for agents: see the "Documentation site (`site/`)" section of the repo-root `CLAUDE.md`.
- Requires Node ≥ 22.12 (pinned in `.nvmrc`).

```sh
pnpm install          # first time
pnpm dev              # local preview at /caail/
pnpm build            # static build to dist/
pnpm test:e2e         # Playwright e2e + axe a11y
```

M0 renders from committed sample fixtures in `src/content/data/*.sample.json`; a build-time parser (later milestone) will emit the real data in the same shape.
