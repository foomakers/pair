/**
 * format-workflow-composition — keeps CI's formatting check real (story #413).
 *
 * Since #394 the pre-push hook CHECKS formatting instead of applying it, which is
 * the right shape for a hook — but it left the local hook as the ONLY enforcement
 * point. `--no-verify`, or a contributor whose hooks are not installed, lands
 * unformatted code with every CI check green. `.github/workflows/format.yml` is
 * the fix; this module is what stops that fix from quietly decaying.
 *
 * THE FILE IS PARSED, NOT READ LINE BY LINE (ADL 2026-09-01
 * `workflow-guard-rejects-what-it-cannot-read`, amended 2026-09-03). `yaml@2.8.2` — this
 * repo's adopted parser — resolves the workflow to the same document GitHub runs, once,
 * at the top of `checkFormatWorkflow`. Every rule below reads NODES. The hand-rolled
 * line reader this module used between rounds 5 and 14 (`blockUnder`, `listValueOf`,
 * `scalarAt`, `keysAt`, `stepsOf`, `withoutBlockScalars`) is retired, and with it the
 * four rule families that existed only to reject the spellings it could not follow:
 * flow mappings, JSON-spelled steps, anchors/aliases, indentless sequences, CRLF and
 * quoted scalars are now READ, and their resolved values are subject to every rule
 * here. The reader failed OPEN on those spellings (round 5: `pull_request: { branches:
 * [main], paths-ignore: ['**\/*.md'] }` left every trigger rule passing vacuously) and
 * then failed CLOSED on five correct ones (rounds 12–14); a parser does neither.
 *
 * Two properties the parse gives for free and the rules rely on:
 *
 * - **fail-closed on an unreadable file**: a parse error is itself a reported problem,
 *   and so is a duplicate key (`yaml@2.8.2` rejects both) — the direction the rejection
 *   list used to hold.
 * - **`run:` bodies stay shell, never YAML**. The parser hands each `run:` scalar over
 *   as a string; shell comments inside it are stripped quote-aware (`stripLineComment`),
 *   because `#` inside quotes is not a comment to bash and cutting there once removed an
 *   executing `prettier --write .` from view.
 *
 * Every regression this guards against is a one-line edit that leaves the
 * workflow LOOKING like enforcement:
 *
 * - a `paths-ignore:` key. This is why the check is a dedicated workflow and not
 *   a job in `ci.yml`: that workflow carries `paths-ignore: ['.changeset/**']` at
 *   WORKFLOW level, which a job inherits — so a PR touching only `.changeset/**`
 *   would run no formatting check at all. Trigger coverage is part of check
 *   coverage.
 * - `paths:`, the same hole spelled positively — an allow-list excludes everything
 *   it does not name, so a markdown-only PR runs no check at all.
 * - a trigger narrowed off the base branch (`pull_request.branches: [release]`, or
 *   its negative spelling `branches-ignore: [main]`) or off the events that matter
 *   (`types: [closed]` runs the check only once the PR is closed). Whatever shapes
 *   the trigger shapes the coverage.
 * - `pull_request_target` instead of `pull_request`, which hands the base repo's
 *   credentials to a fork's head commit.
 * - a write-mode formatter, or a formatting auto-commit. The ADL 2026-07-31 ban
 *   ("the gate reports, the developer fixes deliberately") is repo-wide, not
 *   hook-specific — CI repairing the branch is the same defect one layer up. Held by
 *   the SHELL ALLOW-LISTS below, not by the formatter deny-list: every `run:` in this
 *   workflow is one of three things and each is allow-listed (the checking command as
 *   an equality, `SETUP_COMMAND_LINES` for the toolchain install, `REMEDY_COMMAND_LINES`
 *   for the failure-path message). `findWriteModeFormatters` still runs across all of
 *   them, as the repo-wide statement of the ban rather than as the surface that holds it.
 * - the same write, spelled `uses:` instead of `run:`. The write-mode scan reads
 *   `run:` blocks, so a formatting ACTION was invisible to it — and placed before the
 *   checking step it needs no permission at all, because it never pushes. Hence an
 *   allow-list of the three actions this job needs (`usesProblems`).
 * - a checking command that is not THE command. "Some run block references the
 *   script" was satisfied by `pnpm --filter=<pkg> format:check` and by `cd <dir> &&
 *   pnpm format:check`, each making CI check a strict subset of the tree the developer
 *   and the hook check — AC4's divergence, reinstated green. The command is an
 *   equality (`checkCommandProblems`).
 * - the job that RUNS the check renamed, or displaced by a decoy. The job's DISPLAY
 *   NAME — its id when `name:` is absent — is the status context GitHub publishes:
 *   `format` is what way-of-working requires and what AC8 tells branch protection to
 *   list, so `fmt:` deletes the context without touching a rule — and a `format:` job
 *   that only echoes, beside a `worker:` job carrying the real steps, reports SUCCESS
 *   in that context after an echo. Asserted on the HOST job, never on the set of job
 *   names (`jobIdentityProblems`). And the id is not the whole story: a `name:` line
 *   renames the published context as surely as the id does (this repo's version.yml,
 *   job id `version`, is published as `Create version commits and tags`), and a
 *   `strategy.matrix` suffixes its values (`format (20)`), so `name:` other than
 *   `format` and any `strategy:` on the host are rejected, and `name: format` on any
 *   OTHER job is the decoy spelled through the display name.
 * - a `push:` trigger filtered by `tags:` alone. `branches` and `tags` are independent
 *   filters and GitHub fires the event only for the ref kinds a filter names, so with no
 *   `branches:` the workflow never runs on a push to any branch — measured on this
 *   repo's release.yml, whose `push` runs are all tags. "No filter ⇒ every branch" was
 *   the wrong reading for it (`tagFilterProblems`).
 * - a `concurrency.group` that is not keyed on `github.ref`. Every claim below about
 *   the two triggers "never meeting" holds only because of that key; `group: format`
 *   puts every run in one group, so a PR push cancels an in-progress run on `main`
 *   (the cancel is conditioned on the PR event, which the PR push is) and that commit
 *   ends with no verdict (`groupProblems`).
 * - dropping `push: main`, so drift on the base branch is invisible.
 * - dropping `concurrency`, so a superseded run keeps burning a runner and
 *   reporting a stale verdict for a ref that has already moved on.
 * - `continue-on-error: true`, ANY `if:` on the job, ANY `needs:` on the job, ANY `if:`
 *   on the step that runs `format:check`, a step `if:` elsewhere that is not a SCOPED
 *   `failure()` guard, or
 *   a write-scoped `permissions:`. None of these touch a trigger or a step COMMAND,
 *   yet each turns the `format` context into one that cannot fail, never runs, or
 *   hands a write-scoped token to a job that executes PR-authored lifecycle scripts
 *   (`pnpm install`). AC5's "safe on fork PRs by construction, not by review" is only
 *   construction if the construction is asserted. `if:` is an ALLOW-list on purpose:
 *   a deny-list of literal falses (`if: false`) waves through every never-true
 *   EXPRESSION — `if: github.event_name == 'workflow_dispatch'` on the job, or
 *   `if: github.event_name == 'push'` on the checking step, both leave a SUCCESS
 *   `format` context on unformatted code. And `failure()` is not the allow-list
 *   either: on the CHECKING step it is false on a normal PR, so the check is skipped
 *   and the job ends green wearing the remedy's own spelling — hence no condition at
 *   all there, and everywhere else `failure()` AND the check step's own outcome.
 *   `needs:` sits in the same bullet because it is that neutralization with no
 *   condition written anywhere: a job whose dependency fails or is skipped never runs,
 *   is reported skipped, and a skipped job's required check reads SUCCESSFUL.
 * - dropping the failure-path remedy, or widening it. `--list-different` prints the
 *   offending file and suppresses prettier's own "run with --write to fix" line, so
 *   a red check without that step hands the contributor this story exists for —
 *   hooks not installed, pushed with `--no-verify` — a bare filename and no
 *   instruction (AC1). And an unscoped `if: failure()` is JOB-scoped, so a failed
 *   `pnpm install` is annotated "not formatted, run `pnpm format`" — a confident
 *   wrong diagnosis over the real cause. EVERY failure-path step is therefore
 *   conditioned on the checking step's own `outcome`: one scoped step does not
 *   license a second, unscoped one beside it. And that scope must RESOLVE, not
 *   merely be spelled — `steps` is job-local and empty before the step has run, so a
 *   remedy in a SECOND JOB, or ABOVE the checking step in the same job, carries a
 *   condition false on every run: the remedy fires never and AC1's contributor reads
 *   the bare filename anyway. Nor is naming the context enough: the condition must
 *   COMPARE it to `'failure'`. `outcome` holds one of four values, so
 *   `steps.<id>.outcome == 'success'` still mentions the check and is false exactly
 *   when the check fails — the same never-firing remedy from a one-token edit. Nor is
 *   the comparison being PRESENT enough: it must DECIDE. `&&` binds tighter than
 *   `||`, so `failure() && <scope> || steps.install.outcome == 'failure'` keeps the
 *   scope spelled exactly right and puts the broken-install annotation back; and a
 *   CONJUNCT can narrow the remedy to zero — `&& github.event_name == 'push'` is false
 *   on every pull_request run (measured: check fails, remedy skipped). The condition
 *   is a conjunction of allow-listed terms (`failure()`, `!cancelled()`/`!success()`,
 *   the scope equality); `||`, a negated scope and any other conjunct are rejected.
 * - the checkout's `with:`. `uses:` was matched on the action NAME; `with: ref: main`
 *   makes actions/checkout check out `main` instead of the PR merge ref, so a PR
 *   carrying an unformatted file gets a SUCCESSFUL `format` context (measured on
 *   GitHub). `repository`, `path`, `sparse-checkout` are the same loss; the checkout's
 *   inputs are an allow-list of fetch mechanics (`checkoutInputProblems`).
 * - `working-directory:` on the checking step, or `defaults:` on a job or the
 *   workflow — `cd` spelled as a key, invisible to the command equality, so CI runs a
 *   package's own `format:check` (a subset) the moment one declares the script. The
 *   checking step carries only `name`, `id`, `run`, `timeout-minutes`
 *   (`checkStepKeyProblems`, `defaultsProblems`).
 * - `env:` or `container:` on the JOB — the same relocation one level up. Every key
 *   that decides WHAT or HOW the check runs is allow-listed on the checking STEP, and
 *   a job-level key reaches that step anyway, so the step-level rule was bypassable by
 *   relocation exactly as `working-directory:`/`defaults:` were. Measured end-to-end
 *   against the repo's own pinned prettier 3.6.2: `node bin/prettier.cjs
 *   --list-different bad.ts` prints `bad.ts` and exits 1, while
 *   `NODE_OPTIONS=--require=./shim.js node bin/prettier.cjs --list-different bad.ts`
 *   prints `bad.ts` and exits 0 (`shim.js` being one line: `process.on('exit', () => {
 *   process.exitCode = 0 })`). A job-level `env: NODE_OPTIONS:` reaches the checking
 *   step — measured on GitHub, probe run 33724282486 on PR #477, `D5-JOB-ENV=from-job-env`
 *   logged from a step that declares no `env:` of its own — so `pnpm format:check` still
 *   NAMES the offending file and the job goes GREEN. `container:` is the `uses:`
 *   third-party-code argument spelled as a job key (the image decides what `pnpm` and
 *   `prettier` even are), and `services:` with it. Hence the workflow's own keys and
 *   every job's keys are allow-lists (`workflowKeyProblems`, `jobKeyProblems`).
 * - `runs-on:` pointing off GitHub's runners. Those two rules allow-list which KEYS may
 *   appear; `runs-on` is on the job's list because the job needs a machine, and its VALUE
 *   picks which one — the same "what are `pnpm` and `prettier` here" question `container:`
 *   asks, and a machine also decides who watches the run. On a PUBLIC repo a
 *   `pull_request` run executes the PR's own version of this file, so the value is chosen
 *   by the pull request. `runs-on: self-hosted` (and `[self-hosted, linux]`) was `ok=true`
 *   with every other rule green, so the value is an allow-list too: GitHub-hosted Ubuntu
 *   labels, alone or as a one-label list (`RUNNER_LABELS`, `runsOnProblems`). On this repo
 *   today that regression reads as a BLOCKED merge rather than a green check — no
 *   self-hosted runner is registered (`total_count: 0`), so the job queues and `format`
 *   stays pending (measured, probe run 33729726089) — which lasts exactly as long as that
 *   stays true. ONE label, counted, not "every label allow-listed": GitHub ANDs a label
 *   list, so `[ubuntu-latest, ubuntu-22.04]` names no machine at all (measured, probe run
 *   33782665948) and its job queues forever — the same blocked-merge loss as `self-hosted`,
 *   reached by a value every element of which is on the allow-list.
 * - `cancel-in-progress` and `concurrency.group` read as SUBSTRINGS. `!(github.event_name
 *   == 'pull_request')` contains the accepted equality and inverts it; `format-${{
 *   github.run_id }}-${{ github.ref }}` contains the ref key and is unique per run.
 *   Both values are anchored allow-lists over the WHOLE value now.
 * - the shell of a step that is neither the check nor its remedy. `run:` was the last
 *   deny-list surface in this module, and the `with: ref: main` loss has a shell
 *   spelling no formatter list names: `run: git fetch origin main && git checkout
 *   origin/main -- .` before the check, or `pnpm install && find . -name '*.ts'
 *   -delete` — each `ok=true` on the shipped file, each running `pnpm format:check` on a
 *   tree that is not the PR's (AC2). The toolchain install is the whole allow-list: `pnpm
 *   install` with flags, and the corepack fallback line by line (`setupCommandProblems`).
 * - the shell of the REMEDY. It is the last surface a deny-list guarded, and the same
 *   argument retires it: `npx dprint fmt` (a formatter no offender list names) and
 *   `git commit -am style && git push` beside the required `pnpm format` message were
 *   `ok=true`. The remedy says something; it does not do anything. Its shell is an
 *   allow-list of quoted `echo`/`printf` lines (`REMEDY_COMMAND_LINES`) — which is all
 *   it has ever contained.
 * - `prettier -w`, the documented short form of `--write`, missing from the one offender
 *   list the AC6 ban reuses (`WRITE_MODE_FORMATTERS`, next door): `pnpm install && npx
 *   prettier -w .` was green while `--write` was red.
 *
 * Structure is asserted, never exact file text: comments, step names, action
 * versions and YAML spelling must be editable without false-failing this guard.
 *
 * WRITE-MODE DETECTION IS NOT RE-IMPLEMENTED. `findWriteModeFormatters` and the
 * transitive `expandScriptReferences` come from the pre-push guard next door — the
 * workflow says `pnpm format:check`, so scanning its literal text would miss the
 * likeliest regression (`pnpm format`, which only resolves to `prettier:fix`
 * through the root scripts). Two copies of that offender list would drift, and the
 * one that drifts is always the one guarding the newer surface.
 *
 * Per the gate-tooling ADL (2026-07-13) the logic lives here as a tested module, with a
 * thin `main()` CLI behind a `require.main` guard (`format-workflow:check`, run by the
 * root `gate:composition` — AC6). Turbo's cache is handled by the `$TURBO_ROOT$` input
 * entry on `@pair/dev-tools#test` (turbo.json) — the same treatment
 * `@pair/knowledge-hub#test` already uses for repo-wide artifacts — so `pnpm test` is the
 * other enforcement point and is never a stale PASS.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { parseDocument } from 'yaml'

import {
  expandScriptReferences,
  findWriteModeFormatters,
  referencesScript,
  REMEDY_SCRIPT,
  ROOT_PACKAGE_JSON,
  type GateCheckResult,
} from './pre-push-gate-composition'
import { REPO_ROOT } from './repo-root'

/** The workflow this guard reads — the real file, never a fixture copy. */
export const FORMAT_WORKFLOW = resolve(REPO_ROOT, '.github/workflows/format.yml')

