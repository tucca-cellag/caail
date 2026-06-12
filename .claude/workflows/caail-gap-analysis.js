// CAAIL field-gap analysis — saved multi-agent workflow.
//
// Run with:  Workflow({ name: 'caail-gap-analysis' })
// Optional args (all have safe defaults matching the run that produced issue #32):
//   { repoPath: '.',                         // repo root, relative to the session cwd
//     categories: ['Papers','Datasets','Software','Databases & Other'],
//     maxCompletenessRounds: 2,              // bounded loop-until-dry
//     recencyFloorYear: 2010 }               // emphasize work since this year
//
// Design notes (see .claude/skills/caail-gap-analysis/SKILL.md for the full operating manual):
//  - Every finder READS the live canonical files first to build its own exclusion set, so the
//    workflow auto-adapts as the repo grows — there is no hardcoded baseline to maintain.
//  - A second agent adversarially verifies each candidate (exists / absent / in-scope / routed).
//  - Finder & critic agents do NOT use agentType:'Explore' — Explore + a forced StructuredOutput
//    schema was the cause of "completed without calling StructuredOutput" failures in the first run.
//  - The workflow PROPOSES matrix cells; the human operator confirms them against the LIVE matrix
//    during flag-cleanup (most "new row/column" flags are false alarms — the synthesizer only sees JSON).

export const meta = {
  name: 'caail-gap-analysis',
  description: 'Find field gaps in CAAIL (papers/datasets/software/databases) and assemble a GitHub issue draft of candidate additions',
  phases: [
    { title: 'Discover', detail: '~16 finders read the live CAAIL files, then research the published field' },
    { title: 'Verify', detail: 'adversarial per-finder verification: exists, absent from repo, in-scope, correctly routed' },
    { title: 'Completeness', detail: 'per-category critics propose missed angles; bounded extra finder wave' },
    { title: 'Synthesize', detail: 'per-category synthesizers format sections; assemble the issue body' },
  ],
}

// ---------- args / config ----------
const A = (typeof args === 'object' && args) ? args : {}
const BASE = A.repoPath || '.'
const RECENCY = A.recencyFloorYear || 2010
const MAX_ROUNDS = Number.isInteger(A.maxCompletenessRounds) ? A.maxCompletenessRounds : 2
const ALL_CATS = ['Papers', 'Datasets', 'Software', 'Databases & Other']
const CATEGORIES = Array.isArray(A.categories) && A.categories.length ? A.categories.filter(c => ALL_CATS.includes(c)) : ALL_CATS
const baseFile = `${BASE}/Papers.md`

// ---------- schemas ----------
const CONF = { type: 'string', enum: ['high', 'medium', 'low'] }
const CANDIDATES_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string' },
          resource_type: { type: 'string', enum: ['paper', 'review', 'dataset', 'benchmark', 'software', 'database', 'course', 'book', 'initiative', 'editorial', 'awesome-list', 'talk', 'playlist', 'other'] },
          identifier: { type: 'string', description: 'DOI (preferred), canonical URL, or data-archive accession' },
          year: { type: 'string' },
          authors_or_org: { type: 'string' },
          relevance: { type: 'string', description: 'one line: why this matters at the AI x cellular-agriculture intersection' },
          target_file: { type: 'string', description: 'e.g. Papers.md, Datasets/Sheep.md, Software.md, Databases.md, OtherResources.md, Talks.md' },
          proposed_placement: { type: 'string', description: 'matrix cell (method x area), species-page cluster, or section heading' },
          confidence: CONF,
        },
        required: ['title', 'resource_type', 'identifier', 'relevance', 'target_file', 'proposed_placement', 'confidence'],
      },
    },
  },
  required: ['candidates'],
}

const VERDICTS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'echo the candidate title so it can be matched' },
          identifier: { type: 'string' },
          verdict: { type: 'string', enum: ['keep', 'drop'] },
          reason: { type: 'string' },
          corrected_target_file: { type: 'string' },
          corrected_placement: { type: 'string' },
          evidence_url: { type: 'string', description: 'authoritative URL confirming existence (doi.org, crossref, publisher, repo, archive)' },
          formatted_citation: { type: 'string', description: 'APA for papers (journal italic *..*, full https://doi.org/), or "" otherwise' },
          code_url: { type: 'string', description: 'associated code repo if any, else ""' },
        },
        required: ['title', 'identifier', 'verdict', 'reason'],
      },
    },
  },
  required: ['verdicts'],
}

