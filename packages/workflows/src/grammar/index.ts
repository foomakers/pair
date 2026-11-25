import { basename, extname } from 'node:path'
import { isAlias, isMap, isNode, isScalar, isSeq, LineCounter, parseDocument, visit } from 'yaml'
import { ORDER_KEYS, type CardSelection } from '../select'
import { violations, type JsonSchema, type Path } from '../schema'

/** The step kinds of grammar v1. A kind's contract lives in `kinds/`. */
export const KIND_NAMES = [
  'implement',
  'review',
  'fix',
  'generic',
  'gate',
  'approval',
  'merge',
  'refine-story',
  'plan-tasks',
] as const
export type KindName = (typeof KIND_NAMES)[number]
/** The macrostates of a card, as the adopted state mapping names them. */
export const CARD_STATES = ['Draft', 'Ready', 'In Progress', 'Review', 'Done'] as const
export type CardState = (typeof CARD_STATES)[number]

const isRefinement = (kind: KindName | 'loop') => kind === 'refine-story' || kind === 'plan-tasks'

/** The card state a step sets, and when: Ready and Done as the step ends `ok`, the others as it starts. */
export function cardStateOf(step: {
  readonly kind: KindName | 'loop'
  readonly state?: CardState | 'none'
}): { readonly state: CardState; readonly when: 'start' | 'end' } | undefined {
  // A loop has no kind of its own: its inner steps set the state.
  const defaults: Partial<Record<KindName | 'loop', CardState>> = {
    implement: 'In Progress',
    fix: 'In Progress',
    review: 'Review',
    merge: 'Done',
    'refine-story': 'Ready',
    'plan-tasks': 'Ready',
  }
  const state = step.state ?? defaults[step.kind]
  return state === undefined || state === 'none'
    ? undefined
    : {
        state,
        when: isRefinement(step.kind) || state === 'Ready' || state === 'Done' ? 'end' : 'start',
      }
}

/** The board transition that must be confirmed before the step can record success. */
export function cardStateToConfirm(step: Parameters<typeof cardStateOf>[0]): CardState | undefined {
  const state = cardStateOf(step)?.state
  return state === 'Ready' || isRefinement(step.kind) ? state : undefined
}

/** A step id names a directory of the run and a row of the output: lower-case, digits and hyphens. */
export const STEP_ID = '^[a-z][a-z0-9-]*$'
/** A skill name, as the registries install it. */
export const SKILL_NAME = '^[a-z0-9][a-z0-9:._-]*$'

/** Engine, model and effort of a step; each is resolved on its own. */
export interface Entry {
  readonly engine?: string
  readonly model?: string
  readonly effort?: string
}

const text = { type: 'string' } as const
export const entrySchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { engine: text, model: text, effort: text },
}

/** The card facts a `when` reads, same form as `select.filter`; or the output of an earlier step. */
export interface When {
  readonly has?: readonly string[]
  readonly lacks?: readonly string[]
  readonly status?: readonly string[]
  readonly assignee?: readonly string[]
  /** `<step>.<name>`: an output of an earlier step, matched against `is`. */
  readonly output?: string
  readonly is?: readonly unknown[]
}

/** `<step>.<name>` or `<loop>/<step>.<name>`. */
const OUTPUT_REF = '^[a-z][a-z0-9-]*(/[a-z][a-z0-9-]*)?\\.[A-Za-z][A-Za-z0-9]*$'
const names = { type: 'array', items: text } as const
export const selectSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    filter: {
      type: 'object',
      additionalProperties: false,
      properties: {
        has: names,
        lacks: names,
        status: { ...names, items: { enum: CARD_STATES } },
        assignee: text,
      },
    },
    order: { type: 'array', items: { enum: ORDER_KEYS } },
  },
}

const reason = { type: 'string', pattern: '\\S' } as const
export const whenSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    has: names,
    lacks: names,
    status: names,
    assignee: names,
    output: { type: 'string', pattern: OUTPUT_REF },
    is: { type: 'array' },
  },
}

