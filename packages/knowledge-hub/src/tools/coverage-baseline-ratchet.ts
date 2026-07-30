/**
 * coverage-baseline-ratchet — the OPT-IN commit-back half of the coverage
 * guardrail (story #372, on top of #282).
 *
 * The guardrail itself (`.pair/knowledge/assets/coverage-gate.sh`) decides
 * pass/fail and NEVER persists anything. This module is the separable side
 * effect: given the coverage a run measured and the committed config, it decides
 * whether a `baseline.<type>` may be RAISED, produces the edited config text,
 * and produces the git/gh command plan that lands the raise as a bot pull
 * request. The two are independent by construction — a refused write can never
 * change the gate's verdict (AC6).
 *
 * The decisions this module encodes are recorded in
 * `.pair/adoption/decision-log/2026-07-30-coverage-ratchet-pr-not-push.md`:
 *
 *   - AC5 — a `pull_request` run NEVER writes back. Only the post-merge `push`
 *     on the base branch does, and it writes a bot PR from a dedicated branch,
 *     never a push to the (post-#234 protected) base branch.
 *   - AC4 — loop termination is a skip predicate (`shouldSkipCommitBack`) plus a
 *     fixpoint (`proposeBaseline` is idempotent on unchanged coverage), not
 *     `[skip ci]`.
 *   - AC6 — a refused write is classified and named (`classifyWriteRefusal`) and
 *     reported as a warning; the CLI exits 0.
 *   - Monotonic ratchet — `applyRaises` re-checks every proposal against the text
 *     currently on disk, so a higher value written by a concurrent run is never
 *     clobbered, and a value is never lowered.
 *
 * Per the gate-tooling ADL (2026-07-13) the logic lives HERE, white-box unit
 * tested, and the CI step + `coverage:ratchet` scripts are thin entrypoints; the
 * CLI wiring is verified end-to-end by the `coverage-gate.sh` smoke scenario
 * (`--dry-run`), never by a unit test.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

/** Marker that makes an automated commit (and the ratchet PR title) self-identifying. */
export const RATCHET_MARKER = '[coverage-baseline-ratchet]'

/** The dedicated branch the ratchet PR is opened from. Never the base branch. */
export const RATCHET_BRANCH = 'chore/coverage-baseline-ratchet'

/**
 * Margin, in percentage points, between the measured coverage and the baseline
 * written. NOT a new convention: `tech/coverage-baseline.md` already documents
 * "~1pp below the measured value, to absorb per-run float jitter and legitimate
 * line churn", and `floor(measured) - 1` reproduces both committed values
 * exactly (85.04 -> 84, 20.16 -> 19). It is also what makes the ratchet a
 * fixpoint, which is half of the loop-termination guarantee.
 */
export const DEFAULT_MARGIN_PP = 1

/** Env var carrying the dedicated, repo-scoped write credential (see the ADL). */
export const TOKEN_ENV = 'COVERAGE_RATCHET_TOKEN'

/** Slug of the ADL that decided the PR-vs-push behaviour and the credential model. */
export const ADL_SLUG = '2026-07-30-coverage-ratchet-pr-not-push'

const DEFAULT_CONFIG_PATH = '.pair/adoption/tech/coverage-baseline.md'
const DEFAULT_WOW_PATH = '.pair/adoption/tech/way-of-working.md'
const BOT_NAME = 'pair-coverage-ratchet[bot]'
const BOT_EMAIL = 'pair-coverage-ratchet[bot]@users.noreply.github.com'

/** Escape regex metacharacters so a dotted config key matches literally. */
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** True iff the value is a plain non-negative number (same shape the shell gate accepts). */
const isNumeric = (v: unknown): boolean => typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim())

// ---------------------------------------------------------------------------
// Ratchet arithmetic + config reading
// ---------------------------------------------------------------------------

/**
 * The baseline value a measured coverage justifies: `floor(measured) - margin`,
 * clamped at 0. Idempotent by construction — re-running on the same coverage
 * proposes the value already committed.
 */
export function proposeBaseline(measuredPct: number, marginPp: number = DEFAULT_MARGIN_PP): number {
  return Math.max(0, Math.floor(measuredPct) - marginPp)
}

