import { spawnSync } from 'child_process'
import { isAbsolute, join, relative, resolve } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import { extractRegistries, type Config } from '#registry'

/**
 * The script bridge — US-487 T-2.
 *
 * Locates the INSTALLED `pair-workflow-cycle` scripts through the SAME registry `skill-probe.ts`
 * reads (never a hardcoded `.claude/skills` path, never a second copy shipped inside `pair-cli` —
 * epic AC1, story business rule 2), and wraps `resolve`/`worktree`/`packet` as typed functions over
 * the real scripts: pair-cli owns NO cycle rule, it only spawns the scripts that already ARE the
 * rule and relays their answer, verbatim, typed.
 */

const SKILLS_REGISTRY = 'skills'
const CYCLE_SKILL_NAME = 'pair-workflow-cycle'

export interface CycleScriptsLocation {
  readonly scriptsDir: string
}

/**
 * `<target>/pair-workflow-cycle/scripts` for the first registry target where the skill is
 * installed — mirrors `skill-probe.ts`'s own resolution exactly (every declared target probed,
 * never just the canonical one; traversal contained the same way, round 7).
 */
export function locateCycleScripts(
  fs: FileSystemService,
  config: Config,
  projectRoot: string,
): CycleScriptsLocation {
  const registry = extractRegistries(config)[SKILLS_REGISTRY]
  const targets = registry?.targets?.map(target => target.path) ?? ['.claude/skills']
  const directories = candidateDirectories(registry?.prefix)

  for (const target of targets) {
    const found = findInstalledUnder(fs, projectRoot, target, directories)
    if (found !== undefined) return { scriptsDir: join(found, 'scripts') }
  }
  throw new Error(
    `skill-missing: ${CYCLE_SKILL_NAME} is not installed under any configured skills target — ` +
      `install it (\`pair-cli install\`) before running \`pair-cli run --card\` on a Ready card.`,
  )
}

/** Every directory name the skill could be installed under, first match wins. */
function candidateDirectories(prefix: string | undefined): readonly string[] {
  if (!prefix) return [CYCLE_SKILL_NAME]
  return [CYCLE_SKILL_NAME, `${prefix}-${CYCLE_SKILL_NAME}`, stripPrefix(CYCLE_SKILL_NAME, prefix)]
}

/** The first `<target>/<directory>` (of the candidates) that stays inside `target` and has a `SKILL.md`. */
function findInstalledUnder(
  fs: FileSystemService,
  projectRoot: string,
  target: string,
  directories: readonly string[],
): string | undefined {
  const targetRoot = resolve(projectRoot, target)
  for (const directory of directories) {
    const candidate = resolve(targetRoot, directory)
    const inside = relative(targetRoot, candidate)
    if (inside.startsWith('..') || isAbsolute(inside)) continue
    if (fs.existsSync(join(candidate, 'SKILL.md'))) return candidate
  }
  return undefined
}

function stripPrefix(name: string, prefix: string): string {
  return name.startsWith(`${prefix}-`) ? name.slice(prefix.length + 1) : name
}

// ── typed wrappers over the real scripts (real spawn, never a fixture standing in for them) ────

export interface CycleResolveResult {
  readonly status: string
  readonly next: { readonly step: string; readonly [key: string]: unknown }
  readonly [key: string]: unknown
}

export interface CycleResolveOptions {
  readonly dir: string
  readonly workflowVersion: string
  readonly policy: Record<string, unknown>
  readonly entry: string
  readonly pr?: number
  readonly story?: string
  readonly runsRoot?: string
  readonly head?: string
  readonly inputs?: string
}

export interface CycleWorktreeOptions {
  readonly main: string
  readonly story: string
  readonly branch: string
  readonly base: string
  readonly worktreeRoot?: string
}

export interface CycleWorktreeResult {
  readonly path: string
  readonly created: boolean
  readonly reused: boolean
  readonly branch: string
}

export interface CyclePacketOptions {
  readonly next: unknown
  readonly card: unknown
  readonly policy?: Record<string, unknown>
  readonly run?: string
  readonly workflowVersion?: string
  readonly pipeline?: Record<string, unknown>
  /** `slash` renders the literal `/<skill>` line; `instruction` the portable no-slash form. */
  readonly style?: 'slash' | 'instruction'
}

export interface CyclePacketResult {
  readonly step: string
  readonly phase: string
  readonly worktree: string
  readonly prompt: string
  readonly [key: string]: unknown
}

export interface CycleScriptsBridge {
  resolve(options: CycleResolveOptions): CycleResolveResult
  worktree(options: CycleWorktreeOptions): CycleWorktreeResult
  packet(options: CyclePacketOptions): CyclePacketResult
}

/** Parses `stdout` as the ONE line of JSON a script writes, or throws `cycle-state-unreadable`. */
function parseScriptOutput(script: string, cmd: string, stdout: string, stderr: unknown): unknown {
  try {
    return JSON.parse(stdout)
  } catch {
    // The exact edge case the story names: "`resolve` output unparseable: HALT
    // `cycle-state-unreadable`, never assume prepare".
    throw new Error(
      `cycle-state-unreadable: ${script} ${cmd} produced output that is not valid JSON` +
        `${stdout ? `: ${stdout.slice(0, 200)}` : ' (empty stdout)'}` +
        `${stderr ? ` — stderr: ${String(stderr).slice(0, 200)}` : ''}`,
    )
  }
}

