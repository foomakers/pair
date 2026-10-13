import { describe, it, expect } from 'vitest'
import { checkWithCiWait, ciWaitFromEnv } from './ci-wait'
import type { CycleMergeResult } from './cycle-scripts'

const PENDING: CycleMergeResult = { mergeAllowed: false, ciPending: true }
const OK: CycleMergeResult = { mergeAllowed: true }

describe('checkWithCiWait', () => {
  it('polls defer the park comment; ONE final real check parks after the cap, none when the merge goes green', async () => {
    let t = 0
    const flags: boolean[] = []
    const result = await checkWithCiWait(
      deferPark => (flags.push(deferPark), PENDING),
      async ms => ((t += ms), 'elapsed'),
      { capSeconds: 60, intervalSeconds: 30, now: () => t },
    )
    expect(flags).toEqual([true, true, true, false])
    expect(result).toBe(PENDING)

    const green: boolean[] = []
    let n = 0
    await checkWithCiWait(
      deferPark => (green.push(deferPark), n++ < 2 ? PENDING : OK),
      async () => 'elapsed',
      { capSeconds: 600 },
    )
    expect(green).toEqual([true, true, true])
  })

  it('stops polling on interrupt and returns the last pending answer', async () => {
    let calls = 0
    const result = await checkWithCiWait(
      () => (calls++, PENDING),
      async () => 'interrupted',
      { capSeconds: 100, intervalSeconds: 10 },
    )
    expect(calls).toBe(2) // the poll + the one final parking check
    expect(result).toBe(PENDING)
  })

  it('last wait is clamped to the remaining cap', async () => {
    let t = 0
    const waits: number[] = []
    await checkWithCiWait(
      () => PENDING,
      async ms => (waits.push(ms), (t += ms), 'elapsed'),
      { capSeconds: 45, intervalSeconds: 30, now: () => t },
    )
    expect(waits).toEqual([30_000, 15_000])
  })

  it('cap 0 never waits', async () => {
    const waits: number[] = []
    await checkWithCiWait(
      () => PENDING,
      async ms => (waits.push(ms), 'elapsed'),
      { capSeconds: 0 },
    )
    expect(waits).toEqual([])
  })

  it('returns at once when allowed', async () => {
    expect(
      await checkWithCiWait(
        () => OK,
        async () => 'elapsed',
      ),
    ).toBe(OK)
  })
})

describe('ciWaitFromEnv', () => {
  it.each(['darwin', 'linux'] as const)('is platform-independent (platform %s)', platform => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: platform })
    try {
      expect(ciWaitFromEnv({ PAIR_CI_WAIT_CAP_SECONDS: '90' })).toEqual({
        capSeconds: 90,
        intervalSeconds: 30,
      })
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })

  it('defaults 30 min / 30 s, env overrides, garbage falls back', () => {
    expect(ciWaitFromEnv({})).toEqual({ capSeconds: 1800, intervalSeconds: 30 })
    expect(
      ciWaitFromEnv({ PAIR_CI_WAIT_CAP_SECONDS: '60', PAIR_CI_WAIT_INTERVAL_SECONDS: '5' }),
    ).toEqual({ capSeconds: 60, intervalSeconds: 5 })
    expect(ciWaitFromEnv({ PAIR_CI_WAIT_CAP_SECONDS: 'x' }).capSeconds).toBe(1800)
  })
})
