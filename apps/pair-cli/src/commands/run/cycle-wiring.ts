import { execFileSync } from 'child_process'
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
  type CycleStageResult,
} from './cycle'
import { AUTO_ADVANCE_OFF, readAutomationPolicy } from './automation-policy'
import {
  createCycleScriptsBridge,
  createCycleHooksBridge,
  cycleHooksPolicyPath,
  type CardReadiness,
  type CycleScriptsLocation,
} from './cycle-scripts'
import { runStage, styleFor } from './stage-runner'
import { spawnIteration } from './spawn'
import { readStateMapping, resolveCardReadiness, type CardDocument } from './card-readiness'
import { resolveBlockingSeverities } from './blocking-severities'
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

function ghIssueView(card: string, cwd: string, fields: string): string {
  try {
    return execFileSync('gh', ['issue', 'view', card, '--json', fields], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    throw new CardUnreadableError(
      `card-unreadable: \`gh issue view ${card}\` failed — ${error instanceof Error ? error.message : String(error)}. ` +
        `pair-cli reads the tracker through your own authenticated \`gh\`; check \`gh auth status\`.`,
    )
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
    const parsed = JSON.parse(ghIssueView(card, cwd, 'labels')) as {
      labels?: ReadonlyArray<{ name?: string }>
    }
    const tiers = (parsed.labels ?? [])
      .map(label => label.name ?? '')
      .filter(name => name.startsWith('risk:'))
    return tiers.length === 1 && LABEL_SHAPE_RE.test(tiers[0]!) ? tiers[0] : undefined
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
 * The card's BOARD STATE: the project item's own status when the card sits on a board, else the
 * `**Status**:` line the card template writes — the literal `## State Mapping` is keyed by.
 * `projectItems` needs the `read:project` scope, so a token without it falls back to the body.
 */
function boardStateOf(card: GhCard): string | undefined {
  const onBoard = card.projectItems?.map(item => item.status?.name?.trim()).find(Boolean)
  return onBoard ?? STATUS_RE.exec(card.body ?? '')?.[1]
}

/** Reads one card through the operator's own `gh`. Never parses prose it did not ask for. */
export function readCardDocumentViaGh(card: string, cwd: string): CardDocument {
  let raw: string
  try {
    raw = ghIssueView(card, cwd, 'title,body,projectItems')
  } catch {
    raw = ghIssueView(card, cwd, 'title,body')
  }
  const parsed = JSON.parse(raw) as GhCard
  return { title: parsed.title ?? '', body: parsed.body ?? '', boardState: boardStateOf(parsed) }
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

export interface CycleDriverContext {
  readonly engine: EngineDefinition
  readonly cwd: string
  readonly fs: FileSystemService
  readonly location: CycleScriptsLocation | undefined
  readonly autonomyArgs: readonly string[]
  readonly timeoutSeconds: number
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
    // r0-3: the freshness evidence the in-session coordinator's Step 1 hands `resolve` — both
    // produced by the scripts themselves, never computed here, so the two realizations agree.
    inputs: bridge.inputs(card, ctx.workflowVersion),
    acHash: bridge.acHash(input.card, runDir),
    // US-490: what lets `resolve` OFFER `merge` — read once, like the scripts' own inputs.
    tier: readCardTier(input.card, ctx.cwd),
    autoAdvanceTiers: readAutoAdvanceTiers(ctx.fs, main),
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

const resolveFor =
  (ctx: CycleDriverContext, input: CycleDriverRequest, co: Coordinates) => async () => {
    const head = remoteHead(co.main, co.branch)
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
      policy: {
        blockingFloor: blocking.blockingFloor,
        ...(blocking.maxDispatches !== undefined && { maxDispatches: blocking.maxDispatches }),
        ...(co.autoAdvanceTiers.length > 0 && { autoAdvance: { tiers: co.autoAdvanceTiers } }),
      },
      ...(co.tier !== undefined && { tier: co.tier }),
      entry: input.pr === undefined ? 'fresh' : 'pr',
      story: input.card,
      runsRoot: co.runsRoot,
      inputs: co.inputs,
      acHash: co.acHash,
      ...(head !== undefined && { head }),
      ...(input.pr !== undefined && { pr: input.pr }),
      // US-488: the profile's `reuse` stages, as `cycle-state`'s OWN policy (admissible transitions
      // only — the validation was the resolver's, against the same table).
      ...(ctx.profile !== undefined && { contextPolicy: ctx.profile.contextPolicy }),
    })
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

const spawnStageFor = (ctx: CycleDriverContext, co: Coordinates) => async (packet: unknown) => {
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
    runIteration: spawnIteration,
  })) as CycleStageResult
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
  readonly autoAdvance: readonly string[]
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
    `{"tier": "${tier}", "reviewedHead": "${head}", "result": "<its RESULT line, verbatim>"} ` +
    `where the result is exactly the RESULT line ${GATE_SKILL} printed ("${GATE_PASS}" or ` +
    `"RESULT: BLOCKED — N gates failing"). Never write the passing line unless the skill printed ` +
    `it for this tier and this head. Run only foreground, time-bounded commands. Do not merge.`
  )
}

