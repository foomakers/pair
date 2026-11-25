import { createHash, randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { readResult } from '../dispatch'
import type { Diagnosis, FaultAttempt, StepFaults } from '../diagnosis'
import {
  addressedSteps,
  assignmentFor,
  cardStateOf,
  cardStateToConfirm,
  escalationAction,
  parseWorkflow,
  type CardState,
  type EscalationRule,
  type KindName,
  type ResolvedAssignment,
  type Step,
  type When,
  type Workflow,
} from '../grammar'
import { parseFrozenConfiguration, type Configuration } from '../configuration'
import { fieldsOf, kindByName, settle, type StepResult, type StepStatus } from '../kinds'
import { effectiveSelection, matches, type CardFacts } from '../select'
import { migrateTelemetryStatuses } from '../telemetry/legacy-status'

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
  statSync?(path: string): { mode: number }
  chmod?(path: string, mode: number): Promise<void>
  unlink?(path: string): Promise<void>
}

/** One run: `.pair/working/runs/<run-id>/` of the main checkout. */
export interface RunDirectory {
  readonly files: RunFiles
  readonly dir: string
  /** Observes explicit escalation and loop exhaustion after the engine saves the outcome. */
  readonly observeOutcome?: (outcome: EngineOutcome) => void
}

export const STATE_SCHEMA_VERSION = 1
export const STATE_FILE = 'state.json'
export const FROZEN_WORKFLOW = 'workflow.yaml'
/** The run's effective configuration, frozen at start (replaced only by `--reconfigure`). */
export const FROZEN_CONFIGURATION = 'configuration.yaml'
/** The run's telemetry, when it is on: written by `../telemetry`, archived with the run. */
export const TELEMETRY_FILE = 'telemetry.jsonl'

/** `skipped`: the step's `when` did not match when it was about to start; it produces no outputs. */
export type StepState = 'pending' | 'running' | 'skipped' | 'exhausted' | StepStatus
export type RunState = 'running' | 'done' | 'failed' | 'parked'
/** A held card ends the current invocation while the stored run remains resumable. */
export type RunEndStatus = Exclude<RunState, 'running'> | 'skipped'

export type EngineOutcome = {
  readonly id: string
  readonly summary: string
} & (
  | {
      readonly status: Exclude<StepStatus, 'ok'>
      readonly rule: EscalationRule
      readonly round?: number
      readonly reason?: string
    }
  | {
      readonly status: 'exhausted'
      readonly round: number
      readonly rule?: EscalationRule
      readonly reason: 'loop-max'
    }
)

export interface StepRecord {
  readonly state: StepState
  readonly round?: number
  /** How many times the step was launched in this run. */
  readonly executions?: number
  readonly attempts?: readonly FaultAttempt[]
  /** Process retries still available for this running or interrupted execution. */
  readonly remainingRetries?: number
  readonly summary?: string
  readonly reason?: string
  readonly detail?: string
  readonly outputs?: Readonly<Record<string, unknown>>
  /** A confirmed result waiting for the host's Ready transition. */
  readonly pendingSuccess?: StepResult
  /** Selection status before a Ready transition whose staged result became stale. */
  readonly retryBoardStatus?: string
}

/** `state.json`: the only source for `next`. */
export interface RunStateFile {
  readonly schemaVersion: typeof STATE_SCHEMA_VERSION
  readonly workflow: { readonly name: string; readonly hash: string }
  readonly card: string
  /** Labels used for configuration selection when this run started. */
  readonly cardLabels?: readonly string[]
  /** Allocated before the first escalation comment and preserved on resume. */
  readonly instanceId?: string
  /** Present when the run froze a configuration; `override` is the `--config-override` applied, as given. */
  readonly configuration?: { readonly hash: string; readonly override?: unknown } | undefined
  readonly steps: Readonly<Record<string, StepRecord>>
  readonly loops?: Readonly<Record<string, LoopRecord>>
  readonly latest?: Readonly<Record<string, unknown>>
  readonly replay?: StepReplay
}

function executionHistory(previous?: StepRecord) {
  const { executions, attempts } = previous ?? {}
  return {
    ...(executions !== undefined && { executions }),
    ...(attempts !== undefined && { attempts }),
  }
}

export interface LoopRecord {
  readonly round: number
  readonly max: number
  readonly exhausted?: boolean
  readonly grants?: readonly { readonly rounds: number; readonly by: string; readonly at: string }[]
  readonly untilResult?: Readonly<Record<string, unknown>>
}

/** A step ready to launch: the skill, its options and the inputs it receives. */
export interface StepLaunch {
  readonly id: string
  readonly kind: KindName
  readonly uses: string
  readonly with: Readonly<Record<string, unknown>>
  readonly assignment?: ResolvedAssignment
  /** Validation the host runs after the step ends `ok`. */
  readonly gates?: readonly string[]
  readonly inputs: Readonly<Record<string, unknown>>
  readonly timeoutMinutes?: number
  readonly retries?: number
  /** The number of this execution of the step in the run: 1 the first time. */
  readonly attempt: number
  readonly round?: number
  readonly startState?: CardState
  readonly confirmState?: CardState
  readonly pendingSuccess?: StepResult
  readonly retryBoardStatus?: string

  /** Distinguishes a replay from earlier executions that used the same inputs. */
  readonly replayAttempt?: number
}

export const hashOf = (text: string): string =>
  `sha256:${createHash('sha256').update(text).digest('hex')}`

function existingMode(files: RunFiles, path: string): number | undefined {
  if (files.chmod === undefined || !files.existsSync(path)) return undefined
  return files.statSync?.(path).mode
}

/** Temp file, then rename: a reader never sees half a file. */
export async function writeAtomic(
  files: RunFiles,
  path: string,
  content: string,
  { preserveMode = false }: { preserveMode?: boolean } = {},
): Promise<void> {
  const temp = `${path}.tmp`
  const mode = preserveMode ? existingMode(files, path) : undefined
  await files.writeFile(temp, content)
  try {
    if (mode !== undefined) await files.chmod?.(temp, mode & 0o777)
    await files.rename(temp, path)
  } catch (error) {
    if (mode !== undefined) await files.unlink?.(temp).catch(() => undefined)
    throw error
  }
}

