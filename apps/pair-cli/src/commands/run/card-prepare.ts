import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import chalk from 'chalk'
import type { FileSystemService } from '@pair/content-ops'
import type { RunCommandConfig } from './parser'
import type { CycleHooks } from './cycle'
import {
  createCycleHooksBridge,
  createCycleScriptsBridge,
  cycleHooksPolicyPath,
  locateCycleScripts,
  type CycleScriptsBridge,
  type CycleScriptsLocation,
  type PrepareBoundary,
  type PrepareDecision,
  type PrepareEscalateOptions,
  type PrepareEscalation,
  type PrepareGateValue,
  type PrepareReadiness,
} from './cycle-scripts'
import { mainCheckoutOrCwd, readCardDocumentViaGh, readCardLabels } from './cycle-wiring'
import type { RunContext } from './run-context'

/**
 * The autonomous PREPARE phase of `run --card` (US-523, ADR-028): refinement + task breakdown driven by
 * the prepare gate, before the delivery cycle's own state machine (A1 — the cycle's `prepare` STEP is
 * red-spec and is untouched; this phase's audit/stage names are `prepare:refine` / `prepare:plan`).
 *
 * pair-cli holds NO prepare rule: every route, every escalation and the Ready write come from
 * `cycle-prepare.mjs` through the script bridge — the same script the in-session cycle skill and the
 * batch call, so every entry takes the same decision for the same policy and card (AC11).
 */

/** The line a card process prints so the loop's per-iteration report can count prepare outcomes. */
export const PREPARE_RESULT_PREFIX = 'PREPARE-RESULT:'
export type PrepareResult = 'prepared' | 'escalated' | 'needs-human' | 'failed'

/** The workflow name the audit trail records for the lock around the autonomous phase. */
export const PREPARE_WORKFLOW = 'pair-prepare'

export const REFINE_SKILL = 'pair-process-refine-story'
export const PLAN_SKILL = 'pair-process-plan-tasks'

/** What the autonomous drive asks of the skills: `$approval: auto` and — alone unlocking phase 0 — `$prepare`. */
export interface PromptExtras {
  readonly approval: 'auto'
  readonly prepare?: 'never' | 'when'
}

/** The test seam: every collaborator the phase uses, each defaulting to the shipped one. */
export interface PrepareDependencies {
  readonly bridge?: Pick<
    CycleScriptsBridge,
    'prepareDecide' | 'prepareEscalate' | 'prepareComplete'
  > &
    Partial<Pick<CycleScriptsBridge, 'bindHosts'>>
  /** The card's labels NOW; `undefined` = unreadable (a `when` gate then escalates). */
  readonly readLabels?: (card: string, cwd: string) => readonly string[] | undefined
  /** The card body NOW (for `## Assumptions` / `## Open Questions`); `undefined` = unreadable. */
  readonly readBody?: (card: string, cwd: string) => string | undefined
  /** `## Cycle Hooks` — only `on-halt` is fired here. */
  readonly hooks?: Pick<CycleHooks, 'run'>
}

/** What the entry hands the phase: today's behaviours as callbacks, so nothing here imports card-entry. */
export interface PrepareRoutes {
  /** Today's "needs a human" skip, audited as `prepare-needs-human`. */
  skipNeedsHuman(): number
  /** The card carries `needs-review`: skipped as escalated, audited `escalated`. */
  skipEscalated(): number
  /** Today's supervised route: the skill, interactive, under the lock. */
  interactive(): Promise<number>
  /** One preparation skill with the given prompt extras, run INSIDE the held lock. */
  driveSkill(skill: string, label: string, extras: PromptExtras): Promise<number>
  /** The delivery cycle (own lock + audit) — entered only after the phase released its lock. */
  enterCycle(): Promise<number>
  /** The per-card lock + start/end audit + signal trap around one drive. */
  underLock(workflow: string, run: () => Promise<number>): Promise<number>
}

export interface PrepareEntry {
  readonly config: RunCommandConfig
  readonly context: RunContext
  readonly fs: FileSystemService
  readonly cwd: string
  readonly card: string
}

interface Phase {
  readonly bridge: NonNullable<PrepareDependencies['bridge']>
  readonly runDir: string
  readonly gate: PrepareGateValue
  readonly source: string
  readonly attended: boolean
  readonly until: string
  labels(): readonly string[] | undefined
  body(): string | undefined
  halt(status: string): Promise<void>
}