/** Relays a script's own typed `{halt, detail}`/`{error}` shape as a thrown Error, verbatim. */
function rejectIfFailed(parsed: unknown): void {
  if (!parsed || typeof parsed !== 'object') return
  const obj = parsed as Record<string, unknown>
  const halt = obj['halt']
  if (typeof halt === 'string') {
    const detail = obj['detail']
    throw new Error(`${halt}: ${typeof detail === 'string' ? detail : JSON.stringify(obj)}`)
  }
  const error = obj['error']
  if (typeof error === 'string') throw new Error(error)
}

/** Runs `node <script> <cmd> --flag value …` and parses the ONE line of JSON it writes to stdout. */
function runScript(
  script: string,
  cmd: string,
  args: readonly (readonly [string, string])[],
): unknown {
  const argv = [script, cmd]
  for (const [flag, value] of args) argv.push(`--${flag}`, value)
  const result = spawnSync('node', argv, { encoding: 'utf8' })
  const parsed = parseScriptOutput(script, cmd, (result.stdout ?? '').trim(), result.stderr)
  rejectIfFailed(parsed)
  return parsed
}

export function createCycleScriptsBridge(location: CycleScriptsLocation): CycleScriptsBridge {
  const cycleStatePath = join(location.scriptsDir, 'cycle-state.mjs')
  const cycleDispatchPath = join(location.scriptsDir, 'cycle-dispatch.mjs')

  return {
    resolve(options) {
      const args: [string, string][] = [
        ['dir', options.dir],
        ['workflowVersion', options.workflowVersion],
        ['policy', JSON.stringify(options.policy ?? {})],
        ['entry', options.entry],
      ]
      if (options.pr !== undefined) args.push(['pr', String(options.pr)])
      if (options.story !== undefined) args.push(['story', options.story])
      if (options.runsRoot !== undefined) args.push(['runsRoot', options.runsRoot])
      if (options.head !== undefined) args.push(['head', options.head])
      if (options.inputs !== undefined) args.push(['inputs', options.inputs])
      return runScript(cycleStatePath, 'resolve', args) as CycleResolveResult
    },
    worktree(options) {
      const args: [string, string][] = [
        ['main', options.main],
        ['story', options.story],
        ['branch', options.branch],
        ['base', options.base],
      ]
      if (options.worktreeRoot !== undefined) args.push(['worktree-root', options.worktreeRoot])
      return runScript(cycleDispatchPath, 'worktree', args) as CycleWorktreeResult
    },
    packet(options) {
      const args: [string, string][] = [
        ['next', JSON.stringify(options.next)],
        ['card', JSON.stringify(options.card)],
      ]
      if (options.policy !== undefined) args.push(['policy', JSON.stringify(options.policy)])
      if (options.run !== undefined) args.push(['run', options.run])
      if (options.workflowVersion !== undefined)
        args.push(['workflow-version', options.workflowVersion])
      if (options.pipeline !== undefined) args.push(['pipeline', JSON.stringify(options.pipeline)])
      if (options.style !== undefined) args.push(['style', options.style])
      return runScript(cycleDispatchPath, 'packet', args) as CyclePacketResult
    },
  }
}

// ── AC14 — the DoR-gated fallback half of the entry-point discriminator ────────────────────────

export type CardReadiness = 'draft' | 'refined-no-breakdown' | 'ready'

export interface CardMacrostate {
  readonly status: string
  readonly hasTaskBreakdown: boolean
}

/**
 * Reads the card's own macrostate (Draft / Refined-without-breakdown / Ready) from the SAME
 * markdown shape the card template produces, never a second source of truth. A pure classification:
 * no PM-tool call lives here (that adapter call is `handler.ts`'s) — this is the DECISION grammar
 * over the body it is handed.
 */
export function classifyCardReadiness(card: CardMacrostate): CardReadiness {
  if (card.status === 'Draft') return 'draft'
  if (card.status === 'Refined') return card.hasTaskBreakdown ? 'ready' : 'refined-no-breakdown'
  throw new Error(
    `classifyCardReadiness: unrecognised card status ${JSON.stringify(card.status)} — expected ` +
      `'Draft' or 'Refined' (the two macrostates the card template produces)`,
  )
}

// ── AC10 transparency defaults — mirrored, never independently invented ────────────────────────
//
// Printed BEFORE the first stage spawns (AC10), which is BEFORE any real worktree exists to read
// them off idempotently and BEFORE `resolve()` has a run directory to read a live `caps` value
// from (that value only exists once a real git worktree / real run directory back it — neither of
// which the pre-flight transparency line may assume). Mirrored from
// `.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`'s own `PIPELINE_DEFAULTS.worktreeRoot`
// and `CAPS.dispatchesPerStory` — the SAME values `driveCycle`'s real dispatch reads live, via this
// bridge, once a stage actually spawns; this pre-flight line is presentation only, never a decision.
export const CYCLE_WORKTREE_ROOT_DEFAULT = '../pair-worktrees'
export const CYCLE_DISPATCH_CAP_DEFAULT = 40
/** `cycle-state.mjs`'s own `WORKFLOW_VERSION` — the version every handoff records and `resolve` checks. */
export const CYCLE_WORKFLOW_VERSION = '4.0.1'
/** `cycle-state.mjs`'s own `PIPELINE_DEFAULTS.baseBranch` — what a fresh story's worktree is cut from. */
export const CYCLE_BASE_BRANCH_DEFAULT = 'origin/main'
