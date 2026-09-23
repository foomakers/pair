import { spawn } from 'child_process'
import type { EngineDefinition } from './engines'
import { HEADLESS_STDIN } from './autonomy'
import { readIterationOutcome, toLines, type IterationResult } from './stream-reader'
import { isInterrupted, trackEngine } from './interrupt'

/**
 * Spawning one iteration (US-451 T-9).
 *
 * A FRESH process per iteration, never a reused session: that is the shape the whole story
 * rests on, not an implementation detail (BR5). Argument assembly is a pure function so the
 * invariants a reviewer cares about — no shell string, no merge command, stdin closed — are
 * asserted without spawning anything.
 */

export interface EngineArgsInput {
  readonly engine: EngineDefinition
  /** The prompt text — ONE argv element, never interpolated into a shell command. */
  readonly promptText: string
  readonly cwd: string
  /** Autonomy args, already translated through the engine map (empty ⇒ confirmations active). */
  readonly autonomyArgs: readonly string[]
  /** The model this project pinned for this engine, if any (`engine.model` in pair.config.json). */
  readonly model?: string | undefined
}

/** The engine's argv: headless/stream flags, an optional cwd flag, autonomy, then the prompt. */
export function buildEngineArgs(input: EngineArgsInput): string[] {
  return [
    ...input.engine.headlessArgs,
    ...(input.engine.modelFlag && input.model ? [input.engine.modelFlag, input.model] : []),
    ...(input.engine.cwdFlag ? [input.engine.cwdFlag, input.cwd] : []),
    ...input.autonomyArgs,
    input.promptText,
  ]
}

export interface SpawnIterationInput extends EngineArgsInput {
  /** Wall-clock bound per iteration — the hang guard, never a policy parameter. */
  readonly timeoutSeconds: number
}

/**
 * Runs one iteration and returns what its STREAM said.
 *
 * The child's exit code is deliberately never read (AC7): the outcome comes from the terminal
 * event alone. `stdin` is closed, so an engine that unexpectedly asks for input gets EOF instead
 * of hanging; the timeout kills a child that hangs for any other reason and the iteration then
 * fails fail-closed, because no terminal event will have been seen.
 */
export async function spawnIteration(input: SpawnIterationInput): Promise<IterationResult> {
  // r1-2: once the driver was signalled, the engine it is stopping must not be replaced by the next.
  if (isInterrupted())
    throw new Error('interrupted: the driver received a signal, no engine is started')
  const child = spawn(input.engine.command, buildEngineArgs(input), {
    cwd: input.cwd,
    stdio: [HEADLESS_STDIN, 'pipe', 'inherit'],
  })
  // Tracked so a SIGTERM/SIGINT on the driver stops it instead of orphaning it (r1-2).
  trackEngine(child)

  let stalled = false
  const timer = setTimeout(() => {
    stalled = true
    child.kill('SIGTERM')
  }, input.timeoutSeconds * 1000)
  try {
    child.stdout.setEncoding('utf-8')
    const result = await readIterationOutcome(toLines(child.stdout), input.engine)
    // US-506 T-8 (AC12): stopped by the bound before any terminal event ⇒ a STALL, named as one.
    if (stalled && result.outcome !== 'success')
      return {
        outcome: 'failed',
        detail: `stalled: no terminal event within ${input.timeoutSeconds}s — the engine was stopped`,
        stalled: true,
      }
    return result
  } finally {
    clearTimeout(timer)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  }
}
