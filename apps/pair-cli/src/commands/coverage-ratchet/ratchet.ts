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
 *     reported as a warning; the CLI exits 0. That holds for an UNEXPECTED failure
 *     too: `main` funnels everything except an argument-parsing bug (a
 *     workflow-authoring error) into the same warning + exit 0.
 *   - Monotonic ratchet — `applyRaises` re-checks every proposal against BOTH the
 *     text currently on disk (the base-branch checkout) and the config as
 *     committed on the open ratchet branch, so a higher value written by a
 *     concurrent run is never clobbered on either ref, and a value is never
 *     lowered.
 *
 * Per the gate-tooling ADL (2026-07-13) the logic lives HERE, white-box unit
 * tested, and the CI step is a thin entrypoint; the CLI wiring is verified
 * end-to-end by the `coverage-gate.sh` smoke scenario (`--dry-run`), never by a
 * unit test.
 *
 * WHY IT LIVES IN THE CLI (story #409, ADR-022): the module started in
 * `packages/knowledge-hub/src/tools/`, reachable only through a pnpm filter
 * inside this monorepo — so an adopter who set `Coverage baseline commit-back:
 * enabled` got a silent no-op. It is now the implementation behind the shipped
 * `pair-cli coverage-ratchet` command, which is what an adopter's generated
 * pipeline step invokes and what pair's own CI step invokes: ONE implementation,
 * two thin entrypoints, no ported copy to drift.
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

/**
 * The git config key `actions/checkout` persists the (read-only) `GITHUB_TOKEN`
 * into (its `persist-credentials` defaults to true). We need the SAME key for our
 * own credential, and `extraHeader` is MULTI-valued: naively adding ours would
 * make git send TWO `Authorization` headers and leave it to the server which one
 * wins. The likely loser is ours — a refusal that AC6 turns into a warning on
 * every base-branch push, i.e. a feature that never actually works and never says
 * so. See `gitAuthConfig` for how that is made unambiguous.
 */
export const EXTRAHEADER_CONFIG_KEY = 'http.https://github.com/.extraheader'

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

/** Declared state of a way-of-working quality flag. */
export type FlagState = 'enabled' | 'disabled' | 'absent'

/**
 * A way-of-working flag is a LIST BULLET (`- **<Label>**: \`enabled\``), possibly
 * nested. Anchoring to the bullet is not cosmetic: the KB documents these flags in
 * prose (`... sets \`Coverage baseline commit-back: enabled\` ...`), and an adopter
 * who quotes that sentence inside their own way-of-working must not thereby turn
 * the flag on. An unanchored, first-match-wins search would do exactly that.
 */
const flagPattern = (label: string): RegExp =>
  new RegExp(
    `^[ \\t]*[-*][ \\t]*\\**[ \\t]*${label}[ \\t]*\\**[ \\t]*:[ \\t]*\`?[ \\t]*(enabled|disabled)`,
    'im',
  )

const COMMIT_BACK_FLAG = flagPattern('coverage[ \\t]+baseline[ \\t]+commit-back')
const GUARDRAIL_FLAG = flagPattern('coverage[ \\t]+guardrail')

const readFlag = (text: string, pattern: RegExp): FlagState => {
  const m = pattern.exec(text)
  return m ? ((m[1] ?? '').toLowerCase() as FlagState) : 'absent'
}

/**
 * Read the opt-in from a way-of-working document. Absent => off: the framework
 * default ships `disabled`, so a project that never declares the flag behaves
 * exactly as before this story (AC1).
 */
export function readCommitBackFlag(wayOfWorkingText: string): FlagState {
  return readFlag(wayOfWorkingText, COMMIT_BACK_FLAG)
}

/**
 * Read the PARENT flag. The commit-back opt-in is nested under the coverage
 * guardrail, and the nesting is enforced, not merely documented: ratcheting a
 * baseline for a gate that never runs would raise a floor nothing checks.
 */
export function readGuardrailFlag(wayOfWorkingText: string): FlagState {
  return readFlag(wayOfWorkingText, GUARDRAIL_FLAG)
}

// ---------------------------------------------------------------------------
// Skip predicate (AC1 / AC4 / AC5)
// ---------------------------------------------------------------------------

export type SkipCode = 'flag-disabled' | 'guardrail-disabled' | 'not-base-push' | 'automated-commit'

export interface SkipDecision {
  skip: boolean
  /** Set only when `skip` is true. */
  code?: SkipCode
  /** Set only when `skip` is true. */
  reason?: string
}

export interface RunContext {
  commitBackFlag: FlagState
  /** The PARENT `Coverage guardrail` flag — the ratchet is nested under it. */
  guardrailFlag: FlagState
  /** `GITHUB_EVENT_NAME` — only `push` may write. */
  eventName: string
  /** `GITHUB_REF_NAME` — must equal `baseBranch`. */
  refName: string
  baseBranch: string
  /** Subject+body of the commit the run is for. */
  headCommitMessage: string
}

/**
 * The subject GitHub generates for a plain (non-squash) merge of the ratchet PR.
 * Matched as a whole SUBJECT LINE, not as a substring: a message that merely
 * mentions the branch name — a story commit, a revert, this very PR — is not the
 * ratchet's own commit, and treating it as one silently swallows a legitimate
 * raise.
 */
const RATCHET_MERGE_SUBJECT = new RegExp(
  `^Merge pull request #\\d+ from \\S+/${esc(RATCHET_BRANCH)}[ \\t\\r]*$`,
  'm',
)

/** True iff a commit message identifies itself as produced by the ratchet. */
function isRatchetCommitMessage(message: string): boolean {
  // The marker is the general case: it covers a direct commit and a squash merge
  // (whose subject defaults to the ratchet PR title, which carries the marker).
  // The generated merge subject covers a plain merge commit, which GitHub writes
  // without the PR title.
  return message.includes(RATCHET_MARKER) || RATCHET_MERGE_SUBJECT.test(message)
}

/**
 * Whether this run must NOT attempt a commit-back. Evaluated in order so the
 * opt-in short-circuits everything else:
 *
 *   1. `flag-disabled`     — the flag is not `enabled` (default; AC1).
 *   2. `guardrail-disabled`— the parent coverage guardrail is not `enabled`, so
 *                            there is no gate whose floor a raise would move.
 *   3. `not-base-push`     — not a `push` to the base branch, i.e. every
 *                            `pull_request` run, fork or not (AC5).
 *   4. `automated-commit`  — the head commit is the ratchet's own (AC4).
 */
export function shouldSkipCommitBack(ctx: RunContext): SkipDecision {
  if (ctx.commitBackFlag !== 'enabled') {
    return {
      skip: true,
      code: 'flag-disabled',
      reason: `Coverage baseline commit-back is '${ctx.commitBackFlag}' (default: off) — nothing is written`,
    }
  }
  if (ctx.guardrailFlag !== 'enabled') {
    return {
      skip: true,
      code: 'guardrail-disabled',
      reason: `the parent Coverage guardrail is '${ctx.guardrailFlag}' — the commit-back opt-in is nested under it, and a baseline is not ratcheted for a gate that does not run`,
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
  /** Proposals refused at write time because a visible value is already >=. */
  dropped: RatchetProposal[]
}

export interface ApplyOptions {
  /**
   * The config as committed on the OPEN ratchet branch, when there is one. A
   * concurrent run's raise is not on the base branch yet — it is a pending
   * proposal on that branch — so this is the other half of "never clobber a
   * higher value": without it, a run measuring less would force-push a LOWER
   * value onto the ratchet branch and the open ratchet PR would propose it.
   */
  pendingText?: string | null
}

/**
 * Apply raises to the config text by editing the `baseline.<type>=` VALUE in
 * place — the surrounding markdown, line count, ordering and line endings are
 * untouched.
 *
 * Every proposal is re-checked against `max(on disk, on the ratchet branch)`:
 * the caller re-reads the config from disk immediately before writing and reads
 * the ratchet branch's copy from the fetched remote-tracking ref, so a higher
 * value written by a concurrent run is never clobbered on either ref — such a
 * proposal is `dropped`, not written.
 */
export function applyRaises(
  configText: string,
  raises: RatchetProposal[],
  { pendingText }: ApplyOptions = {},
): ApplyResult {
  let text = configText
  let changedLines = 0
  const dropped: RatchetProposal[] = []

  for (const raise of raises) {
    if (raise.proposed === null) {
      dropped.push(raise)
      continue
    }
    const onDisk = readBaselineValue(text, raise.type)
    if (onDisk === null) {
      dropped.push(raise)
      continue
    }
    const pending = pendingText ? readBaselineValue(pendingText, raise.type) : null
    const floor = pending === null ? onDisk : Math.max(onDisk, pending)
    if (raise.proposed <= floor) {
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
  /**
   * Run BEFORE the config is written: it makes the ratchet branch's tip visible,
   * so its PENDING baseline can be read and the lease can mean something. Nothing
   * here touches a tracked file, and every step tolerates failure, so it is safe
   * to run and then decide not to write.
   */
  prepare: RatchetCommand[]
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
  restore: RatchetCommand[]
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

/** The remote-tracking refspec for the ratchet branch, passed transiently (`git -c`). */
export function ratchetTrackingRefspec(remote: string): string {
  return `+refs/heads/${RATCHET_BRANCH}:refs/remotes/${remote}/${RATCHET_BRANCH}`
}

/**
 * The git config the write credential is supplied through — as DATA, so the one
 * property the whole write path rests on is pinned by a unit test rather than by
 * luck.
 *
 * `EXTRAHEADER_CONFIG_KEY` is multi-valued and `actions/checkout` has already
 * persisted the read-only `GITHUB_TOKEN` under it in `.git/config`. Two values
 * means two `Authorization` headers and a server-side coin toss. git documents the
 * way out: for `http.extraHeader`, "an empty value will reset the extra headers to
 * the empty list". So slot 0 is EMPTY (dropping whatever the checkout persisted)
 * and slot 1 is ours — git therefore sends EXACTLY ONE credential, ours.
 *
 * Why two `GIT_CONFIG_*` slots and not `git -c`:
 *   - the order must be `<persisted>, <empty>, <ours>`, and it is fixed here by
 *     the slot indices. Probed on git 2.55: command-line `-c` is applied AFTER
 *     `GIT_CONFIG_*`, so an empty reset passed via `-c` would clear OUR value too.
 *   - the token stays out of `argv` (and so out of `ps`), unlike `-c <key>=<token>`.
 *   - nothing is written to `.git/config`: no mutation to undo, and the persisted
 *     credential still works for any later step of the same job.
 */
export function gitAuthConfig(token: string): Record<string, string> {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
  return {
    GIT_CONFIG_COUNT: '2',
    // Slot 0 — the reset. Discards the credential actions/checkout persisted.
    GIT_CONFIG_KEY_0: EXTRAHEADER_CONFIG_KEY,
    GIT_CONFIG_VALUE_0: '',
    // Slot 1 — ours, and after the reset, therefore the only one sent.
    GIT_CONFIG_KEY_1: EXTRAHEADER_CONFIG_KEY,
    GIT_CONFIG_VALUE_1: `AUTHORIZATION: basic ${basic}`,
    GH_TOKEN: token,
  }
}

/**
 * `git show` argv printing the config as committed on the fetched ratchet branch.
 * Failure (no such ref / no such path) means "no pending proposal", never an error.
 */
export function ratchetBranchConfigCommand(remote: string, configPath: string): string[] {
  return ['git', 'show', `refs/remotes/${remote}/${RATCHET_BRANCH}:${configPath}`]
}

/**
 * The exact command sequence that lands the raise. Deliberate properties, each
 * asserted by a unit test:
 *
 *   - `prepare` runs FIRST, before anything is written: it fetches the ratchet
 *     branch, which is what makes its pending baseline readable (the other half of
 *     the monotonicity guarantee) and the lease meaningful. It touches no tracked
 *     file and its every step tolerates failure, so running it and then deciding
 *     not to write is safe. The credential is disambiguated separately and without
 *     any command at all — see `gitAuthConfig`.
 *   - the ONLY push targets `RATCHET_BRANCH`, never the base branch, and no
 *     local branch is created or switched to: the commit is made on the checked-
 *     out HEAD and pushed by explicit refspec, then `restore` undoes it. Leaving
 *     the workspace on a bot branch would silently change what every later step
 *     in the job runs against. (On a `push` event the checkout does have the base
 *     branch checked out, so the LOCAL base ref advances by one commit and is
 *     rewound by `restore`; no REMOTE base ref is ever written.)
 *   - the push uses `--force-with-lease`, never a bare `--force`. The lease needs
 *     a remote-tracking ref for the destination, and a CI checkout has none for
 *     this branch (it fetches only the base ref, and the clone's fetch refspec
 *     maps nothing else) — without one git rejects EVERY non-fast-forward push as
 *     `stale info`, which would make the ratchet work exactly once and then warn
 *     forever. So the refspec is supplied TRANSIENTLY, with `git -c`, to both the
 *     fetch and the push: no `git config --add`, so the checkout's config is not
 *     mutated, repeat invocations cannot accumulate duplicate refspecs, and
 *     `restore` really does leave things as the later steps expect.
 *   - staging is an explicit path — never `git add -A`;
 *   - `restore` is narrow: `reset --mixed` + `checkout -- <configPath>` reverts the
 *     ratchet commit and the config edit ONLY. A `reset --hard` would also revert
 *     any other tracked file an earlier step of the same job legitimately modified.
 *   - the commit subject AND the PR title carry `RATCHET_MARKER`, so the loop
 *     guard survives both a squash and a merge commit.
 *
 * The force-push to the ratchet branch updates an already-open ratchet PR in
 * place, which is why create-or-update needs no branching beyond `prUpdate`
 * (title/body refresh).
 *
 * Note what does NOT depend on the lease: never clobbering a higher baseline is
 * guaranteed at the data level by `applyRaises` re-checking every proposal against
 * both the config on disk and the ratchet branch's own copy, not by the push.
 */
const EMPTY_GIT_PLAN: RatchetGitPlan = {
  prepare: [],
  commands: [],
  prUpdate: [],
  restore: [],
  commitMessage: '',
  prTitle: '',
  prBody: '',
}

/**
 * The write sequence itself, split out of `ratchetGitPlan` only to keep that
 * function under the 50-line lint ceiling — the two are one unit conceptually.
 */
function ratchetWriteCommands(args: {
  configPath: string
  commitMessage: string
  prTitle: string
  prBody: string
  baseBranch: string
  remote: string
  withRefspec: string[]
}): RatchetGitPlan['commands'] {
  const { configPath, commitMessage, prTitle, prBody, baseBranch, remote, withRefspec } = args
  return [
    { argv: ['git', 'config', 'user.name', BOT_NAME] },
    { argv: ['git', 'config', 'user.email', BOT_EMAIL] },
    // Commit on the checked-out HEAD — no branch is created or switched to.
    { argv: ['git', 'add', '--', configPath] },
    { argv: ['git', 'commit', '-m', commitMessage] },
    {
      argv: [
        'git',
        ...withRefspec,
        'push',
        '--force-with-lease',
        remote,
        `HEAD:refs/heads/${RATCHET_BRANCH}`,
      ],
    },
    {
      argv: [
        'gh',
        'pr',
        'create',
        '--base',
        baseBranch,
        '--head',
        RATCHET_BRANCH,
        '--title',
        prTitle,
        '--body',
        prBody,
      ],
    },
  ]
}

export function ratchetGitPlan(input: RatchetGitPlanInput): RatchetGitPlan {
  const { raises, configPath, baseBranch, remote, headCommit } = input
  if (raises.length === 0) return EMPTY_GIT_PLAN

  const summary = raises.map(r => `${r.type} ${r.current}->${r.proposed}`).join(', ')
  const commitMessage = `chore: ratchet coverage baseline (${summary}) ${RATCHET_MARKER}`
  const prTitle = `chore: ratchet coverage baseline ${RATCHET_MARKER}`
  const prBody = ratchetPrBody(raises, configPath, baseBranch)
  const trackingRefspec = ratchetTrackingRefspec(remote)
  // Transient (never persisted) fetch refspec, so `--force-with-lease` can resolve
  // a remote-tracking ref for the ratchet branch.
  const withRefspec = ['-c', `remote.${remote}.fetch=${trackingRefspec}`]

  return {
    prepare: [
      // Absent on the first ever run: the ratchet branch does not exist yet.
      {
        argv: ['git', ...withRefspec, 'fetch', '--no-tags', remote, trackingRefspec],
        optional: true,
      },
    ],
    commands: ratchetWriteCommands({
      configPath,
      commitMessage,
      prTitle,
      prBody,
      baseBranch,
      remote,
      withRefspec,
    }),
    prUpdate: ['gh', 'pr', 'edit', RATCHET_BRANCH, '--title', prTitle, '--body', prBody],
    // An explicit SHA, never `HEAD~1`: a relative reset would destroy the base
    // branch's own tip if the sequence failed before the commit was created.
    // `--mixed` (not `--hard`) + an explicit checkout of the one edited path: the
    // ratchet reverts what the ratchet did, nothing else in the workspace.
    restore: [
      { argv: ['git', 'reset', '--mixed', headCommit] },
      { argv: ['git', 'checkout', '--', configPath] },
    ],
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
// Run options + the IO layer (verified by the coverage-gate smoke scenario, not
// by a unit test — gate-tooling ADL 2026-07-13)
// ---------------------------------------------------------------------------

/**
 * Everything the run needs that is NOT read from the environment. Produced by
 * `parseCoverageRatchetCommand` (the command's parser applies every default and
 * rejects a malformed value) and consumed by `runRatchet` — so the decisions
 * above stay pure and this module owns no argv handling of its own.
 */
export interface RatchetRunOptions {
  configPath: string
  wowPath: string
  measured: MeasuredCoverage
  baseBranch: string
  remote: string
  marginPp: number
  dryRun: boolean
}

/** Defaults the command's parser applies; exported so the two cannot drift. */
export const RATCHET_DEFAULTS = {
  configPath: DEFAULT_CONFIG_PATH,
  wowPath: DEFAULT_WOW_PATH,
  remote: 'origin',
  baseBranch: 'main',
  marginPp: DEFAULT_MARGIN_PP,
} as const

/** Env var naming the base branch when the invocation does not (CI convenience). */
export const BASE_BRANCH_ENV = 'PAIR_RATCHET_BASE_BRANCH'

/** The process env carrying the write credential (see `gitAuthConfig` for the shape). */
function gitAuthEnv(token: string): NodeJS.ProcessEnv {
  return { ...process.env, ...gitAuthConfig(token) }
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
  for (const { argv, optional } of [...gitPlan.prepare, ...gitPlan.commands]) {
    console.log(`  ${argv.join(' ')}${optional === true ? '   # failure tolerated' : ''}`)
  }
  for (const { argv } of gitPlan.restore) {
    console.log(`  ${argv.join(' ')}   # always, restores the workspace`)
  }
}

/** Run the `prepare` steps. Every one is optional, so this can only warn. */
function runPrepare(gitPlan: RatchetGitPlan, env: NodeJS.ProcessEnv): void {
  for (const { argv } of gitPlan.prepare) {
    const [bin, ...args] = argv
    if (bin === undefined) continue
    try {
      execFileSync(bin, args, { env, stdio: 'pipe' })
    } catch {
      // Expected on the first ever run: the ratchet branch does not exist yet.
    }
  }
}

/**
 * The config as committed on the OPEN ratchet branch, or null when there is no
 * such branch/file. A failure here is a legitimate state ("no pending proposal"),
 * never an error: the fetch in `prepare` is itself optional.
 */
function readPendingConfig(
  remote: string,
  configPath: string,
  env: NodeJS.ProcessEnv,
): string | null {
  const [bin, ...args] = ratchetBranchConfigCommand(remote, configPath)
  try {
    return execFileSync(bin as string, args, { encoding: 'utf-8', env, stdio: 'pipe' })
  } catch {
    return null
  }
}

/**
 * Apply the raises to the config on disk. Returns false (having warned) when
 * there is nothing left to write because a concurrent run already won the race —
 * on the base branch OR on the ratchet branch (`pendingText`).
 */
function writeRaises(
  configPath: string,
  raises: RatchetProposal[],
  pendingText: string | null,
): boolean {
  // Re-read immediately before writing so a concurrent, higher value wins.
  const applied = applyRaises(readFileSync(configPath, 'utf-8'), raises, { pendingText })
  if (applied.changedLines === 0) {
    const types = applied.dropped.map(d => d.type).join(', ')
    warn(
      `nothing written — the config already holds a value at or above every proposal (${types}), on the base branch or on the open ratchet branch; a concurrent run won the race`,
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
function restoreWorkspace(restore: RatchetCommand[]): void {
  for (const { argv } of restore) {
    const [bin, ...args] = argv
    if (bin === undefined) continue
    try {
      execFileSync(bin, args, { stdio: 'pipe' })
    } catch {
      warn(`could not restore the checkout after the ratchet attempt (${argv.join(' ')})`)
    }
  }
}

/** The run context comes entirely from the environment the CI step exposes. */
function resolveSkip(opts: RatchetRunOptions): SkipDecision {
  const wow = readFileSync(opts.wowPath, 'utf-8')
  return shouldSkipCommitBack({
    commitBackFlag: readCommitBackFlag(wow),
    guardrailFlag: readGuardrailFlag(wow),
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
function commitBack(
  opts: RatchetRunOptions,
  gitPlan: RatchetGitPlan,
  raises: RatchetProposal[],
): void {
  const token = process.env[TOKEN_ENV] || ''
  if (!token) {
    warn(classifyWriteRefusal('', { hasToken: false }).message)
    return
  }
  const env = gitAuthEnv(token)
  // Before writing: make the ratchet branch visible, then read the baseline it
  // already proposes. A concurrent run's raise lives THERE, not on the base
  // branch, so without this a run measuring less would force-push a LOWER value
  // and the open ratchet PR would end up proposing it.
  runPrepare(gitPlan, env)
  const pendingText = readPendingConfig(opts.remote, opts.configPath, env)
  if (!writeRaises(opts.configPath, raises, pendingText)) return
  try {
    if (runPlan(gitPlan, env)) {
      const raised = raises.map(r => `${r.type}=${r.proposed}`).join(', ')
      console.log(`coverage-ratchet: raised ${raised} via the ratchet PR`)
    }
  } finally {
    restoreWorkspace(gitPlan.restore)
  }
}

function run(opts: RatchetRunOptions): void {
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

/**
 * Run the commit-back. Argument parsing has already failed LOUDLY if it was going
 * to (the command's parser throws and the CLI exits non-zero — a malformed
 * invocation is a workflow-authoring bug its author must see); everything from
 * here on degrades to a warning and a SUCCESSFUL return.
 *
 * That asymmetry is the business rule "the gate's verdict and the persistence are
 * independent" (#372/AC6) taken literally. An unreadable `--config`/
 * `--way-of-working` (an adopter who relocated the adoption folder), a failing
 * `git rev-parse`, a `writeFileSync` EACCES — none of them may turn a PASSING
 * coverage gate into a red build. The shell guardrail this step sits next to
 * already tolerates a missing config by design; the commit-back must not be less
 * fail-safe than the gate it augments.
 */
export function runRatchet(opts: RatchetRunOptions): void {
  try {
    run(opts)
  } catch (e) {
    warn(
      `commit-back could not run: ${(e as Error).message} — the coverage gate's verdict is unaffected`,
    )
  }
}
