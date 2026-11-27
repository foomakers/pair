import { errorAt, escalationAction, type Step, type Workflow, type WorkflowError } from '../grammar'
import { kindByName } from '../kinds'

export interface ResumeFacts {
  /** The effective engine for a runnable step, using its run-wide id. */
  readonly engineFor: (step: string) => string | undefined
  readonly supports: (engine: string) => boolean | undefined
}

const isAgent = (step: Step) => step.kind !== 'loop' && kindByName[step.kind].host !== true

const advance = (step: Step, previous: readonly Step[]) =>
  step.when === undefined ? [step] : [step, ...previous]

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

function collectWarnings(
  workflow: Workflow,
  resume: ResumeFacts | undefined,
  staticChecks: boolean,
): WorkflowError[] {
  const warnings: WorkflowError[] = []
  const check = (step: Step, path: string[], previous: readonly Step[]) => {
    const warn = (problem: string, fix: string) =>
      warnings.push(errorAt(workflow, [...path, 'context'], { problem, fix }))
    if (staticChecks && step.kind === 'review' && step.context && step.context !== 'fresh')
      warn('non-fresh context compromises review independence', 'use context: fresh')
    if (step.context !== 'resume') return
    const agents = previous.filter(isAgent)
    const problem =
      agents.length === 0
        ? staticChecks
          ? 'there is no preceding agent step to resume'
          : undefined
        : resume && engineProblem(step, agents, resume)
    if (problem !== undefined) warn(problem, 'use context: handoff or accept the fallback')
  }
  let previous: readonly Step[] = []
  for (const step of workflow.steps) {
    const path = ['steps', step.id]
    if (step.kind !== 'loop') {
      check(step, path, previous)
      previous = advance(step, previous)
      continue
    }
    const children = (step.steps ?? []).map(child => ({ ...child, id: `${step.id}/${child.id}` }))
    const until = `${step.id}/${step.until}`
    const endings = roundEndings(children, until)
    let before = (step.max ?? 1) > 1 ? [...previous, ...endings] : previous
    for (const child of children) {
      check(child, [...path, 'steps', child.id.slice(step.id.length + 1)], before)
      before = advance(child, before)
    }
    previous = children.filter(child => child.id === until)
    if (escalationAction(step.escalate?.exhausted) === 'continue')
      previous = [...previous, ...endings]
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
