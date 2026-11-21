import { errorAt, parseWorkflow, type Step, type Workflow, type WorkflowError } from '../grammar'
import { fieldsOf, kindByName } from '../kinds'
import { textsOf, violations } from '../schema'

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

const skillErrors: Check = (workflow, step, deps) => {
  if (step.uses !== undefined)
    return [
      errorAt(workflow, ['steps', step.id, 'uses'], {
        problem: `'uses' does not name a skill: '${step.uses}'`,
        fix: `write skill: ${step.uses}`,
      }),
    ]
  const skill = step.skill ?? kindByName[step.kind].defaultSkill
  if (skill === undefined)
    return [
      errorAt(workflow, ['steps', step.id], {
        problem: `a ${step.kind} step has no default skill`,
        fix: "add 'skill' with the skill to run",
      }),
    ]
  if (deps.skillExists(skill)) return []
  return [
    errorAt(workflow, ['steps', step.id, 'skill'], {
      problem: `skill '${skill}' is not installed`,
      fix: "install it, or name an installed skill in 'skill'",
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

const safetyErrors: Check = (workflow, step, deps) =>
  textsOf(step.with ?? {}, ['steps', step.id, 'with'])
    .filter(([, text]) => !deps.isSafeText(text))
    .map(([path, text]) =>
      errorAt(workflow, path, {
        problem: `${JSON.stringify(text)} is not safe to hand to an agent`,
        fix: 'write short plain text: no backtick, no $(, no line break',
      }),
    )

const CHECKS: readonly Check[] = [skillErrors, withErrors, gateErrors, safetyErrors]

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
