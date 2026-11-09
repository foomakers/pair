import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import type { CardProcessExit } from './parallel'

let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-gate-red-')))
  // No engine directory or host CLI is available to these probes.
  vi.stubEnv('PATH', '/bin')
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

const exit = (cycleStatus: string, exitCode = 1): CardProcessExit => ({
  exitCode,
  signal: null,
  cycleStatus,
})

async function probe(
  first: CardProcessExit,
  { progress = true, cards = '1,2', closed = false, cap = 3 } = {},
) {
  const calls: string[] = []
  const output: string[] = []
  const audit: string[] = []
  let peerCalls = 0
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.join(' '))
  })
  const fs = new InMemoryFileSystemService(
    { [join(root, 'config.json')]: JSON.stringify({ asset_registries: {} }) },
    root,
    root,
  )
  const code = await handleRunCommand(
    parseRunCommand({ cwd: root, autonomous: true, cards, maxIterations: cap }),
    fs,
    {
      readCardClosedAt: id => (closed && id === '1' ? new Date(0) : null),
      runCardProcess: async ({ card }) => {
        calls.push(card.id)
        if (card.id === '1') return first
        peerCalls += 1
        if (progress) {
          const dir = join(root, '.pair/working/runs/story-2/2')
          mkdirSync(dir, { recursive: true })
          writeFileSync(join(dir, 'a0-implement-phase.json'), '{}')
        }
        return peerCalls === 1 ? exit('rounds-bound-reached') : exit('ready-for-merge', 0)
      },
      appendAudit: (_path, line) => void audit.push(line),
    },
  )
  return { code, calls, output: output.join('\n'), audit: audit.join('\n') }
}

describe('r1-g1 gate-red contract at the handler boundary', () => {
  it.each([
    ['W1', '1,2', ['1', '2', '2']],
    ['W2', '2,1', ['2', '1', '2']],
  ])('%s: peer progress cannot retry a gate-red exit 1', async (_row, cards, expected) => {
    const result = await probe(exit('gate-red'), { cards: cards as string })
    expect(result.calls).toEqual(expected)
    expect(result.output).toContain('#1: terminal — gate-red (exit 1)')
    expect(result.output).toContain('#2: at-target')
    expect(result.output).toContain('Passes: 2')
    expect(result.output).toContain('Stop: terminal')
    expect(result.audit).toContain('1:terminal')
    expect(result.code).toBe(1)
  })

  it('W3: gate-red remains terminal without peer progress', async () => {
    const result = await probe(exit('gate-red'), { progress: false })
    expect(result.calls).toEqual(['1', '2'])
    expect(result.output).toContain('#1: terminal — gate-red (exit 1)')
    expect(result.output).toContain('Stop: no-progress')
    expect(result.code).toBe(1)
  })

  it('W4: a single gate-red card terminates with its reason', async () => {
    const result = await probe(exit('gate-red'), { cards: '1' })
    expect(result.calls).toEqual(['1'])
    expect(result.output).toContain('#1: terminal — gate-red (exit 1)')
    expect(result.output).toContain('Stop: terminal')
    expect(result.code).toBe(1)
  })

  it.each([
    ['C1', 'gate-red', 0],
    ['C2', 'escalated', 1],
    ['C3', 'merge-parked', 0],
    ['C4', 'failed-implement', 1],
  ])('%s: existing terminal status %s stays excluded', async (_row, status, code) => {
    const result = await probe(exit(status as string, code as number))
    expect(result.calls).toEqual(['1', '2', '2'])
    expect(result.output).toContain(`#1: terminal — ${status}`)
    expect(result.output).toContain('Stop: terminal')
    expect(result.code).toBe(1)
  })

  it('C5: an unfinished nonterminal still retries on peer progress', async () => {
    const result = await probe(exit('rounds-bound-reached'))
    expect(result.calls).toEqual(['1', '2', '1', '2'])
    expect(result.output).toContain('#1: retryable')
    expect(result.output).toContain('Stop: no-progress')
    expect(result.code).toBe(1)
  })

  it('C6: durable completion skips the card even if its unused outcome is gate-red', async () => {
    const result = await probe(exit('gate-red'), { closed: true })
    expect(result.calls).toEqual(['2', '2'])
    expect(result.output).toContain('#1: at-target — already at target')
    expect(result.output).toContain('Stop: all-at-target')
    expect(result.code).toBe(0)
  })

  it('C7: an explicit successful target remains at target', async () => {
    const result = await probe(exit('ready-for-merge', 0))
    expect(result.calls).toEqual(['1', '2', '2'])
    expect(result.output).toContain('#1: at-target')
    expect(result.code).toBe(0)
  })

  it('W5: pass cap does not change the terminal classification', async () => {
    const result = await probe(exit('gate-red'), { cap: 1 })
    expect(result.calls).toEqual(['1', '2'])
    expect(result.output).toContain('#1: terminal — gate-red (exit 1)')
    expect(result.output).toContain('Stop: pass-cap')
    expect(result.code).toBe(1)
  })
})
