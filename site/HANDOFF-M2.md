# M2 activation (maintainer)

M2 (core site + GitHub Pages deploy) is built and verified locally, but the **live deploy is dormant** until you activate it. Nothing publishes automatically — this matches the agreed "build everything; maintainer activates" boundary.

## What M2 added

- Canonical **Research Areas**, **Datasets** (per species), and **Contributing** prose now render as Starlight pages via a custom content loader — the canonical `.md` files are read in place and **never modified**.
- Internal `.md` links in that prose are rewritten at render time: links to pages the site renders → site routes (`/caail/...`); everything else (Software/Databases/OtherResources, `Papers.md` + its `#N` anchors, missing files) → the canonical GitHub blob URL. External links untouched.
- Curated sidebar: Home · Papers (Explorer) · Datasets (by species) · Research Areas · Contributing.
- Pagefind search (Starlight built-in) indexes the prose.
- `docs.yml` — GitHub Pages build + deploy workflow with an `@lhci/cli` gate: **Accessibility < 90 hard-fails** the landing and explorer; **Performance < 90 hard-fails the landing only** (explorer performance is warn-only until M4 finalizes that island).
- `DESIGN.md` reconciled with the shipped implementation.

## To go live

1. **Push `main`** (M1 + M2 both land):
   ```bash
   git push origin main
   ```
2. **Enable Pages:** repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The **Deploy docs site** workflow runs on the push (and on demand via **Actions → Deploy docs site → Run workflow**). It builds, runs Lighthouse, and deploys.
4. **Verify** `https://tucca-cellag.github.io/caail/`:
   - Landing + sidebar (Papers / Datasets / Research Areas / Contributing).
   - Prose pages render with their titles; the Papers Explorer works.
   - Internal prose links resolve to `/caail/...`; deferred links go to GitHub.
   - Search returns prose hits (type e.g. "bioprocess").

## Local verification (already passing on `feat/core-site-deploy`)

```bash
source ~/.nvm/nvm.sh && nvm use 22
pnpm --dir site test          # 170 vitest
pnpm --dir site lint:papers   # exit 0 (12 advisory APA warnings)
pnpm --dir site build         # 27 pages
pnpm --dir site test:e2e      # 6 passed (incl. a11y, link-rewrite, search)
```

## Notes / follow-ups (not blocking M2)

- The lint's 12 advisory APA-null warnings are pre-existing data shapes; ~6 are a known `parseApa` author-parser limitation (name particles/diacritics) — a candidate follow-up. The UI is unaffected (it renders the always-present `authorsText`).
- M3 will add the Software/Databases/Talks catalog browsers; when those routes exist, move them into the link-rewriter's known-set so prose links to them resolve to site routes instead of GitHub.
- The Datasets section index currently lives at `/caail/datasets/readme/`; a cleaner `/caail/datasets/` index slug is a minor future tidy.
