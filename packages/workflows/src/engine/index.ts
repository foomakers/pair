import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'
import { parseWorkflow, type KindName, type Step, type When, type Workflow } from '../grammar'
import { parseFrozenConfiguration } from '../configuration'
import { fieldsOf, kindByName, settle, type StepResult, type StepStatus } from '../kinds'
import { matches, type CardFacts } from '../select'

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
/** The run's effective configuration, frozen at start (replaced only by `--reconfigure`). */
export const FROZEN_CONFIGURATION = 'configuration.yaml'
/** The run's telemetry, when it is on: written by `../telemetry`, archived with the run. */
export const TELEMETRY_FILE = 'telemetry.jsonl'

/** `skipped`: the step's `when` did not match when it was about to start; it produces no outputs. */
export type StepState = 'pending' | 'running' | 'skipped' | 'needs-human' | StepStatus
export type RunState = 'running' | 'done' | 'failed' | 'parked'

export interface StepRecord {
  readonly state: StepState
  readonly round?: number
  /** How many times the step was launched in this run. */
  readonly executions?: number
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
  /** Present when the run froze a configuration; `override` is the `--config-override` applied, as given. */
  readonly configuration?: { readonly hash: string; readonly override?: unknown } | undefined
  readonly steps: Readonly<Record<string, StepRecord>>
  readonly loops?: Readonly<Record<string, LoopRecord>>
  readonly latest?: Readonly<Record<string, unknown>>
  readonly replay?: StepReplay
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
  /** Validation the host runs after the step ends `ok`. */
  readonly gates?: readonly string[]
  readonly inputs: Readonly<Record<string, unknown>>
  /** The number of this execution of the step in the run: 1 the first time. */
  readonly attempt: number
  readonly round?: number
  /** Distinguishes a replay from earlier executions that used the same inputs. */
  readonly replayAttempt?: number
}

export const hashOf = (text: string): string =>
  `sha256:${createHash('sha256').update(text).digest('hex')}`

/** Temp file, then rename: a reader never sees half a file. */
export async function writeAtomic(files: RunFiles, path: string, content: string): Promise<void> {
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
function parkedLoop(
  state: RunStateFile,
  exhausted: [string, LoopRecord] | undefined,
  moreRounds: number,
): [string, LoopRecord] {
  if (exhausted === undefined || state.steps[exhausted[0]]?.state !== 'needs-human')
    throw new Error('more-rounds-invalid: no loop is parked at max')
  if (!Number.isInteger(moreRounds) || moreRounds < 1)
    throw new Error('more-rounds-invalid: pass a positive integer')
  return exhausted
}

/** `--more-rounds`: reopens the loop parked at max with the extra rounds granted. */
function withMoreRounds(
  run: RunDirectory,
  state: RunStateFile,
  exhausted: [string, LoopRecord] | undefined,
  options: StartOptions & { readonly moreRounds: number },
): RunStateFile {
  const [id, loop] = parkedLoop(state, exhausted, options.moreRounds)
  const grants = [
    ...(loop.grants ?? []),
    {
      rounds: options.moreRounds,
      by: options.requestedBy ?? 'unknown',
      at: (options.now ?? new Date()).toISOString(),
    },
  ]
  const children = frozenWorkflow(run).steps.find(step => step.id === id)?.steps ?? []
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
          { state: 'pending', executions: state.steps[`${id}/${child.id}`]?.executions ?? 0 },
        ]),
      ),
    },
  }
}

/** The loop stopped at max, parked or failed. */
const exhaustedLoop = (state: RunStateFile): [string, LoopRecord] | undefined =>
  Object.entries(state.loops ?? {}).find(
    ([id, loop]) =>
      loop.exhausted && ['needs-human', 'failed'].includes(state.steps[id]?.state ?? ''),
  )

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
  run: RunDirectory,
  state: RunStateFile,
  exhausted: ReturnType<typeof exhaustedLoop>,
): 'failed' | 'parked' | 'complete' | undefined {
  if (exhausted !== undefined)
    return state.steps[exhausted[0]]?.state === 'failed' ? 'failed' : 'parked'
  return frozenWorkflow(run).steps.every(step =>
    ['ok', 'skipped'].includes(state.steps[step.id]?.state ?? ''),
  )
    ? 'complete'
    : undefined
}

