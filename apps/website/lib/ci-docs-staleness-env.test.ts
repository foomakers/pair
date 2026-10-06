import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// r0-1: the docs-staleness CI step shells out to `gh issue view`; without GH_TOKEN gh is
// unauthenticated, the lookup is "unavailable" and CI fails every planned marker.
const CI = resolve(__dirname, '../../../.github/workflows/ci.yml')

function stepBlock(name: string): string {
  const lines = readFileSync(CI, 'utf-8').split('\n')
  const start = lines.findIndex(l => l.trim() === `- name: ${name}`)
  if (start < 0) return ''
  const indent = lines[start].indexOf('-')
  const end = lines.findIndex(
    (l, i) => i > start && l.trim().startsWith('- name:') && l.indexOf('-') === indent,
  )
  return lines.slice(start, end < 0 ? undefined : end).join('\n')
}

describe('ci.yml docs-staleness step', () => {
  it('passes GH_TOKEN from github.token so gh can read issue state', () => {
    const block = stepBlock('Run docs-staleness check')
    expect(block).toContain('pnpm docs:staleness')
    expect(block).toMatch(/env:\s*\n\s+GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/)
  })

  it('control: the step still runs pnpm docs:staleness', () => {
    expect(stepBlock('Run docs-staleness check')).toMatch(/run:\s*pnpm docs:staleness/)
  })
})
