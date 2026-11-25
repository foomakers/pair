import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { kinds, schemas } from '../describe'
import { diagnosticMain, sessionMain } from '../worktree/session'
import { nextSession, openSession, recordSession, sessionRun, stopSession } from './session'
import { workflowDefinition, workflowList, type Project } from './session-project'
import { validateWorkflow } from './workflow-diagnostics'

const diagnostics = {
  list: { count: 0, flags: [] },
  expand: { count: 1, flags: [] },
  validate: { count: 1, flags: ['engine', 'config'] },
}

const commands = {
  schema: { count: 0, flags: [] },
  kinds: { count: 0, flags: [] },
  ...diagnostics,
  start: { count: 1, flags: ['card', 'engine', 'config'] },
  resume: { count: 1, flags: ['engine'] },
  next: { count: 1, flags: ['lease', 'answer'] },
  record: { count: 2, flags: ['lease', 'result', 'model', 'attempt'] },
  stop: { count: 1, flags: ['lease'] },
}

const options = {
  card: { type: 'string' },
  engine: { type: 'string' },
  config: { type: 'string' },
  lease: { type: 'string' },
  answer: { type: 'string' },
  result: { type: 'string' },
  model: { type: 'string' },
  attempt: { type: 'string' },
} as const

type Command = keyof typeof commands
const isCommand = (value: string): value is Command => Object.hasOwn(commands, value)
const isDiagnostic = (command: Command): command is keyof typeof diagnostics =>
  Object.hasOwn(diagnostics, command)

function required(flag: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') throw new Error(`--${flag} is required`)
  return value
}

function attemptNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const attempt = Number(value)
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(attempt))
    throw new Error('--attempt must be a positive integer')
  return attempt
}

function operate(
  command: 'next' | 'record' | 'stop',
  project: Project,
  [target = '', step = '']: string[],
  values: Partial<Record<keyof typeof options, string>>,
) {
  const run = sessionRun(project.main, target)
  const lease = required('lease', values.lease)
  if (command === 'next') return nextSession(project, run, lease, values.answer)
  if (command === 'stop') return stopSession(run, lease)
  return recordSession(project, run, lease, {
    step,
    file: required('result', values.result),
    model: values.model,
    attempt: attemptNumber(values.attempt),
  })
}

function parseCommand(command: string, args: string[]) {
  if (!isCommand(command))
    throw new Error(`Usage: node workflow.mjs ${Object.keys(commands).join('|')}`)

  const { values, positionals } = parseArgs({ args, allowPositionals: true, options })
  const spec = commands[command]
  const allowed: readonly string[] = spec.flags
  if (
    positionals.length !== spec.count ||
    Object.keys(values).some(flag => !allowed.includes(flag))
  )
    throw new Error(`invalid arguments for ${command}`)
  return { command, positionals, values }
}

function inspect(
  command: keyof typeof diagnostics,
  project: Project,
  target: string,
  values: Partial<Record<keyof typeof options, string>>,
) {
  if (command === 'list') return workflowList(project)
  if (command === 'expand') return workflowDefinition(project, target).workflow
  return validateWorkflow(project, target, values)
}

async function main([name = '', ...args]: string[]) {
  const { command, positionals, values } = parseCommand(name, args)
  if (command === 'schema') return schemas()
  if (command === 'kinds') return kinds()
  const [target = ''] = positionals
  const cwd = process.cwd()
  const scriptDir = dirname(resolve(process.argv[1] ?? ''))
  if (isDiagnostic(command))
    return inspect(command, { cwd, main: diagnosticMain(cwd), scriptDir }, target, values)
  const project = { cwd, main: sessionMain(cwd), scriptDir }
  if (command === 'start')
    return openSession(project, {
      workflow: target,
      card: required('card', values.card),
      engine: required('engine', values.engine),
      config: values.config,
    })
  if (command === 'resume')
    return openSession(project, { runId: target, engine: required('engine', values.engine) })

  return operate(command, project, positionals, values)
}

void main(process.argv.slice(2))
  .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`,
    )
    process.exitCode = 1
  })
