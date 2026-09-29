import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import { batchExitCode, runPlannedCard, type CardProcessRunner } from './parallel'
import type { DriveCycleResult } from './run-context'
import type { RootCandidate } from './root-plan'

/**
 * US-490 review r1-1 — a card `pair-cli run --card` MERGES is a success, not a failure.
 *
 * `prepareCycleCoordinator` returns 0 only for `ready-for-merge`, so a card whose cycle ends
 * `merged` exits 1, its audit `end` says `outcome=failed`, and `--parallel` (which classifies a
 * child by its exit alone, `parallel.ts outcomeOfExit`) records it `failed` and exits the batch 1.
 *
 * Derived rule for `merged-closure-unfinished` (`cycle-wiring.ts mergeStatus`: `merged: true,
 * cascaded: false`): the merge landed but a Story Closure step (close/DoD/board/cascade/branch/
 * checkpoint) did not. `cycle-merge.mjs runMerge` returns it with `parkKind: 'halted'` and posts the
 * park comment on the card ("awaits action", AC4); its header says such a run is "never a plain
 * success". So it is NOT a success: non-zero exit (1), audit `outcome=failed`, `--parallel` records
 * it `failed` and the batch exits 1 — a human must finish the closure. Only `merged` (cascaded) and
 * `ready-for-merge` exit 0.
 *
 * Hermetic: in-memory project, injected readiness / cycle driver / lock / audit; the parallel rows
 * relay the in-process `run --card` exit as the child's exit — the only signal the pool reads.
 */

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

const MERGED: DriveCycleResult = {
  status: 'merged',
  stagesRun: 1,
  next: { step: 'merge' },
}
const CLOSURE_UNFINISHED: DriveCycleResult = {
  status: 'merged-closure-unfinished',
  stagesRun: 1,
  next: { step: 'merge' },
}

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

/** One `pair-cli run --card <id>` whose cycle ends with `outcome`: its exit code. */
async function runCard(id: string, outcome: DriveCycleResult) {
  const h = harness(outcome)
  const code = await handleRunCommand(parseRunCommand({ card: id, cardTags: '' }), files(), h.deps)
  return { code, ...h }
}

const candidate = (id: string): RootCandidate => ({
  id,
  title: `Card ${id}`,
  branch: `feature/US-${id}-x`,
  tier: 'risk:green',
  labels: [],
  mutexResources: [],
  prerequisites: [],
})

