import {
  errorAt,
  parseWorkflow,
  expandedStepSchema,
  type KindName,
  type Step,
  type Workflow,
  type WorkflowError,
} from '../grammar'
import { expand, type WorkflowSource } from '../expand'
import { fieldsOf, kindByName } from '../kinds'
import { addressedSteps } from '../grammar'
import { textsOf, violations } from '../schema'

/** What the validator asks of its caller: the package reads no skill directory and no adoption file itself. */
export interface ValidationDeps {
  readonly resolveWorkflow?: (name: string) => WorkflowSource | undefined
  readonly availableWorkflows?: readonly string[]
  /** Whether a skill of that name is installed. */
  readonly skillExists: (name: string) => boolean
  /** The keys of the Custom Gate Registry. */
  readonly gateKeys: readonly string[]
  /** The targets of the Custom Gate Registry. */
  readonly gateTargets?: readonly string[]
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

const unknownUses: Check = (workflow, step, deps, path) => {
  const name = step.uses ?? ''
  const skill = deps.skillExists(name)
  return [
    errorAt(workflow, [...path, 'uses'], {
      problem: skill ? `'uses' does not name a skill: '${name}'` : `unknown workflow '${name}'`,
      fix: skill
        ? `write skill: ${name}`
        : deps.availableWorkflows?.length
          ? `use one of ${deps.availableWorkflows.join(', ')}`
          : 'add the named workflow',
    }),
  ]
}

const skillErrors: Check = (workflow, step, deps, path) => {
  if (step.uses !== undefined) return unknownUses(workflow, step, deps, path)
  if (step.kind === 'loop' || kindByName[step.kind].host === true) return []
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

const reservedOutputs: Check = (workflow, step, _deps, path) =>
  step.kind !== 'loop' && fieldsOf(kindByName[step.kind].outputs).includes('status')
    ? [
        errorAt(workflow, path, {
          problem: `kind '${step.kind}' declares the reserved output 'status'`,
          fix: 'rename the kind output',
        }),
      ]
    : []

const gateErrors: Check = (workflow, step, deps, path) => {
  if (step.kind === 'loop') return []
  const own = step.gates
  const inWith = step.with?.['gates']
  const [gates, at] =
    own !== undefined
      ? [own, [...path, 'gates']]
      : kindByName[step.kind].with.properties?.['gates'] !== undefined && Array.isArray(inWith)
        ? [inWith, [...path, 'with', 'gates']]
        : [undefined, path]
  if (gates === undefined) return []
  const known = deps.gateKeys
  const ok = (entry: string) =>
    (entry.startsWith('command:') && entry.length > 8) ||
    (entry.startsWith('target:') && (deps.gateTargets ?? []).includes(entry.slice(7)))
  return gates.flatMap((key: unknown, index) =>
    typeof key !== 'string' || known.includes(key) || ok(key)
      ? []
      : [
          errorAt(workflow, [...at, index], {
            problem: key.startsWith('target:')
              ? `unknown gate target '${key.slice(7)}'`
              : key === 'command:'
                ? 'an empty gate command'
                : `unknown gate key '${key}'`,
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

/** A `gate` runs something: `gates`, `checks` or both. */
const gateNeedsWork: Check = (workflow, step, _deps, path) =>
  step.kind === 'gate' &&
  step.gates === undefined &&
  step.with?.['gates'] === undefined &&
  step.with?.['checks'] === undefined
    ? [
        errorAt(workflow, path, {
          problem: 'a gate has neither gates nor checks',
          fix: "add 'with.gates' (registry keys) or 'with.checks'",
        }),
      ]
    : []

const CHECKS: readonly Check[] = [
  skillErrors,
  withErrors,
  reservedOutputs,
  gateErrors,
  gateNeedsWork,
  safetyErrors,
]

const LOOP_ONLY = ['until', 'max', 'on-max', 'steps'] as const

function loopOwnErrors(workflow: Workflow, step: Step, path: readonly string[]): WorkflowError[] {
  const errors: WorkflowError[] = []
  for (const key of LOOP_ONLY)
    if (step[key] === undefined)
      errors.push(errorAt(workflow, path, { problem: `missing key '${key}'`, fix: `add '${key}'` }))
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
  for (const key of ['skill', 'uses', 'with', 'gates', 'on-resume'] as const)
    if (step[key] !== undefined)
      errors.push(
        errorAt(workflow, [...path, key], {
          problem: `${key} is not allowed on a loop`,
          fix: `remove '${key}'`,
        }),
      )
  return errors
}

type CheckStep = (step: Step, path: readonly string[]) => WorkflowError[]

function loopChildErrors(
  workflow: Workflow,
  child: Step,
  childPath: readonly string[],
  checkStep: CheckStep,
): WorkflowError[] {
  const raw = Object.fromEntries(Object.entries(child).filter(([key]) => key !== 'id'))
  const errors = violations(expandedStepSchema, raw).map(found =>
    errorAt(workflow, [...childPath, ...found.path], found),
  )
  if (child.kind === 'loop')
    return [
      ...errors,
      errorAt(workflow, childPath, {
        problem: 'nested loop is not allowed',
        fix: 'move this loop outside the parent loop',
      }),
    ]
  if (child['on-failed'] !== undefined)
    errors.push(
      errorAt(workflow, [...childPath, 'on-failed'], {
        problem: 'on-failed is not allowed inside a loop',
        fix: 'remove it',
      }),
    )
  if (child['on-resume'] !== undefined)
    errors.push(
      errorAt(workflow, [...childPath, 'on-resume'], {
        problem: 'on-resume is not allowed inside a loop',
        fix: 'declare the route on a top-level step',
      }),
    )
  return [...errors, ...checkStep(child, childPath)]
}

interface Scope {
  readonly workflow: Workflow
  readonly deps: ValidationDeps
  readonly available: Set<string>
  /** Outputs only a step with `when` produces: it may be skipped, so no later step may need them. */
  readonly optional: Set<string>
}

function outputErrors(
  workflow: Workflow,
  output: string,
  path: readonly string[],
  earlier: ReadonlySet<string>,
): WorkflowError[] {
  const [id = '', name = ''] = output.split('.')
  const target = addressedSteps(workflow).find(one => one.id === id)
  const at = (problem: string, fix: string) => [
    errorAt(workflow, [...path, 'when', 'output'], { problem, fix }),
  ]
  if (!earlier.has(id) || target === undefined || target.kind === 'loop')
    return at(`'${id}' is not a step before this one`, 'name an earlier step')
  const declared = fieldsOf(kindByName[target.kind].outputs)
  return declared.includes(name)
    ? []
    : at(`step '${id}' has no output '${name}'`, `use one of ${declared.join(', ')}`)
}

/** Where `when.output` points: an earlier step (`id` or `loop/id`) and an output it declares. */
function whenErrors(
  { workflow }: Scope,
  step: Step,
  path: readonly string[],
  earlier: ReadonlySet<string>,
): WorkflowError[] {
  const { when } = step
  if (when === undefined) return []
  const at = (key: string, problem: string, fix: string) =>
    errorAt(workflow, [...path, 'when', key], { problem, fix })
  const errors: WorkflowError[] = []
  if ((when.output === undefined) !== (when.is === undefined))
    errors.push(
      at(
        when.output === undefined ? 'is' : 'output',
        "'output' and 'is' go together",
        "write both 'output' and 'is'",
      ),
    )
  if (when.output !== undefined) errors.push(...outputErrors(workflow, when.output, path, earlier))
  return errors
}

function plainStepErrors(
  scope: Scope,
  step: Step & { kind: KindName },
  path: readonly string[],
  earlier: ReadonlySet<string>,
): WorkflowError[] {
  const { workflow, deps, available, optional } = scope
  const kind = kindByName[step.kind]
  const misplaced = LOOP_ONLY.filter(key => step[key] !== undefined).map(key =>
    errorAt(workflow, [...path, key], {
      problem: `${key} is only allowed on a loop`,
      fix: `remove '${key}'`,
    }),
  )
  const unmet = (kind.inputs.required ?? [])
    .filter(input => !available.has(input))
    .map(input =>
      errorAt(workflow, path, {
        problem: optional.has(input)
          ? `input '${input}' is only produced by a step with 'when', which may be skipped`
          : `input '${input}' is neither a launch argument nor an output of an earlier step`,
        fix: optional.has(input)
          ? `remove 'when' from the step that returns '${input}'`
          : `put a step that returns '${input}' before it`,
      }),
    )
  fieldsOf(kind.outputs).forEach(output =>
    step.when === undefined ? available.add(output) : available.has(output) || optional.add(output),
  )
  return [
    ...misplaced,
    ...unmet,
    ...whenErrors(scope, step, path, earlier),
    ...CHECKS.flatMap(check => check(workflow, step, deps, path)),
  ]
}

function coherenceErrors(workflow: Workflow, deps: ValidationDeps): WorkflowError[] {
  const available = new Set(deps.launchInputs)
  const scope = { workflow, deps, available, optional: new Set<string>() }
  const seen = new Set<string>()
  const checkStep: CheckStep = (step, path) => {
    const id = path.filter((_, index) => index % 2 === 1).join('/')
    const earlier = new Set(seen)
    seen.add(id)
    if (step.kind !== 'loop')
      return plainStepErrors(scope, step as Step & { kind: KindName }, path, earlier)
    let exitInputs = new Set(available)
    const errors = [
      ...loopOwnErrors(workflow, step, path),
      ...(step.when === undefined
        ? []
        : [
            errorAt(workflow, [...path, 'when'], {
              problem: 'when is not allowed on a loop',
              fix: 'put when on a step inside it',
            }),
          ]),
      ...(step.steps ?? [])
        .filter(child => child.id === step.until && child.when !== undefined)
        .map(child =>
          errorAt(workflow, [...path, 'steps', child.id, 'when'], {
            problem: `when is not allowed on the until step '${child.id}'`,
            fix: 'remove it: the loop needs the until step to run',
          }),
        ),
      ...(step.steps ?? []).flatMap(child => {
        const found = loopChildErrors(workflow, child, [...path, 'steps', child.id], checkStep)
        if (child.id === step.until) exitInputs = new Set(available)
        return found
      }),
    ]
    available.clear()
    exitInputs.forEach(input => available.add(input))
    return errors
  }
  return workflow.steps.flatMap(step => checkStep(step, ['steps', step.id]))
}

function resumeRouteErrors(workflow: Workflow): WorkflowError[] {
  return workflow.steps.flatMap((step, index) => {
    const route = step['on-resume']
    if (route === undefined || workflow.steps.slice(0, index).some(one => one.id === route.step))
      return []
    return [
      errorAt(workflow, ['steps', step.id, 'on-resume', 'step'], {
        problem: `'${route.step}' is not an earlier top-level step`,
        fix: 'name an earlier step or loop',
      }),
    ]
  })
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

/** `merge` with no approval, review or head check before it: the engine blocks nothing, so say it. */
function mergeWarnings(workflow: Workflow): WorkflowError[] {
  const flat = addressedSteps(workflow).filter(step => step.kind !== 'loop')
  return flat.flatMap((step, index) => {
    if (step.kind !== 'merge') return []
    const before = flat.slice(0, index)
    const lastChange = before.reduce(
      (at, one, i) => (one.kind === 'implement' || one.kind === 'fix' ? i : at),
      -1,
    )
    const missing = [
      before.some(one => one.kind === 'approval') ? '' : 'approval step',
      lastChange >= 0 && !before.slice(lastChange).some(one => one.kind === 'review')
        ? 'review after the last code-changing step'
        : '',
      before.some(
        one =>
          one.kind === 'gate' &&
          (one.with?.['checks'] as string[] | undefined)?.includes('head-unchanged'),
      )
        ? ''
        : "gate with the 'head-unchanged' check",
    ].filter(Boolean)
    return missing.map(what =>
      errorAt(workflow, ['steps', step.id.split('/')[0] ?? step.id], {
        problem: `merge has no ${what}`,
        fix: `add a ${what} before the merge, or accept that it merges without`,
      }),
    )
  })
}

/**
 * The one validator: form (the grammar) then coherence (skills, inputs, options, gate keys).
 * `pair run <workflow>` calls it before any launch, and `--dry-run` calls nothing else.
 */
export function validate(text: string, file: string, deps: ValidationDeps): Validation {
  const parsed = deps.resolveWorkflow
    ? expand({ text, file }, deps.resolveWorkflow, deps.skillExists)
    : parseWorkflow(text, file)
  if (parsed.workflow === undefined) return { errors: parsed.errors, warnings: [] }
  const locate = (error: WorkflowError): WorkflowError => {
    if (!('origins' in parsed)) return error
    const path = error.key.split('.')
    while (path.length > 0) {
      const origin = parsed.origins[path.join('.')]
      if (origin) return { ...error, ...origin }
      path.pop()
    }
    return error
  }
  const errors = [
    ...coherenceErrors(parsed.workflow, deps),
    ...resumeRouteErrors(parsed.workflow),
  ].map(locate)
  return errors.length > 0
    ? { errors, warnings: [] }
    : {
        workflow: parsed.workflow,
        errors: [],
        warnings: [...warnings(parsed.workflow), ...mergeWarnings(parsed.workflow)].map(locate),
      }
}
