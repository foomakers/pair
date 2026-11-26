import { errorAt, parseWorkflow, type Step, type Workflow, type WorkflowError } from '../grammar'
import { kindByName } from '../kinds'

export interface WorkflowSource {
  readonly text: string
  readonly file: string
}

/** Freeze the validated expansion in the same format for every host. */
export function expandedWorkflowSource(workflow: Workflow, source: WorkflowSource): WorkflowSource {
  const expanded = workflow.steps.some(
    step => step.id.includes('/') || step.steps?.some(child => child.id.includes('/')),
  )
  if (!expanded) return source
  const entries = (steps: Workflow['steps']): Record<string, unknown> =>
    Object.fromEntries(
      steps.map(({ id, steps: children, ...step }) => [
        id,
        { ...step, ...(children && { steps: entries(children) }) },
      ]),
    )
  const { version, name, description, aliases, select, assign, steps } = workflow
  const text = JSON.stringify(
    { version, name, description, aliases, select, assign, steps: entries(steps) },
    null,
    2,
  )
  return { ...source, text: `${text}\n` }
}
export interface Expansion {
  readonly workflow?: Workflow
  readonly errors: readonly WorkflowError[]
  readonly origins: Readonly<Record<string, { readonly file: string; readonly line: number }>>
}

function recordOrigins(
  origins: Record<string, { file: string; line: number }>,
  workflow: Workflow,
  step: Step,
  id: string,
): void {
  origins[id] = {
    file: workflow.file,
    line: workflow.lines[JSON.stringify(['steps', step.id])] ?? 1,
  }
  for (const [key, line] of Object.entries(workflow.lines)) {
    const path = JSON.parse(key) as string[]
    if (path[0] === 'steps' && path[1] === step.id)
      origins[['steps', id, ...path.slice(2)].join('.')] = { file: workflow.file, line }
  }
}

type ExpansionState = {
  errors: WorkflowError[]
  origins: Record<string, { file: string; line: number }>
  outputSteps: Record<string, string>
  aliases: Record<string, NonNullable<Workflow['aliases']>[string]>
  resolve: (name: string) => WorkflowSource | undefined
  skillExists: (name: string) => boolean
}

type StepContext = { workflow: Workflow; step: Step; id: string }

function forwardOptions(context: StepContext, selected: Step, included: Workflow): Step[] {
  const { step, id } = context
  const assign = step.assign ?? included.assign
  return included.steps.map((child, index) => ({
    ...child,
    ...(child === selected && step.with && { with: { ...child.with, ...step.with } }),
    ...(index === included.steps.length - 1 &&
      step['on-failed'] && { 'on-failed': step['on-failed'] }),
    ...(child.assign === undefined &&
      assign !== undefined && {
        assign,
        'assign-source':
          step.assign === undefined
            ? (`workflows.${included.name}.assign` as const)
            : (`steps.${id}.assign` as const),
      }),
  }))
}

function compatibleOutput(step: Step, selected: Step): boolean {
  const callerKind = step.kind === 'loop' ? undefined : kindByName[step.kind]
  const outputKind = selected && selected.kind !== 'loop' ? kindByName[selected.kind] : undefined
  const required = callerKind?.outputs.required ?? []
  const compatible =
    outputKind && required.every(field => (outputKind.outputs.required ?? []).includes(field))
  return Boolean(
    (step.kind === 'generic' || compatible) && (!step.with || selected.kind === step.kind),
  )
}

function includeSteps(state: ExpansionState, context: StepContext, included: Workflow): Step[] {
  const { workflow, step, id } = context
  const outputId = included.outputs && `${id}/${included.outputs.from}`
  const selected = outputId
    ? included.steps.find(candidate => candidate.id === (state.outputSteps[outputId] ?? outputId))
    : included.steps.at(-1)
  if (!selected || !compatibleOutput(step, selected)) {
    state.errors.push(
      errorAt(workflow, ['steps', step.id], {
        problem: 'include output is missing or incompatible with the caller',
        fix: 'select a compatible output step and use matching kinds for with',
      }),
    )
    return []
  }
  state.outputSteps[id] = selected.id
  return forwardOptions(context, selected, included)
}

function expandLoop(state: ExpansionState, context: StepContext, chain: readonly string[]): Step {
  const { workflow, step, id } = context
  if (!step.steps) return { ...step, id }
  const children = step.steps.flatMap(child => {
    if (!child.uses || !state.resolve(child.uses))
      return [rebaseStep(child, `${id.slice(0, id.length - step.id.length)}${child.id}`)]
    const childState: ExpansionState = { ...state, origins: {} }
    const expanded = expandStep(
      childState,
      { workflow, step: child, id: `${id}/${child.id}` },
      chain,
    )
    for (const result of expanded) {
      const source = `steps.${result.id}`
      const localId = result.id.slice(id.length + 1)
      for (const [key, origin] of Object.entries(childState.origins)) {
        if (key === source || key.startsWith(`${source}.`))
          state.origins[`steps.${id}.steps.${localId}${key.slice(source.length)}`] = origin
      }
    }
    return expanded.map(result => ({ ...result, id: result.id.slice(id.length + 1) }))
  })
  const until = [...children]
    .reverse()
    .find(child => child.id === step.until || child.id.startsWith(`${step.until}/`))
  return { ...step, id, steps: children, ...(until && { until: until.id }) }
}

