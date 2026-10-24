import { execFileSync, spawn, spawnSync } from 'child_process'
import { RUN_EVENTS_ENV, runEventLine, stageLabel, type RunEvent } from './run-events'
import { cardProgress, todoInProgress, type CardProgress } from './card-progress'
import { existsSync, readFileSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import type { EngineDefinition } from './engines'
import {
  runCycle,
  type CycleMergeOutcome,
  type CycleNext,
  type CycleOutcome,
  type CycleResolveAnswer,
  type CycleStageRecord,
  type CycleStageResult,
} from './cycle'
import { AUTO_ADVANCE_OFF, readAutomationPolicy } from './automation-policy'
import {
  createCycleScriptsBridge,
  createCycleHooksBridge,
  cycleHooksPolicyPath,
  type AutonomyResolution,
  type CardReadiness,
  type BaseSyncResult,
  type CycleMergeResult,
  type CycleScriptsLocation,
  type GateRecord,
} from './cycle-scripts'
import { runStage, styleFor } from './stage-runner'
import { spawnIteration } from './spawn'
import { readStateMapping, resolveCardReadiness, type CardDocument } from './card-readiness'
import { resolveBlockingSeverities } from './blocking-severities'
import { checkWithCiWait, type CiWaitOptions } from './ci-wait'
import { wait } from './wait'
import { stageSettings, type ResolvedWorkflowProfile } from './workflow-profile'

/**
 * The PRODUCTION wiring for `run --card`'s two injected collaborators.
 *
 * Both used to default to a function that threw `*-adapter-missing`, on the reasoning that the
 * caller composing the cycle is the one who knows the story's branch and base. Nothing ever
 * composed them: `commands/index.ts` registers `handle: handleRunCommand` with no deps, so every
 * real invocation HALTed — the unit suites passed throughout because they inject fakes. The seam
 * stays (a test still injects), but the DEFAULT is now the real thing.
 *
 * `pair-cli` still holds no PM-tool credentials: reading the card shells out to the operator's own
 * authenticated `gh`, exactly as the rest of this repository reaches the tracker. Delegating to a
 * CLI the user already logged into is not the same as embedding a token.
 */

/**
 * The card template's literal `**Status**:` grammar (the a0 contract's). Production routing reads the
 * board state through `readCardDocumentViaGh` + `card-readiness.ts` instead (review r0-1).
 */
export interface CardRecord {
  readonly status: string
  readonly hasTaskBreakdown: boolean
  readonly title: string
}

/** `**Status**: Refined` in the card template's Epic Context block — the card's own declaration. */
const STATUS_RE = /^\*\*Status\*\*:\s*(.+?)\s*$/m
const BREAKDOWN_RE = /^##\s+Task Breakdown\s*$/m

export function parseCardRecord(title: string, body: string): CardRecord {
  const status = STATUS_RE.exec(body)?.[1]
  if (status === undefined) {
    throw new Error(
      `card-status-unreadable: the card body declares no \`**Status**:\` line, so its macrostate ` +
        `cannot be read. The card template puts it in the Epic Context block.`,
    )
  }
  return { status, hasTaskBreakdown: BREAKDOWN_RE.test(body), title }
}

/**
 * The tracker could not be asked at all (`gh` absent, unauthenticated, offline) — a fact about the
 * transport, never about the card. Typed so the one caller that treats it as a clean skip (AC14-G1:
 * no mapping declared + card unreadable) can tell it from a card that WAS read and is malformed.
 */
export class CardUnreadableError extends Error {
  override readonly name = 'CardUnreadableError'
}

/** The card as `cycle-state.mjs card` prints it (US-572) — one shape whatever PM tool is bound. */
interface CardView {
  readonly title: string | null
  readonly body: string
  readonly labels: readonly string[]
  readonly state: 'OPEN' | 'CLOSED'
  readonly stateReason: string | null
  readonly closedAt: string | null
  readonly boardState: string | null
}

const CYCLE_STATE_REL = join(
  '.claude',
  'skills',
  'pair-workflow-cycle',
  'scripts',
  'cycle-state.mjs',
)

/**
 * US-572: the card is read through the PM adapter the project binds (`cycle-state.mjs card`), so a
 * Filesystem or Azure backlog is read like a GitHub one. Without the installed cycle skill there is no
 * adapter to ask: the operator's own `gh` answers, as before (a GitHub-only reader).
 */
// ponytail: the cycle skill at its default install path only; a redirected skills target falls back to gh.
function readCard(card: string, cwd: string): CardView {
  const script = join(cwd, CYCLE_STATE_REL)
  if (existsSync(script)) {
    const r = spawnSync(process.execPath, [script, 'card', '--story', card], {
      cwd,
      encoding: 'utf-8',
    })
    let view: (CardView & { error?: string }) | undefined
    try {
      view = JSON.parse(r.stdout) as CardView & { error?: string }
    } catch {
      view = undefined
    }
    if (r.status !== 0 || view === undefined || view.error !== undefined)
      throw new CardUnreadableError(
        `card-unreadable: \`cycle-state.mjs card --story ${card}\` failed — ${view?.error ?? (r.stderr || r.stdout || '').trim()}. ` +
          `pair-cli reads the card through the PM adapter way-of-working.md binds.`,
      )
    return view
  }
  return readCardViaGh(card, cwd)
}

function readCardViaGh(card: string, cwd: string): CardView {
  const view = (fields: string): string =>
    execFileSync('gh', ['issue', 'view', card, '--json', fields], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  let raw: string
  try {
    try {
      raw = view('title,body,labels,state,stateReason,closedAt,projectItems')
    } catch {
      raw = view('title,body,labels,state,stateReason,closedAt')
    }
  } catch (error) {
    throw new CardUnreadableError(
      `card-unreadable: \`gh issue view ${card}\` failed — ${error instanceof Error ? error.message : String(error)}. ` +
        `pair-cli reads the tracker through your own authenticated \`gh\`; check \`gh auth status\`.`,
    )
  }
  return ghCardView(JSON.parse(raw))
}

function ghCardView(
  c: GhCard & {
    labels?: ReadonlyArray<{ name?: string }>
    state?: string
    stateReason?: string | null
    closedAt?: string | null
  },
): CardView {
  return {
    title: c.title ?? null,
    body: c.body ?? '',
    labels: (c.labels ?? []).map(label => label.name ?? ''),
    state: c.state === 'CLOSED' ? 'CLOSED' : 'OPEN',
    stateReason: c.stateReason ?? null,
    closedAt: c.closedAt ?? null,
    boardState: c.projectItems?.map(item => item.status?.name?.trim()).find(Boolean) ?? null,
  }
}

const LABEL_SHAPE_RE = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/i

/**
 * The card's `risk:*` tier — the one the cycle is driven under. Exactly one well-formed `family:tier` label, else
 * `undefined` (none, several, malformed, or the tracker cannot say): `resolve` then never offers `merge`, the
 * unchanged `done` terminal — fail-safe, never a guess.
 */
export function readCardTier(card: string, cwd: string): string | undefined {
  try {
    const tiers = readCard(card, cwd).labels.filter(name => name.startsWith('risk:'))
    return tiers.length === 1 && LABEL_SHAPE_RE.test(tiers[0]!) ? tiers[0] : undefined
  } catch {
    return undefined
  }
}

/**
 * US-521: the card's labels RIGHT NOW (every one, not just `risk:*`) — what a `when` merge gate reads.
 * `undefined` when the tracker cannot say: `decide` then escalates (fail-safe), never proceeds on a guess.
 */
export function readCardLabels(card: string, cwd: string): readonly string[] | undefined {
  try {
    return readCard(card, cwd).labels
  } catch {
    return undefined
  }
}

/** US-576: when the card was closed as Done — `null` while open (or closed as not planned), `undefined` when unreadable. */
export function readCardClosedAt(card: string, cwd: string): Date | null | undefined {
  try {
    const parsed = readCard(card, cwd)
    if (parsed.state !== 'CLOSED' || parsed.stateReason === 'NOT_PLANNED') return null
    const at = new Date(parsed.closedAt ?? '')
    return Number.isNaN(at.getTime()) ? undefined : at
  } catch {
    return undefined
  }
}

/** The card's title, read live from the tracker; `undefined` when it cannot be read (the card is then excluded). */
export function readCardTitle(card: string, cwd: string): string | undefined {
  try {
    const title = readCard(card, cwd).title
    return title?.trim() || undefined
  } catch {
    return undefined
  }
}

/** `## Auto-Advance`'s tiers as `resolve` takes them; `(none)` / absent ⇒ none. A malformed section HALTs. */
export function readAutoAdvanceTiers(fs: FileSystemService, main: string): readonly string[] {
  const { autoAdvance } = readAutomationPolicy(fs, main)
  if (autoAdvance === AUTO_ADVANCE_OFF) return []
  return autoAdvance.split(',').map(tier => tier.trim())
}

interface GhCard {
  title?: string
  body?: string
  projectItems?: ReadonlyArray<{ status?: { name?: string } | null }>
}

/**
 * Reads one card through the bound PM adapter (US-572). Its BOARD STATE: the board item's own status
 * when the card sits on a board, else the `**Status**:` line the card template writes — the literal
 * `## State Mapping` is keyed by. Never parses prose it did not ask for.
 */
export function readCardDocumentViaGh(card: string, cwd: string): CardDocument {
  const c = readCard(card, cwd)
  return {
    title: c.title ?? '',
    body: c.body,
    boardState: c.boardState ?? STATUS_RE.exec(c.body)?.[1],
  }
}

/**
 * The shipped readiness probe (AC14): the project's own `## State Mapping`, READ from its
 * adoption file (a malformed one HALTs before the tracker is asked), then the card through `gh`.
 * The verdict line is printed so the routing can be checked against the board.
 */
export function createCardReadinessProbe(fs: FileSystemService, projectRoot: string) {
  return async (card: string): Promise<CardReadiness> => {
    const mapping = readStateMapping(fs, projectRoot)
    // r1-3: `gh` resolves the repository from ITS cwd — the project's, never this process's.
    const verdict = resolveCardReadiness(readCardDocumentViaGh(card, projectRoot), mapping)
    console.log(`  Readiness: card ${card} — ${verdict.explanation}`)
    return verdict.readiness
  }
}

/** `<type>/<story-id>-<brief-description>`, the documented branch standard — derived, never invented per run. */
export function deriveBranch(card: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-')
  return `feature/US-${card}${slug ? `-${slug}` : ''}`
}

/**
 * The story's branch, asked of the authority that knows it before it is ever derived.
 *
 * Deriving from the card title is a fallback, not a source of truth: a title that changes after the
 * branch was cut produces a name nobody uses. US-487's own title did exactly that — the derived
 * `feature/US-487-pair-cli-run-card-pr-rounds` collided with the real
 * `feature/US-487-pair-cli-run-card-coordinator`, and the worktree guard refused, correctly.
 *
 * 1. `--pr <n>` — `gh pr view --json headRefName` is authoritative and ends the guessing.
 * 2. An existing branch for this card, local or on origin — it is the one already in use.
 * 3. Derivation from the title, for a story that has none of the above yet.
 */
export function resolveBranch(
  card: string,
  title: string,
  pr: number | undefined,
  cwd: string,
): string {
  if (pr !== undefined) {
    try {
      const head = execFileSync(
        'gh',
        ['pr', 'view', String(pr), '--json', 'headRefName', '-q', '.headRefName'],
        {
          cwd,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ).trim()
      if (head) return head
    } catch {
      // Fall through: a PR that cannot be read is not a reason to refuse outright — the existing
      // branch below, or the derivation, may still be right. The worktree guard is the backstop.
    }
  }
  const existing = existingBranchFor(card, cwd)
  return existing ?? deriveBranch(card, title)
}

/** A branch already cut for this card, preferring the local ref and falling back to origin's. */
function existingBranchFor(card: string, cwd: string): string | undefined {
  const pattern = `feature/US-${card}-*`
  for (const args of [
    ['branch', '--list', pattern, '--format=%(refname:short)'],
    ['branch', '--list', '--remotes', `origin/${pattern}`, '--format=%(refname:lstrip=3)'],
  ]) {
    try {
      const found = execFileSync('git', args, {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
      if (found.length === 1) return found[0]
    } catch {
      // A git that cannot answer is not an answer: fall through to the next source.
    }
  }
  return undefined
}

/**
 * The repository's MAIN checkout — never the directory the command happened to run in.
 *
 * `cycle-dispatch.mjs worktree` resolves a relative `--worktree-root` against `--main`
 * (`resolvePath(main, worktreeRoot)`), and the shipped default is `../pair-worktrees`. Run from the
 * main checkout the two coincide, which is why passing the cwd looks right; run from a worktree —
 * which is exactly what driving a canary does — `..` is already the worktree root, so the story's
 * worktree lands in `pair-worktrees/pair-worktrees/<id>`. Found by running it, not by reading it.
 *
 * `--git-common-dir` is the one answer that is the same from every worktree of a repository.
 */
export function mainCheckout(cwd: string): string {
  try {
    const commonDir = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim()
    return dirname(commonDir)
  } catch (error) {
    throw new Error(
      `main-checkout-unresolved: could not resolve this repository's main checkout from ${cwd} — ` +
        `${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/** `cwd` is often a test double with no git repository behind it: the policy read falls back to `cwd` itself. */
export function mainCheckoutOrCwd(cwd: string): string {
  try {
    return mainCheckout(cwd)
  } catch {
    return cwd
  }
}

export interface CycleDriverContext {
  readonly engine: EngineDefinition
  readonly cwd: string
  readonly fs: FileSystemService
  readonly location: CycleScriptsLocation | undefined
  readonly autonomyArgs: readonly string[]
  readonly timeoutSeconds?: number | undefined
  /** US-573: seconds without an engine event before the stage is stopped (default 30 min). */
  readonly idleTimeoutSeconds?: number | undefined
  readonly workflowVersion: string
  readonly baseBranch: string
  /** The model pinned for this engine, if the project declared one. */
  readonly model?: string | undefined
  /**
   * US-488: the run's workflow profile, resolved ONCE at the entry (and printed there). Absent ⇒ the
   * zero-configuration path: the run's own engine/model on every stage, exactly as before.
   */
  readonly profile?: ResolvedWorkflowProfile | undefined
  /**
   * US-488: the availability-checked engines a profile names beyond the run's own, with the autonomy
   * posture and declared `engine.model` of each (resolved at the entry, like the run's engine).
   */
  readonly stageEngines?: Readonly<Record<string, StageEngine>> | undefined
  /**
   * Bounded wait for PENDING CI before the merge stage parks (default cap 30 min, interval 30 s; env
   * `PAIR_CI_WAIT_CAP_SECONDS` / `PAIR_CI_WAIT_INTERVAL_SECONDS`). Injectable for tests.
   */
  readonly ciWait?: CiWaitOptions | undefined
}

export interface StageEngine {
  readonly engine: EngineDefinition
  readonly autonomyArgs: readonly string[]
  readonly model?: string | undefined
}

/** One stage's spawn settings: the profile's, falling back to the run's own engine and model. */
function stageSpawnFor(ctx: CycleDriverContext, step: string) {
  const settings = ctx.profile === undefined ? {} : stageSettings(ctx.profile, step)
  const other = settings.engine === undefined ? undefined : ctx.stageEngines?.[settings.engine]
  return {
    engine: other?.engine ?? ctx.engine,
    autonomyArgs: other?.autonomyArgs ?? ctx.autonomyArgs,
    model: settings.model ?? (other === undefined ? ctx.model : other.model),
    effort: settings.effort,
  }
}

export interface CycleDriverRequest {
  readonly runId: string
  readonly card: string
  readonly pr?: number
  readonly rounds?: number | 'max'
  /**
   * US-521: the ACTIVE autonomy policy, exactly as `autonomy-policy.mjs resolve` produced it (this driver
   * re-derives nothing). Absent ⇒ today's behavior: the legacy `## Auto-Advance` tier path.
   */
  readonly autonomy?: Pick<AutonomyResolution, 'policy'>
  /** US-575: the run's budgets (`## Autonomy` `maxFixRounds` / `autoRecoveryRounds`), read whether or not autonomy is active. */
  readonly budgets?: { readonly maxFixRounds?: number; readonly autoRecoveryRounds?: number }
  /** Sees the card's run events; absent ⇒ only the `--parallel` pool's RUN_EVENTS_ENV relay. */
  readonly onRunEvent?: (event: RunEvent) => void
}

/** The run's own coordinates, resolved once per invocation and shared by every collaborator below. */
function coordinatesFor(ctx: CycleDriverContext, input: CycleDriverRequest) {
  if (ctx.location === undefined) {
    throw new Error(
      `skill-missing: pair-workflow-cycle's scripts were not located, so no stage can be ` +
        `dispatched. Install the skill, or run where it is installed.`,
    )
  }
  // Handoffs live under the MAIN checkout, by the same contract the phase skills state: "handoffs
  // live under `.pair/working/runs/$run/$story/` in the MAIN checkout the coordinator was started
  // in — never inside a story or review worktree".
  const main = mainCheckout(ctx.cwd)
  const runsRoot = `${main}/.pair/working/runs`
  // Title only: the board state is readiness's question, answered upstream (r0-1).
  const record = readCardDocumentViaGh(input.card, ctx.cwd)
  // r1-3: the scripts run in the project too — `ac-hash` asks `gh` from its own cwd.
  const bridge = createCycleScriptsBridge(ctx.location, ctx.cwd)
  const branch = resolveBranch(input.card, record.title, input.pr, ctx.cwd)
  const card = { id: input.card, branch, base: ctx.baseBranch, title: record.title }
  const runDir = `${runsRoot}/${input.runId}/${input.card}`
  // US-492 AC2: the run's PM tool / code host are resolved ONCE, here, before any stage runs —
  // every later script call naming this run directory reuses the binding.
  bridge.bindHosts(runDir)
  return {
    bridge,
    main,
    branch,
    title: record.title,
    runDir,
    runsRoot,
    // r0-3: the inputs digest the in-session coordinator's Step 1 hands `resolve` — produced by the
    // script itself, never computed here, so the two realizations agree (the AC hash is read per resolve).
    inputs: bridge.inputs(card, ctx.workflowVersion),
    // US-490: what lets `resolve` OFFER `merge` — read once, like the scripts' own inputs.
    tier: readCardTier(input.card, ctx.cwd),
    // An active autonomy policy replaces the tier list; otherwise the legacy read is unchanged (default off).
    autoAdvanceTiers: input.autonomy === undefined ? readAutoAdvanceTiers(ctx.fs, main) : [],
    autonomy: input.autonomy?.policy,
  }
}

type Coordinates = ReturnType<typeof coordinatesFor>

/**
 * The branch's head on the remote, as `git ls-remote` reports it now — or `undefined` when there is
 * no remote branch yet (a fresh story) or no remote to ask. Read on EVERY resolve: a fix stage
 * pushes, and a head that moved after the review is what `resolve` re-verifies on.
 */
function remoteHead(main: string, branch: string): string | undefined {
  try {
    const out = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${branch}`], {
      cwd: main,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    })
    return /^([0-9a-f]{40})\s/m.exec(out)?.[1]
  } catch {
    return undefined
  }
}

/**
 * D5: the labels of the card's PR RIGHT NOW (`--pr`, else the story branch's PR) — `undefined` when there is no PR yet or the
 * host cannot say. The review writes the PR's `risk:*`; the SCRIPT (`autonomy-policy.mjs decide`) replaces the card's tier with
 * it, so this only READS: no rule is derived here.
 */
export function readPrLabels(ref: string, cwd: string): readonly string[] | undefined {
  try {
    const out = execFileSync('gh', ['pr', 'view', ref, '--json', 'labels'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const parsed = JSON.parse(out) as { labels?: ReadonlyArray<{ name?: string }> }
    return (parsed.labels ?? []).map(label => label.name ?? '')
  } catch {
    return undefined
  }
}

const liveLabels = (ctx: CycleDriverContext, input: CycleDriverRequest, co: Coordinates) => {
  const labels = readCardLabels(input.card, ctx.cwd)
  if (labels === undefined) return {}
  const prLabels = readPrLabels(input.pr === undefined ? co.branch : String(input.pr), ctx.cwd)
  return prLabels === undefined ? { labels } : { labels, prLabels }
}

// ponytail: fixed repair/retry budgets above the script defaults (1/1) so a converging contract or fix is not parked.
// `maxFixRounds` / `autoRecoveryRounds` are the run's (`## Autonomy`, KB default 10 / 5 — US-575).
// Sent to the coordinator's resolve AND every stage packet: a stage's own Step 0 resolve must see the same budget.
const CYCLE_BUDGETS = { redRepairs: 3, greenRetries: 2 }
const budgetsOf = (input: CycleDriverRequest) =>
  Object.fromEntries(
    Object.entries({ ...CYCLE_BUDGETS, ...input.budgets }).filter(([, v]) => v !== undefined),
  )

/** The `policy` object `resolve` takes: blocking floor, ceiling, and exactly ONE merge-offer source. */
function resolvePolicyFor(
  blocking: ReturnType<typeof resolveBlockingSeverities>,
  co: Coordinates,
  input: CycleDriverRequest,
): Record<string, unknown> {
  return {
    ...budgetsOf(input),
    blockingFloor: blocking.blockingFloor,
    ...(blocking.maxDispatches !== undefined && { maxDispatches: blocking.maxDispatches }),
    ...(co.autoAdvanceTiers.length > 0 && { autoAdvance: { tiers: co.autoAdvanceTiers } }),
    ...(co.autonomy !== undefined && {
      autonomy: { until: co.autonomy.until, merge: co.autonomy.merge },
    }),
  }
}

/** Labels are re-read live at EVERY boundary, and only when a `when` gate can read them. */
function labelsFor(ctx: CycleDriverContext, input: CycleDriverRequest, co: Coordinates) {
  return co.autonomy?.until === 'merged' && co.autonomy.merge.mode === 'when'
    ? liveLabels(ctx, input, co)
    : {}
}

const resolveFor =
  (ctx: CycleDriverContext, input: CycleDriverRequest, co: Coordinates) => async () => {
    const head = remoteHead(co.main, co.branch)
    // US-575 AC3: the base's remote head too — a durable failure recorded on another base is stale.
    const baseHead = remoteHead(co.main, ctx.baseBranch.replace(/^origin\//, ''))
    // US-514 T-1 (revised AC1): `## Blocking Severities` (+ `max-dispatches`) is read from the MAIN
    // checkout's adoption once, here — the same file both realizations read, so review-phase and
    // red-verify (T-2) and the resolve ceiling (T-3) act on the SAME floor. Absent section/file ⇒
    // the KB default floor `Minor` (every severity except Questions blocks), byte-for-byte today's
    // behaviour (`readBlockingSeverities` HALTs on a malformed declaration — never a silent
    // fallback).
    const blocking = resolveBlockingSeverities(ctx.fs, co.main)
    return co.bridge.resolve({
      dir: co.runDir,
      workflowVersion: ctx.workflowVersion,
      policy: resolvePolicyFor(blocking, co, input),
      ...labelsFor(ctx, input, co),
      ...(co.tier !== undefined && { tier: co.tier }),
      entry: input.pr === undefined ? 'fresh' : 'pr',
      story: input.card,
      runsRoot: co.runsRoot,
      inputs: co.inputs,
      // Re-read at every resolve, never the setup snapshot: a card edited mid-run would otherwise
      // disagree with the hash the stage itself stamps, and verify would redirect forever (#573).
      acHash: co.bridge.acHash(input.card, co.runDir),
      ...(head !== undefined && { head }),
      ...(baseHead !== undefined && { baseHead }),
      ...(input.pr !== undefined && { pr: input.pr }),
      // US-488: the profile's `reuse` stages, as `cycle-state`'s OWN policy (admissible transitions
      // only — the validation was the resolver's, against the same table).
      ...(ctx.profile !== undefined && { contextPolicy: ctx.profile.contextPolicy }),
    })
  }

/** `cycle-merge.mjs escalate`: the ONE marker-keyed card comment; a failed post is reported, never thrown. */
const escalateFor = (input: CycleDriverRequest, co: Coordinates) => async (next: CycleNext) => {
  const conditions = Array.isArray(next['conditions']) ? (next['conditions'] as string[]) : []
  const stage = String(next['stage'] ?? 'unknown')
  console.log(`  Escalated at stage ${stage}: ${conditions.join(', ')}`)
  try {
    const out = co.bridge.escalate({ dir: co.runDir, story: input.card, stage, conditions }) as {
      comment?: { posted?: boolean; error?: string }
    }
    console.log(
      out.comment?.posted === true
        ? '  Escalation comment posted on the card (one marker-keyed comment, edited in place)'
        : `  Escalation comment NOT posted: ${out.comment?.error ?? 'unknown error'}`,
    )
    return out
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.log(`  Escalation comment NOT posted: ${reason}`)
    return { comment: { posted: false, error: reason } }
  }
}

const worktreeFor =
  (ctx: CycleDriverContext, input: CycleDriverRequest, co: Coordinates) => async () =>
    co.bridge.worktree({
      main: co.main,
      story: input.card,
      branch: co.branch,
      base: ctx.baseBranch,
      // No `--worktree-root`: `cycle-dispatch worktree`'s own default applies (r0-10).
    })

const packetFor =
  (ctx: CycleDriverContext, input: CycleDriverRequest, co: Coordinates) =>
  async (next: unknown) => {
    // US-514 r1-g1 g1-w7/g1-w8: the SAME policy `resolveFor` resolves with (T-1's `## Blocking
    // Severities` read of the MAIN checkout) rides into every stage packet — `resolve()`'s own
    // `next` carries no `policy` field (it lives at the RESULT's top level, one call up), so this
    // re-derives it from the SAME source (`resolveBlockingSeverities`), never a second value.
    const blocking = resolveBlockingSeverities(ctx.fs, co.main)
    return co.bridge.packet({
      next: next as never,
      policy: {
        ...budgetsOf(input),
        blockingFloor: blocking.blockingFloor,
        ...(blocking.maxDispatches !== undefined && { maxDispatches: blocking.maxDispatches }),
      },
      // `--card` is the card OBJECT the dispatch script validates field by field (`card.id`,
      // `card.branch`, `card.base`, `card.title`, `card.prNumber`), never the bare id — the
      // bridge types it `unknown`, so only a real dispatch catches the difference.
      card: {
        id: input.card,
        branch: co.branch,
        base: ctx.baseBranch,
        title: co.title,
        ...(input.pr !== undefined && { prNumber: input.pr }),
      },
      run: input.runId,
      // The stage's OWN engine decides the rendering (a profile may run `verify` on another engine).
      style: styleFor(stageSpawnFor(ctx, (next as { step?: string }).step ?? '').engine),
      workflowVersion: ctx.workflowVersion,
    }) as never
  }

const spawnStageFor =
  (ctx: CycleDriverContext, co: Coordinates, progress?: CardProgress) =>
  async (packet: unknown) => {
    const spawn = stageSpawnFor(ctx, (packet as { step?: string }).step ?? '')
    return (await runStage({
      engine: spawn.engine,
      // The stage starts in the MAIN CHECKOUT, never in the story's worktree. Every phase skill's
      // Step 0 reads `MAIN="$(pwd)"` — "the main checkout, you have not cd'd yet" — and resolves the
      // run directory from it; the packet's own `$worktree` is what tells the agent where to cd, and
      // it is relative to that same anchor. Spawned in the worktree instead, the stage does all its
      // work and writes its handoffs INSIDE the worktree, which the skills forbid in as many words
      // ("never inside a story or review worktree"). The driver then finds no handoff where the
      // contract says one must be, reads the stage as not advanced, retries, and reports
      // `failed-<step>` — for a stage that actually succeeded. Silent, and invisible to any test
      // whose bridge is a fake.
      packet: { ...(packet as object), worktree: co.main } as never,
      autonomyArgs: spawn.autonomyArgs,
      ...(spawn.model !== undefined && { model: spawn.model }),
      ...(spawn.effort !== undefined && { effort: spawn.effort }),
      timeoutSeconds: ctx.timeoutSeconds,
      idleTimeoutSeconds: ctx.idleTimeoutSeconds,
      runIteration: spawnIteration,
      ...(progress !== undefined && {
        onEvent: (payload: unknown) => {
          const task = todoInProgress(payload)
          if (task !== undefined) progress.task(task)
        },
      }),
    })) as CycleStageResult
  }

export { stageLabel }

/**
 * US-573: the card's own events. A single `--card` hands its renderer in (`onRunEvent`): every
 * dispatch, the implementer's current task and the merge steps feed one live card line. Under the
 * `--parallel` pool (RUN_EVENTS_ENV) the stage lines go to stdout, where the parent renders them.
 */
function progressFor(
  card: string,
  policy: Record<string, unknown>,
  title: string | undefined,
  onRunEvent: ((event: RunEvent) => void) | undefined,
): CardProgress | undefined {
  if (onRunEvent !== undefined)
    return cardProgress({ card, title, maxFixRounds: policy['maxFixRounds'], onRunEvent })
  if (process.env[RUN_EVENTS_ENV] !== '1') return undefined
  return {
    dispatch: next =>
      console.log(
        runEventLine({ event: 'stage', card, stage: stageLabel(next, policy['maxFixRounds']) }),
      ),
    task: () => {},
    merge: () => {},
  }
}

const GATE_SKILL = 'pair-capability-verify-quality'
const GATE_PASS = 'RESULT: ALL GATES PASS'
const GATE_FILE = 'merge-gate.json'

interface MergePins {
  readonly dir: string
  readonly story: string
  readonly pr: number
  readonly reviewedHead: string
  readonly cardTier: string
  readonly autoAdvance?: readonly string[]
  readonly mergeGate?: AutonomyResolution['policy']['merge']
}

/**
 * The tier-gate stage's prompt. The tier and the reviewed head come FIRST — they are what the
 * evidence must name — then the PR, the story branch and the absolute evidence path.
 */
function gatePrompt(pins: MergePins, branch: string, file: string): string {
  const { cardTier: tier, reviewedHead: head, pr } = pins
  return (
    `Merge-stage tier gate for card tier ${tier} at reviewed head ${head}. ` +
    `Invoke the ${GATE_SKILL} skill for PR ${pr} (story branch ${branch}), checked out at that ` +
    `head, for tier ${tier}. Then write this JSON to ${file} — nothing else, no other file: ` +
    `{"tier": "${tier}", "reviewedHead": "${head}", "result": "<its RESULT line, verbatim>", ` +
    `"gates": [{"name": "<gate>", "ok": <true|false>, "lastLines": "<its last error lines>"}]} ` +
    `where the result is exactly the RESULT line ${GATE_SKILL} printed ("${GATE_PASS}" or ` +
    `"RESULT: BLOCKED — N gates failing") and \`gates\` names EVERY gate it ran, a failing one with the last ` +
    `lines of its error output. Never write the passing line unless the skill printed ` +
    `it for this tier and this head. Run only foreground, time-bounded commands. Do not merge.`
  )
}

/** The squash message, per the commit template: `[<story code>] <type>: <description>`. */
function squashMessage(card: string, title: string): string {
  const description = title.replace(/\s+/g, ' ').trim() || `story ${card}`
  return `[#${card}] feat: ${description}`
}

/** The verify-quality RESULT line (and per-gate record) the gate stage wrote for THIS tier and head, or `undefined`. */
function readGateResult(
  file: string,
  tier: string,
  head: string,
): { result: string; gates: GateRecord[] } | undefined {
  if (!existsSync(file)) return undefined
  try {
    const evidence = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>
    if (evidence['tier'] !== tier || evidence['reviewedHead'] !== head) return undefined
    const result = evidence['result']
    const gates = Array.isArray(evidence['gates'])
      ? (evidence['gates'] as GateRecord[]).filter(g => typeof g?.name === 'string')
      : []
    return typeof result === 'string' ? { result: result.trim(), gates } : undefined
  } catch {
    return undefined
  }
}

/**
 * The tier the merge stage pins. Under an ACTIVE autonomy gate an untagged or ambiguously tagged card
 * pins `risk:red` — the fail-safe every tier read in the cycle uses (`cycle-merge.mjs readCurrentTier`
 * reads the same value back, so the pin and the live re-read agree and the strictest gate set runs).
 * Without a gate the legacy rule stands: no tier, no merge.
 */
export function pinnedTier(tier: string | undefined, gateActive: boolean): string | undefined {
  return tier ?? (gateActive ? 'risk:red' : undefined)
}

/** What `resolve` offered `merge` on, pinned once: the reviewed head, the PR and the card tier. */
function mergePinsFor(
  input: CycleDriverRequest,
  co: Coordinates,
  next: CycleNext,
  answer: CycleResolveAnswer,
): MergePins {
  const reviewedHead = next['reviewedHead']
  const pr = input.pr ?? (answer as { pr?: number }).pr
  const cardTier = pinnedTier(co.tier, co.autonomy !== undefined)
  if (typeof reviewedHead !== 'string' || pr === undefined || cardTier === undefined) {
    throw new Error(
      `merge-inputs-unreadable: resolve offered merge without a reviewed head, a PR or a card tier ` +
        `(reviewedHead=${String(reviewedHead)}, pr=${String(pr)}, tier=${String(co.tier)})`,
    )
  }
  return {
    dir: co.runDir,
    story: input.card,
    pr,
    reviewedHead,
    cardTier,
    ...(co.autonomy !== undefined
      ? { mergeGate: co.autonomy.merge }
      : { autoAdvance: co.autoAdvanceTiers }),
  }
}

/**
 * The tier gate: ONE engine stage runs `pair-capability-verify-quality` and hands its answer back
 * through `<run dir>/merge-gate.json`. Green only for evidence written by THIS dispatch (any older
 * file is removed first) that names this tier and head with the passing RESULT line.
 */
async function runTierGate(
  ctx: CycleDriverContext,
  co: Coordinates,
  pins: MergePins,
): Promise<TierGate> {
  const file = join(co.runDir, GATE_FILE)
  rmSync(file, { force: true })
  const stage = await spawnStageFor(
    ctx,
    co,
  )({ step: 'merge-gate', prompt: gatePrompt(pins, co.branch, file), worktree: co.main })
  const read =
    stage.processOutcome === 'success'
      ? readGateResult(file, pins.cardTier, pins.reviewedHead)
      : undefined
  const result = read?.result
  if (result === undefined)
    console.log('  Merge gate: no gate evidence for this tier and head — red')
  else if (result !== GATE_PASS) console.log(`  Merge gate: ${result}`)
  return { green: result === GATE_PASS, result, gates: read?.gates ?? [] }
}

interface TierGate {
  readonly green: boolean
  readonly result: string | undefined
  readonly gates: readonly GateRecord[]
}

// ── US-575: merge-stage auto-recovery ─────────────────────────────────────────────────────────

/** `worktree-setup-command` from the main checkout's `way-of-working.md`, or `undefined` (absent ⇒ none). */
export function readWorktreeSetupCommand(main: string): string | undefined {
  const file = join(main, '.pair/adoption/tech/way-of-working.md')
  if (!existsSync(file)) return undefined
  return /\*\*`worktree-setup-command`\*\*:\s*`([^`]+)`/
    .exec(readFileSync(file, 'utf-8'))?.[1]
    ?.trim()
}

const tail = (text: string, lines = 5): string => text.trim().split('\n').slice(-lines).join('\n')

/** Runs the adopted setup command in the story worktree: `undefined` when it passed (or none is adopted), else why not. */
// Async: a minutes-long install must not freeze the live card row's ticker.
export async function runSetupCommand(
  main: string,
  worktree: string | undefined,
): Promise<string | undefined> {
  const command = readWorktreeSetupCommand(main)
  if (command === undefined || worktree === undefined) return undefined
  console.log(`  Merge gate: worktree-setup-command \`${command}\` in ${worktree}`)
  const status = await new Promise<string | number>(done => {
    const child = spawn(command, { cwd: worktree, shell: true, timeout: 20 * 60_000 })
    let out = ''
    child.stdout.on('data', chunk => (out += chunk))
    child.stderr.on('data', chunk => (out += chunk))
    child.on('error', error => done(error.message))
    child.on('close', (code, signal) =>
      done(code === 0 ? 0 : `${String(code ?? signal)}: ${tail(out) || '(no output)'}`),
    )
  })
  if (status === 0) return undefined
  const why = `worktree-setup-command \`${command}\` exited ${status}`
  console.log(`  Merge gate: ${why}`)
  return why
}

const NO_EVIDENCE = 'no gate evidence for this tier and head'

/**
 * AC1/AC2 — a red tier gate is not an exit. When `autoRecoveryRounds` grants a round, the adopted
 * `worktree-setup-command` runs in the story worktree and the gate runs again on the SAME reviewed head (a failing
 * setup spends the round, its error kept). Still red ⇒ the failing gates are recorded for `resolve`, which sends the
 * approved card to the fix stage with them as findings.
 */
// ponytail: one gate re-run per merge stage — a second red is a real failure for the fix stage; raise if flakes need more.
async function gateWithRecovery(
  ctx: CycleDriverContext,
  input: CycleDriverRequest,
  co: Coordinates,
  pins: MergePins,
): Promise<TierGate> {
  const first = await runTierGate(ctx, co, pins)
  if (first.green) return first
  const round = co.bridge.recover({
    dir: co.runDir,
    kind: 'gate-retry',
    detail: first.result ?? NO_EVIDENCE,
    policy: budgetsOf(input),
  })
  if (!round.allowed) return routeToFix(co, pins, first)
  console.log(
    `  Merge gate: red — recovery round ${String(round.round)}/${String(round.budget)}: setup, then the gate again on ${pins.reviewedHead}`,
  )
  const setupFailed = await runSetupCommand(
    co.main,
    worktreePathOf(await worktreeFor(ctx, input, co)()),
  )
  const gate = setupFailed === undefined ? await runTierGate(ctx, co, pins) : first
  return gate.green ? gate : routeToFix(co, pins, gate, setupFailed)
}

/** AC2: records the gates that stayed red (a failing setup among them) — `resolve` turns them into findings. */
function routeToFix(
  co: Coordinates,
  pins: MergePins,
  gate: TierGate,
  setupFailed?: string,
): TierGate {
  const failing = gate.gates.filter(g => g.ok !== true)
  const gates =
    failing.length > 0
      ? gate.gates
      : [{ name: 'tier-gate', ok: false, lastLines: gate.result ?? NO_EVIDENCE }]
  const setup =
    setupFailed === undefined
      ? []
      : [{ name: 'worktree-setup-command', ok: false, lastLines: setupFailed }]
  co.bridge.gateRed({
    dir: co.runDir,
    reviewedHead: pins.reviewedHead,
    gates: [...gates, ...setup],
  })
  console.log(
    `  Merge gate: still red on ${pins.reviewedHead} — routed to the fix stage with the failing gates as findings`,
  )
  return gate
}

/** A refused merge check: CI still red goes to the fix stage, anything else parks with its reason. */
function refusedCheck(
  co: Coordinates,
  pins: MergePins,
  check: CycleMergeResult,
): CycleMergeOutcome {
  if (check['ciFailed'] === true) return routeCiToFix(co, pins, check)
  console.log(`  Merge: parked — ${check.reason ?? 'the merge check did not allow it'}`)
  return { status: mergeStatus(check), stagesRun: 0, merge: check }
}

/**
 * CI still red after its re-run is a real failure, not a wait: the failing checks (with their log
 * tail when the code host gives one) become findings for the fix stage — never a park for a human.
 */
function routeCiToFix(
  co: Coordinates,
  pins: MergePins,
  check: CycleMergeResult,
): CycleMergeOutcome {
  const reason =
    typeof check.reason === 'string' && check.reason ? check.reason : 'required CI failed'
  const logged = failedCiLogs(co.main, pins.reviewedHead)
  const gates = logged.length > 0 ? logged : [{ name: 'ci', ok: false, lastLines: reason }]
  co.bridge.gateRed({ dir: co.runDir, reviewedHead: pins.reviewedHead, gates })
  console.log(
    `  Merge: CI still red on ${pins.reviewedHead} — routed to the fix stage with the failing checks as findings`,
  )
  return { status: 'gate-red', stagesRun: 1, merge: { ciFailed: true, reason }, resume: true }
}

/** One gate per failed CI run on `head`: its name and the tail of its failed-step log (empty when unreadable). */
function failedCiLogs(cwd: string, head: string): { name: string; ok: false; lastLines: string }[] {
  try {
    const runs = JSON.parse(
      execFileSync(
        'gh',
        ['run', 'list', '--commit', head, '--json', 'databaseId,conclusion,name'],
        {
          cwd,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ),
    ) as { databaseId?: number; conclusion?: string; name?: string }[]
    return runs
      .filter(r => r.conclusion === 'failure' && Number.isInteger(r.databaseId))
      .map(r => ({
        name: `ci: ${r.name ?? r.databaseId}`,
        ok: false as const,
        lastLines: tail(
          execFileSync('gh', ['run', 'view', String(r.databaseId), '--log-failed'], {
            cwd,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 64 * 1024 * 1024,
          }),
          40,
        ),
      }))
  } catch {
    return []
  }
}

const worktreePathOf = (created: unknown): string | undefined => {
  const path = (created as { path?: unknown } | null | undefined)?.path
  return typeof path === 'string' ? path : undefined
}

const git = (cwd: string, args: readonly string[]) =>
  spawnSync('git', args, { cwd, encoding: 'utf-8', timeout: 30 * 60_000 })

/** The parked outcome of a spent recovery: `needs-human: <reason>`, said once on the console. */
function needsHuman(reason: string): CycleMergeOutcome {
  console.log(`  needs-human: ${reason}`)
  return { status: 'needs-human', stagesRun: 0, merge: { reason } }
}

/**
 * AC5 — the story branch conflicts with its base: merged mechanically (`cycle-state.mjs base-sync`, ownership-resolved,
 * sealed tests never touched) and pushed, spending one recovery round. The head moves, so `resolve` re-verifies it.
 */
function syncBase(
  ctx: CycleDriverContext,
  input: CycleDriverRequest,
  co: Coordinates,
  worktree: string | undefined,
): CycleMergeOutcome | undefined {
  if (worktree === undefined || !conflictsWithBase(worktree, ctx.baseBranch)) return undefined
  const round = co.bridge.recover({
    dir: co.runDir,
    kind: 'base-sync',
    detail: `${co.branch} conflicts with ${ctx.baseBranch}`,
    policy: budgetsOf(input),
  })
  if (!round.allowed) return needsHuman(round.next?.detail ?? 'autoRecoveryRounds spent')
  console.log(
    `  Merge: ${co.branch} conflicts with ${ctx.baseBranch} — base sync (recovery round ${String(round.round)}/${String(round.budget)})`,
  )
  const sync = co.bridge.baseSync({ cwd: worktree, base: ctx.baseBranch, story: input.card })
  if (sync.synced !== true)
    return needsHuman(sync.detail ?? `base sync did not complete (${sync.reason ?? 'unknown'})`)
  return pushSynced(worktree, co.branch, sync)
}

/** Whether the story worktree's HEAD conflicts with the (freshly fetched) base — `git merge-tree` exits 1 on a conflict. */
function conflictsWithBase(worktree: string, base: string): boolean {
  git(worktree, ['fetch', '-q', 'origin'])
  return git(worktree, ['merge-tree', '--write-tree', '--no-messages', 'HEAD', base]).status === 1
}

/** Pushes a synced branch (its pre-push gate runs, never bypassed); the moved head is re-verified by `resolve`. */
function pushSynced(worktree: string, branch: string, sync: BaseSyncResult): CycleMergeOutcome {
  const push = git(worktree, ['push', '-q', 'origin', `HEAD:refs/heads/${branch}`])
  if (push.status !== 0) return needsHuman(`base sync pushed nothing: ${tail(push.stderr ?? '')}`)
  const resolved = (sync.conflicts ?? []).map(c => `${c.path}→${c.side}`).join(', ')
  console.log(`  Merge: base synced (${resolved || 'clean'}) — the new head is re-verified`)
  return { status: 'base-synced', stagesRun: 0, merge: { baseSync: sync }, resume: true }
}

/** AC7 — a failed external CI run is re-run: once free per merge stage, then against `autoRecoveryRounds`. */
function rerunFailedCi(input: CycleDriverRequest, co: Coordinates, head: string): () => boolean {
  let free = true
  return () => {
    if (!free) {
      const round = co.bridge.recover({
        dir: co.runDir,
        kind: 'ci-rerun',
        detail: `CI failed again on ${head}`,
        policy: budgetsOf(input),
      })
      if (!round.allowed) {
        console.log(`  needs-human: ${round.next?.detail ?? 'autoRecoveryRounds spent'}`)
        return false
      }
    }
    free = false
    return rerunFailedRuns(co.main, head)
  }
}

/** `gh run rerun --failed` for every failed workflow run on `head`; whether any re-run was requested. */
function rerunFailedRuns(cwd: string, head: string): boolean {
  try {
    const runs = JSON.parse(
      execFileSync('gh', ['run', 'list', '--commit', head, '--json', 'databaseId,conclusion'], {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    ) as { databaseId?: number; conclusion?: string }[]
    const failed = runs.filter(r => r.conclusion === 'failure' && Number.isInteger(r.databaseId))
    for (const r of failed)
      execFileSync('gh', ['run', 'rerun', String(r.databaseId), '--failed'], {
        cwd,
        stdio: 'ignore',
      })
    return failed.length > 0
  } catch {
    return false
  }
}

function mergeStatus(run: { merged?: boolean; cascaded?: boolean; parkKind?: string }): string {
  // US-521: an escalation is its own terminal status — the script's park kind, relayed, never re-derived.
  if (run.merged !== true) return run.parkKind === 'escalated' ? 'escalated' : 'merge-parked'
  return run.cascaded === true ? 'merged' : 'merged-closure-unfinished'
}

/** No live card line to feed (no `onRunEvent`, no `--parallel` relay). */
const NO_PROGRESS: CardProgress = { dispatch: () => {}, task: () => {}, merge: () => {} }

/**
 * The `merge` stage (US-490, cycle SKILL.md Step 5): `cycle-merge.mjs check` first, pinned to the
 * head the verifier reviewed; only when it allows, the tier gate, then `run` with `--gate green` or
 * `red`. This driver decides nothing itself: `merged` / `cascaded` / `reason` are relayed verbatim.
 */
const mergeFor =
  (
    ctx: CycleDriverContext,
    input: CycleDriverRequest,
    co: Coordinates,
    progress: CardProgress = NO_PROGRESS,
  ) =>
  async (next: CycleNext, answer: CycleResolveAnswer): Promise<CycleMergeOutcome> => {
    const pins = mergePinsFor(input, co, next, answer)
    const synced = syncBase(ctx, input, co, worktreePathOf(await worktreeFor(ctx, input, co)()))
    if (synced !== undefined) return synced
    progress.merge('waiting for CI')
    const check = await checkWithCiWait(
      deferPark => co.bridge.mergeCheck({ ...pins, deferPark }),
      wait,
      { ...ctx.ciWait, rerun: rerunFailedCi(input, co, pins.reviewedHead) },
      message => console.log(message),
    )
    if (check.mergeAllowed !== true) return refusedCheck(co, pins, check)
    progress.merge('running checks')
    const gate = await gateWithRecovery(ctx, input, co, pins)
    if (!gate.green)
      return {
        status: 'gate-red',
        stagesRun: 1,
        merge: { gateResult: gate.result ?? null },
        resume: true,
      }
    progress.merge('merging')
    const run = co.bridge.mergeRun({
      ...pins,
      gate: gate.green ? 'green' : 'red',
      message: squashMessage(input.card, co.title),
      branch: co.branch,
      root: co.main,
    })
    console.log(
      `  Merge: merged=${String(run.merged)} cascaded=${String(run.cascaded)}` +
        `${run.reason ? ` — ${run.reason}` : ''}`,
    )
    const merge = { ...run, ...(gate.result !== undefined && { gateResult: gate.result }) }
    return { status: mergeStatus(run), stagesRun: 1, merge }
  }

/**
 * `resolve` answered `other-run`: this story's cycle was started under ANOTHER run id (by
 * `pair-workflow-cycle` or `pair-implement-batch`). The in-session coordinator's rule, shared here
 * (AC9): adopt that run id and resolve again — never crash on the missing `next`, never restart the
 * cycle beside it under the requested id. Adopted at most once: a second `other-run` is the loop's
 * own typed stop.
 */
function adoptOtherRun(
  input: CycleDriverRequest,
  co: Coordinates,
  answer: unknown,
): { input: CycleDriverRequest; co: Coordinates } | undefined {
  const { status, runId } = (answer ?? {}) as { status?: unknown; runId?: unknown }
  if (status !== 'other-run' || typeof runId !== 'string' || runId === input.runId) return undefined
  console.log(
    `  Run id: story ${input.card}'s cycle lives under run ${runId}, not ${input.runId} — continuing it there`,
  )
  const runDir = `${co.runsRoot}/${runId}/${input.card}`
  // The adopted run keeps the binding it was started with (`reused`), or is bound now.
  co.bridge.bindHosts(runDir)
  return {
    input: { ...input, runId },
    co: { ...co, runDir },
  }
}

/**
 * US-488 AC7: the run's profile identity is recorded ONCE, after any `other-run` adoption settled
 * which directory this run really is — `publish` then stamps it into every handoff.
 */
function recordRunProfile(ctx: CycleDriverContext, co: Coordinates): void {
  if (ctx.profile !== undefined) {
    co.bridge.bindProfile(co.runDir, {
      name: ctx.profile.name,
      hash: ctx.profile.hash,
      source: ctx.profile.source,
    })
  } else {
    // Zero-config: this invocation runs on the KB default, so an earlier invocation's (or the
    // in-session coordinator's) binding must not be stamped into the handoffs it publishes.
    rmSync(join(co.runDir, '.workflow-profile.json'), { force: true })
  }
}

/**
 * US-489: `## Cycle Hooks`, executed HERE (the coordinator), through the shared script — the
 * same one `pair-workflow-cycle` calls. Absent section/file ⇒ the script answers no hooks and
 * nothing is reported (AC6); only a typo'd key surfaces, once, as a warning.
 */
function loadCycleHooks(ctx: CycleDriverContext, co: Coordinates) {
  const hooks = createCycleHooksBridge(ctx.location!, {
    policyPath: cycleHooksPolicyPath(co.main),
    cwd: co.main,
  })
  for (const warning of hooks.warnings()) console.log(`  ${warning}`)
  return hooks
}

/** The stage line's tail: the stage's own final result, or a flag that a "successful" stage ended without one. */
export function finalPart(record: CycleStageRecord): string {
  const { final } = record
  if (final !== undefined) {
    const reason = final.reason ? ` reason=${final.reason}` : ''
    const verdict = final.verdict ? ` verdict=${final.verdict}` : ''
    const next = final.next?.step ? ` next=${final.next.step}` : ''
    return ` — final: status=${final.status ?? '?'}${reason}${verdict}${next}`
  }
  if (record.processOutcome !== 'success' || record.handoffAdvanced) return ''
  return ' — no final result (the stage ended without its structured JSON; the retry resumes from the commits already on the branch)'
}

export function createDefaultCycleDriver(ctx: CycleDriverContext) {
  return async (requested: CycleDriverRequest): Promise<CycleOutcome> => {
    let input = requested
    let co = coordinatesFor(ctx, input)
    // The budgets are `cycle-state`'s, never this driver's: AC5 says the dead-dispatch retry is
    // "read from cycle-state, never defined in pair-cli". Its own `resolve` output carries them,
    // so they are read once here and handed to the loop — passing `{}` silently set every budget
    // to zero, which the opencode leg showed as a stage that was never retried.
    let first: unknown = await resolveFor(ctx, input, co)()
    const adopted = adoptOtherRun(input, co, first)
    if (adopted !== undefined) {
      ;({ input, co } = adopted)
      first = await resolveFor(ctx, input, co)()
    }
    const policy = (first as { policy?: Record<string, unknown> }).policy ?? {}
    recordRunProfile(ctx, co)
    const hooks = loadCycleHooks(ctx, co)
    const progress = progressFor(input.card, policy, co.title, input.onRunEvent)
    return await runCycle({
      hooks,
      resolve: resolveFor(ctx, input, co),
      worktree: worktreeFor(ctx, input, co),
      packet: packetFor(ctx, input, co) as never,
      spawnStage: spawnStageFor(ctx, co, progress),
      mergeStage: mergeFor(ctx, input, co, progress),
      escalate: escalateFor(input, co),
      policy,
      ...(input.rounds !== undefined && { rounds: input.rounds }),
      onNotice: note => console.log(`  ${note}`),
      ...(progress !== undefined && { onDispatch: progress.dispatch }),
      // One line per stage, the moment the NEXT resolve reveals whether it advanced. Without it a
      // forty-dispatch unattended run prints a single terminal status and nothing else: the stage
      // that mattered is indistinguishable from the thirty-nine that did not, and a stage that
      // silently wrote its handoff in the wrong place reads exactly like one that failed.
      onStage: record =>
        console.log(
          `  Stage ${record.step}${record.phase ? `:${record.phase}` : ''} — process ` +
            `${record.processOutcome}, handoff ${record.handoffAdvanced ? 'advanced' : 'NOT advanced'}` +
            `${record.detail ? ` (${record.detail})` : ''}` +
            finalPart(record),
        ),
    })
  }
}
