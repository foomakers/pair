import { expect, it } from 'vitest'
import { next, record, start } from '../engine'
import { createMemoryFiles } from '../engine/memory-files'

it('resumes an expanded loop child and continues to the final included step (#699 AC-8)', async () => {
  const run = { files: createMemoryFiles(), dir: '/runs/loop-include-699' }
  const source = {
    file: 'root.yaml',
    text: `version: 1
name: root
steps:
  rounds:
    kind: loop
    until: work/two
    max: 2
    on-max: fail
    steps:
      work/one: { kind: generic, skill: ok }
      work/two: { kind: generic, skill: ok }
`,
  }
  await start(run, source, { card: '699' })
  expect((await next(run)).ready.map(step => step.id)).toEqual(['rounds/work/one'])
  await record(run, 'rounds/work/one', { status: 'failed', summary: 'retry' })
  expect((await start(run, source, { card: '699' })).status).toBe('resumed')
  expect((await next(run)).ready.map(step => step.id)).toEqual(['rounds/work/one'])
  await record(run, 'rounds/work/one', { status: 'ok', summary: 'done' })
  expect((await next(run)).ready.map(step => step.id)).toEqual(['rounds/work/two'])
})
