import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import type { DriveCycleResult } from './run-context'

// US-596 AC2: an awaiting-human merge park keeps its actionable merge.reason in the card-end event (JSON and plain).

const cwd = '/project'
const REASON = 'CI checks pending: build'

const files = (): InMemoryFileSystemService =>
  new InMemoryFileSystemService(
    {
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          skills: {
            source: '.skills',
            behavior: 'overwrite',
            description: 'skills',
            prefix: 'pair',
            targets: [{ path: '.claude/skills/', mode: 'canonical' }],
          },
        },
      }),
      [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
      '/bin/claude': '',
    },
    cwd,
    cwd,
  )

const outcome: DriveCycleResult = {
  status: 'merge-parked',
  stagesRun: 0,
  next: { step: 'merge' },
  merge: {
    stage: 'merge',
    mode: 'check',
    mergeAllowed: false,
    failed: [{ code: 'ci', detail: REASON }],
    reason: REASON,
    parkKind: 'awaiting-human',
  },
} as unknown as DriveCycleResult

afterEach(() => {
  vi.restoreAllMocks()
})

describe('awaiting-human merge park keeps its reason', () => {
  it.each([
    ['json', { json: true }],
    ['plain', {}],
  ])('card-end output carries merge.reason in %s mode', async (_mode, flags) => {
    const output: string[] = []
    const capture = (chunk: unknown) => (output.push(String(chunk)), true)
    vi.spyOn(process.stdout, 'write').mockImplementation(capture)
    vi.spyOn(process.stderr, 'write').mockImplementation(capture)
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '))
    })
    const runIteration: IterationRunner = async () => ({ outcome: 'success', detail: 'done' })
    const deps: RunHandlerDependencies = {
      runIteration,
      acquireLock: ({ card }) => ({
        kind: 'acquired',
        lock: { path: `/locks/${card}`, release: () => {} },
      }),
      appendAudit: () => {},
      cardReadiness: async () => 'ready',
      driveCycle: async () => outcome,
    }
    await handleRunCommand(parseRunCommand({ card: '596', cardTags: '', ...flags }), files(), deps)
    const cardEnd = output
      .join('\n')
      .split('\n')
      .filter(line => line.includes('card-end'))
    expect(cardEnd.join('\n')).toContain(REASON)
  })
})
