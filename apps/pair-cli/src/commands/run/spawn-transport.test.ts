import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
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

function engine(script: string) {
  const cwd = mkdtempSync(join(tmpdir(), 'pair-epipe-'))
  const file = join(cwd, 'engine.cjs')
  writeFileSync(file, script)
  return { engine: { ...ENGINES.pi, command: process.execPath, headlessArgs: [file] }, cwd }
}

describe('spawnIteration owned pipe failures (US-594 AC-1, AC-5)', () => {
  it('returns a controlled failure when stderr reports EPIPE while a real child closes', async () => {
    const { engine: stub, cwd } = engine(
      'setTimeout(() => process.stdout.write(\'{"type":"agent_end"}\\n\'), 20)',
    )
    const run = spawnIteration({ engine: stub, cwd, promptText: 'go', autonomyArgs: [] })
    const child = spawned.child!
    child.stderr!.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
    await expect(run).resolves.toMatchObject({ outcome: 'failed' })
  })

  it('keeps an unrelated stderr error visible', async () => {
    const { engine: stub, cwd } = engine(
      'setTimeout(() => process.stdout.write(\'{"type":"agent_end"}\\n\'), 20)',
    )
    const run = spawnIteration({ engine: stub, cwd, promptText: 'go', autonomyArgs: [] })
    spawned.child!.stderr!.emit('error', Object.assign(new Error('disk fault'), { code: 'EIO' }))
    await expect(run).rejects.toThrow('disk fault')
  })

  it('contains stdout EPIPE and a duplicate pipe notification', async () => {
    const { engine: stub, cwd } = engine(
      'setTimeout(() => process.stdout.write(\'{"type":"agent_end"}\\n\'), 20)',
    )
    const run = spawnIteration({ engine: stub, cwd, promptText: 'go', autonomyArgs: [] })
    const error = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
    spawned.child!.stdout!.emit('error', error)
    spawned.child!.stderr!.emit('error', error)
    await expect(run).resolves.toMatchObject({
      outcome: 'failed',
      detail: expect.stringContaining('EPIPE'),
    })
  })

  it('returns a controlled failure when the engine command is absent', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pair-missing-engine-'))
    const command = join(cwd, 'missing-engine')
    const result = await spawnIteration({
      engine: { ...ENGINES.pi, command },
      cwd,
      promptText: 'go',
      autonomyArgs: [],
    })
    expect(result).toMatchObject({ outcome: 'failed' })
    expect(result.detail).toContain(command)
  })
})