/**
 * The committed `baseline.<type>` value, or null when absent or malformed.
 * Config format is UNCHANGED from #282: a `^baseline.<type>=<int>` line, matched
 * literally, ignoring the surrounding markdown. A trailing CR (CRLF-authored
 * config) is tolerated.
 */
export function readBaselineValue(configText: string, type: string): number | null {
  const m = new RegExp(`^baseline\\.${esc(type)}=([^\\r\\n]*)`, 'm').exec(configText)
  if (!m) return null
  const raw = (m[1] ?? '').trim()
  return /^\d+$/.test(raw) ? Number(raw) : null
}

/** Declared state of the `Coverage baseline commit-back` opt-in. */
export type CommitBackFlag = 'enabled' | 'disabled' | 'absent'

/**
 * Read the opt-in from a way-of-working document. Absent => off: the framework
 * default ships `disabled`, so a project that never declares the flag behaves
 * exactly as before this story (AC1).
 */
export function readCommitBackFlag(wayOfWorkingText: string): CommitBackFlag {
  const m = /coverage\s+baseline\s+commit-back\**\s*:\s*`?\s*(enabled|disabled)/i.exec(
    wayOfWorkingText,
  )
  return m ? ((m[1] ?? '').toLowerCase() as CommitBackFlag) : 'absent'
}

// ---------------------------------------------------------------------------
// Skip predicate (AC1 / AC4 / AC5)
// ---------------------------------------------------------------------------

export type SkipCode = 'flag-disabled' | 'not-base-push' | 'automated-commit'

export interface SkipDecision {
  skip: boolean
  /** Set only when `skip` is true. */
  code?: SkipCode
  /** Set only when `skip` is true. */
  reason?: string
}

export interface RunContext {
  commitBackFlag: CommitBackFlag
  /** `GITHUB_EVENT_NAME` — only `push` may write. */
  eventName: string
  /** `GITHUB_REF_NAME` — must equal `baseBranch`. */
  refName: string
  baseBranch: string
  /** Subject+body of the commit the run is for. */
  headCommitMessage: string
}

/** True iff a commit message identifies itself as produced by the ratchet. */
function isRatchetCommitMessage(message: string): boolean {
  // The marker covers a direct commit and a squash merge (whose subject defaults
  // to the ratchet PR title, which carries the marker). The branch name covers a
  // plain merge commit ("Merge pull request #N from owner/<ratchet-branch>"),
  // whose subject GitHub generates without the PR title.
  return message.includes(RATCHET_MARKER) || message.includes(RATCHET_BRANCH)
}

/**
 * Whether this run must NOT attempt a commit-back. Evaluated in order so the
 * opt-in short-circuits everything else:
 *
 *   1. `flag-disabled`   — the flag is not `enabled` (default; AC1).
 *   2. `not-base-push`   — not a `push` to the base branch, i.e. every
 *                          `pull_request` run, fork or not (AC5).
 *   3. `automated-commit`— the head commit is the ratchet's own (AC4).
 */
export function shouldSkipCommitBack(ctx: RunContext): SkipDecision {
  if (ctx.commitBackFlag !== 'enabled') {
    return {
      skip: true,
      code: 'flag-disabled',
      reason: `Coverage baseline commit-back is '${ctx.commitBackFlag}' (default: off) — nothing is written`,
    }
  }
  if (ctx.eventName !== 'push' || ctx.refName !== ctx.baseBranch) {
    return {
      skip: true,
      code: 'not-base-push',
      reason: `only a push to '${ctx.baseBranch}' writes back (got event '${ctx.eventName}' on '${ctx.refName}') — a pull request never does, see ADL ${ADL_SLUG}`,
    }
  }
  if (isRatchetCommitMessage(ctx.headCommitMessage)) {
    return {
      skip: true,
      code: 'automated-commit',
      reason: `head commit is the ratchet's own ${RATCHET_MARKER} — stopping the loop`,
    }
  }
  return { skip: false }
}

// ---------------------------------------------------------------------------
// Planning (AC2 / AC3 + edge cases)
// ---------------------------------------------------------------------------

