import { errorAt, parseWorkflow, type Step, type Workflow, type WorkflowError } from '../grammar'

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

/** Replace includes in source order, retaining the location of each resulting step. */
export function expand(
  source: WorkflowSource,
  resolve: (name: string) => WorkflowSource | undefined,
): Expansion {
  const errors: WorkflowError[] = []
  const origins: Record<string, { file: string; line: number }> = {}
  function visit(
    input: WorkflowSource,
    prefix: string,
    chain: readonly string[],
  ): Workflow | undefined {
    const parsed = parseWorkflow(input.text, input.file)
    if (!parsed.workflow) {
      errors.push(...parsed.errors)
      return undefined
    }
    const workflow = parsed.workflow
    const steps: Step[] = []
    for (const step of workflow.steps) {
      const id = `${prefix}${step.id}`
      const target = step.uses === undefined ? undefined : resolve(step.uses)
      if (target) {
        if (chain.includes(target.file) || chain.length >= 4) {
          errors.push(
            errorAt(workflow, ['steps', step.id, 'uses'], {
              problem: chain.includes(target.file)
                ? `circular include: ${[...chain, target.file].join(' -> ')}`
                : 'include depth exceeds 3',
              fix: 'remove the include cycle or reduce depth',
            }),
          )
          continue
        }
        const included = visit(target, `${id}/`, [...chain, target.file])
        if (included) steps.push(...included.steps)
      } else {
        steps.push({ ...step, id })
        recordOrigins(origins, workflow, step, id)
      }
    }
    return { ...workflow, steps }
  }
  const workflow = visit(source, '', [source.file])
  return { ...(workflow && errors.length === 0 && { workflow }), errors, origins }
}
