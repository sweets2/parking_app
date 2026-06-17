#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const featuresPath = path.join(__dirname, 'features.json')
let features
try {
  features = JSON.parse(fs.readFileSync(featuresPath, 'utf8'))
} catch (e) {
  console.error('validate-paths: failed to parse harness/features.json:', e.message)
  process.exit(1)
}

const REQUIRED_FIELDS = ['id', 'name', 'status', 'order', 'depends_on', 'context_files', 'output_files']

const OUTPUT_ALLOWED_PREFIXES = [
  'app/', 'api/', 'shared/', 'fetcher/', 'tests/', 'data/', '.github/',
  'harness/', 'specs/', 'docs/',
]
const OUTPUT_ALLOWED_EXACT = [
  'package.json', 'tsconfig.json', 'vitest.config.ts', 'vercel.json',
]

const CONTEXT_ALLOWED_PREFIXES = [
  'app/', 'api/', 'shared/', 'fetcher/', 'tests/', 'data/', '.github/',
  'harness/', 'specs/', 'docs/',
]
const CONTEXT_ALLOWED_EXACT = [
  'package.json', 'tsconfig.json', 'vitest.config.ts', 'vercel.json', 'CLAUDE.md',
]

let errors = 0

function fail(msg) {
  console.error('FAIL:', msg)
  errors++
}

function validatePath(p, fieldName, featureId, allowedPrefixes, allowedExact) {
  if (!p || typeof p !== 'string') {
    fail(`${featureId}: ${fieldName} contains empty or non-string entry: ${JSON.stringify(p)}`)
    return
  }
  if (p.startsWith('/')) {
    fail(`${featureId}: ${fieldName} path must not be absolute: "${p}"`)
    return
  }
  if (p.includes('..')) {
    fail(`${featureId}: ${fieldName} path must not contain "..": "${p}"`)
    return
  }
  if (p.includes('\\')) {
    fail(`${featureId}: ${fieldName} path must not contain backslashes: "${p}"`)
    return
  }
  const ok = allowedExact.includes(p) || allowedPrefixes.some(prefix => p.startsWith(prefix))
  if (!ok) {
    fail(`${featureId}: ${fieldName} path has disallowed prefix: "${p}"`)
  }
}

for (const feature of features) {
  // Required fields
  for (const field of REQUIRED_FIELDS) {
    if (!(field in feature)) {
      fail(`${feature.id || '(unknown)'}: missing required field "${field}"`)
    }
  }

  const id = feature.id || '(unknown)'

  // output_files validation
  for (const p of (feature.output_files || [])) {
    validatePath(p, 'output_files', id, OUTPUT_ALLOWED_PREFIXES, OUTPUT_ALLOWED_EXACT)

    // harness/ output only allowed when harness_task === true
    if (p.startsWith('harness/') && feature.harness_task !== true) {
      fail(`${id}: output_files contains harness/ path but harness_task is not true: "${p}"`)
    }

    // specs/ output only allowed when harness_task === true
    if (p.startsWith('specs/') && feature.harness_task !== true) {
      fail(`${id}: output_files contains specs/ path but harness_task is not true: "${p}"`)
    }
  }

  // context_files validation
  for (const p of (feature.context_files || [])) {
    validatePath(p, 'context_files', id, CONTEXT_ALLOWED_PREFIXES, CONTEXT_ALLOWED_EXACT)
  }
}

if (errors > 0) {
  console.error(`\nvalidate-paths: ${errors} error(s) found`)
  process.exit(1)
} else {
  console.log('validate-paths: OK')
  process.exit(0)
}