function rebaseStep(step: Step, id: string): Step {
  const prefix = id.slice(0, id.length - step.id.length)
  const route = step['on-resume']
  return {
    ...step,
    ...(step.when?.output &&
      prefix && { when: { ...step.when, output: `${prefix}${step.when.output}` } }),
    ...(route && prefix && { 'on-resume': { ...route, step: `${prefix}${route.step}` } }),
  }
}

const INCLUDE_FORBIDDEN_KEYS = [
  'interactive',
  'when',
  'gates',
  'state',
  'on-resume',
  'escalate',
  'timeout-minutes',
  'retries',
] as const

function expandStep(state: ExpansionState, context: StepContext, chain: readonly string[]): Step[] {
  const { workflow, step, id } = context
  const target = step.uses === undefined ? undefined : state.resolve(step.uses)
  if (!target) {
    recordOrigins(state.origins, workflow, step, id)
    return [expandLoop(state, { ...context, step: rebaseStep(step, id) }, chain)]
  }
  const unsupported = INCLUDE_FORBIDDEN_KEYS.find(key => step[key] !== undefined)
  if (unsupported) {
    state.errors.push(
      errorAt(workflow, ['steps', step.id, unsupported], {
        problem: `${unsupported} is not supported on an include`,
        fix: `move ${unsupported} into the included workflow`,
      }),
    )
    return []
  }
  if (step.uses && state.skillExists(step.uses)) {
    state.errors.push(
      errorAt(workflow, ['steps', step.id, 'uses'], {
        problem: `workflow and skill name clash: ${step.uses}`,
        fix: 'rename the workflow or skill',
      }),
    )
    return []
  }
  if (chain.includes(target.file) || chain.length >= 4) {
    state.errors.push(
      errorAt(workflow, ['steps', step.id, 'uses'], {
        problem: chain.includes(target.file)
          ? `circular include: ${[...chain, target.file].join(' -> ')}`
          : 'include depth exceeds 3',
        fix: 'remove the include cycle or reduce depth',
      }),
    )
    return []
  }
  const included = visit(state, target, `${id}/`, [...chain, target.file])
  return included ? includeSteps(state, context, included) : []
}

function visit(
  state: ExpansionState,
  input: WorkflowSource,
  prefix: string,
  chain: readonly string[],
): Workflow | undefined {
  const parsed = parseWorkflow(input.text, input.file)
  if (!parsed.workflow) {
    state.errors.push(...parsed.errors)
    return undefined
  }
  const workflow = parsed.workflow
  const names: Record<string, string> = {}
  for (const [name, entry] of Object.entries(workflow.aliases ?? {})) {
    let scoped = prefix
      ? `include-${Array.from(prefix + name, c => c.charCodeAt(0).toString(16)).join('-')}`
      : name
    while (Object.hasOwn(state.aliases, scoped)) scoped += '-x'
    names[name] = scoped
    state.aliases[scoped] = entry
  }
  const scope = (step: Step): Step => ({
    ...step,
    ...(step.alias && { alias: names[step.alias] ?? step.alias }),
    ...(step.steps && { steps: step.steps.map(scope) }),
  })
  return {
    ...workflow,
    steps: workflow.steps
      .map(scope)
      .flatMap(step => expandStep(state, { workflow, step, id: `${prefix}${step.id}` }, chain)),
  }
}

/** Replace includes in source order, retaining the location of each resulting step. */
export function expand(
  source: WorkflowSource,
  resolve: (name: string) => WorkflowSource | undefined,
  skillExists: (name: string) => boolean = () => false,
): Expansion {
  const state: ExpansionState = {
    errors: [],
    origins: {},
    outputSteps: {},
    aliases: {},
    resolve,
    skillExists,
  }
  const workflow = visit(state, source, '', [source.file])
  const bind = (step: Step): Step => {
    const output = step.when?.output
    const dot = output?.lastIndexOf('.') ?? -1
    const producer = dot < 0 ? undefined : output?.slice(0, dot)
    const selected = producer && state.outputSteps[producer]
    return {
      ...step,
      ...(selected && { when: { ...step.when, output: `${selected}${output?.slice(dot)}` } }),
      ...(step.steps && { steps: step.steps.map(bind) }),
    }
  }
  return {
    ...(workflow &&
      state.errors.length === 0 && {
        workflow: { ...workflow, steps: workflow.steps.map(bind), aliases: state.aliases },
      }),
    errors: state.errors,
    origins: state.origins,
  }
}
