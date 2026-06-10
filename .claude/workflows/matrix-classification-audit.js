export const meta = {
  name: 'matrix-classification-audit',
  description: 'Methods-grounded re-audit of the Papers.md matrix with an asymmetric burden on scope removals: propose → skeptics → (scope only) steelman defender → gated domain-relevance grounding',
  whenToUse: 'Re-audit / revise Papers.md matrix placements. Invoke via the matrix-classification-audit skill, which builds the args from matrix-corpus.json.',
  phases: [
    { title: 'Bootstrap', detail: 'resolve run inputs (corpus dir, ids, labels) by reading matrix-corpus.json when args are not supplied' },
    { title: 'Propose', detail: 'classification-reviewer reads each paper + CAAIL curation context; proposes keep/add/remove/move/not-primary, each tagged method-accuracy vs scope' },
    { title: 'Verify', detail: '3 independent skeptics try to refute each proposed change' },
    { title: 'Defend', detail: 'scope removals only: an independent steelman argues to KEEP (reads the ResearchAreas page + cited_in_research_areas prior)' },
    { title: 'Ground', detail: 'unresolved scope calls only: a web-research agent scores real-world relevance to the area 1–5' },
    { title: 'Taxonomy', detail: 'pool non-destructive taxonomy gaps; a synthesis agent clusters them; ≥2-member clusters are adversarially verified into proposed new rows/columns' },
  ],
}

// ── Inputs (built from matrix-corpus.json by the skill) ───────────────────────
// args = { dir, ids, methods, areas }
//   dir     absolute path to the per-ref corpus dir (…/matrix-corpus)
//   ids     matrix-participating reference ids to audit
//   methods exact method-row labels; areas exact area-column labels
const SKEPTICS = 3
const AREA_FILE = {
  'Media Optimization': 'MediaOptimization.md', 'Cellular Engineering': 'CellEngineering.md',
  'Bioprocess & Scale-Up': 'Bioprocess.md', 'Scaffolding': 'Scaffolding.md',
  'Sensory Prediction': 'SensoryPrediction.md', 'AI Tooling / Methodology': 'AITooling.md',
  'AI Evaluation & Benchmarking': 'AIEvaluation.md',
}
const BOOTSTRAP_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['dir', 'ids', 'methods', 'areas'],
  properties: {
    dir: { type: 'string' },
    ids: { type: 'array', items: { type: 'integer' } },
    methods: { type: 'array', items: { type: 'string' } },
    areas: { type: 'array', items: { type: 'string' } },
  },
}
const bootstrapPrompt = () => `You are the bootstrap step of the matrix-classification audit. Resolve the run inputs from the repo and return them.

1. Locate and read \`matrix-corpus.json\` at the CAAIL repo root (it is at \`$(pwd)/matrix-corpus.json\` — run \`ls matrix-corpus.json\`, then read it). Shape: {"areas":[…labels…], "refs":[{"id":N, "current_cells":[{"method","area"}], …}]}.
2. \`dir\` = the ABSOLUTE path of the sibling per-ref directory \`matrix-corpus/\` (run \`pwd\`; dir = "<repo>/matrix-corpus").
3. \`ids\`: if \`matrix-corpus/_audit_ids.json\` exists, read it and use its {"ids":[…]} subset; OTHERWISE use every refs[].id.
4. \`methods\` = the sorted distinct values of refs[].current_cells[].method. \`areas\` = the top-level "areas" array verbatim.

Return {dir, ids, methods, areas}.`

