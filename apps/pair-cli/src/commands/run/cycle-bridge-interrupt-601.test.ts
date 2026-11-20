import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { createCycleScriptsBridge } from './cycle-scripts'
import * as hostProcess from './host-process'

it('#601 AC3: decision host reads do not block the driver event loop', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-601-bridge-'))
  writeFileSync(join(root, 'cycle-state.mjs'), 'process.stdout.write("{}")\n')
  const bridge = createCycleScriptsBridge({ scriptsDir: root }, root)
  let yielded = false
  setImmediate(() => {
    yielded = true
  })
  await bridge.decisions?.({ dir: root, story: '601' })
  expect(yielded).toBe(true)
})

it('#601 AC3: a bridge deadline is reported as a transient host failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-601-bridge-timeout-'))
  const spawn = vi.spyOn(hostProcess, 'runHostProcess').mockResolvedValue({
    status: null,
    stdout: '',
    stderr: '',
    error: new Error('host command timed out after 30000ms'),
  })
  try {
    const bridge = createCycleScriptsBridge({ scriptsDir: root }, root)
    await expect(bridge.decisions?.({ dir: root, story: '601' })).rejects.toThrow(/host-transient/)
  } finally {
    spawn.mockRestore()
  }
})

it('#601 AC3: acceptance hash host reads do not block the driver event loop', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-601-hash-'))
  writeFileSync(
    join(root, 'cycle-state.mjs'),
    'process.stdout.write(JSON.stringify({acHash:"abc"}))\n',
  )
  const bridge = createCycleScriptsBridge({ scriptsDir: root }, root)
  let yielded = false
  setImmediate(() => {
    yielded = true
  })
  expect(await bridge.acHash('601', root)).toBe('abc')
  expect(yielded).toBe(true)
})

it('#601 AC3: merge checks do not block the driver event loop', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-601-merge-'))
  writeFileSync(join(root, 'cycle-merge.mjs'), 'process.stdout.write("{}")\n')
  const bridge = createCycleScriptsBridge({ scriptsDir: root }, root)
  let yielded = false
  setImmediate(() => {
    yielded = true
  })
  expect(bridge.mergeCheckAsync).toBeTypeOf('function')
  await bridge.mergeCheckAsync?.({
    dir: root,
    story: '601',
    pr: 1,
    reviewedHead: 'abc',
    cardTier: 'red',
  })
  expect(yielded).toBe(true)
})

it('#601 AC3: resolver host reads do not block the driver event loop', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-601-resolve-'))
  writeFileSync(join(root, 'cycle-state.mjs'), 'process.stdout.write("{}")\n')
  const bridge = createCycleScriptsBridge({ scriptsDir: root }, root)
  let yielded = false
  setImmediate(() => {
    yielded = true
  })
  const resolve = (bridge as typeof bridge & { resolveAsync: typeof bridge.resolve }).resolveAsync
  expect(resolve).toBeTypeOf('function')
  await resolve({ dir: root, workflowVersion: '4.0.1', policy: {}, entry: 'fresh' })
  expect(yielded).toBe(true)
})

it('#601 AC3: merge host work remains interruptible before a possible write', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-601-merge-run-'))
  writeFileSync(join(root, 'cycle-merge.mjs'), 'process.stdout.write("{}")\n')
  const bridge = createCycleScriptsBridge({ scriptsDir: root }, root)
  const merge = (bridge as typeof bridge & { mergeRunAsync: typeof bridge.mergeRun }).mergeRunAsync
  expect(merge).toBeTypeOf('function')
  let yielded = false
  setImmediate(() => {
    yielded = true
  })
  await merge({
    dir: root,
    story: '601',
    pr: 1,
    reviewedHead: 'abc',
    cardTier: 'red',
    gate: 'red',
    message: 'test',
  })
  expect(yielded).toBe(true)
})

it.each(['escalate', 'complete'])(
  '#601 AC3: prepare %s host work remains interruptible',
  async operation => {
    const root = mkdtempSync(join(tmpdir(), 'pair-601-prepare-write-'))
    writeFileSync(
      join(root, 'cycle-prepare.mjs'),
      'process.stdout.write(JSON.stringify({result:"ok"}))\n',
    )
    const bridge = createCycleScriptsBridge({ scriptsDir: root }, root)
    const common = {
      dir: root,
      story: '601',
      gate: { mode: 'never', has: [], lacks: [] },
      source: 'test',
    }
    let yielded = false
    setImmediate(() => {
      yielded = true
    })
    const result =
      operation === 'escalate'
        ? await bridge.prepareEscalateAsync?.({ ...common, boundary: 'B1' })
        : await bridge.prepareCompleteAsync?.(common)
    expect(result).toMatchObject({ result: 'ok' })
    expect(yielded).toBe(true)
  },
)
