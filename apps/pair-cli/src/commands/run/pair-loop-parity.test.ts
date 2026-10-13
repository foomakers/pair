import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { completeCandidates, type RootCandidate } from './root-plan'
import { runWatchLoop } from './watch-loop'

/**
 * Parity with `.claude/workflows/pair-loop.js` (the in-session realization of the loop): the branch a card with
 * none gets, and the slug it is derived from, are the SAME rule in both (US-... E / Z).
 */
const source = readFileSync(
  join(__dirname, '../../../../../.claude/workflows/pair-loop.js'),
  'utf-8',
)
const pick = (name: string, oneLine = false): string => {
  const pattern = oneLine
    ? new RegExp(`^const ${name} =[^\\n]*\\n`, 'm')
    : new RegExp(`^(?:const|function) ${name}[\\s\\S]*?\\n(?:\\}|\\))\\n`, 'm')
  const text = pattern.exec(source)?.[0]
  if (text === undefined) throw new Error(`${name} not found in pair-loop.js`)
  return text
}
const workflowComplete = new Function(
  `${pick('slugOf')}\n${pick('completeCandidates')}\nreturn completeCandidates`,
)() as (
  cards: Array<{ id: string; title: string; branch: string }>,
) => Array<{ id: string; title: string; branch: string }>

const card = (id: string, title: string, branch = ''): RootCandidate => ({
  id,
  title,
  branch,
  tier: 'risk:green',
  mutexResources: [],
  prerequisites: [],
})

describe('pair-loop.js <-> pair-cli parity: branch derivation for a card with none', () => {
  it.each([
    ['399', 'Add CLI Thing!', ''],
    ['353', '  Weird   --  title / with *chars*  ', ''],
    ['7', 'A'.repeat(80), ''],
    ['8', '!!!', ''],
    ['262', 'kept', 'bug/BUG-1-x'],
    ['5', '', ''],
  ])('#%s %j', (id, title, branch) => {
    const mine = completeCandidates([card(id, title, branch)], () => undefined)[0]!
    const theirs = workflowComplete([{ id, title, branch }])[0]!
    expect(theirs.branch).toBe(mine.branch)
  })
})

/**
 * Maintainer decision 2026-10-06: the SAME card-drive rules in both realizations — terminal outcomes never again, an
 * escalated card skipped while escalated and re-picked once cleared, a failed card retried within a budget of 1.
 * The scenarios are replayed through pair-cli's `runWatchLoop` and through the workflow's own helpers.
 */
const helpers = new Function(
  `${pick('DEFAULT_RETRY_BUDGET', true)}\n${pick('TERMINAL_STATUSES', true)}\n${pick('outcomeKind', true)}\n${pick('newDriveState', true)}\n${pick('recordOutcome')}\n${pick('decideDrive')}\nreturn { newDriveState, recordOutcome, decideDrive }`,
)() as {
  newDriveState: () => unknown
  recordOutcome: (state: unknown, id: string, kind: string) => void
  decideDrive: (state: unknown, card: { id: string; escalated: boolean }) => { drive: boolean }
}

type Step = { escalated: boolean; outcome: 'completed' | 'failed' | 'durable' }

const viaCli = async (steps: Step[]): Promise<boolean[]> => {
  let i = 0
  const ran: boolean[] = []
  await runWatchLoop(
    { watch: true, intervalMs: 1, cap: steps.length },
    {
      select: async () => ({
        candidates: [
          { ...card('1', 't', 'b'), escalated: steps[Math.min(i++, steps.length - 1)]!.escalated },
        ],
      }),
      probeLock: () => ({ kind: 'free' }),
      runBatch: async cards => {
        const step = steps[i - 1]!.outcome
        ran[i - 1] = true
        const outcome = step === 'completed' ? 'completed' : 'failed'
        return {
          outcomes: cards.map(c => ({
            id: c.id,
            outcome,
            detail: step,
            ...(step === 'durable' && { cycleStatus: 'failed-contract' }),
          })),
        }
      },
      wait: async () => 'elapsed',
      isInterrupted: () => false,
      onIteration: () => {},
    },
  )
  return steps.map((_, index) => ran[index] === true)
}

const viaWorkflow = (steps: Step[]): boolean[] => {
  const state = helpers.newDriveState()
  return steps.map(step => {
    const decision = helpers.decideDrive(state, { id: '1', escalated: step.escalated })
    if (decision.drive)
      helpers.recordOutcome(
        state,
        '1',
        step.outcome === 'completed'
          ? 'terminal'
          : step.outcome === 'durable'
            ? 'durable'
            : 'transient',
      )
    return decision.drive
  })
}

describe('pair-loop.js <-> pair-cli parity: which cards are driven (terminal / escalated / retry budget)', () => {
  const T = (escalated: boolean, outcome: Step['outcome']): Step => ({ escalated, outcome })
  it.each([
    [
      'merged is never re-picked',
      [T(false, 'completed'), T(false, 'completed'), T(false, 'completed')],
    ],
    [
      'failed -> retried once -> exhausted',
      [T(false, 'failed'), T(false, 'failed'), T(false, 'failed'), T(false, 'failed')],
    ],
    [
      'failed then success stops retrying',
      [T(false, 'failed'), T(false, 'completed'), T(false, 'completed')],
    ],
    [
      'escalated -> skipped -> cleared -> re-picked',
      [T(true, 'failed'), T(true, 'failed'), T(false, 'completed'), T(false, 'completed')],
    ],
  ] as const)('%s', async (_name, steps) => {
    expect(viaWorkflow([...steps])).toEqual(await viaCli([...steps]))
  })
})

