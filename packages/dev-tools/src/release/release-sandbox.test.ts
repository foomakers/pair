import { readFileSync } from 'fs'
import { join } from 'path'
import { parse } from 'yaml'
import { describe, expect, it, vi } from 'vitest'
import { REPO_ROOT } from '../quality-gates/repo-root'
import { main } from './release-cli'

// Defects found by the throwaway-repo release run (AC10).
const calls = vi.hoisted(() => [] as string[])
vi.mock('child_process', () => ({
  execFileSync: (c: string, a: string[]) => {
    calls.push(`${c} ${a.join(' ')}`)
    if (a[0] === 'tag') return ''
    if (a[0] === 'rev-parse') return 'main1'
    return ''
  },
}))
vi.mock('fs', async orig => {
  const real = await orig<typeof import('fs')>()
  return {
    ...real,
    readdirSync: () => ['a.md'],
    readFileSync: (p: string, e?: BufferEncoding) =>
      String(p).endsWith('a.md')
        ? "---\n'@pair/pair-cli': minor\n---\nx\n"
        : real.readFileSync(p, e),
  }
})

describe('throwaway release run findings', () => {
  it('version.yml writes the plan outside the repo, so the release commit stays clean', () => {
    const steps = parse(readFileSync(join(REPO_ROOT, '.github/workflows/version.yml'), 'utf8')).jobs
      .version.steps as { name?: string; run?: string }[]
    const run = steps.find(s => s.name === 'Validate and plan')?.run ?? ''
    expect(run).not.toMatch(/(^|[\s'"(])plan\.json/m) // only $RUNNER_TEMP/plan.json
  })
  it('the CLI fetches tags before reading them, so a stale clone never plans a duplicate', () => {
    calls.length = 0
    main(['pre', '--dry-run'])
    const fetch = calls.findIndex(c => c.startsWith('git fetch'))
    const tags = calls.findIndex(c => c.startsWith('git tag'))
    expect(fetch).toBeGreaterThanOrEqual(0)
    expect(fetch).toBeLessThan(tags)
  })
})

describe('cleanup job (throwaway release run)', () => {
  it('deletes tags through the API, never `git push` (a push runs the repo pre-push hook)', () => {
    const steps = parse(readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8')).jobs
      .cleanup.steps as { run?: string }[]
    const run = steps.map(s => s.run ?? '').join('\n')
    expect(run).not.toMatch(/git push/)
    expect(run).toMatch(/git\/refs\/tags\//)
  })
})