export const stepSchema: JsonSchema = {
  type: 'object',
  required: ['kind'],
  additionalProperties: false,
  properties: {
    kind: { enum: [...KIND_NAMES, 'loop'], description: 'What the step does and what it returns.' },
    skill: {
      type: 'string',
      pattern: SKILL_NAME,
      description: 'The skill that runs. Optional for a typed kind, required for `generic`.',
    },
    when: {
      ...whenSchema,
      description:
        'Runs the step only when the card matches (`has`, `lacks`, `status`, `assignee`; AND between keys, any-of inside a list), or when `output` of an earlier step is one of `is`. Else the step is `skipped`.',
    },
    uses: {
      type: 'string',
      description: 'Reserved for including a workflow (#699); never a skill name.',
    },
    with: { type: 'object', description: 'Options of the step; the kind declares the keys.' },
    gates: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Optional validation the host runs after the step ends `ok`: a registry key, `target:<name>` or `command:<shell line>`. A red one fails the step. Absent = none.',
    },
    'on-failed': {
      enum: ['stop', 'continue'],
      description:
        'What a `failed` step does to the run. `stop` (default) stops it; `continue` records the failure and runs the next step.',
    },
    'on-resume': {
      type: 'object',
      required: ['reason', 'step'],
      additionalProperties: false,
      properties: { reason, step: { type: 'string', pattern: STEP_ID } },
      description:
        'On resume after this step failed with the given reason, refresh the linked PR head and replay from the named earlier step.',
    },
    alias: { type: 'string', description: 'The alias, declared in `aliases`, the step runs with.' },
    state: {
      enum: [...CARD_STATES, 'none'],
      description:
        "The card's board state the host sets for the step (a macrostate), or `none`; overrides the kind's default.",
    },
    until: { type: 'string', pattern: STEP_ID },
    max: { type: 'integer', minimum: 1 },
    'on-max': { enum: ['escalate', 'fail'] },
    steps: {
      type: 'object',
      minProperties: 1,
      propertyNames: { pattern: STEP_ID },
      additionalProperties: {},
    },
  },
}

const WORKFLOW_OUTPUT_PROPERTIES = { from: { type: 'string', pattern: STEP_ID } } as const

/** Grammar v1 as JSON Schema. Execution order is the order of `steps` in the file. */
export const workflowSchemaV1: JsonSchema = {
  type: 'object',
  required: ['version', 'name', 'steps'],
  additionalProperties: false,
  properties: {
    version: { const: 1, description: 'The grammar version.' },
    name: { type: 'string', description: 'Equals the file name without its extension.' },
    select: selectSchema,
    description: { type: 'string' },
    outputs: {
      type: 'object',
      required: Object.keys(WORKFLOW_OUTPUT_PROPERTIES),
      additionalProperties: false,
      properties: WORKFLOW_OUTPUT_PROPERTIES,
    },
    aliases: {
      type: 'object',
      propertyNames: { pattern: STEP_ID },
      additionalProperties: entrySchema,
      description: 'The aliases the steps cite, each with its default engine, model and effort.',
    },
    steps: {
      type: 'object',
      minProperties: 1,
      propertyNames: { pattern: STEP_ID },
      additionalProperties: stepSchema,
      description: 'The steps, by id.',
    },
  },
}

const expandedId = `${STEP_ID.slice(0, -1)}(/[a-z][a-z0-9-]*)*$`
export const expandedStepSchema: JsonSchema = {
  ...stepSchema,
  properties: {
    ...stepSchema.properties,
    when: {
      ...whenSchema,
      properties: {
        ...whenSchema.properties,
        output: { type: 'string', pattern: `${expandedId.slice(0, -1)}\\.[A-Za-z][A-Za-z0-9]*$` },
      },
    },
    'on-resume': {
      ...stepSchema.properties?.['on-resume'],
      properties: { reason, step: { type: 'string', pattern: expandedId } },
    },
    until: { type: 'string', pattern: expandedId },
    steps: { ...stepSchema.properties?.['steps'], propertyNames: { pattern: expandedId } },
  },
}

const expandedWorkflowSchema: JsonSchema = {
  ...workflowSchemaV1,
  properties: {
    ...workflowSchemaV1.properties,
    steps: {
      ...workflowSchemaV1.properties?.['steps'],
      propertyNames: { pattern: expandedId },
      additionalProperties: expandedStepSchema,
    },
  },
}

/** A refusal: where in which file, what is wrong, and what to write instead. */
export interface WorkflowError {
  readonly file: string
  readonly line: number
  /** The dotted key the error is about; empty for a whole-document error. */
  readonly key: string
  readonly problem: string
  readonly fix: string
}

