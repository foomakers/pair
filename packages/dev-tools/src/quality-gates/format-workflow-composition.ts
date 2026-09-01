/**
 * format-workflow-composition — keeps CI's formatting check real (story #413).
 *
 * Since #394 the pre-push hook CHECKS formatting instead of applying it, which is
 * the right shape for a hook — but it left the local hook as the ONLY enforcement
 * point. `--no-verify`, or a contributor whose hooks are not installed, lands
 * unformatted code with every CI check green. `.github/workflows/format.yml` is
 * the fix; this module is what stops that fix from quietly decaying.
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
 * - a trigger narrowed off the base branch (`pull_request.branches: [release]`) or
 *   off the events that matter (`types: [closed]` runs the check only once the PR
 *   is closed). Whatever shapes the trigger shapes the coverage.
 * - `pull_request_target` instead of `pull_request`, which hands the base repo's
 *   credentials to a fork's head commit.
 * - a write-mode formatter, or a formatting auto-commit. The ADL 2026-07-31 ban
 *   ("the gate reports, the developer fixes deliberately") is repo-wide, not
 *   hook-specific — CI repairing the branch is the same defect one layer up.
 * - dropping `push: main`, so drift on the base branch is invisible.
 * - dropping `concurrency`, so a superseded run keeps burning a runner and
 *   reporting a stale verdict for a ref that has already moved on.
 * - `continue-on-error: true`, `if: false`, or a write-scoped `permissions:` on the
 *   job. None of these touch a trigger or a step COMMAND, yet each turns the
 *   `format` context into one that cannot fail, never runs, or hands a
 *   write-scoped token to a job that executes PR-authored lifecycle scripts
 *   (`pnpm install`). AC5's "safe on fork PRs by construction, not by review" is
 *   only construction if the construction is asserted.
 * - dropping the failure-path remedy. `--list-different` prints the offending file
 *   and suppresses prettier's own "run with --write to fix" line, so a red check
 *   without that step hands the contributor this story exists for — hooks not
 *   installed, pushed with `--no-verify` — a bare filename and no instruction
 *   (AC1).
 *
 * Structure is asserted, never exact file text: comments, step names and action
 * versions must be editable without false-failing this guard.
 *
 * WRITE-MODE DETECTION IS NOT RE-IMPLEMENTED. `findWriteModeFormatters` and the
 * transitive `expandScriptReferences` come from the pre-push guard next door — the
 * workflow says `pnpm format:check`, so scanning its literal text would miss the
 * likeliest regression (`pnpm format`, which only resolves to `prettier:fix`
 * through the root scripts). Two copies of that offender list would drift, and the
 * one that drifts is always the one guarding the newer surface.
 *
 * Per the gate-tooling ADL (2026-07-13) the logic lives here as a tested module.
 * There is no CLI: unlike its siblings, this guard's only enforcement point is
 * `pnpm test`, and turbo's cache is handled by the `$TURBO_ROOT$` input entry on
 * `@pair/dev-tools#test` (turbo.json) — the same treatment `@pair/knowledge-hub#test`
 * already uses for repo-wide artifacts.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

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
 * The `pull_request` activity types the check must keep covering. GitHub's default
 * is `[opened, synchronize, reopened]`; a narrowing that keeps `reopened` but drops
 * either of these two runs the check where it cannot influence a review.
 */
export const REQUIRED_PR_TYPES = ['opened', 'synchronize'] as const

/**
 * Removes `#` comments so a comment can neither smuggle a banned pattern in nor
 * trip the guard by merely mentioning one. Naive by design (a `#` inside a shell
 * string would be cut too): this file is ours, and the alternative is a YAML+shell
 * parser for a twenty-line workflow.
 */
