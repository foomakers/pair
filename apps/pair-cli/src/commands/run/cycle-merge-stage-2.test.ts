import { describe, it, expect, vi } from 'vitest'
import { mkdirSync, realpathSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  REVIEWED_HEAD,
  GATE_PASS,
  main,
  remoteHead,
  mergeCalls,
  runDir,
  gatePrompts,
  runCalls,
  adopt,
  ELIGIBLE,
  drive,
  settle,
} from './cycle-merge-stage-lib'

describe('pair-cli run --card reaches the merge stage (US-490 r1-g2, finding r0-2)', () => {
  it('g2-w10: the gate is dispatched ONCE, after check, for the card tier, the PR, the reviewed head and the evidence path', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)

    await settle(drive(adopt(ELIGIBLE)))

    const prompts = gatePrompts()
    expect(prompts).toHaveLength(1)
    const prompt = prompts[0]!
    expect(prompt).toContain('risk:green')
    expect(prompt).toContain(REVIEWED_HEAD)
    expect(prompt).toMatch(/\b42\b/)
    expect(prompt).toContain(
      join(realpathSync(main), '.pair/working/runs/story-7/7/merge-gate.json'),
    )
  }, 60_000)

  it('g2-w11: passing evidence for ANOTHER tier is not green — never merged', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    vi.stubEnv('FAKE_GATE_TIER', 'risk:yellow')

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(runCalls()).toHaveLength(0)
    expect(outcome).not.toContain('"merged":true')
  }, 60_000)

  it('g2-w12: passing evidence for ANOTHER head is not green — never merged', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    vi.stubEnv('FAKE_GATE_HEAD', remoteHead)

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(runCalls()).toHaveLength(0)
    expect(outcome).not.toContain('"merged":true')
  }, 60_000)

  it('g2-w13: passing evidence left by an EARLIER dispatch is never reused — never merged', async () => {
    mkdirSync(runDir(), { recursive: true })
    writeFileSync(
      join(runDir(), 'merge-gate.json'),
      JSON.stringify({ tier: 'risk:green', reviewedHead: REVIEWED_HEAD, result: GATE_PASS }),
    )

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(gatePrompts()).toHaveLength(2)
    expect(runCalls()).toHaveLength(0)
    expect(outcome).not.toContain('"merged":true')
  }, 60_000)

  it('g2-w14: a parked check dispatches no gate stage and no run', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    vi.stubEnv(
      'FAKE_MERGE_CHECK',
      JSON.stringify({
        mergeAllowed: false,
        failed: [{ code: 'pair-review', detail: 'pair-review is not success' }],
        reason: 'pair-review is not success',
        parkKind: 'halted',
      }),
    )

    await settle(drive(adopt(ELIGIBLE)))

    expect(mergeCalls().map(c => c.cmd)).toEqual(['check'])
    expect(gatePrompts()).toHaveLength(0)
  }, 60_000)

  describe('pending CI: bounded wait, then re-check', () => {
    const PENDING = JSON.stringify({
      mergeAllowed: false,
      ciPending: true,
      failed: [{ code: 'ci-not-green', detail: 'CI checks not green: build=pending' }],
      reason: 'CI checks not green: build=pending',
      parkKind: 'awaiting-human',
    })
    const clock = () => {
      let t = 0
      const waits: number[] = []
      return {
        waits,
        ciWait: {
          capSeconds: 120,
          intervalSeconds: 30,
          now: () => t,
          wait: async (ms: number) => {
            waits.push(ms)
            t += ms
            return 'elapsed' as const
          },
        },
      }
    }

    it('ci-w1: pending CI is polled, the check re-run once it settles, then the merge proceeds', async () => {
      vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
      vi.stubEnv('FAKE_MERGE_CHECK_FIRST', PENDING)
      vi.stubEnv('FAKE_MERGE_CHECK_FIRST_N', '2')
      const { waits, ciWait } = clock()

      const outcome = await drive(adopt(ELIGIBLE), ciWait)

      expect(waits).toEqual([30_000, 30_000])
      expect(mergeCalls().map(c => c.cmd)).toEqual(['check', 'check', 'check', 'run'])
      expect(
        mergeCalls()
          .filter(c => c.cmd === 'check')
          .every(c => c.opts['deferPark'] === 'true'),
      ).toBe(true)
      expect(outcome.status).toBe('merged')
    }, 60_000)

    it('ci-w2: still pending after the cap parks as today (merge-parked, no run)', async () => {
      vi.stubEnv('FAKE_MERGE_CHECK', PENDING)
      const { waits, ciWait } = clock()

      const outcome = await drive(adopt(ELIGIBLE), ciWait)

      expect(waits).toEqual([30_000, 30_000, 30_000, 30_000])
      expect(outcome.status).toBe('merge-parked')
      expect(mergeCalls().every(c => c.cmd === 'check')).toBe(true)
      // 5 polls post no park comment (deferPark); the ONE final check after the cap parks for real
      expect(mergeCalls().map(c => c.opts['deferPark'])).toEqual([
        'true',
        'true',
        'true',
        'true',
        'true',
        undefined,
      ])
    }, 60_000)

    it('ci-w3: failed CI parks at once, no wait', async () => {
      vi.stubEnv(
        'FAKE_MERGE_CHECK',
        JSON.stringify({
          mergeAllowed: false,
          ciPending: false,
          failed: [{ code: 'ci-not-green', detail: 'build=failure' }],
          reason: 'build=failure',
          parkKind: 'halted',
        }),
      )
      const { waits, ciWait } = clock()

      const outcome = await drive(adopt(ELIGIBLE), ciWait)

      expect(waits).toEqual([])
      expect(outcome.status).toBe('merge-parked')
      expect(mergeCalls()).toHaveLength(1)
    }, 60_000)
  })

  it('g2-w15: the squash message follows the commit template — [<story code>] <type>: <description>', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)

    await settle(drive(adopt(ELIGIBLE)))

    expect(runCalls()).toHaveLength(1)
    expect(runCalls()[0]!.opts['message'] ?? '').toMatch(/^\[(#7|US-7)\] [a-z]+: \S/)
  }, 60_000)

  // ── controls: already correct at the base, and must stay so ────────────────────────────────
})