export interface Step {
  readonly id: string
  readonly kind: KindName | 'loop'
  readonly skill?: string
  /** Reserved for including a workflow (#699); the validator refuses it as a skill name. */
  readonly uses?: string
  readonly with?: Readonly<Record<string, unknown>>
  /** Validation the host runs after the step ends `ok`. */
  readonly gates?: readonly string[]
  readonly when?: When
  readonly 'on-failed'?: 'stop' | 'continue'
  readonly 'on-resume'?: { readonly reason: string; readonly step: string }
  /** One of the workflow's `aliases`: what a configuration sets for the step. */
  readonly alias?: string
  /** The card's board state the host sets for the step; `none` sets nothing. */
  readonly state?: CardState | 'none'
  readonly until?: string
  readonly max?: number
  readonly 'on-max'?: 'escalate' | 'fail'
  readonly steps?: readonly Step[]
}

export interface Workflow {
  readonly version: 1
  readonly name: string
  readonly select?: CardSelection
  readonly description?: string
  readonly outputs?: { readonly from: string }
  /** The declared aliases, each with its defaults. */
  readonly aliases?: Readonly<Record<string, Entry>>
  /** In file order: the execution order. */
  readonly steps: readonly Step[]
  readonly file: string
  /** Line of every key and list item, by JSON-encoded path. Read through `errorAt`. */
  readonly lines: Readonly<Record<string, number>>
}

/** Loop children have run-wide ids; the loop itself stays addressable for configuration. */
export const addressedSteps = (workflow: Workflow): readonly Step[] =>
  workflow.steps.flatMap(step => [
    step,
    ...(step.steps ?? []).map(child => ({ ...child, id: `${step.id}/${child.id}` })),
  ])

export type ParsedWorkflow =
  | { readonly workflow: Workflow; readonly errors: readonly [] }
  | { readonly workflow?: undefined; readonly errors: readonly WorkflowError[] }

export const formatError = (error: WorkflowError): string =>
  `${error.file}:${String(error.line)}: ${error.key === '' ? '' : `${error.key}: `}${error.problem} — fix: ${error.fix}`

export type Lines = Readonly<Record<string, number>>

/** The line of `path`, or of its nearest ancestor present in the file. */
function lineAt(lines: Lines, path: Path): number {
  for (let length = path.length; length > 0; length--) {
    const line = lines[JSON.stringify(path.slice(0, length))]
    if (line !== undefined) return line
  }
  return 1
}

/** A positioned error about `path` of `workflow`'s file. */
export function errorAt(
  source: Pick<Workflow, 'file' | 'lines'>,
  path: Path,
  message: { readonly problem: string; readonly fix: string },
): WorkflowError {
  const { problem, fix } = message
  return { file: source.file, line: lineAt(source.lines, path), key: path.join('.'), problem, fix }
}

function collectLines(node: unknown, path: Path, counter: LineCounter): Record<string, number> {
  const at = (child: unknown): number =>
    isNode(child) && child.range ? counter.linePos(child.range[0]).line : 1
  if (isMap(node))
    return Object.assign(
      {},
      ...node.items.map(pair => {
        const here = [...path, String(isScalar(pair.key) ? pair.key.value : pair.key)]
        return { [JSON.stringify(here)]: at(pair.key), ...collectLines(pair.value, here, counter) }
      }),
    ) as Record<string, number>
  if (isSeq(node))
    return Object.assign(
      {},
      ...node.items.map((item, index) => ({
        [JSON.stringify([...path, index])]: at(item),
        ...collectLines(item, [...path, index], counter),
      })),
    ) as Record<string, number>
  return {}
}

const SYNTAX_FIX: Readonly<Record<string, string>> = {
  DUPLICATE_KEY: 'remove or rename the second key',
  MULTIPLE_DOCS: 'keep one document per file',
}

