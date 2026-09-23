import { describe, it, expect, vi } from 'vitest'
import { buildStageArgs, styleFor, runStage } from './stage-runner'
import { buildEngineArgs } from './spawn'
import { ENGINES } from './engines'

/**
 * US-487 T-3 — the stage runner: builds argv from the ALREADY-RENDERED packet (`cycle-dispatch.mjs
 * packet --style <style>` output — this module composes NO prose, per AC3 and the story's own
 * "`pair-cli` adds only the engine's headless/autonomy/cwd argv") and spawns it exactly as
 * `run --skill` does today (US-451's `buildEngineArgs`/`spawnIteration`, reused unchanged — a SECOND
 * argv builder here would be the drift AC3 exists to prevent).
 */

describe("styleFor — the ONE place engine.skillInvocationStyle becomes cycle-dispatch's --style", () => {
  it.each(Object.values(ENGINES))(
    "reuses $id's own skillInvocationStyle, never a second table",
    engine => {
      expect(styleFor(engine)).toBe(engine.skillInvocationStyle)
    },
  )

  it('claude renders slash, pi and opencode render instruction (AC3, AC13)', () => {
    expect(styleFor(ENGINES.claude)).toBe('slash')
    expect(styleFor(ENGINES.pi)).toBe('instruction')
    expect(styleFor(ENGINES.opencode)).toBe('instruction')
  })
})

describe("buildStageArgs — the packet's prompt and worktree, and NOTHING pair-cli composes itself", () => {
  const packet = {
    step: 'prepare',
    phase: 'a0',
    worktree: '/worktrees/487',
    prompt: 'Invoke **pair-workflow-red-spec** for story #487 with $run=story-487 …',
  }

  it("is IDENTICAL to buildEngineArgs given the packet's own prompt and worktree as cwd (AC3)", () => {
    const args = buildStageArgs({
      engine: ENGINES.claude,
      packet,
      cwd: packet.worktree,
      autonomyArgs: [],
    })

    expect(args).toEqual(
      buildEngineArgs({
        engine: ENGINES.claude,
        promptText: packet.prompt,
        cwd: packet.worktree,
        autonomyArgs: [],
      }),
    )
    expect(args.at(-1)).toBe(packet.prompt)
  })

  it('never constructs a merge command, on any engine (AC12, mirrors spawn.test.ts)', () => {
    for (const engine of Object.values(ENGINES)) {
      const args = buildStageArgs({ engine, packet, cwd: packet.worktree, autonomyArgs: [] })
      expect(args.join(' ')).not.toMatch(/\bmerge\b/)
    }
  })
})

describe("runStage — wiring only: spawns the packet's own prompt, returns the stream's outcome", () => {
  it('delegates to the injected iteration runner with the packet-derived argv inputs, not a rebuilt prompt', async () => {
    const runIteration = vi.fn(async () => ({
      outcome: 'success' as const,
      detail: 'terminal event matched (success)',
    }))

    const result = await runStage({
      engine: ENGINES.claude,
      packet: {
        step: 'implement',
        phase: 'a0',
        worktree: '/worktrees/487',
        prompt: 'Invoke **pair-workflow-implement-phase** for story #487 …',
      },
      autonomyArgs: [],
      timeoutSeconds: 1800,
      runIteration,
    })

    expect(runIteration).toHaveBeenCalledWith(
      expect.objectContaining({
        engine: ENGINES.claude,
        promptText: expect.stringContaining('pair-workflow-implement-phase'),
        cwd: '/worktrees/487',
      }),
    )
    expect(result.processOutcome).toBe('success')
  })

  it('a failed stream (no terminal event) is reported as processOutcome "failed", detail carried through (AC7 of #451, fail-closed)', async () => {
    const runIteration = vi.fn(async () => ({
      outcome: 'failed' as const,
      detail:
        'no terminal event in the engine stream (fail-closed: the exit code is never consulted)',
    }))

    const result = await runStage({
      engine: ENGINES.pi,
      packet: { step: 'prepare', phase: 'a0', worktree: '/worktrees/487', prompt: 'go' },
      autonomyArgs: [],
      timeoutSeconds: 1800,
      runIteration,
    })

    expect(result).toEqual({
      processOutcome: 'failed',
      detail:
        'no terminal event in the engine stream (fail-closed: the exit code is never consulted)',
    })
  })
})