async function resume(
  run: RunDirectory,
  saved: RunStateFile,
  source: { readonly text: string; readonly file: string },
  options: StartOptions,
): Promise<Started> {
  let state = saved
  const { configuration } = options
  const warnings = workflowWarnings(run, state, source, options.card)
  if (options.moreRounds !== undefined) parkedLoop(state, exhaustedLoop(state), options.moreRounds)
  if (configuration !== undefined && options.reconfigure === true)
    state = await reconfigured(run, state, configuration)
  else warnings.push(...configurationWarnings(run, state, configuration))
  const exhausted = exhaustedLoop(state)
  if (options.moreRounds !== undefined)
    state = withMoreRounds(run, state, exhausted, { ...options, moreRounds: options.moreRounds })
  if (options.replay !== undefined) state = replayFrom(run, state, options.replay)
  const settled = settledStatus(
    run,
    state,
    options.moreRounds === undefined ? exhaustedLoop(state) : undefined,
  )
  if (settled === undefined) {
    await writeState(run, { ...state, steps: reopenedSteps(state, frozenWorkflow(run)) })
    return { status: 'resumed', warnings }
  }
  if (state !== saved) await writeState(run, state)
  return { status: settled, warnings }
}

function replayFrom(run: RunDirectory, state: RunStateFile, replay: StepReplay): RunStateFile {
  const steps = frozenWorkflow(run).steps
  const from = steps.findIndex(step => step.id === replay.from)
  if (from < 0) throw new Error('run-replay-invalid: expected a top-level step')
  const records = { ...state.steps }
  const loops = { ...state.loops }
  for (const step of steps.slice(from)) {
    const executions = records[step.id]?.executions
    records[step.id] = { state: 'pending', ...(executions !== undefined && { executions }) }
    if (step.kind === 'loop') {
      loops[step.id] = { round: 1, max: loopMax(frozenConfiguration(run), step) }
      for (const child of step.steps ?? []) {
        const id = `${step.id}/${child.id}`
        const count = records[id]?.executions
        records[id] = { state: 'pending', ...(count !== undefined && { executions: count }) }
      }
    }
  }
  return { ...state, steps: records, loops, latest: {}, replay }
}

// A failed or parked step runs again; a `running` one had no live process (the lock says so) and runs again too.
function reopenedSteps(state: RunStateFile, workflow: Workflow): Record<string, StepRecord> {
  const topLevelIds = new Set(workflow.steps.map(step => step.id))
  return Object.fromEntries(
    Object.entries(state.steps).map(([id, step]) => [
      id,
      step.state === 'ok' || (step.state === 'failed' && !topLevelIds.has(id))
        ? step
        : {
            state: 'pending' as const,
            ...(step.executions !== undefined && { executions: step.executions }),
          },
    ]),
  )
}

/** The state of a run that has not launched anything. */
function initialState(workflow: Workflow, text: string, options: StartOptions): RunStateFile {
  const { configuration } = options
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    workflow: { name: workflow.name, hash: hashOf(text) },
    card: options.card,
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
  return Object.assign({ card: state.card }, ...earlier)
}

const HALTED: Partial<Record<StepState, RunState>> = {
  failed: 'failed',
  blocked: 'parked',
  'needs-decision': 'parked',
  'needs-human': 'parked',
}

/** A step the run is past: `ok`, or `failed` with `on-failed: continue`. */
const settled = (state: RunStateFile, step: Step): boolean => {
  const at = state.steps[step.id]?.state
  return at === 'ok' || at === 'skipped' || (at === 'failed' && step['on-failed'] === 'continue')
}

/** The state of a run with nothing left to launch: the last step decides. */
const finalState = (state: RunStateFile, steps: readonly Step[]): RunState =>
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
  const child = step.steps?.find(one => {
    const at = state.steps[`${step.id}/${one.id}`]?.state
    return at !== 'ok' && at !== 'failed' && at !== 'skipped'
  })
  if (child === undefined) throw new Error(`run-state-unreadable: loop ${step.id} has no next step`)
  if (child.kind === 'loop') throw new Error('nested loop is not launchable')
  return { child: child as Step & { kind: KindName }, id: `${step.id}/${child.id}` }
}

const gatesOf = (step: Step) => (step.gates ? { gates: step.gates } : {})

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

