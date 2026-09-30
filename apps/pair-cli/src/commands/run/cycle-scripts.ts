import { spawnSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { isAbsolute, join, posix, relative, resolve, win32 } from 'path'
import { pathToFileURL } from 'url'
import type { FileSystemService } from '@pair/content-ops'
import { extractRegistries, type Config } from '#registry'
import type { CycleHookResult, CycleHooks } from './cycle'
import { POLICY_PATH } from './policy-sections'

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
  /** US-490: the card's current `risk:*` label — with `policy.autoAdvance.tiers`, what lets `resolve` offer `merge`. */
  readonly tier?: string
  /** US-521: the card's CURRENT labels (live) — what `decide` reads for a `when` merge gate. */
  readonly labels?: readonly string[]
  /** US-488: the workflow profile's `reuse` stages as `cycle-state`'s own transition-keyed policy. */
  readonly contextPolicy?: Readonly<Record<string, string>>
}

/** The flags `cycle-merge.mjs check|run` share — pinned to the head the verifier reviewed. */
export interface CycleMergeOptions {
  readonly dir: string
  readonly story: string
  readonly pr: number
  readonly reviewedHead: string
  readonly cardTier: string
  /** The legacy `--autoAdvance '<tiers>'` call (pair-loop's, and every run without an active autonomy policy). */
  readonly autoAdvance?: readonly string[]
  /** US-521: the merge gate of an active autonomy policy (`--mergeGate`) — replaces the tier check only. */
  readonly mergeGate?: {
    readonly mode: string
    readonly has: readonly string[]
    readonly lacks: readonly string[]
  }
}

export interface CycleMergeRunOptions extends CycleMergeOptions {
  readonly gate: 'green' | 'red'
  readonly message: string
  readonly branch?: string
  readonly root?: string
}

/** `cycle-merge.mjs`'s own JSON answer, relayed — `merged` / `cascaded` / `reason` never re-derived. */
export interface CycleMergeResult {
  readonly stage?: string
  readonly mode?: string
  readonly mergeAllowed?: boolean
  readonly merged?: boolean
  readonly cascaded?: boolean
  readonly reason?: string | null
  readonly [key: string]: unknown
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
  /** `cycle-merge.mjs check`: conditions 1-5 re-read live; a failure PARKS the card. */
  mergeCheck(options: CycleMergeOptions): CycleMergeResult
  /** `cycle-merge.mjs run`: conditions 1-6 (`gate`), then merge + Story Closure. */
  mergeRun(options: CycleMergeRunOptions): CycleMergeResult
  packet(options: CyclePacketOptions): CyclePacketResult
  /** US-521 `autonomy-policy.mjs resolve`: the ONE effective-policy resolution (grammar, translation, precedence). */
  autonomyResolve(options: { adoption: string; args: Record<string, string> }): AutonomyResolution
  /** US-521 `cycle-merge.mjs escalate`: the ONE idempotent escalation comment on the card. */
  escalate(options: {
    dir: string
    story: string
    stage: string
    conditions: readonly string[]
  }): unknown
  /** `inputs --story <card JSON>`: the effective-inputs digest both realizations must agree on. */
  inputs(story: Record<string, unknown>, workflowVersion: string): string
  /**
   * `ac-hash --story <id> [--dir <run dir>]`: the card body's canonical hash, the one every handoff
   * records — read through the PM tool the run directory is bound to, when it is.
   */
  acHash(story: string, dir?: string): string
  /**
   * `bind-hosts --dir <run dir>` (US-492 AC2): the ONE resolution of the run's PM tool / code host,
   * written once and reused by every later script call naming that directory. A declared host with
   * no adapter throws `host-unsupported: …`, verbatim.
   */
  bindHosts(dir: string): CycleHostBinding
  /**
   * `workflow-profile.mjs bind --dir <run dir>` (US-488 AC7): records the run's ALREADY-resolved
   * profile (name + hash) beside its handoffs; `publish` stamps it into every handoff. Audit only —
   * never an effective input.
   */
  bindProfile(dir: string, identity: CycleProfileIdentity): { readonly action: string }
}

