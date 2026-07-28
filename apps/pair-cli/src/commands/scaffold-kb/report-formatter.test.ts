import { describe, it, expect } from 'vitest'
import { formatScaffoldReport } from './report-formatter'
import type { ApplyResult } from './apply-plan'

const identity = { name: 'acme-kb', slug: 'acme-kb', skillPrefix: 'acme-kb' }

const result: ApplyResult = {
  root: '/work/acme-kb',
  directories: ['.pair/knowledge', '.skills'],
  outcomes: [
    { path: 'pair.config.json', action: 'created' },
    { path: 'README.md', action: 'unchanged' },
    { path: '.gitignore', action: 'overwritten' },
    { path: '.pair/knowledge/README.md', action: 'skipped', reason: 'existing KB content' },
  ],
}

describe('formatScaffoldReport', () => {
  const report = formatScaffoldReport(result, { identity, host: 'github' })

  it('reports the scaffold root', () => {
    expect(report).toContain('/work/acme-kb')
  })

  it('summarizes every outcome class', () => {
    expect(report).toContain('1 created')
    expect(report).toContain('1 updated')
    expect(report).toContain('1 unchanged')
    expect(report).toContain('1 skipped')
  })

  it('names the skipped files with their reason so nothing is silently dropped', () => {
    expect(report).toContain('.pair/knowledge/README.md')
    expect(report).toContain('existing KB content')
  })

  it('tells the maintainer how to release and how consumers install', () => {
    expect(report).toContain('bash scripts/release.sh')
    expect(report).toContain('pair-cli install --source')
  })
})
