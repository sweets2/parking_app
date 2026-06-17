#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const featuresPath = path.join(__dirname, 'features.json')
let features
try {
  features = JSON.parse(fs.readFileSync(featuresPath, 'utf8'))
} catch (e) {
  console.error('validate-feature-graph: failed to parse harness/features.json:', e.message)
  process.exit(1)
}

let errors = 0

function fail(msg) {
  console.error('FAIL:', msg)
  errors++
}

// 1. Unique IDs
const idSet = new Set()
for (const f of features) {
  if (idSet.has(f.id)) {
    fail(`Duplicate feature ID: "${f.id}"`)
  }
  idSet.add(f.id)
}

// 2. depends_on references exist; no self-dependency
for (const f of features) {
  for (const dep of (f.depends_on || [])) {
    if (dep === f.id) {
      fail(`${f.id}: depends on itself`)
    }
    if (!idSet.has(dep)) {
      fail(`${f.id}: depends_on references unknown feature "${dep}"`)
    }
  }
}

// 3. No dependency cycles (DFS)
function hasCycle(startId, visited, stack) {
  visited.add(startId)
  stack.add(startId)
  const feat = features.find(f => f.id === startId)
  if (feat) {
    for (const dep of (feat.depends_on || [])) {
      if (!visited.has(dep)) {
        if (hasCycle(dep, visited, stack)) return true
      } else if (stack.has(dep)) {
        return true
      }
    }
  }
  stack.delete(startId)
  return false
}

const visited = new Set()
for (const f of features) {
  if (!visited.has(f.id)) {
    if (hasCycle(f.id, visited, new Set())) {
      fail(`Dependency cycle detected involving "${f.id}"`)
    }
  }
}

// 4. Non-discovery features must have at least one output_file
for (const f of features) {
  if (f.run_tests !== false && (!f.output_files || f.output_files.length === 0)) {
    fail(`${f.id}: non-discovery feature has no output_files`)
  }
}

// 5. Every feature has a resolvable spec file that exists
const projectRoot = path.join(__dirname, '..')
for (const f of features) {
  const specRelPath = f.spec_file || `specs/${f.id}.md`
  const specAbsPath = path.join(projectRoot, specRelPath)
  if (!fs.existsSync(specAbsPath)) {
    fail(`${f.id}: spec file not found: "${specRelPath}"`)
  }
}

// 6. Drift term check for F-46+ specs
const DRIFT_TERMS = [
  'alerts',
  'alert mode',
  'alert',
  'my spot',
  'saved spot',
  'save spot',
  'reminder',
  'notification',
  'push',
  'background monitoring',
]
const EXCEPTION_TERMS = [
  'deprecated',
  'legacy',
  'do not implement',
  'not implemented',
  'explicitly not implemented',
  'not supported',
  'removed',
  // prohibitive/negative contexts — the term appears to say DON'T use it
  'do not add',
  'not add',
  'prohibited',
  'must not',
  'not imply',
  // "no X flow" / "no X" patterns in "not implemented" bullet lists
  'no reminder',
  'no notification',
  'no push',
  'no alert',
  'no background',
  'no saved',
  'no save',
  'no my spot',
]

function isF46Plus(id) {
  // Match F-46, F-46A, F-46B, F-47, F-48 ... F-99
  const m = id.match(/^F-(\d+)/)
  if (!m) return false
  return parseInt(m[1], 10) >= 46
}

for (const f of features) {
  if (!isF46Plus(f.id)) continue
  const specRelPath = f.spec_file || `specs/${f.id}.md`
  const specAbsPath = path.join(projectRoot, specRelPath)
  if (!fs.existsSync(specAbsPath)) continue
  const content = fs.readFileSync(specAbsPath, 'utf8')
  const lines = content.split('\n')
  let inNotImplementedSection = false
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.toLowerCase()
    // Track "## Behavior explicitly not implemented" section — skip drift checks within it
    if (/^##\s+behavior explicitly not implemented/i.test(raw)) {
      inNotImplementedSection = true
      continue
    }
    // Any new ## heading ends the section
    if (/^##\s+/.test(raw) && inNotImplementedSection) {
      inNotImplementedSection = false
    }
    if (inNotImplementedSection) continue
    const hasException = EXCEPTION_TERMS.some(e => line.includes(e))
    if (hasException) continue
    for (const term of DRIFT_TERMS) {
      if (line.includes(term)) {
        fail(`${f.id}: drift term "${term}" found in spec line ${i + 1}: ${raw.trim()}`)
        break
      }
    }
  }
}

// 7. Skill-routing sanity check (warnings only, not blocking)
for (const f of features) {
  const outputFiles = f.output_files || []
  if (outputFiles.includes('app/map.ts')) {
    // map-layers skill should be available — just a structural note
  }
}

if (errors > 0) {
  console.error(`\nvalidate-feature-graph: ${errors} error(s) found`)
  process.exit(1)
} else {
  console.log('validate-feature-graph: OK')
  process.exit(0)
}
