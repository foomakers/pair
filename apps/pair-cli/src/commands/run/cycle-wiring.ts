import { execFileSync } from 'child_process'
import { dirname } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import type { EngineDefinition } from './engines'
import { runCycle, type CycleOutcome, type CycleStageResult } from './cycle'
import {
  createCycleScriptsBridge,
  CYCLE_WORKTREE_ROOT_DEFAULT,
  type CardReadiness,
  type CycleScriptsLocation,
} from './cycle-scripts'
import { runStage, styleFor } from './stage-runner'
import { spawnIteration } from './spawn'
import { readStateMapping, resolveCardReadiness, type CardDocument } from './card-readiness'

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

/** The card's own macrostate plus the title the branch name is derived from, in ONE tracker call. */
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

/** Reads one card through the operator's own `gh`. Never parses prose it did not ask for. */
export function readCardViaGh(card: string, cwd: string): CardRecord {
  const parsed = JSON.parse(ghIssueView(card, cwd, 'title,body')) as {
    title?: string
    body?: string
  }
  return parseCardRecord(parsed.title ?? '', parsed.body ?? '')
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
    const verdict = resolveCardReadiness(readCardDocumentViaGh(card, process.cwd()), mapping)
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
  const record = readCardViaGh(input.card, ctx.cwd)
  return {
    bridge: createCycleScriptsBridge(ctx.location),
    main,
    branch: resolveBranch(input.card, record.title, input.pr, ctx.cwd),
    title: record.title,
    runDir: `${runsRoot}/${input.runId}/${input.card}`,
    runsRoot,
  }
}

type Coordinates = ReturnType<typeof coordinatesFor>

const resolveFor =
  (ctx: CycleDriverContext, input: CycleDriverRequest, co: Coordinates) => async () =>
    co.bridge.resolve({
      dir: co.runDir,
      workflowVersion: ctx.workflowVersion,
      policy: {},
      entry: input.pr === undefined ? 'fresh' : 'pr',
      story: input.card,
      runsRoot: co.runsRoot,
      ...(input.pr !== undefined && { pr: input.pr }),
    })

const worktreeFor =
  (ctx: CycleDriverContext, input: CycleDriverRequest, co: Coordinates) => async () =>
    co.bridge.worktree({
      main: co.main,
      story: input.card,
      branch: co.branch,
      base: ctx.baseBranch,
      worktreeRoot: CYCLE_WORKTREE_ROOT_DEFAULT,
    })

const packetFor =
  (ctx: CycleDriverContext, input: CycleDriverRequest, co: Coordinates) => async (next: unknown) =>
    co.bridge.packet({
      next: next as never,
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
      style: styleFor(ctx.engine),
      workflowVersion: ctx.workflowVersion,
    }) as never

const spawnStageFor = (ctx: CycleDriverContext, co: Coordinates) => async (packet: unknown) =>
  (await runStage({
    engine: ctx.engine,
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
    autonomyArgs: ctx.autonomyArgs,
    ...(ctx.model !== undefined && { model: ctx.model }),
    timeoutSeconds: ctx.timeoutSeconds,
    runIteration: spawnIteration,
  })) as CycleStageResult

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
  return {
    input: { ...input, runId },
    co: { ...co, runDir: `${co.runsRoot}/${runId}/${input.card}` },
  }
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
    return await runCycle({
      resolve: resolveFor(ctx, input, co),
      worktree: worktreeFor(ctx, input, co),
      packet: packetFor(ctx, input, co) as never,
      spawnStage: spawnStageFor(ctx, co),
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
