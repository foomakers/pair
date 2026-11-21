import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { parseWorkflow, type KindName, type Step, type Workflow } from '../grammar'
import { fieldsOf, kindByName, settle, type StepResult, type StepStatus } from '../kinds'

/**
 * The disk, as the engine needs it: the run directory and nothing else. A structural subset of the
 * host's file-system service, so the package imports no `fs` and a test passes an in-memory one.
 */
export interface RunFiles {
  existsSync(path: string): boolean
  readFileSync(path: string): string
  writeFile(path: string, content: string): Promise<void>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  rename(from: string, to: string): Promise<void>
}

/** One run: `.pair/working/runs/<run-id>/` of the main checkout. */
export interface RunDirectory {
  readonly files: RunFiles
  readonly dir: string
}

export const STATE_SCHEMA_VERSION = 1
export const STATE_FILE = 'state.json'
export const FROZEN_WORKFLOW = 'workflow.yaml'

export type StepState = 'pending' | 'running' | StepStatus
export type RunState = 'running' | 'done' | 'failed' | 'parked'

export interface StepRecord {
  readonly state: StepState
  readonly summary?: string
  readonly reason?: string
  readonly detail?: string
  readonly outputs?: Readonly<Record<string, unknown>>
}

/** `state.json`: the only source for `next`. */
export interface RunStateFile {
  readonly schemaVersion: typeof STATE_SCHEMA_VERSION
  readonly workflow: { readonly name: string; readonly hash: string }
  readonly card: string
  readonly steps: Readonly<Record<string, StepRecord>>
}

/** A step ready to launch: the skill, its options and the inputs it receives. */
export interface StepLaunch {
  readonly id: string
  readonly kind: KindName
  readonly uses: string
  readonly with: Readonly<Record<string, unknown>>
  readonly inputs: Readonly<Record<string, unknown>>
}

export const hashOf = (text: string): string =>
  `sha256:${createHash('sha256').update(text).digest('hex')}`

/** Temp file, then rename: a reader never sees half a file. */
async function writeAtomic(files: RunFiles, path: string, content: string): Promise<void> {
  await files.writeFile(`${path}.tmp`, content)
  await files.rename(`${path}.tmp`, path)
}

