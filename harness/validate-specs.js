#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const featuresPath = path.join(__dirname, 'features.json')
let features
try {
  features = JSON.parse(fs.readFileSync(featuresPath, 'utf8'))
} catch (e) {
  console.error('validate-specs: failed to parse harness/features.json:', e.message)
  process.exit(1)
}

const projectRoot = path.join(__dirname, '..')
let errors = 0

function fail(msg) {
  console.error('FAIL:', msg)
  errors++
}

function hasSection(content, sectionName) {
  const lower = content.toLowerCase()
  const target = sectionName.toLowerCase()
  return lower.includes(`## ${target}`) || lower.includes(`# ${target}`)
}

function hasSectionOrNone(content, sectionName) {
  if (hasSection(content, sectionName)) return true
  const lower = content.toLowerCase()
  return lower.includes('preservation requirements') && lower.includes('none')
}

function isF46Plus(id) {
  const m = id.match(/^F-(\d+)/)
  if (!m) return false
  return parseInt(m[1], 10) >= 46
}

const REQUIRED_NOT_IMPLEMENTED_ITEMS = [
  'no saved-spot flow',
  'no reminder flow',
  'no notification flow',
  'no push flow',
  'no background monitoring',
  'no alert mode',
]

for (const f of features) {
  // Skip DONE features — they've already passed evaluation
  if (f.status === 'DONE') continue

  const specRelPath = f.spec_file || `specs/${f.id}.md`
  const specAbsPath = path.join(projectRoot, specRelPath)

  if (!fs.existsSync(specAbsPath)) {
    // Already caught by validate-feature-graph; skip here
    continue
  }

  const content = fs.readFileSync(specAbsPath, 'utf8')

  if (!content || content.trim().length < 50) {
    fail(`${f.id}: spec is empty or too short`)
    continue
  }

  // Full section validation only for F-46+ features (new spec format).
  // CF-* and F-00 through F-45 use a legacy format; only check non-empty.
  if (!isF46Plus(f.id)) continue

  // Always-required sections for F-46+ non-DONE features
  if (!hasSection(content, 'Purpose')) {
    fail(`${f.id}: missing "## Purpose" section`)
  }
  if (!hasSection(content, 'Acceptance criteria')) {
    fail(`${f.id}: missing "## Acceptance criteria" section`)
  }
  if (!hasSectionOrNone(content, 'Preservation requirements')) {
    fail(`${f.id}: missing "## Preservation requirements" section (or explicit "none")`)
  }
  if (!hasSection(content, 'Non-goals')) {
    fail(`${f.id}: missing "## Non-goals" section`)
  }

  // F-46+ additional requirements
  if (isF46Plus(f.id)) {
    if (!hasSection(content, 'Mode affected')) {
      fail(`${f.id}: F-46+ spec missing "## Mode affected" section`)
    }
    if (!hasSection(content, 'State fields read')) {
      fail(`${f.id}: F-46+ spec missing "## State fields read" section`)
    }
    if (!hasSection(content, 'State fields written')) {
      fail(`${f.id}: F-46+ spec missing "## State fields written" section`)
    }
    if (!hasSection(content, 'Behavior explicitly not implemented')) {
      fail(`${f.id}: F-46+ spec missing "## Behavior explicitly not implemented" section`)
    }
    if (!hasSection(content, 'Tests') && !hasSection(content, 'Verification')) {
      fail(`${f.id}: F-46+ spec missing "## Tests / Verification" section`)
    }

    // Check required "not implemented" items
    const lower = content.toLowerCase()
    for (const item of REQUIRED_NOT_IMPLEMENTED_ITEMS) {
      if (!lower.includes(item)) {
        fail(`${f.id}: "Behavior explicitly not implemented" missing: "${item}"`)
      }
    }
  }

  // Conditional: TypeScript contract signatures for shared/*.ts
  const outputFiles = f.output_files || []
  if (outputFiles.some(p => p.startsWith('shared/') && p.endsWith('.ts'))) {
    if (!hasSection(content, 'TypeScript contract')) {
      fail(`${f.id}: outputs shared/*.ts but missing "## TypeScript contract signatures" section`)
    }
  }

  // run_tests check
  const runTests = f.run_tests !== false
  if (runTests && isF46Plus(f.id)) {
    const hasGWT = /\b(Given|When|Then)\b/i.test(content)
    const hasManual = content.toLowerCase().includes('manual checklist')
    if (!hasGWT && !hasManual) {
      fail(`${f.id}: run_tests=true but spec has no Given/When/Then and no Manual checklist`)
    }
  }
}

if (errors > 0) {
  console.error(`\nvalidate-specs: ${errors} error(s) found`)
  process.exit(1)
} else {
  console.log('validate-specs: OK')
  process.exit(0)
}
