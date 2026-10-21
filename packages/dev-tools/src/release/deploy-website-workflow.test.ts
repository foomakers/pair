import { readFileSync } from 'fs'
import { join } from 'path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../quality-gates/repo-root'

const wf = (n: string) => parse(readFileSync(join(REPO_ROOT, '.github/workflows', n), 'utf8'))
const deploy = () => wf('deploy-website.yml')
type Step = { run?: string; if?: string }
const steps = (): Step[] => deploy().jobs.deploy.steps
const idx = (f: (run: string) => boolean) => steps().findIndex(s => f(s.run ?? ''))

describe('r0-1 deploy-website.yml records a GitHub deployment (AC-11)', () => {
  it('r0-1-w1 job grants deployments: write', () => {
    expect(deploy().jobs.deploy.permissions?.deployments ?? deploy().permissions?.deployments).toBe(
      'write',
    )
  })
  it('r0-1-w2 order: guard < create deployment <= in_progress < Vercel deploy', () => {
    const g = idx(r => r.includes('refs/heads/main'))
    const c = idx(r => /deployments(?!\/)/.test(r) && /POST/.test(r))
    const p = idx(r => r.includes('state=in_progress'))
    const v = idx(r => r.includes('deploy-website.sh'))
    expect(g).toBeGreaterThanOrEqual(0)
    expect(c).toBeGreaterThan(g)
    expect(p).toBeGreaterThanOrEqual(c)
    expect(v).toBeGreaterThan(p)
  })
  it('r0-1-w3 success/failure statuses are conditional and after the Vercel deploy', () => {
    const v = idx(r => r.includes('deploy-website.sh'))
    const ok = idx(r => r.includes('state=success'))
    const ko = idx(r => r.includes('state=failure'))
    expect(ok).toBeGreaterThan(v)
    expect(ko).toBeGreaterThan(v)
    expect(steps()[ok].if).toMatch(/success\(\)/)
    expect(steps()[ko].if).toMatch(/failure\(\)/)
  })
  it('r0-1-c1 main-only guard is first, names refs/heads/main and exits non-zero', () => {
    const first = steps()[0]
    expect(first.run).toContain('refs/heads/main')
    expect(first.run).toMatch(/exit 1/)
  })
})

describe('r0-3 deploy-website.yml serializes production deploys', () => {
  it('r0-3-w1 declares a concurrency group', () => {
    const g = deploy().concurrency?.group ?? deploy().jobs.deploy.concurrency?.group
    expect(typeof g).toBe('string')
    expect(g.length).toBeGreaterThan(0)
  })
  it('r0-3-w2 never cancels an in-progress production deploy', () => {
    const c = deploy().concurrency ?? deploy().jobs.deploy.concurrency
    expect(c?.['cancel-in-progress']).toBe(false)
  })
  it('r0-3-c1 oracle release.yml declares concurrency', () => {
    expect(wf('release.yml').concurrency.group).toBeTruthy()
  })
})