/** `autonomy-policy.mjs resolve`'s answer, relayed — `policy`, `lines` and `errors` are never re-derived here. */
export interface AutonomyResolution {
  readonly ok: boolean
  readonly active: boolean
  readonly policy: {
    readonly until: string
    readonly prepare: unknown
    readonly merge: {
      readonly mode: string
      readonly has: readonly string[]
      readonly lacks: readonly string[]
    }
    readonly legacyTiers?: readonly string[]
  }
  readonly lines: readonly string[]
  readonly warnings: readonly string[]
  readonly errors: readonly { readonly key: string; readonly reason: string }[]
  readonly translated: Readonly<
    Record<string, { readonly from: string; readonly equivalent: string }>
  >
}

export interface CycleProfileIdentity {
  readonly name: string
  readonly hash: string
  readonly source: string
}

/** What `bind-hosts` answers: `bound` on a new run, `reused` when the run already carries one. */
export interface CycleHostBinding {
  readonly action: 'bound' | 'reused'
  readonly binding: { readonly pmTool: string; readonly codeHost: string | null }
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
function runScriptIn(
  script: string,
  cmd: string,
  args: readonly (readonly [string, string])[],
  cwd?: string,
): unknown {
  return runScriptArgv([script, cmd], args, cwd)
}

/** `runScriptIn` with a caller-built argv head (positional arguments before the flags). */
function runScriptArgv(
  head: readonly string[],
  args: readonly (readonly [string, string])[],
  cwd?: string,
  maxBuffer?: number,
): unknown {
  const argv = [...head]
  for (const [flag, value] of args) argv.push(`--${flag}`, value)
  const result = spawnSync('node', argv, {
    encoding: 'utf8',
    ...(cwd !== undefined && { cwd }),
    ...(maxBuffer !== undefined && { maxBuffer }),
  })
  const parsed = parseScriptOutput(head[0]!, head[1]!, (result.stdout ?? '').trim(), result.stderr)
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
      ['tier', options.tier],
      ['labels', options.labels === undefined ? undefined : JSON.stringify(options.labels)],
      [
        'contextPolicy',
        options.contextPolicy === undefined || Object.keys(options.contextPolicy).length === 0
          ? undefined
          : JSON.stringify(options.contextPolicy),
      ],
    ]),
  ]
}

