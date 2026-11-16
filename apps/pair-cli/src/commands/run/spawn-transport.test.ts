import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENGINES } from './engines'

const spawned = vi.hoisted(() => ({
  child: undefined as import('node:child_process').ChildProcess | undefined,
}))
vi.mock('child_process', async importOriginal => {
  const original = await importOriginal<typeof import('node:child_process')>()
  return {
    ...original,
    spawn: (...args: Parameters<typeof original.spawn>) => {
      const child = original.spawn(...args)
      spawned.child = child
      return child
    },
  }
})
import { spawnIteration } from './spawn'

const groups: number[] = []
afterEach(async () => {
  const owned = groups.splice(0)
  for (const pid of owned) {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      /* already reaped */
    }
  }
  await Promise.all(
    owned.map(async pid => {
      const deadline = Date.now() + 300
      while (alive(pid) && Date.now() < deadline) await new Promise(done => setTimeout(done, 10))
    }),
  )
  vi.restoreAllMocks()
})

function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 2000
  while (!check()) {
    if (Date.now() > deadline) throw new Error('stub readiness timed out')
    await new Promise(done => setTimeout(done, 10))
  }
}
async function bounded<T>(pending: Promise<T>): Promise<T> {
  return Promise.race([
    pending,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('iteration did not settle')), 8000),
    ),
  ])
}
function engine(script: string) {
  const cwd = mkdtempSync(join(tmpdir(), 'pair-epipe-'))
  const file = join(cwd, 'engine.cjs')
  writeFileSync(file, script)
  return { stub: { ...ENGINES.pi, command: process.execPath, headlessArgs: [file] }, cwd }
}
function err(code: string, message = code) {
  return Object.assign(new Error(message), { code })
}
function start(
  script = 'setTimeout(() => process.stdout.write(\'{"type":"agent_settled"}\\n\'), 30)',
) {
  const { stub, cwd } = engine(script)
  const pending = spawnIteration({ engine: stub, cwd, promptText: 'go', autonomyArgs: [] })
  const child = spawned.child!
  if (child.pid) groups.push(child.pid)
  return { pending, child, cwd }
}
function ownedStub(exitLeader: boolean) {
  const descendant =
    "require('fs').writeFileSync('descendant.pid',String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"
  return `const fs=require('fs');fs.writeFileSync('engine.pid',String(process.pid));require('child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'inherit'});process.on('SIGTERM',()=>{});const ready=setInterval(()=>{if(fs.existsSync('descendant.pid')){clearInterval(ready);${exitLeader ? 'process.exit(0)' : `process.stdout.write('{"type":"message_start","message":{"role":"assistant"}}\\n')`}}},5);setInterval(()=>{},1000)`
}
async function pids(cwd: string): Promise<[number, number]> {
  await until(() => {
    try {
      return !!readFileSync(join(cwd, 'descendant.pid'), 'utf8')
    } catch {
      return false
    }
  })
  return [
    Number(readFileSync(join(cwd, 'engine.pid'), 'utf8')),
    Number(readFileSync(join(cwd, 'descendant.pid'), 'utf8')),
  ]
}

