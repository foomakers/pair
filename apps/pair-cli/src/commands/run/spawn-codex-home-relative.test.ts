import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative, resolve } from 'path'
import { spawnIteration } from './spawn'
import { ENGINES } from './engines'

/** US-623 r0-3: a relative PAIR_CODEX_HOME is resolved against the driver cwd before the check AND the child env. */
describe('US-623 r0-3 — relative PAIR_CODEX_HOME', () => {
  afterEach(() => {
    delete process.env['PAIR_CODEX_HOME']
    if (driverHome === undefined) delete process.env['CODEX_HOME']
    else process.env['CODEX_HOME'] = driverHome
  })
  const driverHome = process.env['CODEX_HOME']

  const engineStub = () => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-run-'))
    const file = join(dir, 'engine.js')
    writeFileSync(
      file,
      `const o=m=>process.stdout.write(JSON.stringify(m)+'\\n');o({type:'item.completed',item:{type:'agent_message',text:'{"status":"ok","reason":"'+process.env.CODEX_HOME+'"}'}});o({type:'turn.completed',usage:{}});o({type:'result',subtype:'success',result:'{"status":"ok","reason":"'+process.env.CODEX_HOME+'"}'})`,
    )
    const worktree = join(dir, 'story-worktree')
    mkdirSync(worktree)
    return { file, worktree }
  }
  const run = (file: string, cwd: string, id: 'codex' | 'claude' = 'codex') =>
    spawnIteration({
      engine: { ...ENGINES[id], command: process.execPath, headlessArgs: [file] },
      promptText: 'go',
      cwd,
      autonomyArgs: [],
      timeoutSeconds: 30,
    })
  const home = (withAuth: boolean) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-home-'))
    if (withAuth) writeFileSync(join(dir, 'auth.json'), '{}')
    return dir
  }

  it('witness: relative home (auth.json under the driver cwd), codex cwd elsewhere ⇒ child CODEX_HOME is the absolute resolve(home)', async () => {
    const { file, worktree } = engineStub()
    const rel = relative(process.cwd(), home(true))
    process.env['PAIR_CODEX_HOME'] = rel
    const result = await run(file, worktree)
    expect(result.final?.reason).toBe(resolve(rel))
  })

  it('control: an absolute home reaches the child unchanged', async () => {
    const { file, worktree } = engineStub()
    const abs = home(true)
    process.env['PAIR_CODEX_HOME'] = abs
    expect((await run(file, worktree)).final?.reason).toBe(abs)
  })

  it('control: a relative home with no auth.json under the driver cwd is the clear auth.json error', async () => {
    const { file, worktree } = engineStub()
    process.env['PAIR_CODEX_HOME'] = relative(process.cwd(), home(false))
    const result = await run(file, worktree)
    expect(result.outcome).toBe('failed')
    expect(result.detail).toMatch(/PAIR_CODEX_HOME.*auth\.json/)
  })

  it('control: PAIR_CODEX_HOME unset ⇒ child CODEX_HOME is the driver inherited one, never a resolved cwd', async () => {
    const { file, worktree } = engineStub()
    process.env['CODEX_HOME'] = '/driver/inherited-codex-home'
    expect((await run(file, worktree)).final?.reason).toBe('/driver/inherited-codex-home')
  })

  it('control: a non-codex engine ignores a relative PAIR_CODEX_HOME without auth.json (no error, no override)', async () => {
    const { file, worktree } = engineStub()
    process.env['CODEX_HOME'] = '/driver/inherited-codex-home'
    process.env['PAIR_CODEX_HOME'] = relative(process.cwd(), home(false))
    const result = await run(file, worktree, 'claude')
    expect(result.outcome).not.toBe('failed')
    expect(result.final?.reason).toBe('/driver/inherited-codex-home')
  })
})
