import { errorAt, parseWorkflow, type Step, type Workflow, type WorkflowError } from '../grammar'
import { kindByName } from '../kinds'

export interface WorkflowSource {
  readonly text: string
  readonly file: string
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

function forwardOptions(step: Step, selected: Step, steps: readonly Step[]): Step[] {
  return steps.map((child, index) => ({
    ...child,
    ...(child === selected && step.with && { with: { ...child.with, ...step.with } }),
    ...(index === steps.length - 1 && step['on-failed'] && { 'on-failed': step['on-failed'] }),
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
  return forwardOptions(step, selected, included.steps)
}

function expandLoop(state: ExpansionState, context: StepContext, chain: readonly string[]): Step {
  const { workflow, step, id } = context
  if (!step.steps) return { ...step, id }
  const children = step.steps.flatMap(child => {
    if (!child.uses || !state.resolve(child.uses))
      return [rebaseStep(child, `${id.slice(0, id.length - step.id.length)}${child.id}`)]
    const childState: ExpansionState = { ...state, origins: {} }
    const expanded = expandStep(childState, { workflow, step: child, id: child.id }, chain)
    for (const result of expanded) {
      const source = `steps.${result.id}`
      for (const [key, origin] of Object.entries(childState.origins)) {
        if (key === source || key.startsWith(`${source}.`))
          state.origins[`steps.${id}.steps.${result.id}${key.slice(source.length)}`] = origin
      }
    }
    return expanded
  })
  const until = [...children]
    .reverse()
    .find(child => child.id === step.until || child.id.startsWith(`${step.until}/`))
  return { ...step, id, steps: children, ...(until && { until: until.id }) }
}

function rebaseStep(step: Step, id: string): Step {
  const prefix = id.slice(0, id.length - step.id.length)
  return step.when?.output && prefix
    ? { ...step, when: { ...step.when, output: `${prefix}${step.when.output}` } }
    : step
}

function expandStep(state: ExpansionState, context: StepContext, chain: readonly string[]): Step[] {
  const { workflow, step, id } = context
  const target = step.uses === undefined ? undefined : state.resolve(step.uses)
  if (!target) {
    recordOrigins(state.origins, workflow, step, id)
    return [expandLoop(state, { ...context, step: rebaseStep(step, id) }, chain)]
  }
  const unsupported = (['when', 'gates', 'state'] as const).find(key => step[key] !== undefined)
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