/** YAML 1.2 only, declarative only: a syntax error, a duplicate key, an anchor, an alias or a tag refuses the file. */
function syntaxErrors(
  doc: ReturnType<typeof parseDocument>,
  file: string,
  counter: LineCounter,
): WorkflowError[] {
  const errors: WorkflowError[] = doc.errors.map(error => ({
    file,
    line: error.linePos?.[0].line ?? 1,
    key: '',
    problem: (error.message.split('\n')[0] ?? '').replace(/ at line \d+, column \d+:?$/, ''),
    fix: SYNTAX_FIX[error.code] ?? 'correct the YAML syntax',
  }))
  const refuse = (offset: number, problem: string) =>
    errors.push({
      file,
      line: counter.linePos(offset).line,
      key: '',
      problem,
      fix: 'write the value in full, as plain YAML',
    })
  visit(doc, {
    Node(_key, node) {
      const start = node.range?.[0] ?? 0
      if (isAlias(node)) refuse(start, `alias *${node.source} is not allowed`)
      else if (node.anchor !== undefined) refuse(start, `anchor &${node.anchor} is not allowed`)
      else if (node.tag !== undefined) refuse(start, `tag ${node.tag} is not allowed`)
    },
  })
  return errors
}

export function nameError(
  value: { name?: unknown } | null,
  file: string,
  lines: Lines,
): WorkflowError[] {
  const expected = basename(file, extname(file))
  if (typeof value?.name !== 'string' || value.name === expected) return []
  return [
    errorAt({ file, lines }, ['name'], {
      problem: `name '${value.name}' differs from the file name '${expected}'`,
      fix: `write name: ${expected}`,
    }),
  ]
}

type RawStep = Omit<Step, 'id' | 'steps'> & { steps?: Record<string, RawStep> }

const parseStep = ([id, raw]: [string, RawStep]): Step => {
  const { steps, ...rest } = raw
  return {
    ...rest,
    id,
    ...(steps !== undefined && { steps: Object.entries(steps).map(parseStep) }),
  }
}

/** A YAML source read under the package's strict rules: its value and the line of every key, or the syntax errors. */
export type StrictSource =
  | { readonly value: unknown; readonly lines: Lines; readonly errors: readonly [] }
  | {
      readonly value?: undefined
      readonly lines?: undefined
      readonly errors: readonly WorkflowError[]
    }

/** YAML 1.2, no anchors, tags or duplicate keys: the one reading every file of the package shares. */
export function parseStrict(text: string, file: string): StrictSource {
  const counter = new LineCounter()
  const doc = parseDocument(text, { version: '1.2', lineCounter: counter, merge: false })
  const syntax = syntaxErrors(doc, file, counter)
  if (syntax.length > 0) return { errors: syntax }
  return { value: doc.toJS(), lines: collectLines(doc.contents, [], counter), errors: [] }
}

/** Parses one workflow file: a typed `Workflow`, or every error found, each with file, line, key and fix. */
export function parseWorkflow(text: string, file: string, expanded = false): ParsedWorkflow {
  const source = parseStrict(text, file)
  if (source.lines === undefined) return { errors: source.errors }
  const { lines } = source
  const value = source.value as Omit<Workflow, 'steps' | 'file' | 'lines'> & {
    steps: Record<string, RawStep>
  }
  const errors = [
    ...violations(expanded ? expandedWorkflowSchema : workflowSchemaV1, value).map(found =>
      errorAt({ file, lines }, found.path, found),
    ),
    ...nameError(value, file, lines),
    ...Object.entries(value?.steps ?? {}).flatMap(([id, step]) =>
      Object.entries(step?.steps ?? {}).flatMap(([childId, child]) =>
        violations(expanded ? expandedStepSchema : stepSchema, child).map(found =>
          errorAt({ file, lines }, ['steps', id, 'steps', childId, ...found.path], found),
        ),
      ),
    ),
  ]
  if (errors.length > 0) return { errors }
  const undeclared = Object.entries(value.steps)
    .flatMap(([id, step]) => [
      [['steps', id], step] as const,
      ...Object.entries(step.steps ?? {}).map(
        ([childId, child]) => [['steps', id, 'steps', childId], child] as const,
      ),
    ])
    .filter(
      ([, step]) => step.alias !== undefined && !Object.hasOwn(value.aliases ?? {}, step.alias),
    )
    .map(([path, step]) =>
      errorAt({ file, lines }, [...path, 'alias'], {
        problem: `alias '${String(step.alias)}' is not declared in aliases`,
        fix: `declare ${String(step.alias)} under aliases, or cite a declared alias`,
      }),
    )
  if (undeclared.length > 0) return { errors: undeclared }

  const steps = Object.entries(value.steps).map(parseStep)
  return { workflow: { ...value, steps, file, lines }, errors: [] }
}
