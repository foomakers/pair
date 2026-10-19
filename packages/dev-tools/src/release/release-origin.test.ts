import { execFileSync, spawnSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Real throwaway bare origin (temp dirs): the release plan must follow origin's tags (AC12).
const PKG = join(__dirname, '..', '..')
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
  TS_NODE_PROJECT: join(PKG, 'tsconfig.json'),
  TS_NODE_TRANSPILE_ONLY: 'true',
}
const git = (cwd: string, ...a: string[]) =>
  execFileSync('git', a, { cwd, env, encoding: 'utf8' }).trim()

let root: string
const sandboxes: string[] = []

/** origin (bare, main + tag on origin) and a clone of it. */
function setup(name: string) {
  const dir = join(root, name)
  const origin = join(dir, 'origin.git')
  const seed = join(dir, 'seed')
  const clone = join(dir, 'clone')
  mkdirSync(seed, { recursive: true })
  git(dir, 'init', '--bare', '-b', 'main', origin)
  git(seed, 'init', '-b', 'main')
  writeFileSync(join(seed, 'f'), '1')
  git(seed, 'add', 'f')
  git(seed, 'commit', '-m', 'c1')
  git(seed, 'remote', 'add', 'origin', origin)
  git(seed, 'tag', 'v0.1.0-pre.1')
  writeFileSync(join(seed, 'f'), '2')
  git(seed, 'commit', '-am', 'c2') // tag must not sit at head
  git(seed, 'push', 'origin', 'main', 'v0.1.0-pre.1')
  git(dir, 'clone', origin, clone)
  sandboxes.push(dir)
  return { origin, seed, clone }
}

function plan(clone: string): { ok: boolean; version?: string } {
  const r = spawnSync(
    join(PKG, 'node_modules/.bin/ts-node'),
    [join(PKG, 'src/release/release-cli.ts'), 'pre', '--version', '0.1.0', '--json', '--dry-run'],
    { cwd: clone, env, encoding: 'utf8' },
  )
  return JSON.parse(r.stdout.trim().split('\n').pop() ?? '{}')
}

function cleanup(clone: string, version: string): string[] {
  const r = spawnSync(
    join(PKG, 'node_modules/.bin/ts-node'),
    [join(PKG, 'src/release/release-cli.ts'), '--cleanup-for', version],
    { cwd: clone, env, encoding: 'utf8' },
  )
  return (JSON.parse(r.stdout.trim().split('\n').pop() ?? '[]') as string[]).sort()
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'release-origin-'))
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('release plan vs a real origin', () => {
  it('WITNESS: a tag deleted on origin is absent from the release plan', () => {
    const { origin, clone } = setup('deleted')
    expect(git(clone, 'tag', '-l', 'v*')).toBe('v0.1.0-pre.1')
    git(origin, 'tag', '-d', 'v0.1.0-pre.1')
    expect(plan(clone).version).toBe('0.1.0-pre.1')
  })

  it('WITNESS: a local-only (never pushed) tag is not treated as released', () => {
    const { clone } = setup('localonly-plan')
    git(clone, 'tag', 'v0.1.0-pre.5', 'HEAD~1')
    expect(plan(clone).version).toBe('0.1.0-pre.2')
  })

  it('CONTROL: a local-only tag survives the dry-run', () => {
    const { clone } = setup('localonly-survive')
    git(clone, 'tag', 'v0.1.0-pre.9')
    plan(clone)
    expect(git(clone, 'tag', '-l', 'v0.1.0-pre.9')).toBe('v0.1.0-pre.9')
  })

  it('CONTROL: a tag still on origin counts as released', () => {
    const { clone } = setup('present')
    expect(plan(clone).version).toBe('0.1.0-pre.2')
  })

  it('CONTROL: a tag pushed to origin after the clone is seen by the plan', () => {
    const { seed, clone } = setup('newtag')
    git(seed, 'tag', 'v0.1.0-pre.2', 'HEAD~1')
    git(seed, 'push', 'origin', 'v0.1.0-pre.2')
    expect(plan(clone).version).toBe('0.1.0-pre.3')
  })
})

describe('release --cleanup-for vs a real origin', () => {
  it('WITNESS: a tag deleted on origin is not in the cleanup list', () => {
    const { origin, clone } = setup('cleanup-deleted')
    git(origin, 'tag', '-d', 'v0.1.0-pre.1')
    expect(cleanup(clone, '0.1.0-pre.2')).toEqual([])
  })

  it('WITNESS: a local-only (never pushed) tag is not in the cleanup list', () => {
    const { clone } = setup('cleanup-localonly')
    git(clone, 'tag', 'v0.1.0-pre.5', 'HEAD~1')
    expect(cleanup(clone, '0.1.0-pre.9')).toEqual(['v0.1.0-pre.1'])
  })

  it('WITNESS: a tag pushed to origin after the clone is in the cleanup list', () => {
    const { seed, clone } = setup('cleanup-newtag')
    git(seed, 'tag', 'v0.1.0-pre.2', 'HEAD~1')
    git(seed, 'push', 'origin', 'v0.1.0-pre.2')
    expect(cleanup(clone, '0.1.0-pre.3')).toEqual(['v0.1.0-pre.1', 'v0.1.0-pre.2'])
  })

  it('CONTROL: a tag on origin and local is in the cleanup list', () => {
    const { clone } = setup('cleanup-present')
    expect(cleanup(clone, '0.1.0-pre.2')).toEqual(['v0.1.0-pre.1'])
  })

  it('CONTROL: a local-only tag survives the cleanup listing', () => {
    const { clone } = setup('cleanup-survive')
    git(clone, 'tag', 'v0.1.0-pre.5', 'HEAD~1')
    cleanup(clone, '0.1.0-pre.9')
    expect(git(clone, 'tag', '-l', 'v0.1.0-pre.5')).toBe('v0.1.0-pre.5')
  })
})
