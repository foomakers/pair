import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { schemas } from '../describe'
import { sessionMain } from '../worktree/session'
import { nextSession, openSession, recordSession, sessionRun, stopSession } from './session'

const commands = {
  start: { count: 1, flags: ['card', 'engine', 'config'] },
  resume: { count: 1, flags: ['engine'] },
  next: { count: 1, flags: ['lease'] },
  record: { count: 2, flags: ['lease', 'result', 'model', 'attempt'] },
  stop: { count: 1, flags: ['lease'] },
}

const options = {
  card: { type: 'string' },
  engine: { type: 'string' },
  config: { type: 'string' },
  lease: { type: 'string' },
  result: { type: 'string' },
  model: { type: 'string' },
  attempt: { type: 'string' },
} as const

type Command = keyof typeof commands
const isCommand = (value: string): value is Command => Object.hasOwn(commands, value)

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
  main: string,
  [target = '', step = '']: string[],
  values: Partial<Record<keyof typeof options, string>>,
) {
  const run = sessionRun(main, target)
  const lease = required('lease', values.lease)
  if (command === 'next') return nextSession(run, lease)
  if (command === 'stop') return stopSession(run, lease)
  return recordSession(run, lease, {
    step,
    file: required('result', values.result),
    model: values.model,
    attempt: attemptNumber(values.attempt),
  })
}

function parseCommand(command: string, args: string[]) {
  if (!isCommand(command))
    throw new Error('Usage: node workflow.mjs schema|start|resume|next|record|stop')

  const { values, positionals } = parseArgs({ args, allowPositionals: true, options })
  const spec = commands[command]
  if (
    positionals.length !== spec.count ||
    Object.keys(values).some(flag => !spec.flags.includes(flag))
  )
    throw new Error(`invalid arguments for ${command}`)
  return { command, positionals, values }
}

async function main([name = '', ...args]: string[]) {
  if (name === 'schema' && args.length === 0) return schemas()
  const { command, positionals, values } = parseCommand(name, args)
  const [target = ''] = positionals
  const cwd = process.cwd()
  const project = {
    cwd,
    main: sessionMain(cwd),
    scriptDir: dirname(resolve(process.argv[1] ?? '')),
  }
  if (command === 'start')
    return openSession(project, {
      workflow: target,
      card: required('card', values.card),
      engine: required('engine', values.engine),
      config: values.config,
    })
  if (command === 'resume')
    return openSession(project, { runId: target, engine: required('engine', values.engine) })

  return operate(command, project.main, positionals, values)
}

void main(process.argv.slice(2))
  .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`,
    )
    process.exitCode = 1
  })