// Inputs come from args when the harness delivers them; otherwise a bootstrap
// agent reads matrix-corpus.json from the repo (args is not reliably populated).
let dir, ids, methods, areas
if (args && args.dir && Array.isArray(args.ids) && args.ids.length && Array.isArray(args.methods) && Array.isArray(args.areas)) {
  dir = args.dir; ids = args.ids; methods = args.methods; areas = args.areas
} else {
  phase('Bootstrap')
  const boot = await agent(bootstrapPrompt(), { label: 'bootstrap', phase: 'Bootstrap', schema: BOOTSTRAP_SCHEMA, model: 'sonnet' })
  if (!boot || !boot.dir || !Array.isArray(boot.ids) || !boot.ids.length) {
    throw new Error('matrix-classification-audit: could not resolve inputs from args or matrix-corpus.json')
  }
  dir = boot.dir; ids = boot.ids; methods = boot.methods; areas = boot.areas
}
const repo = dir.replace(/\/+matrix-corpus\/?$/, '')
const reviewerSpec = `${repo}/.claude/agents/caail-classification-reviewer.md`
const methodList = methods.map((m) => `  - ${m}`).join('\n')
const areaList = areas.map((a) => `  - ${a}`).join('\n')
const refFile = (id) => `${dir}/ref-${id}.json`

// ── Schemas ───────────────────────────────────────────────────────────────
const cell = { type: 'object', additionalProperties: false, required: ['method', 'area'], properties: { method: { type: 'string' }, area: { type: 'string' } } }
const PROPOSAL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['id', 'cited_by_curators', 'keep', 'unsupported', 'misplaced', 'missing', 'not_primary', 'taxonomy_gaps'],
  properties: {
    id: { type: 'number' },
    cited_by_curators: { type: 'boolean' },
    keep: { type: 'array', items: cell },
    unsupported: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['method', 'area', 'nature', 'reason'],
      properties: { method: { type: 'string' }, area: { type: 'string' },
        nature: { type: 'string', enum: ['method-accuracy', 'scope'] }, reason: { type: 'string' } } } },
    misplaced: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['method', 'area', 'correct_method', 'correct_area', 'nature', 'reason', 'span'],
      properties: { method: { type: 'string' }, area: { type: 'string' },
        correct_method: { type: 'string' }, correct_area: { type: 'string' },
        nature: { type: 'string', enum: ['method-accuracy', 'scope'] }, reason: { type: 'string' }, span: { type: 'string' } } } },
    missing: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['method', 'area', 'confidence', 'span'],
      properties: { method: { type: 'string' }, area: { type: 'string' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, span: { type: 'string' } } } },
    not_primary: { type: 'object', additionalProperties: false, required: ['flag'],
      properties: { flag: { type: 'boolean' }, reason: { type: 'string' }, suggested_home: { type: 'string' } } },
    taxonomy_gaps: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['axis', 'proposed_label', 'closest_existing', 'why_insufficient', 'span'],
      properties: { axis: { type: 'string', enum: ['method', 'area'] }, proposed_label: { type: 'string' },
        closest_existing: { type: 'string' }, why_insufficient: { type: 'string' }, span: { type: 'string' },
        wikipedia_url: { type: 'string' } } } },
  },
}
const VERDICT_SCHEMA = { type: 'object', additionalProperties: false, required: ['refuted', 'reason'], properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } } }
const DEFENDER_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['can_keep', 'cited_by_curators', 'needs_domain_check', 'argument'],
  properties: {
    can_keep: { type: 'boolean' },
    defensible_cell: { type: 'object', additionalProperties: false, required: ['method', 'area'], properties: { method: { type: 'string' }, area: { type: 'string' } } },
    cited_by_curators: { type: 'boolean' },
    needs_domain_check: { type: 'boolean' },
    argument: { type: 'string' },
  },
}
const DOMAIN_SCHEMA = { type: 'object', additionalProperties: false, required: ['relevance', 'reason'], properties: { relevance: { type: 'integer', minimum: 1, maximum: 5 }, reason: { type: 'string' } } }
const CLUSTER_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['clusters'],
  properties: { clusters: { type: 'array', items: { type: 'object', additionalProperties: false,
    required: ['axis', 'label', 'member_ids', 'rationale'],
    properties: { axis: { type: 'string', enum: ['method', 'area'] }, label: { type: 'string' },
      member_ids: { type: 'array', items: { type: 'integer' } },
      closest_existing: { type: 'string' }, wikipedia_url: { type: 'string' }, rationale: { type: 'string' } } } } },
}
const VERIFY_SCHEMA = { type: 'object', additionalProperties: false, required: ['warranted', 'reason'], properties: { warranted: { type: 'boolean' }, reason: { type: 'string' } } }