const ANGLES_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    angles: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { focus: { type: 'string' }, target_file: { type: 'string' } },
        required: ['focus', 'target_file'],
      },
    },
  },
  required: ['angles'],
}

// ---------- shared prompt fragments ----------
const COMMON = `You are a deep-research finder for CAAIL (Cellular Agriculture AI Library), a curated library at the intersection of cellular agriculture (cultivated meat/seafood, cell-culture media, scaffolding, bioprocess, sensory/flavor) and AI/ML. You are running with the CAAIL repository root as your working directory.

HARD RULES:
- Only propose resources at the AI/ML x cellular-agriculture intersection (or foundational AI/biology resources CAAIL explicitly catalogues as substrate). Reject generic AI or generic biology with no plausible cell-ag application.
- Emphasize work since ${RECENCY} (older only if a glaring foundational omission).
- DEDUP IS MANDATORY. Before proposing any item, confirm it is NOT already in CAAIL: Read the relevant canonical file(s) under "${BASE}" and Grep for the DOI / tool name / accession. If present, do NOT propose it.
- For papers, the identifier MUST be a DOI when one exists (bare DOI or full https://doi.org/ URL). Prefer peer-reviewed + strong preprints (bioRxiv/arXiv).
- Provide a real, resolvable identifier. Do not fabricate. If unsure an item exists, omit it.
- Use scholarly tools where helpful: load them via ToolSearch (e.g. "select:WebSearch,WebFetch" then Scite search_literature, bioRxiv search_preprints, PubMed search_articles, or WebFetch the OpenAlex/Crossref API). Be polite to small APIs (brief pauses between bursts).
- Aim for QUALITY over volume: 5-20 strong, correctly-deduped candidates beats a long noisy list. Return at most 25.`

