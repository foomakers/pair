import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { resolveVersion } from './determine-version'
import { REPO_ROOT } from '../quality-gates/repo-root'

const wf = (n: string) => parse(readFileSync(join(REPO_ROOT, '.github/workflows', n), 'utf8'))

describe('release workflows (AC3, AC4, AC6, AC9)', () => {
  it('version.yml and release.yml are dispatch-only', () => {
    for (const n of ['version.yml', 'release.yml']) expect(Object.keys(wf(n).on)).toEqual(['workflow_dispatch'])
  })
  it('version.yml takes channel + optional version', () => {
    const i = wf('version.yml').on.workflow_dispatch.inputs
    expect(i.channel.options).toEqual(['pre', 'rc', 'final'])
    expect(i.version.required).toBe(false)
  })
  it('release.yml skips the website deploy on prereleases and runs cleanup last', () => {
    const jobs = wf('release.yml').jobs
    expect(jobs['deploy-website'].if).toMatch(/prerelease == 'false'/)
    expect(jobs.cleanup.needs).toContain('publish-npm')
  })
  it('tag-on-changeset-merge and GH_RELEASE_TOKEN are gone', () => {
    expect(existsSync(join(REPO_ROOT, '.github/workflows/tag-on-changeset-merge.yml'))).toBe(false)
    for (const n of ['version.yml', 'release.yml', 'ci.yml'])
      expect(readFileSync(join(REPO_ROOT, '.github/workflows', n), 'utf8')).not.toMatch(/GH_RELEASE_TOKEN/)
  })
  it('determine-version accepts prerelease semver', () => {
    expect(resolveVersion({ inputVersion: 'v0.5.0-rc.1' }).version).toBe('v0.5.0-rc.1')
  })
})