/** The one command CI must run. Same script a developer runs — that is the point. */
export const FORMAT_CHECK_SCRIPT = 'format:check'

/** The branch whose formatting drift must be visible post-merge, not only on PRs. */
export const BASE_BRANCH = 'main'

/**
 * The job id — and, with no `name:` on the job, its display name, which is what GitHub
 * publishes as the status context. way-of-working documents `format` as the required
 * check and AC8 names it as the context branch protection must list, so renaming the
 * job, giving it a `name:`, or giving it a matrix deletes that context without touching
 * a rule.
 */
export const FORMAT_JOB = 'format'

/**
 * The complete set of actions this workflow may use. An ALLOW-list, like `if:`, and
 * for the same reason: the write-mode scan reads `run:` blocks, so a step that writes
 * through an ACTION is invisible to it, and a deny-list of formatting actions waves
 * through the next one published.
 */
export const ALLOWED_USES = ['actions/checkout', 'pnpm/action-setup', 'actions/setup-node'] as const

/**
 * The `with:` inputs `actions/checkout` may carry — fetch mechanics only, i.e. inputs
 * that leave the checked-out tree as the event's ref. An ALLOW-list for the same reason
 * `uses:` is one: the action's `ref` input "defaults to the reference or SHA for that
 * event" (action.yml) and setting it REPLACES the PR merge ref, so a `with:` the guard
 * never read decided WHAT `pnpm format:check` ran on. Measured on GitHub (probe run on
 * PR #477): `with: ref: main` on the shipped checkout, a PR carrying an unformatted file
 * → `Check formatting: success`, `format` context SUCCESS — AC2 defeated by one line.
 * `repository` and `path` change which tree the command runs on at all; `sparse-checkout`
 * / `sparse-checkout-cone-mode` check out a SUBSET (AC4's `--filter=` divergence spelled
 * as an input). The toolchain actions' inputs choose versions, never the tree, and are
 * not constrained.
 */
export const ALLOWED_CHECKOUT_INPUTS = [
  'fetch-depth',
  'fetch-tags',
  'show-progress',
  'persist-credentials',
  'clean',
  'set-safe-directory',
] as const

/**
 * The `pull_request` activity types the check must keep covering. GitHub's default
 * is `[opened, synchronize, reopened]`; a narrowing that keeps `reopened` but drops
 * either of these two runs the check where it cannot influence a review.
 */
export const REQUIRED_PR_TYPES = ['opened', 'synchronize'] as const

/**
 * The keys the WORKFLOW may declare. `env:` is the reason this is an allow-list: it is
 * inherited by every job and every step, so it reaches the checking step no matter what
 * the step-level allow-list says (see `jobKeyProblems`). `defaults:` has its own rule,
 * which names the loss precisely, so it is not reported twice here.
 */
export const WORKFLOW_KEYS = ['name', 'on', 'concurrency', 'permissions', 'jobs'] as const
const WORKFLOW_KEYS_OWNED_ELSEWHERE = ['defaults'] as const

/**
 * The keys a JOB may declare. Same allow-list discipline as `CHECK_STEP_KEYS`, one level
 * up: `env:` on the job reaches the checking step (measured on GitHub, probe run
 * 33724282486 — a step declaring no `env:` printed the job-level value), and
 * `NODE_OPTIONS=--require=<shim>` makes the repo's own prettier 3.6.2 print the offending
 * filename and exit 0 (measured against `prettier/bin/prettier.cjs`), i.e. `format` GREEN
 * on unformatted code. `container:`/`services:` decide what `pnpm` and `prettier` even
 * ARE — third-party code chosen by a job key, which is the `uses:` argument one level up.
 * `if`, `needs`, `strategy`, `defaults` and `continue-on-error` have their own rules and
 * are not reported twice here.
 *
 * This is an allow-list of KEYS. `runs-on` is on it because the job needs a machine, and
 * its VALUE picks which — the same question `container:` asks — so that value has an
 * allow-list of its own (`runsOnProblems`).
 */
export const JOB_KEYS = ['name', 'runs-on', 'permissions', 'timeout-minutes', 'steps'] as const
const JOB_KEYS_OWNED_ELSEWHERE = [
  'if',
  'needs',
  'strategy',
  'defaults',
  'continue-on-error',
] as const

/**
 * The machines this workflow may run on: GitHub-hosted Ubuntu images, ephemeral and
 * owned by GitHub. Every other label — `self-hosted`, a runner `group:`, another
 * GitHub-hosted OS (`macos-*`, `windows-*`), a larger or arm runner — is a deliberate
 * edit to this list, because each changes what `pnpm` and `prettier` are on the machine
 * that publishes the `format` context. Measured on GitHub (probe run 33729726089, PR
 * #477): `ubuntu-24.04`, `ubuntu-22.04`, a quoted `'ubuntu-latest'` and the one-element
 * list `[ubuntu-latest]` all ran on a GitHub-hosted x86_64 runner
 * (`RUNNER_ENVIRONMENT=github-hosted`), so the list spelling is the same value, not a
 * weaker one.
 */
export const RUNNER_LABELS = ['ubuntu-latest', 'ubuntu-24.04', 'ubuntu-22.04'] as const

/**
 * Removes `#` comments from a `run:` body so a comment can neither smuggle a banned
 * pattern in nor trip the guard by merely mentioning one — but only a `#` that is
 * OUTSIDE quotes.
 *
 * YAML's own comments never reach here: the parser drops them. This is the SHELL's
 * comment rule, applied to shell text. The unconditional cut this replaces ran the wrong
 * way: `#` inside quotes is not a comment to bash, so `echo "note # here"; prettier
 * --write .` EXECUTES in full while the guard saw only `echo "note` — the write-mode
 * formatter stripped out of view, the AC6 ban silently gone, and `pnpm format:check`
 * passing on a tree CI had already rewritten.
 *
 * Bias is deliberate on the one ambiguity left: an UNBALANCED quote earlier in the
 * line leaves a later `#` unstripped, so the guard scans more text than the shell
 * runs. Scanning too much can only add a problem, never hide one.
 */
function stripLineComment(line: string): string {
  let quote: string | null = null
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (quote !== null) {
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '#' && (index === 0 || /\s/.test(line[index - 1] ?? '')))
      return line.slice(0, index)
  }
  return line
}

/** A `run:` body as the shell sees it: comments gone, blank edges trimmed. */
function shellOf(run: string): string {
  return run.split('\n').map(stripLineComment).join('\n').trim()
}

type Mapping = Record<string, unknown>