// ---------- finder specs ----------
const PAPER_FINDERS = [
  { id: 'p-media', label: 'papers:media-optimization', read: [baseFile, `${BASE}/ResearchAreas/MediaOptimization.md`], focus: 'AI/ML for cell-culture MEDIA OPTIMIZATION and serum-free formulation (Bayesian optimization, active learning, DOE+GA, DNN surrogates, explainable ML) for mammalian/fish/avian cell lines relevant to cultivated meat. Column = Media Optimization.' },
  { id: 'p-celleng', label: 'papers:cell-engineering', read: [baseFile, `${BASE}/ResearchAreas/CellEngineering.md`], focus: 'AI/ML for CELLULAR ENGINEERING: single-cell RNA-seq analysis (clustering, batch correction, cell-type annotation), regulatory-DNA / promoter design with generative models, gene-expression inference, cell-line characterization. Column = Cellular Engineering.' },
  { id: 'p-bioproc', label: 'papers:bioprocess-scaffold', read: [baseFile, `${BASE}/ResearchAreas/Bioprocess.md`, `${BASE}/ResearchAreas/Scaffolding.md`], focus: 'AI/ML for BIOPROCESS CONTROL (bioreactor modeling, CFD surrogates, fermentation optimization, soft sensors, NIRS/PAT, digital twins) AND SCAFFOLDING (3D-bioprinting quality prediction, scaffold/mould design, tissue-property prediction). These matrix columns are often sparse - hunt hard. Columns = Bioprocess Control, Scaffolding.' },
  { id: 'p-sensory', label: 'papers:sensory-flavor', read: [baseFile, `${BASE}/ResearchAreas/SensoryPrediction.md`], focus: 'AI/ML for SENSORY / FLAVOR / TEXTURE PREDICTION relevant to cultivated/alt meat: olfaction models, volatile/aroma prediction, taste (bitter/umami) prediction, hyperspectral off-flavor detection, texture prediction, electronic-nose/tongue ML, flavoromics. Column = Sensory Prediction.' },
  { id: 'p-fm', label: 'papers:foundation-models', read: [baseFile, `${BASE}/ResearchAreas/AITooling.md`], focus: 'FOUNDATION MODELS / VIRTUAL CELL / single-cell foundation models / perturbation & cell-state prediction / multi-omics LLMs / protein & DNA language models. Fast-moving. Column = AI Tooling / Methodology (or Cellular Engineering if applied). Rows = the Foundation Models families.' },
  { id: 'p-agents', label: 'papers:ai-agents', read: [baseFile, `${BASE}/ResearchAreas/AITooling.md`], focus: 'LLM/AI AGENTS for biology & discovery: scientific-literature agents, general-purpose biomedical agents, chemistry/synthesis agents, domain-specific bio agents, robot scientists & autonomous lab automation, agent infrastructure (frameworks, MCP, knowledge graphs). Column = AI Tooling / Methodology.' },
  { id: 'p-classic-reviews', label: 'papers:classic-ML+reviews', read: [baseFile, `${BASE}/ResearchAreas/AIEvaluation.md`], focus: 'TWO targets: (a) CLASSIC ML methods (SVM, K-Nearest Neighbors, Genetic Algorithms, Ensemble/Random Forest, Reinforcement Learning) APPLIED to any cell-ag research area - these matrix rows are often near-empty and need fills; (b) REVIEWS & PERSPECTIVES / position papers surveying AI in cultivated meat / cellular agriculture / food-tech (these go to the Reviews & Perspectives section, not the matrix). Also new AI/agent EVALUATION-methodology papers (verifiers, benchmark methodology).' },
]
const DATASET_FINDERS = [
  { id: 'd-species', label: 'datasets:underserved-species', read: [`${BASE}/Datasets/Sheep.md`, `${BASE}/Datasets/Goat.md`, `${BASE}/Datasets/Duck.md`, `${BASE}/Datasets/Turkey.md`, `${BASE}/Datasets/README.md`], focus: 'Sequencing/omics datasets (scRNA-seq, snRNA-seq, ATAC-seq, proteomics, metabolomics, multi-omics) for UNDERSERVED cultivated-meat species: SHEEP, GOAT, DUCK, TURKEY - especially satellite cells / myoblasts / myogenesis / adipogenesis / embryonic stem cells / meat-quality omics. Provide GEO/SRA/ENA/CNCB accessions.' },
  { id: 'd-aqua', label: 'datasets:aquaculture-invertebrate', read: [`${BASE}/Datasets/Fish.md`, `${BASE}/Datasets/Crustacean.md`, `${BASE}/Datasets/Mollusk.md`], focus: 'Single-cell ATLASES and GENOME-SCALE METABOLIC MODELS plus muscle/adipocyte omics for AQUACULTURE & INVERTEBRATE species (teleost fish per-species, shrimp/crab/crayfish CRUSTACEANS, mussel/scallop/oyster MOLLUSKS). Also postmortem/sensory omics for these taxa. Provide accessions or GEM repository/DOI.' },
  { id: 'd-bench', label: 'datasets:ai-benchmarks', read: [`${BASE}/Datasets/Benchmarks.md`, baseFile], focus: 'NEW AI/ML BENCHMARK DATASETS relevant to biology / single-cell / agents / scientific reasoning / cultivated-meat (the bundled-DATA kind: questions/scenarios/spectra/sequences + bundled scoring). Find ones NOT yet listed. Provide the data home (HF/GitHub/Zenodo).' },
  { id: 'd-ref', label: 'datasets:reference-corpora', read: [`${BASE}/Datasets/HumanReference.md`, `${BASE}/Datasets/CHOReference.md`, `${BASE}/Datasets/README.md`], focus: 'Large REFERENCE/PRETRAINING corpora & cross-species substrate: human/mouse single-cell pretraining corpora, large perturbation atlases (Perturb-seq/Tahoe-style), virtual-cell training atlases, CHO bioprocess datasets, growth-factor thermostability/characterization datasets, media-component datasets. Provide the canonical data home.' },
]
const SOFTWARE_FINDERS = [
  { id: 's-ai', label: 'software:ai-agents-fm', read: [`${BASE}/Software.md`], focus: 'Open-source AI-AGENT / FOUNDATION-MODEL / MCP-SERVER software relevant to biology & cell-ag: biomedical agent frameworks, single-cell foundation models, virtual-cell tooling, perturbation predictors, scientific-discovery agents, MCP servers exposing bio databases/tools, agentic skills libraries. Find tools NOT already in Software.md.' },
  { id: 's-model', label: 'software:modeling-massspec', read: [`${BASE}/Software.md`], focus: 'Open-source software for METABOLIC MODELING (constraint-based/kinetic/GEM reconstruction), BIOPROCESS/CFD simulation, MULTI-OMICS/single-cell analysis pipelines, and MASS-SPEC / CHEMOMETRICS / SENSORY analysis. Find tools NOT already listed.' },
]
const OTHER_FINDERS = [
  { id: 'o-db', label: 'databases:repos-ontologies', read: [`${BASE}/Databases.md`], focus: 'QUERY/LOOKUP resources for Databases.md: sequence/expression repositories, livestock multi-tissue atlases (GTEx-style), protein/structure DBs, single-cell reference atlases, pathway/metabolism DBs & model repositories, MS spectral libraries, chemistry/compound DBs, flavor/taste DBs, ontologies, ecosystem/industry directories, benchmark leaderboards. Find ones NOT already listed.' },
  { id: 'o-edu', label: 'other:courses-books-initiatives', read: [`${BASE}/OtherResources.md`], focus: 'OtherResources.md material: university COURSES on cell-ag/AI-for-bio, BOOKS, ECOSYSTEM INITIATIVES & funding programs (New Harvest, GFI, university centers/consortia), journal EDITORIALS & opinion/news on AI in science/cultivated meat, and curated AWESOME-LISTS / bibliographies. Find items NOT already listed.' },
  { id: 'o-talks', label: 'other:talks-playlists', read: [`${BASE}/Talks.md`, `${BASE}/Primers/CellAg.md`, `${BASE}/Primers/AI.md`], focus: 'TALKS / lectures / webinars / learning PLAYLISTS for Talks.md and the Primers: recorded talks on applied AI/ML for cellular agriculture, AI agents & foundation models for biology, virtual cell, and beginner-friendly YouTube playlists/courses suitable for onboarding. Prefer YouTube/canonical video URLs. Find items NOT already listed.' },
]
const FINDERS_BY_CAT = {
  'Papers': PAPER_FINDERS, 'Datasets': DATASET_FINDERS, 'Software': SOFTWARE_FINDERS, 'Databases & Other': OTHER_FINDERS,
}
const ALL_FINDERS = CATEGORIES.flatMap(cat => (FINDERS_BY_CAT[cat] || []).map(f => ({ ...f, category: cat })))

