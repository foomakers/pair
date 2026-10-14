import { readFileSync } from 'fs'
import { join } from 'path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../quality-gates/repo-root'

const wf = (n: string) => parse(readFileSync(join(REPO_ROOT, '.github/workflows', n), 'utf8'))

describe('r0-4 release.yml pending run is never replaced by a second dispatch', () => {
  it('r0-4-w1 release.yml group differs from version.yml group', () => {
    expect(wf('release.yml').concurrency.group).not.toBe(wf('version.yml').concurrency.group)
  })
  it('r0-4-w2 release.yml group is keyed per release tag', () => {
    expect(wf('release.yml').concurrency.group).toContain('inputs.version')
  })
  it('r0-4-c1 neither workflow cancels in progress', () => {
    for (const n of ['version.yml', 'release.yml'])
      expect(wf(n).concurrency['cancel-in-progress']).toBe(false)
  })
})
