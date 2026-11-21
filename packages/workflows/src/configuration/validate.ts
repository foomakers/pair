import { errorAt, type Lines, type Step, type Workflow, type WorkflowError } from '../grammar'
import type { Configuration, Entry } from './schema'
import { settingsFor } from './settings'

/** What the host knows about its engines; the package holds no engine table. */
export interface EngineFacts {
  known(engine: string): boolean
  installed(engine: string): boolean
  /** The models the engine declares; `undefined`: it declares no list. */
  models(engine: string): readonly string[] | undefined
  supportsEffort(engine: string): boolean
}

export interface ConfigurationCheck {
  readonly errors: readonly WorkflowError[]
  readonly warnings: readonly WorkflowError[]
}

export interface CheckContext {
  readonly file: string
  readonly lines?: Lines
  readonly facts: EngineFacts
  /** The steps of the running workflow; absent: only what the file says is checked. */
  readonly steps?: readonly Pick<Step, 'id' | 'alias'>[]
  /** The aliases the running workflow declares, with its defaults. */
  readonly aliases?: Workflow['aliases']
  /** `--engine`, when passed. */
  readonly engineFlag?: string | undefined
}

const EFFORT_FORM = /^[a-z][a-z-]*$/
const MODEL_FORM = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/

type Path = (string | number)[]
type Issue = (path: Path, problem: string, fix: string) => WorkflowError
interface Found {
  readonly errors: WorkflowError[]
  readonly warnings: WorkflowError[]
}

interface Ctx {
  readonly facts: EngineFacts
  readonly at: Issue
}

/** What is wrong with `model` on `engine`, as an error or a warning. */
function modelIssue(model: string, engine: string, facts: EngineFacts) {
  const list = facts.models(engine)
  if (list === undefined)
    return MODEL_FORM.test(model)
      ? {
          level: 'warnings' as const,
          problem: `${engine} declares no model list: '${model}' is not checked`,
          fix: 'none needed',
        }
      : {
          level: 'errors' as const,
          problem: `'${model}' is not a model id`,
          fix: 'write the real model id',
        }
  return list.includes(model)
    ? undefined
    : {
        level: 'errors' as const,
        problem: `model '${model}' is not one ${engine} declares`,
        fix: `use one of ${list.join(', ')}`,
      }
}

/** The model and effort of one entry, against what its engine declares. */
function checkEntry(path: Path, entry: Entry, engine: string, { facts, at }: Ctx): Found {
  const found: Found = { errors: [], warnings: [] }
  if (!facts.known(engine)) {
    found.errors.push(
      at([...path, 'engine'], `unknown engine '${engine}'`, 'use an engine this CLI supports'),
    )
    return found
  }
  const issue = entry.model === undefined ? undefined : modelIssue(entry.model, engine, facts)
  if (issue) found[issue.level].push(at([...path, 'model'], issue.problem, issue.fix))
  if (entry.effort !== undefined && !EFFORT_FORM.test(entry.effort))
    found.errors.push(
      at(
        [...path, 'effort'],
        `'${entry.effort}' is not an effort level`,
        'use a word like low, medium, high',
      ),
    )
  else if (entry.effort !== undefined && !facts.supportsEffort(engine))
    found.warnings.push(
      at([...path, 'effort'], `${engine} has no effort flag: the value is ignored`, 'remove it'),
    )
  return found
}

/** Every entry of the file with the engine it resolves to. */
function entriesOf(c: Configuration, { steps, aliases }: CheckContext): [Path, Entry, string][] {
  const { defaults } = c
  return [
    [['defaults'], defaults, defaults.engine],
    ...Object.entries(c.aliases ?? {}).map(([alias, e]): [Path, Entry, string] => [
      ['aliases', alias],
      e,
      settingsFor(c, { id: '', alias }, aliases).engine,
    ]),
    ...Object.entries(c.steps ?? {}).map(([id, e]): [Path, Entry, string] => [
      ['steps', id],
      e,
      settingsFor(c, steps?.find(s => s.id === id) ?? { id }, aliases).engine,
    ]),
  ]
}

/** What the workflow adds: an unknown step id warns; an undeclared alias and an engine used and not installed refuse. */
function checkWorkflow(
  c: Configuration,
  steps: NonNullable<CheckContext['steps']>,
  aliases: CheckContext['aliases'],
  { facts, at }: Ctx,
): Found {
  const ids = new Set(steps.map(s => s.id))
  const warnings = Object.keys(c.steps ?? {})
    .filter(id => !ids.has(id))
    .map(id =>
      at(
        ['steps', id],
        `no step '${id}' in the running workflow`,
        'remove it, or ignore if another workflow uses it',
      ),
    )
  const undeclared = Object.keys(c.aliases ?? {})
    .filter(alias => !Object.hasOwn(aliases ?? {}, alias))
    .map(alias =>
      at(
        ['aliases', alias],
        `alias '${alias}' is not one the workflow declares`,
        "remove it, or declare it in the workflow's aliases",
      ),
    )
  const used = new Set(steps.map(s => settingsFor(c, s, aliases).engine))
  const notInstalled = [...used]
    .filter(engine => facts.known(engine) && !facts.installed(engine))
    .map(engine =>
      at(
        ['defaults', 'engine'],
        `engine '${engine}' is not installed`,
        `install ${engine}, or choose another configuration`,
      ),
    )
  return { errors: [...undeclared, ...notInstalled], warnings }
}

/** The checks of design §5 that need the engines. A file that parsed has the right shape already. */
export function checkAgainstEngines(c: Configuration, context: CheckContext): ConfigurationCheck {
  const { steps, engineFlag } = context
  const at: Issue = (path, problem, fix) =>
    errorAt({ file: context.file, lines: context.lines ?? {} }, path, { problem, fix })
  const ctx = { facts: context.facts, at }
  const found = [
    ...entriesOf(c, context).map(([path, entry, engine]) => checkEntry(path, entry, engine, ctx)),
    steps === undefined
      ? { errors: [], warnings: [] }
      : checkWorkflow(c, steps, context.aliases, ctx),
  ]
  const flagged =
    engineFlag !== undefined && c.defaults.engine !== engineFlag
      ? [
          at(
            ['defaults', 'engine'],
            `defaults.engine is '${c.defaults.engine}' but --engine is '${engineFlag}'`,
            `pass --engine ${c.defaults.engine}, or choose a ${engineFlag} configuration`,
          ),
        ]
      : []
  return {
    errors: [...found.flatMap(f => f.errors), ...flagged],
    warnings: found.flatMap(f => f.warnings),
  }
}