const READ_BY_CAT = {
  'Papers': [baseFile, `${BASE}/ResearchAreas/AITooling.md`, `${BASE}/ResearchAreas/AIEvaluation.md`],
  'Datasets': [`${BASE}/Datasets/README.md`, `${BASE}/Datasets/Benchmarks.md`],
  'Software': [`${BASE}/Software.md`],
  'Databases & Other': [`${BASE}/Databases.md`, `${BASE}/OtherResources.md`, `${BASE}/Talks.md`],
}

function finderPrompt(f) {
  return `${COMMON}

YOUR ASSIGNMENT (${f.category}): ${f.focus}

Step 1 - build your exclusion set: Read these CAAIL files and skim what already exists: ${f.read.join(', ')}. Grep them for candidate identifiers as you research.
Step 2 - research the published field (since ${RECENCY}) for resources matching your assignment that are ABSENT from CAAIL.
Step 3 - return ONLY deduped, verified-to-exist candidates via the structured schema. For each set target_file and proposed_placement precisely (for papers: the method-row x area-column matrix cell, or "Reviews & Perspectives"; for datasets: the species/reference page; for software/databases: the application-area heading). Mark confidence honestly.`
}

function verifyPrompt(category) {
  return `You are an adversarial verifier for CAAIL gap candidates (category: ${category}). You did NOT find these; your job is to try to REJECT each one. Default to drop when uncertain. You run with the CAAIL repository root as your working directory.

For EACH candidate below, check:
1. EXISTS & metadata correct - confirm via an authoritative source (papers: WebFetch https://doi.org/<doi> or https://api.crossref.org/works/<doi> or the OpenAlex API; software: the GitHub repo / canonical site; datasets: the GEO/SRA/ENA/CNCB/Zenodo/HF archive page). A prior search summary is NOT sufficient evidence. Record evidence_url. If you cannot confirm it exists, verdict=drop.
2. ABSENT from CAAIL - Grep the proposed target file under "${BASE}" (and Papers.md for papers) for the DOI / tool name / accession / title. If already present, verdict=drop (reason: duplicate).
3. IN SCOPE - genuinely at the AI x cellular-agriculture intersection (or a substrate CAAIL catalogues). If generic/irrelevant, verdict=drop.
4. CORRECT ROUTING - if kept, set corrected_target_file and corrected_placement (fix mis-routing; apply CAAIL's Datasets-vs-Databases-vs-Software-vs-OtherResources split and the benchmark Paper/Dataset/Database triangle). For papers, produce a clean APA formatted_citation (journal italic *..*, full https://doi.org/ link, all authors) and code_url if the paper has an associated public code repo.

Be strict but fair: a real, in-scope, absent, correctly-routed resource should be kept. Return one verdict per candidate (echo title + identifier).`
}

