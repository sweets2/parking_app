export const meta = {
  name: 'review-stuck',
  description: 'Diagnose BLOCKED features, amend specs with hints, and retry via nested workflow',
  phases: [
    { title: 'Scan',     detail: 'Read features.json and stuck reason files for all BLOCKED features' },
    { title: 'Diagnose', detail: 'Classify each failure and extract actionable hints' },
    { title: 'Amend',    detail: 'Append ## Hints for Retry to spec files (skipped when dryRun=true)' },
    { title: 'Retry',    detail: 'Reset to TODO, delete stuck files, invoke nested workflow per feature' },
  ],
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const FRONT_MATTER_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: ['id', 'name', 'status', 'order', 'depends_on', 'context_files', 'output_files'],
    properties: {
      id:           { type: 'string' },
      name:         { type: 'string' },
      status:       { type: 'string' },
      order:        { type: 'number' },
      depends_on:   { type: 'array', items: { type: 'string' } },
      context_files: { type: 'array', items: { type: 'string' } },
      output_files:  { type: 'array', items: { type: 'string' } },
    },
  },
}

const SCAN_SCHEMA = {
  type: 'object',
  required: ['spec', 'stuckReason', 'stuckFileExists'],
  properties: {
    spec:            { type: 'string' },
    stuckReason:     { type: 'string' },
    stuckFileExists: { type: 'boolean' },
  },
}

const DIAGNOSIS_SCHEMA = {
  type: 'object',
  required: ['feature_id', 'failure_type', 'confidence', 'hints', 'can_auto_retry', 'amendment_needed', 'blocker_summary'],
  properties: {
    feature_id:       { type: 'string' },
    failure_type:     {
      type: 'string',
      enum: [
        'typecheck_error',      // tsc errors — usually as any, !, or missing type
        'test_failure',         // tests ran but assertions failed
        'missing_output_file',  // creator never wrote a required output file
        'spec_ambiguity',       // spec is underspecified; creator guessed wrong
        'constraint_violation', // CLAUDE.md hard constraint violated
        'regression',           // feature tests pass but full suite fails
        'dependency_gap',       // a context file was missing or had wrong types
        'spec_invalid',         // spec failed pre-flight validation
        'unknown',
      ],
    },
    confidence:       { type: 'string', enum: ['high', 'medium', 'low'] },
    hints:            { type: 'array', items: { type: 'string' }, minItems: 1 },
    can_auto_retry:   { type: 'boolean' },
    amendment_needed: { type: 'boolean' },
    blocker_summary:  { type: 'string' },
  },
}

// ─── Phase 1: Scan ────────────────────────────────────────────────────────────

phase('Scan')

const requestedFeature = args && args.feature ? String(args.feature) : null
const dryRun = args && args.dryRun === true

const [allFeatures, claudeMd] = await parallel([
  () => agent(
    `Read the file harness/features.json and return its parsed contents as a JSON array. Return only the JSON array, no prose.`,
    { schema: FRONT_MATTER_SCHEMA, label: 'read-features-json', phase: 'Scan' }
  ),
  () => agent(
    `Read the file CLAUDE.md and return its full contents as a plain string. Return only the file contents — no prose, no wrapping.`,
    { label: 'read-claude-md', phase: 'Scan' }
  ),
])

const sorted = [...allFeatures].sort((a, b) => (a.order || 999) - (b.order || 999))

// Validate single-feature arg
if (requestedFeature) {
  const target = sorted.find(f => f.id === requestedFeature)
  if (!target) {
    log(`Feature ${requestedFeature} not found in features.json`)
    return { done: true, reason: `Feature ${requestedFeature} not found` }
  }
  if (target.status !== 'BLOCKED') {
    log(`Feature ${requestedFeature} has status ${target.status} — nothing to review`)
    return { done: true, reason: `Feature ${requestedFeature} is not BLOCKED` }
  }
}

const blockedFeatures = requestedFeature
  ? sorted.filter(f => f.id === requestedFeature)
  : sorted.filter(f => f.status === 'BLOCKED')

if (blockedFeatures.length === 0) {
  log('No BLOCKED features found — nothing to review.')
  return { done: true, diagnosed: 0, amended: [], retried: [], skipped: [] }
}