describe('pair-loop.js <-> pair-cli parity: a failed selection is a failure, not "nothing eligible"', () => {
  const failure = new Function(`${pick('selectionFailure')}\nreturn selectionFailure`)() as (
    answer: unknown,
  ) => string | undefined

  it('both stop with a selection failure (pair-cli exit 1) when the selection errors or answers nothing', async () => {
    const cli = await runWatchLoop(
      { watch: false, intervalMs: 1, cap: 3 },
      {
        select: async () => {
          throw new Error('No response from API')
        },
        probeLock: () => ({ kind: 'free' }),
        runBatch: async () => ({ outcomes: [] }),
        wait: async () => 'elapsed',
        isInterrupted: () => false,
        onIteration: () => {},
      },
    )
    expect(cli).toMatchObject({ reason: 'selection failed', exitCode: 1 })
    expect(failure(undefined)).toBeDefined()
    expect(failure({})).toBeDefined()
    expect(failure({ candidates: [] })).toBeUndefined()
  })
})

describe('pair-loop.js <-> pair-cli parity: no cross-run halt memory beyond the current durable state', () => {
  const halted = new Function(
    `${pick('CURRENT_HALT_STATES', true)}\n${pick('currentHalted')}\nreturn currentHalted`,
  )() as (ids: string[], states: Array<{ id: string; state: string }>) => Set<string>

  it('a card a previous run excluded as durable is driven again by a NEW pair-cli run (it keeps no cross-run state), and the workflow re-admits it once its run dir is in-progress', async () => {
    const run = async (outcome: 'failed' | 'completed') => {
      const driven: string[] = []
      await runWatchLoop(
        { watch: false, intervalMs: 1, cap: 1 },
        {
          select: async () => ({ candidates: [{ ...card('253', 't', 'b'), escalated: false }] }),
          probeLock: () => ({ kind: 'free' }),
          runBatch: async cards => {
            driven.push(...cards.map(c => c.id))
            return {
              outcomes: cards.map(c => ({
                id: c.id,
                outcome,
                detail: 'x',
                ...(outcome === 'failed' && { cycleStatus: 'failed-contract' }),
              })),
            }
          },
          wait: async () => 'elapsed',
          isInterrupted: () => false,
          onIteration: () => {},
        },
      )
      return driven
    }
    expect(await run('failed')).toEqual(['253'])
    expect(await run('completed')).toEqual(['253'])
    expect([...halted(['253'], [{ id: '253', state: 'in-progress' }])]).toEqual([])
    expect([...halted(['253'], [{ id: '253', state: 'durable' }])]).toEqual(['253'])
  })
})

describe('pair-loop.js <-> pair-cli parity: the SAME status string gets the SAME kind from both real classifiers', () => {
  const workflowKind = new Function(
    `${pick('TERMINAL_STATUSES', true)}\n${pick('TRANSIENT_STATUSES', true)}\n${pick('outcomeKind', true)}\nreturn outcomeKind`,
  )() as (status: string) => 'terminal' | 'escalated' | 'transient' | 'durable'

  /** pair-cli's kind, observed from its real absorb/classify path: what the NEXT iteration does with the card. */
  const cliKind = async (cycleStatus: string | undefined): Promise<string> => {
    const records: Array<{
      skipped: Array<{ reason: string }>
      retried?: unknown[]
      outcomes: unknown[]
    }> = []
    await runWatchLoop(
      { watch: true, intervalMs: 1, cap: 2 },
      {
        select: async () => ({ candidates: [{ ...card('1', 't', 'b'), escalated: false }] }),
        probeLock: () => ({ kind: 'free' }),
        runBatch: async cards => ({
          outcomes: cards.map(c => ({
            id: c.id,
            outcome: 'failed' as const,
            detail: 'x',
            ...(cycleStatus !== undefined && { cycleStatus }),
          })),
        }),
        wait: async () => 'elapsed',
        isInterrupted: () => false,
        onIteration: r => void records.push(r as never),
      },
    )
    const second = records[1]!
    if (second.skipped.some(s => s.reason === 'durable failure')) return 'durable'
    if ((second.retried ?? []).length > 0) return 'transient'
    return second.outcomes.length > 0 ? 'escalated' : 'terminal'
  }

  it.each([
    ['escalate', 'durable'],
    ['escalated', 'escalated'],
    ['some-future-status', 'durable'],
    ['failed-contract', 'durable'],
  ])('status %s is %s in both drivers', async (status, kind) => {
    expect(workflowKind(status)).toBe(kind)
    expect(await cliKind(status)).toBe(kind)
  })

  it('no cycle status (a crash / engine error) is transient in pair-cli, and the workflow names its transient statuses', async () => {
    expect(await cliKind(undefined)).toBe('transient')
    expect(workflowKind('dead-dispatch')).toBe('transient')
  })
})
