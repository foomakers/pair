import { resolve } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import { loadConfigWithOverrides, readEngineDeclaration } from '#config'
import type { Config } from '#registry'
import type { RunCommandConfig } from './parser'
import { assertEngineAvailable, describeEngineResolution, resolveEngine } from './resolve-engine'
import { createExecutableProbe } from './path-probe'
import { ENGINE_IDS, isEngineId, type EngineDefinition, type EngineId } from './engines'
import {
  describeSkillResolution,
  resolveInvocation,
  type ResolvedInvocation,
} from './resolve-skill'
import { createSkillProbe } from './skill-probe'
import { createPerimeter, describePerimeter, type Perimeter } from './perimeter'
import { resolveAutonomy, type AutonomyDecision } from './autonomy'
import { createProjectTrustProbe } from './trust-probe'
import {
  describeParallelism,
  readAutomationPolicy,
  type AutomationPolicy,
} from './automation-policy'
import { buildPromptText } from './invocation'
import { loopExitCode, runLoop, type IterationContext, type LoopOutcome } from './loop'
import { spawnIteration } from './spawn'
import type { IterationResult } from './stream-reader'

/** Injected so the loop can be driven in tests without spawning an engine. */
export type IterationRunner = (input: {
  engine: EngineDefinition
  promptText: string
  cwd: string
  autonomyArgs: readonly string[]
  timeoutSeconds: number
}) => Promise<IterationResult>

export interface RunHandlerDependencies {
  runIteration?: IterationRunner
}

/**
 * The engine the project's own `pair.config.json` declares, if any.
 *
 * A malformed block THROWS rather than degrading to the default: an operator whose typo was
 * silently ignored would have no way to tell a working configuration from a broken one.
 */
function declaredEngine(config: Config): EngineId | undefined {
  const outcome = readEngineDeclaration(config, ENGINE_IDS)
  if (outcome.errors.length > 0) {
    throw new Error(`pair.config.json is invalid:\n  - ${outcome.errors.join('\n  - ')}`)
  }
  return isEngineId(outcome.engine) ? outcome.engine : undefined
}

interface ResolvedRun {
  engine: ReturnType<typeof resolveEngine>
  invocation: ResolvedInvocation
  perimeter: Perimeter
  policy: AutomationPolicy
  autonomy: AutonomyDecision
}

/**
 * Everything is resolved BEFORE anything is spawned, and every resolution is printed: engine and
 * the level it came from (AC1), skill and any fallback (AC2), the perimeter (AC5), the autonomy
 * and trust posture (AC6), the borrowed policy and the declared parallelism limit (AC8/AC9).
 *
 * A refusal — no perimeter, an untrusted project, an engine with no confirmations and no
 * `--autonomous`, a malformed policy — happens here, so no iteration ever starts outside them.
 */
function resolveRun(config: RunCommandConfig, fs: FileSystemService, cwd: string): ResolvedRun {
  const loaded = loadConfigWithOverrides(fs, { projectRoot: cwd })
  const engine = resolveEngine({ flag: config.engine, declared: declaredEngine(loaded.config) })
  // One probe per RUN, not per iteration: the installed skill set does not change mid-run.
  const invocation = resolveInvocation(config.invocation, createSkillProbe(fs, loaded.config, cwd))
  const policy = readAutomationPolicy(fs, cwd)
  const perimeter = createPerimeter({
    root: config.scope.root,
    filter: config.scope.filter,
    eligibility: policy.eligibility,
    cwd,
    cwdDeclared: config.cwd !== undefined,
    requestedCap: config.maxIterations,
    policyCap: policy.maxIterations,
    invocationKind: invocation.kind,
  })
  const autonomy = resolveAutonomy({
    engine: engine.engine,
    autonomous: config.autonomous,
    approveProjectTrust: config.approveProjectTrust,
    cwd,
    isProjectTrusted: createProjectTrustProbe(fs),
  })

  return { engine, invocation, perimeter, policy, autonomy }
}

function report(resolved: ResolvedRun, policyWarnings: readonly string[]): void {
  console.log(chalk.bold('pair run'))
  console.log(`  ${describeEngineResolution(resolved.engine)}`)
  console.log(`  ${describeSkillResolution(resolved.invocation)}`)
  console.log(`  ${describePerimeter(resolved.perimeter)}`)
  for (const note of resolved.autonomy.notes) console.log(`  ${note}`)
  console.log(`  Policy: ${resolved.policy.source} · audit ${resolved.policy.auditLocation}`)
  console.log(`  ${describeParallelism(resolved.policy)}`)
  console.log('  Merge: never performed by the driver — the gate stays human (AC10)')
  for (const warning of policyWarnings) console.log(chalk.yellow(`  ! ${warning}`))
}

/**
 * Handles `pair run` — the execution adapter (US-451).
 *
 * Composes resolution → refusals → the re-invocation loop. The process logic stays in the skill:
 * this handler decides HOW to invoke, never WHAT to work on (BR1), and never merges (AC10).
 */
export async function handleRunCommand(
  config: RunCommandConfig,
  fs: FileSystemService,
  deps: RunHandlerDependencies = {},
): Promise<number> {
  // ABSOLUTE, always: the perimeter's directory is printed as the run's containment boundary and
  // probed against the engine's trust store, and `--cwd .` is neither legible as a boundary nor
  // comparable against an absolute trust-store key.
  const cwd = resolve(config.cwd ?? fs.currentWorkingDirectory())
  const resolved = resolveRun(config, fs, cwd)

  report(resolved, resolved.policy.warnings)

  if (config.dryRun) {
    console.log(chalk.dim('  Dry run: nothing was spawned.'))
    return 0
  }

  assertEngineAvailable(resolved.engine, createExecutableProbe(fs))

  const outcome = await runLoop({
    maxIterations: resolved.perimeter.maxIterations,
    runIteration: context => driveIteration(resolved, config, context, deps),
    onIteration: record =>
      console.log(
        `  Iteration ${record.iteration}: ${record.result.outcome} — ${record.result.detail}`,
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
    ...(resolved.perimeter.filter !== undefined && { filter: resolved.perimeter.filter }),
    ...(resolved.policy.stopPredicate !== undefined && {
      predicate: resolved.policy.stopPredicate,
    }),
    iteration: context.iteration,
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