describe('spawnIteration transport ownership (US-594 AC-1, AC-4, AC-5)', () => {
  it.each(['stdout', 'stderr'])(
    '%s EPIPE reaps resistant leader and ready descendant',
    async channel => {
      const { stub, cwd } = engine(ownedStub(false))
      let events = 0
      const pending = spawnIteration({
        engine: stub,
        cwd,
        promptText: 'go',
        autonomyArgs: [],
        idleTimeoutSeconds: 0.2,
        onEvent: () => {
          events++
          spawned.child![channel as 'stdout' | 'stderr']!.emit('error', err('EPIPE'))
        },
      })
      if (spawned.child?.pid) groups.push(spawned.child.pid)
      const [leader, descendant] = await pids(cwd)
      expect(await bounded(pending)).toMatchObject({
        outcome: 'failed',
        detail: expect.stringContaining('EPIPE'),
      })
      expect(events).toBe(1)
      expect(alive(leader)).toBe(false)
      expect(alive(descendant)).toBe(false)
    },
    10000,
  )

  it('stdout EPIPE reaps descendant after leader exits', async () => {
    const { pending, child, cwd } = start(ownedStub(true))
    const [leader, descendant] = await pids(cwd)
    await until(() => child.exitCode !== null)
    child.stdout!.emit('error', err('EPIPE'))
    expect(await pending).toMatchObject({
      outcome: 'failed',
      detail: expect.stringContaining('EPIPE'),
    })
    expect(alive(leader)).toBe(false)
    expect(alive(descendant)).toBe(false)
  }, 10000)

  it('stderr EPIPE reaps descendant after leader exits', async () => {
    const { stub, cwd } = engine(ownedStub(true))
    const pending = spawnIteration({
      engine: stub,
      cwd,
      promptText: 'go',
      autonomyArgs: [],
      idleTimeoutSeconds: 0.2,
    })
    const child = spawned.child!
    if (child.pid) groups.push(child.pid)
    const [leader, descendant] = await pids(cwd)
    await until(() => child.exitCode !== null)
    child.stderr!.emit('error', err('EPIPE'))
    expect(await bounded(pending)).toMatchObject({
      outcome: 'failed',
      detail: expect.stringContaining('EPIPE'),
    })
    expect(alive(leader)).toBe(false)
    expect(alive(descendant)).toBe(false)
  }, 10000)

  it('idle timeout reaps resistant leader and ready descendant', async () => {
    const { stub, cwd } = engine(ownedStub(false))
    const pending = spawnIteration({
      engine: stub,
      cwd,
      promptText: 'go',
      autonomyArgs: [],
      idleTimeoutSeconds: 0.3,
    })
    if (spawned.child?.pid) groups.push(spawned.child.pid)
    const [leader, descendant] = await pids(cwd)
    expect(await bounded(pending)).toMatchObject({
      outcome: 'failed',
      cause: 'timed-out',
      stalled: true,
    })
    expect(alive(leader)).toBe(false)
    expect(alive(descendant)).toBe(false)
  }, 10000)

  it('next dispatch starts after EPIPE-owned processes exit', async () => {
    const { stub, cwd } = engine(ownedStub(false))
    const first = spawnIteration({
      engine: stub,
      cwd,
      promptText: 'go',
      autonomyArgs: [],
      idleTimeoutSeconds: 0.2,
      onEvent: () => spawned.child!.stdout!.emit('error', err('EPIPE')),
    })
    if (spawned.child?.pid) groups.push(spawned.child.pid)
    const [leader, descendant] = await pids(cwd)
    expect((await first).outcome).toBe('failed')
    const next = start('process.stdout.write(\'{"type":"agent_settled"}\\n\')')
    expect(alive(leader)).toBe(false)
    expect(alive(descendant)).toBe(false)
    expect((await next.pending).outcome).toBe('success')
  }, 5000)

  it('healthy terminal succeeds', async () => {
    expect(
      (await start('process.stdout.write(\'{"type":"agent_settled"}\\n\')').pending).outcome,
    ).toBe('success')
  })
  it('missing engine returns controlled failure', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pair-missing-engine-'))
    const oldPath = process.env['PATH']
    process.env['PATH'] = cwd
    try {
      expect(
        await spawnIteration({ engine: ENGINES.pi, cwd, promptText: 'go', autonomyArgs: [] }),
      ).toMatchObject({ outcome: 'failed', detail: expect.stringContaining('pi') })
    } finally {
      process.env['PATH'] = oldPath
    }
  })

  it.each(['stdout', 'stderr'])('%s EPIPE alone returns controlled failure', async channel => {
    const { pending, child } = start()
    child[channel as 'stdout' | 'stderr']!.emit('error', err('EPIPE'))
    await expect(pending).resolves.toMatchObject({ outcome: 'failed' })
  })
  it.each(['stdout', 'stderr'])('%s EIO alone rejects', async channel => {
    const { pending, child } = start()
    child[channel as 'stdout' | 'stderr']!.emit('error', err('EIO', 'disk fault'))
    await expect(pending).rejects.toThrow('disk fault')
  })
  it('keeps an unrelated stderr error visible', async () => {
    const { pending, child } = start()
    child.stderr!.emit('error', err('EIO', 'disk fault'))
    await expect(pending).rejects.toThrow('disk fault')
  })
  it.each(['stdout', 'stderr'])('%s EPIPE then EIO rejects with EIO', async channel => {
    const { pending, child } = start()
    child[channel as 'stdout' | 'stderr']!.emit('error', err('EPIPE'))
    child[channel as 'stdout' | 'stderr']!.emit('error', err('EIO', 'disk fault'))
    await expect(pending).rejects.toThrow('disk fault')
  })
  it.each(['stdout', 'stderr'])('%s EIO then EPIPE keeps EIO', async channel => {
    const { pending, child } = start()
    child[channel as 'stdout' | 'stderr']!.emit('error', err('EIO', 'disk fault'))
    child[channel as 'stdout' | 'stderr']!.emit('error', err('EPIPE'))
    await expect(pending).rejects.toThrow('disk fault')
  })
  it.each([
    ['stdout', 'stderr'],
    ['stderr', 'stdout'],
  ] as const)('%s EPIPE then %s EIO reports EIO', async (epipeChannel, eioChannel) => {
    const { pending, child } = start()
    child[epipeChannel]!.emit('error', err('EPIPE'))
    child[eioChannel]!.emit('error', err('EIO', 'disk fault'))
    await expect(pending).rejects.toThrow('disk fault')
  })
  it.each([
    ['stdout', 'stderr'],
    ['stderr', 'stdout'],
  ] as const)('%s EIO then %s EPIPE keeps EIO', async (eioChannel, epipeChannel) => {
    const { pending, child } = start()
    child[eioChannel]!.emit('error', err('EIO', 'disk fault'))
    child[epipeChannel]!.emit('error', err('EPIPE'))
    await expect(pending).rejects.toThrow('disk fault')
  })
  it('stderr ABORT_ERR is ignored', async () => {
    const { pending, child } = start()
    child.stderr!.emit('error', err('ABORT_ERR'))
    await expect(pending).resolves.toMatchObject({ outcome: 'success' })
  })
  it('stdout ABORT_ERR after EPIPE is controlled cancellation', async () => {
    const { pending, child } = start()
    child.stderr!.emit('error', err('EPIPE'))
    child.stdout!.emit('error', err('ABORT_ERR'))
    await expect(pending).resolves.toMatchObject({ outcome: 'failed' })
  })
  it('child EPERM alone rejects', async () => {
    const { pending, child } = start()
    child.emit('error', err('EPERM', 'kill EPERM'))
    await expect(pending).rejects.toThrow('kill EPERM')
  })
  it.each(['stdout', 'stderr'])('child then pipe %s EPIPE rejects with EPERM', async channel => {
    const { pending, child } = start()
    child.emit('error', err('EPERM', 'kill EPERM'))
    child[channel as 'stdout' | 'stderr']!.emit('error', err('EPIPE'))
    await expect(pending).rejects.toThrow('kill EPERM')
  })
  it.each(['stdout', 'stderr'])('pipe then child %s EPIPE rejects with EPERM', async channel => {
    const { pending, child } = start()
    child[channel as 'stdout' | 'stderr']!.emit('error', err('EPIPE'))
    child.emit('error', err('EPERM', 'kill EPERM'))
    await expect(pending).rejects.toThrow('kill EPERM')
  })
  it('child first error survives duplicate child and pipe notifications', async () => {
    const { pending, child } = start()
    child.emit('error', err('EPERM', 'first child fault'))
    child.emit('error', err('EIO', 'second child fault'))
    child.stdout!.emit('error', err('EPIPE'))
    await expect(pending).rejects.toThrow('first child fault')
  })
  it('child EPIPE then EPERM reports EPERM', async () => {
    const { pending, child } = start()
    child.emit('error', err('EPIPE'))
    child.emit('error', err('EPERM', 'late EPERM'))
    await expect(pending).rejects.toThrow('late EPERM')
  })
  it('child EPIPE alone returns controlled failure', async () => {
    const { pending, child } = start()
    child.emit('error', err('EPIPE'))
    await expect(pending).resolves.toMatchObject({
      outcome: 'failed',
      detail: expect.stringContaining('EPIPE'),
    })
  })
  it('duplicate EPIPE across stdout and stderr stays controlled', async () => {
    const { pending, child } = start()
    child.stdout!.emit('error', err('EPIPE'))
    child.stderr!.emit('error', err('EPIPE'))
    await expect(pending).resolves.toMatchObject({ outcome: 'failed' })
  })
  it.each(['stdout', 'stderr', 'child'])(
    'late %s EPIPE is contained while unrelated error is reported',
    async channel => {
      const { pending, child } = start('process.stdout.write(\'{"type":"agent_settled"}\\n\')')
      expect((await pending).outcome).toBe('success')
      const report = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const target = channel === 'child' ? child : child[channel as 'stdout' | 'stderr']!
      target.emit('error', err('EPIPE'))
      target.emit('error', err('EIO', 'late EIO'))
      expect(report).toHaveBeenCalledOnce()
      expect(report.mock.calls[0]?.[0]).toMatchObject({ code: 'EIO', message: 'late EIO' })
    },
  )
})
