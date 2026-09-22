import { execFileSync } from 'child_process'
import type { FileSystemService } from '@pair/content-ops'
import type { EngineDefinition } from './engines'
import { runCycle, type CycleOutcome, type CycleStageResult } from './cycle'
import {
  createCycleScriptsBridge,
  classifyCardReadiness,
  CYCLE_WORKTREE_ROOT_DEFAULT,
  type CardReadiness,
  type CycleScriptsLocation,
} from './cycle-scripts'
import { runStage, styleFor } from './stage-runner'
import { spawnIteration } from './spawn'

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

/** Reads one card through the operator's own `gh`. Never parses prose it did not ask for. */
export function readCardViaGh(card: string, cwd: string): CardRecord {
  let raw: string
  try {
    raw = execFileSync('gh', ['issue', 'view', card, '--json', 'title,body'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    throw new Error(
      `card-unreadable: \`gh issue view ${card}\` failed — ${error instanceof Error ? error.message : String(error)}. ` +
        `pair-cli reads the tracker through your own authenticated \`gh\`; check \`gh auth status\`.`,
    )
  }
  const parsed = JSON.parse(raw) as { title?: string; body?: string }
  return parseCardRecord(parsed.title ?? '', parsed.body ?? '')
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

export const ghCardReadiness = async (card: string): Promise<CardReadiness> =>
  classifyCardReadiness(readCardViaGh(card, process.cwd()))

export interface CycleDriverContext {
  readonly engine: EngineDefinition
  readonly cwd: string
  readonly fs: FileSystemService
  readonly location: CycleScriptsLocation | undefined
  readonly autonomyArgs: readonly string[]
  readonly timeoutSeconds: number
  readonly workflowVersion: string
  readonly baseBranch: string
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
  const runsRoot = `${ctx.cwd}/.pair/working/runs`
  return {
    bridge: createCycleScriptsBridge(ctx.location),
    branch: deriveBranch(input.card, readCardViaGh(input.card, ctx.cwd).title),
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
      main: ctx.cwd,
      story: input.card,
      branch: co.branch,
      base: ctx.baseBranch,
      worktreeRoot: CYCLE_WORKTREE_ROOT_DEFAULT,
    })

const packetFor =
  (ctx: CycleDriverContext, input: CycleDriverRequest, co: Coordinates) => async (next: unknown) =>
    co.bridge.packet({
      next: next as never,
      card: input.card,
      style: styleFor(ctx.engine),
      workflowVersion: ctx.workflowVersion,
    }) as never

const spawnStageFor = (ctx: CycleDriverContext) => async (packet: unknown) =>
  (await runStage({
    engine: ctx.engine,
    packet: packet as never,
    autonomyArgs: ctx.autonomyArgs,
    timeoutSeconds: ctx.timeoutSeconds,
    runIteration: spawnIteration,
  })) as CycleStageResult

/**
 * Composes the three pieces T-2/T-3/T-4 built into the driver `handleRunCommand` calls: the script
 * bridge (the ONLY rule authority), the stage runner (one fresh process per stage) and the pure
 * loop. It adds no rule of its own — every transition still comes from `resolve`.
 */
export function createDefaultCycleDriver(ctx: CycleDriverContext) {
  return async (input: CycleDriverRequest): Promise<CycleOutcome> => {
    const co = coordinatesFor(ctx, input)
    return await runCycle({
      resolve: resolveFor(ctx, input, co),
      worktree: worktreeFor(ctx, input, co),
      packet: packetFor(ctx, input, co) as never,
      spawnStage: spawnStageFor(ctx),
      policy: {},
      ...(input.rounds !== undefined && { rounds: input.rounds }),
      onNotice: note => console.log(`  ${note}`),
    })
  }
}