/** Everything one prepare drive needs, bundled: the entry, its phase and the callbacks into today's routes. */
interface Drive {
  readonly entry: PrepareEntry
  readonly phase: Phase
  readonly routes: PrepareRoutes
}

/** The effective gate and where it came from — resolved once at the entry, never re-read. */
interface EffectiveGate {
  readonly gate: PrepareGateValue
  readonly source: string
  readonly until: string
}

export const NEEDS_REVIEW = 'needs-review'

/** The `## <heading>` section's text up to the next `##` heading; `null` when absent. */
export function sectionOf(body: string | undefined, heading: string): string | null {
  if (body === undefined) return null
  const m = new RegExp(`^##\\s+${heading}\\s*$`, 'm').exec(body)
  if (m === null) return null
  const rest = body.slice(m.index + m[0].length)
  const next = /^##\s/m.exec(rest)
  return (next === null ? rest : rest.slice(0, next.index)).trim()
}

/** The open questions the refinement left (AC10) — one line, or `undefined` when there are none. */
export function openQuestionOf(body: string | undefined): string | undefined {
  const section = sectionOf(body, 'Open Questions')
  if (section === null || section.length === 0 || /^none\b/i.test(section)) return undefined
  return section.replace(/\s*\n\s*/g, ' ').slice(0, 500)
}

/** The prepare outcome a card process printed on a line, when that line is the `PREPARE-RESULT:` one. */
export function parsePrepareResult(line: string): PrepareResult | undefined {
  const value = line.startsWith(PREPARE_RESULT_PREFIX)
    ? line.slice(PREPARE_RESULT_PREFIX.length).trim()
    : undefined
  return value === 'prepared' ||
    value === 'escalated' ||
    value === 'needs-human' ||
    value === 'failed'
    ? value
    : undefined
}

function say(result: PrepareResult): void {
  console.log(`${PREPARE_RESULT_PREFIX} ${result}`)
}

/** `## Cycle Hooks`' `on-halt`, when the installed hooks script is reachable — a logging hook, never a stop. */
function hooksFor(
  entry: PrepareEntry,
  deps: PrepareDependencies,
  location: () => CycleScriptsLocation,
): Pick<CycleHooks, 'run'> | undefined {
  if (deps.hooks !== undefined) return deps.hooks
  try {
    const main = mainCheckoutOrCwd(entry.cwd)
    return createCycleHooksBridge(location(), { policyPath: cycleHooksPolicyPath(main), cwd: main })
  } catch {
    return undefined
  }
}

function phaseFor(entry: PrepareEntry, effective: EffectiveGate, deps: PrepareDependencies): Phase {
  const { config, context, fs, cwd, card } = entry
  const runId = config.dispatch?.runId ?? `story-${card}`
  const runDir = `${mainCheckoutOrCwd(cwd)}/.pair/working/runs/${runId}/${card}`
  let located: CycleScriptsLocation | undefined
  const location = () => (located ??= locateCycleScripts(fs, context.config, cwd))
  const bridge = deps.bridge ?? createCycleScriptsBridge(location(), cwd)
  const hooks = hooksFor(entry, deps, location)
  const readBody = deps.readBody ?? ((c, d) => readCardDocumentViaGh(c, d).body)
  return {
    ...effective,
    bridge,
    runDir,
    attended: config.autonomous !== true,
    labels: () => (deps.readLabels ?? readCardLabels)(card, cwd),
    body: () => {
      try {
        return readBody(card, cwd)
      } catch {
        return undefined
      }
    },
    halt: async status => {
      try {
        await hooks?.run('on-halt', status)
      } catch (error) {
        console.log(chalk.yellow(`  ! on-halt hook failed: ${(error as Error).message}`))
      }
    },
  }
}

/** Today's behaviour, byte for byte: unattended skips, a supervised run drives the interactive skill. */
async function legacyRoute(entry: PrepareEntry, routes: PrepareRoutes): Promise<number> {
  return entry.config.autonomous === true ? routes.skipNeedsHuman() : await routes.interactive()
}

function effectiveGateOf(entry: PrepareEntry): EffectiveGate | undefined {
  const selection = entry.context.autonomySelection
  if (selection === undefined) return undefined
  return {
    gate: selection.policy.prepare as PrepareGateValue,
    source: selection.effective?.['prepare']?.source ?? 'default',
    until: selection.policy.until,
  }
}

