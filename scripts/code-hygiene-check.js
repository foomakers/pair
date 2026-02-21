#!/usr/bin/env node
/**
 * Code Hygiene Check — prevents suppression markers from entering the codebase.
 * Exit 0 = clean, Exit 1 = violations found.
 */
const { execSync } = require('child_process')

// Patterns are split so this file does not match itself.
const PATTERNS = [
  { label: '@ts-ignore', regex: '@ts-' + 'ignore' },
  { label: '@ts-nocheck', regex: '@ts-' + 'nocheck' },
  { label: 'eslint-disable', regex: 'eslint-' + 'disable' },
  { label: 'test.skip', regex: '\\btest\\.' + 'skip\\b' },
  { label: 'it.skip', regex: '\\bit\\.' + 'skip\\b' },
  { label: 'describe.skip', regex: '\\bdescribe\\.' + 'skip\\b' },
]

const FILE_GLOBS = ['*.ts', '*.tsx', '*.js', '*.cjs', '*.mjs'].map((g) => `"${g}"`).join(' -- ')

const violations = new Map()
let total = 0

for (const { label, regex } of PATTERNS) {
  try {
    const out = execSync(`git grep -n "${regex}" -- ${FILE_GLOBS} ':!scripts/code-hygiene-check.js'`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const matches = out
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const sep = line.indexOf(':')
        const sep2 = line.indexOf(':', sep + 1)
        const file = line.substring(0, sep)
        const lineNum = line.substring(sep + 1, sep2)
        return `  ${file}:${lineNum}`
      })
    if (matches.length) {
      violations.set(label, matches)
      total += matches.length
    }
  } catch {
    // git grep exits 1 when no matches — that's the happy path
  }
}

console.log('Code Hygiene Check')
console.log('==================')

if (total === 0) {
  console.log('PASS — no violations')
  process.exit(0)
} else {
  console.log(`FAIL — ${total} violation${total > 1 ? 's' : ''}\n`)
  for (const [label, matches] of violations) {
    console.log(`${label} (${matches.length}):`)
    for (const m of matches) console.log(m)
    console.log()
  }
  process.exit(1)
}
