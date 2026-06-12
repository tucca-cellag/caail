// Deterministic guard for the matrix-classification-audit workflow's routing.
//
// Two independent assertions, run with: node verify_routing.mjs
//
//  (1) BEHAVIORAL truth-table over the pure routing predicate `needsDefender`
//      — the asymmetric-burden rule: a scope removal, OR a removal of a
//      curator-cited paper, must face the steelman defender; everything else
//      (additive adds, method-accuracy fixes / re-rows on non-cited papers) is
//      decided by skeptics alone. Mirrors adjudicate() in the workflow.
//
//  (2) STRUCTURAL assertion against the real workflow source — that a
//      `taxonomy_gap` can NEVER become an applied removal, because gaps are
//      never spread into the adjudicated `changes` array. This is the
//      non-orphan guarantee, enforced by data-flow isolation rather than a
//      runtime check, so we verify the isolation hasn't been edited away.
//
// Exit non-zero on any failure.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const workflow = join(here, '..', '..', 'workflows', 'matrix-classification-audit.js')
const src = readFileSync(workflow, 'utf8')

let failures = 0
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`) }
  catch (e) { failures++; console.error(`FAIL  ${name}\n      ${e.message}`) }
}

// ── (1) Routing predicate (kept in lockstep with adjudicate() in the workflow) ──
// A change is a "removal" if it drops a paper from a cell entirely.
const isRemoval = (kind) => kind === 'unsupported' || kind === 'not_primary'
// Defender required for scope changes, or any removal of a curator-cited paper.
const needsDefender = (kind, nature, citedByCurators) =>
  nature === 'scope' || (isRemoval(kind) && citedByCurators)
// Final routing: 'missing' (additive) and any change not needing a defender are
// applied by skeptics; otherwise the defender (+ gated domain) decides.
const skepticsSuffice = (kind, nature, citedByCurators) =>
  kind === 'missing' || !needsDefender(kind, nature, citedByCurators)

console.log('(1) routing truth-table')
const TRUTH = [
  // kind,         nature,            cited,  expect skepticsSuffice
  ['missing',      'method-accuracy', false,  true],
  ['missing',      'scope',           false,  true],  // additive add never needs a defender
  ['unsupported',  'method-accuracy', false,  true],  // remove a non-cited wrong-method cell: skeptics
  ['unsupported',  'method-accuracy', true,   false], // remove a CURATOR-CITED paper: defender (re-row instead)
  ['unsupported',  'scope',           false,  false], // scope removal: defender
  ['unsupported',  'scope',           true,   false],
  ['misplaced',    'method-accuracy', false,  true],  // re-row, paper stays in matrix: skeptics
  ['misplaced',    'method-accuracy', true,   true],  // re-row a cited paper is non-destructive
  ['misplaced',    'scope',           false,  false], // area-move on scope grounds: defender
  ['not_primary',  'scope',           false,  false], // matrix removal: defender
  ['not_primary',  'scope',           true,   false],
]
for (const [kind, nature, cited, expected] of TRUTH) {
  check(`${kind}/${nature}/cited=${cited} → skepticsSuffice=${expected}`, () =>
    assert.equal(skepticsSuffice(kind, nature, cited), expected))
}

// ── (2) Structural non-orphan guarantee against the real source ──
console.log('(2) taxonomy_gap non-orphan guarantee (source)')

// The `changes` array is the ONLY thing fed to adjudicate(); extract its literal.
// Anchor on the real closing bracket (4-space indent) — a naive non-greedy match
// would stop at the first inner `|| []` default.
const changesMatch = src.match(/const changes = \[\n([\s\S]*?)\n {4}\]/)
check('changes array literal exists', () => assert.ok(changesMatch, 'could not find `const changes = [...]`'))
const changesBody = changesMatch ? changesMatch[1] : ''

check('changes array never includes taxonomy_gaps', () =>
  assert.ok(!/taxonomy_gaps/.test(changesBody),
    'taxonomy_gaps appears inside the adjudicated `changes` array — it could become an applied removal'))

check('changes array spreads exactly {missing, unsupported, misplaced}', () => {
  // Each spread tags its kind: `...({ kind: 'X', ...c })`.
  const kinds = [...changesBody.matchAll(/kind: '(\w+)'/g)].map((m) => m[1])
  assert.deepEqual([...new Set(kinds)].sort(), ['misplaced', 'missing', 'unsupported'])
})

// not_primary is pushed separately (it's an object, not an array) — still a real change.
check('not_primary is pushed into changes (a real removal path)', () =>
  assert.ok(/changes\.push\(\{ kind: 'not_primary'/.test(src)))

// taxonomy_gaps must be carried on the per-ref RETURN, as a sibling of `applied`,
// never derived from the adjudicated `valid` set.
check('taxonomy_gaps carried on the per-ref return', () =>
  assert.ok(/taxonomy_gaps: \(proposal\.taxonomy_gaps \|\| \[\]\)\.map/.test(src)))

check('applied derives only from adjudicated valid changes', () =>
  assert.ok(/applied: valid\.filter\(\(a\) => a\.applied\)/.test(src)))

// adjudicate() is only ever called on `changes` items, never on taxonomy_gaps.
check('adjudicate is invoked only over the changes array', () => {
  const calls = [...src.matchAll(/adjudicate\(/g)].length
  const defs = [...src.matchAll(/(?:async function|function) adjudicate\(/g)].length
  assert.equal(calls - defs, 1, 'adjudicate should be called exactly once (over changes.map)')
  assert.ok(/changes\.map\(\(c\) => \(\) => adjudicate\(id, c, citedByCurators\)\)/.test(src),
    'adjudicate must be mapped over `changes`, not any other collection')
})

// The Taxonomy phase must gate new rows/columns on a ≥2-member cluster.
console.log('(3) taxonomy aggregation guards')
check('singletons (<2 members) are never warranted', () =>
  assert.ok(/member_ids \|\| \[\]\)\.length < 2.*warranted: false/s.test(src) ||
    /\.length < 2\) return \{ \.\.\.cl, warranted: false/.test(src),
    'a cluster below the ≥2 threshold must be forced warranted:false (parked as a singleton)'))

check('proposed rows/columns require warranted === true', () => {
  assert.ok(/proposed_new_rows: ok\.filter\(\(c\) => c\.axis === 'method' && c\.warranted\)/.test(src))
  assert.ok(/proposed_new_columns: ok\.filter\(\(c\) => c\.axis === 'area' && c\.warranted\)/.test(src))
})

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