// ---------- helpers ----------
function normId(s) {
  if (!s) return ''
  let x = String(s).trim().toLowerCase()
  x = x.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
  x = x.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return x
}
function mergeKept(results) {
  const kept = []
  for (const r of results) {
    if (!r) continue
    const cands = r.candidates || [], verdicts = r.verdicts || []
    const byId = new Map(), byTitle = new Map()
    for (const v of verdicts) {
      if (v.identifier) byId.set(normId(v.identifier), v)
      if (v.title) byTitle.set(v.title.trim().toLowerCase(), v)
    }
    for (const c of cands) {
      const v = byId.get(normId(c.identifier)) || byTitle.get((c.title || '').trim().toLowerCase())
      if (!v || v.verdict !== 'keep') continue
      kept.push({
        category: r.spec.category, title: c.title, resource_type: c.resource_type,
        identifier: c.identifier, year: c.year || '', authors_or_org: c.authors_or_org || '',
        relevance: c.relevance, target_file: v.corrected_target_file || c.target_file,
        proposed_placement: v.corrected_placement || c.proposed_placement, confidence: c.confidence,
        evidence_url: v.evidence_url || '', formatted_citation: v.formatted_citation || '',
        code_url: v.code_url || '', found_by: r.spec.id,
      })
    }
  }
  return kept
}
function dedup(items) {
  const seen = new Set(), out = []
  for (const it of items) {
    const key = normId(it.identifier) || ('t:' + (it.title || '').trim().toLowerCase())
    if (seen.has(key)) continue
    seen.add(key); out.push(it)
  }
  return out
}

// ---------- PHASE A + B: discover then verify, pipelined per finder ----------
phase('Discover')
log(`Launching ${ALL_FINDERS.length} finders across: ${CATEGORIES.join(' / ')} (since ${RECENCY})`)

const finderResults = await pipeline(
  ALL_FINDERS,
  (f) => agent(finderPrompt(f), { label: f.label, phase: 'Discover', schema: CANDIDATES_SCHEMA })
            .then(r => ({ spec: f, candidates: (r && r.candidates) || [] })),
  (res, f) => {
    const cands = (res && res.candidates) || []
    if (!cands.length) return { spec: f, candidates: [], verdicts: [] }
    return agent(`${verifyPrompt(f.category)}\n\nCANDIDATES (JSON):\n${JSON.stringify(cands, null, 2)}`,
                 { label: `verify:${f.id}`, phase: 'Verify', schema: VERDICTS_SCHEMA })
      .then(v => ({ spec: f, candidates: cands, verdicts: (v && v.verdicts) || [] }))
  }
)

let kept = dedup(mergeKept(finderResults))
log(`Phase A/B complete: ${kept.length} verified, deduped gap candidates`)

