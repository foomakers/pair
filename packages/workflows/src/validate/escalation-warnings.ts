import { addressedSteps, errorAt, type Step, type Workflow, type WorkflowError } from '../grammar'
import { kindByName } from '../kinds'

function possibleStatuses(step: Step): ReadonlySet<string> {
  if (step.kind === 'loop') return new Set(['ok', 'exhausted'])
  // The host can record a failure independently of the kind's agent result contract.
  const statuses = new Set(['ok', 'failed', ...Object.keys(kindByName[step.kind].returns)])
  // A host can report an unavailable gate separately from a gate that ran and failed.
  if (step.kind === 'gate') statuses.add('blocked')
  return statuses
}

function statusWarnings(
  workflow: Workflow,
  step: Step,
  path: readonly string[],
  producers: ReadonlyMap<string, Step>,
): WorkflowError[] {
  const [id = '', output] = step.when?.output?.split('.') ?? []
  const producer = producers.get(id)
  if (output !== 'status' || producer === undefined) return []
  const possible = possibleStatuses(producer)
  return (step.when?.is ?? []).flatMap((status, index) =>
    typeof status === 'string' && possible.has(status)
      ? []
      : [
          errorAt(workflow, [...path, 'when', 'is', index], {
            problem: `step '${id}' cannot expose status ${JSON.stringify(status)}`,
            fix: `use one of ${[...possible].join(', ')}`,
          }),
        ],
  )
}

function ruleWarnings(
  workflow: Workflow,
  step: Step,
  path: readonly string[],
  canCommentOnCard: () => boolean,
): WorkflowError[] {
  if (step.escalate === undefined) return []
  const at = [...path, 'escalate']
  const possible = possibleStatuses(step)
  const warnings = Object.entries(step.escalate).flatMap(([status, rule]) => [
    ...(possible.has(status)
      ? []
      : [
          errorAt(workflow, [...at, status], {
            problem: `unreachable escalation for '${status}' on a ${step.kind} step`,
            fix: `remove escalate.${status}`,
          }),
        ]),
    ...(typeof rule === 'object' && !canCommentOnCard()
      ? [
          errorAt(workflow, [...at, status, 'comment'], {
            problem: 'the host does not support card comments',
            fix: 'use a host that writes card comments or remove the comment',
          }),
        ]
      : []),
  ])
  if (step.kind === 'loop') return warnings
  for (const status of Object.keys(kindByName[step.kind].returns)) {
    if (Object.hasOwn(step.escalate, status)) continue
    if (status === 'failed' && step['on-failed'] !== undefined) continue
    warnings.push(
      errorAt(workflow, at, {
        problem: `'${status}' is unhandled and uses the default action`,
        fix: `add escalate.${status} to declare an action`,
      }),
    )
  }
  return warnings
}

export function escalationWarnings(
  workflow: Workflow,
  support: boolean | (() => boolean) = false,
): WorkflowError[] {
  let supported = typeof support === 'boolean' ? support : undefined
  const canCommentOnCard = () => (supported ??= typeof support === 'function' && support())
  const producers = new Map(addressedSteps(workflow).map(step => [step.id, step]))
  const check = (step: Step, path: readonly string[]) => [
    ...ruleWarnings(workflow, step, path, canCommentOnCard),
    ...statusWarnings(workflow, step, path, producers),
  ]
  return workflow.steps.flatMap(step => {
    const path = ['steps', step.id]
    return [
      ...check(step, path),
      ...(step.steps ?? []).flatMap(child => check(child, [...path, 'steps', child.id])),
    ]
  })
}
