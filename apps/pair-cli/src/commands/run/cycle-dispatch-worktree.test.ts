import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mainCheckout, mainCheckoutOrCwd } from './cycle-wiring'

const script = resolve(
  __dirname,
  '../../../../..',
  'packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/cycle-dispatch.mjs',
)
const roots: string[] = []
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

function repo(parent: string, name: string) {
  const path = join(parent, name)
  mkdirSync(path)
  git(path, 'init', '-q', '-b', 'main')
  git(
    path,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'base',
  )
  return path
}

function worktree(main: string, story = '55', root?: string) {
  const args = [
    script,
    'worktree',
    '--main',
    main,
    '--story',
    story,
    '--branch',
    `feature/US-${story}-example`,
    '--base',
    'main',
  ]
  if (root !== undefined) args.push('--worktree-root', root)
  const out = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    timeout: 5_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  expect(out.error).toBeUndefined()
  return { status: out.status, data: JSON.parse(out.stdout) as Record<string, unknown> }
}

function packet(main: string, root?: string) {
  const args = [
    script,
    'packet',
    '--main',
    main,
    '--next',
    JSON.stringify({ step: 'implement', phase: 'a0', attempt: 1 }),
    '--card',
    JSON.stringify({ id: '55', branch: 'feature/US-55-example', title: 'Example' }),
    '--agents-dir',
    resolve(__dirname, '../../../../..', '.claude/agents'),
  ]
  if (root !== undefined) args.push('--pipeline', JSON.stringify({ worktreeRoot: root }))
  const out = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 5_000 })
  expect(out.error).toBeUndefined()
  return { status: out.status, data: JSON.parse(out.stdout) as Record<string, unknown> }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('US-602 real Git worktree ownership', () => {
  it('AC3: packets use the same default, declared and explicit roots as worktree creation', () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'pair-packet-root-')))
    roots.push(parent)
    const main = repo(parent, 'alpha')
    expect(packet(main).data).toMatchObject({
      worktree: join(parent, 'pair-worktrees', 'alpha', '55'),
    })
    const declared = join(parent, 'declared root')
    writeFileSync(join(main, 'pair.config.json'), JSON.stringify({ worktreeRoot: declared }))
    expect(packet(main).data).toMatchObject({ worktree: join(declared, '55') })
    expect(packet(main).data['args']).toContain(`$worktree="${join(declared, '55')}"`)
    expect(packet(main, '../legacy').data).toMatchObject({
      worktree: join(parent, 'legacy', '55'),
    })
  })

  it('AC1/AC2: a separate Git directory does not replace the main checkout anchor', () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'pair-separate-git-dir-')))
    roots.push(parent)
    const main = join(parent, 'project')
    const metadata = join(parent, 'metadata.git')
    mkdirSync(main)
    git(main, 'init', '-q', '-b', 'main', '--separate-git-dir', metadata)
    git(main, 'config', 'user.name', 'Fixture')
    git(main, 'config', 'user.email', 'fixture@example.invalid')
    writeFileSync(join(main, 'seed'), 'seed')
    git(main, 'add', 'seed')
    git(main, 'commit', '-q', '-m', 'initial')
    const first = worktree(main)
    expect(first.status, JSON.stringify(first.data)).toBe(0)
    expect(first.data['path']).toBe(join(parent, 'pair-worktrees', 'project', '55'))
    expect(mainCheckout(main)).toBe(main)
    const linked = first.data['path'] as string
    expect(() => mainCheckout(linked)).toThrow(/main-checkout-unresolved[\s\S]*pair\.mainCheckout/)
    expect(() => mainCheckoutOrCwd(linked)).toThrow(/main-checkout-unresolved/)
    expect(worktree(linked, '57').data['halt']).toBe('main-checkout-unresolved')
    git(main, 'config', 'pair.mainCheckout', linked)
    expect(() => mainCheckout(linked)).toThrow(/main-checkout-unresolved/)
    expect(worktree(linked, '57').data['halt']).toBe('main-checkout-unresolved')
    git(main, 'config', 'pair.mainCheckout', main)
    expect(mainCheckout(linked)).toBe(main)
    expect(worktree(linked, '57').data['path']).toBe(
      join(parent, 'pair-worktrees', 'project', '57'),
    )
    const custom = worktree(main, '56', 'custom-root')
    expect(custom.status).toBe(0)
    expect(custom.data['path']).toBe(join(main, 'custom-root', '56'))
  })

  it('AC1: sibling repositories use separate defaults, linked invocation keeps the main anchor', () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'pair-roots-')))
    roots.push(parent)
    const a = repo(parent, 'alpha')
    const b = repo(parent, 'beta')
    const first = worktree(a)
    const second = worktree(b)
    expect(first).toMatchObject({
      status: 0,
      data: { path: join(parent, 'pair-worktrees', 'alpha', '55'), created: true },
    })
    expect(second).toMatchObject({
      status: 0,
      data: { path: join(parent, 'pair-worktrees', 'beta', '55'), created: true },
    })
    expect(worktree(first.data['path'] as string)).toMatchObject({
      status: 0,
      data: { path: first.data['path'], reused: true },
    })
  })

  it('AC4: a foreign worktree with the same branch is refused with Git identities and no mutation', () => {
    const parent = mkdtempSync(join(tmpdir(), 'pair-foreign-'))
    roots.push(parent)
    const a = repo(parent, 'alpha')
    const b = repo(parent, 'beta')
    const root = join(parent, 'legacy')
    const path = join(root, '55')
    mkdirSync(root)
    git(b, 'worktree', 'add', '-q', '-b', 'feature/US-55-example', path, 'main')
    writeFileSync(join(path, 'keep'), 'untouched')
    const before = git(b, 'worktree', 'list', '--porcelain')
    const result = worktree(a, '55', root)
    expect(result.status).toBe(1)
    expect(result.data).toMatchObject({
      halt: 'worktree-conflict',
      path,
      expectedIdentity: git(a, 'rev-parse', '--path-format=absolute', '--git-common-dir'),
      actualIdentity: git(b, 'rev-parse', '--path-format=absolute', '--git-common-dir'),
    })
    expect(readFileSync(join(path, 'keep'), 'utf8')).toBe('untouched')
    expect(git(b, 'worktree', 'list', '--porcelain')).toBe(before)
  })

  it('r1-g1: a stale registration cannot reuse an ordinary directory inside the repository', () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'pair-stale-ordinary-')))
    roots.push(parent)
    const alpha = repo(parent, 'alpha')
    const root = join(alpha, 'shared')
    const path = join(root, '55')
    mkdirSync(root)
    git(alpha, 'worktree', 'add', '-q', '-b', 'feature/US-55-example', path, 'main')
    renameSync(path, join(parent, 'moved-alpha'))
    mkdirSync(path)
    writeFileSync(join(path, 'keep'), 'untouched')
    const before = git(alpha, 'worktree', 'list', '--porcelain')
    const result = worktree(alpha, '55', root)
    expect(result.status).toBe(1)
    expect(result.data).toMatchObject({ halt: 'worktree-conflict', path })
    expect(readFileSync(join(path, 'keep'), 'utf8')).toBe('untouched')
    expect(git(alpha, 'worktree', 'list', '--porcelain')).toBe(before)
  })

  it('r1-g1: a stale registration cannot reuse another worktree of the same repository', () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'pair-stale-other-branch-')))
    roots.push(parent)
    const alpha = repo(parent, 'alpha')
    const root = join(parent, 'shared')
    const path = join(root, '55')
    mkdirSync(root)
    git(alpha, 'worktree', 'add', '-q', '-b', 'feature/US-55-example', path, 'main')
    renameSync(path, join(parent, 'moved-alpha'))
    const other = join(parent, 'other-worktree')
    git(alpha, 'worktree', 'add', '-q', '-b', 'other-branch', other, 'main')
    renameSync(other, path)
    const before = git(alpha, 'worktree', 'list', '--porcelain')
    const result = worktree(alpha, '55', root)
    expect(result.status).toBe(1)
    expect(result.data).toMatchObject({ halt: 'worktree-conflict', path })
    expect(git(path, 'branch', '--show-current')).toBe('other-branch')
    expect(git(alpha, 'worktree', 'list', '--porcelain')).toBe(before)
  })

  it('r1-g1: a valid story branch remains reusable when a tag has the same name', () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'pair-ambiguous-branch-')))
    roots.push(parent)
    const alpha = repo(parent, 'alpha')
    const root = join(parent, 'shared')
    const path = join(root, '55')
    mkdirSync(root)
    git(alpha, 'worktree', 'add', '-q', '-b', 'feature/US-55-example', path, 'main')
    git(alpha, 'tag', 'feature/US-55-example', 'main')
    const result = worktree(alpha, '55', root)
    expect(result.status).toBe(0)
    expect(result.data).toMatchObject({ path, reused: true })
  })

  it.each(['foreign', 'missing'])(
    'r1-g1: stale registration with %s destination is refused',
    kind => {
      const parent = realpathSync(mkdtempSync(join(tmpdir(), 'pair-stale-registration-')))
      roots.push(parent)
      const alpha = repo(parent, 'alpha')
      const beta = repo(parent, 'beta')
      const root = join(parent, 'shared')
      const path = join(root, '55')
      mkdirSync(root)
      git(alpha, 'worktree', 'add', '-q', '-b', 'feature/US-55-example', path, 'main')
      renameSync(path, join(parent, 'moved-alpha'))
      if (kind === 'foreign') {
        git(beta, 'worktree', 'add', '-q', '-b', 'feature/US-55-example', path, 'main')
        writeFileSync(join(path, 'keep'), 'untouched')
      }
      const alphaBefore = git(alpha, 'worktree', 'list', '--porcelain')
      const betaBefore = git(beta, 'worktree', 'list', '--porcelain')
      const result = worktree(alpha, '55', root)
      expect(result.status).toBe(1)
      expect(result.data).toMatchObject({
        halt: 'worktree-conflict',
        path,
        expectedIdentity: git(alpha, 'rev-parse', '--path-format=absolute', '--git-common-dir'),
        actualIdentity:
          kind === 'foreign'
            ? git(beta, 'rev-parse', '--path-format=absolute', '--git-common-dir')
            : null,
      })
      if (kind === 'missing') expect(result.data['detail']).toContain('(unavailable)')
      expect(git(alpha, 'worktree', 'list', '--porcelain')).toBe(alphaBefore)
      expect(git(beta, 'worktree', 'list', '--porcelain')).toBe(betaBefore)
      if (kind === 'foreign') expect(readFileSync(join(path, 'keep'), 'utf8')).toBe('untouched')
      else expect(existsSync(path)).toBe(false)
    },
  )

  it('AC4: wrong-branch, detached and ordinary destinations are refused untouched', () => {
    const parent = mkdtempSync(join(tmpdir(), 'pair-occupied-'))
    roots.push(parent)
    const main = repo(parent, 'alpha')
    const root = join(parent, 'occupied')
    mkdirSync(root)
    const wrong = join(root, '55')
    const detached = join(root, '56')
    const ordinary = join(root, '57')
    git(main, 'worktree', 'add', '-q', '-b', 'another-branch', wrong, 'main')
    git(main, 'worktree', 'add', '-q', '--detach', detached, 'main')
    mkdirSync(ordinary)
    for (const path of [wrong, detached, ordinary]) writeFileSync(join(path, 'keep'), path)
    const registered = git(main, 'worktree', 'list', '--porcelain')
    for (const id of ['55', '56', '57']) {
      const path = join(root, id)
      expect(worktree(main, id, root).data).toMatchObject({ halt: 'worktree-conflict', path })
      expect(readFileSync(join(path, 'keep'), 'utf8')).toBe(path)
    }
    expect(git(main, 'worktree', 'list', '--porcelain')).toBe(registered)
  })

  it('AC4: a symlink alias to a registered same-branch tree reuses its Git owner', () => {
    const parent = mkdtempSync(join(tmpdir(), 'pair-root-alias-'))
    roots.push(parent)
    const main = repo(parent, 'alpha')
    const realRoot = join(parent, 'real-root')
    const alias = join(parent, 'alias-root')
    expect(worktree(main, '55', realRoot).status).toBe(0)
    symlinkSync(realRoot, alias)
    expect(worktree(main, '55', alias)).toMatchObject({
      status: 0,
      data: { reused: true, path: join(alias, '55') },
    })
  })

  it('AC2/AC5: explicit legacy root is direct and invalid root creates nothing', () => {
    const parent = mkdtempSync(join(tmpdir(), 'pair-legacy-'))
    roots.push(parent)
    const main = repo(parent, 'alpha')
    const root = join(parent, 'legacy worktrees')
    const first = worktree(main, '55', root)
    expect(first).toMatchObject({ status: 0, data: { path: join(root, '55'), created: true } })
    expect(worktree(main, '55', root)).toMatchObject({
      status: 0,
      data: { path: join(root, '55'), reused: true },
    })
    const invalid = worktree(main, '56', '../../outside')
    expect(invalid).toMatchObject({ status: 1, data: { halt: 'worktree-root-invalid' } })
    expect(worktree(main, '56', '/')).toMatchObject({
      status: 1,
      data: { halt: 'worktree-root-invalid' },
    })
    expect(existsSync(join(parent, 'outside'))).toBe(false)
  })

  it('AC2: project root is direct; invalid declaration stops before registration', () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'pair-config-root-')))
    roots.push(parent)
    const main = repo(parent, 'alpha')
    const custom = join(parent, 'custom worktrees')
    writeFileSync(join(main, 'pair.config.json'), JSON.stringify({ worktreeRoot: custom }))
    expect(worktree(main)).toMatchObject({
      status: 0,
      data: { path: join(custom, '55'), created: true },
    })
    const registered = git(main, 'worktree', 'list', '--porcelain')
    writeFileSync(join(main, 'pair.config.json'), JSON.stringify({ worktreeRoot: '../../escape' }))
    expect(worktree(main, '56')).toMatchObject({
      status: 1,
      data: { halt: 'worktree-root-invalid' },
    })
    expect(git(main, 'worktree', 'list', '--porcelain')).toBe(registered)
    expect(existsSync(join(parent, 'escape'))).toBe(false)
  })
})