function stripComments(yamlText: string): string {
  return yamlText
    .split('\n')
    .map(line => line.replace(/(^|\s)#.*$/, '$1'))
    .join('\n')
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

/**
 * The lines under `key:` at the given indent — i.e. every following line indented
 * deeper, stopping at the first sibling or ancestor key. Blank lines inside the
 * block are kept, so a `concurrency:` block separated by one is not truncated.
 */
function blockUnder(lines: string[], key: string, indent: number): string[] | null {
  const header = new RegExp(`^ {${indent}}(?:['"]?${key}['"]?):`)
  const start = lines.findIndex(line => header.test(line))
  if (start === -1) return null
  const body: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') {
      body.push(line)
      continue
    }
    if (indentOf(line) <= indent) break
    body.push(line)
  }
  return body
}

/** The smallest indent among a block's non-empty lines — its own key level. */
function keyIndent(block: string[]): number {
  const indents = block.filter(line => line.trim() !== '').map(indentOf)
  return indents.length === 0 ? 0 : Math.min(...indents)
}

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

/**
 * The values a list-valued key holds inside a block: `key: [a, b]` and the block
 * sequence spelling both. `null` means the key is absent — for a trigger filter
 * that means "no filter", which GitHub reads as "every value", so callers treat
 * `null` as covering everything.
 */
function listValueOf(block: string[], key: string): string[] | null {
  const index = block.findIndex(line => new RegExp(`^\\s*${key}:`).test(line))
  const header = index === -1 ? undefined : block[index]
  if (header === undefined) return null
  const inline = header.replace(new RegExp(`^\\s*${key}:\\s*`), '').trim()
  if (inline.startsWith('[')) {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(unquote)
      .filter(item => item !== '')
  }
  const indent = indentOf(header)
  const items: string[] = []
  for (const line of block.slice(index + 1)) {
    if (line.trim() === '') continue
    if (indentOf(line) <= indent) break
    const item = /^\s*-\s*(.+)$/.exec(line)
    if (item?.[1] !== undefined) items.push(unquote(item[1]))
  }
  return items
}

/** The branch names a trigger block filters on. `null` — no filter, so all of them. */
function branchesOf(block: string[]): string[] | null {
  return listValueOf(block, 'branches')
}

/** Every job in the workflow, by name, with its own body lines. */
function jobsOf(lines: string[]): { name: string; body: string[] }[] {
  const jobs = blockUnder(lines, 'jobs', 0)
  if (jobs === null) return []
  const indent = keyIndent(jobs)
  const header = new RegExp(`^ {${indent}}(['"]?)([A-Za-z0-9_-]+)\\1:`)
  return jobs
    .map(line => header.exec(line)?.[2])
    .filter((name): name is string => name !== undefined)
    .map(name => ({ name, body: blockUnder(jobs, name, indent) ?? [] }))
}

/**
 * A job's steps, one array of lines each. Split on the list markers at the steps
 * block's own indent, so a `- ` inside a nested `with:` or a block scalar does not
 * start a phantom step.
 */
function stepsOf(job: string[]): string[][] {
  const steps = blockUnder(job, 'steps', keyIndent(job))
  if (steps === null) return []
  const itemIndent = keyIndent(steps)
  const parsed: string[][] = []
  let current: string[] | null = null
  for (const line of steps) {
    if (line.trim() !== '' && indentOf(line) === itemIndent && /^\s*-\s/.test(line)) {
      current = []
      parsed.push(current)
    }
    current?.push(line)
  }
  return parsed
}

/**
 * Every shell command the workflow executes: inline `run: cmd` and block scalars
 * (`run: |`) alike. What a step DOES lives here — the security and check-only
 * rules are asserted against these, not against the whole file, so an expression
 * in `concurrency.group` is not confused with one expanded into a shell.
 */
/** A block scalar's body (trimmed lines) and the index of the line that ended it. */
function readBlockScalar(lines: string[], from: number, indent: number): [string, number] {
  const body: string[] = []
  let i = from
  for (; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.trim() === '') {
      body.push('')
      continue
    }
    if (indentOf(line) <= indent) break
    body.push(line.trim())
  }
  return [body.join('\n').trim(), i]
}

