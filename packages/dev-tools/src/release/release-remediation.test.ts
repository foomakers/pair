import * as cp from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from './release-cli'
import { type PlanInput, planRelease, predecessors } from './release-state'

// release-cli shells out in process.cwd(); workers cannot chdir, so route its git calls to the temp repo.
const repo = vi.hoisted(() => ({ dir: '' }))
vi.mock('child_process', async orig => {
  const real = await orig<typeof import('child_process')>()
  return {
    ...real,
    execFileSync: (c: string, a: string[], o: object = {}) =>
      real.execFileSync(c, a, { ...o, ...(repo.dir ? { cwd: repo.dir } : {}) }),
  }
})

const MAIN = 'main1'
// pre/rc tags point at an ephemeral release commit whose parent is main HEAD.
// `tagParents` maps a tag to the parent of the commit it points at.
const input = (o: Record<string, unknown>) =>
  ({ channel: 'pre', bumps: ['minor'], head: MAIN, ...o }) as unknown as PlanInput

describe('r0-1 no-new-commits guard sees the ephemeral release commit parent', () => {
  it('r0-1-w1: refuses pre when the last pre tag was cut from the same main HEAD', () => {
    const r = planRelease(
      input({
        tags: { 'v0.4.3': 'h0', 'v0.5.0-pre.1': 'EPHEMERAL' },
        tagParents: { 'v0.5.0-pre.1': MAIN },
      }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/no new commits/)
  })
  it('r0-1-c1: control, plans pre.2 when main moved past the last pre parent', () => {
    const r = planRelease(
      input({
        tags: { 'v0.4.3': 'h0', 'v0.5.0-pre.1': 'EPHEMERAL' },
        tagParents: { 'v0.5.0-pre.1': 'older' },
      }),
    )
    expect(r.ok && r.version).toBe('0.5.0-pre.2')
  })
  it('r0-1-c2: control, tag pointing directly at head is still refused', () => {
    const r = planRelease(input({ tags: { 'v0.4.3': 'h0', 'v0.5.0-pre.1': MAIN } }))
    expect(r.ok).toBe(false)
  })
  it('r0-1-w3: refuses rc when the last rc tag was cut from the same main HEAD (guard is channel-generic)', () => {
    const r = planRelease(
      input({
        channel: 'rc',
        tags: { 'v0.4.3': 'h0', 'v0.5.0-rc.1': 'EPHEMERAL' },
        tagParents: { 'v0.5.0-rc.1': MAIN },
      }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/no new commits/)
  })
  it('r0-1-c4: control, a pre tag cut from head does not block an rc request (same-channel guard only)', () => {
    const r = planRelease(
      input({
        channel: 'rc',
        tags: { 'v0.4.3': 'h0', 'v0.5.0-pre.1': 'EPHEMERAL' },
        tagParents: { 'v0.5.0-pre.1': MAIN },
      }),
    )
    expect(r.ok && r.version).toBe('0.5.0-rc.1')
  })
})

describe('r0-2 predecessors are only lower bases', () => {
  it('r0-2-w1: final patch keeps an unrelated higher rc', () => {
    const r = planRelease(
      input({
        channel: 'final',
        bumps: ['patch'],
        tags: { 'v0.4.3': 'a', 'v0.6.0-rc.1': 'b' },
      }),
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.predecessors).not.toContain('v0.6.0-rc.1')
  })
  it('r0-2-w2: predecessors() ignores higher bases', () => {
    expect(predecessors('0.4.4', ['v0.6.0-rc.1', 'v0.7.0-pre.2'])).toEqual([])
  })
  it('r0-2-c1: control, lower-base prerelease is still a predecessor', () => {
    expect(predecessors('0.5.0', ['v0.4.4-rc.1', 'v0.5.0-pre.1'])).toEqual([
      'v0.4.4-rc.1',
      'v0.5.0-pre.1',
    ])
  })
})

describe('CLI path against a real temp git repo', () => {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
  }
  const git = (cwd: string, ...a: string[]) =>
    cp
      .execFileSync('git', ['-c', 'commit.gpgsign=false', ...a], { cwd, env, encoding: 'utf8' })
      .trim()
  let dir: string
  const out: string[] = []
  const err: string[] = []

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rel-cli-'))
    git(dir, 'init', '-q')
    git(dir, 'commit', '--allow-empty', '-q', '-m', 'a')
    git(dir, 'tag', 'v0.4.3')
    // ephemeral release commit: child of HEAD, not on any branch
    const tree = git(dir, 'rev-parse', 'HEAD^{tree}')
    const eph = git(dir, 'commit-tree', tree, '-p', 'HEAD', '-m', 'release')
    git(dir, 'tag', 'v0.5.0-pre.1', eph)
    repo.dir = dir
    out.length = err.length = 0
    vi.spyOn(console, 'log').mockImplementation((s: string) => void out.push(String(s)))
    vi.spyOn(console, 'error').mockImplementation((s: string) => void err.push(String(s)))
  })
  afterEach(() => {
    repo.dir = ''
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('r0-1-w2: readTags/plan wiring refuses pre when the pre tag commit parent is HEAD', () => {
    const code = main(['pre', '--version', '0.5.0', '--no-fetch', '--dry-run'])
    expect(code).toBe(1)
    expect(err.join('\n')).toMatch(/no new commits/)
  })
  it('r0-1-c3: control, rc request is not blocked by the pre tag', () => {
    const code = main(['rc', '--version', '0.5.0', '--no-fetch', '--dry-run'])
    expect(code).toBe(0)
    expect(out.join('\n')).toMatch(/v0\.5\.0-rc\.1/)
  })
  it('r0-2-w3: --cleanup-for shares predecessors() and omits higher bases', () => {
    git(dir, 'tag', 'v0.6.0-rc.1')
    expect(main(['--cleanup-for', '0.4.4'])).toBe(0)
    expect(JSON.parse(out.join(''))).toEqual([])
  })
})
