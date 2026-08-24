import { spawn } from 'child_process'
import type { EngineDefinition } from './engines'
import { HEADLESS_STDIN } from './autonomy'
import { readIterationOutcome, toLines, type IterationResult } from './stream-reader'

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
}

/** The engine's argv: headless/stream flags, an optional cwd flag, autonomy, then the prompt. */
export function buildEngineArgs(input: EngineArgsInput): string[] {
  return [
    ...input.engine.headlessArgs,
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
  const child = spawn(input.engine.command, buildEngineArgs(input), {
    cwd: input.cwd,
    stdio: [HEADLESS_STDIN, 'pipe', 'inherit'],
  })

  const timer = setTimeout(() => child.kill('SIGTERM'), input.timeoutSeconds * 1000)
  try {
    child.stdout.setEncoding('utf-8')
    return await readIterationOutcome(toLines(child.stdout), input.engine)
  } finally {
    clearTimeout(timer)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  }
}
