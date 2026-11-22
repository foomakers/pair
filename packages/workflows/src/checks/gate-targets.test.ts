import { runGate } from '.'
import { readGateTargets } from '../kinds'

const registry = { a: 'cmd-a', b: 'cmd-b', c: 'cmd-c' }
const targets = { increment: ['a', 'b'], pr: ['c'] }
const ran: string[] = []
const run = (fail?: string) => async (command: string) => {
  ran.push(command)
  return { code: command === fail ? 1 : 0, output: `out ${command}` }
}
beforeEach(() => (ran.length = 0))

describe('readGateTargets', () => {
  const text = [
    '### Custom Gate Registry',
    '',
    '| Order | Key | Command | Target |',
    '| --- | --- | --- | --- |',
    '| 1 | a | `cmd-a` | increment |',
    '| 2 | b | `cmd-b` | increment, pr |',
    '| 3 | c | `cmd-c` | |',
  ].join('\n')

  it('lists the keys of each target in row order; a blank Target belongs to every target', () => {
    expect(readGateTargets(text)).toEqual({ increment: ['a', 'b', 'c'], pr: ['b', 'c'] })
  })
  it('has no target without a Target column', () => {
    expect(
      readGateTargets('### Custom Gate Registry\n\n| Key | Command |\n| --- | --- |\n| a | x |'),
    ).toEqual({})
  })
})

describe('gate: gates entries are keys, target:<name> or command:<line>', () => {
  it('runs each entry in order: a key, the rows of a target, a command', async () => {
    const result = await runGate(
      { gates: ['c', 'target:increment', 'command:echo done'] },
      { registry, targets, run: run() },
    )
    expect(result.status).toBe('ok')
    expect(ran).toEqual(['cmd-c', 'cmd-a', 'cmd-b', 'echo done'])
  })
  it('fails at the first failing command, running no later entry', async () => {
    const result = await runGate(
      { gates: ['command:one', 'command:two'] },
      { registry, targets, run: run('one') },
    )
    expect(result).toMatchObject({ status: 'failed', reason: 'gate-failed: command:one' })
    expect(ran).toEqual(['one'])
  })
  it('fails on a target the registry does not hold', async () => {
    const result = await runGate(
      { gates: ['target:release'] },
      { registry, targets, run: run() },
    )
    expect(result).toMatchObject({ status: 'failed', reason: 'unknown-gate' })
    expect(ran).toEqual([])
  })
})
