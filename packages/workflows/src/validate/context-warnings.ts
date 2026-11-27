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
  readonly supports: (engine: string) => boolean | undefined
}

const isAgent = (step: Step) => step.kind !== 'loop' && kindByName[step.kind].host !== true

const advance = (step: Step, previous: readonly Step[], runs = step.when === undefined) =>
  runs ? [step] : [step, ...previous]

interface LoopExit {
  readonly output: string
  readonly status: 'ok' | 'exhausted'
}

interface Predecessors {
  readonly steps: readonly Step[]
  readonly exit?: LoopExit
}

/** An unknown condition leaves both running and skipping possible. */
function runsOnExit(when: When | undefined, exit: LoopExit | undefined): boolean | undefined {
  if (when === undefined) return true
  const { output, is, ...cardFilter } = when
  if (exit === undefined || output !== exit.output) return undefined
  if (!is?.includes(exit.status)) return false
  return Object.keys(cardFilter).length === 0 ? true : undefined
}

function roundEndings(children: readonly Step[], until: string): readonly Step[] {
  const early: Step[] = []
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
      early.push(child)
    }
    last = advance(child, last)
  }
  return [...early, ...last]
}

function loopPredecessors(loop: Step, success: readonly Step[], endings: readonly Step[]) {
  const output = `${loop.id}.status`
  const exits: Predecessors[] = [{ steps: success, exit: { output, status: 'ok' } }]
  if (endings.length > 0 && escalationAction(loop.escalate?.exhausted) === 'continue')
    exits.push({ steps: endings, exit: { output, status: 'exhausted' } })
  return exits
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
    let before = (step.max ?? 1) > 1 ? [...earlier, ...endings] : earlier
    for (const child of children) {
      check(child, [...path, 'steps', child.id.slice(step.id.length + 1)], before)
      before = advance(child, before)
    }
    previous = loopPredecessors(
      step,
      children.filter(child => child.id === until),
      endings,
    )
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