log(`Found ${blockedFeatures.length} BLOCKED feature(s): ${blockedFeatures.map(f => f.id).join(', ')}`)

// Dependency check — skip features whose deps are also BLOCKED
const skippedDueToBlockedDep = new Set()
for (const f of blockedFeatures) {
  for (const depId of (f.depends_on || [])) {
    const dep = sorted.find(d => d.id === depId)
    if (dep && dep.status === 'BLOCKED') {
      skippedDueToBlockedDep.add(f.id)
      log(`Skipping ${f.id}: dependency ${depId} is also BLOCKED — resolve ${depId} first`)
      break
    }
  }
}

const scannable = blockedFeatures.filter(f => !skippedDueToBlockedDep.has(f.id))

const scanResults = await parallel(
  scannable.map(f => () => agent(
    `Read two files and return their contents:
1. specs/${f.id}.md  (the feature spec — required)
2. harness/stuck/${f.id}_stuck_reason.md  (the stuck reason — may not exist)

Return:
- spec: full text of specs/${f.id}.md
- stuckReason: full text of harness/stuck/${f.id}_stuck_reason.md, or empty string if it does not exist
- stuckFileExists: true if the stuck file exists, false otherwise`,
    { schema: SCAN_SCHEMA, label: `scan:${f.id}`, phase: 'Scan' }
  ))
)

// ─── Phase 2: Diagnose ────────────────────────────────────────────────────────

phase('Diagnose')

const diagnoses = await parallel(
  scanResults.map((scan, i) => {
    const f = scannable[i]
    if (!scan || !scan.stuckFileExists) {
      log(`WARNING: ${f.id} is BLOCKED but has no stuck file — was it blocked manually? Skipping retry.`)
      return () => Promise.resolve({
        feature_id:       f.id,
        failure_type:     'spec_invalid',
        confidence:       'low',
        hints:            ['No stuck file found — the feature may have been blocked before the Creator ran. Review the spec manually before retrying.'],
        can_auto_retry:   false,
        amendment_needed: false,
        blocker_summary:  'No stuck file found — manual review required',
      })
    }
    return () => agent(
      `You are diagnosing a BLOCKED feature in the parking-app harness.

## Feature: ${f.id} — ${f.name}

## Feature spec
${scan.spec}

## Stuck reason (evaluator + test output after max revisions)
${scan.stuckReason}

## Project hard constraints (CLAUDE.md)
${claudeMd}

## Your task
Classify why this feature is BLOCKED and extract concrete, actionable hints that will help the Creator agent succeed on the next attempt.

Choose the single dominant failure_type from the enum:
- typecheck_error: tsc errors present in typecheck section
- test_failure: test assertions failed (not typecheck)
- missing_output_file: creator did not write a required output file
- spec_ambiguity: spec is underspecified; the creator guessed wrong behavior
- constraint_violation: a CLAUDE.md hard constraint was violated (no as any, no !, etc.)
- regression: feature's own tests pass but full suite regresses
- dependency_gap: a context file had wrong/missing types at build time
- spec_invalid: spec failed pre-flight validation (no GWT, empty)
- unknown: none of the above

Set can_auto_retry:
- false ONLY IF failure_type is spec_invalid, OR spec_ambiguity with confidence high
- true for everything else

Set amendment_needed:
- false ONLY IF failure_type is missing_output_file (no new context helps; creator just forgot to write the file)
- true for everything else where can_auto_retry is true

Write hints as 1–4 concrete strings. Quote error messages verbatim from the stuck reason. Each hint must directly address a specific failure line, not give generic advice.`,
      { schema: DIAGNOSIS_SCHEMA, label: `diagnose:${f.id}`, phase: 'Diagnose' }
    )
  })
)

for (const d of diagnoses.filter(Boolean)) {
  log(`${d.feature_id}: ${d.failure_type} (confidence: ${d.confidence}) — ${d.blocker_summary}`)
  if (!d.can_auto_retry) {
    log(`  → Cannot auto-retry: ${d.hints[0] || 'manual intervention required'}`)
  }
}

if (dryRun) {
  log('dryRun=true — diagnoses complete, no amendments or retries will run')
  return {
    dryRun: true,
    diagnosed: diagnoses.filter(Boolean).length,
    features: diagnoses.filter(Boolean).map(d => ({
      id: d.feature_id,
      failure_type: d.failure_type,
      confidence: d.confidence,
      can_auto_retry: d.can_auto_retry,
      blocker_summary: d.blocker_summary,
    })),
  }
}

