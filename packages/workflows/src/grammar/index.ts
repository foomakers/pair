import { basename, extname } from 'node:path'
import { isAlias, isMap, isNode, isScalar, isSeq, LineCounter, parseDocument, visit } from 'yaml'
import { violations, type JsonSchema, type Path } from '../schema'

/** The step kinds of grammar v1. A kind's contract lives in `kinds/`. */
export const KIND_NAMES = ['implement', 'review', 'generic'] as const
export type KindName = (typeof KIND_NAMES)[number]

/** A step id names a directory of the run and a row of the output: lower-case, digits and hyphens. */
export const STEP_ID = '^[a-z][a-z0-9-]*$'
/** A skill name, as the registries install it. */
export const SKILL_NAME = '^[a-z0-9][a-z0-9:._-]*$'

const stepSchema: JsonSchema = {
  type: 'object',
  required: ['kind'],
  additionalProperties: false,
  properties: {
    kind: { enum: KIND_NAMES, description: 'What the step does and what it returns.' },
    uses: {
      type: 'string',
      pattern: SKILL_NAME,
      description: 'The skill that runs. Optional for a typed kind, required for `generic`.',
    },
    with: { type: 'object', description: 'Options of the step; the kind declares the keys.' },
  },
}

/** Grammar v1 as JSON Schema. Execution order is the order of `steps` in the file. */
export const workflowSchemaV1: JsonSchema = {
  type: 'object',
  required: ['version', 'name', 'steps'],
  additionalProperties: false,
  properties: {
    version: { const: 1, description: 'The grammar version.' },
    name: { type: 'string', description: 'Equals the file name without its extension.' },
    description: { type: 'string' },
    steps: {
      type: 'object',
      minProperties: 1,
      propertyNames: { pattern: STEP_ID },
      additionalProperties: stepSchema,
      description: 'The steps, by id.',
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
  readonly kind: KindName
  readonly uses?: string
  readonly with?: Readonly<Record<string, unknown>>
}

export interface Workflow {
  readonly version: 1
  readonly name: string
  readonly description?: string
  /** In file order: the execution order. */
  readonly steps: readonly Step[]
  readonly file: string
  /** Line of every key and list item, by JSON-encoded path. Read through `errorAt`. */
  readonly lines: Readonly<Record<string, number>>
}

export type ParsedWorkflow =
  | { readonly workflow: Workflow; readonly errors: readonly [] }
  | { readonly workflow?: undefined; readonly errors: readonly WorkflowError[] }

export const formatError = (error: WorkflowError): string =>
  `${error.file}:${String(error.line)}: ${error.key === '' ? '' : `${error.key}: `}${error.problem} — fix: ${error.fix}`

type Lines = Readonly<Record<string, number>>

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

function nameError(value: { name?: unknown } | null, file: string, lines: Lines): WorkflowError[] {
  const expected = basename(file, extname(file))
  if (typeof value?.name !== 'string' || value.name === expected) return []
  return [
    errorAt({ file, lines }, ['name'], {
      problem: `name '${value.name}' differs from the file name '${expected}'`,
      fix: `write name: ${expected}`,
    }),
  ]
}

type RawStep = Omit<Step, 'id'>

/** Parses one workflow file: a typed `Workflow`, or every error found, each with file, line, key and fix. */
export function parseWorkflow(text: string, file: string): ParsedWorkflow {
  const counter = new LineCounter()
  const doc = parseDocument(text, { version: '1.2', lineCounter: counter, merge: false })
  const syntax = syntaxErrors(doc, file, counter)
  if (syntax.length > 0) return { errors: syntax }

  const value = doc.toJS() as Omit<Workflow, 'steps' | 'file' | 'lines'> & {
    steps: Record<string, RawStep>
  }
  const lines = collectLines(doc.contents, [], counter)
  const errors = [
    ...violations(workflowSchemaV1, value).map(found => errorAt({ file, lines }, found.path, found)),
    ...nameError(value, file, lines),
  ]
  if (errors.length > 0) return { errors }

  const steps = Object.entries(value.steps).map(([id, step]) => ({ id, ...step }))
  return { workflow: { ...value, steps, file, lines }, errors: [] }
}