const writeState = (run: RunDirectory, state: RunStateFile): Promise<void> =>
  writeAtomic(run.files, join(run.dir, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`, {
    preserveMode: true,
  })

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

async function migrateStateStatuses(run: RunDirectory, state: RunStateFile): Promise<RunStateFile> {
  const legacyStatus: string = 'needs-human'
  const legacy = Object.entries(state.steps).filter(([, step]) => step.state === legacyStatus)
  if (legacy.length === 0) return state
  const steps = { ...state.steps }
  for (const [id, step] of legacy) steps[id] = { ...step, state: 'needs-decision' }
  const migrated = { ...state, steps }
  await writeState(run, migrated)
  return migrated
}

function legacyTelemetryReplacement(files: RunFiles, path: string): string | undefined {
  let text: string
  try {
    if (!files.existsSync(path)) return undefined
    text = files.readFileSync(path)
  } catch {
    // Optional telemetry that cannot be read has no status we can migrate.
    return undefined
  }
  const migrated = migrateTelemetryStatuses(text)
  return migrated === text ? undefined : migrated
}

export function hasLegacyRunTelemetry(run: RunDirectory): boolean {
  return legacyTelemetryReplacement(run.files, join(run.dir, TELEMETRY_FILE)) !== undefined
}

/** Re-read and replace legacy telemetry while the caller holds the run lock. */
export async function migrateRunTelemetry(run: RunDirectory): Promise<string | undefined> {
  const path = join(run.dir, TELEMETRY_FILE)
  const replacement = legacyTelemetryReplacement(run.files, path)
  if (replacement === undefined) return undefined
  try {
    await writeAtomic(run.files, path, replacement, { preserveMode: true })
  } catch (error) {
    return `telemetry was not written: ${String(error)} — the run goes on without it`
  }
  return undefined
}

function requireState(run: RunDirectory): RunStateFile {
  const state = readState(run)
  if (state === undefined) throw new Error(`run-not-started: no ${STATE_FILE} in ${run.dir}`)
  return state
}

/** Who a run is: its id (the name of its directory), its workflow and its card. */
export interface RunIdentity {
  readonly run: string
  readonly workflow: string
  readonly card: string
}

export function identityOf(run: RunDirectory): RunIdentity {
  const { workflow, card } = requireState(run)
  return { run: basename(run.dir), workflow: workflow.name, card }
}

export async function escalationCommentTarget(
  run: RunDirectory,
  { id, round, status }: EngineOutcome,
): Promise<{ card: string; marker: string }> {
  const state = requireState(run)
  const instanceId = state.instanceId ?? randomUUID()
  if (state.instanceId === undefined) await writeState(run, { ...state, instanceId })
  const key = hashOf(JSON.stringify([instanceId, id, round, status]))
  return { card: state.card, marker: `<!-- pair:workflow-escalation ${key} -->` }
}

/** The frozen copy, parsed. It was valid when `start` froze it. */
function frozenWorkflow(run: RunDirectory): Workflow {
  const path = join(run.dir, FROZEN_WORKFLOW)
  const text = run.files.readFileSync(path)
  const { workflow, errors } = parseWorkflow(
    text,
    join(run.dir, `${requireState(run).workflow.name}.yaml`),
    true,
  )
  if (workflow === undefined)
    throw new Error(`run-state-unreadable: ${path}: ${errors[0]?.problem ?? 'invalid'}`)
  return workflow
}

/** Refresh inputs at a step boundary without rerunning the completed prefix. */
export interface StepReplay {
  readonly from: string
  readonly inputs: Readonly<Record<string, unknown>>
}

export interface StartOptions {
  readonly card: string
  readonly cardLabels?: readonly string[]
  /** Archive what the run directory holds and start over. */
  readonly restart?: boolean
  /** The clock, for the name of the archive. */
  readonly now?: Date
  /** The effective configuration (already validated) the run freezes; `override` is recorded in `state.json`. */
  readonly configuration?: { readonly text: string; readonly override?: unknown }
  /** Replace the frozen configuration with `configuration`; steps already `ok` stay `ok`. */
  readonly reconfigure?: boolean
  readonly moreRounds?: number
  readonly requestedBy?: string
  readonly replay?: StepReplay
}

/** The frozen configuration of a run, when it has one. */
export function frozenConfiguration(run: RunDirectory): string | undefined {
  const path = join(run.dir, FROZEN_CONFIGURATION)
  return run.files.existsSync(path) ? run.files.readFileSync(path) : undefined
}

function parsedFrozenConfiguration(run: RunDirectory) {
  const text = frozenConfiguration(run)
  return text === undefined
    ? undefined
    : parseFrozenConfiguration(text, join(run.dir, FROZEN_CONFIGURATION))
}

/** The host checks that the copy it froze still parses before it launches steps. */
export function effectiveConfiguration(run: RunDirectory): Configuration | undefined {
  const parsed = parsedFrozenConfiguration(run)
  if (parsed !== undefined && parsed.configuration === undefined) {
    const path = join(run.dir, FROZEN_CONFIGURATION)
    throw new Error(`run-state-unreadable: ${path}: ${parsed.errors[0]?.problem ?? 'invalid'}`)
  }
  return parsed?.configuration
}

const configurationRecord = (c: NonNullable<StartOptions['configuration']>) => ({
  hash: hashOf(c.text),
  ...(c.override !== undefined && { override: c.override }),
})

function loopMax(text: string | undefined, step: Step): number {
  if (text === undefined) return step.max ?? 1
  const parsed = parseFrozenConfiguration(text, 'configuration.yaml')
  if (parsed.configuration === undefined)
    throw new Error('run-state-unreadable: frozen configuration is invalid')
  return parsed.configuration.steps?.[step.id]?.max ?? step.max ?? 1
}

export interface Started {
  /** `complete`: every step is already `ok`; nothing will run. */
  readonly status: 'started' | 'resumed' | 'complete' | 'parked' | 'failed'
  readonly warnings: readonly string[]
  /** A telemetry replacement failed. A host can report it once for the whole launch. */
  readonly telemetryWarning?: string
}

async function archive(run: RunDirectory, now: Date): Promise<void> {
  const target = join(run.dir, 'archive', now.toISOString().replace(/[:.]/g, '-'))
  await run.files.mkdir(target, { recursive: true })
  for (const name of [STATE_FILE, FROZEN_WORKFLOW, FROZEN_CONFIGURATION, TELEMETRY_FILE, 'steps']) {
    const from = join(run.dir, name)
    if (run.files.existsSync(from)) await run.files.rename(from, join(target, name))
  }
}

/** What a resume says when the configuration that resolves now is not the one the run froze. */
function configurationWarnings(
  run: RunDirectory,
  state: RunStateFile,
  configuration: StartOptions['configuration'],
): string[] {
  if (configuration === undefined) return []
  if (state.configuration === undefined)
    return [
      'this run started with no configuration and keeps none — pass --reconfigure to apply the one that now resolves',
    ]
  return state.configuration.hash === hashOf(configuration.text)
    ? []
    : [
        `the configuration changed after this run started: the frozen copy in ${run.dir} is used — pass --reconfigure to replace it`,
      ]
}

/** `--reconfigure`: freezes the configuration that now resolves and re-bases the loops' max on it. */
async function reconfigured(
  run: RunDirectory,
  state: RunStateFile,
  configuration: NonNullable<StartOptions['configuration']>,
): Promise<RunStateFile> {
  await writeAtomic(run.files, join(run.dir, FROZEN_CONFIGURATION), configuration.text)
  const loops = Object.fromEntries(
    Object.entries(state.loops ?? {}).map(([id, loop]) => {
      const step = frozenWorkflow(run).steps.find(one => one.id === id)
      return [
        id,
        { ...loop, max: step === undefined ? loop.max : loopMax(configuration.text, step) },
      ]
    }),
  )
  return {
    ...state,
    configuration: configurationRecord(configuration),
    ...(state.loops !== undefined && { loops }),
  }
}

/** The loop parked at max, when `--more-rounds` may reopen it. */
function parkedLoop(state: RunStateFile, workflow: Workflow, moreRounds: number) {
  const stopped = stoppedLoop(workflow, state)
  if (stopped?.run !== 'parked') throw new Error('more-rounds-invalid: no loop is parked at max')
  if (!Number.isInteger(moreRounds) || moreRounds < 1)
    throw new Error('more-rounds-invalid: pass a positive integer')
  return stopped
}

/** `--more-rounds`: reopens the loop parked at max with the extra rounds granted. */
function withMoreRounds(
  state: RunStateFile,
  workflow: Workflow,
  options: StartOptions & { readonly moreRounds: number },
): RunStateFile {
  const { step, loop } = parkedLoop(state, workflow, options.moreRounds)
  const { id } = step
  const grants = [
    ...(loop.grants ?? []),
    {
      rounds: options.moreRounds,
      by: options.requestedBy ?? 'unknown',
      at: (options.now ?? new Date()).toISOString(),
    },
  ]
  const children = step.steps ?? []
  return {
    ...state,
    loops: {
      ...state.loops,
      [id]: {
        ...loop,
        round: loop.round + 1,
        max: loop.round + options.moreRounds,
        exhausted: false,
        grants,
      },
    },
    steps: {
      ...state.steps,
      [id]: { state: 'running' },
      ...Object.fromEntries(
        children.map(child => [
          `${id}/${child.id}`,
          {
            state: 'pending',
            executions: 0,
            ...executionHistory(state.steps[`${id}/${child.id}`]),
          },
        ]),
      ),
    },
  }
}

/** The first unfinished step, when it is a loop stopped at max. */
export function stoppedLoop(workflow: Workflow, state: RunStateFile) {
  const step = workflow.steps.find(one => !stepSettled(one, state.steps[one.id]?.state))
  if (step?.kind !== 'loop') return undefined
  const loop = state.loops?.[step.id]
  if (!loop?.exhausted) return undefined
  const run = haltFor(step, state.steps[step.id]?.state)
  return run === undefined ? undefined : { step, loop, run }
}

/** The run must be of this card; a workflow edited since the start warns. */
function workflowWarnings(
  run: RunDirectory,
  state: RunStateFile,
  source: { readonly text: string; readonly file: string },
  card: string,
): string[] {
  if (state.card !== card)
    throw new Error(
      `run-mismatch: ${run.dir} is the run of card ${state.card}, not of card ${card} — pass another --run-id`,
    )
  return hashOf(source.text) === state.workflow.hash
    ? []
    : [`${source.file} changed after this run started: the frozen copy in ${run.dir} is used`]
}

/** The status a resumed run ends in without launching anything; undefined when steps remain. */
function settledStatus(
  workflow: Workflow,
  state: RunStateFile,
): 'failed' | 'parked' | 'complete' | undefined {
  const exhausted = stoppedLoop(workflow, state)
  if (exhausted !== undefined) return exhausted.run
  return runIsDone(workflow, state) &&
    !workflow.steps.some(step => retryContinuedFailure(step, state.steps[step.id]?.state))
    ? 'complete'
    : undefined
}

const runIsDone = ({ steps }: Workflow, state: RunStateFile): boolean =>
  steps.every(step => stepSettled(step, state.steps[step.id]?.state)) &&
  finalState(state, steps) === 'done'

export function completedRun(
  run: RunDirectory,
  identity: { card: string; workflow: string },
): boolean {
  const state = readState(run)
  return (
    state !== undefined &&
    state.card === identity.card &&
    state.workflow.name === identity.workflow &&
    settledStatus(frozenWorkflow(run), state) === 'complete'
  )
}

// Older runs saved the failed transition and the original agent result separately.
const legacyReadyFailure = (saved: StepRecord) =>
  saved.state === 'failed' &&
  saved.reason === 'result-not-confirmed' &&
  /^card state .+ not set: /.test(saved.detail ?? '')

function pendingTransitionResult(
  run: RunDirectory,
  step: Step,
  saved?: StepRecord,
): StepResult | undefined {
  if (saved === undefined || step.kind === 'loop') return undefined
  if (saved.pendingSuccess !== undefined) return saved.pendingSuccess
  if (cardStateOf(step)?.state !== 'Ready' || !legacyReadyFailure(saved)) return undefined
  const log = join(resultDir(run, step.id, undefined), 'output.log')
  if (!run.files.existsSync(log)) return undefined
  const result = readResult(run.files.readFileSync(log), kindByName[step.kind])
  return result.status === 'ok' ? result : undefined
}

function stagedBoardStatus(
  run: RunDirectory,
  state: RunStateFile,
  steps: readonly Step[],
): string | undefined {
  for (const step of steps) {
    const saved = state.steps[step.id]
    const status =
      saved?.retryBoardStatus ?? pendingTransitionResult(run, step, saved)?.['boardStatus']
    if (typeof status === 'string') return status
  }
  return undefined
}

/** The board status used to reselect unfinished refinement or a staged transition. */
export function pendingBoardStatus(
  run: RunDirectory,
  identity: { card: string; workflow: string },
  draftBoardStatus?: string,
): string | undefined {
  const state = readState(run)
  if (state?.card !== identity.card || state.workflow.name !== identity.workflow) return undefined
  const workflow = frozenWorkflow(run)
  const { steps } = workflow
  const staged = stagedBoardStatus(run, state, steps)
  if (staged !== undefined) return staged
  if (
    draftBoardStatus !== undefined &&
    steps.some(step => {
      const saved = state.steps[step.id]
      return (
        (step.kind === 'refine-story' || step.kind === 'plan-tasks') &&
        saved !== undefined &&
        saved.state !== 'skipped' &&
        (saved.state === 'ok' || Boolean(saved.executions))
      )
    }) &&
    settledStatus(workflow, state) !== 'complete'
  )
    return draftBoardStatus
  return undefined
}

/** The latest successful refinement before a task-planning step. */
export function priorRefinement(run: RunDirectory, id: string): StepRecord['outputs'] {
  const state = requireState(run)
  let outputs: StepRecord['outputs']
  for (const step of addressedSteps(frozenWorkflow(run))) {
    if (step.id === id) break
    const saved = state.steps[step.id]
    if (step.kind === 'refine-story' && saved?.state === 'ok') outputs = saved.outputs
  }
  return outputs
}

async function resume(
  run: RunDirectory,
  existing: RunStateFile,
  source: { readonly text: string; readonly file: string },
  options: StartOptions,
): Promise<Started> {
  const warnings = workflowWarnings(run, existing, source, options.card)
  const saved = await migrateStateStatuses(run, existing)
  const telemetryWarning = await migrateRunTelemetry(run)
  const diagnostics = { warnings, ...(telemetryWarning !== undefined && { telemetryWarning }) }
  let state = saved
  const workflow = frozenWorkflow(run)
  const { configuration } = options
  if (options.moreRounds !== undefined) parkedLoop(state, workflow, options.moreRounds)
  if (configuration !== undefined && options.reconfigure === true)
    state = await reconfigured(run, state, configuration)
  else warnings.push(...configurationWarnings(run, state, configuration))
  if (options.moreRounds !== undefined)
    state = withMoreRounds(state, workflow, { ...options, moreRounds: options.moreRounds })
  if (options.replay !== undefined) state = replayFrom(run, state, options.replay)
  const settled = settledStatus(workflow, state)
  if (settled === undefined) {
    await writeState(run, { ...state, steps: reopenedSteps(run, state, workflow) })
    return { status: 'resumed', ...diagnostics }
  }
  if (state !== saved) await writeState(run, state)
  return { status: settled, ...diagnostics }
}

function replayFrom(run: RunDirectory, state: RunStateFile, replay: StepReplay): RunStateFile {
  const steps = frozenWorkflow(run).steps
  const from = steps.findIndex(step => step.id === replay.from)
  if (from < 0) throw new Error('run-replay-invalid: expected a top-level step')
  const records = { ...state.steps }
  const loops = { ...state.loops }
  for (const step of steps.slice(from)) {
    records[step.id] = { state: 'pending', ...executionHistory(records[step.id]) }
    if (step.kind === 'loop') {
      loops[step.id] = { round: 1, max: loopMax(frozenConfiguration(run), step) }
      for (const child of step.steps ?? []) {
        const id = `${step.id}/${child.id}`
        records[id] = { state: 'pending', ...executionHistory(records[id]) }
      }
    }
  }
  return { ...state, steps: records, loops, latest: {}, replay }
}

// A failed fix or an interrupted fix/final gate retries earlier failed reviews.
function retryEarlierReviews(state: RunStateFile, step?: Step, last?: Step): boolean {
  if (step === undefined) return false
  const status = state.steps[step.id]?.state
  const interrupted = status === 'pending' || status === 'running'
  if (step.kind === 'fix') return status === 'failed' || interrupted
  return step === last && step.kind === 'gate' && interrupted
}

// An interrupted or stopped step runs again. Continued outcomes usually stay recorded.
// A finished run or a failed final gate also retries top-level continued failures.
function reopenedSteps(
  run: RunDirectory,
  state: RunStateFile,
  workflow: Workflow,
): Record<string, StepRecord> {
  const topLevel = new Set(workflow.steps.map(step => step.id))
  const steps = new Map(addressedSteps(workflow).map(step => [step.id, step]))
  const last = workflow.steps.at(-1)
  const failedFinalGate = last?.kind === 'gate' && state.steps[last.id]?.state === 'failed'
  const stoppedAt = workflow.steps.findIndex(
    step => !stepSettled(step, state.steps[step.id]?.state),
  )
  const retryReview = retryEarlierReviews(state, workflow.steps[stoppedAt], last)
  const retryFailedSteps =
    runIsDone(workflow, state) || failedFinalGate
      ? topLevel
      : new Set(
          workflow.steps
            .filter(
              (step, index) =>
                step === last || (retryReview && index < stoppedAt && step.kind === 'review'),
            )
            .map(step => step.id),
        )
  return Object.fromEntries(
    Object.entries(state.steps).map(([id, saved]) => {
      const step = steps.get(id)
      const child = !topLevel.has(id)
      if (saved.state === 'ok') return [id, saved]
      if (
        saved.state !== 'skipped' &&
        (saved.state !== 'failed' || !retryFailedSteps.has(id)) &&
        step !== undefined &&
        (child ? childSettled(step, saved.state) : stepSettled(step, saved.state))
      )
        return [id, saved]
      return [id, reopenStep(run, saved, child ? undefined : step, step?.retries)]
    }),
  )
}

function legacyBudget(saved: StepRecord, retries: number | undefined): number | undefined {
  if (saved.state !== 'running' || retries === undefined) return undefined
  // Older states only recorded the fault attempts. Count the consecutive faults before
  // the interrupted attempt in this round, up to the configured budget.
  let remaining = retries
  let expected = (saved.executions ?? 1) - 1
  for (const fault of (saved.attempts ?? []).slice().reverse()) {
    if (fault.attempt > expected) continue
    if (remaining === 0 || fault.round !== saved.round || fault.attempt !== expected) break
    remaining--
    expected--
  }
  return remaining
}

function reopenStep(
  run: RunDirectory,
  saved: StepRecord,
  step: Step | undefined,
  retries: number | undefined,
): StepRecord {
  const pendingSuccess =
    step === undefined ? saved.pendingSuccess : pendingTransitionResult(run, step, saved)
  const remainingRetries = saved.remainingRetries ?? legacyBudget(saved, retries)
  return {
    state: 'pending',
    ...executionHistory(saved),
    ...(remainingRetries !== undefined && { remainingRetries }),
    ...retryBoardStatusOf(saved),
    ...(pendingSuccess !== undefined && { pendingSuccess }),
  }
}

/** The state of a run that has not launched anything. */
function initialState(workflow: Workflow, text: string, options: StartOptions): RunStateFile {
  const { configuration } = options
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    workflow: { name: workflow.name, hash: hashOf(text) },
    card: options.card,
    ...(options.cardLabels !== undefined && { cardLabels: options.cardLabels }),
    ...(configuration !== undefined && { configuration: configurationRecord(configuration) }),
    steps: Object.fromEntries(
      workflow.steps.flatMap(step => [
        [step.id, { state: 'pending' as const }],
        ...(step.steps ?? []).map(
          child => [`${step.id}/${child.id}`, { state: 'pending' as const }] as const,
        ),
      ]),
    ),
    ...(workflow.steps.some(step => step.kind === 'loop') && {
      loops: Object.fromEntries(
        workflow.steps
          .filter(step => step.kind === 'loop')
          .map(step => [step.id, { round: 1, max: loopMax(configuration?.text, step) }]),
      ),
      latest: {},
    }),
  }
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
  if (existing !== undefined) return resume(run, existing, source, options)
  if (options.moreRounds !== undefined)
    throw new Error('more-rounds-invalid: no parked loop exists')
  const { workflow, errors } = parseWorkflow(source.text, source.file, true)
  if (workflow === undefined)
    throw new Error(`workflow-invalid: ${errors[0]?.problem ?? source.file}`)
  if (run.files.existsSync(join(run.dir, STATE_FILE))) await archive(run, options.now ?? new Date())
  await run.files.mkdir(run.dir, { recursive: true })
  await writeAtomic(run.files, join(run.dir, FROZEN_WORKFLOW), source.text)
  const { configuration } = options
  if (configuration !== undefined)
    await writeAtomic(run.files, join(run.dir, FROZEN_CONFIGURATION), configuration.text)
  await writeState(run, initialState(workflow, source.text, options))
  return { status: 'started', warnings: [] }
}

function mergeOutputs(
  ...sources: (Readonly<Record<string, unknown>> | undefined)[]
): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const source of sources) {
    // A report belongs to the review that produced it.
    if (typeof source?.['reviewedHead'] === 'string') delete merged['reportPath']
    Object.assign(merged, source)
  }
  return merged
}

/** Earlier outputs, with fresh replay inputs at the boundary where they take effect. */
function inputsBefore(
  step: Step,
  steps: readonly Step[],
  state: RunStateFile,
): Record<string, unknown> {
  const earlier = steps.slice(0, steps.indexOf(step)).map(one => state.steps[one.id]?.outputs ?? {})
  const replayAt = steps.findIndex(one => one.id === state.replay?.from)
  if (state.replay !== undefined && replayAt >= 0 && replayAt <= earlier.length)
    earlier.splice(replayAt, 0, state.replay.inputs)
  return mergeOutputs({ card: state.card }, ...earlier)
}

type Halt = 'failed' | 'parked'

const HALTED: Partial<Record<StepState, Halt>> = {
  failed: 'failed',
  blocked: 'parked',
  'needs-decision': 'parked',
  exhausted: 'parked',
}

/** A rule declared under `escalate` for the recorded outcome. */
export const explicitEscalation = (
  step: Step,
  status: StepState | undefined,
): EscalationRule | undefined =>
  status === 'failed' ||
  status === 'blocked' ||
  status === 'needs-decision' ||
  status === 'exhausted'
    ? step.escalate?.[status]
    : undefined

/** An outcome that lets execution move past this top-level step. */
export function stepSettled(step: Step, status: StepState | undefined): boolean {
  const action = escalationAction(explicitEscalation(step, status))
  return (
    status === 'ok' ||
    status === 'skipped' ||
    (action ?? (status === 'failed' ? step['on-failed'] : undefined)) === 'continue'
  )
}

const retryContinuedFailure = (step: Step, status: StepState | undefined): boolean =>
  status === 'failed' && stepSettled(step, status)

function haltFor(step: Step, status: StepState | undefined): Halt | undefined {
  return status === 'exhausted' && step['on-max'] === 'fail'
    ? 'failed'
    : HALTED[status ?? 'pending']
}

/** Without a rule, a failed child remains part of normal loop convergence. */
const childSettled = (child: Step, status: StepState | undefined): boolean =>
  stepSettled(child, status) || (status === 'failed' && child.escalate?.failed === undefined)

/** The state of a run with nothing left to launch: the last step decides. */
const finalState = (state: RunStateFile, steps: readonly Step[]): 'failed' | 'done' =>
  state.steps[steps[steps.length - 1]?.id ?? '']?.state === 'failed' ? 'failed' : 'done'

const pick = (produced: Record<string, unknown>, kind: KindName): Record<string, unknown> => {
  const declared = fieldsOf(kindByName[kind].inputs)
  return Object.fromEntries(
    Object.entries(produced).filter(([name, value]) =>
      declared.length > 0 ? declared.includes(name) : typeof value !== 'object',
    ),
  )
}

/** The number of this launch of `id`. */
const launches = (state: RunStateFile, id: string): number => (state.steps[id]?.executions ?? 0) + 1

/** The loop child that is next, with its id. */
function loopChild(
  state: RunStateFile,
  step: Step,
): { child: Step & { kind: KindName }; id: string } {
  const child = step.steps?.find(
    one => !childSettled(one, state.steps[`${step.id}/${one.id}`]?.state),
  )
  if (child === undefined) throw new Error(`run-state-unreadable: loop ${step.id} has no next step`)
  if (child.kind === 'loop') throw new Error('nested loop is not launchable')
  return { child: child as Step & { kind: KindName }, id: `${step.id}/${child.id}` }
}

/** The approval awaiting an answer at the run's current position. */
export function stoppedApproval(workflow: Workflow, state: RunStateFile): string | undefined {
  const step = workflow.steps.find(one => !stepSettled(one, state.steps[one.id]?.state))
  if (step === undefined) return undefined
  if (step.kind === 'loop' && state.steps[step.id]?.state !== 'running') return undefined
  const { child, id } = step.kind === 'loop' ? loopChild(state, step) : { child: step, id: step.id }
  const status: string | undefined = state.steps[id]?.state
  return child.kind === 'approval' && (status === 'needs-decision' || status === 'needs-human')
    ? id
    : undefined
}

function haltAt(state: RunStateFile, step: Step): Halt | undefined {
  const halted = haltFor(step, state.steps[step.id]?.state)
  if (halted !== undefined || step.kind !== 'loop') return halted
  const { child, id } = loopChild(state, step)
  return haltFor(child, state.steps[id]?.state)
}

const gatesOf = (step: Step) => (step.gates ? { gates: step.gates } : {})

const agentOptionsOf = (step: Step) => ({
  ...(step['timeout-minutes'] !== undefined && { timeoutMinutes: step['timeout-minutes'] }),
  ...(step.retries !== undefined && { retries: step.retries }),
})

/** Keep process faults before moving on to the next launch or settling the step. */
export async function recordFault(
  run: RunDirectory,
  step: StepLaunch,
  diagnosis: Diagnosis,
): Promise<StepLaunch | undefined> {
  const state = requireState(run)
  const previous = state.steps[step.id]
  if (previous?.state !== 'running' || previous.executions !== step.attempt)
    throw new Error(`cannot record a fault for inactive step ${step.id}`)
  const { attempt, round } = step
  const attempts = [
    ...(previous.attempts ?? []),
    { ...diagnosis, attempt, ...(round !== undefined && { round }) },
  ]
  const remaining = previous.remainingRetries ?? step.retries ?? 0
  const executions = remaining > 0 ? attempt + 1 : attempt
  const remainingRetries = Math.max(remaining - 1, 0)
  await writeState(run, {
    ...state,
    steps: { ...state.steps, [step.id]: { ...previous, executions, attempts, remainingRetries } },
  })
  return remaining > 0 ? { ...step, attempt: executions } : undefined
}

export function faultsOf(run: RunDirectory): StepFaults[] {
  return Object.entries(requireState(run).steps).flatMap(([step, { attempts }]) =>
    attempts === undefined ? [] : [{ step, attempts }],
  )
}

const pendingOf = (saved?: Pick<StepRecord, 'pendingSuccess'>) =>
  saved?.pendingSuccess === undefined ? {} : { pendingSuccess: saved.pendingSuccess }

const retryBoardStatusOf = (saved?: Pick<StepRecord, 'retryBoardStatus'>) =>
  saved?.retryBoardStatus === undefined ? {} : { retryBoardStatus: saved.retryBoardStatus }

const awaitingTransition = (saved?: StepRecord) =>
  saved?.pendingSuccess !== undefined || saved?.retryBoardStatus !== undefined

const boardStatesOf = (step: Step) => {
  const confirmState = cardStateToConfirm(step)
  const transition = cardStateOf(step)
  return {
    ...(step.kind === 'implement' &&
      transition?.when === 'start' && {
        startState: transition.state,
      }),
    ...(confirmState !== undefined && { confirmState }),
  }
}

const replayAttemptOf = (state: RunStateFile): number | undefined => {
  if (!state.replay) return undefined
  const from = state.replay.from
  return (
    state.steps[from]?.executions ??
    Object.entries(state.steps).find(([id]) => id.startsWith(`${from}/`))?.[1].executions
  )
}

const replayLaunch = (state: RunStateFile) => {
  const replayAttempt = replayAttemptOf(state)
  return replayAttempt === undefined ? {} : { replayAttempt }
}

type LaunchCheck = (launch: StepLaunch) => Promise<string | undefined>
type LaunchContext = { state: RunStateFile; check: LaunchCheck | undefined }

interface NextLaunch {
  readonly ready: readonly StepLaunch[]
  readonly run: RunState
  readonly held?: SkippedStep & { readonly summary: string }
}

async function reserveLaunch(
  run: RunDirectory,
  { state, check }: LaunchContext,
  launch: StepLaunch,
  loop?: { id: string; round: number },
): Promise<NextLaunch> {
  const { id, kind, attempt, round } = launch
  const summary = await check?.(launch)
  if (summary !== undefined) return { ready: [], run: 'running', held: { id, kind, summary } }
  const saved = state.steps[id]
  const remainingRetries = saved?.remainingRetries ?? launch.retries
  await writeState(run, {
    ...state,
    steps: {
      ...state.steps,
      ...(loop !== undefined && { [loop.id]: { state: 'running' as const, round: loop.round } }),
      [id]: {
        state: 'running',
        ...executionHistory(saved),
        executions: attempt,
        ...(remainingRetries !== undefined && { remainingRetries }),
        ...(round !== undefined && { round }),
        ...pendingOf(launch),
        ...retryBoardStatusOf(launch),
      },
    },
  })
  return { ready: [launch], run: 'running' }
}

/** Launches the next loop child if its launch check passes. */
async function nextInLoop(
  run: RunDirectory,
  context: LaunchContext,
  workflow: Workflow,
  step: Step,
): Promise<NextLaunch> {
  const { state } = context
  const { child, id } = loopChild(state, step)
  const attempt = launches(state, id)
  const round = state.loops?.[step.id]?.round ?? 1
  const saved = state.steps[id]
  const pending = { ...pendingOf(saved), ...retryBoardStatusOf(saved) }
  const assignment = assignmentOf(workflow, { ...child, id }, run)

  const launch: StepLaunch = {
    id,
    kind: child.kind,
    uses: child.skill ?? kindByName[child.kind].defaultSkill ?? '',
    with: child.with ?? {},
    ...gatesOf(child),
    ...agentOptionsOf(child),
    ...boardStatesOf(child),
    ...pending,
    ...assignment,
    inputs: pick(mergeOutputs(inputsBefore(step, workflow.steps, state), state.latest), child.kind),
    attempt,
    round,
    ...replayLaunch(state),
  }
  return reserveLaunch(run, context, launch, { id: step.id, round })
}

/**
 * The steps to launch now and the state of the run. Linear: at most one step is ready, and it is
 * written `running` before it is returned, so an interrupted launch is visible on disk. A launch
 * check that returns a reason leaves the step untouched and resumable.
 */
export async function next(
  run: RunDirectory,
  card?: () => Promise<CardFacts>,
  skipped: SkippedStep[] = [],
  check?: LaunchCheck,
): Promise<
  NextLaunch & {
    readonly skipped?: readonly SkippedStep[]
    /** The condition needs an unavailable fact. The stored step remains unchanged. */
    readonly blocked?: SkippedStep & { readonly detail: string }
  }
> {
  const state = await migrateStateStatuses(run, requireState(run))
  const workflow = frozenWorkflow(run)
  const { steps } = workflow
  const step = steps.find(one => !stepSettled(one, state.steps[one.id]?.state))
  if (step === undefined) return { ready: [], run: finalState(state, steps), ...seen(skipped) }
  const halted = haltAt(state, step)
  if (halted !== undefined) return { ready: [], run: halted, ...seen(skipped) }
  const condition = await checkWhen(run, state, step, card)
  if (condition?.error !== undefined)
    return {
      ready: [],
      run: 'failed',
      blocked: { ...condition.step, detail: condition.error },
      ...seen(skipped),
    }
  if (condition !== undefined) return next(run, card, [...skipped, condition.step], check)
  const context = { state, check }
  const launched = await (step.kind === 'loop'
    ? nextInLoop(run, context, workflow, step)
    : reserveLaunch(run, context, plainLaunch(state, workflow, step, run)))
  return { ...launched, ...seen(skipped) }
}

const seen = (skipped: SkippedStep[]) => (skipped.length > 0 ? { skipped } : {})

/** A step the run passed over because its `when` did not match. */
export interface SkippedStep {
  readonly id: string
  readonly kind: KindName
}

/** Missing ordinary outputs match, but status conditions require a recorded outcome. */
function outputMismatch(
  output: string,
  is: readonly unknown[] | undefined,
  state: RunStateFile,
): string | undefined {
  const [stepId, name] = output.split('.') as [string, string]
  const producer = state.steps[stepId]
  const status = producer?.state
  if (name === 'status' && [undefined, 'pending', 'running', 'skipped'].includes(status))
    return `${output} has no outcome`
  const value = name === 'status' ? status : producer?.outputs?.[name]
  return value === undefined || is?.includes(value)
    ? undefined
    : `${output} is ${JSON.stringify(value)}`
}

/** The mismatch or unavailable fact preventing `when` from matching. */
async function whenFailure(
  when: When | undefined,
  state: RunStateFile,
  card: (() => Promise<CardFacts>) | undefined,
): Promise<{ reason: string; unavailable?: true } | undefined> {
  if (when === undefined) return undefined
  const { output, is, ...filter } = when
  const outputReason = output === undefined ? undefined : outputMismatch(output, is, state)
  if (Object.keys(filter).length > 0 && card !== undefined) {
    const facts = await card()
    if (
      facts.statusError !== undefined &&
      effectiveSelection(undefined, undefined, filter).needsStatus(facts)
    )
      return outputReason === undefined
        ? { reason: facts.statusError, unavailable: true }
        : { reason: outputReason }
    if (!matches(filter, facts)) return { reason: `card does not match ${JSON.stringify(filter)}` }
  }
  return outputReason === undefined ? undefined : { reason: outputReason }
}

/** Persists a known mismatch. An unavailable fact leaves the step eligible for retry. */
async function checkWhen(
  run: RunDirectory,
  state: RunStateFile,
  step: Step,
  card: (() => Promise<CardFacts>) | undefined,
): Promise<{ step: SkippedStep; error?: string } | undefined> {
  const inLoop = step.kind === 'loop'
  const child = inLoop ? loopChild(state, step).child : undefined
  const target = child ?? step
  const id = inLoop ? `${step.id}/${target.id}` : step.id
  if (awaitingTransition(state.steps[id])) return undefined
  const failure = await whenFailure(target.when, state, card)
  if (failure === undefined) return undefined
  const checked = { id, kind: target.kind as KindName }
  if (failure.unavailable) return { step: checked, error: failure.reason }
  const entry: StepRecord = {
    state: 'skipped',
    ...executionHistory(state.steps[id]),
    summary: 'skipped: when did not match',
    reason: failure.reason,
  }
  const recorded = { ...state.steps, [id]: entry }
  const progress: Progress = inLoop
    ? advanceLoop({ state, outer: step, child: target, status: 'ok', outputs: {} }, recorded)
    : { steps: recorded, loops: state.loops }
  await writeState(run, {
    ...state,
    steps: progress.steps,
    ...(progress.loops !== undefined && { loops: progress.loops }),
  })
  observeExhaustion(run, progress)
  return { step: checked }
}

const assignmentOf = (workflow: Workflow, step: Step, run?: RunDirectory) => {
  const configuration =
    run === undefined ? undefined : parsedFrozenConfiguration(run)?.configuration
  const assignment = assignmentFor(workflow, step, configuration)
  return assignment === undefined ? {} : { assignment }
}

function plainLaunch(
  state: RunStateFile,
  workflow: Workflow,
  step: Step,
  run?: RunDirectory,
): StepLaunch {
  if (step.kind === 'loop') throw new Error('loop is not directly launchable')
  const attempt = launches(state, step.id)
  const replayAttempt = replayAttemptOf(state)
  const saved = state.steps[step.id]
  return {
    id: step.id,
    kind: step.kind,
    uses: step.skill ?? kindByName[step.kind].defaultSkill ?? '',
    with: step.with ?? {},
    ...gatesOf(step),
    ...agentOptionsOf(step),
    ...boardStatesOf(step),
    ...pendingOf(saved),
    ...retryBoardStatusOf(saved),
    ...assignmentOf(workflow, step, run),
    inputs: pick(inputsBefore(step, workflow.steps, state), step.kind),
    attempt,
    ...(replayAttempt !== undefined && { replayAttempt }),
  }
}

/** The previously started, final merge can finish closure without reopening prior steps or their conditions. */
export function pendingMergeClosure(
  workflow: Workflow,
  state: RunStateFile,
): StepLaunch | undefined {
  const steps = workflow.steps
  const merge = steps.at(-1)
  if (
    merge?.kind !== 'merge' ||
    !['failed', 'running'].includes(state.steps[merge.id]?.state ?? '')
  )
    return undefined
  if (!steps.slice(0, -1).every(step => stepSettled(step, state.steps[step.id]?.state)))
    return undefined
  return plainLaunch(state, workflow, merge)
}

interface Advance {
  readonly state: RunStateFile
  readonly outer: Step
  readonly child: Step
  readonly status: StepStatus
  readonly outputs: Record<string, unknown>
}
interface Progress {
  steps: Record<string, StepRecord>
  loops: RunStateFile['loops']
  exhaustion?: Extract<EngineOutcome, { status: 'exhausted' }>
}

function observeExhaustion(run: RunDirectory, { exhaustion }: Progress): void {
  if (exhaustion !== undefined) run.observeOutcome?.(exhaustion)
}

/** The round is over and the loop goes on: max stops it, otherwise the children run again. */
function closeRound({ state, outer, outputs }: Advance, { steps, loops }: Progress): Progress {
  const outerId = outer.id
  const loop = loops?.[outerId]
  if (loop === undefined) throw new Error(`run-state-unreadable: loop ${outerId} has no round`)
  if (loop.round >= loop.max) {
    const reason = 'loop-max'
    const summary = `loop ${outerId} reached ${loop.max} rounds`
    const rule = explicitEscalation(outer, 'exhausted')
    return {
      steps: {
        ...steps,
        [outerId]: {
          state: 'exhausted',
          outputs: mergeOutputs(loop.untilResult, state.latest, outputs),
          reason,
          summary,
        },
      },
      loops: { ...state.loops, [outerId]: { ...loop, exhausted: true } },
      exhaustion: {
        id: outerId,
        status: 'exhausted',
        round: loop.round,
        reason,
        summary,
        ...(rule !== undefined && { rule }),
      },
    }
  }
  return {
    steps: {
      ...steps,
      ...Object.fromEntries(
        (outer.steps ?? []).map(child => [
          `${outerId}/${child.id}`,
          {
            state: 'pending' as const,
            executions: 0,
            ...executionHistory(steps[`${outerId}/${child.id}`]),
          },
        ]),
      ),
    },
    loops: { ...state.loops, [outerId]: { ...loop, round: loop.round + 1 } },
  }
}

const withUntilResult = (
  state: RunStateFile,
  id: string,
  untilResult: Record<string, unknown>,
): RunStateFile['loops'] => {
  const loop = state.loops?.[id]
  return loop === undefined ? state.loops : { ...state.loops, [id]: { ...loop, untilResult } }
}

/** A loop child finished: the loop is done, loops back to the next round, or stops at max. */
function advanceLoop(a: Advance, recorded: Record<string, StepRecord>): Progress {
  const { state, outer, child, status, outputs } = a
  const isUntil = child.id === outer.until
  const loops = isUntil ? withUntilResult(state, outer.id, outputs) : state.loops
  const progress = { steps: recorded, loops }
  if (!childSettled(child, status)) return progress
  if (isUntil) {
    if (status === 'ok')
      return {
        steps: {
          ...recorded,
          [outer.id]: { state: 'ok', outputs: mergeOutputs(state.latest, outputs) },
        },
        loops,
      }
  } else if (status === 'failed' && explicitEscalation(child, status) === undefined)
    return closeRound(a, progress)
  return outer.steps?.at(-1)?.id === child.id ? closeRound(a, progress) : progress
}

/** The step `stepId` names (`id` or `loop/id`), with its loop; a loop itself is not launchable. */
function launchable(
  run: RunDirectory,
  stepId: string,
): { step: Step & { kind: KindName }; outer: Step | undefined; childId: string | undefined } {
  const steps = frozenWorkflow(run).steps
  const direct = steps.find(one => one.id === stepId)
  const outer = direct ?? steps.find(one => one.kind === 'loop' && stepId.startsWith(`${one.id}/`))
  const childId = direct || !outer ? undefined : stepId.slice(outer.id.length + 1)
  const step = childId === undefined ? outer : outer?.steps?.find(one => one.id === childId)
  if (step === undefined) throw new Error(`step-unknown: ${stepId} is not a step of ${run.dir}`)
  if (step.kind === 'loop')
    throw new Error(`step-unknown: ${stepId} is a loop, not a launchable step`)
  return { step: step as Step & { kind: KindName }, outer, childId }
}

const resultDir = (run: RunDirectory, stepId: string, round: number | undefined): string =>
  join(run.dir, 'steps', stepId, ...(round === undefined ? [] : [`round-${round}`]))

/** `steps/<id>[/round-n]/result.json` and, when given, `output.log`. */
async function writeResult(
  run: RunDirectory,
  dir: string,
  settled: StepResult,
  output: string | undefined,
): Promise<void> {
  await run.files.mkdir(dir, { recursive: true })
  if (output !== undefined) await run.files.writeFile(join(dir, 'output.log'), output)
  await writeAtomic(run.files, join(dir, 'result.json'), `${JSON.stringify(settled, null, 2)}\n`)
}

const loopRound = (state: RunStateFile, outer: Step | undefined): number | undefined =>
  state.loops?.[outer?.id ?? '']?.round

/** Preserve the confirmed result before the host attempts a remote state write. */
export async function stageSuccess(
  run: RunDirectory,
  id: string,
  result: StepResult,
): Promise<void> {
  const state = requireState(run)
  const step = state.steps[id]
  if (step?.state !== 'running' || step.pendingSuccess !== undefined) return
  await writeState(run, {
    ...state,
    steps: { ...state.steps, [id]: { ...step, pendingSuccess: result } },
  })
}

/** The `state.json` entry of a settled result. */
function recordOf(
  { status, summary, reason, detail }: StepResult,
  outputs: Record<string, unknown>,
  round: number | undefined,
  previous: StepRecord | undefined,
): StepRecord {
  return {
    state: status,
    ...(round !== undefined && { round }),
    ...executionHistory(previous),
    summary,
    ...(reason !== undefined && { reason }),
    ...(detail !== undefined && { detail }),
    outputs,
  }
}

type RecordOptions = {
  readonly output?: string | undefined
  readonly invalidatePendingSuccess?: boolean | undefined
}

function retryAfter(status: StepStatus, previous?: StepRecord, invalidate?: boolean) {
  if (status === 'ok') return {}
  const retryBoardStatus =
    previous?.retryBoardStatus ??
    (invalidate ? previous?.pendingSuccess?.['boardStatus'] : undefined)
  return {
    ...(status === 'failed' && !invalidate ? pendingOf(previous) : {}),
    ...(typeof retryBoardStatus === 'string' && { retryBoardStatus }),
  }
}

const recordOptions = (value: string | RecordOptions | undefined): RecordOptions =>
  typeof value === 'string' ? { output: value } : (value ?? {})

function observeEscalation(
  run: RunDirectory,
  { id, round }: { id: string; round: number | undefined },
  step: Step,
  result: StepResult,
): void {
  const { status, summary, reason } = result
  const rule = explicitEscalation(step, status)
  if (status !== 'ok' && rule !== undefined)
    run.observeOutcome?.({
      id,
      status,
      rule,
      summary,
      ...(round !== undefined && { round }),
      ...(reason !== undefined && { reason }),
    })
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
  outputOrOptions?: string | RecordOptions,
): Promise<StepResult> {
  const { output, invalidatePendingSuccess } = recordOptions(outputOrOptions)
  const state = requireState(run)
  const { step, outer, childId } = launchable(run, stepId)
  const kind = kindByName[step.kind]
  const settled = settle(kind, result)
  const round = childId === undefined ? undefined : loopRound(state, outer)
  await writeResult(run, resultDir(run, stepId, round), settled, output)
  const { status } = settled
  const outputs = Object.fromEntries(
    fieldsOf(kind.outputs)
      .filter(name => name in settled)
      .map(name => [name, settled[name]]),
  )
  const previous = state.steps[stepId]
  const entry = {
    ...recordOf(settled, outputs, round, previous),
    ...retryAfter(status, previous, invalidatePendingSuccess),
  }
  const progress: Progress =
    childId !== undefined && outer?.kind === 'loop'
      ? advanceLoop(
          { state, outer, child: step, status, outputs },
          { ...state.steps, [stepId]: entry },
        )
      : { steps: { ...state.steps, [stepId]: entry }, loops: state.loops }
  const { steps, loops } = progress
  await writeState(run, {
    ...state,
    steps,
    ...(loops !== undefined && { loops, latest: mergeOutputs(state.latest, outputs) }),
  })
  observeEscalation(run, { id: stepId, round }, step, settled)
  observeExhaustion(run, progress)
  return settled
}
