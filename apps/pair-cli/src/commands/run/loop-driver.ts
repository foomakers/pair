import chalk from 'chalk'
import type { RunCommandConfig } from './parser'
import { buildPromptText } from './invocation'
import { loopExitCode, runLoop, type IterationContext, type LoopOutcome } from './loop'
import { spawnIteration } from './spawn'
import type { IterationResult } from './stream-reader'
import type { ResolvedRun, RunHandlerDependencies } from './run-context'

/**
 * The re-invocation loop itself — identical whether the run was dispatched, invoked directly, or
 * routed to a preparation skill by the DoR fallback: one resolved run, N fresh engine processes.
 */
export async function driveRun(
  resolved: ResolvedRun,
  config: RunCommandConfig,
  deps: RunHandlerDependencies,
): Promise<number> {
  const outcome = await runLoop({
    maxIterations: resolved.perimeter.maxIterations,
    runIteration: context => driveIteration(resolved, config, context, deps),
    onIteration: entry =>
      console.log(
        `  Iteration ${entry.iteration}: ${entry.result.outcome} — ${entry.result.detail}`,
      ),
  })

  reportOutcome(outcome)
  return loopExitCode(outcome)
}

/**
 * One iteration: a FRESH engine process, given the perimeter and the borrowed policy parameters.
 *
 * The continue-token's iteration counter is carried forward exactly as `pair-loop` documents
 * (`--iteration <n+1>`), so a resumed run does not restart its own counter — nothing else crosses
 * the boundary between iterations.
 */
function driveIteration(
  resolved: ResolvedRun,
  config: RunCommandConfig,
  context: IterationContext,
  deps: RunHandlerDependencies,
): Promise<IterationResult> {
  const promptText = buildPromptText(resolved.engine.engine, resolved.invocation, {
    ...(resolved.perimeter.root !== undefined && { root: resolved.perimeter.root }),
    // Passed ONLY when the invocation actually carries it. `buildSkillArgs` would drop it anyway,
    // but relying on that is how a flag ends up looking effective while changing nothing: the
    // decision belongs where the perimeter recorded it (round 1, finding 1).
    ...(resolved.perimeter.filterDelivery === 'argument' &&
      resolved.perimeter.filter !== undefined && { filter: resolved.perimeter.filter }),
    ...(resolved.policy.stopPredicate !== undefined && {
      predicate: resolved.policy.stopPredicate,
    }),
    iteration: context.iteration,
    // ONE operator intent, two axes (US-464): `--autonomous` already governs the ENGINE's
    // permission posture; it governs the composed SKILL's approval round too, because "nobody is
    // watching this run" is the same fact in both places. Passed only when the posture is
    // autonomous — an absent `$approval` IS the `interactive` default (ADR-021), so the
    // non-autonomous path renders exactly the bytes it rendered before this story (AC2).
    ...(resolved.autonomy.autonomous && { approval: 'auto' as const }),
  })

  const run = deps.runIteration ?? spawnIteration
  return run({
    engine: resolved.engine.engine,
    promptText,
    cwd: resolved.perimeter.cwd,
    autonomyArgs: resolved.autonomy.args,
    timeoutSeconds: config.iterationTimeoutSeconds,
  })
}

function reportOutcome(outcome: LoopOutcome): void {
  const reason = {
    'skill-reported-complete':
      'the skill reported itself finished (predicate satisfied, or nothing eligible)',
    'iteration-cap': 'the perimeter iteration cap was reached',
    'iteration-failed': 'an iteration failed (fail-closed: no terminal event counts as failed)',
  }[outcome.stopReason]

  const line = `  Stopped after ${outcome.iterations} iteration(s): ${reason}`
  console.log(outcome.stopReason === 'iteration-failed' ? chalk.red(line) : chalk.green(line))
}