/** A `run:` line's own indent (past any `- ` list marker) and its inline remainder. */
function runHeader(line: string): { indent: number; inline: string } | null {
  const match = /^(\s*)(-\s+)?run:(.*)$/.exec(line)
  if (match === null) return null
  return {
    indent: (match[1]?.length ?? 0) + (match[2]?.length ?? 0),
    inline: (match[3] ?? '').trim(),
  }
}

/** `|`, `>`, `|-`, `>2` … all mean "the body is on the following lines", not a command. */
function isInlineCommand(remainder: string): boolean {
  return remainder !== '' && !/^[|>][-+]?\d*$/.test(remainder)
}

export function extractRunBlocks(yamlText: string): string[] {
  const lines = stripComments(yamlText).split('\n')
  const blocks: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const header = runHeader(lines[i] ?? '')
    if (header === null) continue
    if (isInlineCommand(header.inline)) {
      blocks.push(header.inline)
      continue
    }
    const [body, end] = readBlockScalar(lines, i + 1, header.indent)
    blocks.push(body)
    i = end - 1
  }
  return blocks
}

/** The root scripts a `pnpm <script>` step delegates through. */
export function readRootScripts(): Record<string, string> {
  const pkg = JSON.parse(readFileSync(ROOT_PACKAGE_JSON, 'utf-8')) as {
    scripts?: Record<string, string>
  }
  return pkg.scripts ?? {}
}

/** A trigger block that does not cover the base branch reports on nothing that merges. */
function baseBranchProblems(event: string, block: string[]): string[] {
  const branches = branchesOf(block)
  if (branches === null || branches.includes(BASE_BRANCH)) return []
  return [
    `the \`${event}\` trigger does not cover \`${BASE_BRANCH}\` (${branches.join(', ') || 'no branch'}),\n` +
      `  so a change landing on the base branch is never checked through \`${event}\`.`,
  ]
}

/**
 * A `types:` narrowing on `pull_request`. `types: [closed]` is a one-line edit that
 * leaves a green `format` context on every PR — the run simply happens after the
 * PR is closed, where nobody is reading it.
 */
function activityTypeProblems(pullRequest: string[]): string[] {
  const types = listValueOf(pullRequest, 'types')
  if (types === null) return []
  const missing = REQUIRED_PR_TYPES.filter(type => !types.includes(type))
  if (missing.length === 0) return []
  return [
    `the \`pull_request\` trigger narrows \`types:\` to [${types.join(', ')}], dropping ${missing.join(', ')}:\n` +
      '  the check would not run while the PR is open and reviewable.',
  ]
}

/**
 * Trigger-shaped holes: the events the workflow reacts to, the branches and
 * activity types it filters them down to, and the paths it silently excludes. This
 * is the story's whole point — a check whose TRIGGER has a gap reads as enforcement
 * and is not, and EVERY key that shapes the trigger is part of that gap, not just
 * the one this story happened to start from.
 */
