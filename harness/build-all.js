export const meta = {
  name: 'build-all',
  description: 'Build all TODO features in dependency order until done or nothing remains buildable',
  phases: [{ title: 'Build' }],
}

phase('Build')

const stopOnBlocked = args && args.stopOnBlocked === true
const retryBlocked = args && args.retryBlocked === true
let completed = 0
const blockedFeatures = []
// Track auto spec-fix attempts per feature to avoid infinite loops
const specFixAttempts = {}
const MAX_SPEC_FIX_ATTEMPTS = 2

if (retryBlocked) {
  log('retryBlocked=true — resetting all BLOCKED features to TODO...')
  await agent(
    `In the project root, reset all BLOCKED features to TODO using update-status.js.
Steps:
1. Read harness/features.json and collect the ids of all features where status === "BLOCKED".
2. For each id, run: node harness/update-status.js --feature <id> --status TODO
3. For each id, run: rm -f harness/stuck/<id>_stuck_reason.md
Log each command and its output.`,
    { label: 'retry-blocked-reset', phase: 'Build' }
  )
}

// Single token cap: +Nk harness directive > args.maxTokens > 5M default
const tokenCap = budget.total ?? (args && args.maxTokens) ?? 5_000_000

while (true) {
  if (budget.spent() >= tokenCap - 150_000) {
    log(`Near token cap (${budget.spent().toLocaleString()} / ${tokenCap.toLocaleString()}) — stopping.`)
    break
  }

  const result = await workflow({ scriptPath: 'harness/workflow.js' })

  if (!result) {
    log('Inner workflow returned null — aborting.')
    break
  }

  if (result.done) {
    // If there are still features that were blocked at spec-lint (not runtime failures),
    // attempt to auto-fix their specs and keep going rather than stopping.
    const fixableBlocked = blockedFeatures.filter(id => (specFixAttempts[id] || 0) < MAX_SPEC_FIX_ATTEMPTS)
    if (fixableBlocked.length > 0 && !stopOnBlocked) {
      log(`No immediately buildable features, but ${fixableBlocked.length} blocked feature(s) may be fixable. Attempting auto spec-fix...`)
      const featureId = fixableBlocked[0]
      const attempts = specFixAttempts[featureId] || 0
      log(`Auto-fixing spec for ${featureId} (attempt ${attempts + 1}/${MAX_SPEC_FIX_ATTEMPTS})...`)

      const fixed = await agent(
        `A feature spec has quality issues that blocked it before the Creator ran.
Your job: read the stuck reason, fix the spec and features.json entry, then reset the feature to TODO so it can be retried.

Steps:
1. Read harness/stuck/${featureId}_stuck_reason.md — understand each [ERROR] and [WARNING] issue
2. Read specs/${featureId}.md — understand the current spec
3. Read harness/features.json — check the feature's context_files and output_files
4. Read the relevant section of CLAUDE.md (hard constraints)
5. Fix ALL [ERROR] issues:
   - Missing TypeScript signatures → add complete signatures with parameter names and types
   - Vague THEN clauses (no concrete expected value) → replace with specific values, counts, or string literals
   - CLAUDE.md violations (e.g. side effects in app.ts, setInterval in app.ts) → restructure to comply
   - Exported functions with no test coverage → add GIVEN/WHEN/THEN test cases
   - Files referenced in tests but missing from output_files or context_files → update features.json
6. Fix [WARNING] issues where the fix is clear and unambiguous
7. Run: node harness/update-status.js --feature ${featureId} --status TODO
8. Run: rm -f harness/stuck/${featureId}_stuck_reason.md
Return: { fixed: true } if you made changes and reset to TODO; { fixed: false } if the issues could not be resolved.`,
        {
          label: `spec-fix:${featureId}`,
          phase: 'Build',
          schema: { type: 'object', required: ['fixed'], properties: { fixed: { type: 'boolean' } } }
        }
      )

      specFixAttempts[featureId] = attempts + 1

      if (fixed && fixed.fixed) {
        // Remove from blocked list so it can be retried
        const idx = blockedFeatures.indexOf(featureId)
        if (idx !== -1) blockedFeatures.splice(idx, 1)
        log(`Spec fixed for ${featureId} — retrying in next loop iteration.`)
        continue
      } else {
        log(`Could not auto-fix spec for ${featureId} after attempt ${attempts + 1} — leaving blocked.`)
        continue
      }
    }

    log(`Build complete. ${completed} feature(s) done, ${blockedFeatures.length} blocked.`)
    break
  }

  if (result.success) {
    completed++
    log(`[${completed} done] ${result.feature} PASS`)
  }

  if (result.blocked) {
    const featureId = result.feature
    blockedFeatures.push(featureId)
    log(`${featureId} BLOCKED (${blockedFeatures.length} total blocked)`)
    if (stopOnBlocked) {
      log('stopOnBlocked=true — halting.')
      break
    }
  }
}

const finalBudget = budget.spent()
log(`Total output tokens (budget.spent): ${finalBudget.toLocaleString()} — run complete-build-record.js with task notification data to record true subagentTokens.`)
await agent(
  `Run this exact bash command and report the output:
node harness/write-build-record.js --budget-spent ${finalBudget} --completed ${completed} --blocked '${JSON.stringify(blockedFeatures)}'`,
  { label: 'write-build-record', phase: 'Build' }
)

return { completed, blocked: blockedFeatures, budgetSpent: finalBudget }
