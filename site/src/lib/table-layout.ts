/**
 * table-layout.ts — the one definition of "a real data table".
 *
 * Two places have to answer that question and must not answer it differently:
 *
 *   - `components/DataTableViews.astro` decides whether a table gets a
 *     Table ⇄ Cards toggle at all.
 *   - `styles/starlight-overrides.css` decides whether the page holding it
 *     drops Starlight's ~45rem cap and widens to the full content panel.
 *
 * They disagreed. The CSS was `:has(.sl-markdown-content table)` with no width
 * or column test, so ANY table switched the whole page to the full-width
 * layout, while the component required three header cells before it would do
 * anything. `/community/` and `/datasets/readme/` are two-column tables that
 * fit the reading measure comfortably and were widened anyway, with no toggle
 * to explain why the page had changed shape.
 *
 * CSS cannot import a constant, so the numbers cannot be *shared* — but they
 * can be *checked*. `table-layout.test.ts` reads the stylesheet and the
 * component and fails when either stops agreeing with this file, which is the
 * mitigation the root CLAUDE.md asks for in place of a "keep these in sync"
 * comment.
 *
 * The rule the CSS expresses is `th:nth-child(N)` — a table whose header row
 * has an Nth cell has at least N columns.
 *
 * THE TWO SIDES MEASURE SLIGHTLY DIFFERENT THINGS, and this file used to imply
 * they were identical. The component counts every `th` in `thead`, summed
 * across however many rows it has; the CSS asks whether a SINGLE row carries an
 * Nth cell. For a one-row `thead` those agree, which is every table GFM can
 * produce, so the canonical Markdown cannot reach the gap.
 *
 * A MULTI-ROW `thead` can. Two 2-column header rows give the component 4 and
 * the CSS no match, so the toggle appears on a page that stays capped -- the
 * direction `MIN_DATA_TABLE_BODY_ROWS` below calls the bad one, a control that
 * does nothing. Only a component- or MDX-authored table can get there today.
 * Left as a documented boundary rather than repaired, because CSS has no way to
 * sum cells across rows: closing it means changing what the COMPONENT counts,
 * which is a presentation decision rather than a consistency fix.
 */

/**
 * Header cells below which a table is prose furniture rather than data.
 *
 * Three is the floor the Cards view has always used, and it is what separates
 * the per-species inventories (8–9 columns), the benchmark and cross-species
 * tables (6) and the chapter index (4) from the two-column "label → target"
 * tables on `/community/` and `/datasets/readme/`. Raising it is a
 * presentation decision about which tables deserve the width, and belongs with
 * the rest of the table-presentation question rather than here.
 */
export const MIN_DATA_TABLE_COLUMNS = 3;

/**
 * Body rows below which a table is a one-off rather than an inventory.
 *
 * Behaviour-only: a CSS selector cannot count rows, so the stylesheet gates on
 * columns alone and is therefore slightly broader than the component. That is
 * the safe direction — a widened page with no toggle is a layout nobody
 * notices, where a toggle on a capped table is a control that does nothing.
 */
export const MIN_DATA_TABLE_BODY_ROWS = 2;