/** A `--parallel` child: the pool sees only the child `run --card` process's exit. */
async function batchChild(id: string, outcome: DriveCycleResult) {
  const runCardProcess: CardProcessRunner = async () => ({
    exitCode: (await runCard(id, outcome)).code,
    signal: null,
  })
  return runPlannedCard({
    card: candidate(id),
    config: parseRunCommand({ root: '66', parallel: '2' }),
    cwd,
    workingArea: '/w',
    acquireLock: () => ({ kind: 'acquired', lock: { path: 'p', release: () => {} } }),
    runCardProcess,
    now: () => 't',
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('r1-1: run --card — a merged card is a success', () => {
  it('M1: a cycle that ends `merged` exits 0, prints the merged outcome, audits outcome=completed', async () => {
    const { code, stdout, audit } = await runCard('32', MERGED)

    expect(code).toBe(0)
    expect(stdout.some(l => l.includes('Cycle status: merged ('))).toBe(true)
    expect(audit[audit.length - 1]).toMatch(/event=end card=32\b.*outcome=completed/)
  })
})

describe('r1-1: --parallel — a merged child counts as succeeded', () => {
  it('P1: a child that ends `merged` is recorded completed (exit 0), never failed', async () => {
    const outcome = await batchChild('41', MERGED)

    expect(outcome).toEqual({
      id: '41',
      outcome: 'completed',
      detail: 'exit 0',
      startedAt: 't',
      endedAt: 't',
    })
  })

  it('P2: a batch of a merged child and a ready-for-merge child exits 0', async () => {
    const outcomes = [
      await batchChild('41', MERGED),
      await batchChild('42', { status: 'ready-for-merge', stagesRun: 3 }),
    ]

    expect(outcomes.map(o => o.outcome)).toEqual(['completed', 'completed'])
    expect(batchExitCode(outcomes)).toBe(0)
  })
})

describe('r1-1: merged-closure-unfinished — merged, closure owed to a human: not a success', () => {
  it('U1: run --card exits 1, prints the status, audits outcome=failed', async () => {
    const { code, stdout, audit } = await runCard('33', CLOSURE_UNFINISHED)

    expect(code).toBe(1)
    expect(stdout.some(l => l.includes('Cycle status: merged-closure-unfinished'))).toBe(true)
    expect(audit[audit.length - 1]).toMatch(/event=end card=33\b.*outcome=failed/)
  })

  it('U2: --parallel records the child failed (exit 1) and the batch exits 1, beside a merged sibling', async () => {
    const outcomes = [await batchChild('41', MERGED), await batchChild('43', CLOSURE_UNFINISHED)]

    expect(outcomes.map(o => [o.id, o.outcome, o.detail])).toEqual([
      ['41', 'completed', 'exit 0'],
      ['43', 'failed', 'exit 1'],
    ])
    expect(batchExitCode(outcomes)).toBe(1)
  })
})

describe('r1-1 controls — unchanged exits', () => {
  it('C1: ready-for-merge still exits 0 (run --card and --parallel)', async () => {
    const ready: DriveCycleResult = { status: 'ready-for-merge', stagesRun: 3 }
    expect((await runCard('34', ready)).code).toBe(0)
    expect((await batchChild('34', ready)).outcome).toBe('completed')
  })

  it.each(['failed-prepare', 'failed-review', 'rounds-bound-reached', 'blocked', 'incompatible'])(
    'C2: %s still exits non-zero and is recorded failed',
    async status => {
      const outcome: DriveCycleResult = { status, stagesRun: 2 }
      expect((await runCard('35', outcome)).code).toBe(1)
      expect((await batchChild('35', outcome)).outcome).toBe('failed')
    },
  )
})

/**
 * Maintainer decision (merge-parked exit): a park that AWAITS A HUMAN is a terminal like
 * `ready-for-merge` — exit 0, `--parallel` completed; a park caused by a PROBLEM is a failure —
 * exit 1, `--parallel` failed. The discriminator is `cycle-merge.mjs`'s own `parkKind`
 * (`evaluate`: `'awaiting-human'` only for `tier-not-auto-advance`, `'halted'` otherwise; `runMerge`
 * forces `'halted'` for a refused merge or an unfinished closure), relayed verbatim by the merge
 * stage as the outcome's `merge` (`cycle.ts CycleOutcome.merge`, `cycle-wiring.ts mergeFor`).
 *
 * Contract pinned here: the cycle driver's result carries `merge` — the script's JSON — and
 * `run --card` reads `merge.parkKind`: `merge-parked` exits 0 ONLY for `'awaiting-human'`; `'halted'`,
 * a missing `merge` or an absent/unknown `parkKind` exit 1 (fail-safe: never a silent success).
 */
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
const AWAITING_HUMAN = parked(
  'awaiting-human',
  'tier-not-auto-advance',
  'card tier risk:yellow is not in ## Auto-Advance',
)
const HALTED = [
  ['head-moved', 'the PR head moved since review'],
  ['gate-red', "the tier's gate set came back red at merge time"],
  ['signals-unreadable', 'pair-review conclusion unreadable'],
  ['tier-changed', 'the card tier changed since the cycle started'],
] as const

describe('merge-parked — awaiting a human is a terminal, a halted park is a failure', () => {
  it('K1: an awaiting-human park exits 0, prints the status, audits outcome=completed', async () => {
    const { code, stdout, audit } = await runCard('51', AWAITING_HUMAN)

    expect(code).toBe(0)
    expect(stdout.some(l => l.includes('Cycle status: merge-parked'))).toBe(true)
    expect(audit[audit.length - 1]).toMatch(/event=end card=51\b.*outcome=completed/)
  })

  it('K2: an awaiting-human park is a completed --parallel child (exit 0)', async () => {
    const outcome = await batchChild('52', AWAITING_HUMAN)

    expect([outcome.outcome, outcome.detail]).toEqual(['completed', 'exit 0'])
  })

  it.each(HALTED)(
    'H1: a halted park (%s) exits 1 and is a failed --parallel child',
    async (c, d) => {
      const outcome = parked('halted', c, d)
      expect((await runCard('53', outcome)).code).toBe(1)
      expect((await batchChild('53', outcome)).outcome).toBe('failed')
    },
  )

  it('B1: mixed batch — awaiting-human + merged + ready-for-merge exits 0', async () => {
    const outcomes = [
      await batchChild('61', AWAITING_HUMAN),
      await batchChild('62', MERGED),
      await batchChild('63', { status: 'ready-for-merge', stagesRun: 3 }),
    ]

    expect(outcomes.map(o => o.outcome)).toEqual(['completed', 'completed', 'completed'])
    expect(batchExitCode(outcomes)).toBe(0)
  })

  it('B2: mixed batch — awaiting-human + halted exits 1, each child classified by its own park', async () => {
    const outcomes = [
      await batchChild('64', AWAITING_HUMAN),
      await batchChild('65', parked('halted', 'head-moved', 'the PR head moved since review')),
    ]

    expect(outcomes.map(o => [o.id, o.outcome])).toEqual([
      ['64', 'completed'],
      ['65', 'failed'],
    ])
    expect(batchExitCode(outcomes)).toBe(1)
  })

  it.each([
    ['no merge answer', { status: 'merge-parked', stagesRun: 0 }],
    ['no parkKind', parked(undefined, 'gate-red', 'red')],
    ['parkKind null', parked(null, 'gate-red', 'red')],
    ['unknown parkKind', parked('someday', 'gate-red', 'red')],
  ])('F1: fail-safe — merge-parked with %s exits 1', async (_name, outcome) => {
    expect((await runCard('66', outcome)).code).toBe(1)
    expect((await batchChild('66', outcome)).outcome).toBe('failed')
  })
})