/** The launch of the loop child that is next, or the halt that stops the run. */
async function nextInLoop(
  run: RunDirectory,
  state: RunStateFile,
  steps: readonly Step[],
  step: Step,
): Promise<{ readonly ready: readonly StepLaunch[]; readonly run: RunState }> {
  const { child, id } = loopChild(state, step)
  const childHalt = HALTED[state.steps[id]?.state ?? 'pending']
  if (childHalt !== undefined) return { ready: [], run: childHalt }
  const attempt = launches(state, id)
  const round = state.loops?.[step.id]?.round ?? 1
  const replay = replayLaunch(state)
  await writeState(run, {
    ...state,
    steps: {
      ...state.steps,
      [step.id]: { state: 'running', round },
      [id]: { state: 'running', executions: attempt, round },
    },
  })
  const launch: StepLaunch = {
    id,
    kind: child.kind,
    uses: child.skill ?? kindByName[child.kind].defaultSkill ?? '',
    with: child.with ?? {},
    ...gatesOf(child),
    inputs: pick({ ...inputsBefore(step, steps, state), ...state.latest }, child.kind),
    attempt,
    round,
    ...replay,
  }
  return { ready: [launch], run: 'running' }
}

/**
 * The steps to launch now and the state of the run. Linear: at most one step is ready, and it is
 * written `running` before it is returned, so an interrupted launch is visible on disk.
 */
export async function next(
  run: RunDirectory,
  card?: () => Promise<CardFacts>,
  skipped: SkippedStep[] = [],
): Promise<{
  readonly ready: readonly StepLaunch[]
  readonly run: RunState
  readonly skipped?: readonly SkippedStep[]
}> {
  const state = requireState(run)
  const { steps } = frozenWorkflow(run)
  const step = steps.find(one => !settled(state, one))
  if (step === undefined) return { ready: [], run: finalState(state, steps), ...seen(skipped) }
  const halted = HALTED[state.steps[step.id]?.state ?? 'pending']
  if (halted !== undefined) return { ready: [], run: halted, ...seen(skipped) }
  const skip = await skipIfNotWhen(run, state, step, card)
  if (skip !== undefined) return next(run, card, [...skipped, skip])
  const launched = await (step.kind === 'loop'
    ? nextInLoop(run, state, steps, step)
    : nextPlain(run, state, steps, step))
  return { ...launched, ...seen(skipped) }
}

const seen = (skipped: SkippedStep[]) => (skipped.length > 0 ? { skipped } : {})

/** A step the run passed over because its `when` did not match. */
export interface SkippedStep {
  readonly id: string
  readonly kind: KindName
}

/** Why the named output is not in the list; an output the producer never returned (it failed or crashed) is no mismatch. */
function outputMismatch(
  output: string,
  is: readonly unknown[] | undefined,
  state: RunStateFile,
): string | undefined {
  const [stepId, name] = output.split('.') as [string, string]
  const value = state.steps[stepId]?.outputs?.[name]
  return value === undefined || is?.includes(value)
    ? undefined
    : `${output} is ${JSON.stringify(value)}`
}

/** Why `when` does not match now, or `undefined` when the step runs. */
async function whenMismatch(
  when: When | undefined,
  state: RunStateFile,
  card: (() => Promise<CardFacts>) | undefined,
): Promise<string | undefined> {
  if (when === undefined) return undefined
  const { output, is, ...filter } = when
  if (Object.keys(filter).length > 0 && card !== undefined && !matches(filter, await card()))
    return `card does not match ${JSON.stringify(filter)}`
  return output === undefined ? undefined : outputMismatch(output, is, state)
}

/** Writes `skipped` for the step about to start when its `when` does not match; a loop checks its next child. */
async function skipIfNotWhen(
  run: RunDirectory,
  state: RunStateFile,
  step: Step,
  card: (() => Promise<CardFacts>) | undefined,
): Promise<SkippedStep | undefined> {
  const inLoop = step.kind === 'loop'
  const child = inLoop ? loopChild(state, step).child : undefined
  const target = child ?? step
  const id = inLoop ? `${step.id}/${target.id}` : step.id
  const why = await whenMismatch(target.when, state, card)
  if (why === undefined) return undefined
  const entry: StepRecord = {
    state: 'skipped',
    summary: 'skipped: when did not match',
    reason: why,
  }
  const recorded = { ...state.steps, [id]: entry }
  const progress = inLoop
    ? advanceLoop({ state, outer: step, childId: target.id, status: 'ok', outputs: {} }, recorded)
    : { steps: recorded, loops: state.loops }
  await writeState(run, {
    ...state,
    steps: progress.steps,
    ...(progress.loops !== undefined && { loops: progress.loops }),
  })
  return { id, kind: target.kind as KindName }
}

