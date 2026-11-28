import { buildPromptText } from './invocation'
import { spawnIteration } from './spawn'
import type { RunCommandConfig } from './parser'
import type { ResolvedRun, RunHandlerDependencies } from './run-context'
import { createConsoleSink, routeConsoleTo } from './run-renderer'
import { createRunAudit } from './run-audit'
import { onInterrupt } from './interrupt'

function autoApproval(resolved: ResolvedRun) {
  return resolved.autonomy.autonomous || resolved.promptExtras?.approval === 'auto'
}

function promptForRun(resolved: ResolvedRun) {
  const perimeter = resolved.perimeter
  const extras = resolved.promptExtras
  return buildPromptText(resolved.engine.engine, resolved.invocation, {
    ...(perimeter.root !== undefined && { root: perimeter.root }),
    ...(perimeter.filterDelivery === 'argument' &&
      perimeter.filter !== undefined && { filter: perimeter.filter }),
    ...(perimeter.assignee !== undefined && { assignee: perimeter.assignee }),
    ...(perimeter.status !== undefined && { status: perimeter.status }),
    ...(autoApproval(resolved) && { approval: 'auto' as const }),
    ...(extras?.prepare !== undefined && { prepare: extras.prepare }),
  })
}

function auditForRun(
  resolved: ResolvedRun,
  deps: RunHandlerDependencies,
  sink: ReturnType<typeof createConsoleSink>,
) {
  return resolved.auditPath === undefined
    ? undefined
    : createRunAudit({
        path: resolved.auditPath,
        ...(deps.runAudit !== undefined && { append: deps.runAudit }),
        onWriteError: error => sink.log(`  ! live audit is not writable (${String(error)})`),
        runId: `run-${new Date().toISOString().replace(/[:.]/g, '')}-${process.pid}`,
        root: resolved.perimeter.cwd,
        policy: { source: resolved.policy.source },
      })
}

function invokeRun(
  resolved: ResolvedRun,
  config: RunCommandConfig,
  deps: RunHandlerDependencies,
  emit: (event: import('./run-events').RunEvent) => void,
) {
  return (deps.runIteration ?? spawnIteration)({
    engine: resolved.engine.engine,
    ...(resolved.model !== undefined && { model: resolved.model }),
    ...(resolved.effort !== undefined && { effort: resolved.effort }),
    promptText: promptForRun(resolved),
    cwd: resolved.perimeter.cwd,
    autonomyArgs: resolved.autonomy.args,
    timeoutSeconds: config.iterationTimeoutSeconds,
    idleTimeoutSeconds: resolved.idleTimeout?.seconds,
    onRunEvent: emit,
    maxFixRounds: 3,
  })
}

function sinkForRun(config: RunCommandConfig) {
  return createConsoleSink({
    out: process.stdout,
    err: process.stderr,
    mode: config.output ?? 'live',
    color: config.noColor !== true && process.env['NO_COLOR'] === undefined,
    plain: config.verbose !== true,
  })
}

/** Invoke a skill once; a continue token in its output does not start another process. */
export async function driveRun(
  resolved: ResolvedRun,
  config: RunCommandConfig,
  deps: RunHandlerDependencies,
): Promise<number> {
  const sink = sinkForRun(config)
  const audit = auditForRun(resolved, deps, sink)
  const restore = routeConsoleTo(sink)
  const unsubscribe = onInterrupt(() => {
    audit?.end('interrupted', 'the driver received a signal')
    restore()
    sink.finish()
  })
  const emit = (event: import('./run-events').RunEvent) => {
    audit?.record(event, 1)
    sink.event(event, 1)
  }
  const card = config.dispatch?.card
  if (card !== undefined) {
    emit({ event: 'card-start', card })
    emit({ event: 'stage', card, stage: 'prepare', detail: 'planning' })
  }
  try {
    const result = await invokeRun(resolved, config, deps, emit)
    if (card !== undefined)
      emit({
        event: 'card-end',
        card,
        status: result.outcome === 'failed' ? 'failed' : 'prepared',
        reason: result.outcome === 'failed' ? result.detail : 'prepared',
      })
    audit?.end(result.outcome === 'failed' ? 'halted' : 'completed', result.detail)
    sink.log(`  ${result.outcome}: ${result.detail}`)
    return result.outcome === 'failed' ? 1 : 0
  } finally {
    unsubscribe()
    restore()
    sink.finish()
  }
}