const writeState = (run: RunDirectory, state: RunStateFile): Promise<void> =>
  writeAtomic(run.files, join(run.dir, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`)

function readState(run: RunDirectory): RunStateFile | undefined {
  const path = join(run.dir, STATE_FILE)
  if (!run.files.existsSync(path)) return undefined
  const state = JSON.parse(run.files.readFileSync(path)) as RunStateFile
  if (state.schemaVersion !== STATE_SCHEMA_VERSION)
    throw new Error(
      `run-state-unreadable: ${path} has schema version ${JSON.stringify(state.schemaVersion)}, ` +
        `this version reads ${String(STATE_SCHEMA_VERSION)} — start over with --restart`,
    )
  return state
}

function requireState(run: RunDirectory): RunStateFile {
  const state = readState(run)
  if (state === undefined) throw new Error(`run-not-started: no ${STATE_FILE} in ${run.dir}`)
  return state
}

/** The frozen copy, parsed. It was valid when `start` froze it. */
function frozenWorkflow(run: RunDirectory): Workflow {
  const path = join(run.dir, FROZEN_WORKFLOW)
  const text = run.files.readFileSync(path)
  const { workflow, errors } = parseWorkflow(
    text,
    join(run.dir, `${requireState(run).workflow.name}.yaml`),
  )
  if (workflow === undefined)
    throw new Error(`run-state-unreadable: ${path}: ${errors[0]?.problem ?? 'invalid'}`)
  return workflow
}

export interface StartOptions {
  readonly card: string
  /** Archive what the run directory holds and start over. */
  readonly restart?: boolean
  /** The clock, for the name of the archive. */
  readonly now?: Date
}

export interface Started {
  /** `complete`: every step is already `ok`; nothing will run. */
  readonly status: 'started' | 'resumed' | 'complete'
  readonly warnings: readonly string[]
}

async function archive(run: RunDirectory, now: Date): Promise<void> {
  const target = join(run.dir, 'archive', now.toISOString().replace(/[:.]/g, '-'))
  await run.files.mkdir(target, { recursive: true })
  for (const name of [STATE_FILE, FROZEN_WORKFLOW, 'steps']) {
    const from = join(run.dir, name)
    if (run.files.existsSync(from)) await run.files.rename(from, join(target, name))
  }
}

async function resume(
  run: RunDirectory,
  state: RunStateFile,
  source: { readonly text: string; readonly file: string },
  card: string,
): Promise<Started> {
  if (state.card !== card)
    throw new Error(
      `run-mismatch: ${run.dir} is the run of card ${state.card}, not of card ${card} — pass another --run-id`,
    )
  const warnings =
    hashOf(source.text) === state.workflow.hash
      ? []
      : [`${source.file} changed after this run started: the frozen copy in ${run.dir} is used`]
  const records = Object.entries(state.steps)
  if (records.every(([, step]) => step.state === 'ok')) return { status: 'complete', warnings }
  // A failed or parked step runs again; a `running` one had no live process (the lock says so) and runs again too.
  const steps = Object.fromEntries(
    records.map(([id, step]) => [id, step.state === 'ok' ? step : { state: 'pending' as const }]),
  )
  await writeState(run, { ...state, steps })
  return { status: 'resumed', warnings }
}

/**
 * Opens the run: on an empty directory it freezes the workflow and writes the initial state; on an
 * existing one it resumes from the first step that is not `ok`. `source.text` is a validated workflow.
 */
export async function start(
  run: RunDirectory,
  source: { readonly text: string; readonly file: string },
  options: StartOptions,
): Promise<Started> {
  // A restart never reads the state it replaces: one this version cannot read is archived like any other.
  const existing = options.restart === true ? undefined : readState(run)
  if (existing !== undefined) return resume(run, existing, source, options.card)
  const { workflow, errors } = parseWorkflow(source.text, source.file)
  if (workflow === undefined)
    throw new Error(`workflow-invalid: ${errors[0]?.problem ?? source.file}`)
  if (run.files.existsSync(join(run.dir, STATE_FILE))) await archive(run, options.now ?? new Date())
  await run.files.mkdir(run.dir, { recursive: true })
  await writeAtomic(run.files, join(run.dir, FROZEN_WORKFLOW), source.text)
  await writeState(run, {
    schemaVersion: STATE_SCHEMA_VERSION,
    workflow: { name: workflow.name, hash: hashOf(source.text) },
    card: options.card,
    steps: Object.fromEntries(workflow.steps.map(step => [step.id, { state: 'pending' as const }])),
  })
  return { status: 'started', warnings: [] }
}

/** What `step` receives: the launch input and the outputs of the steps before it. */
function inputsOf(
  step: Step,
  steps: readonly Step[],
  state: RunStateFile,
): Record<string, unknown> {
  const earlier = steps.slice(0, steps.indexOf(step)).map(one => state.steps[one.id]?.outputs ?? {})
  const produced: Record<string, unknown> = Object.assign({ card: state.card }, ...earlier)
  const declared = fieldsOf(kindByName[step.kind].inputs)
  // A typed kind receives the inputs it declares; `generic` receives every scalar produced so far.
  const wanted = (name: string) =>
    declared.length > 0 ? declared.includes(name) : typeof produced[name] !== 'object'
  return Object.fromEntries(Object.entries(produced).filter(([name]) => wanted(name)))
}

const HALTED: Partial<Record<StepState, RunState>> = { failed: 'failed', 'needs-human': 'parked' }

/**
 * The steps to launch now and the state of the run. Linear: at most one step is ready, and it is
 * written `running` before it is returned, so an interrupted launch is visible on disk.
 */
export async function next(
  run: RunDirectory,
): Promise<{ readonly ready: readonly StepLaunch[]; readonly run: RunState }> {
  const state = requireState(run)
  const { steps } = frozenWorkflow(run)
  const step = steps.find(one => state.steps[one.id]?.state !== 'ok')
  if (step === undefined) return { ready: [], run: 'done' }
  const halted = HALTED[state.steps[step.id]?.state ?? 'pending']
  if (halted !== undefined) return { ready: [], run: halted }
  await writeState(run, { ...state, steps: { ...state.steps, [step.id]: { state: 'running' } } })
  const launch: StepLaunch = {
    id: step.id,
    kind: step.kind,
    uses: step.uses ?? kindByName[step.kind].defaultUses ?? '',
    with: step.with ?? {},
    inputs: inputsOf(step, steps, state),
  }
  return { ready: [launch], run: 'running' }
}

/**
 * Records the result of a step: validated against its kind (a result that breaks the contract is
 * recorded `failed`, `invalid-result`), written to `steps/<id>/result.json`, then to `state.json`.
 * `output` is the agent's final message, kept as `steps/<id>/output.log`.
 */
export async function record(
  run: RunDirectory,
  stepId: string,
  result: unknown,
  output?: string,
): Promise<StepResult> {
  const state = requireState(run)
  const step = frozenWorkflow(run).steps.find(one => one.id === stepId)
  if (step === undefined) throw new Error(`step-unknown: ${stepId} is not a step of ${run.dir}`)
  const kind = kindByName[step.kind]
  const settled = settle(kind, result)
  const dir = join(run.dir, 'steps', stepId)
  await run.files.mkdir(dir, { recursive: true })
  if (output !== undefined) await run.files.writeFile(join(dir, 'output.log'), output)
  await writeAtomic(run.files, join(dir, 'result.json'), `${JSON.stringify(settled, null, 2)}\n`)
  const { status, summary, reason, detail } = settled
  const outputs = Object.fromEntries(
    fieldsOf(kind.outputs)
      .filter(name => name in settled)
      .map(name => [name, settled[name]]),
  )
  const entry: StepRecord = {
    state: status,
    summary,
    ...(reason !== undefined && { reason }),
    ...(detail !== undefined && { detail }),
    outputs,
  }
  await writeState(run, { ...state, steps: { ...state.steps, [stepId]: entry } })
  return settled
}