async function nextPlain(
  run: RunDirectory,
  state: RunStateFile,
  steps: readonly Step[],
  step: Step,
): Promise<{ readonly ready: readonly StepLaunch[]; readonly run: RunState }> {
  const launch = plainLaunch(state, steps, step)
  await writeState(run, {
    ...state,
    steps: { ...state.steps, [step.id]: { state: 'running', executions: launch.attempt } },
  })
  return { ready: [launch], run: 'running' }
}

function plainLaunch(state: RunStateFile, steps: readonly Step[], step: Step): StepLaunch {
  if (step.kind === 'loop') throw new Error('loop is not directly launchable')
  const attempt = launches(state, step.id)
  const replayAttempt = replayAttemptOf(state)
  return {
    id: step.id,
    kind: step.kind,
    uses: step.skill ?? kindByName[step.kind].defaultSkill ?? '',
    with: step.with ?? {},
    ...gatesOf(step),
    inputs: pick(inputsBefore(step, steps, state), step.kind),
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
  if (!steps.slice(0, -1).every(step => settled(state, step))) return undefined
  return plainLaunch(state, steps, merge)
}

interface Advance {
  readonly state: RunStateFile
  readonly outer: Step
  readonly childId: string
  readonly status: StepStatus
  readonly outputs: Record<string, unknown>
}
interface Progress {
  steps: Record<string, StepRecord>
  loops: RunStateFile['loops']
}

/** The round is over and the loop goes on: max stops it, otherwise the children run again. */
function closeRound({ state, outer }: Advance, { steps, loops }: Progress): Progress {
  const outerId = outer.id
  const loop = loops?.[outerId]
  if (loop === undefined) throw new Error(`run-state-unreadable: loop ${outerId} has no round`)
  if (loop.round >= loop.max)
    return {
      steps: {
        ...steps,
        [outerId]: {
          state: outer['on-max'] === 'escalate' ? 'needs-human' : 'failed',
          outputs: loop.untilResult ?? {},
          reason: 'loop-max',
          summary: `loop ${outerId} reached ${loop.max} rounds`,
        },
      },
      loops: { ...state.loops, [outerId]: { ...loop, exhausted: true } },
    }
  return {
    steps: {
      ...steps,
      ...Object.fromEntries(
        (outer.steps ?? []).map(child => [
          `${outerId}/${child.id}`,
          {
            state: 'pending' as const,
            executions: steps[`${outerId}/${child.id}`]?.executions ?? 0,
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
  const { state, outer, childId, status, outputs } = a
  const isUntil = childId === outer.until
  const loops = isUntil ? withUntilResult(state, outer.id, outputs) : state.loops
  const progress = { steps: recorded, loops }
  if (HALTED[status] === 'parked') return progress
  if (isUntil && status === 'ok')
    return {
      steps: { ...recorded, [outer.id]: { state: 'ok', outputs: { ...state.latest, ...outputs } } },
      loops,
    }
  const children = outer.steps ?? []
  const last = children[children.length - 1]?.id === childId
  return (status === 'failed' && !isUntil) || last ? closeRound(a, progress) : progress
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

/** The `state.json` entry of a settled result. */
function recordOf(
  { status, summary, reason, detail }: StepResult,
  outputs: Record<string, unknown>,
  round: number | undefined,
  executions: number | undefined,
): StepRecord {
  return {
    state: status,
    ...(round !== undefined && { round }),
    ...(executions !== undefined && { executions }),
    summary,
    ...(reason !== undefined && { reason }),
    ...(detail !== undefined && { detail }),
    outputs,
  }
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
  const entry = recordOf(settled, outputs, round, state.steps[stepId]?.executions)
  const { steps, loops } =
    childId !== undefined && outer?.kind === 'loop'
      ? advanceLoop({ state, outer, childId, status, outputs }, { ...state.steps, [stepId]: entry })
      : { steps: { ...state.steps, [stepId]: entry }, loops: state.loops }
  await writeState(run, {
    ...state,
    steps,
    ...(loops !== undefined && { loops, latest: { ...state.latest, ...outputs } }),
  })
  return settled
}