function triggerProblems(clean: string, lines: string[]): string[] {
  const problems: string[] = []

  if (/\bpull_request_target\b/.test(clean)) {
    problems.push(
      'uses `pull_request_target`: that event runs with the BASE repository token against a fork\n' +
        '  head. Use `pull_request` — this job needs no credential at all.',
    )
  }

  // `paths-ignore` and `paths` are the deny-list and allow-list spelling of one
  // hole: an allow-list excludes everything it does not name, so `paths: ['**/*.ts']`
  // leaves a markdown-only or `.changeset`-only PR with no formatting check at all.
  const pathFilter = /^\s*(?:-\s+)?(paths-ignore|paths):/m.exec(clean)
  if (pathFilter !== null) {
    problems.push(
      `declares \`${pathFilter[1]}\`: trigger coverage IS check coverage. A path the trigger skips —\n` +
        '  whether skipped by exclusion (`paths-ignore`) or by omission from an allow-list (`paths`) —\n' +
        '  is a path the formatting check does not exist for. This is why the check is a dedicated\n' +
        "  workflow and not a job inside ci.yml, whose workflow-level `paths-ignore: ['.changeset/**']`\n" +
        '  a job would inherit. `pnpm format:check` costs one cold install; scoping it saves nothing\n' +
        '  worth a hole.',
    )
  }

  const on = blockUnder(lines, 'on', 0)
  if (on === null) return [...problems, 'has no `on:` block, so it never runs.']

  const triggerIndent = keyIndent(on)
  const pullRequest = blockUnder(on, 'pull_request', triggerIndent)
  if (pullRequest === null) {
    problems.push(
      'has no `pull_request` trigger: the check would not run where a change is reviewed.',
    )
  } else {
    problems.push(
      ...baseBranchProblems('pull_request', pullRequest),
      ...activityTypeProblems(pullRequest),
    )
  }

  const push = blockUnder(on, 'push', triggerIndent)
  if (push === null) {
    return [
      ...problems,
      `has no \`push\` trigger: formatting drift on \`${BASE_BRANCH}\` would be invisible after a merge.`,
    ]
  }
  return [...problems, ...baseBranchProblems('push', push)]
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
 * Which is exactly why an UNCONDITIONAL cancel is wrong here: two merges to
 * `${BASE_BRANCH}` a minute apart share `format-refs/heads/main`, so the first
 * commit's run is cancelled and that commit carries no formatting verdict at all —
 * a dent in AC7's "drift on the base branch is visible". So the accepted spellings
 * are a literal `true` (cancel everywhere) or an expression conditioned on the
 * `pull_request` event (cancel on PRs, queue on the base branch, which is the
 * shipped choice); anything that cancels nothing on a PR is the dropped mitigation.
 */
function concurrencyProblems(lines: string[]): string[] {
  const concurrency = blockUnder(lines, 'concurrency', 0)
  if (concurrency === null) {
    return [
      'declares no `concurrency` group: every superseded run keeps burning a runner and reporting a\n' +
        '  stale verdict for a ref that has already moved on.',
    ]
  }
  const value = /cancel-in-progress:\s*(.+)$/m.exec(concurrency.join('\n'))?.[1]?.trim()
  if (value === undefined) {
    return [
      'the `concurrency` group does not set `cancel-in-progress`, so a superseded run keeps burning\n' +
        '  a runner and reporting a stale verdict.',
    ]
  }
  if (value === 'true' || /\bpull_request\b/.test(value)) return []
  return [
    `the \`concurrency\` group sets \`cancel-in-progress: ${value}\`, which cancels nothing on a pull\n` +
      '  request: a superseded run keeps burning a runner and reporting a stale verdict. Use `true`,\n' +
      "  or an expression conditioned on the event (`${{ github.event_name == 'pull_request' }}`)\n" +
      `  so runs on \`${BASE_BRANCH}\` queue instead of cancelling each other's verdict.`,
  ]
}

/**
 * The token the job is handed. This job runs `pnpm install`, i.e. lifecycle scripts
 * authored by the pull request, so a write scope in reach of that is the whole of
 * AC5's exposure — and an omitted `permissions:` block silently inherits whatever
 * the repository default is (write, on a default-settings repo).
 */
function permissionProblems(name: string, body: string[]): string[] {
  const indent = keyIndent(body)
  const header = body.find(line => new RegExp(`^ {${indent}}permissions:`).test(line))
  if (header === undefined) {
    return [
      `job \`${name}\` declares no \`permissions:\`, so it silently inherits the repository default\n` +
        '  scope. It runs `pnpm install` — PR-authored lifecycle scripts — and needs nothing beyond\n' +
        '  `contents: read`.',
    ]
  }
  const inline = header.replace(/^\s*permissions:\s*/, '').trim()
  const scope = inline !== '' ? inline : (blockUnder(body, 'permissions', indent) ?? []).join('\n')
  if (!/\bwrite(?:-all)?\b/.test(scope)) return []
  return [
    `job \`${name}\` grants a WRITE scope in \`permissions:\`. A fork PR must be a full-strength run\n` +
      '  with nothing in reach: this job checks formatting and writes nothing, so any write scope is\n' +
      '  pure exposure to the lifecycle scripts `pnpm install` executes.',
  ]
}

/**
 * Job-level ways to keep the `format` context reporting while it can no longer
 * report red. Neither touches a trigger nor a step command, so every other rule in
 * this module stays green through them — and once branch protection requires
 * `format` (AC8), a required check that cannot fail is worse than no check, because
 * it is believed.
 */
function jobProblems(clean: string, lines: string[]): string[] {
  const problems: string[] = []

  const advisory = /^\s*continue-on-error:\s*(?!false\b)(\S+)/m.exec(clean)
  if (advisory !== null) {
    problems.push(
      `sets \`continue-on-error: ${advisory[1]}\`: the step fails and the job still reports SUCCESS, so\n` +
        '  the `format` context goes green on unformatted code. A check that cannot fail is not a check.',
    )
  }

  if (/^\s*if:\s*(?:false|'false'|"false"|\$\{\{\s*false\s*\}\})\s*$/m.test(clean)) {
    problems.push(
      'carries an unconditionally false `if:`: the job is skipped, and a skipped required check is\n' +
        '  reported as neutral — green enough to merge through.',
    )
  }

  for (const job of jobsOf(lines)) {
    problems.push(...permissionProblems(job.name, job.body))
  }
  return problems
}

/**
 * AC1: a failing check must name the offending file AND the remedy. `--list-different`
 * gives the file and suppresses prettier's own "Run Prettier with --write to fix"
 * line, so the remedy has to come from the workflow — and only on the failure path,
 * where it is read.
 *
 * Scanned as a MESSAGE, not a command: `pnpm format` is a write-mode formatter, so
 * the same literal is required here and banned three rules down. What separates them
 * is quoting — see `stripQuotedMessages`.
 */
const REMEDY_MENTION = new RegExp(`\\bpnpm ${REMEDY_SCRIPT}\\b(?![:\\w-])`)

function remedyProblems(lines: string[]): string[] {
  const failurePath = jobsOf(lines)
    .flatMap(job => stepsOf(job.body))
    .filter(step => step.some(line => /^\s*(?:-\s+)?if:.*\bfailure\(\)/.test(line)))
    .flatMap(step => extractRunBlocks(step.join('\n')))
    .join('\n')

  if (REMEDY_MENTION.test(failurePath)) return []
  return [
    `no failure-path step names the remedy (\`pnpm ${REMEDY_SCRIPT}\`). \`format:check\` lists the offending\n` +
      '  files and prettier\'s own "run with --write" hint is suppressed by `--list-different`, so a\n' +
      '  contributor whose hooks are not installed — the one this check exists for — reads a bare\n' +
      '  filename and no instruction. Add a step with `if: failure()` that echoes what to run.',
  ]
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
function stepProblems(clean: string, rootScripts: Record<string, string>): string[] {
  const problems: string[] = []
  const rawRuns = extractRunBlocks(clean)
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

  if (/\bsecrets\s*[.:]/.test(clean)) {
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

  const clean = stripComments(yamlText)
  const lines = clean.split('\n')
  const problems = [
    ...triggerProblems(clean, lines),
    ...concurrencyProblems(lines),
    ...jobProblems(clean, lines),
    ...stepProblems(clean, rootScripts),
    ...remedyProblems(lines),
  ]

  if (problems.length === 0) {
    return { ok: true, message: '.github/workflows/format.yml checks formatting on every PR.' }
  }
  return {
    ok: false,
    message:
      `.github/workflows/format.yml (#413) — ${problems.length} problem(s):\n` +
      problems.map(problem => `- ${problem}`).join('\n'),
  }
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
