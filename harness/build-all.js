export const meta = {
  name: 'build-all',
  description: 'Build all TODO features in dependency order until done or nothing remains buildable',
  phases: [{ title: 'Build' }],
}

phase('Build')

const stopOnBlocked = args && args.stopOnBlocked === true
let completed = 0
const blockedFeatures = []

while (true) {
  const result = await workflow({ scriptPath: 'harness/workflow.js' })

  if (!result) {
    log('Inner workflow returned null — aborting.')
    break
  }

  if (result.done) {
    log(`Build complete. ${completed} feature(s) done, ${blockedFeatures.length} blocked.`)
    break
  }

  if (result.success) {
    completed++
    log(`[${completed} done] ${result.feature} PASS`)
  }

  if (result.blocked) {
    blockedFeatures.push(result.feature)
    log(`${result.feature} BLOCKED (${blockedFeatures.length} total blocked)`)
    if (stopOnBlocked) {
      log('stopOnBlocked=true — halting.')
      break
    }
  }
}

return { completed, blocked: blockedFeatures }
