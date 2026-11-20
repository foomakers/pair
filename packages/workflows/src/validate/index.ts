import { errorAt, parseWorkflow, type Step, type Workflow, type WorkflowError } from '../grammar'
import { fieldsOf, kindByName } from '../kinds'
import { violations } from '../schema'

/** What the validator asks of its caller: the package reads no skill directory and no adoption file itself. */
export interface ValidationDeps {
  /** Whether a skill of that name is installed. */
  readonly skillExists: (name: string) => boolean
  /** The keys of the Custom Gate Registry. */
  readonly gateKeys: readonly string[]
  /** The inputs the launch provides (`card`). */
  readonly launchInputs: readonly string[]
  /** The host's prompt-safety check: every text of the file that reaches an agent passes it. */
  readonly isSafeText: (value: string) => boolean
}

export interface Validation {
  /** Present only when there is no error. */
  readonly workflow?: Workflow
  readonly errors: readonly WorkflowError[]
  /** Never refuse a workflow. None is defined yet; later kinds add theirs. */
  readonly warnings: readonly WorkflowError[]
}

type Check = (workflow: Workflow, step: Step, deps: ValidationDeps) => WorkflowError[]

const usesErrors: Check = (workflow, step, deps) => {
  const uses = step.uses ?? kindByName[step.kind].defaultUses
  if (uses === undefined)
    return [
      errorAt(workflow, ['steps', step.id], {
        problem: `a ${step.kind} step has no default skill`,
        fix: "add 'uses' with the skill to run",
      }),
    ]
  if (deps.skillExists(uses)) return []
  return [
    errorAt(workflow, ['steps', step.id, 'uses'], {
      problem: `skill '${uses}' is not installed`,
      fix: "install it, or name an installed skill in 'uses'",
    }),
  ]
}

const withErrors: Check = (workflow, step) =>
  violations(kindByName[step.kind].with, step.with ?? {}).map(found =>
    errorAt(workflow, ['steps', step.id, 'with', ...found.path], found),
  )

const gateErrors: Check = (workflow, step, deps) => {
  const gates = step.with?.['gates']
  if (kindByName[step.kind].with.properties?.['gates'] === undefined || !Array.isArray(gates))
    return []
  const known = deps.gateKeys
  return gates.flatMap((key: unknown, index) =>
    typeof key !== 'string' || known.includes(key)
      ? []
      : [
          errorAt(workflow, ['steps', step.id, 'with', 'gates', index], {
            problem: `unknown gate key '${key}'`,
            fix:
              known.length > 0
                ? `use one of ${known.join(', ')}`
                : "give each gate a 'Key' in the Custom Gate Registry of way-of-working.md",
          }),
        ],
  )
}

/** Every string under `with`, keys included, with its path. */
function texts(value: unknown, path: readonly (string | number)[]): [typeof path, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (Array.isArray(value)) return value.flatMap((item, index) => texts(item, [...path, index]))
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, member]) => [
    [[...path, key], key] as [typeof path, string],
    ...texts(member, [...path, key]),
  ])
}

const safetyErrors: Check = (workflow, step, deps) =>
  texts(step.with ?? {}, ['steps', step.id, 'with'])
    .filter(([, text]) => !deps.isSafeText(text))
    .map(([path, text]) =>
      errorAt(workflow, path, {
        problem: `${JSON.stringify(text)} is not safe to hand to an agent`,
        fix: 'write short plain text: no backtick, no $(, no line break',
      }),
    )

const CHECKS: readonly Check[] = [usesErrors, withErrors, gateErrors, safetyErrors]

function coherenceErrors(workflow: Workflow, deps: ValidationDeps): WorkflowError[] {
  const available = new Set(deps.launchInputs)
  return workflow.steps.flatMap(step => {
    const kind = kindByName[step.kind]
    const unmet = (kind.inputs.required ?? [])
      .filter(input => !available.has(input))
      .map(input =>
        errorAt(workflow, ['steps', step.id], {
          problem: `input '${input}' is neither a launch argument nor an output of an earlier step`,
          fix: `put a step that returns '${input}' before it`,
        }),
      )
    fieldsOf(kind.outputs).forEach(output => available.add(output))
    return [...unmet, ...CHECKS.flatMap(check => check(workflow, step, deps))]
  })
}

/**
 * The one validator: form (the grammar) then coherence (skills, inputs, options, gate keys).
 * `pair run <workflow>` calls it before any launch, and `--dry-run` calls nothing else.
 */
export function validate(text: string, file: string, deps: ValidationDeps): Validation {
  const parsed = parseWorkflow(text, file)
  if (parsed.workflow === undefined) return { errors: parsed.errors, warnings: [] }
  const errors = coherenceErrors(parsed.workflow, deps)
  return errors.length > 0
    ? { errors, warnings: [] }
    : { workflow: parsed.workflow, errors: [], warnings: [] }
}