export type RatchetAction = 'raise' | 'hold' | 'no-baseline-configured' | 'not-measured'

export interface RatchetProposal {
  type: string
  measured: number | null
  /** The committed baseline, or null when absent/malformed. */
  current: number | null
  /** The value the measurement justifies, or null when nothing was measured. */
  proposed: number | null
  action: RatchetAction
  reason: string
}

/** Per-type measured coverage, as extracted from the coverage report. */
export type MeasuredCoverage = Record<string, number | string | undefined>

/**
 * Decide, per type, whether the committed baseline may be raised. Nothing is
 * written here. The ratchet is monotonic: only a proposal STRICTLY above the
 * committed value is a `raise`; equal, lower and unmeasured are all holds.
 */
export function planRatchet(
  configText: string,
  measured: MeasuredCoverage,
  marginPp: number = DEFAULT_MARGIN_PP,
): RatchetProposal[] {
  return Object.keys(measured).map(type => {
    const raw = measured[type]
    if (!isNumeric(raw === undefined ? undefined : String(raw))) {
      return {
        type,
        measured: null,
        current: readBaselineValue(configText, type),
        proposed: null,
        action: 'not-measured',
        reason: `no usable coverage measured for '${type}' — nothing written (the gate's own fail-safe still applies)`,
      }
    }
    const measuredPct = Number(raw)
    const current = readBaselineValue(configText, type)
    const proposed = proposeBaseline(measuredPct, marginPp)
    if (current === null) {
      return {
        type,
        measured: measuredPct,
        current: null,
        proposed,
        action: 'no-baseline-configured',
        reason: `no valid committed baseline.${type} in the config — reporting the suggestion ${proposed} only, writing nothing (a first baseline stays a human commit)`,
      }
    }
    if (proposed > current) {
      return {
        type,
        measured: measuredPct,
        current,
        proposed,
        action: 'raise',
        reason: `measured ${measuredPct}% => baseline ${proposed} (floor - ${marginPp}pp margin), above committed ${current}`,
      }
    }
    return {
      type,
      measured: measuredPct,
      current,
      proposed,
      action: 'hold',
      reason: `measured ${measuredPct}% => baseline ${proposed}, not above committed ${current} — the ratchet only ever moves up`,
    }
  })
}

export interface ApplyResult {
  text: string
  changedLines: number
  /** Proposals refused at write time because the value on disk is already >=. */
  dropped: RatchetProposal[]
}

/**
 * Apply raises to the config text by editing the `baseline.<type>=` VALUE in
 * place — the surrounding markdown, line count, ordering and line endings are
 * untouched.
 *
 * Every proposal is re-checked against the text passed in (which the caller
 * re-reads from disk immediately before writing), so a higher value committed by
 * a concurrent run is never clobbered: such a proposal is `dropped`, not written.
 */
export function applyRaises(configText: string, raises: RatchetProposal[]): ApplyResult {
  let text = configText
  let changedLines = 0
  const dropped: RatchetProposal[] = []

  for (const raise of raises) {
    if (raise.proposed === null) {
      dropped.push(raise)
      continue
    }
    const onDisk = readBaselineValue(text, raise.type)
    if (onDisk === null || raise.proposed <= onDisk) {
      dropped.push(raise)
      continue
    }
    const re = new RegExp(`^(baseline\\.${esc(raise.type)}=)([^\\r\\n]*)`, 'm')
    text = text.replace(re, `$1${raise.proposed}`)
    changedLines += 1
  }

  return { text, changedLines, dropped }
}

// ---------------------------------------------------------------------------
// Refusal classification (AC6)
// ---------------------------------------------------------------------------

export type RefusalCode =
  | 'missing-credential'
  | 'protected-branch'
  | 'insufficient-scope'
  | 'stale-lease'
  | 'unknown'

export interface Refusal {
  code: RefusalCode
  message: string
}

/**
 * Name the reason a write was refused. AC6: the run degrades to a WARNING that
 * names the reason and the gate's verdict is unchanged — so the reason must be
 * identified, never swallowed (`unknown` still carries the raw output).
 */