// ── Prompts ─────────────────────────────────────────────────────────────────
function proposerPrompt(id) {
  return `You are auditing CAAIL Papers.md matrix reference #${id}.

FIRST read the review contract and follow it exactly: ${reviewerSpec}
THEN read this paper's record: ${refFile(id)} (citation, abstract, methods_text, current_cells, doi/url, has_fulltext, and \`cited_in_research_areas\` — area pages that already cite this paper).

Per the contract: judge from the methods (fetch full text via DOI/OpenAlex only if methods_text is absent/thin and has_fulltext is false). Separate every non-DEFENSIBLE verdict into nature="method-accuracy" (does the paper use this technique?) vs nature="scope" (does it belong in this cell-ag area / the matrix?). For any scope concern you MUST honor \`cited_in_research_areas\`, read the relevant ResearchAreas/<Area>.md, and apply the matrix philosophy — a general method with no cell-ag application is a MOVE to "AI Tooling / Methodology", not a removal; not_primary is only for papers with NO plausible cell-ag connection.

Valid method labels (exact):
${methodList}
Valid area labels (exact):
${areaList}

Set \`cited_by_curators\` = true iff the record's \`cited_in_research_areas\` is non-empty. If it is true, a paper is NEVER a removal: a wrong method row is a MISPLACED **re-row** (keep it in the matrix), not an UNSUPPORTED/NOT-PRIMARY deletion — the curators reference it on purpose.

Return the structured proposal (id=${id}): cited_by_curators (bool), keep[], unsupported[] (each with nature+reason), misplaced[] (nature+correct cell+span), missing[] (additive cross-listings, span+confidence), not_primary{flag,reason,suggested_home}, taxonomy_gaps[] (axis method|area, proposed_label, closest_existing, why_insufficient, span, wikipedia_url for method rows). Tag nature on every unsupported/misplaced.

PRECEDENCE for a wrong-looking cell (taxonomy_gap is the LAST resort): (1) another valid cell exists -> UNSUPPORTED the wrong one; (2) a DIFFERENT existing row/area from the lists fits -> MISPLACED re-row; (3) it is the only cell AND no listed row/area fits the paper's real method/area -> record a taxonomy_gaps entry and do NOT also emit unsupported/not_primary for it (never orphan a legitimate paper — keep the current cell as an approximation). Be conservative on scope; when in doubt, KEEP.`
}

function describe(c) {
  if (c.kind === 'missing') return `ADD #${c.id} to (method="${c.method}", area="${c.area}"). WRONG if the paper does not SUBSTANTIVELY apply that method to that area.`
  if (c.kind === 'unsupported') return `REMOVE #${c.id} from (method="${c.method}", area="${c.area}") [nature=${c.nature}]. WRONG if the paper DOES support that cell (method actually used / area defensible under the column's documented scope).`
  if (c.kind === 'misplaced') return `MOVE #${c.id} from (method="${c.method}", area="${c.area}") to (method="${c.correct_method}", area="${c.correct_area}") [nature=${c.nature}]. WRONG if the original cell is actually correct.`
  return `Declare #${c.id} NOT-PRIMARY and remove it from the matrix (suggested home: ${c.suggested_home || 'n/a'}). WRONG if the paper applies an AI method to a plausibly cell-ag problem, or a ResearchAreas page already cites it.`
}

