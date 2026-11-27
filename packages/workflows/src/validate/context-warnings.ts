import {
  errorAt,
  escalationAction,
  type Step,
  type When,
  type Workflow,
  type WorkflowError,
} from '../grammar'
import { kindByName } from '../kinds'

export interface ResumeFacts {
  /** The effective engine for a runnable step, using its run-wide id. */
  readonly engineFor: (step: string) => string | undefined
  readonly loopMax?: (loop: string) => number | undefined
  readonly supports: (engine: string) => boolean | undefined
}

const isAgent = (step: Step) => step.kind !== 'loop' && kindByName[step.kind].host !== true

const advance = (step: Step, previous: readonly Step[], runs = step.when === undefined) =>
  runs ? [step] : [step, ...previous]

interface LoopExit {
  readonly output: string
  readonly status: 'ok' | 'exhausted'
  readonly children: readonly Step[]
  readonly until: string
  readonly last: Step
  readonly earlyFailure: boolean
}

interface Predecessors {
  readonly steps: readonly Step[]
  readonly exit?: LoopExit
}

function matchesExit(
  exit: LoopExit,
  output: string | undefined,
  values: readonly unknown[],
): boolean | undefined {
  if (output === exit.output) return values.includes(exit.status)
  const child = exit.children.findIndex(step => output === `${step.id}.status`)
  if (child < 0) return undefined
  const last = exit.children.indexOf(exit.last)
  // A skipped child or one past the last launch has no status outcome.
  if (child > last) return false
  const step = exit.children[child]!
  if (step.id !== exit.until) return matchesNonUntil(exit, step, values)
  if (exit.status === 'ok') return values.includes('ok')
  // A successful until-step would have ended this round before exhaustion.
  return values.every(value => value === 'ok') ? false : undefined
}

function matchesNonUntil(exit: LoopExit, step: Step, values: readonly unknown[]) {
  if (step === exit.last && exit.earlyFailure) return values.includes('failed')
  return step.escalate?.failed === undefined && values.every(value => value === 'failed')
    ? false
    : undefined
}

/** An unknown condition leaves both running and skipping possible. */
function runsOnExit(when: When | undefined, exit: LoopExit | undefined): boolean | undefined {
  if (when === undefined) return true
  if (exit === undefined) return undefined
  const { output, is, ...cardFilter } = when
  const match = matchesExit(exit, output, is ?? [])
  return match === true && Object.keys(cardFilter).length > 0 ? undefined : match
}

interface RoundEnding {
  readonly step: Step
  readonly earlyFailure: boolean
}

function roundEndings(children: readonly Step[], until: string): readonly RoundEnding[] {
  const early: RoundEnding[] = []
  let last: readonly Step[] = []
  for (const child of children) {
    const { failed, blocked, 'needs-decision': needsDecision } = child.escalate ?? {}
    if (child.id === until) {
      // Success exits the loop. Only a settled non-success can reach the round end.
      if (
        failed !== undefined &&
        [failed, blocked, needsDecision].every(rule => escalationAction(rule) !== 'continue')
      )
        return early
    } else if (failed === undefined) {
      // A non-until failure without an explicit rule closes the round immediately.
      early.push({ step: child, earlyFailure: true })
    }
    last = advance(child, last)
  }
  return [...early, ...last.map(step => ({ step, earlyFailure: false }))]
}

function loopPredecessors(
  loop: Step,
  children: readonly Step[],
  until: string,
  endings: readonly RoundEnding[],
): Predecessors[] {
  const route = (last: Step, status: LoopExit['status'], earlyFailure = false): Predecessors => ({
    steps: [last],
    exit: { output: `${loop.id}.status`, status, children, until, last, earlyFailure },
  })
  const success = children.filter(child => child.id === until).map(child => route(child, 'ok'))
  return escalationAction(loop.escalate?.exhausted) === 'continue'
    ? [
        ...success,
        ...endings.map(({ step, earlyFailure }) => route(step, 'exhausted', earlyFailure)),
      ]
    : success
}

function engineProblem(step: Step, previous: readonly Step[], facts: ResumeFacts) {
  const engine = facts.engineFor(step.id)
  if (engine === undefined) return undefined
  if (facts.supports(engine) === false) return `engine '${engine}' does not support resume`
  if (
    previous.every(one => {
      const earlier = facts.engineFor(one.id)
      return earlier !== undefined && earlier !== engine
    })
  )
    return `engine '${engine}' differs from the preceding engine`
  return undefined
}

function resumeProblem(
  step: Step,
  previous: readonly Step[] | undefined,
  resume: ResumeFacts | undefined,
  staticChecks: boolean,
) {
  if (step.context !== 'resume' || previous === undefined) return undefined
  const agents = previous.filter(isAgent)
  if (agents.length === 0)
    return staticChecks ? 'there is no preceding agent step to resume' : undefined
  return resume && engineProblem(step, agents, resume)
}

const repeats = (step: Step, facts: ResumeFacts | undefined) =>
  (facts?.loopMax?.(step.id) ?? step.max ?? 1) > 1

function collectWarnings(
  workflow: Workflow,
  resume: ResumeFacts | undefined,
  staticChecks: boolean,
): WorkflowError[] {
  const warnings: WorkflowError[] = []
  const check = (step: Step, path: string[], previous: readonly Step[] | undefined) => {
    const warn = (problem: string, fix: string) =>
      warnings.push(errorAt(workflow, [...path, 'context'], { problem, fix }))
    if (staticChecks && step.kind === 'review' && step.context && step.context !== 'fresh')
      warn('non-fresh context compromises review independence', 'use context: fresh')
    const problem = resumeProblem(step, previous, resume, staticChecks)
    if (problem !== undefined) warn(problem, 'use context: handoff or accept the fallback')
  }
  let previous: readonly Predecessors[] = [{ steps: [] }]
  for (const step of workflow.steps) {
    const path = ['steps', step.id]
    if (step.kind !== 'loop') {
      const routes = previous.map(source => ({ source, runs: runsOnExit(step.when, source.exit) }))
      const reachable = routes.filter(({ runs }) => runs !== false)
      check(
        step,
        path,
        reachable.length > 0 ? reachable.flatMap(({ source }) => source.steps) : undefined,
      )
      previous = routes.map(({ source, runs }) =>
        runs === false ? source : { ...source, steps: advance(step, source.steps, runs) },
      )
      continue
    }
    const children = (step.steps ?? []).map(child => ({ ...child, id: `${step.id}/${child.id}` }))
    const until = `${step.id}/${step.until}`
    const endings = roundEndings(children, until)
    const earlier = previous.flatMap(source => source.steps)
    let before = repeats(step, resume)
      ? [...earlier, ...endings.map(ending => ending.step)]
      : earlier
    for (const child of children) {
      check(child, [...path, 'steps', child.id.slice(step.id.length + 1)], before)
      before = advance(child, before)
    }
    previous = loopPredecessors(step, children, until, endings)
  }
  return warnings
}

export function contextWarnings(workflow: Workflow, resume?: ResumeFacts): WorkflowError[] {
  return collectWarnings(workflow, resume, true)
}

/** Run after resolving a configuration if engine facts were unavailable during validation. */
export function resumeEngineWarnings(workflow: Workflow, resume: ResumeFacts): WorkflowError[] {
  return collectWarnings(workflow, resume, false)
}