// ─── Phase 3: Amend ───────────────────────────────────────────────────────────

phase('Amend')

const needsAmendment = diagnoses.filter(d => d && d.can_auto_retry && d.amendment_needed)
const amendedIds = []

if (needsAmendment.length > 0) {
  await parallel(
    needsAmendment.map(d => () => {
      const hintsSection = [
        `## Hints for Retry`,
        ``,
        `> Added by review-stuck. Additive only — does not change spec requirements.`,
        ``,
        `**Failure type:** ${d.failure_type}`,
        `**Summary:** ${d.blocker_summary}`,
        ``,
        `### Specific guidance`,
        ...d.hints.map(h => `- ${h}`),
      ].join('\n')

      return agent(
        `Edit the file specs/${d.feature_id}.md as follows:

1. Read the full current contents of specs/${d.feature_id}.md
2. Check if a "## Hints for Retry" section already exists anywhere in the file
   - If it EXISTS: replace everything from "## Hints for Retry" to the end of file with the new section below
   - If it does NOT exist: append a blank line followed by the new section below to the end of the file
3. Write the updated file to disk

New hints section to use:
---
${hintsSection}
---

Use the Edit tool (not Write) when replacing an existing section. Use Write only if appending requires a full rewrite.`,
        { label: `amend:${d.feature_id}`, phase: 'Amend' }
      )
    })
  )
  for (const d of needsAmendment) {
    amendedIds.push(d.feature_id)
    log(`Amended specs/${d.feature_id}.md with hints for ${d.failure_type}`)
  }
} else {
  log('No specs need amendment (all failures are self-explanatory)')
}

// ─── Phase 4: Retry ───────────────────────────────────────────────────────────

phase('Retry')

const retryQueue = diagnoses.filter(d => d && d.can_auto_retry)
const retryResults = []

if (retryQueue.length === 0) {
  log('No features eligible for auto-retry — manual spec review required for all BLOCKED features')
  return {
    diagnosed: diagnoses.filter(Boolean).length,
    amended: amendedIds,
    retried: [],
    skipped: [...skippedDueToBlockedDep, ...diagnoses.filter(d => d && !d.can_auto_retry).map(d => d.feature_id)],
    dryRun: false,
  }
}

log(`Retrying ${retryQueue.length} feature(s) sequentially: ${retryQueue.map(d => d.feature_id).join(', ')}`)

for (const diagnosis of retryQueue) {
  const id = diagnosis.feature_id

  // Budget guard (same pattern as build-all.js)
  if (budget.total && budget.remaining() < 50_000) {
    log(`Low budget — stopping before retry of ${id}`)
    break
  }

  log(`Resetting ${id} to TODO and deleting stuck file...`)

  // Reset status to TODO via update-status.js (validates transition), then delete stuck file
  await agent(
    `In the project root, run these two commands:
node harness/update-status.js --feature ${id} --status TODO
rm -f harness/stuck/${id}_stuck_reason.md`,
    { label: `reset:${id}`, phase: 'Retry' }
  )

  log(`Running workflow for ${id}...`)

  const result = await workflow({ scriptPath: 'harness/workflow.js' }, { feature: id, retry: true })

  if (!result) {
    log(`Inner workflow returned null for ${id} — aborting retry loop`)
    break
  }

  if (result.success) {
    log(`${id} PASS after retry`)
    retryResults.push({ id, outcome: 'PASS' })
  } else if (result.blocked) {
    log(`${id} still BLOCKED after retry — see new stuck file`)
    retryResults.push({ id, outcome: 'BLOCKED' })
  } else {
    log(`${id} returned unexpected result: ${JSON.stringify(result)}`)
    retryResults.push({ id, outcome: 'unknown' })
  }
}

const skippedIds = [
  ...skippedDueToBlockedDep,
  ...diagnoses.filter(d => d && !d.can_auto_retry).map(d => d.feature_id),
]

return {
  diagnosed: diagnoses.filter(Boolean).length,
  amended: amendedIds,
  retried: retryResults,
  skipped: skippedIds,
  dryRun: false,
}
