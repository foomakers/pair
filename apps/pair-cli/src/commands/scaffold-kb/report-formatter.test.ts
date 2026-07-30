import { describe, it, expect } from 'vitest'
import { formatScaffoldReport } from './report-formatter'
import type { ApplyResult } from './apply-plan'

const identity = { name: 'acme-kb', slug: 'acme-kb', skillPrefix: 'acme-kb' }

const result: ApplyResult = {
  root: '/work/acme-kb',
  directories: ['.pair/knowledge', '.skills'],
  unmanaged: [],
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

  it('says nothing about unmanaged files when there are none', () => {
    expect(report).not.toContain('not managed by')
  })

  // Host switch: leftovers are named, never deleted — an orphaned workflow keeps firing on
  // every v* tag push and would otherwise be invisible in a "2 updated, 4 unchanged" line.
  it('names a scaffold-owned file the current --host no longer manages', () => {
    const switched = formatScaffoldReport(
      { ...result, unmanaged: ['.github/workflows/release.yml'] },
      { identity, host: 'generic' },
    )

    expect(switched).toContain('.github/workflows/release.yml')
    expect(switched).toContain('not managed by --host generic')
    expect(switched).toContain('stop CI runs on v* tags')
  })

  // The path is matched by existence, so on a first-ever scaffold it can be the maintainer's
  // OWN hand-written release workflow, which this command never generated. The hint must be
  // conditional on that provenance instead of telling them to delete an unrelated file.
  it('does not present the unmanaged file as something the scaffold created', () => {
    const switched = formatScaffoldReport(
      { ...result, unmanaged: ['.github/workflows/release.yml'] },
      { identity, host: 'generic' },
    )

    expect(switched).toContain('if an earlier --host github scaffold generated it')
    expect(switched).not.toContain('delete it if you do not want')
  })
})