function isMapping(value: unknown): value is Mapping {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The values of a list-valued key. `null` means the key is ABSENT — for a trigger filter
 * that means "no filter", which GitHub reads as "every value", so callers treat `null` as
 * covering everything. A key present with an empty or null value is `[]`, which covers
 * nothing: the two are not the same and the parser is what finally tells them apart.
 */
function filterOf(block: Mapping, key: string): string[] | null {
  if (!(key in block)) return null
  const value = block[key]
  if (value === null || value === undefined) return []
  return Array.isArray(value) ? value.map(item => String(item)) : [String(value)]
}

/** A scalar key's value as text, or `undefined` when the key is absent. */
function textAt(block: Mapping, key: string): string | undefined {
  if (!(key in block)) return undefined
  const value = block[key]
  return value === null || value === undefined ? '' : String(value)
}

/** Every key and string scalar in the document, so a textual scan reads the whole file. */
function everyText(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(everyText)
  if (isMapping(node))
    return Object.entries(node).flatMap(([key, value]) => [key, ...everyText(value)])
  return []
}

/** Every `run:` scalar in the document, as shell text. */
function collectRuns(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(collectRuns)
  if (!isMapping(node)) return []
  const own = typeof node['run'] === 'string' ? [shellOf(node['run'])] : []
  return [
    ...own,
    ...Object.entries(node).flatMap(([key, value]) => (key === 'run' ? [] : collectRuns(value))),
  ]
}

/**
 * Every shell command the workflow executes: inline `run: cmd` and block scalars
 * (`run: |`) alike, in document order. What a step DOES lives here — the security and
 * check-only rules are asserted against these, not against the whole file, so an
 * expression in `concurrency.group` is not confused with one expanded into a shell.
 */
export function extractRunBlocks(yamlText: string): string[] {
  const document = parseDocument(yamlText)
  if (document.errors.length > 0) return []
  try {
    return collectRuns(document.toJS() as unknown)
  } catch {
    return []
  }
}

/** The `run:` of a single parsed step, as shell text — `[]` when the step runs nothing. */
function runsOf(step: Mapping): string[] {
  return typeof step['run'] === 'string' ? [shellOf(step['run'])] : []
}

/** The root scripts a `pnpm <script>` step delegates through. */
export function readRootScripts(): Record<string, string> {
  const pkg = JSON.parse(readFileSync(ROOT_PACKAGE_JSON, 'utf-8')) as {
    scripts?: Record<string, string>
  }
  return pkg.scripts ?? {}
}

/**
 * A trigger block that does not cover the base branch reports on nothing that merges.
 *
 * Both spellings, the way `paths`/`paths-ignore` are handled together: a missing
 * filter means "every branch", so `branches-ignore` is invisible to a `branches:` read
 * and a one-line `branches-ignore: [main]` under `pull_request` would leave every PR
 * targeting the base branch unchecked with this guard green. The key is rejected
 * outright rather than pattern-matched against `main` — `branches-ignore` is a glob
 * list (`ma*`, `m[a]in`), and a filter that MIGHT exclude the one branch that must
 * never be excluded buys nothing here.
 */
function baseBranchProblems(event: string, block: Mapping): string[] {
  const ignored = filterOf(block, 'branches-ignore')
  if (ignored !== null) {
    return [
      `the \`${event}\` trigger filters with \`branches-ignore: [${ignored.join(', ')}]\`: that is the\n` +
        `  negative spelling of the same hole — one entry matching \`${BASE_BRANCH}\` and no change landing\n` +
        `  on the base branch is ever checked, while the \`format\` context simply never reports. Use\n` +
        `  \`branches:\` and name \`${BASE_BRANCH}\`.`,
    ]
  }
  const branches = filterOf(block, 'branches')
  if (branches === null) return tagFilterProblems(event, block)
  if (branches.includes(BASE_BRANCH)) return []
  return [
    `the \`${event}\` trigger does not cover \`${BASE_BRANCH}\` (${branches.join(', ') || 'no branch'}),\n` +
      `  so a change landing on the base branch is never checked through \`${event}\`.`,
  ]
}

/**
 * A trigger filtered by TAGS with no branch filter beside it. `branches` and `tags` are
 * two independent filters on one event, and the producer's rule (GitHub docs, "events
 * that trigger workflows" § push) is: "If you define only tags/tags-ignore or only
 * branches/branches-ignore, the workflow won't run for events affecting the undefined
 * Git ref." Measured on this repo: release.yml declares `push: tags: ['v*']` and every
 * one of its `push` runs is a tag — none is `main`. So a missing `branches:` read as "no
 * filter, every branch" is exactly wrong here: the workflow never runs on any push to
 * `${BASE_BRANCH}`, post-merge drift is invisible (AC7), and the guard reported it
 * well-formed. Rejected fail-closed, in the same shape as `branches-ignore`; a tag filter
 * BESIDE a `branches:` that names the base branch stays green, because with both defined
 * the event fires for either ref kind.
 */
function tagFilterProblems(event: string, block: Mapping): string[] {
  return ['tags', 'tags-ignore'].flatMap(key => {
    const tags = filterOf(block, key)
    if (tags === null) return []
    return [
      `the \`${event}\` trigger filters with \`${key}: [${tags.join(', ')}]\` and no \`branches:\`: GitHub\n` +
        '  then fires the event for TAG refs only, so this workflow never runs on a push to any branch —\n' +
        `  drift on \`${BASE_BRANCH}\` is invisible after a merge while the \`format\` context simply never\n` +
        `  reports. Add \`branches:\` naming \`${BASE_BRANCH}\` (a tag filter beside it is fine), or drop the\n` +
        '  tag filter.',
    ]
  })
}

/**
 * A `types:` narrowing on `pull_request`. `types: [closed]` is a one-line edit that
 * leaves a green `format` context on every PR — the run simply happens after the
 * PR is closed, where nobody is reading it.
 */
function activityTypeProblems(pullRequest: Mapping): string[] {
  const types = filterOf(pullRequest, 'types')
  if (types === null) return []
  const missing = REQUIRED_PR_TYPES.filter(type => !types.includes(type))
  if (missing.length === 0) return []
  return [
    `the \`pull_request\` trigger narrows \`types:\` to [${types.join(', ')}], dropping ${missing.join(', ')}:\n` +
      '  the check would not run while the PR is open and reviewable.',
  ]
}

/**
 * The events the workflow reacts to, as a mapping from event name to its filter block.
 *
 * GitHub's three spellings all resolve here: `on: push`, `on: [pull_request, push]` and
 * the block mapping. The list and scalar forms carry NO filter, which is a SUPERSET of
 * what this guard requires (every branch, every default activity type), so they are read
 * as such rather than rejected — the line reader used to reject them because it could
 * only walk the mapping, which is not a property of the workflow.
 */
function eventsOf(on: unknown): Mapping | null {
  if (on === undefined || on === null) return null
  if (typeof on === 'string') return { [on]: null }
  if (Array.isArray(on)) return Object.fromEntries(on.map(event => [String(event), null]))
  if (isMapping(on)) return on
  return null
}

/** A trigger's filter block — `{}` for an event spelled with no filters at all. */
function filtersOf(events: Mapping, event: string): Mapping {
  const value = events[event]
  return isMapping(value) ? value : {}
}

/**
 * Trigger-shaped holes: the events the workflow reacts to, the branches and
 * activity types it filters them down to, and the paths it silently excludes. This
 * is the story's whole point — a check whose TRIGGER has a gap reads as enforcement
 * and is not, and EVERY key that shapes the trigger is part of that gap, not just
 * the one this story happened to start from.
 */
function triggerProblems(root: Mapping): string[] {
  const events = eventsOf(root['on'])
  if (events === null) return ['has no `on:` block, so it never runs.']

  const problems: string[] = []
  if ('pull_request_target' in events) {
    problems.push(
      'uses `pull_request_target`: that event runs with the BASE repository token against a fork\n' +
        '  head. Use `pull_request` — this job needs no credential at all.',
    )
  }

  // `paths-ignore` and `paths` are the deny-list and allow-list spelling of one
  // hole: an allow-list excludes everything it does not name, so `paths: ['**/*.ts']`
  // leaves a markdown-only or `.changeset`-only PR with no formatting check at all.
  for (const event of Object.keys(events)) {
    const filters = filtersOf(events, event)
    for (const key of ['paths-ignore', 'paths']) {
      if (!(key in filters)) continue
      problems.push(
        `declares \`${key}\`: trigger coverage IS check coverage. A path the trigger skips —\n` +
          '  whether skipped by exclusion (`paths-ignore`) or by omission from an allow-list (`paths`) —\n' +
          '  is a path the formatting check does not exist for. This is why the check is a dedicated\n' +
          "  workflow and not a job inside ci.yml, whose workflow-level `paths-ignore: ['.changeset/**']`\n" +
          '  a job would inherit. `pnpm format:check` costs one cold install; scoping it saves nothing\n' +
          '  worth a hole.',
      )
    }
  }

  if (!('pull_request' in events)) {
    problems.push(
      'has no `pull_request` trigger: the check would not run where a change is reviewed.',
    )
  } else {
    const pullRequest = filtersOf(events, 'pull_request')
    problems.push(
      ...baseBranchProblems('pull_request', pullRequest),
      ...activityTypeProblems(pullRequest),
    )
  }

  if (!('push' in events)) {
    return [
      ...problems,
      `has no \`push\` trigger: formatting drift on \`${BASE_BRANCH}\` would be invisible after a merge.`,
    ]
  }
  return [...problems, ...baseBranchProblems('push', filtersOf(events, 'push'))]
}

/**
 * The one accepted expression spelling — cancel WHEN the event is a pull request —
 * anchored to the WHOLE value, either operand order, either quote style. The previous
 * regex was an unanchored substring over the value, i.e. the very test the rule's own
 * comment says is not enough: `${{ !(github.event_name == 'pull_request') }}`,
 * `${{ … == 'pull_request' && false }}` and `${{ … == 'pull_request' || true }}` all
 * CONTAIN the equality and all passed. Measured on GitHub (probe run on PR #477,
 * evaluated on a pull_request event): the first two are `false` — nothing cancelled on
 * a PR — and the third is `true` — cancelled on `main` too, so two merges a minute apart
 * leave the first with no verdict (AC7).
 */
const CANCEL_ON_PULL_REQUEST =
  /^\$\{\{\s*(?:github\.event_name\s*==\s*(['"])pull_request\1|(['"])pull_request\2\s*==\s*github\.event_name)\s*\}\}$/

/**
 * The group is `<prefix>-<ref key>` and nothing more, anchored. The prefix is a constant
 * (`format`) or `${{ github.workflow }}` — a group with NO prefix shares its namespace
 * with any other workflow keyed on the bare ref, one token from a cross-workflow cancel.
 * The ref key is `${{ github.ref }}` or the documented `${{ github.head_ref ||
 * github.ref }}` fallback; `ref_name`, `head_ref` alone and `sha` are different contexts.
 * And nothing ELSE in the value: the previous substring test accepted `format-${{
 * github.run_id }}-${{ github.ref }}` (and `sha`, `run_number`, `run_attempt` beside the
 * ref), each unique per run — so no two runs ever share a group and nothing is ever
 * superseded, the "concurrency dropped" loss with the block still present (round 11).
 */
const GROUP_KEYED_ON_REF =
  /^(?:[A-Za-z0-9_.-]+|\$\{\{\s*github\.workflow\s*\}\})-\$\{\{\s*(?:github\.ref|github\.head_ref\s*\|\|\s*github\.ref)\s*\}\}$/

/**
 * The `group:` half of the concurrency rule. Everything the doc-comment on
 * `concurrencyProblems` says — "the two triggers never meet" — is true ONLY because the
 * group is keyed on `github.ref`, and nothing read `group:`. `group: format` (or
 * `${{ github.workflow }}`) puts every run in ONE group: a `push` run on `refs/heads/main`
 * in progress, then any PR push joins that group with `cancel-in-progress` true (the
 * event is `pull_request`) and cancels main's run — that commit ends with no formatting
 * verdict, the AC7 loss the conditional cancel exists to prevent — and two PRs pushed a
 * minute apart cancel each other's verdict. Same-group cancellation is measured on the
 * shipped workflow (runs 33527856271 and 33528146034, cancelled by a later push to the
 * same PR ref), so the only question is what the group is keyed on.
 */
function groupProblems(concurrency: Mapping): string[] {
  const group = textAt(concurrency, 'group')
  if (group === undefined) {
    return [
      'the `concurrency` block declares no `group:`, so nothing says which runs supersede which —\n' +
        '  key it on the ref: `group: format-${{ github.ref }}`.',
    ]
  }
  if (GROUP_KEYED_ON_REF.test(group)) return []
  return [
    `the \`concurrency\` block sets \`group: ${group}\`, which is not keyed on \`github.ref\`. Keyed on the\n` +
      '  ref, a PR run (`refs/pull/<n>/merge`) and a push to `' +
      BASE_BRANCH +
      '` (`refs/heads/main`) never share a\n' +
      '  group; a constant (or a key such as `github.workflow`) puts EVERY run in one group, so a PR\n' +
      '  push arriving while a `push` run on `' +
      BASE_BRANCH +
      '` is in progress cancels it (the cancel is\n' +
      '  conditioned on the PR event, which that push IS) and that commit ends with no formatting\n' +
      '  verdict — and two PRs pushed a minute apart cancel each other. The accepted shape is\n' +
      '  `<prefix>-${{ github.ref }}` (or `<prefix>-${{ github.head_ref || github.ref }}`), the prefix a\n' +
      '  constant such as `format` or `${{ github.workflow }}`, and nothing else in the value: no prefix\n' +
      '  collides with any other workflow keyed on the bare ref, and a per-run token beside the ref\n' +
      '  (`github.run_id`, `github.sha`, `github.run_number`, `github.run_attempt`) makes every group\n' +
      '  unique, so nothing is ever superseded.',
  ]
}

/**
 * Supersession, NOT de-duplication. The group is keyed on `github.ref`, and the two
 * triggers never share a ref — a `pull_request` run is `refs/pull/<n>/merge`, a push
 * to the base branch is `refs/heads/main` — so they land in different groups and are
 * never collapsed into one another (and after a merge the PR is closed, so
 * `pull_request` does not fire at all). What the group actually buys is cancelling a
 * run whose ref has already moved on: push three commits to a PR branch and only the
 * last one's verdict is worth a runner.
 *
 * Which is why the shipped value is CONDITIONAL: two merges to `${BASE_BRANCH}` a
 * minute apart share `format-refs/heads/main`, so an unconditional cancel drops the
 * first commit's run and that commit carries no formatting verdict of its OWN.
 *
 * A bare `true` is nonetheless ACCEPTED, deliberately — it is the weaker choice, not a
 * broken one, and this rule says so rather than reporting a preference as a defect. It
 * still supersedes, which is what AC7 asks of it; and `${BASE_BRANCH}` is linear, so the
 * surviving run's tree CONTAINS the cancelled commit's changes and drift on the base
 * branch is still caught, one commit later. What it costs is the per-commit verdict — a
 * hole in the `format` history, not a hole in the enforcement. So the accepted spellings
 * are an ALLOW-list of two: a literal `true` (cancel everywhere), or an EQUALITY on
 * the `pull_request` event (cancel on PRs, queue on the base branch — the shipped
 * choice, which keeps that per-commit verdict too). A substring test for `pull_request`
 * is not enough: `${{ github.event_name
 * != 'pull_request' }}` contains it and inverts it, producing BOTH failure modes at
 * once — nothing cancelled on a PR, and the first of two merges a minute apart
 * cancelled on `main`.
 */
function concurrencyProblems(root: Mapping): string[] {
  const declared = root['concurrency']
  if (declared === undefined || declared === null) {
    return [
      'declares no `concurrency` group: every superseded run keeps burning a runner and reporting a\n' +
        '  stale verdict for a ref that has already moved on.',
    ]
  }
  // `concurrency: <string>` is GitHub's shorthand for the group alone — read as such,
  // and then it declares no `cancel-in-progress`, which is the finding below.
  const concurrency: Mapping = isMapping(declared) ? declared : { group: String(declared) }
  const problems = groupProblems(concurrency)
  const value = textAt(concurrency, 'cancel-in-progress')
  if (value === undefined) {
    return [
      ...problems,
      'the `concurrency` group does not set `cancel-in-progress`, so a superseded run keeps burning\n' +
        '  a runner and reporting a stale verdict.',
    ]
  }
  if (value === 'true' || CANCEL_ON_PULL_REQUEST.test(value)) return problems
  return [
    ...problems,
    `the \`concurrency\` group sets \`cancel-in-progress: ${value}\`, which does not cancel a superseded\n` +
      '  run on a pull request: that run keeps burning a runner and reporting a stale verdict for a ref\n' +
      '  that has moved on. Accepted spellings are the literal `true`, or EXACTLY `${{\n' +
      "  github.event_name == 'pull_request' }}` (either operand order) as the whole value — nothing\n" +
      '  else, fail-closed: `!=`, `!( )`, `&& false` read as conditional and are the mitigation\n' +
      `  inverted (nothing cancelled on a PR). A bare \`true\` is accepted as the weaker of the two: it\n` +
      `  cancels on \`${BASE_BRANCH}\` too, so of two merges a minute apart only the second commit carries a\n` +
      '  verdict of its own — drift is still caught (the surviving run contains the earlier commit), the\n' +
      '  per-commit history is not. Anything that merely CONTAINS one of the two spellings (`|| true`,\n' +
      '  a negation) is a different value and is rejected.',
  ]
}

/** A `permissions:` value as scannable text — inline mapping, block mapping or `read-all`. */
function permissionScope(owner: Mapping): string | undefined {
  if (!('permissions' in owner)) return undefined
  const value = owner['permissions']
  if (value === null || value === undefined) return ''
  if (isMapping(value))
    return Object.entries(value)
      .map(([scope, level]) => `${scope}: ${String(level)}`)
      .join('\n')
  return String(value)
}

/**
 * The token the job is handed. This job runs `pnpm install`, i.e. lifecycle scripts
 * authored by the pull request, so a write scope in reach of that is the whole of
 * AC5's exposure — and a job with no `permissions:` at EITHER level silently inherits
 * whatever the repository default is (write, on a default-settings repo).
 *
 * Two levels, GitHub's rule (measured, probe run 33676806439 on PR #477): a workflow-level
 * `permissions:` is the scope of every job that declares none of its own — a job without
 * one was handed `Contents: read, Issues: read` from the workflow key — and a job's own
 * block REPLACES it entirely — the job beside it, with `contents: read` of its own, was
 * handed `Contents: read` and nothing else.
 */
function permissionProblems(name: string, body: Mapping, root: Mapping): string[] {
  const own = permissionScope(body)
  const inherited = permissionScope(root)
  if (own === undefined && inherited === undefined) {
    return [
      `job \`${name}\` declares no \`permissions:\`, and neither does the workflow level, so it silently\n` +
        '  inherits the repository default scope. It runs `pnpm install` — PR-authored lifecycle\n' +
        '  scripts — and needs nothing beyond `contents: read`.',
    ]
  }
  const scope = own ?? inherited ?? ''
  if (!/\bwrite(?:-all)?\b/.test(scope)) return []
  const where =
    own !== undefined
      ? `job \`${name}\` grants a WRITE scope in \`permissions:\`.`
      : `job \`${name}\` declares no \`permissions:\` of its own and inherits a WRITE scope from the\n` +
        '  workflow-level `permissions:`.'
  return [
    `${where} A fork PR must be a full-strength run\n` +
      '  with nothing in reach: this job checks formatting and writes nothing, so any write scope is\n' +
      '  pure exposure to the lifecycle scripts `pnpm install` executes.',
  ]
}

/** The guard every failure-path step must carry — necessary, never sufficient. */
const FAILURE_GUARD = /\bfailure\(\)/

/** Does this step RUN the formatting check? (Quoted messages are data, not commands.) */
function runsFormatCheck(step: Mapping): boolean {
  return runsOf(step)
    .map(stripQuotedMessages)
    .some(run => referencesScript(run, FORMAT_CHECK_SCRIPT))
}

interface Job {
  name: string
  body: Mapping
  steps: Mapping[]
}

/** Every job in the workflow, by id, with its body and its parsed steps. */
function jobsOf(root: Mapping): Job[] {
  const jobs = root['jobs']
  if (!isMapping(jobs)) return []
  return Object.entries(jobs).map(([name, declared]) => {
    const body = isMapping(declared) ? declared : {}
    const steps = Array.isArray(body['steps']) ? body['steps'].filter(isMapping) : []
    return { name, body, steps }
  })
}

/** Every step of every job. */
function allSteps(jobs: Job[]): Mapping[] {
  return jobs.flatMap(job => job.steps)
}

/**
 * A `steps:` sequence whose items are not mappings. GitHub rejects the workflow outright
 * for it (probe: a merge-keyed job and an unknown top-level key both fail the run before
 * any job starts), and here it would be a step this guard walks past — so it is reported
 * rather than filtered out silently.
 */
function stepShapeProblems(jobs: Job[]): string[] {
  return jobs.flatMap(job => {
    const declared = job.body['steps']
    if (declared === undefined) return []
    if (!Array.isArray(declared))
      return [
        `job \`${job.name}\` declares \`steps:\` as something other than a sequence: nothing in it is a\n` +
          '  step this guard can read, and GitHub rejects the workflow file outright.',
      ]
    const foreign = declared.filter(item => !isMapping(item))
    if (foreign.length === 0) return []
    return [
      `job \`${job.name}\` has ${foreign.length} \`steps:\` item(s) that are not mappings: a step is a\n` +
        '  mapping of keys (`uses:`, `run:`, `if:`, …), so an item of any other shape carries no key this\n' +
        '  guard reads — and GitHub rejects the workflow file for it.',
    ]
  })
}

/**
 * The job that actually RUNS `pnpm format:check` — the single job whose id becomes the
 * `format` status context, and the anchor both `jobIdentityProblems` and
 * `remedyScopeProblems` reason from. Asserting anything about "the job named `format`"
 * instead lets a decoy carry the name while the real check publishes another context.
 */
function hostJob(jobs: Job[]): Job | undefined {
  return jobs.find(job => job.steps.some(runsFormatCheck))
}

/** Names the checking step's status context at all — necessary, and on its own nothing. */
function referencesCheck(condition: string, id: string): boolean {
  return condition.includes(`steps.${id}.outcome`) || condition.includes(`steps.${id}.conclusion`)
}

/**
 * The comparison that actually puts a step on the FAILURE path.
 *
 * Naming `steps.<id>.outcome` and SCOPING to the failure are two different things, and
 * the substring test that used to stand in for this asserted only the first. The value
 * domain is four states — `success`, `failure`, `cancelled`, `skipped` — and the
 * reference is a substring of every condition that reads any of them:
 *
 * - `== 'success'` is the one-token edit that costs AC1. A PR carries an unformatted
 *   file, `Check formatting` fails, `failure()` is true — and `outcome` is `'failure'`,
 *   so the comparison is FALSE and the remedy is SKIPPED on precisely the run that
 *   needed it. The contributor reads `--list-different`'s bare filename with prettier's
 *   own "run with --write to fix" line suppressed, which is the whole reason the remedy
 *   step exists.
 * - `== 'skipped'` fires only when the check never ran — i.e. on the broken `pnpm
 *   install` this scope exists to stay QUIET about, and never on a formatting failure.
 *   The wrong diagnosis, inverted onto the wrong run.
 * - `!= 'success'` is true for `failure`, `skipped` AND `cancelled`: the unscoped
 *   `if: failure()` back, wearing a scope.
 * - a bare reference (`failure() && steps.<id>.outcome`) is truthy for all four values,
 *   so it is `if: failure()` with extra words.
 *
 * So this is an ALLOW-list like every other rule here: equality against `'failure'`, on
 * `outcome` or `conclusion`, in either operand order, in either quote style. `contains()`
 * and every other spelling is rejected rather than reasoned about — fail CLOSED.
 */
function scopesTo(condition: string, id: string): boolean {
  const status = `steps\\.${id}\\.(?:outcome|conclusion)`
  // `['"]{1,2}` also accepts YAML's doubled-quote escape inside a single-quoted scalar.
  const failure = `(['"]{1,2})failure\\1`
  return (
    new RegExp(`${status}\\s*==\\s*${failure}`).test(condition) ||
    new RegExp(`${failure}\\s*==\\s*${status}`).test(condition)
  )
}

/**
 * Present is not the same as DECISIVE, and that is the fourth leg of this scope.
 *
 * `if:` is a boolean expression and `&&` binds tighter than `||`, so
 * `failure() && steps.<id>.outcome == 'failure' || true` parses as
 * `(failure() && <scope>) || true` — the comparison `scopesTo` demands is there,
 * character for character the shipped spelling, and the step fires on every run. The
 * measured losses, each one a few tokens appended to a condition every other rule in
 * this module reports well-formed:
 *
 * - `|| steps.install.outcome == 'failure'` — a broken `pnpm install` is annotated
 *   "not formatted. Run `pnpm format`" again. That is exactly the loss round 3 closed
 *   by introducing the scope, restored without touching the scope.
 * - `|| true` / `always() || …` — the remedy also fires on GREEN runs, annotating a
 *   passing PR with a formatting failure that did not happen.
 * - `!(<scope>)` — the scope inverted with one character, where `!= 'failure'` (which
 *   `scopesTo` already rejects) is the same inversion spelled with two.
 * - `!steps.<id>.outcome == 'failure'` — unary `!` binds tighter than `==`, so this
 *   compares `false` to `'failure'` and is never true on any run.
 *
 * So the structure is an allow-list too: a CONJUNCTION of allow-listed terms. "Extra
 * `&&` terms only narrow" was the first cut, and narrowing to ZERO on the PR path IS the
 * AC1 loss: `failure() && <scope> && github.event_name == 'push'` keeps the scope exactly
 * right and skips the remedy on every `pull_request` run — measured on GitHub (probe run
 * on PR #477: `Check formatting: failure`, remedy `skipped`) — so the contributor this
 * workflow exists for reads the bare filename anyway, the identical loss `== 'success'`
 * costs, reached through the form the guard explicitly waved through. Hence every `&&`
 * term must be one of: `failure()`; a negated status function that is TRUE on the failure
 * path (`!cancelled()`, `!success()` — a `!` on a function is not a `!` on the scope, and
 * rejecting them would fail a correct workflow); or the scope equality itself. `false`,
 * `always()` (a no-op), `!failure()` (never true beside `failure()`), any `github.*` or
 * `steps.<other>` term, and a SECOND equality on the same context are rejected. An outer
 * `${{ }}` and parentheses around a term are the same condition and are unwrapped.
 */
function unwrapExpression(condition: string): string {
  const match = /^\$\{\{([\s\S]*)\}\}$/.exec(condition.trim())
  return match?.[1]?.trim() ?? condition.trim()
}

/** Does the opening `(` of this text close only at its very end? */
function wrapsWhole(text: string): boolean {
  let depth = 0
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '(') depth++
    else if (text[index] === ')') {
      depth--
      if (depth === 0 && index < text.length - 1) return false
    }
  }
  return depth === 0
}

function unwrapParens(term: string): string {
  let text = term.trim()
  while (text.startsWith('(') && text.endsWith(')') && wrapsWhole(text)) {
    text = text.slice(1, -1).trim()
  }
  return text
}

function decides(condition: string, id: string): boolean {
  // Quoted literals are DATA: `== 'failure'` must not be read as structure. Masking
  // them first is the same data/structure split `stripQuotedMessages` makes for `run:`.
  const structure = condition.replace(/'[^'\n]*'|"[^"\n]*"/g, "''")
  if (structure.includes('||')) return false
  const status = `steps\\.${id}\\.(?:outcome|conclusion)`
  const failure = `(['"]{1,2})failure\\1`
  const allowed = [
    /^failure\(\)$/,
    /^!\s*(?:cancelled|success)\(\)$/,
    new RegExp(`^${status}\\s*==\\s*${failure}$`),
    new RegExp(`^${failure}\\s*==\\s*${status}$`),
  ]
  return unwrapParens(unwrapExpression(condition))
    .split('&&')
    .map(unwrapParens)
    .every(term => allowed.some(shape => shape.test(term)))
}

/**
 * `if:` is an ALLOW-list, not a deny-list, and this is the whole reason why. A rule
 * that bans the LITERAL falses (`if: false`, `'false'`, `${{ false }}`) waves through
 * every never-true EXPRESSION, which is the spelling anyone would actually write:
 *
 * - `if: github.event_name == 'workflow_dispatch'` on the JOB — no PR ever runs it,
 *   and on GitHub a job skipped via `if:` reports its required check as SUCCESSFUL
 *   (measured; github-implementation.md § Ordering), so the merge goes through with
 *   the check never having run.
 * - `if: github.event_name == 'push'` on the CHECKING step — every PR runs the job,
 *   skips the only step that checks anything, and the `format` context reports
 *   SUCCESS on unformatted code. Every other rule here stays green through it.
 *
 * And `failure()` is NOT the allow-list either, because the checking step is exactly
 * the step it must never appear on: `if: failure()` there is false on a normal PR
 * (every earlier step succeeded), so the check is SKIPPED and the job ends green —
 * the identical loss, wearing the remedy's own spelling. `if: failure() &&
 * steps.format_check.outcome == 'failure'` on that step is worse still: a step
 * reading its OWN `steps.<id>` context reads an unpopulated value, so it never runs
 * on any event at all.
 *
 * And `needs:` is the same neutralization with no condition written anywhere. A job
 * whose dependency fails — or is itself skipped — never runs and is REPORTED SKIPPED,
 * which is the same "required check reads successful" GitHub behaviour the job `if:`
 * rule cites. `needs: precheck` with a `precheck` job that exits 1 leaves every other
 * rule in this module green while the formatting check never executes. This workflow is
 * single-job by design, so nothing may gate the job that publishes the context.
 *
 * So: no `if:` and no `needs:` on a job (this workflow has one job and it must always
 * run), NO `if:` on the step that runs `format:check`, and on every other step only a
 * condition carrying `failure()` — scoped, which `remedyScopeProblems` owns.
 */
function conditionProblems(jobs: Job[]): string[] {
  const problems: string[] = []
  for (const job of jobs) {
    const dependencies = filterOf(job.body, 'needs')
    if (dependencies !== null) {
      problems.push(
        `job \`${job.name}\` declares \`needs: ${dependencies.join(', ') || '(nothing readable)'}\`: a job that can be\n` +
          '  skipped is a check that can be absent, and a job whose dependency fails — or is itself\n' +
          '  skipped — never runs and is reported SKIPPED, which on GitHub reports its required check as\n' +
          '  SUCCESSFUL (github-implementation.md § Ordering). The merge then goes through with the\n' +
          '  formatting check never having executed, exactly as a job-level `if:` would, and with no\n' +
          '  condition written anywhere to notice. This workflow is single-job by design.',
      )
    }
    const jobCondition = textAt(job.body, 'if')
    if (jobCondition !== undefined) {
      problems.push(
        `job \`${job.name}\` carries \`if: ${jobCondition}\`: a job that can be skipped is a check that\n` +
          '  can be absent, and on GitHub a job skipped via `if:` reports its required check as\n' +
          '  SUCCESSFUL — the merge goes through with the check never having run\n' +
          '  (github-implementation.md § Ordering). This job must run on every event the triggers allow.',
      )
    }
    for (const step of job.steps) {
      const condition = textAt(step, 'if')
      if (condition === undefined) continue
      if (runsFormatCheck(step)) {
        problems.push(
          `the \`pnpm ${FORMAT_CHECK_SCRIPT}\` step carries \`if: ${condition}\`: the one step that checks\n` +
            '  anything must carry NO condition. Every condition is a way for it to be skipped while the\n' +
            '  job still ends successful and the `format` context reports SUCCESS on unformatted code —\n' +
            "  including a `failure()` guard, false on a normal PR, and a self-reference to this step's\n" +
            '  own `steps.<id>.outcome`, which reads an unpopulated context and never runs at all.',
        )
        continue
      }
      if (FAILURE_GUARD.test(condition)) continue
      problems.push(
        `a step in job \`${job.name}\` carries \`if: ${condition}\`: the job still runs and the \`format\`\n` +
          '  context still reports SUCCESS, but the step is skipped. The only condition a step here may\n' +
          "  carry is the remedy's `failure()` guard, scoped to the checking step's own outcome —\n" +
          '  anything else is a check that silently opts out.',
      )
    }
  }
  return problems
}

/**
 * The job's display name — its id when `name:` is absent — IS the status context.
 * Nothing else in this module asserts it, so
 * renaming `format:` to `fmt:` left every rule green while the context way-of-working
 * documents — and that AC8 names for branch protection — stopped existing. In
 * advisory mode that is no signal at all; once protection requires it, a required
 * context that never reports leaves every PR pending with no escape hatch
 * (github-implementation.md § Ordering, measured on this repo).
 *
 * Asserted on the HOST job — the one that runs `pnpm format:check` — never on the set
 * of job NAMES. "Some job is called `format`" is satisfied by a decoy: keep `format:`
 * with a single `run: echo ok` step and move the real steps into a second job
 * `worker:`, and every other rule here stays green while the `format` context reports
 * SUCCESS after an `echo` and the job that checks anything publishes a `worker` context
 * nobody requires. That is the same context-deletion loss as the plain rename, and
 * worse: the rename now goes red, the decoy would not.
 */
function jobIdentityProblems(jobs: Job[]): string[] {
  const host = hostJob(jobs)
  if (host !== undefined) {
    if (host.name !== FORMAT_JOB) {
      return [
        `the job that runs \`pnpm ${FORMAT_CHECK_SCRIPT}\` is \`${host.name}\`, not \`${FORMAT_JOB}\`. The job's display\n` +
          `  name — its id when \`name:\` is absent — IS the status context GitHub publishes: way-of-working\n` +
          `  requires \`${FORMAT_JOB}\` and AC8 names it as the context branch protection must list. So the check\n` +
          `  that runs publishes a context nobody requires, and \`${FORMAT_JOB}\` is either absent — every PR left\n` +
          '  pending once protection lists it, with no escape hatch — or present on a job that checks\n' +
          '  nothing and reports SUCCESS regardless.',
      ]
    }
    return [...displayNameProblems(host, jobs), ...matrixProblems(host)]
  }
  const names = jobs.map(job => job.name)
  return names.includes(FORMAT_JOB)
    ? []
    : [
        `no job is named \`${FORMAT_JOB}\` (found: ${names.join(', ') || 'no job at all'}). The job's display\n` +
          `  name — its id when \`name:\` is absent — IS the status context GitHub publishes: way-of-working\n` +
          `  requires \`${FORMAT_JOB}\` and AC8 names it as the context branch protection must list. Renaming\n` +
          '  the job deletes that context without touching a rule — silently while review enforcement is\n' +
          '  advisory, and once protection requires it, a required context that never reports leaves\n' +
          '  every PR pending with no escape hatch.',
      ]
}

/**
 * GitHub publishes the job's DISPLAY NAME as the check context, not its id — measured
 * on this repo: version.yml's job id `version` carries `name: Create version commits and
 * tags`, and `gh run view 32579550290 --json jobs` reports the job under that name. So
 * one `name:` line on the host renames the `format` context exactly as `fmt:` does
 * (rename went red, `name:` went green), and a `name: format` on ANY OTHER job is the
 * round-6 decoy spelled through the display name — a second `format` context published
 * after an `echo`. Only a `name:` equal to the id is accepted: same context, nothing
 * lost.
 */
function displayNameProblems(host: Job, jobs: Job[]): string[] {
  const problems: string[] = []
  const hostName = textAt(host.body, 'name')
  if (hostName !== undefined && hostName !== FORMAT_JOB) {
    problems.push(
      `job \`${host.name}\` carries \`name: ${hostName}\`: GitHub publishes a job's display name as its check\n` +
        `  context, not its id, so this renames the \`${FORMAT_JOB}\` context — the one way-of-working requires\n` +
        '  and AC8 tells branch protection to list — as surely as renaming the job would. Drop `name:`,\n' +
        `  or set it to \`${FORMAT_JOB}\`.`,
    )
  }
  for (const job of jobs) {
    if (job === host) continue
    if (textAt(job.body, 'name') !== FORMAT_JOB) continue
    problems.push(
      `job \`${job.name}\` carries \`name: ${FORMAT_JOB}\`: GitHub publishes a job's display name as its check\n` +
        `  context, so this job publishes a SECOND \`${FORMAT_JOB}\` context beside the one that checks —\n` +
        '  the decoy spelled through the display name. Only the job that runs the check may carry it.',
    )
  }
  return problems
}

/**
 * A matrix appends its values to the display name: actions/checkout's job id `analyze`
 * with `name: Analyze` and `matrix.language: ['javascript']` is published as `Analyze
 * (javascript)` (run 33304315280). So `strategy.matrix.node: ['20']` on the host makes
 * the context `format (20)` and `format` stops existing — every PR pending once
 * protection lists it, with no escape hatch. Rejected on any `strategy:` block, not
 * only one carrying `matrix:`: a strategy block exists to carry a matrix, and this
 * workflow has exactly one thing to run.
 */
function matrixProblems(host: Job): string[] {
  if (!('strategy' in host.body)) return []
  return [
    `job \`${host.name}\` declares \`strategy:\`: a matrix suffixes its values onto the job's display name, so\n` +
      `  the published context becomes \`${FORMAT_JOB} (20)\` (or one per cell) and \`${FORMAT_JOB}\` itself stops\n` +
      '  existing — every PR left pending once branch protection lists it, with no escape hatch. This\n' +
      '  workflow runs one command once; it has no matrix.',
  ]
}

/**
 * What a step USES, as opposed to what it runs. `findWriteModeFormatters` reads
 * `run:` blocks only, so a formatting action was invisible to it: `uses:
 * creyD/prettier_action@v4` with `prettier_options: --write .`, placed BEFORE the
 * checking step, rewrites the runner's checkout — `pnpm format:check` then passes on
 * unformatted code and the `format` context goes green, which is exactly the AC6 loss
 * the auto-commit rule exists to prevent. And it needs no permission to do it: it
 * never pushes, so `contents: read` is no backstop at all (unlike
 * `git-auto-commit-action`, whose push fails).
 *
 * Hence an allow-list of the three actions the workflow needs, matched on the action
 * NAME so a version bump or a pinned SHA stays green. Adding a fourth is a deliberate
 * edit here. And the NAME is not the whole step: the checkout's `with:` decides what
 * tree every later step sees (`checkoutInputProblems`).
 */
function checkoutInputProblems(step: Mapping): string[] {
  if (!('with' in step)) return []
  const inputs = step['with']
  if (!isMapping(inputs)) {
    return [
      'the `actions/checkout` step declares a `with:` that is not a mapping of inputs, so no input can\n' +
        '  be read from it and GitHub rejects the workflow file for it.',
    ]
  }
  const foreign = Object.keys(inputs).filter(
    key => !ALLOWED_CHECKOUT_INPUTS.some(allowed => allowed === key),
  )
  if (foreign.length === 0) return []
  return [
    `the \`actions/checkout\` step sets \`with:\` input(s) \`${foreign.join('`, `')}\`. The only inputs it may\n` +
      `  carry are fetch mechanics (${ALLOWED_CHECKOUT_INPUTS.join(', ')}), which leave the\n` +
      "  tree as the event's ref. `ref` REPLACES that ref — actions/checkout defaults it to the PR merge\n" +
      "  commit — so `pnpm format:check` runs on a tree that is not the PR's: measured, `ref: main` on a\n" +
      '  PR carrying an unformatted file reports the `format` context SUCCESSFUL (AC2). `repository`\n' +
      '  and `path` change which tree the command runs on at all; `sparse-checkout` and\n' +
      "  `sparse-checkout-cone-mode` check out a SUBSET (AC4's divergence spelled as an input); every\n" +
      '  other input is rejected with them — a new input is a deliberate edit to this allow-list.',
  ]
}

function usesProblems(jobs: Job[]): string[] {
  const problems: string[] = []
  for (const step of allSteps(jobs)) {
    const uses = textAt(step, 'uses')
    if (uses === undefined) continue
    const action = (uses.split('@')[0] ?? '').toLowerCase()
    if (action === 'actions/checkout') problems.push(...checkoutInputProblems(step))
    if (ALLOWED_USES.some(allowed => allowed === action)) continue
    problems.push(
      `a step declares \`uses: ${uses}\`, which is not one of the actions this workflow needs\n` +
        `  (${ALLOWED_USES.join(', ')}). The write-mode scan reads \`run:\` blocks only, so an\n` +
        '  action that rewrites the checkout is invisible to it: placed before the checking step it\n' +
        "  formats the runner's working copy, `pnpm format:check` then passes on unformatted code and\n" +
        '  the `format` context goes green (AC6). It needs no permission to do that — it never pushes —\n' +
        '  so a read-only token is no backstop. A new action is a deliberate edit to this allow-list.',
    )
  }
  return problems
}

/**
 * AC4, the "one command, two places" business rule, as an EQUALITY rather than a
 * mention. "Some run block references the script" was satisfied by every narrowing
 * that reinstates the divergence this story closes: `pnpm --filter=@pair/website
 * format:check` and `cd apps/website && pnpm format:check` both make CI check a strict
 * SUBSET of the tree the developer's and the hook's whole-repo `pnpm format:check`
 * covers. `pnpm -s format:check` is the same class one step further — it silences the
 * list of offending filenames AC1 requires the contributor to read.
 *
 * So the checking step runs exactly one command, and that command is the canonical
 * one. `pnpm run format:check` is normalized in as the identical invocation; nothing
 * else is.
 */
export const FORMAT_CHECK_COMMAND = `pnpm ${FORMAT_CHECK_SCRIPT}`

function normalizeCommand(run: string): string {
  return run
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^pnpm run /, 'pnpm ')
}

/**
 * The keys the checking step may carry. `working-directory:` is `cd` spelled as a key —
 * the command equality below reads the `run:` text and cannot see it — so CI runs the
 * directory's OWN `format:check`, a subset of the tree the developer checks. Measured
 * against pnpm (the real producer): today no workspace package declares the script, so
 * `cd packages/dev-tools && pnpm format:check` exits 254 (ERR_PNPM_NO_SCRIPT) — fail-
 * closed by accident; a package.json with `"format:check": "echo SUBSET-ONLY"` runs it,
 * exit 0. The first package to gain that script (a normal, unrelated change) turns the
 * accident into a silent subset with the guard green — AC4's divergence reinstated through
 * a key the `--filter=`/`cd` rule was written to catch. `shell:` and `env:` change how the
 * one command runs; nothing here needs either. `if:` and `continue-on-error:` are owned by
 * their own rules, which name the loss precisely, so they are not reported twice here.
 */
export const CHECK_STEP_KEYS = ['name', 'id', 'run', 'timeout-minutes'] as const
const CHECK_STEP_KEYS_OWNED_ELSEWHERE = ['if', 'continue-on-error'] as const

function checkStepKeyProblems(jobs: Job[]): string[] {
  const check = hostJob(jobs)?.steps.find(runsFormatCheck)
  if (check === undefined) return []
  const foreign = Object.keys(check).filter(
    key =>
      !CHECK_STEP_KEYS.some(allowed => allowed === key) &&
      !CHECK_STEP_KEYS_OWNED_ELSEWHERE.some(owned => owned === key),
  )
  if (foreign.length === 0) return []
  return [
    `the \`pnpm ${FORMAT_CHECK_SCRIPT}\` step carries \`${foreign.join('`, `')}\`: the checking step may carry only\n` +
      `  \`${CHECK_STEP_KEYS.join('`, `')}\`. \`working-directory\` is \`cd\` spelled as a key — the command\n` +
      "  equality reads the `run:` text and cannot see it — so CI runs that directory's OWN `format:check`,\n" +
      '  a SUBSET of the tree the developer checks (today no workspace package declares one and pnpm exits\n' +
      '  254, ERR_PNPM_NO_SCRIPT: fail-closed by accident, until the first package gains the script).\n' +
      '  `shell` and `env` change how the one command runs; none of these is needed to run it.',
  ]
}

/**
 * The workflow's own keys, and every job's. Both are allow-lists for the reason
 * `CHECK_STEP_KEYS` is one, one and two levels up: a key that decides WHAT or HOW the
 * check runs is a key the step-level rule can be BYPASSED BY RELOCATION. `env:` is the
 * measured case — a job-level `env: NODE_OPTIONS: --require ./shim.js` reaches the
 * checking step (GitHub probe run 33724282486), and against the repo's own pinned
 * prettier 3.6.2 that shim turns `--list-different` from "prints `bad.ts`, exit 1" into
 * "prints `bad.ts`, exit 0": `pnpm format:check` still NAMES the file and the `format`
 * context reports SUCCESS. `container:`/`services:` choose the image the check runs in,
 * i.e. third-party code selected by a job key — the `uses:` argument one level up.
 */
function foreignKeys(
  keys: string[],
  allowed: readonly string[],
  ownedElsewhere: readonly string[],
): string[] {
  return keys.filter(
    key => !allowed.some(ok => ok === key) && !ownedElsewhere.some(owned => owned === key),
  )
}

function workflowKeyProblems(root: Mapping): string[] {
  const foreign = foreignKeys(Object.keys(root), WORKFLOW_KEYS, WORKFLOW_KEYS_OWNED_ELSEWHERE)
  if (foreign.length === 0) return []
  return [
    `the workflow declares \`${foreign.join('`, `')}\` at workflow level: it may carry only\n` +
      `  \`${WORKFLOW_KEYS.join('`, `')}\`. A workflow-level \`env:\` is inherited by every job and every step,\n` +
      "  so it reaches the checking step whatever that step's own allow-list says — `NODE_OPTIONS:\n" +
      "  --require ./shim.js` with a one-line shim (`process.on('exit', () => { process.exitCode = 0 })`)\n" +
      '  makes prettier print the offending file and exit 0, so `pnpm format:check` names it and the\n' +
      '  `format` context goes GREEN on unformatted code (measured against prettier 3.6.2). Every other\n' +
      '  key here is a deliberate edit to this allow-list.',
  ]
}

function jobKeyProblems(jobs: Job[]): string[] {
  return jobs.flatMap(job => {
    const foreign = foreignKeys(Object.keys(job.body), JOB_KEYS, JOB_KEYS_OWNED_ELSEWHERE)
    if (foreign.length === 0) return []
    return [
      `job \`${job.name}\` declares \`${foreign.join('`, `')}\`: a job may carry only\n` +
        `  \`${JOB_KEYS.join('`, `')}\`. \`env:\` on the job reaches the checking step even though that step\n` +
        '  may declare none of its own (measured on GitHub), and `NODE_OPTIONS: --require ./shim.js` with a\n' +
        "  one-line shim (`process.on('exit', () => { process.exitCode = 0 })`) makes prettier print the\n" +
        '  offending file and exit 0 — `pnpm format:check` names it and the `format` context goes GREEN on\n' +
        '  unformatted code (measured against prettier 3.6.2). `container:` and `services:` choose the\n' +
        '  image the check runs in, which is third-party code picked by a job key — the `uses:` argument\n' +
        '  one level up. Every other key here is a deliberate edit to this allow-list.',
    ]
  })
}

/**
 * The labels a `runs-on:` value resolves to, or `undefined` for a shape that names no
 * label set at all — a runner `group:` mapping, which names a runner GROUP rather than a
 * label set, or a sequence carrying something that is not a scalar. A missing key is `undefined` too and
 * is caught by the caller before this runs; `runs-on:` with an empty value resolves to
 * `null`, which names no machine either and comes back as `[]`.
 */
function runnerLabels(declared: unknown): string[] | undefined {
  if (declared === null) return []
  if (Array.isArray(declared))
    return declared.every(item => item !== null && !isMapping(item) && !Array.isArray(item))
      ? declared.map(String)
      : undefined
  if (isMapping(declared)) return undefined
  return [String(declared)]
}

/**
 * A `runs-on:` value as it was written, for the message that rejects it. A non-scalar
 * ITEM of a sequence is rendered as JSON, not flattened: `String([...])` turns
 * `[[ubuntu-latest]]` into `[ubuntu-latest]` and `[{group: x}]` into `[[object Object]]`,
 * so the rejection quoted back a value that is itself on the allow-list — "you wrote
 * `[ubuntu-latest]`, which is rejected; use `[ubuntu-latest]`". (GitHub rejects the nested
 * spelling as an invalid workflow file outright — probe run 33782655630 on PR #477 failed
 * with no job scheduled — so the reader of this message is already lost; the message must
 * at least name what they wrote.)
 */
function describeRunsOn(declared: unknown): string {
  if (declared === null) return '(empty)'
  if (Array.isArray(declared)) return `[${declared.map(describeRunsOnItem).join(', ')}]`
  if (isMapping(declared)) return `{${Object.keys(declared).join(', ')}}`
  return String(declared)
}

function describeRunsOnItem(item: unknown): string {
  return isMapping(item) || Array.isArray(item) ? JSON.stringify(item) : String(item)
}

/**
 * WHICH MACHINE runs the check. `jobKeyProblems` allow-lists the KEYS a job may declare
 * and `runs-on` is on that list, so until this rule the value was free: `runs-on:
 * self-hosted` — and `[self-hosted, linux]` with it — was `ok=true` on the shipped file,
 * one line relocating the check onto a machine of the author's choosing while every other
 * rule stayed green.
 *
 * It is the `container:` argument, spelled as that key's VALUE. `container:` is rejected
 * because the image decides what `pnpm` and `prettier` even are; the machine decides the
 * same thing, plus who watches the run. And on a PUBLIC repo a `pull_request` run executes
 * the PR's OWN version of this workflow file, so the value is chosen by the pull request,
 * not by the repository.
 *
 * On this repo TODAY the loss is a blocked merge rather than a false green:
 * `gh api repos/foomakers/pair/actions/runners` returns `total_count: 0`, so a job pinned
 * to `self-hosted` never gets a runner — measured, probe run 33729726089 on PR #477: the
 * two self-hosted jobs sat `queued` while the four GitHub-hosted ones finished, and the
 * `format` context of such a run would stay PENDING, never SUCCESS. That holds only until
 * someone registers a self-hosted runner, which on a public repo is the configuration
 * GitHub itself warns against — for exactly this reason. The rule closes the gap at the
 * cheap end rather than depending on a repository setting staying the way it is.
 *
 * A LIST IS ANDed BY GITHUB, so the rule counts labels — it is not "every label is
 * allow-listed". Probe run 33782665948 on PR #477: `[ubuntu-latest]` and
 * `[ubuntu-latest, ubuntu-latest]` completed success (GitHub dedupes the set), while
 * `[ubuntu-latest, ubuntu-22.04]` and `[ubuntu-latest, ubuntu-24.04, ubuntu-22.04]` sat
 * `queued` and never started — no hosted image carries two image labels. The duplicate
 * spelling is rejected anyway: the contract is ONE label, and a false RED on a spelling
 * nobody needs costs a message, while the missing count cost a `format` context that never
 * reaches SUCCESS.
 */
function runsOnProblems(jobs: Job[]): string[] {
  return jobs.flatMap(job => {
    if (!('runs-on' in job.body))
      return [
        `job \`${job.name}\` declares no \`runs-on:\`, so nothing says which machine runs it — GitHub\n` +
          '  rejects the workflow file outright for it, and this guard would otherwise walk past the one\n' +
          `  key that picks the machine. Set it to one of \`${RUNNER_LABELS.join('`, `')}\`.`,
      ]
    const declared = job.body['runs-on']
    const labels = runnerLabels(declared)
    // EXACTLY ONE label, not "every label allow-listed": GitHub ANDs a label list, so a
    // second DIFFERENT image label narrows the runner set to empty (measured — probe run
    // 33782665948: `[ubuntu-latest, ubuntu-22.04]` and `[ubuntu-latest, ubuntu-24.04,
    // ubuntu-22.04]` both sat `queued`, never started, while `[ubuntu-latest]` finished).
    // A REPEATED label is the one row where counting is narrower than the producer:
    // `[ubuntu-latest, ubuntu-latest]` completed success (GitHub dedupes the set) and is
    // rejected anyway, because the contract is one label and the direction is a false RED.
    const accepted =
      labels !== undefined && labels.length === 1 && RUNNER_LABELS.some(ok => ok === labels[0])
    if (accepted) return []
    return [
      `job \`${job.name}\` sets \`runs-on: ${describeRunsOn(declared)}\`: it may run only on a\n` +
        `  GitHub-hosted Ubuntu runner (\`${RUNNER_LABELS.join('`, `')}\`, alone or as a\n` +
        '  one-label list). A list must carry EXACTLY ONE label: two DIFFERENT allow-listed labels are\n' +
        '  ANDed by GitHub and name no machine, so the job never starts and the `format` context stays\n' +
        '  PENDING, never SUCCESS (measured). A repeated label is rejected too, though GitHub dedupes it\n' +
        '  and the job does run (measured): ONE label is the contract, and the repeat is a spelling with\n' +
        '  no use. `runs-on` picks the MACHINE, which decides what `pnpm` and `prettier` even are — the\n' +
        '  `container:` argument spelled as a value instead of a key — and on a PUBLIC repo a\n' +
        "  `pull_request` run executes the PR's OWN version of this file, so `self-hosted` (bare, in a\n" +
        '  label list, or through a runner `group:`) hands the `format` verdict to a machine the pull\n' +
        '  request chose. Today that reads as a BLOCKED merge rather than a green check — this repo has\n' +
        '  no self-hosted runner registered, so the job queues forever and the context stays pending\n' +
        '  (measured) — which lasts exactly as long as that stays true. Another GitHub-hosted OS or a\n' +
        '  larger/arm image is a deliberate edit to `RUNNER_LABELS`, not a drive-by one.',
    ]
  })
}

/**
 * `defaults.run.working-directory` is the same `cd` one level up (a job) or two
 * (the workflow), and `defaults.run.shell` the same `shell:`. Both apply to every `run:`
 * step, the checking step included, and neither touches its text.
 */
function defaultsProblem(where: string): string {
  return (
    `${where} declares \`defaults:\`: \`defaults.run.working-directory\` moves every \`run:\` step — the\n` +
    '  checking step included — into a directory, `cd` spelled as a key and invisible to the command\n' +
    "  equality, so CI checks that directory's own `format:check` (a SUBSET) instead of the tree;\n" +
    '  `defaults.run.shell` changes the shell the check runs in. Nothing here needs a default.'
  )
}

function defaultsProblems(root: Mapping, jobs: Job[]): string[] {
  const problems: string[] = []
  if ('defaults' in root) problems.push(defaultsProblem('the workflow'))
  for (const job of jobs) {
    if ('defaults' in job.body) problems.push(defaultsProblem(`job \`${job.name}\``))
  }
  return problems
}

function checkCommandProblems(jobs: Job[]): string[] {
  const check = allSteps(jobs).find(runsFormatCheck)
  if (check === undefined) return []
  const runs = runsOf(check)
  if (runs.length === 1 && normalizeCommand(runs[0] ?? '') === FORMAT_CHECK_COMMAND) return []
  return [
    `the checking step runs \`${runs.join(' ⏎ ').replace(/\n/g, ' ⏎ ')}\`, not \`${FORMAT_CHECK_COMMAND}\`.\n` +
      '  AC4 is one command, two places: a CI-only flag, path list, `cd` or extra line makes CI check a SUBSET\n' +
      "  of the tree the developer's and the hook's whole-repo run covers — the local/CI divergence this\n" +
      '  workflow exists to close, reinstated with this guard green. (`-s` belongs to the same class: it\n' +
      '  silences the offending filenames AC1 tells the contributor to read.) The accepted spellings are\n' +
      `  \`${FORMAT_CHECK_COMMAND}\` and \`pnpm run ${FORMAT_CHECK_SCRIPT}\`.`,
  ]
}

/**
 * Job-level ways to keep the `format` context reporting while it can no longer
 * report red. Neither touches a trigger nor a step command, so every other rule in
 * this module stays green through them — and once branch protection requires
 * `format` (AC8), a required check that cannot fail is worse than no check, because
 * it is believed.
 */
function advisoryProblems(jobs: Job[]): string[] {
  const owners: { where: Mapping }[] = [
    ...jobs.map(job => ({ where: job.body })),
    ...allSteps(jobs).map(step => ({ where: step })),
  ]
  return owners.flatMap(({ where }) => {
    const value = textAt(where, 'continue-on-error')
    if (value === undefined || value === 'false') return []
    return [
      `sets \`continue-on-error: ${value}\`: the step fails and the job still reports SUCCESS, so\n` +
        '  the `format` context goes green on unformatted code. A check that cannot fail is not a check.',
    ]
  })
}

function jobProblems(root: Mapping, jobs: Job[]): string[] {
  return [
    ...advisoryProblems(jobs),
    ...conditionProblems(jobs),
    ...jobs.flatMap(job => permissionProblems(job.name, job.body, root)),
  ]
}

/**
 * AC1: a failing check must name the offending file AND the remedy. `--list-different`
 * gives the file and suppresses prettier's own "Run Prettier with --write to fix"
 * line, so the remedy has to come from the workflow — and only on the failure path,
 * where it is read.
 *
 * Scanned as a MESSAGE, not a command: `pnpm format` is a write-mode formatter, so
 * the same literal is required here and banned two rules down. What separates them
 * is quoting — see `stripQuotedMessages`.
 */
const REMEDY_MENTION = new RegExp(`\\bpnpm ${REMEDY_SCRIPT}\\b(?![:\\w-])`)

/** A step conditioned on `failure()` — the failure path, whatever else its condition says. */
function isFailurePathStep(step: Mapping): boolean {
  const condition = textAt(step, 'if')
  return condition !== undefined && FAILURE_GUARD.test(condition)
}

function remedyProblems(jobs: Job[]): string[] {
  const failurePath = allSteps(jobs).filter(isFailurePathStep).flatMap(runsOf).join('\n')

  if (REMEDY_MENTION.test(failurePath)) return []
  return [
    `no failure-path step names the remedy (\`pnpm ${REMEDY_SCRIPT}\`). \`format:check\` lists the offending\n` +
      '  files and prettier\'s own "run with --write" hint is suppressed by `--list-different`, so a\n' +
      '  contributor whose hooks are not installed — the one this check exists for — reads a bare\n' +
      '  filename and no instruction. Add a step with `if: failure()` that echoes what to run.',
  ]
}

/**
 * A bare `if: failure()` is JOB-scoped: it fires when ANY earlier step failed, not
 * only the formatting check. `pnpm install` dying on a lockfile drift or a registry
 * outage would annotate the Checks tab with "The files listed in the previous step
 * are not formatted. Run 'pnpm format' locally" — the contributor runs it, nothing
 * changes, and the real cause is buried under a confident wrong diagnosis in the one
 * message the UI surfaces. So the remedy is conditioned on the CHECKING step's own
 * `outcome`, which requires that step to carry an `id:`.
 *
 * EVERY such condition, not merely one of them: a correctly-scoped remedy does not
 * license a second `failure()` step beside it. One extra `- name: Extra note` /
 * `if: failure()` / `run: echo "::error title=Formatting check failed::…"` fires on
 * a lockfile drift just as the unscoped remedy did, and the Checks tab carries the
 * same wrong diagnosis — the rule would be green over the exact loss it names.
 *
 * Naming `steps.<id>` is necessary and not sufficient: the step must be able to
 * RESOLVE it. `steps` is JOB-LOCAL and populated only for steps that have already
 * run, so two placements pass a spelling check while the remedy fires on no run at
 * all — the remedy in a SECOND JOB (the context is empty there, the condition false
 * forever), and the remedy ABOVE the checking step in the same job (the context is
 * not yet populated at that index). Either is AC1's exact loss: a red check hands the
 * contributor a bare filename and no instruction, with this guard reporting the
 * workflow well-formed.
 *
 * Silent when no step runs `format:check` at all — `stepProblems` owns that failure
 * and reporting it twice would name the wrong cause. The checking step's own `if:`
 * is `conditionProblems`' (it may carry none at all), so it is skipped here.
 */
const SCOPING_ADVICE =
  `  Give the \`pnpm ${FORMAT_CHECK_SCRIPT}\` step an \`id:\` and condition EVERY failure-path step on it\n` +
  "  (`if: failure() && steps.<id>.outcome == 'failure'`), in the SAME job, AFTER that step."

interface FailurePathStep {
  job: string
  index: number
  condition: string
}

/** Every `failure()`-conditioned step except the checking one (whose `if:` is `conditionProblems`'). */
function failurePathSteps(jobs: Job[], hostName: string, checkIndex: number): FailurePathStep[] {
  return jobs.flatMap(job =>
    job.steps.flatMap((step, index) => {
      if (job.name === hostName && index === checkIndex) return []
      const condition = textAt(step, 'if')
      if (condition === undefined || !FAILURE_GUARD.test(condition)) return []
      return [{ job: job.name, index, condition }]
    }),
  )
}

function unscopedProblem(unscoped: FailurePathStep[]): string {
  return (
    `${unscoped.length} failure-path step(s) are not scoped to the formatting check` +
    ` (\`if: ${unscoped.map(step => step.condition).join('`, `if: ')}\`): \`failure()\` is\n` +
    '  JOB-scoped, so a failed `pnpm install`, checkout or setup-node is annotated "not formatted.\n' +
    '  Run `pnpm format`" — the contributor runs it, it changes nothing, and the real cause is buried\n' +
    `  under a confident wrong diagnosis. Every failure-path step needs the scope, not just one.\n${SCOPING_ADVICE}`
  )
}

function miscomparedProblem(miscompared: FailurePathStep[], id: string): string {
  return (
    `${miscompared.length} failure-path step(s) name \`steps.${id}\` but do not compare it to` +
    ` \`'failure'\`\n  (\`if: ${miscompared.map(step => step.condition).join('`, `if: ')}\`). The\n` +
    '  reference alone scopes nothing: `outcome` holds one of `success`, `failure`, `cancelled`,\n' +
    "  `skipped`, so `== 'success'` is FALSE exactly when the check failed — the remedy is skipped on\n" +
    "  the one run that needed it and the contributor reads `--list-different`'s bare filename with\n" +
    "  prettier's own \"run with --write to fix\" line suppressed (AC1). And `== 'skipped'` or\n" +
    "  `!= 'success'` fires on the broken `pnpm install` this scope exists to stay quiet about.\n" +
    `  The accepted comparison is \`steps.${id}.outcome == 'failure'\` (or \`.conclusion\`).\n${SCOPING_ADVICE}`
  )
}

function neutralizedProblem(neutralized: FailurePathStep[], id: string): string {
  return (
    `${neutralized.length} failure-path step(s) carry the \`steps.${id}\` scope but it decides nothing` +
    `\n  (\`if: ${neutralized.map(step => step.condition).join('`, `if: ')}\`). \`if:\` is a boolean\n` +
    '  expression and `&&` binds tighter than `||`, so `failure() && <scope> || <anything>` is\n' +
    '  `(failure() && <scope>) || <anything>`: the comparison is spelled exactly right and the step\n' +
    "  still fires when the check did not fail. `|| steps.<other>.outcome == 'failure'` annotates a\n" +
    '  broken `pnpm install` "not formatted. Run `pnpm format`" — the loss the scope exists to\n' +
    '  prevent — and `|| true` annotates GREEN runs too. A negation of the scope itself\n' +
    "  (`!(<scope>)`, or `!steps.<id>.outcome == 'failure'`, which compares `false` to `'failure'`)\n" +
    '  inverts it or makes it never true. And a conjunct can narrow the remedy to ZERO on the PR path:\n' +
    "  `&& github.event_name == 'push'` is false on every pull_request run (measured: the remedy step is\n" +
    '  skipped while the check fails), `&& false` always. The condition must be a CONJUNCTION of\n' +
    '  allow-listed terms only — `failure()`, `!cancelled()`/`!success()`, and the scope equality —\n' +
    `  with \`||\`, a negated scope and every other conjunct rejected.\n${SCOPING_ADVICE}`
  )
}

function foreignJobProblem(foreign: FailurePathStep[], id: string, hostName: string): string {
  const names = [...new Set(foreign.map(step => step.job))].join('`, `')
  return (
    `${foreign.length} failure-path step(s) name \`steps.${id}\` from job(s) \`${names}\`,\n` +
    `  while the \`pnpm ${FORMAT_CHECK_SCRIPT}\` step runs in job \`${hostName}\`: the \`steps\` context is\n` +
    '  job-local, so that condition is empty and false on EVERY run and the remedy never fires. A red\n' +
    '  check then hands the contributor a bare filename and no instruction (AC1), with this guard\n' +
    `  reporting the workflow well-formed.\n${SCOPING_ADVICE}`
  )
}

function earlyStepProblem(early: FailurePathStep[], id: string, checkIndex: number): string {
  return (
    `${early.length} failure-path step(s) sit BEFORE the \`pnpm ${FORMAT_CHECK_SCRIPT}\` step\n` +
    `  (index ${early.map(step => step.index).join(', ')} against ${checkIndex}). \`steps.${id}.outcome\` is empty while that\n` +
    '  step has not run yet, so the condition is false on EVERY run and the remedy never fires: a red\n' +
    '  check hands the contributor a bare filename and no instruction (AC1), with this guard\n' +
    `  reporting the workflow well-formed.\n${SCOPING_ADVICE}`
  )
}

/** The checking step's `id:`, when it is one a `steps.<id>` reference can name. */
function checkStepId(check: Mapping): string | null {
  const id = textAt(check, 'id')
  return id !== undefined && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(id) ? id : null
}

function remedyScopeProblems(jobs: Job[]): string[] {
  const host = hostJob(jobs)
  if (host === undefined) return []
  const checkIndex = host.steps.findIndex(runsFormatCheck)
  const check = host.steps[checkIndex]
  if (check === undefined) return []

  const id = checkStepId(check)
  if (id === null) {
    return [
      `the \`pnpm ${FORMAT_CHECK_SCRIPT}\` step declares no usable \`id:\`, so the remedy cannot be scoped to\n` +
        '  it. A bare `if: failure()` fires when ANY step failed — a broken `pnpm install` would be\n' +
        '  annotated "not formatted", sending the contributor to run `pnpm format` against a cause it\n' +
        `  cannot fix.\n${SCOPING_ADVICE}`,
    ]
  }

  // No failure-path step at all is `remedyProblems`' finding, not this one.
  const failurePath = failurePathSteps(jobs, host.name, checkIndex)
  // Four buckets, not two, and they partition the failure path: a condition that NAMES
  // the checking step but compares it to the wrong outcome is neither unscoped (the
  // author did scope it) nor scoped (it resolves false on the failure path); one that
  // carries the right comparison inside a disjunction or a negation is neither of those
  // either (the comparison is correct, it just decides nothing). Reporting any of them
  // as another names a cause the author already got right.
  const unscoped = failurePath.filter(step => !referencesCheck(step.condition, id))
  const compared = failurePath.filter(step => scopesTo(step.condition, id))
  const scoped = compared.filter(step => decides(step.condition, id))
  const neutralized = compared.filter(step => !decides(step.condition, id))
  const miscompared = failurePath.filter(
    step => referencesCheck(step.condition, id) && !scopesTo(step.condition, id),
  )
  const foreign = scoped.filter(step => step.job !== host.name)
  const early = scoped.filter(step => step.job === host.name && step.index < checkIndex)

  return [
    ...(unscoped.length > 0 ? [unscopedProblem(unscoped)] : []),
    ...(miscompared.length > 0 ? [miscomparedProblem(miscompared, id)] : []),
    ...(neutralized.length > 0 ? [neutralizedProblem(neutralized, id)] : []),
    ...(foreign.length > 0 ? [foreignJobProblem(foreign, id, host.name)] : []),
    ...(early.length > 0 ? [earlyStepProblem(early, id, checkIndex)] : []),
  ]
}

/**
 * The shell a step may run when it is neither the checking step nor a failure-path
 * remedy: the toolchain install, line by line. An ALLOW-list, like every other surface of
 * this workflow, and for the reason `with:` became one — a deny-list names FORMATTERS,
 * and the loss it guards has a shell spelling no formatter list can name. Measured on the
 * shipped file: `- name: Sync / run: git fetch origin main && git checkout origin/main
 * -- .` before `Check formatting` → ok=true; `run: pnpm install && find . -name '*.ts'
 * -not -path './node_modules/*' -delete` → ok=true. Each makes `pnpm format:check` run on
 * a tree that is not the PR's (`git checkout <ref> -- .` overwrites every tracked file
 * with `<ref>`'s version; `find -delete` removes them — both measured in a scratch repo),
 * which is the identical AC2 loss `with: ref: main` produced on GitHub (run 33635537234:
 * `format` SUCCESS on an unformatted PR) and that `checkoutInputProblems` closed by
 * allow-list.
 *
 * The workflow has exactly two such commands: `pnpm install` (flags only — a positional
 * argument is `pnpm add`, which edits `package.json`) and the corepack fallback, whose
 * lines are listed one by one.
 */
export const SETUP_COMMAND_LINES: readonly RegExp[] = [
  /^pnpm install(?:\s+--?[A-Za-z][\w-]*(?:=\S+)?)*$/,
  /^if ! command -v pnpm >\/dev\/null 2>&1; then$/,
  /^echo (["'])[^"'$`]*\1$/,
  /^corepack enable(?: \|\| true)?$/,
  /^corepack prepare pnpm@[\w.-]+ --activate(?: \|\| true)?$/,
  /^fi$/,
]

/**
 * The shell a FAILURE-PATH step may run: a quoted `echo`/`printf` and nothing else.
 *
 * This was the module's last deny-list, and it fell to its own argument. The remedy's
 * body was scanned for write-mode FORMATTERS, so a formatter no list names walked past
 * it: `npx dprint fmt`, and `git commit -am style && git push` beside the required
 * `pnpm format` message, were both `ok=true` on the shipped file. (Neither loss was
 * REALIZABLE — `permissions: contents: read` is allow-listed and enforced, and a `${{
 * secrets.* }}` in a `run:` is rejected, so the push could not land — but "the next
 * formatting action published walks through" is exactly the argument that retired the
 * `uses:` and `with:` deny-lists, and it does not stop applying because a second rule
 * happens to cover this one.)
 *
 * The remedy SAYS something; it does not DO anything. `stripQuotedMessages` already
 * draws that line for the write scan, and this is the same line drawn as an allow-list:
 * an `echo`/`printf` whose arguments are quoted and carry no `$` or backtick — i.e. no
 * substitution, no command — plus nothing else on the line.
 */
export const REMEDY_COMMAND_LINES: readonly RegExp[] = [
  /^echo(?:\s+-[A-Za-z]+)*\s+"[^"$`]*"$/,
  /^echo(?:\s+-[A-Za-z]+)*\s+'[^'$`]*'$/,
  /^printf(?:\s+-[A-Za-z]+)*(?:\s+(?:"[^"$`]*"|'[^'$`]*'))+$/,
]

function matchesEvery(run: string, patterns: readonly RegExp[]): boolean {
  return run
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '')
    .every(line => patterns.some(pattern => pattern.test(line)))
}

/** A step that is neither the checking step nor a `failure()`-guarded remedy. */
function isSetupStep(step: Mapping): boolean {
  return !runsFormatCheck(step) && !isFailurePathStep(step)
}

function shellProblems(jobs: Job[]): string[] {
  const problems: string[] = []
  for (const job of jobs) {
    for (const step of job.steps) {
      if (runsFormatCheck(step)) continue
      const setup = isSetupStep(step)
      const patterns = setup ? SETUP_COMMAND_LINES : REMEDY_COMMAND_LINES
      const foreign = runsOf(step).filter(run => !matchesEvery(run, patterns))
      if (foreign.length === 0) continue
      const listed = foreign.join(' ⏎ ').replace(/\n/g, ' ⏎ ')
      problems.push(
        setup
          ? `a step in job \`${job.name}\` runs \`${listed}\`: outside the checking\n` +
              '  step and its failure-path remedy, the only shell this workflow runs is the toolchain install —\n' +
              '  `pnpm install` (flags only) and the corepack fallback (`if ! command -v pnpm …; then`, a quoted\n' +
              '  `echo`, `corepack enable`, `corepack prepare pnpm@<v> --activate`, `fi`). Anything else is a way\n' +
              "  to change WHAT `pnpm format:check` runs on: `git checkout origin/main -- .` overwrites the PR's\n" +
              "  files with `main`'s, `find … -delete` removes them — either makes the check pass on a tree that\n" +
              "  is not the PR's, the AC2 loss measured with `with: ref: main`, and neither is a formatter a\n" +
              '  deny-list could name. A new command is a deliberate edit to `SETUP_COMMAND_LINES`.'
          : `a failure-path step in job \`${job.name}\` runs \`${listed}\`: the remedy SAYS what to run, it\n` +
              '  does not run anything. Its shell is an allow-list of quoted `echo`/`printf` lines carrying no\n' +
              '  `$` and no backtick — no substitution, no second command. A deny-list of formatters waved\n' +
              '  through `npx dprint fmt` and a `git commit -am style && git push` beside the required `pnpm\n' +
              '  format` message, which is the same "the next one published walks through" that retired the\n' +
              '  `uses:` and `with:` deny-lists. A new command is a deliberate edit to `REMEDY_COMMAND_LINES`.',
      )
    }
  }
  return problems
}

/**
 * Quoted arguments to `echo`/`printf` are DATA, not commands: the failure-path
 * remedy has to say `pnpm format` and must not be read as running it. Only inert
 * quotes are removed — a quoted string containing `$` or a backtick can still
 * execute (`echo "$(prettier --write .)"` really does write), so those stay in
 * scope for the command scans, as does anything outside an echo.
 */
function stripQuotedMessages(command: string): string {
  return command.replace(
    /\b(echo|printf)\b((?:\s+(?:-[A-Za-z]+|"[^"\n]*"|'[^'\n]*'))+)/g,
    (_match, verb: string, args: string) => verb + args.replace(/"[^"\n$`]*"|'[^'\n$`]*'/g, ''),
  )
}

/**
 * What the steps actually execute: the right command, in check mode, with no
 * credential and no shell-injection sink. Asserted against the `run:` blocks
 * only, so an expression in `concurrency.group` is not mistaken for one expanded
 * into a shell.
 */
function stepProblems(root: Mapping, jobs: Job[], rootScripts: Record<string, string>): string[] {
  const problems: string[] = []
  const rawRuns = allSteps(jobs).flatMap(runsOf)
  // What each step COMMANDS, with inert quoted messages removed. The injection scan
  // below deliberately keeps reading the raw text: `echo "${{ github.event.pull_request.title }}"`
  // is the classic sink precisely BECAUSE it is quoted and echoed.
  const runs = rawRuns.map(stripQuotedMessages)
  const allRuns = runs.join('\n')

  if (!runs.some(run => referencesScript(run, FORMAT_CHECK_SCRIPT))) {
    problems.push(
      `no step RUNS \`pnpm ${FORMAT_CHECK_SCRIPT}\`. CI must invoke the identical script a developer\n` +
        '  runs — a CI-only flag, path list or re-implementation recreates the local/CI divergence\n' +
        '  this workflow exists to close.',
    )
  }

  const offenders = findWriteModeFormatters(expandScriptReferences(rootScripts, allRuns))
  if (offenders.length > 0) {
    problems.push(
      `reaches ${offenders.length} step(s) that WRITE files: ${offenders.join(', ')}.\n` +
        '  CI reports, it never repairs: an auto-formatted commit from CI is the same defect as a\n' +
        '  write-mode pre-push hook, one layer up (ADL 2026-07-31).',
    )
  }

  if (/\$\{\{/.test(rawRuns.join('\n'))) {
    problems.push(
      'interpolates a `${{ ... }}` expression into a `run:` block. On a fork PR that text is\n' +
        '  attacker-controlled and is expanded into the shell BEFORE it runs — pass it through `env:`\n' +
        '  instead, or drop it.',
    )
  }

  if (everyText(root).some(text => /\bsecrets\s*[.:]/.test(text))) {
    problems.push(
      'reads a secret. A fork PR must be a full-strength run with no credential in reach: nothing\n' +
        '  here needs one, so having one is pure exposure.',
    )
  }

  return problems
}

/**
 * Checks the format workflow's shape. `rootScripts` is injected so the check is
 * testable, and defaults to this repo's real scripts because the decisive
 * regression (`pnpm format` in place of `pnpm format:check`) is only visible once
 * the delegation is expanded against them.
 *
 * Reports EVERY problem it finds rather than the first, so a partial fix cannot
 * look clean.
 */
export function checkFormatWorkflow(
  yamlText: string,
  rootScripts: Record<string, string> = readRootScripts(),
): GateCheckResult {
  if (yamlText.trim() === '') {
    return {
      ok: false,
      message:
        'No format workflow. Without it `pnpm format:check` is enforced by the pre-push hook only,\n' +
        'which `--no-verify` and an uninstalled hook both skip (#413).',
    }
  }

  const parsed = parseWorkflow(yamlText)
  if (parsed.problem !== undefined) return report([parsed.problem])
  const root = parsed.root ?? {}
  const jobs = jobsOf(root)

  const problems = [
    ...workflowKeyProblems(root),
    ...jobKeyProblems(jobs),
    ...runsOnProblems(jobs),
    ...stepShapeProblems(jobs),
    ...triggerProblems(root),
    ...concurrencyProblems(root),
    ...jobIdentityProblems(jobs),
    ...jobProblems(root, jobs),
    ...usesProblems(jobs),
    ...stepProblems(root, jobs, rootScripts),
    ...shellProblems(jobs),
    ...checkCommandProblems(jobs),
    ...checkStepKeyProblems(jobs),
    ...defaultsProblems(root, jobs),
    ...remedyProblems(jobs),
    ...remedyScopeProblems(jobs),
  ]

  if (problems.length === 0) {
    return { ok: true, message: '.github/workflows/format.yml checks formatting on every PR.' }
  }
  return report(problems)
}

function report(problems: string[]): GateCheckResult {
  return {
    ok: false,
    message:
      `.github/workflows/format.yml (#413) — ${problems.length} problem(s):\n` +
      problems.map(problem => `- ${problem}`).join('\n'),
  }
}

/**
 * The one parse. `yaml@2.8.2` resolves anchors, aliases, flow and block style, JSON
 * spellings, indentless sequences and CRLF to the document GitHub runs — and REFUSES a
 * file it cannot resolve unambiguously (a duplicate key, a tab indent), which is where
 * this guard's fail-closed direction now lives. A merge key (`<<: *base`) is left
 * unmerged by default and surfaces as a literal `<<` key, which the workflow/job
 * allow-lists reject — matching GitHub, which fails the run outright on it (probe run
 * 33724280781 on PR #477: zero jobs, invalid workflow file).
 */
function parseProblem(cause: string): string {
  return (
    `is not valid YAML (${cause.split('\n')[0] ?? cause}). A file the parser cannot\n` +
    '  resolve is a file whose shape nothing here can assert, so it is rejected rather than guessed at\n' +
    '  — and GitHub would refuse to run it too.'
  )
}

function parseWorkflow(yamlText: string): { root?: Mapping; problem?: string } {
  const document = parseDocument(yamlText, { prettyErrors: false })
  let root: unknown
  // `toJS()` is where an UNRESOLVED alias throws (`*nowhere` with no `&nowhere`): the
  // parse itself reports no error, so the fail-closed direction has to cover both.
  try {
    root = document.errors.length > 0 ? undefined : document.toJS()
  } catch (error) {
    return { problem: parseProblem(error instanceof Error ? error.message : String(error)) }
  }
  const failure = document.errors[0]
  if (failure !== undefined) {
    return { problem: parseProblem(failure.message.split('\n')[0] ?? failure.name) }
  }
  if (!isMapping(root)) {
    return {
      problem:
        'does not parse to a mapping of workflow keys (`on:`, `jobs:`, …), so it declares no trigger and\n' +
        '  no job at all.',
    }
  }
  return { root }
}

/** Reads THIS repo's format workflow and checks its composition. */
export function checkThisRepoFormatWorkflow(): GateCheckResult {
  let text: string
  try {
    text = readFileSync(FORMAT_WORKFLOW, 'utf-8')
  } catch {
    text = ''
  }
  return checkFormatWorkflow(text)
}

/**
 * Thin CLI wrapper (the ADR-014 shape, same as `pre-push-gate-composition`): print the
 * report and set the exit code. Wired as `@pair/dev-tools format-workflow:check`, which the
 * root `gate:composition` runs beside `pre-push-gate:check` — so AC6's "guarded by `pnpm
 * gate:composition`" is literally true and the guard reports as its own gate line. The
 * `$TURBO_ROOT$` input on `@pair/dev-tools#test` is still what keeps `pnpm test` honest
 * locally (ADL 2026-09-01-repo-wide-guard-enforced-by-turbo-root-input); this is the
 * second enforcement point, not a replacement.
 */
export function main(): void {
  const result = checkThisRepoFormatWorkflow()
  if (!result.ok) {
    console.error(`\n❌ format workflow composition\n\n${result.message}\n`)
    process.exit(1)
  }
  console.log(`✓ format workflow composition: ${result.message}`)
}

if (require.main === module) {
  main()
}
