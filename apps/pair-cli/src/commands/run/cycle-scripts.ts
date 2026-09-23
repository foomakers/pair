import { spawnSync } from 'child_process'
import { isAbsolute, join, relative, resolve } from 'path'
import { pathToFileURL } from 'url'
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
  /**
   * Where the stage agent definitions are installed (the `agent-definitions` registry target),
   * handed to `packet --agents-dir`. Absent ⇒ the script's own relative default (r0-9).
   */
  readonly agentsDir?: string
}

const AGENT_DEFINITIONS_REGISTRY = 'agent-definitions'
const AGENT_DEFINITIONS_DEFAULT = '.claude/agents'

/**
 * The project's installed agent definitions: the `agent-definitions` registry's first target —
 * the same registry `pair-cli install` writes them through — resolved against the project root.
 * Never inferred from where the SKILL landed: a redirected skills target does not move the agents.
 */
export function locateAgentDefinitions(config: Config, projectRoot: string): string {
  const target = extractRegistries(config)[AGENT_DEFINITIONS_REGISTRY]?.targets?.[0]?.path
  return resolve(projectRoot, target ?? AGENT_DEFINITIONS_DEFAULT)
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
  readonly acHash?: string
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
  /** `inputs --story <card JSON>`: the effective-inputs digest both realizations must agree on. */
  inputs(story: Record<string, unknown>, workflowVersion: string): string
  /** `ac-hash --story <id>`: the card body's canonical hash, the one every handoff records. */
  acHash(story: string): string
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

type ScriptArgs = [string, string][]

/** `[flag, value]` for every option that is set — an absent option is never passed as a value. */
function optional(pairs: ReadonlyArray<readonly [string, string | undefined]>): ScriptArgs {
  return pairs.filter((pair): pair is [string, string] => pair[1] !== undefined)
}

function resolveArgs(options: CycleResolveOptions): ScriptArgs {
  return [
    ['dir', options.dir],
    ['workflowVersion', options.workflowVersion],
    ['policy', JSON.stringify(options.policy ?? {})],
    ['entry', options.entry],
    ...optional([
      ['pr', options.pr === undefined ? undefined : String(options.pr)],
      ['story', options.story],
      ['runsRoot', options.runsRoot],
      ['head', options.head],
      ['inputs', options.inputs],
      ['acHash', options.acHash],
    ]),
  ]
}

function packetArgs(options: CyclePacketOptions, location: CycleScriptsLocation): ScriptArgs {
  const json = (value: unknown) => (value === undefined ? undefined : JSON.stringify(value))
  return [
    ['next', JSON.stringify(options.next)],
    ['card', JSON.stringify(options.card)],
    ...optional([
      ['policy', json(options.policy)],
      ['run', options.run],
      ['workflow-version', options.workflowVersion],
      ['pipeline', json(options.pipeline)],
      ['style', options.style],
      ['agents-dir', location.agentsDir],
    ]),
  ]
}

export function createCycleScriptsBridge(location: CycleScriptsLocation): CycleScriptsBridge {
  const cycleStatePath = join(location.scriptsDir, 'cycle-state.mjs')
  const cycleDispatchPath = join(location.scriptsDir, 'cycle-dispatch.mjs')

  return {
    resolve: options =>
      runScript(cycleStatePath, 'resolve', resolveArgs(options)) as CycleResolveResult,
    worktree: options =>
      runScript(cycleDispatchPath, 'worktree', [
        ['main', options.main],
        ['story', options.story],
        ['branch', options.branch],
        ['base', options.base],
        ...optional([['worktree-root', options.worktreeRoot]]),
      ]) as CycleWorktreeResult,
    packet: options =>
      runScript(cycleDispatchPath, 'packet', packetArgs(options, location)) as CyclePacketResult,
    inputs(story, workflowVersion) {
      const out = runScript(cycleStatePath, 'inputs', [
        ['story', JSON.stringify(story)],
        ['workflowVersion', workflowVersion],
      ]) as { inputsDigest?: unknown }
      return String(out.inputsDigest)
    },
    acHash(story) {
      const out = runScript(cycleStatePath, 'ac-hash', [['story', story]]) as { acHash?: unknown }
      return String(out.acHash)
    },
  }
}

// ── the cycle's own defaults, read from the INSTALLED scripts (review r0-10) ───────────────────

/** The values `cycle-state.mjs` itself declares — the version every handoff records, and its pipeline defaults. */
export interface CycleDefaults {
  readonly workflowVersion: string
  readonly worktreeRoot: string
  readonly baseBranch: string
  readonly dispatchCap: number
}

// Imported in a CHILD process, like every other script call: nothing installed is ever evaluated
// inside pair-cli. The module is named through the environment, never argv, so the script's own
// entry-point guard (`argv[1]` is the script) stays false and no CLI command runs.
const READ_DEFAULTS = `const m = await import(process.env.PAIR_CYCLE_STATE_URL)
process.stdout.write(JSON.stringify({
  workflowVersion: m.WORKFLOW_VERSION,
  worktreeRoot: m.PIPELINE_DEFAULTS?.worktreeRoot,
  baseBranch: m.PIPELINE_DEFAULTS?.baseBranch,
  dispatchCap: m.CAPS?.dispatchesPerStory,
}))`

function isCycleDefaults(value: unknown): value is CycleDefaults {
  const v = (value ?? {}) as Record<string, unknown>
  return (
    typeof v['workflowVersion'] === 'string' &&
    typeof v['worktreeRoot'] === 'string' &&
    typeof v['baseBranch'] === 'string' &&
    typeof v['dispatchCap'] === 'number'
  )
}

/**
 * The installed `cycle-state.mjs`'s own `WORKFLOW_VERSION`, `PIPELINE_DEFAULTS.worktreeRoot` /
 * `.baseBranch` and `CAPS.dispatchesPerStory` — so the version and base this run dispatches with,
 * and the root and cap it prints, are the scripts' decision, never a TypeScript literal. Unreadable
 * ⇒ `cycle-state-unreadable`, never a guess.
 */
export function readCycleDefaults(location: CycleScriptsLocation): CycleDefaults {
  const script = join(location.scriptsDir, 'cycle-state.mjs')
  const result = spawnSync('node', ['--input-type=module', '-e', READ_DEFAULTS], {
    encoding: 'utf8',
    env: { ...process.env, PAIR_CYCLE_STATE_URL: pathToFileURL(script).href },
  })
  const parsed = parseScriptOutput(script, 'defaults', (result.stdout ?? '').trim(), result.stderr)
  if (!isCycleDefaults(parsed)) {
    throw new Error(
      `cycle-state-unreadable: ${script} does not declare WORKFLOW_VERSION, ` +
        `PIPELINE_DEFAULTS.worktreeRoot/baseBranch and CAPS.dispatchesPerStory — got ${JSON.stringify(parsed)}`,
    )
  }
  return parsed
}

// ── AC14 — the DoR-gated fallback half of the entry-point discriminator ────────────────────────

export type CardReadiness = 'draft' | 'refined-no-breakdown' | 'ready'

export interface CardMacrostate {
  readonly status: string
  readonly hasTaskBreakdown: boolean
}

/**
 * The card TEMPLATE's own two literals (`Draft`, `Refined`) classified without a board mapping.
 * Not the production routing: `run --card` resolves the board state through the adopted
 * `## State Mapping` (`card-readiness.ts`, review r0-1), where `Refined` is just one board's name.
 */
export function classifyCardReadiness(card: CardMacrostate): CardReadiness {
  if (card.status === 'Draft') return 'draft'
  if (card.status === 'Refined') return card.hasTaskBreakdown ? 'ready' : 'refined-no-breakdown'
  throw new Error(
    `classifyCardReadiness: unrecognised card status ${JSON.stringify(card.status)} — expected ` +
      `'Draft' or 'Refined' (the two macrostates the card template produces)`,
  )
}

// ── parity-pinned mirrors of the scripts' defaults — never a decision (review r0-10) ─────────────
//
// Every value a run DISPATCHES with is read from the installed scripts (`readCycleDefaults`), and
// the worktree root is left to `cycle-dispatch worktree`'s own default. These mirrors survive only
// as what the AC10 transparency block prints when the installed `cycle-state.mjs` cannot be read —
// a run in that state never reaches a stage (the production driver HALTs `cycle-state-unreadable`)
// — and `cycle-defaults-parity.test.ts` pins them to the in-repo script so the two cannot drift.
export const CYCLE_WORKTREE_ROOT_DEFAULT = '../pair-worktrees'
export const CYCLE_DISPATCH_CAP_DEFAULT = 40
/** `cycle-state.mjs`'s own `WORKFLOW_VERSION` — the version every handoff records and `resolve` checks. */
export const CYCLE_WORKFLOW_VERSION = '4.0.1'
/** `cycle-state.mjs`'s own `PIPELINE_DEFAULTS.baseBranch` — what a fresh story's worktree is cut from. */
export const CYCLE_BASE_BRANCH_DEFAULT = 'origin/main'
