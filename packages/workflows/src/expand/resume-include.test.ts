import { expect, it } from 'vitest'
import { next, record, start } from '../engine'
import { createMemoryFiles } from '../engine/memory-files'

it('retries a failed expanded step on resume (699 AC-1)', async () => {
  const run = { files: createMemoryFiles(), dir: '/runs/include-699' }
  const source = {
    file: 'root.yaml',
    text: 'version: 1\nname: root\nsteps:\n  shared/work: { kind: generic, skill: my-skill }\n',
  }
  await start(run, source, { card: '699' })
  expect((await next(run)).ready.map(step => step.id)).toEqual(['shared/work'])
  await record(run, 'shared/work', { status: 'failed', summary: 'failed' })
  expect((await start(run, source, { card: '699' })).status).toBe('resumed')
  expect((await next(run)).ready.map(step => step.id)).toEqual(['shared/work'])
})