// ---------- PHASE C: completeness sweep (bounded) ----------
phase('Completeness')
for (let round = 1; round <= MAX_ROUNDS; round++) {
  const coverageByCat = {}
  for (const c of CATEGORIES) coverageByCat[c] = kept.filter(k => k.category === c).map(k => `${k.title} | ${k.identifier}`)

  const critics = await parallel(CATEGORIES.map(cat => () =>
    agent(`You are a completeness critic for the CAAIL gap analysis (category: ${cat}). We have ALREADY surfaced these NEW gap candidates this run (titles | identifiers):\n${(coverageByCat[cat] || []).join('\n') || '(none)'}\n\nAlready-catalogued items live in ${READ_BY_CAT[cat].join(', ')} (skim if useful). Identify up to 4 SPECIFIC subfields, modalities, methods, species, or recent venues that a thorough ${cat} gap-sweep likely MISSED and that plausibly contain AI x cellular-agriculture resources absent from CAAIL. Be concrete (e.g. "RL for fed-batch bioreactor control", "scallop adductor single-cell atlas", "electronic-tongue ML for umami"). If coverage is already saturated, return an empty list.`,
      { label: `critic:${cat}`, phase: 'Completeness', schema: ANGLES_SCHEMA })
      .then(r => ({ cat, angles: (r && r.angles) || [] }))
  ))

  const angleSpecs = []
  for (const c of critics.filter(Boolean)) {
    for (const a of c.angles.slice(0, 4)) {
      angleSpecs.push({ id: `sweep-r${round}-${angleSpecs.length}`, label: `sweep:${a.focus.slice(0, 40)}`, category: c.cat, focus: a.focus, read: READ_BY_CAT[c.cat] })
    }
  }
  if (!angleSpecs.length) { log(`Round ${round}: critics found no new angles - completeness reached`); break }
  log(`Round ${round}: chasing ${angleSpecs.length} additional angles`)

  const sweepResults = await pipeline(
    angleSpecs,
    (f) => agent(finderPrompt(f), { label: f.label, phase: 'Completeness', schema: CANDIDATES_SCHEMA })
              .then(r => ({ spec: f, candidates: (r && r.candidates) || [] })),
    (res, f) => {
      const cands = (res && res.candidates) || []
      if (!cands.length) return { spec: f, candidates: [], verdicts: [] }
      return agent(`${verifyPrompt(f.category)}\n\nCANDIDATES (JSON):\n${JSON.stringify(cands, null, 2)}`,
                   { label: `verify:${f.id}`, phase: 'Completeness', schema: VERDICTS_SCHEMA })
        .then(v => ({ spec: f, candidates: cands, verdicts: (v && v.verdicts) || [] }))
    }
  )

  const before = kept.length
  kept = dedup([...kept, ...mergeKept(sweepResults)])
  const added = kept.length - before
  log(`Round ${round}: added ${added} new verified candidates (total ${kept.length})`)
  if (added === 0) { log(`Round ${round}: dry - stopping completeness sweep`); break }
}

// ---------- PHASE D: synthesize ----------
phase('Synthesize')
const byCat = {}, byTargetFile = {}
for (const k of kept) {
  byCat[k.category] = (byCat[k.category] || 0) + 1
  byTargetFile[k.target_file] = (byTargetFile[k.target_file] || 0) + 1
}

const SYNTH = [
  { cat: 'Papers', guidance: 'Group by proposed matrix cell (Method row x Area column) and a separate "Reviews & Perspectives" subsection. For each paper give: APA formatted_citation (use the provided formatted_citation), the DOI as a full https://doi.org/ link, code_url as a `> **Code**:` line if present, and note which matrix cell it populates - FLAG if it would fill a currently-EMPTY cell. NOTE: cell labels you propose may not match the live matrix exactly; the human operator re-checks them. Order high->low confidence within groups.' },
  { cat: 'Datasets', guidance: 'Group by target species/reference page (e.g. Datasets/Sheep.md). For each: name, accession/identifier, one-line description, and the species-page cluster it belongs to. Call out new GEMs and new single-cell atlases specifically.' },
  { cat: 'Software', guidance: 'Group by Software.md application-area heading. For each: name as a markdown link to the canonical URL + one-line of what it is and the cell-ag relevance.' },
  { cat: 'Databases & Other', guidance: 'Group by target file then section (Databases.md app-area, OtherResources.md section, Talks.md section, Primers). For each: name as a markdown link + one line. Keep Databases vs OtherResources vs Talks routing correct.' },
]