/**
 * The prepare phase for a Draft / `refined-no-breakdown` card, from the gate down. No autonomy
 * resolution (no cycle scripts installed, nothing passed) ⇒ today's behaviour, byte for byte; so is an
 * installation that predates the prepare script under the default gate — only a declared `never`/`when`
 * needs the script (and then says so: `skill-outdated`).
 */
export async function handlePreparation(
  entry: PrepareEntry,
  readiness: Exclude<PrepareReadiness, 'ready'>,
  routes: PrepareRoutes,
  deps: PrepareDependencies = {},
): Promise<number> {
  const effective = effectiveGateOf(entry)
  if (effective === undefined) return await legacyRoute(entry, routes)
  if (
    effective.gate.mode === 'always' &&
    deps.bridge === undefined &&
    !prepareScriptInstalled(entry)
  ) {
    return await legacyRoute(entry, routes)
  }
  const drive: Drive = { entry, phase: phaseFor(entry, effective, deps), routes }
  const boundary: PrepareBoundary = readiness === 'draft' ? 'B0' : 'B1'
  const decision = drive.phase.bridge.prepareDecide({
    gate: effective.gate,
    readiness,
    attended: drive.phase.attended,
    boundary,
    labels: drive.phase.labels(),
    source: effective.source,
  })
  console.log(
    `  Prepare: ${decision.gate} (source: ${effective.source}) — ${decision.route} at ${decision.boundary}` +
      (decision.condition !== undefined ? ` [${decision.condition}]` : ''),
  )
  return await follow(drive, readiness, decision)
}

/** One route, one behaviour — the decision itself is the script's. */
async function follow(
  drive: Drive,
  readiness: Exclude<PrepareReadiness, 'ready'>,
  decision: PrepareDecision,
): Promise<number> {
  const { entry, routes } = drive
  if (decision.route === 'run-autonomous') return await runAutonomous(drive, readiness)
  if (decision.route === 'run-interactive') return await routes.interactive()
  if (decision.route === 'escalate') {
    const conditions = decision.conditions ?? [decision.condition ?? 'unknown']
    return await routes.underLock(PREPARE_WORKFLOW, () =>
      writeEscalation(drive, decision.boundary, { conditions }),
    )
  }
  if (decision.route === 'nothing-to-prepare') {
    console.log(`  Card ${entry.card} has nothing to prepare.`)
    return 0
  }
  say(decision.route === 'skip-escalated' ? 'escalated' : 'needs-human')
  return decision.route === 'skip-escalated' ? routes.skipEscalated() : routes.skipNeedsHuman()
}

function prepareScriptInstalled(entry: PrepareEntry): boolean {
  try {
    const { scriptsDir } = locateCycleScripts(entry.fs, entry.context.config, entry.cwd)
    return existsSync(join(scriptsDir, 'cycle-prepare.mjs'))
  } catch {
    return false
  }
}

interface Reason {
  readonly conditions?: readonly string[]
  readonly openQuestion?: string
}

/** The assumptions recorded so far, handed to the escalation comment through a file in the run directory. */
function assumptionsFileOf(phase: Phase): string | undefined {
  const assumptions = sectionOf(phase.body(), 'Assumptions')
  if (assumptions === null || assumptions.length === 0) return undefined
  mkdirSync(phase.runDir, { recursive: true })
  const file = join(phase.runDir, 'prepare-assumptions.md')
  writeFileSync(file, assumptions)
  return file
}

const describeReason = (reason: Reason): string =>
  reason.openQuestion ?? (reason.conditions ?? []).join(', ')

/** The reason as the script's own flags: conditions XOR one open question (never both, never neither). */
function reasonArguments(
  reason: Reason,
): Pick<PrepareEscalateOptions, 'conditions' | 'openQuestion'> {
  return reason.openQuestion === undefined
    ? { conditions: reason.conditions ?? [] }
    : { openQuestion: reason.openQuestion }
}

function describeWrites(out: PrepareEscalation): string {
  const label = out.label.applied ? 'added' : `NOT added (${out.label.error ?? 'unconfirmed'})`
  const comment = out.comment.posted ? 'posted' : `NOT posted (${out.comment.error ?? 'unknown'})`
  return `needs-review label: ${label} · comment: ${comment}`
}

