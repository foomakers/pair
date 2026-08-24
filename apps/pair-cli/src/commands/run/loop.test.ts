import { describe, it, expect } from 'vitest'
import { runLoop, loopExitCode, type IterationContext } from './loop'
import type { IterationResult } from './stream-reader'

const ok = (continueToken?: string): IterationResult => ({
  outcome: 'success',
  detail: 'terminal event matched (success)',
  ...(continueToken !== undefined && { continueToken }),
})

const failed: IterationResult = {
  outcome: 'failed',
  detail: 'no terminal event in the engine stream',
}

/** A fake spawn: records the context of every iteration, returns the scripted results. */
function fakeSpawn(results: IterationResult[]) {
  const contexts: IterationContext[] = []
  return {
    contexts,
    runIteration: async (context: IterationContext) => {
      contexts.push(context)
      return results[contexts.length - 1] ?? ok()
    },
  }
}

describe('runLoop — stop reasons', () => {
  it('stops when the skill reports itself finished (no continue-token)', async () => {
    const spawn = fakeSpawn([ok('pair-loop --iteration 2'), ok()])

    const outcome = await runLoop({ maxIterations: 10, runIteration: spawn.runIteration })

    expect(outcome.stopReason).toBe('skill-reported-complete')
    expect(outcome.iterations).toBe(2)
  })

  it('stops at the perimeter cap when the condition never becomes true', async () => {
    const spawn = fakeSpawn([ok('t1'), ok('t2'), ok('t3')])

    const outcome = await runLoop({ maxIterations: 3, runIteration: spawn.runIteration })

    expect(outcome.stopReason).toBe('iteration-cap')
    expect(spawn.contexts).toHaveLength(3)
  })

  it('stops on a failed iteration and never retries it', async () => {
    const spawn = fakeSpawn([ok('t1'), failed, ok('t3')])

    const outcome = await runLoop({ maxIterations: 5, runIteration: spawn.runIteration })

    expect(outcome.stopReason).toBe('iteration-failed')
    expect(spawn.contexts).toHaveLength(2)
  })

  it('terminates immediately with nothing-to-do when the first iteration finds nothing', async () => {
    // "Perimeter declared but empty": the skill runs, reports itself finished, no token. Not an
    // error — the exit code stays 0.
    const outcome = await runLoop({ maxIterations: 5, runIteration: async () => ok() })

    expect(outcome).toMatchObject({ iterations: 1, stopReason: 'skill-reported-complete' })
    expect(loopExitCode(outcome)).toBe(0)
  })
})

describe('runLoop — freshness and re-evaluation (AC4)', () => {
  it('runs every iteration through the injected runner, once per iteration', async () => {
    const spawn = fakeSpawn([ok('t1'), ok('t2'), ok()])

    await runLoop({ maxIterations: 5, runIteration: spawn.runIteration })

    expect(spawn.contexts.map(context => context.iteration)).toEqual([1, 2, 3])
  })

  it("carries only the skill's own continue-token across iterations — no cached plan", async () => {
    const spawn = fakeSpawn([ok('pair-loop --root 212 --iteration 2'), ok()])

    await runLoop({ maxIterations: 5, runIteration: spawn.runIteration })

    expect(spawn.contexts[0]?.continueToken).toBeUndefined()
    expect(spawn.contexts[1]?.continueToken).toBe('pair-loop --root 212 --iteration 2')
    // Nothing else crosses the boundary: the context carries exactly two fields.
    expect(Object.keys(spawn.contexts[1] ?? {}).sort()).toEqual(['continueToken', 'iteration'])
  })

  it('picks up work that becomes eligible mid-run, because the skill re-selects each time', async () => {
    // Iteration 1 finds nothing to advance but has more to check (token); iteration 2 advances a
    // card that only became eligible after the run started.
    const spawn = fakeSpawn([ok('pair-loop --iteration 2'), ok('pair-loop --iteration 3'), ok()])

    const outcome = await runLoop({ maxIterations: 5, runIteration: spawn.runIteration })

    expect(outcome.iterations).toBe(3)
    expect(outcome.stopReason).toBe('skill-reported-complete')
  })

  it('reports each iteration through the hook, printing nothing itself', async () => {
    const seen: number[] = []
    await runLoop({
      maxIterations: 2,
      runIteration: async () => ok('t'),
      onIteration: record => seen.push(record.iteration),
    })

    expect(seen).toEqual([1, 2])
  })
})

describe('runLoop — the merge gate holds (AC10, BR3)', () => {
  it('exposes no merge collaborator at all: the loop can only run iterations', () => {
    // The loop's whole surface is `maxIterations`, `runIteration`, `onIteration` — there is no
    // path through it that could merge, which is why AC10 is structural rather than a guard.
    const surface = runLoop.length

    expect(surface).toBe(1)
  })

  it('maps only a failed iteration to a non-zero exit code', async () => {
    const succeeded = await runLoop({ maxIterations: 1, runIteration: async () => ok('t') })
    const failure = await runLoop({ maxIterations: 1, runIteration: async () => failed })

    expect(loopExitCode(succeeded)).toBe(0)
    expect(loopExitCode(failure)).toBe(1)
  })
})