export function classifyWriteRefusal(output: string, opts: { hasToken: boolean }): Refusal {
  if (!opts.hasToken) {
    return {
      code: 'missing-credential',
      message: `no write credential: ${TOKEN_ENV} is not set (a repo-scoped token with contents:write + pull-requests:write — see ADL ${ADL_SLUG})`,
    }
  }
  if (/GH006|protected branch/i.test(output)) {
    return { code: 'protected-branch', message: `refused by branch protection: ${output.trim()}` }
  }
  if (/permission to .* denied|not accessible by integration|403|insufficient/i.test(output)) {
    return {
      code: 'insufficient-scope',
      message: `credential lacks the required permission: ${output.trim()}`,
    }
  }
  if (/stale info|force-with-lease|non-fast-forward|\[rejected\]/i.test(output)) {
    return {
      code: 'stale-lease',
      message: `the ratchet branch moved under us (concurrent run): ${output.trim()}`,
    }
  }
  return { code: 'unknown', message: `write refused, reason not recognized: ${output.trim()}` }
}

// ---------------------------------------------------------------------------
// Command plan — a bot PR, never a push to the base branch
// ---------------------------------------------------------------------------

/**
 * One step of the plan. `optional` marks a command whose failure is EXPECTED in
 * a legitimate state and must not abort the sequence — currently only the
 * ratchet-branch fetch, which fails on the first ever run because the branch
 * does not exist remotely yet.
 */
export interface RatchetCommand {
  argv: string[]
  optional?: boolean
}

export interface RatchetGitPlan {
  /** Ordered command sequence. Empty when there is nothing to raise. */
  commands: RatchetCommand[]
  /** Run only when `gh pr create` reports the PR already exists. */
  prUpdate: string[]
  /**
   * Run afterwards whatever happened — success, refusal or crash — so the
   * checkout is left exactly as the steps after this one expect to find it
   * (the local ratchet commit and the edited config are dropped; the pushed
   * ratchet branch is unaffected).
   */
  restore: string[]
  commitMessage: string
  prTitle: string
  prBody: string
}

export interface RatchetGitPlanInput {
  raises: RatchetProposal[]
  configPath: string
  baseBranch: string
  remote: string
  /** SHA the run checked out — what `restore` returns the workspace to. */
  headCommit: string
}

/** The ratchet PR's body: what changed, why it is a PR, and what merging it means. */
function ratchetPrBody(raises: RatchetProposal[], configPath: string, baseBranch: string): string {
  return [
    `Automated coverage-baseline ratchet — opt-in commit-back from story #372.`,
    ``,
    `| Type | Committed | Measured | New baseline |`,
    `| --- | --- | --- | --- |`,
    ...raises.map(r => `| \`${r.type}\` | ${r.current} | ${r.measured}% | **${r.proposed}** |`),
    ``,
    `Only \`baseline.<type>\` values in \`${configPath}\` are edited, in place; the ratchet never lowers a baseline.`,
    `New values are \`floor(measured) - ${DEFAULT_MARGIN_PP}pp\`, the margin that file already documents.`,
    ``,
    `Why a pull request and not a push to \`${baseBranch}\`: \`.pair/adoption/decision-log/${ADL_SLUG}.md\`.`,
    `Merging this raises the guardrail's floor. Closing it declines the raise; the next base-branch push will propose it again.`,
  ].join('\n')
}

/**
 * The exact command sequence that lands the raise. Deliberate properties, each
 * asserted by a unit test:
 *
 *   - the ONLY push targets `RATCHET_BRANCH`, never the base branch, and no
 *     local branch is created or switched to: the commit is made on the checked-
 *     out HEAD and pushed by explicit refspec, then `restore` undoes it. Leaving
 *     the workspace on a bot branch would silently change what every later step
 *     in the job runs against.
 *   - the push uses `--force-with-lease`, never a bare `--force`. The lease needs
 *     a remote-tracking ref for the destination, and a CI checkout has none for
 *     this branch (it fetches only the base ref) — without one git rejects EVERY
 *     non-fast-forward push as `stale info`, which would make the ratchet work
 *     exactly once and then warn forever. So the plan first teaches the remote a
 *     fetch refspec for the ratchet branch and fetches it (optional: absent on
 *     the first run). The lease then means what it says: if the ratchet branch
 *     moved between that fetch and the push, this run loses.
 *   - staging is an explicit path — never `git add -A`;
 *   - the commit subject AND the PR title carry `RATCHET_MARKER`, so the loop
 *     guard survives both a squash and a merge commit.
 *
 * The force-push to the ratchet branch updates an already-open ratchet PR in
 * place, which is why create-or-update needs no branching beyond `prUpdate`
 * (title/body refresh).
 *
 * Note what does NOT depend on the lease: never clobbering a higher baseline is
 * guaranteed at the data level by `applyRaises` re-reading the config and
 * re-checking every proposal, not by the push.
 */
