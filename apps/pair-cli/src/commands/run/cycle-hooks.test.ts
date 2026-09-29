import { describe, it, expect, vi } from 'vitest'
import {
  runCycle,
  type CycleHookResult,
  type CycleHooks,
  type CycleResolveResult,
  type CycleStageResult,
} from './cycle'

/**
 * US-489 T-3/T-4 — `## Cycle Hooks` at the stage loop's boundaries, over fake collaborators. The
 * blocking/logging RULES belong to the shared executor (`cycle-hooks.mjs`, proven for real in
 * `cycle-hooks-executor.test.ts`); here the loop is proven to call it at the right boundaries,
 * in the right order, and to react only to `halted`.
 */

const step = (name: string, phase = 'a0', extra: object = {}) => ({
  status: 'in-progress',
  next: { step: name, phase, attempt: 1, context: 'fresh', ...extra },
})
const DONE: CycleResolveResult = { status: 'completed', next: { step: 'done' } }

function scripted(sequence: CycleResolveResult[]) {
  let call = 0
  return vi.fn(async () => sequence[Math.min(call++, sequence.length - 1)]!)
}

/** A hooks fake that records the ORDER of hook points AND spawns, and answers per point. */
function harness(answers: Record<string, CycleHookResult> = {}) {
  const log: string[] = []
  const hooks: CycleHooks = {
    run: async (point, status) => {
      log.push(status === undefined ? point : `${point}(${status})`)
      return answers[point] ?? {}
    },
  }
  const spawnStage = vi.fn(async (p: unknown): Promise<CycleStageResult> => {
    log.push(`spawn:${(p as { step: string }).step}`)
    return { processOutcome: 'success' }
  })
  const notices: string[] = []
  const base = {
    worktree: async () => ({}),
    packet: async (next: { step: string; phase?: string }) => ({
      step: next.step,
      phase: next.phase,
      prompt: 'p',
      worktree: '/w',
    }),
    spawnStage,
    policy: {},
    hooks,
    onNotice: (n: string) => notices.push(n),
  }
  return { log, notices, spawnStage, base }
}

describe('runCycle with ## Cycle Hooks (US-489)', () => {
  it('AC1: a failing pre-verify HALTs before verify dispatches, output verbatim, status failed-hook', async () => {
    const h = harness({
      'pre-verify': { halted: { command: 'pnpm build', exitCode: 2, output: 'TS2322: nope\n' } },
    })
    const outcome = await runCycle({
      ...h.base,
      resolve: scripted([step('implement'), step('verify', 'r0'), DONE]),
    })

    expect(outcome.status).toBe('failed-hook')
    expect(outcome.next?.['detail']).toContain('`pre-verify` `pnpm build` exited 2')
    expect(outcome.next?.['detail']).toContain('TS2322: nope\n')
    expect(h.log).not.toContain('spawn:verify')
    expect(h.log.filter(l => l.startsWith('spawn:'))).toEqual(['spawn:implement'])
  })

  it('AC2: post-<stage> runs after that stage advanced; a logged failure is relayed and the cycle continues', async () => {
    const h = harness({ 'post-implement': { logged: ['hook `post-implement` `notify` exited 1'] } })
    const outcome = await runCycle({
      ...h.base,
      resolve: scripted([step('implement'), step('verify', 'r0'), DONE]),
    })

    expect(outcome.status).toBe('ready-for-merge')
    expect(h.log).toEqual([
      'pre-cycle',
      'pre-implement',
      'spawn:implement',
      'post-implement',
      'pre-verify',
      'spawn:verify',
      'post-verify',
      'post-cycle(ready-for-merge)',
    ])
    expect(h.notices).toContain('hook `post-implement` `notify` exited 1')
  })

  it('AC2: no post-<stage> when the handoff did NOT advance (dead dispatch)', async () => {
    const h = harness()
    await runCycle({
      ...h.base,
      policy: { deadDispatchRetries: 1 },
      resolve: scripted([step('implement'), step('implement'), step('implement')]),
    })
    expect(h.log.filter(l => l.startsWith('post-'))).toEqual(['post-cycle(failed-implement)'])
  })

  it('AC4: pre-cycle and post-cycle run exactly once across several remediation rounds', async () => {
    const h = harness()
    await runCycle({
      ...h.base,
      resolve: scripted([
        step('implement'),
        step('verify', 'r0'),
        step('prepare', 'r1-g1', { round: 1 }),
        step('validate', 'r1-g1', { round: 1 }),
        step('green', 'r1-g1', { round: 1 }),
        step('verify', 'r1', { round: 1 }),
        step('prepare', 'r2-g1', { round: 2 }),
        step('green', 'r2-g1', { round: 2 }),
        DONE,
      ]),
    })
    expect(h.log.filter(l => l === 'pre-cycle')).toHaveLength(1)
    expect(h.log.filter(l => l.startsWith('post-cycle'))).toHaveLength(1)
    expect(h.log[0]).toBe('pre-cycle')
    expect(h.log.at(-1)).toBe('post-cycle(ready-for-merge)')
    expect(h.log.filter(l => l === 'pre-verify')).toHaveLength(2)
  })

  it('AC4: a failing pre-cycle HALTs before any stage; on-halt and post-cycle still close the invocation', async () => {
    const h = harness({ 'pre-cycle': { halted: { command: 'false', exitCode: 1, output: '' } } })
    const outcome = await runCycle({ ...h.base, resolve: scripted([step('implement')]) })
    expect(outcome.status).toBe('failed-hook')
    expect(outcome.stagesRun).toBe(0)
    expect(h.log).toEqual(['pre-cycle', 'on-halt(failed-hook)', 'post-cycle(failed-hook)'])
  })

  it.each([
    ['failed-implement', [step('implement'), step('implement'), step('implement')]],
    [
      'escalate',
      [step('implement'), { status: 'x', next: { step: 'blocked', reason: 'escalate' } }],
    ],
  ])('AC5: on-halt runs when the cycle stops on %s', async (status, sequence) => {
    const h = harness()
    const outcome = await runCycle({
      ...h.base,
      policy: { deadDispatchRetries: 1 },
      resolve: scripted(sequence as CycleResolveResult[]),
    })
    expect(outcome.status).toBe(status)
    expect(h.log).toContain(`on-halt(${status})`)
    expect(h.log.indexOf(`on-halt(${status})`)).toBeLessThan(h.log.indexOf(`post-cycle(${status})`))
  })

  it('AC5: on-halt does NOT run at ready-for-merge', async () => {
    const h = harness()
    await runCycle({ ...h.base, resolve: scripted([step('implement'), DONE]) })
    expect(h.log.some(l => l.startsWith('on-halt'))).toBe(false)
  })

  it('post-cycle does not run when the --rounds bound stops the invocation short of a terminal status', async () => {
    const h = harness()
    const outcome = await runCycle({
      ...h.base,
      rounds: 0,
      resolve: scripted([step('prepare', 'r1-g1', { round: 1 })]),
    })
    expect(outcome.status).toBe('rounds-bound-reached')
    expect(h.log).toEqual(['pre-cycle'])
  })

  it('AC6: no hooks collaborator ⇒ behaviour unchanged, no notice about hooks', async () => {
    const h = harness()
    const { hooks: _omit, ...withoutHooks } = h.base
    const outcome = await runCycle({
      ...withoutHooks,
      resolve: scripted([step('implement'), DONE]),
    })
    expect(outcome.status).toBe('ready-for-merge')
    expect(h.log).toEqual(['spawn:implement'])
    expect(h.notices).toEqual([])
  })
})
