# CAAIL Design System

This document defines the visual language for the CAAIL documentation site (the Astro Starlight app under `site/`). The root Markdown files remain the canonical, GitHub-readable source of truth; the site is a generated navigation layer. Tokens are authored in OKLch in `site/src/styles/tokens.css`; Starlight chrome is mapped in `site/src/styles/starlight-overrides.css`.

## 1. Brand foundation

CAAIL is a project of the **Tufts University Center for Cellular Agriculture (TUCCA)**. The site is **Tufts-forward** — it evokes Tufts through color, typography, and voice — but it is **not** official Tufts identity.

Per Tufts brand policy, sub-units must not create their own logos or lockups, must not use the university seal, and must source official logo artwork only through University Communications. Therefore CAAIL:

- Uses **no fabricated Tufts logo, lockup, or seal**, and no Jumbo-the-elephant mark (Jumbo Athletics IP).
- Credits TUCCA in **text only** (footer: "A project of the Tufts University Center for Cellular Agriculture (TUCCA).").
- Treats "CAAIL" as a plain typographic wordmark (Inter 800, Tufts Dark Blue), not a logo.

## 2. Color system

Two layers with different rules: **chrome** (brand identity) and **data encoding** (chosen for perceptual distinctness and color-vision-deficiency safety, not brand).

### Chrome (light) — Tufts

| Token | Hex | Use |
|---|---|---|
| `--caail-bg` | `#FFFFFF` | page background |
| `--caail-surface` | `#F4F6FA` | cards, ribbons |
| `--caail-border` | `#E2E8F1` | hairlines |
| `--caail-ink` | `#14213D` | body text |
| `--caail-muted` | `#67717F` | secondary text |
| `--caail-primary` | `#002E6D` | Tufts Dark Blue (PMS 294) — headings, solid buttons, wordmark |
| `--caail-primary-hover` | `#013A86` | hover/active |
| `--caail-link` | `#3172AE` | Tufts Digital Blue (AA-rated) — links, focus, active underline |
| `--caail-accent` | `#5E4B3C` | Tufts Brown (PMS 7519) — small text accents only (eyebrows), never large buttons |

Values are authored in OKLch; hexes above are the targets. The Contribute action is a navy **outline** button (Tufts Brown is reserved for small accents, since a solid brown button reads muddy).

### Data encoding

- **Sequential (density):** single-hue navy ramp `--caail-density-0..4` (`#F4F6FA → #C9D7EC → #7E9BC9 → #27579F → #002E6D`). Single-hue lightness is inherently CVD-safe and on-brand. Used for matrix cell shading and any intensity/heatmap.
- **Categorical (7 research areas):** Okabe–Ito (Color Universal Design), CVD-safe:

| Area | Token | Hex |
|---|---|---|
| Media Optimization | `--caail-area-media` | `#0072B2` |
| Cellular Engineering | `--caail-area-cell` | `#009E73` |
| Bioprocess Control | `--caail-area-bioprocess` | `#E69F00` |
| Scaffolding | `--caail-area-scaffolding` | `#56B4E9` |
| Sensory Prediction | `--caail-area-sensory` | `#D55E00` |
| AI Tooling / Methodology | `--caail-area-tooling` | `#CC79A7` |
| AI Evaluation & Benchmarking | `--caail-area-eval` | `#917800` (Okabe–Ito yellow darkened to amber for AA on white) |

**Encoding rules:** color is never the only signal (every area keeps its text label; matrix cells also show the count). All text/background pairs target WCAG-AA (≥4.5:1 body, ≥3:1 large/UI). Categorical colors identify *area* only (legend, column headers, network clusters, metric bars, filter dots); cells use the density ramp.

## 3. Typography

All three faces are open, self-hostable via `@fontsource`. We use a clean modern
grotesque for display (a contemporary "modern AI resource" feel) over Inter body, keeping the
Tufts navy/white palette for brand identity:

- **Display / headings:** `Bricolage Grotesque Variable` (600/700). Fallback `Inter Variable, system-ui, sans-serif`. A characterful modern grotesque used for the hero, section titles, and content headings.
- **UI / body:** `Inter Variable` (400/500/600/700/800). Fallback `system-ui, sans-serif`.
- **Mono:** `JetBrains Mono Variable` — DOIs, accessions, code, dates. Fallback `ui-monospace, monospace`.

Type scale: hero H1 `clamp(2.2rem, 5vw, 3.4rem)` (weight 700, tight line-height); section H2 ~1.05–1.15rem; body 0.95rem; supporting text 0.72–0.8rem; eyebrow 0.72rem uppercase letterspaced. Headings use the display font via `.caail-display` and the Starlight heading override.

## 4. Spacing & layout

- Spacing scale in `rem` increments (0.25 / 0.5 / 0.8 / 1 / 1.5 / 2.5rem).
- Breakpoints: sections grid collapses to one column at `50rem`; the Explorer matrix/side-panel split collapses at `60rem`; the matrix pane scrolls horizontally below `640px` min-width.
- Content width follows Starlight's default container for prose; pages with wide data tables widen the container to fit the table while keeping prose centered at a 45rem measure. The Papers Explorer breaks out to the full content width.
- Layout primitives: centered hero, a 3-column sections grid, and a `1fr 1.15fr` two-column for Start-here / Recently-added.

## 5. Components