/** The squash message, per the commit template: `[<story code>] <type>: <description>`. */
function squashMessage(card: string, title: string): string {
  const description = title.replace(/\s+/g, ' ').trim() || `story ${card}`
  return `[#${card}] feat: ${description}`
}

/** The verify-quality RESULT line the gate stage wrote for THIS tier and head, or `undefined`. */
function readGateResult(file: string, tier: string, head: string): string | undefined {
  if (!existsSync(file)) return undefined
  try {
    const evidence = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>
    if (evidence['tier'] !== tier || evidence['reviewedHead'] !== head) return undefined
    const result = evidence['result']
    return typeof result === 'string' ? result.trim() : undefined
  } catch {
    return undefined
  }
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
  if (typeof reviewedHead !== 'string' || pr === undefined || co.tier === undefined) {
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
    cardTier: co.tier,
    autoAdvance: co.autoAdvanceTiers,
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
): Promise<{ readonly green: boolean; readonly result: string | undefined }> {
  const file = join(co.runDir, GATE_FILE)
  rmSync(file, { force: true })
  const stage = await spawnStageFor(
    ctx,
    co,
  )({ step: 'merge-gate', prompt: gatePrompt(pins, co.branch, file), worktree: co.main })
  const result =
    stage.processOutcome === 'success'
      ? readGateResult(file, pins.cardTier, pins.reviewedHead)
      : undefined
  if (result === undefined)
    console.log('  Merge gate: no gate evidence for this tier and head — red')
  else if (result !== GATE_PASS) console.log(`  Merge gate: ${result}`)
  return { green: result === GATE_PASS, result }
}

function mergeStatus(run: { merged?: boolean; cascaded?: boolean }): string {
  if (run.merged !== true) return 'merge-parked'
  return run.cascaded === true ? 'merged' : 'merged-closure-unfinished'
}

/**
 * The `merge` stage (US-490, cycle SKILL.md Step 5): `cycle-merge.mjs check` first, pinned to the
 * head the verifier reviewed; only when it allows, the tier gate, then `run` with `--gate green` or
 * `red`. This driver decides nothing itself: `merged` / `cascaded` / `reason` are relayed verbatim.
 */
const mergeFor =
  (ctx: CycleDriverContext, input: CycleDriverRequest, co: Coordinates) =>
  async (next: CycleNext, answer: CycleResolveAnswer): Promise<CycleMergeOutcome> => {
    const pins = mergePinsFor(input, co, next, answer)
    const check = co.bridge.mergeCheck(pins)
    if (check.mergeAllowed !== true) {
      console.log(`  Merge: parked — ${check.reason ?? 'the merge check did not allow it'}`)
      return { status: 'merge-parked', stagesRun: 0, merge: check }
    }
    const gate = await runTierGate(ctx, co, pins)
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
    return await runCycle({
      hooks,
      resolve: resolveFor(ctx, input, co),
      worktree: worktreeFor(ctx, input, co),
      packet: packetFor(ctx, input, co) as never,
      spawnStage: spawnStageFor(ctx, co),
      mergeStage: mergeFor(ctx, input, co),
      policy,
      ...(input.rounds !== undefined && { rounds: input.rounds }),
      onNotice: note => console.log(`  ${note}`),
      // One line per stage, the moment the NEXT resolve reveals whether it advanced. Without it a
      // forty-dispatch unattended run prints a single terminal status and nothing else: the stage
      // that mattered is indistinguishable from the thirty-nine that did not, and a stage that
      // silently wrote its handoff in the wrong place reads exactly like one that failed.
      onStage: record =>
        console.log(
          `  Stage ${record.step}${record.phase ? `:${record.phase}` : ''} — process ` +
            `${record.processOutcome}, handoff ${record.handoffAdvanced ? 'advanced' : 'NOT advanced'}` +
            `${record.detail ? ` (${record.detail})` : ''}`,
        ),
    })
  }
}
