import { describe, it, expect, vi } from 'vitest'
import { readIterationOutcome, toLines } from './stream-reader'
import { ENGINES } from './engines'
import { runCycle, type CycleResolveResult, type CycleStageResult } from './cycle'

const stream = (text: string) =>
  toLines(
    (async function* () {
      yield `${JSON.stringify({ type: 'result', subtype: 'success', result: text })}\n`
    })(),
  )

describe('C: the stage final result survives the stream', () => {
  it('keeps status/reason/next from the final JSON of a claude result event', async () => {
    const final = { status: 'failed', reason: 'branch-not-fresh', next: { step: 'blocked' } }
    const result = await readIterationOutcome(
      stream(`done.\n${JSON.stringify(final)}`),
      ENGINES['claude'],
    )
    expect(result.outcome).toBe('success')
    expect(result.final).toEqual(final)
  })

  it('no JSON in the final text ⇒ no final', async () => {
    const result = await readIterationOutcome(stream('all good'), ENGINES['claude'])
    expect(result.final).toBeUndefined()
  })
})

const PREPARE = { step: 'implement', phase: 'a0', attempt: 1, context: 'fresh' }
const resolve = () =>
  vi.fn(async (): Promise<CycleResolveResult> => ({ status: 'empty', next: PREPARE }))
const packet = vi.fn(async (next: CycleResolveResult['next']) => ({
  step: next.step,
  phase: next.phase,
  prompt: `p${String(next['attempt'])}`,
  worktree: '/w',
  attempt: next['attempt'],
}))

describe('C: a deliberately failed/blocked stage is not retried blindly', () => {
  const failed: CycleStageResult = {
    processOutcome: 'success',
    final: { status: 'failed', reason: 'branch-not-fresh', next: { step: 'blocked' } },
  }

  it('stops the card with the stage reason, no retry, the final printed on the stage record', async () => {
    const spawnStage = vi.fn(async () => failed)
    const onStage = vi.fn()
    const notes: string[] = []
    const outcome = await runCycle({
      resolve: resolve(),
      worktree: async () => ({ path: '/w' }),
      packet,
      spawnStage,
      policy: { deadDispatchRetries: 2 },
      onStage,
      onNotice: n => void notes.push(n),
    })
    expect(spawnStage).toHaveBeenCalledTimes(1)
    expect(outcome.status).toBe('failed-implement')
    expect(outcome.reason).toBe('branch-not-fresh')
    expect(onStage.mock.calls[0]![0].final).toEqual(failed.final)
    expect(notes.join('\n')).toMatch(/branch-not-fresh/)
  })

  it('a real dead dispatch still retries, with the SAME $attempt (the attempt left no handoff, so cycle-state numbers it again — never a stale-write collision)', async () => {
    const attempts: unknown[] = []
    const spawnStage = vi.fn(async () => ({ processOutcome: 'success' }) as CycleStageResult)
    await runCycle({
      resolve: resolve(),
      worktree: async () => ({ path: '/w' }),
      packet: async next => {
        attempts.push(next['attempt'])
        return packet(next)
      },
      spawnStage,
      policy: { deadDispatchRetries: 1 },
    })
    expect(attempts).toEqual([1, 1])
  })
})

describe('M: the final result is the LAST result-shaped top-level object', () => {
  const cache = '{"status":"cache-hit","contract":"x","hash":"abc"}'
  const review =
    '{"status":"reviewed","verdict":"CHANGES-REQUESTED","reviewedHead":"deadbeef","next":{"step":"prepare"},"nested":{"status":"cache-hit"}}'

  it('cache-hit first, real result last ⇒ the real result, with its verdict', async () => {
    const { parseFinalResult } = await import('./stream-reader.js')
    const final = parseFinalResult(
      `phase 0:\n${cache}\n\nReview done.\n\`\`\`json\n${review}\n\`\`\``,
    )
    expect(final).toMatchObject({
      status: 'reviewed',
      verdict: 'CHANGES-REQUESTED',
      next: { step: 'prepare' },
    })
  })

  it('a result-shaped object wins over a LATER bare cache-hit; nested objects are never candidates', async () => {
    const { parseFinalResult } = await import('./stream-reader.js')
    expect(parseFinalResult(`${review}\n${cache}`)?.status).toBe('reviewed')
    expect(parseFinalResult(`${cache}`)?.status).toBe('cache-hit')
    expect(parseFinalResult('{"a":{"status":"inner"}}')).toBeUndefined()
  })

  it('braces inside strings do not confuse the scan; implement shape (prNumber) is result-shaped', async () => {
    const { parseFinalResult } = await import('./stream-reader.js')
    const impl = '{"status":"ok","prNumber":7,"summary":"a } and { b"}'
    expect(parseFinalResult(`${impl}\n${cache}`)).toMatchObject({ status: 'ok' })
  })

  it('the stage line prints the verdict', async () => {
    const { finalPart } = await import('./cycle-wiring.js')
    expect(
      finalPart({
        step: 'verify',
        processOutcome: 'success',
        handoffAdvanced: false,
        final: { status: 'reviewed', verdict: 'CHANGES-REQUESTED', next: { step: 'prepare' } },
      }),
    ).toBe(' — final: status=reviewed verdict=CHANGES-REQUESTED next=prepare')
  })
})

describe('A1: `{status: failed, reason: incomplete}` is resumable — it goes through the dead-dispatch budget, never stops the card', () => {
  const incomplete: CycleStageResult = {
    processOutcome: 'success',
    final: { status: 'failed', reason: 'incomplete' },
  }
  it('retried within deadDispatchRetries, then failed-<stage> by the budget (no deliberate stop)', async () => {
    const spawnStage = vi.fn(async () => incomplete)
    const outcome = await runCycle({
      resolve: resolve(),
      worktree: async () => ({ path: '/w' }),
      packet,
      spawnStage,
      policy: { deadDispatchRetries: 2 },
    })
    expect(spawnStage).toHaveBeenCalledTimes(3)
    expect(outcome.status).toBe('failed-implement')
    expect(outcome.reason).toBeUndefined()
  })
  it('an explicit non-resumable reason or next.step blocked still stops at once', async () => {
    for (const final of [
      { status: 'failed', reason: 'branch-not-fresh' },
      { status: 'failed', next: { step: 'blocked' } },
    ]) {
      const spawnStage = vi.fn(
        async () => ({ processOutcome: 'success', final }) as CycleStageResult,
      )
      const outcome = await runCycle({
        resolve: resolve(),
        worktree: async () => ({ path: '/w' }),
        packet,
        spawnStage,
        policy: { deadDispatchRetries: 2 },
      })
      expect(spawnStage).toHaveBeenCalledTimes(1)
      expect(outcome.status).toBe('failed-implement')
    }
  })
})