/** AC6/AC10: label + ONE marker comment, the card stays Draft; exit 1 and `on-halt`. Runs inside the held lock. */
async function writeEscalation(
  drive: Drive,
  boundary: PrepareBoundary,
  reason: Reason,
): Promise<number> {
  const { entry, phase } = drive
  phase.bridge.bindHosts?.(phase.runDir)
  const assumptionsFile = assumptionsFileOf(phase)
  const out = phase.bridge.prepareEscalate({
    dir: phase.runDir,
    story: entry.card,
    boundary,
    gate: phase.gate,
    source: phase.source,
    ...reasonArguments(reason),
    ...(assumptionsFile !== undefined && { assumptionsFile }),
  })
  console.log(
    chalk.yellow(
      `  Escalated at ${boundary}: ${describeReason(reason)} — card ${entry.card} stays Draft`,
    ),
  )
  console.log(`  ${describeWrites(out)}`)
  say('escalated')
  await phase.halt('escalated')
  return 1
}

async function fail(phase: Phase, why: string): Promise<number> {
  console.log(chalk.red(`  Prepare failed: ${why} — no Ready was written`))
  say('failed')
  await phase.halt('failed-prepare')
  return 1
}

/**
 * B1/B2: re-read the labels and re-decide through the shared script; the escalation's exit code when the
 * gate fires, else `undefined` (proceed).
 */
async function boundaryStop(drive: Drive, boundary: 'B1' | 'B2'): Promise<number | undefined> {
  const { phase } = drive
  const d = phase.bridge.prepareDecide({
    gate: phase.gate,
    readiness: 'refined-no-breakdown',
    attended: false,
    boundary,
    labels: phase.labels(),
    source: phase.source,
  })
  if (d.route === 'run-autonomous') return undefined
  return await writeEscalation(drive, boundary, {
    conditions: d.conditions ?? [d.condition ?? d.route],
  })
}

/** Refinement then B1 (AC10: an open question escalates even under `never`). `undefined` = proceed to planning. */
async function refineStep(drive: Drive, mode: 'never' | 'when'): Promise<number | undefined> {
  const refined = await drive.routes.driveSkill(
    REFINE_SKILL,
    'Draft (Definition of Ready not met)',
    {
      approval: 'auto',
      prepare: mode,
    },
  )
  if (refined !== 0) return await fail(drive.phase, `prepare:refine exited ${refined}`)
  const open = openQuestionOf(drive.phase.body())
  if (open !== undefined) return await writeEscalation(drive, 'B1', { openQuestion: open })
  return await boundaryStop(drive, 'B1')
}

/** Planning, B2, then the ONE Ready write. 0 = the card is Ready with its breakdown. */
async function planStep(drive: Drive): Promise<number> {
  const { entry, phase, routes } = drive
  const planned = await routes.driveSkill(PLAN_SKILL, 'Refined, task breakdown next', {
    approval: 'auto',
  })
  if (planned !== 0) return await fail(phase, `prepare:plan exited ${planned}`)
  const stopped = await boundaryStop(drive, 'B2')
  if (stopped !== undefined) return stopped
  const done = phase.bridge.prepareComplete({
    dir: phase.runDir,
    story: entry.card,
    gate: phase.gate,
    source: phase.source,
  })
  if (done.completed) {
    console.log(
      `  Prepared: card ${entry.card} is Ready with its task breakdown (prepare: ${phase.gate.mode}, source ${phase.source})`,
    )
    say('prepared')
    return 0
  }
  if (done.escalation === undefined) return await fail(phase, done.reason ?? 'complete refused')
  console.log(
    chalk.yellow(
      `  Escalated at B2: ${(done.conditions ?? []).join(', ')} — card ${entry.card} stays Draft`,
    ),
  )
  say('escalated')
  await phase.halt('escalated')
  return 1
}

/** Refine (Draft only) → B1 → plan → B2 → complete, all under ONE lock; then the cycle unless `until: ready`. */
async function runAutonomous(
  drive: Drive,
  readiness: Exclude<PrepareReadiness, 'ready'>,
): Promise<number> {
  const { entry, phase, routes } = drive
  const mode = phase.gate.mode as 'never' | 'when'
  const code = await routes.underLock(PREPARE_WORKFLOW, async () => {
    const stopped = readiness === 'draft' ? await refineStep(drive, mode) : undefined
    return stopped ?? (await planStep(drive))
  })
  if (code !== 0) return code
  // AC8: `until: ready` stops right after the phase; otherwise the card continues into the cycle.
  if (phase.until !== 'ready') return await routes.enterCycle()
  console.log(
    `  until: ready — stopping after prepare (card ${entry.card} is Ready; no worktree, no branch, no implement)`,
  )
  return 0
}
