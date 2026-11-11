import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import { runPlannedCard, type CardProcessRunner } from './parallel'
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

describe('r1-1 controls — unchanged exits', () => {

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
const HALTED = [
  ['head-moved', 'the PR head moved since review'],
  ['gate-red', "the tier's gate set came back red at merge time"],
  ['signals-unreadable', 'pair-review conclusion unreadable'],
  ['tier-changed', 'the card tier changed since the cycle started'],
] as const

describe('merge-parked — awaiting a human is a terminal, a halted park is a failure', () => {

  it.each(HALTED)(
    'H1: a halted park (%s) exits 1 and is a failed --parallel child',
    async (c, d) => {
      const outcome = parked('halted', c, d)
      expect((await runCard('53', outcome)).code).toBe(1)
      expect((await batchChild('53', outcome)).outcome).toBe('failed')
    },
  )

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
