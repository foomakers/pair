import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import type { DriveCycleResult } from './run-context'

// US-596: a merge park is reported awaiting-human only for parkKind 'awaiting-human'; every other park is a failure.

const cwd = '/project'

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

function harness(outcome: DriveCycleResult) {
  const audit: string[] = []
  const stdout: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '))
  })
  const runIteration: IterationRunner = async () => ({ outcome: 'success', detail: 'done' })
  const deps: RunHandlerDependencies = {
    runIteration,
    acquireLock: ({ card }) => ({
      kind: 'acquired',
      lock: { path: `/locks/${card}`, release: () => {} },
    }),
    appendAudit: (_path, line) => audit.push(line),
    cardReadiness: async () => 'ready',
    driveCycle: async () => outcome,
  }
  return { audit, stdout, deps }
}

const parked = (parkKind: string | null | undefined, code: string, detail: string) => ({
  status: 'merge-parked',
  stagesRun: 0,
  next: { step: 'merge' },
  merge: {
    stage: 'merge',
    mode: 'check',
    mergeAllowed: false,
    failed: [{ code, detail }],
    reason: detail,
    ...(parkKind !== undefined && { parkKind }),
  },
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('merge park reporting', () => {
  it('#605: dead-dispatch park exits nonzero while remaining awaiting human', async () => {
    const { deps } = harness({
      status: 'awaiting-human',
      stagesRun: 1,
      next: { step: 'implement', phase: 'a0' },
      resumeToken: 'implement:a0:dead-dispatch',
      reason: 'dead-dispatch: stage returned no handoff',
    })
    const code = await handleRunCommand(
      parseRunCommand({ card: '601', cardTags: '' }),
      files(),
      deps,
    )
    expect(code).toBe(1)
  })

  it('US-601 AC3: an exhausted host park exits successfully and releases the lock', async () => {
    let releases = 0
    const { deps } = harness({
      status: 'awaiting-human',
      stagesRun: 0,
      next: { step: 'resolve', phase: 'run' },
      resumeToken: 'resolve:run:host-transient',
      reason: 'host-transient: gh issue view exhausted',
    })
    deps.acquireLock = ({ card }) => ({
      kind: 'acquired',
      lock: { path: `/locks/${card}`, release: () => releases++ },
    })
    const code = await handleRunCommand(
      parseRunCommand({ card: '601', cardTags: '' }),
      files(),
      deps,
    )
    expect(code).toBe(0)
    expect(releases).toBe(1)
  })

  it.each([
    ['awaiting-human', 'awaiting-human'],
    ['halted', 'failed'],
    ['escalated', 'failed'],
    [undefined, 'failed'],
  ])('reports %s as %s', async (kind, expected) => {
    const output: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation(
      chunk => (output.push(String(chunk)), true),
    )
    const { deps } = harness(parked(kind, 'gate', 'merge reason'))
    const exitCode = await handleRunCommand(
      parseRunCommand({ card: '596', cardTags: '', json: true }),
      files(),
      deps,
    )
    expect(exitCode).toBe(kind === 'awaiting-human' ? 0 : 1)
    const events = output
      .join('')
      .split('\n')
      .filter(line => line.startsWith('{'))
      .map(line => JSON.parse(line))
    expect(events.find(event => event.event === 'card-end')).toMatchObject({ status: expected })
  })
})

describe('merge park reporting is platform independent', () => {
  const original = process.platform
  afterEach(() => Object.defineProperty(process, 'platform', { value: original }))

  it.each(['darwin', 'linux'])('reports a halted park as failed on %s', async platform => {
    Object.defineProperty(process, 'platform', { value: platform })
    const output: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation(
      chunk => (output.push(String(chunk)), true),
    )
    const { deps } = harness(parked('halted', 'gate', 'merge reason'))
    await handleRunCommand(
      parseRunCommand({ card: '596', cardTags: '', json: true }),
      files(),
      deps,
    )
    const events = output
      .join('')
      .split('\n')
      .filter(line => line.startsWith('{'))
      .map(line => JSON.parse(line))
    expect(events.find(event => event.event === 'card-end')).toMatchObject({ status: 'failed' })
  })
})
