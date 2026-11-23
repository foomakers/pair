import { expect, it } from 'vitest'
import { expand } from '.'

const run = (caller: string, output: string) =>
  expand(
    {
      file: 'root.yaml',
      text: `version: 1\nname: root\nsteps:\n  call: { kind: ${caller}, uses: shared }\n`,
    },
    () => ({
      file: 'shared.yaml',
      text: `version: 1\nname: shared\n${output}\nsteps:\n  work: { kind: implement }\n`,
    }),
  )

it('rejects a missing selected output for a generic caller (AC-2)', () => {
  expect(run('generic', 'outputs: { from: missing }').errors.length).toBeGreaterThan(0)
})

it('accepts a different output kind that covers the caller outputs (AC-2)', () => {
  expect(run('gate', '').errors).toEqual([])
})
