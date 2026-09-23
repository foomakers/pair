/**
 * The stage runner — US-487 T-3.
 *
 * Builds argv from the ALREADY-RENDERED packet (`cycle-dispatch.mjs packet --style <style>`
 * output) and spawns it exactly as `run --skill` does today (US-451's `buildEngineArgs`/
 * `spawnIteration`, reused unchanged — a SECOND argv builder here would be the drift AC3 exists to
 * prevent). This module composes NO prose: the prompt is the packet's own, verbatim.
 */

import type { EngineDefinition, SkillInvocationStyle } from './engines'
import { buildEngineArgs, type SpawnIterationInput } from './spawn'
import type { IterationResult } from './stream-reader'
import type { CycleStageResult } from './cycle'

/** One rendered stage packet — `cycle-dispatch.mjs packet`'s own output shape. */
export interface StagePacket {
  readonly step: string
  readonly phase?: string
  readonly worktree: string
  readonly prompt: string
  readonly [key: string]: unknown
}

/** The ONE place `engine.skillInvocationStyle` becomes `cycle-dispatch`'s `--style` — never a second table. */
export function styleFor(engine: EngineDefinition): SkillInvocationStyle {
  return engine.skillInvocationStyle
}

export interface BuildStageArgsInput {
  readonly engine: EngineDefinition
  readonly packet: StagePacket
  readonly cwd: string
  readonly autonomyArgs: readonly string[]
}

/** The packet's prompt and worktree, and NOTHING `pair-cli` composes itself (AC3). */
export function buildStageArgs(input: BuildStageArgsInput): string[] {
  return buildEngineArgs({
    engine: input.engine,
    promptText: input.packet.prompt,
    cwd: input.cwd,
    autonomyArgs: input.autonomyArgs,
  })
}

export interface RunStageInput {
  readonly engine: EngineDefinition
  readonly packet: StagePacket
  readonly autonomyArgs: readonly string[]
  /** The model pinned for this engine, threaded to the spawn (run-wide; per-stage is #488's). */
  readonly model?: string | undefined
  readonly timeoutSeconds: number
  readonly runIteration: (input: SpawnIterationInput) => Promise<IterationResult>
}

/** Wiring only: spawns the packet's own prompt, returns the stream's outcome (never a rebuilt prompt). */
export async function runStage(input: RunStageInput): Promise<CycleStageResult> {
  const result = await input.runIteration({
    engine: input.engine,
    promptText: input.packet.prompt,
    cwd: input.packet.worktree,
    autonomyArgs: input.autonomyArgs,
    ...(input.model !== undefined && { model: input.model }),
    timeoutSeconds: input.timeoutSeconds,
  })
  return {
    processOutcome: result.outcome,
    ...(result.detail !== undefined && { detail: result.detail }),
  }
}