function skepticPrompt(id, c) {
  return `You are an adversarial skeptic verifying a proposed change to CAAIL's Papers.md matrix. REFUTE it if the evidence does not clearly support it.

Read the paper's record: ${refFile(id)} (citation, abstract, methods_text, current_cells, cited_in_research_areas). If methods are needed and absent, fetch via DOI/OpenAlex.

PROPOSED CHANGE: ${describe({ ...c, id })}
Proposer's evidence: ${c.span || c.reason || '(none)'}

Default to refuted=true when evidence is weak/abstract-only/ambiguous. For a scope-based removal, also count it refuted if \`cited_in_research_areas\` already includes the area or the method is general (belongs in AI Tooling, i.e. a move not a removal). Return {refuted, reason}.`
}

function defenderPrompt(id, c) {
  const areaForRead = c.kind === 'misplaced' ? c.area : c.area
  const fname = AREA_FILE[areaForRead] || '(find the matching ResearchAreas page)'
  return `You are the DEFENDER. An audit proposes a SCOPE-based removal of CAAIL Papers.md reference #${id}. Build the STRONGEST honest case to KEEP it in the matrix. Ties go to KEEP.

Read, in order:
1. ${refFile(id)} — note \`cited_in_research_areas\` and current_cells.
2. ${repo}/ResearchAreas/${fname} — the documented scope of the "${areaForRead}" column (does it cover this paper's method/topic? does it already cite the paper?).
3. ${repo}/CLAUDE.md (the "Papers.md" schema section) — the matrix philosophy: general/foundational methods are in-scope; the "AI Tooling / Methodology" column exists for general methods without a specific cell-ag application; removal is only for papers with NO plausible cell-ag connection.

PROPOSED REMOVAL: ${describe({ ...c, id })}

Decide:
- can_keep = true if there is a defensible matrix placement (the current cell OR a MOVE — e.g. to "AI Tooling / Methodology" for a general method, or another area). Provide defensible_cell.
- cited_by_curators = true if a ResearchAreas page already cites this paper.
- needs_domain_check = true ONLY if you cannot decide from the page/citations/philosophy and the call genuinely hinges on whether the paper's topic is relevant to cell-ag in the real world.
Return {can_keep, defensible_cell?, cited_by_curators, needs_domain_check, argument}.`
}

function domainPrompt(id, c) {
  const area = c.correct_area || c.area
  return `Research question for a curatorial decision: is the topic/method of CAAIL reference #${id} genuinely relevant to cellular-agriculture research area "${area}" (cultivated meat / cell-culture bioprocess)?

Read ${refFile(id)} for what the paper is about, then use WebSearch/WebFetch to assess real-world relevance with CITED sources (prefer cultivated-meat / bioprocess-engineering literature). Distinguish established facts from inference; do not fabricate citations.

Score relevance 1–5 (1 = unrelated to cell-ag; 5 = core to cell-ag ${area}). Return {relevance, reason} with the key citation(s) in the reason.`
}