- **Header (Starlight):** "CAAIL" wordmark followed by a horizontal **top nav** (Explorer · Datasets · Research Areas · Contributing) via a `SiteTitle` override; **search is a compact, right-aligned control** beside the **GitHub** icon and theme toggle (the header grid is overridden to `1fr auto auto` so the title column grows and search/utilities sit right). Nav links are ghost (weight 500, muted); the active section is navy weight-600 via `aria-current`. The wordmark is **reactive** — a navy→link gradient sweeps across it on hover/focus. Top nav hides below `50rem` (hamburger + drawer take over); left sidebar and right TOC remain.
- **Hero (off-center):** a 2-column layout over a **diagonal CAAIL-blue accent band** (a rotated `.hero-stripe` behind the content, trimgalore-style; `overflow: clip` prevents scroll). Left: Tufts-Brown eyebrow, a giant two-line **gradient-text headline** ("Cell Ag" / "× AI", `clamp(3.2rem, 8.5vw, 6rem)`, weight 700, navy→link `background-clip:text`, the `×` tinted Tufts brown), Inter lede, two pill CTAs (primary "Open the Papers Explorer" + ghost "Browse on GitHub"), and a stat row (papers/tools/databases/species/research areas from `counts.json`); right: a **reactive `HeroGraphic`** (`bioreactor` variant — stirred-tank vessel with rising sparged bubbles, a continuously rotating impeller, and **meat-red suspended cells**; ambient CSS animation + subtle pointer parallax, disabled under reduced-motion). Stacks to one column < `60rem`; the graphic hides < `30rem`. (A `cells` particle-field variant also exists.) Search lives in the header.
- **Sections grid:** six cards (Papers/Software/Databases/Datasets/Research Areas/Talks), each a Phosphor duotone icon + a large display-font count + title + one-line description + a CTA; hover raises the border to `--caail-link`.
- **Start here:** three numbered cards.
- **Recently added:** rows with a JetBrains-Mono date, a Tufts-Brown kind label, the title, and an Okabe–Ito area dot.
- **Papers Explorer:** matrix (method rows × area columns) with Okabe–Ito column-header bars and a legend; cells shaded by the density ramp and labeled with the count; search + area filter; a side panel listing the selected cell's references — each entry shows bold author/year, title + italicized journal, then a mono DOI badge, Code badge (green-tinted), and Data badge (amber-tinted).
- **Buttons:** primary (navy solid **pill**, `border-radius: 999px`), ghost/outline pill, plain ghost. **Badges:** DOI (mono, link-tinted), Code (green-tinted), Data (amber-tinted).
- **Data tables:** rendered Markdown tables are branded in the site layer (canonical Markdown untouched) — navy sticky header, zebra rows, row hover, rounded bordered container, mono `<code>` cells. On table pages the content widens to fit the table while prose stays centered at a 45rem measure. A **Table ⇄ Cards** toggle (persisted) lets desktop readers switch to a card grid; **mobile always renders cards** (cards are derived client-side from the table by cloning cell nodes).
- **Collapsible nav:** fixed edge-tab toggles collapse the left sidebar and (≥72rem) the right TOC to reclaim width; state persists and is applied pre-paint (no flash). Below 72rem the TOC is Starlight's native collapsible "On this page", styled as a tidy bordered bar.
- **Footer:** text-only TUCCA credit + MIT + canonical-on-GitHub, above the default Starlight footer.
- **States:** hover (border/shadow lift), focus (visible outline using `--caail-link`), active (primary-hover), disabled matrix cells (density-0, non-interactive).

## 6. Dark mode

Dark mode uses **OKLch lightness inversion**, toggled by Starlight via `:root[data-theme='dark']`. Surfaces go navy-black (`--caail-bg` ≈ `#0B1220`), `--caail-ink` becomes near-white (`#E8EDF6`), and `--caail-primary` / `--caail-link` shift lighter (≈ `#5B8AD1`) for contrast on dark. The density ramp inverts (light cells become dark, deep cells become bright navy). Because tokens like `--caail-ink` flip with the theme, the Starlight `--sl-color-white` mapping yields correct high-contrast text in both themes. Categorical area colors keep their hue across themes — the Okabe–Ito mid-tones stay legible on the dark surface — and where a tinted element needs more contrast on dark (e.g. the Explorer's Code/Data badges) its foreground is lightened via a `[data-theme='dark']` override. The split of `--sl-color-accent-low` into per-theme values matches Starlight's own per-theme accent handling.

## 7. Motion

Restrained: 150–200ms transitions on hover/active states; optional subtle hero entrance. All non-essential motion is disabled under `prefers-reduced-motion: reduce`. No heavy animation libraries.

## 8. Iconography & imagery

Icons use **Phosphor** (MIT) via `astro-icon`, with a disciplined weight system:

| Context | Weight |
|---|---|
| Sections-grid collection icons | **duotone** (navy) |
| Inline & utility icons (search, filter, external-link, close, nav) | **regular** |
| Active / selected / emphasis states | **bold** |
| GitHub mark | `ph:github-logo` (Starlight `social`) |

No emoji anywhere; large display-font numerals carry much of the visual weight in the hero stats and sections grid. Imagery: a simple favicon (monogram on Tufts navy) and a 1200×630 Open Graph image showing the wordmark + tagline on a Tufts-navy field — no Tufts logo or seal in either.

## 9. Voice & tone

Adapted from Tufts' brand voice: **open and clear, personal and authentic, inclusive and welcoming.** Use clear, conversational language; be thoughtful and concise; demonstrate expertise without an institutional or authoritarian tone. Microcopy favors plain verbs ("Explore the papers", "Browse datasets", "Pick a species") and frames CAAIL as a shared, openly-licensed map of the field.