function mergeArgs(options: CycleMergeOptions): ScriptArgs {
  return [
    ['dir', options.dir],
    ['story', options.story],
    ['pr', String(options.pr)],
    ['reviewedHead', options.reviewedHead],
    ['cardTier', options.cardTier],
    options.mergeGate !== undefined
      ? ['mergeGate', JSON.stringify(options.mergeGate)]
      : ['autoAdvance', JSON.stringify(options.autoAdvance ?? [])],
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

function bindProfileArgs(dir: string, identity: CycleProfileIdentity): ScriptArgs {
  return [
    ['dir', dir],
    ['name', identity.name],
    ['hash', identity.hash],
    ['source', identity.source],
  ]
}

/** `cycle-merge.mjs check|run` as typed calls over the same script runner. */
function mergeMethods(
  runScript: (script: string, cmd: string, args: ScriptArgs) => unknown,
  script: string,
): Pick<CycleScriptsBridge, 'mergeCheck' | 'mergeRun'> {
  return {
    mergeCheck: options => runScript(script, 'check', mergeArgs(options)) as CycleMergeResult,
    mergeRun: options =>
      runScript(script, 'run', [
        ...mergeArgs(options),
        ['gate', options.gate],
        ['message', options.message],
        ...optional([
          ['branch', options.branch],
          ['root', options.root],
        ]),
      ]) as CycleMergeResult,
  }
}

/** US-521: `autonomy-policy.mjs resolve` and `cycle-merge.mjs escalate` as typed calls — the rule stays in the scripts. */
function autonomyMethods(
  runScript: (script: string, cmd: string, args: ScriptArgs) => unknown,
  scriptsDir: string,
): Pick<CycleScriptsBridge, 'autonomyResolve' | 'escalate'> {
  return {
    autonomyResolve: options =>
      runScript(join(scriptsDir, 'autonomy-policy.mjs'), 'resolve', [
        ['adoption', options.adoption],
        ['args', JSON.stringify(options.args)],
      ]) as AutonomyResolution,
    escalate: options =>
      runScript(join(scriptsDir, 'cycle-merge.mjs'), 'escalate', [
        ['dir', options.dir],
        ['story', options.story],
        ['stage', options.stage],
        ['conditions', JSON.stringify(options.conditions)],
      ]),
  }
}

/**
 * `cwd` is the PROJECT directory the scripts run in (r1-3): `ac-hash` shells out to `gh`, which
 * resolves the repository from its cwd, so a script run from anywhere else hashes another
 * repository's issue. Absent ⇒ this process's cwd (the bridge's own unit tests).
 */
export function createCycleScriptsBridge(
  location: CycleScriptsLocation,
  cwd?: string,
): CycleScriptsBridge {
  const cycleStatePath = join(location.scriptsDir, 'cycle-state.mjs')
  const cycleDispatchPath = join(location.scriptsDir, 'cycle-dispatch.mjs')
  const runScript = (script: string, cmd: string, args: ScriptArgs): unknown =>
    runScriptIn(script, cmd, args, cwd)

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
    ...mergeMethods(runScript, join(location.scriptsDir, 'cycle-merge.mjs')),
    ...autonomyMethods(runScript, location.scriptsDir),
    packet: options =>
      runScript(cycleDispatchPath, 'packet', packetArgs(options, location)) as CyclePacketResult,
    inputs(story, workflowVersion) {
      const out = runScript(cycleStatePath, 'inputs', [
        ['story', JSON.stringify(story)],
        ['workflowVersion', workflowVersion],
      ]) as { inputsDigest?: unknown }
      return String(out.inputsDigest)
    },
    acHash(story, dir) {
      const out = runScript(cycleStatePath, 'ac-hash', [
        ['story', story],
        ...optional([['dir', dir]]),
      ]) as { acHash?: unknown }
      return String(out.acHash)
    },
    bindHosts(dir) {
      return runScript(cycleStatePath, 'bind-hosts', [['dir', dir]]) as CycleHostBinding
    },
    bindProfile: (dir, identity) =>
      runScript(
        join(location.scriptsDir, 'workflow-profile.mjs'),
        'bind',
        bindProfileArgs(dir, identity),
      ) as { action: string },
  }
}

// ── the cycle's own defaults, read from the INSTALLED scripts (review r0-10) ───────────────────

/** The values `cycle-state.mjs` itself declares — the version every handoff records, and its pipeline defaults. */
export interface CycleDefaults {
  readonly workflowVersion: string
  readonly worktreeRoot: string
  readonly baseBranch: string
}

// Imported in a CHILD process, like every other script call: nothing installed is ever evaluated
// inside pair-cli. The module is named through the environment, never argv, so the script's own
// entry-point guard (`argv[1]` is the script) stays false and no CLI command runs.
const READ_DEFAULTS = `const m = await import(process.env.PAIR_CYCLE_STATE_URL)
process.stdout.write(JSON.stringify({
  workflowVersion: m.WORKFLOW_VERSION,
  worktreeRoot: m.PIPELINE_DEFAULTS?.worktreeRoot,
  baseBranch: m.PIPELINE_DEFAULTS?.baseBranch,
}))`

function isCycleDefaults(value: unknown): value is CycleDefaults {
  const v = (value ?? {}) as Record<string, unknown>
  return (
    typeof v['workflowVersion'] === 'string' &&
    typeof v['worktreeRoot'] === 'string' &&
    typeof v['baseBranch'] === 'string'
  )
}

/**
 * The installed `cycle-state.mjs`'s own `WORKFLOW_VERSION` and `PIPELINE_DEFAULTS.worktreeRoot` /
 * `.baseBranch` — so the version and base this run dispatches with, and the root it prints, are
 * the scripts' decision, never a TypeScript literal. Unreadable ⇒ `cycle-state-unreadable`, never
 * a guess. (US-514 T-3: the dispatch ceiling used to live here too, as `CAPS.dispatchesPerStory` —
 * a hard-coded 40. It is GONE from the script; the only ceiling left is `policy.maxDispatches`, an
 * ADOPTION value (T-1), read separately — see `blocking-severities.ts` / `describeMaxDispatches`.)
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
      `cycle-state-unreadable: ${script} does not declare WORKFLOW_VERSION or ` +
        `PIPELINE_DEFAULTS.worktreeRoot/baseBranch — got ${JSON.stringify(parsed)}`,
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
/** `cycle-state.mjs`'s own `WORKFLOW_VERSION` — the version every handoff records and `resolve` checks. */
export const CYCLE_WORKFLOW_VERSION = '4.0.1'
/** `cycle-state.mjs`'s own `PIPELINE_DEFAULTS.baseBranch` — what a fresh story's worktree is cut from. */
export const CYCLE_BASE_BRANCH_DEFAULT = 'origin/main'

// ── `## Cycle Hooks` (US-489) — the SAME shared executor the in-session skill calls ────────────

const pathFor = (platform: NodeJS.Platform) => (platform === 'win32' ? win32 : posix)

/** The MAIN checkout's `tech/automation.md`, joined with the injected platform's separator. */
export function cycleHooksPolicyPath(main: string, platform: NodeJS.Platform = process.platform) {
  return pathFor(platform).join(main, ...POLICY_PATH.split('/'))
}

/** The installed `cycle-hooks.mjs` under the skill's scripts directory, platform-injected. */
export function cycleHooksScriptPath(
  scriptsDir: string,
  platform: NodeJS.Platform = process.platform,
) {
  return pathFor(platform).join(scriptsDir, 'cycle-hooks.mjs')
}

/**
 * The executor answers with ONE JSON line holding a hook's output, which it captures up to 64 MiB
 * (and JSON escaping can grow it). Node's default 1 MiB `spawnSync` buffer truncated that line into
 * unparseable JSON — an unreadable cycle instead of `failed-hook`. Well above the cap, never near it.
 */
const HOOK_ANSWER_MAX_BUFFER = 512 * 1024 * 1024

/** The only hook points that may default to the main checkout; every stage hook needs its worktree. */
const CYCLE_LEVEL = new Set(['pre-cycle', 'post-cycle', 'on-halt', 'post-merge'])

function requireStageCwd(point: string, cwd: string | undefined): void {
  if (cwd === undefined && !CYCLE_LEVEL.has(point))
    throw new Error(
      `stage hook \`${point}\` has no story worktree path — refusing to run it in the main checkout`,
    )
}

export interface CycleHooksBridge extends CycleHooks {
  /** `load`: the section's unrecognized-key / unparseable-line warnings, reported once per run. */
  warnings(): readonly string[]
}

/**
 * Spawns the installed `cycle-hooks.mjs` (never a TypeScript port of its rules): the blocking vs
 * logging semantics, the pattern-derived names and the `on-halt` gate all live in that one script,
 * so `pair-workflow-cycle` and `pair-cli run --card` cannot drift. `policyPath` is the MAIN
 * checkout's `tech/automation.md`. Cycle-level hooks run in `options.cwd` (the main checkout); a
 * stage hook passes the story worktree per call.
 */
export function createCycleHooksBridge(
  location: CycleScriptsLocation,
  options: { readonly policyPath: string; readonly cwd: string },
): CycleHooksBridge {
  const script = cycleHooksScriptPath(location.scriptsDir)
  // An installed skill older than US-489 has no executor. That is silent ONLY when the project
  // declares no `## Cycle Hooks` — a declared hook that cannot run is never a quiet no-op.
  if (!existsSync(script)) {
    const declared =
      existsSync(options.policyPath) &&
      /^##\s+Cycle Hooks\s*$/m.test(readFileSync(options.policyPath, 'utf8'))
    return {
      warnings() {
        if (declared) {
          throw new Error(
            `skill-outdated: ${options.policyPath} declares \`## Cycle Hooks\` but ${script} is not ` +
              `installed — update the skill (\`pair-cli update\`) before running with hooks.`,
          )
        }
        return []
      },
      run: async () => ({}),
    }
  }
  return {
    warnings() {
      const out = runScriptArgv([script, 'load', options.policyPath], []) as {
        warnings?: readonly string[]
      }
      return out.warnings ?? []
    },
    async run(point, status, cwd) {
      requireStageCwd(point, cwd)
      const where = cwd ?? options.cwd
      const args: [string, string][] = [
        ['point', point],
        ['cwd', where],
        ...optional([['status', status]]),
      ]
      return runScriptArgv(
        [script, 'run', options.policyPath],
        args,
        where,
        HOOK_ANSWER_MAX_BUFFER,
      ) as CycleHookResult
    },
  }
}