// ── Per-change adjudication ───────────────────────────────────────────────
async function adjudicate(id, c, citedByCurators) {
  const votes = (await parallel(Array.from({ length: SKEPTICS }, (_, i) => () =>
    agent(skepticPrompt(id, c), { label: `verify:#${id}:${c.kind}:${i + 1}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: 'sonnet' })))).filter(Boolean)
  const refutes = votes.filter((v) => v.refuted).length
  const skeptic_reasons = votes.map((v) => `${v.refuted ? 'REFUTE' : 'OK'}: ${v.reason}`)
  if (votes.length === 0 || refutes > Math.floor(SKEPTICS / 2)) {
    return { change: c, applied: false, disposition: 'dropped-by-skeptics', refutes, skeptic_reasons }
  }
  // A *removal* of a curator-cited paper must beat the defender even on
  // method-accuracy grounds (a wrong method row is a re-row, not a deletion).
  const isRemoval = c.kind === 'unsupported' || c.kind === 'not_primary'
  const needsDefender = c.nature === 'scope' || (isRemoval && citedByCurators)
  // Additive + (method-accuracy on a non-cited paper / a re-row move): skeptics suffice.
  if (c.kind === 'missing' || !needsDefender) {
    return { change: c, applied: true, disposition: 'apply', decidedBy: 'skeptics', refutes, skeptic_reasons }
  }
  // Scope removal, or a removal of a curator-cited paper: must defeat the steelman defender.
  const def = await agent(defenderPrompt(id, c), { label: `defend:#${id}:${c.kind}`, phase: 'Defend', schema: DEFENDER_SCHEMA, model: 'sonnet' })
  if (def && def.can_keep) {
    return { change: c, applied: false, disposition: def.defensible_cell ? 'keep-or-move' : 'keep', decidedBy: 'defender', refutes, skeptic_reasons, defender: def }
  }
  if (def && def.needs_domain_check) {
    const dom = await agent(domainPrompt(id, c), { label: `ground:#${id}:${c.kind}`, phase: 'Ground', schema: DOMAIN_SCHEMA, model: 'sonnet' })
    if (dom && dom.relevance >= 3) {
      return { change: c, applied: false, disposition: 'keep-or-move', decidedBy: 'domain', refutes, skeptic_reasons, defender: def, domain: dom }
    }
    return { change: c, applied: true, disposition: 'apply', decidedBy: 'domain', refutes, skeptic_reasons, defender: def, domain: dom }
  }
  return { change: c, applied: true, disposition: 'apply', decidedBy: 'defender', refutes, skeptic_reasons, defender: def }
}

// ── Run ───────────────────────────────────────────────────────────────────
phase('Propose')
log(`Auditing ${ids.length} matrix references — scope removals carry an asymmetric (defender + gated domain) burden.`)

const results = await pipeline(
  ids,
  (id) => agent(proposerPrompt(id), { label: `propose:#${id}`, phase: 'Propose', schema: PROPOSAL_SCHEMA, model: 'sonnet' }),
  async (proposal, id) => {
    if (!proposal) return { id, error: 'proposer failed' }
    const changes = [
      ...(proposal.missing || []).map((c) => ({ kind: 'missing', ...c })),
      ...(proposal.unsupported || []).map((c) => ({ kind: 'unsupported', ...c })),
      ...(proposal.misplaced || []).map((c) => ({ kind: 'misplaced', ...c })),
    ]
    if (proposal.not_primary && proposal.not_primary.flag) {
      changes.push({ kind: 'not_primary', nature: 'scope', ...proposal.not_primary })
    }
    const citedByCurators = proposal.cited_by_curators === true
    const adjudicated = await parallel(changes.map((c) => () => adjudicate(id, c, citedByCurators)))
    const valid = adjudicated.filter(Boolean)
    return {
      id,
      keep: proposal.keep || [],
      taxonomy_gaps: (proposal.taxonomy_gaps || []).map((g) => ({ id, ...g })),
      applied: valid.filter((a) => a.applied).map((a) => ({ ...a.change, decidedBy: a.decidedBy })),
      kept_by_review: valid.filter((a) => !a.applied && a.disposition !== 'dropped-by-skeptics')
        .map((a) => ({ kind: a.change.kind, method: a.change.method, area: a.change.area, disposition: a.disposition, decidedBy: a.decidedBy, defender: a.defender, domain: a.domain })),
      dropped_by_skeptics: valid.filter((a) => a.disposition === 'dropped-by-skeptics')
        .map((a) => ({ kind: a.change.kind, method: a.change.method, area: a.change.area, refutes: a.refutes })),
    }
  },
)

const clean = results.filter((r) => r && !r.error)
const applied = clean.flatMap((r) => (r.applied || []).map((c) => ({ id: r.id, ...c })))
const keptByReview = clean.flatMap((r) => (r.kept_by_review || []).map((c) => ({ id: r.id, ...c })))
const scopeApplied = applied.filter((c) => c.nature === 'scope' || c.kind === 'not_primary')

// ── Taxonomy phase: cluster the (non-destructive) taxonomy gaps → row/column proposals ──
const gaps = clean.flatMap((r) => r.taxonomy_gaps || [])
let taxonomy = { proposed_new_rows: [], proposed_new_columns: [], singletons: [] }
if (gaps.length) {
  phase('Taxonomy')
  log(`${gaps.length} taxonomy gap(s) flagged across ${clean.length} papers — clustering into row/column proposals.`)
  const gapList = gaps.map((g) => `#${g.id} [${g.axis}] proposed="${g.proposed_label}" closest="${g.closest_existing}" — ${g.why_insufficient}`).join('\n')
  const clusterPrompt = `These are per-paper "no existing matrix row/column fits" signals from a CAAIL matrix audit. Group them into candidate NEW taxonomy entries.

Existing method rows:\n${methodList}\nExisting area columns:\n${areaList}

Gaps:\n${gapList}

Cluster gaps that propose essentially the SAME new method-row (axis=method) or research-area column (axis=area) — normalize wording (e.g. "Bayesian inference" ≈ "probabilistic modeling"). Each cluster: axis, a clean canonical label, member_ids (the #ids), closest_existing row/area, a suggested wikipedia_url for a method row, and a one-line rationale. Do NOT merge genuinely different techniques. Return {clusters}.`
  const clustered = await agent(clusterPrompt, { label: 'taxonomy:cluster', phase: 'Taxonomy', schema: CLUSTER_SCHEMA, model: 'sonnet' })
  const clusters = (clustered && clustered.clusters) || []
  const verified = await parallel(clusters.map((cl) => async () => {
    if ((cl.member_ids || []).length < 2) return { ...cl, warranted: false, verify_reason: 'singleton — below the ≥2 threshold; parked for revisit' }
    const v = await agent(
      `A CAAIL matrix audit proposes a NEW ${cl.axis} ${cl.axis === 'method' ? 'row' : 'column'}: "${cl.label}" (closest existing: ${cl.closest_existing}), supported by refs ${cl.member_ids.join(', ')}. Rationale: ${cl.rationale}.\n\nExisting ${cl.axis === 'method' ? 'method rows' : 'area columns'}:\n${cl.axis === 'method' ? methodList : areaList}\n\nAdversarially check: does an EXISTING ${cl.axis} label already fit these papers (then it is not warranted)? Is the proposed category a real, distinct, recurring technique/area (not a one-off)? Default warranted=false if an existing label is a reasonable home. Return {warranted, reason}.`,
      { label: `taxonomy:verify:${cl.label}`.slice(0, 60), phase: 'Taxonomy', schema: VERIFY_SCHEMA, model: 'sonnet' })
    return { ...cl, warranted: !!(v && v.warranted), verify_reason: v ? v.reason : 'verification failed' }
  }))
  const ok = verified.filter(Boolean)
  taxonomy = {
    proposed_new_rows: ok.filter((c) => c.axis === 'method' && c.warranted),
    proposed_new_columns: ok.filter((c) => c.axis === 'area' && c.warranted),
    singletons: ok.filter((c) => !c.warranted),
  }
  log(`Taxonomy: ${taxonomy.proposed_new_rows.length} proposed row(s), ${taxonomy.proposed_new_columns.length} proposed column(s), ${taxonomy.singletons.length} parked.`)
}

log(`Done. ${applied.length} changes survived review (${scopeApplied.length} scope removals/moves). ${keptByReview.length} scope proposals overturned by the defender/domain steelman. ${gaps.length} taxonomy gap(s).`)

return {
  summary: {
    audited: clean.length,
    applied_total: applied.length,
    applied_method_accuracy: applied.filter((c) => c.nature === 'method-accuracy').length,
    applied_additive: applied.filter((c) => c.kind === 'missing').length,
    applied_scope: scopeApplied.length,
    overturned_scope: keptByReview.length,
    taxonomy_gaps: gaps.length,
    proposed_new_rows: taxonomy.proposed_new_rows.length,
    proposed_new_columns: taxonomy.proposed_new_columns.length,
  },
  applied,
  kept_by_review: keptByReview,
  taxonomy,
  per_ref: clean,
}