const sections = await parallel(SYNTH.filter(s => CATEGORIES.includes(s.cat)).map(s => () => {
  const items = kept.filter(k => k.category === s.cat)
  if (!items.length) return Promise.resolve({ cat: s.cat, md: `### ${s.cat}\n\n_No new verified gaps surfaced in this category._\n` })
  return agent(`You are assembling the "${s.cat}" section of a GitHub issue titled "CAAIL field-gap analysis" for the tucca-cellag/caail repo. Produce clean GitHub-flavored Markdown for THIS category only.

Formatting guidance: ${s.guidance}

Rules:
- Honor CAAIL conventions (APA, journal italic *..*, full https://doi.org/ URLs).
- Render EXACTLY ONE markdown checkbox ("- [ ] ...") per item in the JSON. Do NOT merge, group-away, or omit any item, and do not invent items not in the JSON — the rendered checkbox count must equal the number of items provided (${items.length}).
- Each item shows a confidence tag (High/Medium/Low) and its evidence URL.
- Use H3 for the category and H4 for sub-groups. This is an actionable checklist for maintainers.

VERIFIED ITEMS (JSON, ${items.length} items):
${JSON.stringify(items, null, 2)}`,
    { label: `synth:${s.cat}`, phase: 'Synthesize', schema: { type: 'object', additionalProperties: false, properties: { markdown: { type: 'string' } }, required: ['markdown'] } })
    .then(r => ({ cat: s.cat, md: (r && r.markdown) || '' }))
}))

const total = kept.length
const summaryRows = CATEGORIES.map(c => `| ${c} | ${byCat[c] || 0} |`).join('\n')
const fileRows = Object.entries(byTargetFile).sort((a, b) => b[1] - a[1]).map(([f, n]) => `| \`${f}\` | ${n} |`).join('\n')
const sectionMd = CATEGORIES.map(c => {
  const s = sections.filter(Boolean).find(x => x.cat === c)
  return s ? s.md : `### ${c}\n\n_(no output)_\n`
}).join('\n\n---\n\n')

const body = `# CAAIL field-gap analysis: candidate additions (papers, datasets, software, databases & other)

> Auto-generated by a multi-agent deep-research sweep. Each candidate was found by one agent and independently verified by a second (existence confirmed against an authoritative source, confirmed absent from the repo, scope- and routing-checked). Treat as a **reviewed shortlist**, not a final decision — confirm each against the canonical source and CAAIL schema before adding. Emphasis on work since ${RECENCY}.

## Summary

**${total} verified gap candidates** across ${CATEGORIES.length} categories.

| Category | New candidates |
| --- | --- |
${summaryRows}

### By target file

| Target file | New candidates |
| --- | --- |
${fileRows}

## How to use this issue

- Each item is a checkbox; tick as you add it. Add papers and their matrix cells **in the same commit** (the #1 CAAIL mistake is matrix↔references drift).
- Papers flagged as filling an **empty matrix cell** are the highest-leverage additions — but the proposed cell labels were generated without the live matrix in view, so **verify every "new row/column/empty cell" claim against the current \`Papers.md\` header** before integrating (most are false alarms; the row/column usually already exists).
- A candidate's confidence reflects the verifier's certainty it exists, is in-scope, and is absent — **Low** items especially warrant a human check.
- Complementary axis (not covered here): the repo↔Zotero reconciliation handled by the \`zotero-collection-scope\` and \`papers-dataset-audit\` skills. This issue is a *field* sweep, not a Zotero sync.

---

${sectionMd}

---

_Generated via the \`caail-gap-analysis\` workflow. Verify citations, matrix cells, and schema fit before merging._
`

return { body, total, byCat, byTargetFile, kept }