export function ratchetGitPlan(input: RatchetGitPlanInput): RatchetGitPlan {
  const { raises, configPath, baseBranch, remote, headCommit } = input
  if (raises.length === 0) {
    return { commands: [], prUpdate: [], restore: [], commitMessage: '', prTitle: '', prBody: '' }
  }

  const summary = raises.map(r => `${r.type} ${r.current}->${r.proposed}`).join(', ')
  const commitMessage = `chore: ratchet coverage baseline (${summary}) ${RATCHET_MARKER}`
  const prTitle = `chore: ratchet coverage baseline ${RATCHET_MARKER}`
  const prBody = ratchetPrBody(raises, configPath, baseBranch)
  const trackingRefspec = `+refs/heads/${RATCHET_BRANCH}:refs/remotes/${remote}/${RATCHET_BRANCH}`
  const ghCreate = ['gh', 'pr', 'create', '--base', baseBranch, '--head', RATCHET_BRANCH]

  return {
    commands: [
      { argv: ['git', 'config', 'user.name', BOT_NAME] },
      { argv: ['git', 'config', 'user.email', BOT_EMAIL] },
      // Commit on the checked-out HEAD — no branch is created or switched to.
      { argv: ['git', 'add', '--', configPath] },
      { argv: ['git', 'commit', '-m', commitMessage] },
      // Make the destination leaseable: map it to a remote-tracking ref, then
      // fetch it. Optional — on the first run the branch does not exist yet.
      { argv: ['git', 'config', '--add', `remote.${remote}.fetch`, trackingRefspec] },
      { argv: ['git', 'fetch', '--no-tags', remote, trackingRefspec], optional: true },
      { argv: ['git', 'push', '--force-with-lease', remote, `HEAD:refs/heads/${RATCHET_BRANCH}`] },
      { argv: [...ghCreate, '--title', prTitle, '--body', prBody] },
    ],
    prUpdate: ['gh', 'pr', 'edit', RATCHET_BRANCH, '--title', prTitle, '--body', prBody],
    // An explicit SHA, never `HEAD~1`: a relative reset would destroy the base
    // branch's own tip if the sequence failed before the commit was created.
    restore: ['git', 'reset', '--hard', headCommit],
    commitMessage,
    prTitle,
    prBody,
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export interface RenderInput {
  skip?: SkipDecision
  plan: RatchetProposal[]
}

/** The step's human-readable output: one line per type, or the skip and its code. */
export function renderRatchetPlan({ skip, plan }: RenderInput): string {
  if (skip?.skip) {
    return `coverage-ratchet: SKIPPED (${skip.code}) — ${skip.reason}`
  }
  const lines = plan.map(
    p =>
      `coverage-ratchet: ${p.type} — ${p.action}: ${p.reason} [measured=${p.measured ?? 'n/a'} committed=${p.current ?? 'n/a'} proposed=${p.proposed ?? 'n/a'}]`,
  )
  if (!plan.some(p => p.action === 'raise')) {
    lines.push('coverage-ratchet: no raise — nothing to commit back')
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Thin CLI entrypoint (verified by the coverage-gate smoke scenario, not by a
// unit test — gate-tooling ADL 2026-07-13)
// ---------------------------------------------------------------------------

interface CliOptions {
  configPath: string
  wowPath: string
  measured: MeasuredCoverage
  baseBranch: string
  remote: string
  marginPp: number
  dryRun: boolean
}

/** One flag's effect. `value` is undefined for the flags that take no argument. */
type FlagHandler = (opts: CliOptions, value: string | undefined) => void

/** `takesValue` says whether the next argv entry belongs to this flag. */
const CLI_FLAGS: Record<string, { takesValue: boolean; apply: FlagHandler }> = {
  '--config': { takesValue: true, apply: (o, v) => void (o.configPath = v as string) },
  '--way-of-working': { takesValue: true, apply: (o, v) => void (o.wowPath = v as string) },
  '--measured': {
    takesValue: true,
    apply: (o, v) => {
      const [type, pct] = (v as string).split('=')
      if (!type) throw new Error('--measured expects <type>=<pct>')
      o.measured[type] = pct
    },
  },
  '--base-branch': { takesValue: true, apply: (o, v) => void (o.baseBranch = v as string) },
  '--remote': { takesValue: true, apply: (o, v) => void (o.remote = v as string) },
  '--margin': { takesValue: true, apply: (o, v) => void (o.marginPp = Number(v)) },
  '--dry-run': { takesValue: false, apply: o => void (o.dryRun = true) },
  // POSIX separator — `pnpm run <script> -- <args>` forwards it verbatim.
  '--': { takesValue: false, apply: () => undefined },
}

function parseCliArgs(argv: string[], env: NodeJS.ProcessEnv): CliOptions {
  const opts: CliOptions = {
    configPath: DEFAULT_CONFIG_PATH,
    wowPath: DEFAULT_WOW_PATH,
    measured: {},
    baseBranch: env['PAIR_RATCHET_BASE_BRANCH'] || 'main',
    remote: 'origin',
    marginPp: DEFAULT_MARGIN_PP,
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string
    const flag = CLI_FLAGS[arg]
    if (flag === undefined) throw new Error(`unknown argument '${arg}'`)
    let value: string | undefined
    if (flag.takesValue) {
      value = argv[i + 1]
      if (value === undefined) throw new Error(`${arg} requires a value`)
      i += 1
    }
    flag.apply(opts, value)
  }
  return opts
}

/** Auth for `git push` via the same config key actions/checkout uses — keeps the token off the command line. */
function gitAuthEnv(token: string): NodeJS.ProcessEnv {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    GH_TOKEN: token,
  }
}

function warn(message: string): void {
  // GitHub Actions annotation; harmless prefix elsewhere.
  console.log(`::warning::coverage-ratchet: ${message}`)
}

/** Repo-root-relative paths + git must run at the root; the package script's cwd is the package dir. */
function anchorToRepoRoot(): void {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' })
    process.chdir(root.trim())
  } catch {
    warn('could not resolve the repository root — resolving paths from the current directory')
  }
}

interface ExecFailure {
  stderr?: Buffer
  stdout?: Buffer
  message?: string
}

/** Combined stdout+stderr of a failed child process — the text AC6 must name a reason from. */
function failureOutput(e: unknown): string {
  const err = e as ExecFailure
  return `${err.stderr?.toString() ?? ''}${err.stdout?.toString() ?? ''}` || err.message || ''
}

/** Print the plan instead of running it. */
function printDryRun(gitPlan: RatchetGitPlan): void {
  console.log('coverage-ratchet: DRY RUN — would run:')
  for (const { argv, optional } of gitPlan.commands) {
    console.log(`  ${argv.join(' ')}${optional === true ? '   # failure tolerated' : ''}`)
  }
  console.log(`  ${gitPlan.restore.join(' ')}   # always, restores the workspace`)
}

/**
 * Apply the raises to the config on disk. Returns false (having warned) when
 * there is nothing left to write because a concurrent run already won the race.
 */
function writeRaises(configPath: string, raises: RatchetProposal[]): boolean {
  // Re-read immediately before writing so a concurrent, higher value wins.
  const applied = applyRaises(readFileSync(configPath, 'utf-8'), raises)
  if (applied.changedLines === 0) {
    const types = applied.dropped.map(d => d.type).join(', ')
    warn(
      `nothing written — the config on disk already holds a value at or above every proposal (${types}); a concurrent run won the race`,
    )
    return false
  }
  writeFileSync(configPath, applied.text)
  return true
}

/** `gh pr create` failed because the ratchet PR is already open: refresh it in place. */
function refreshOpenPr(prUpdate: string[], env: NodeJS.ProcessEnv): void {
  const [bin, ...args] = prUpdate
  try {
    execFileSync(bin as string, args, { env, stdio: 'pipe' })
  } catch {
    warn('ratchet PR is already open but its title/body could not be refreshed')
  }
}

/**
 * Run the plan. Returns false on a refused write, having warned with the named
 * reason — never throws and never a non-zero exit: persistence must not be able
 * to change the gate's verdict (AC6).
 */
function runPlan(gitPlan: RatchetGitPlan, env: NodeJS.ProcessEnv): boolean {
  for (const { argv, optional } of gitPlan.commands) {
    const [bin, ...args] = argv
    if (bin === undefined) continue
    try {
      execFileSync(bin, args, { env, stdio: 'pipe' })
    } catch (e) {
      if (optional === true) continue
      const output = failureOutput(e)
      if (bin === 'gh' && /already exists/i.test(output)) {
        refreshOpenPr(gitPlan.prUpdate, env)
        continue
      }
      const { message } = classifyWriteRefusal(output, { hasToken: true })
      warn(`${message} (while running: ${bin} ${args[0]})`)
      return false
    }
  }
  return true
}

/** Leave the checkout exactly as the job's later steps expect to find it. */
function restoreWorkspace(restore: string[]): void {
  const [bin, ...args] = restore
  try {
    execFileSync(bin as string, args, { stdio: 'pipe' })
  } catch {
    warn('could not restore the checkout after the ratchet attempt')
  }
}

/** Bad CLI args are a workflow-authoring bug, NOT a write refusal: fail loudly. */
function parseOrExit(): CliOptions {
  try {
    return parseCliArgs(process.argv.slice(2), process.env)
  } catch (e) {
    console.log(`::error::coverage-ratchet: ${(e as Error).message}`)
    process.exit(1)
  }
}

/** The run context comes entirely from the environment the CI step exposes. */
function resolveSkip(opts: CliOptions): SkipDecision {
  return shouldSkipCommitBack({
    commitBackFlag: readCommitBackFlag(readFileSync(opts.wowPath, 'utf-8')),
    eventName: process.env['GITHUB_EVENT_NAME'] || '',
    refName: process.env['GITHUB_REF_NAME'] || '',
    baseBranch: opts.baseBranch,
    headCommitMessage: process.env['PAIR_RATCHET_HEAD_COMMIT_MESSAGE'] || '',
  })
}

/**
 * The write path: credential, config write, command plan, restore. Every exit is
 * either a success line or a warning — never a non-zero exit (AC6).
 */
function commitBack(opts: CliOptions, gitPlan: RatchetGitPlan, raises: RatchetProposal[]): void {
  const token = process.env[TOKEN_ENV] || ''
  if (!token) {
    warn(classifyWriteRefusal('', { hasToken: false }).message)
    return
  }
  if (!writeRaises(opts.configPath, raises)) return
  try {
    if (runPlan(gitPlan, gitAuthEnv(token))) {
      const raised = raises.map(r => `${r.type}=${r.proposed}`).join(', ')
      console.log(`coverage-ratchet: raised ${raised} via the ratchet PR`)
    }
  } finally {
    restoreWorkspace(gitPlan.restore)
  }
}

function main(): void {
  const opts = parseOrExit()
  anchorToRepoRoot()

  const skip = resolveSkip(opts)
  if (skip.skip) {
    console.log(renderRatchetPlan({ skip, plan: [] }))
    return
  }

  const plan = planRatchet(readFileSync(opts.configPath, 'utf-8'), opts.measured, opts.marginPp)
  console.log(renderRatchetPlan({ plan }))
  const raises = plan.filter(p => p.action === 'raise')
  if (raises.length === 0) return

  const gitPlan = ratchetGitPlan({
    raises,
    configPath: opts.configPath,
    baseBranch: opts.baseBranch,
    remote: opts.remote,
    headCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim(),
  })
  if (opts.dryRun) {
    printDryRun(gitPlan)
    return
  }
  commitBack(opts, gitPlan, raises)
}

if (require.main === module) {
  main()
}
