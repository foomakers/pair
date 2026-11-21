import {
  errorAt,
  parseWorkflow,
  stepSchema,
  type Step,
  type Workflow,
  type WorkflowError,
} from '../grammar'
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
  /** Never refuse a workflow. */
  readonly warnings: readonly WorkflowError[]
}

type Check = (
  workflow: Workflow,
  step: Step,
  deps: ValidationDeps,
  path: readonly string[],
) => WorkflowError[]

const skillErrors: Check = (workflow, step, deps, path) => {
  if (step.kind === 'loop') return []
  if (step.uses !== undefined)
    return [
      errorAt(workflow, [...path, 'uses'], {
        problem: `'uses' does not name a skill: '${step.uses}'`,
        fix: `write skill: ${step.uses}`,
      }),
    ]
  const skill = step.skill ?? kindByName[step.kind].defaultSkill
  if (skill === undefined)
    return [
      errorAt(workflow, path, {
        problem: `a ${step.kind} step has no default skill`,
        fix: "add 'skill' with the skill to run",
      }),
    ]
  if (deps.skillExists(skill)) return []
  return [
    errorAt(workflow, [...path, 'skill'], {
      problem: `skill '${skill}' is not installed`,
      fix: "install it, or name an installed skill in 'skill'",
    }),
  ]
}

const withErrors: Check = (workflow, step, _deps, path) =>
  (step.kind === 'loop' ? [] : violations(kindByName[step.kind].with, step.with ?? {})).map(found =>
    errorAt(workflow, [...path, 'with', ...found.path], found),
  )

const gateErrors: Check = (workflow, step, deps, path) => {
  if (step.kind === 'loop') return []
  const gates = step.with?.['gates']
  if (kindByName[step.kind].with.properties?.['gates'] === undefined || !Array.isArray(gates))
    return []
  const known = deps.gateKeys
  return gates.flatMap((key: unknown, index) =>
    typeof key !== 'string' || known.includes(key)
      ? []
      : [
          errorAt(workflow, [...path, 'with', 'gates', index], {
            problem: `unknown gate key '${key}'`,
            fix:
              known.length > 0
                ? `use one of ${known.join(', ')}`
                : "give each gate a 'Key' in the Custom Gate Registry of way-of-working.md",
          }),
        ],
  )
}

const safetyErrors: Check = (workflow, step, deps, path) =>
  textsOf(step.with ?? {}, [...path, 'with'])
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
  const checkStep = (step: Step, path: readonly string[]): WorkflowError[] => {
    if (step.kind === 'loop') {
      const errors: WorkflowError[] = []
      for (const key of ['until', 'max', 'on-max', 'steps'] as const)
        if (step[key] === undefined)
          errors.push(
            errorAt(workflow, path, { problem: `missing key '${key}'`, fix: `add '${key}'` }),
          )
      if (step.until !== undefined && !step.steps?.some(child => child.id === step.until))
        errors.push(
          errorAt(workflow, [...path, 'until'], {
            problem: `unknown until step '${step.until}'`,
            fix: 'name a step of this loop',
          }),
        )
      if (step['on-failed'] !== undefined)
        errors.push(
          errorAt(workflow, [...path, 'on-failed'], {
            problem: 'on-failed is not allowed on a loop',
            fix: 'remove it',
          }),
        )
      for (const key of ['skill', 'uses', 'with'] as const)
        if (step[key] !== undefined)
          errors.push(
            errorAt(workflow, [...path, key], {
              problem: `${key} is not allowed on a loop`,
              fix: `remove '${key}'`,
            }),
          )
      for (const child of step.steps ?? []) {
        const childPath = [...path, 'steps', child.id]
        const raw = Object.fromEntries(Object.entries(child).filter(([key]) => key !== 'id'))
        errors.push(
          ...violations(stepSchema, raw).map(found =>
            errorAt(workflow, [...childPath, ...found.path], found),
          ),
        )
        if (child.kind === 'loop')
          errors.push(
            errorAt(workflow, childPath, {
              problem: 'nested loop is not allowed',
              fix: 'move this loop outside the parent loop',
            }),
          )
        else {
          if (child['on-failed'] !== undefined)
            errors.push(
              errorAt(workflow, [...childPath, 'on-failed'], {
                problem: 'on-failed is not allowed inside a loop',
                fix: 'remove it',
              }),
            )
          errors.push(...checkStep(child, childPath))
        }
      }
      return errors
    }
    const kind = kindByName[step.kind]
    const misplaced = (['until', 'max', 'on-max', 'steps'] as const)
      .filter(key => step[key] !== undefined)
      .map(key =>
        errorAt(workflow, [...path, key], {
          problem: `${key} is only allowed on a loop`,
          fix: `remove '${key}'`,
        }),
      )
    const unmet = (kind.inputs.required ?? [])
      .filter(input => !available.has(input))
      .map(input =>
        errorAt(workflow, path, {
          problem: `input '${input}' is neither a launch argument nor an output of an earlier step`,
          fix: `put a step that returns '${input}' before it`,
        }),
      )
    fieldsOf(kind.outputs).forEach(output => available.add(output))
    return [...misplaced, ...unmet, ...CHECKS.flatMap(check => check(workflow, step, deps, path))]
  }
  return workflow.steps.flatMap(step => checkStep(step, ['steps', step.id]))
}

/** `on-failed: continue` on the last step: nothing consumes the failure. */
function warnings(workflow: Workflow): WorkflowError[] {
  const last = workflow.steps[workflow.steps.length - 1]
  return last?.['on-failed'] === 'continue'
    ? [
        errorAt(workflow, ['steps', last.id, 'on-failed'], {
          problem: 'on-failed: continue on the last step; no step consumes the failure',
          fix: 'remove it, or put a step after it',
        }),
      ]
    : []
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
    : { workflow: parsed.workflow, errors: [], warnings: warnings(parsed.workflow) }
}
