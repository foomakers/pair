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
 * - `pull_request_target` instead of `pull_request`, which hands the base repo's
 *   credentials to a fork's head commit.
 * - a write-mode formatter, or a formatting auto-commit. The ADL 2026-07-31 ban
 *   ("the gate reports, the developer fixes deliberately") is repo-wide, not
 *   hook-specific — CI repairing the branch is the same defect one layer up.
 * - dropping `push: main`, so drift on the base branch is invisible.
 * - dropping `concurrency`, so `push` + `pull_request` double-report one head.
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

/**
 * The branch names a trigger block filters on: `branches: [main]` and the block
 * list spelling both. `null` means the block declares no filter at all (GitHub
 * then runs it on every branch, which still covers the base branch).
 */
function branchesOf(block: string[]): string[] | null {
  const index = block.findIndex(line => /^\s*branches:/.test(line))
  const header = index === -1 ? undefined : block[index]
  if (header === undefined) return null
  const inline = header.replace(/^\s*branches:\s*/, '').trim()
  if (inline.startsWith('[')) {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(item => item !== '')
  }
  const indent = indentOf(header)
  const items: string[] = []
  for (const line of block.slice(index + 1)) {
    if (line.trim() === '') continue
    if (indentOf(line) <= indent) break
    const item = /^\s*-\s*(.+)$/.exec(line)
    if (item?.[1] !== undefined) items.push(item[1].trim().replace(/^['"]|['"]$/g, ''))
  }
  return items
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

/**
 * Trigger-shaped holes: the events the workflow reacts to, and the paths it
 * silently excludes from them. This is the story's whole point — a check whose
 * TRIGGER has a gap reads as enforcement and is not.
 */
function triggerProblems(clean: string, lines: string[]): string[] {
  const problems: string[] = []

  if (/\bpull_request_target\b/.test(clean)) {
    problems.push(
      'uses `pull_request_target`: that event runs with the BASE repository token against a fork\n' +
        '  head. Use `pull_request` — this job needs no credential at all.',
    )
  }

  if (/^\s*(?:-\s+)?paths-ignore:/m.test(clean)) {
    problems.push(
      'declares `paths-ignore`: trigger coverage IS check coverage. A path the trigger skips is a\n' +
        '  path the formatting check does not exist for — which is why this is a dedicated workflow\n' +
        "  and not a job inside ci.yml (whose workflow-level `paths-ignore: ['.changeset/**']` a job\n" +
        '  would inherit).',
    )
  }

  const on = blockUnder(lines, 'on', 0)
  if (on === null) return [...problems, 'has no `on:` block, so it never runs.']

  const triggerIndent = keyIndent(on)
  if (blockUnder(on, 'pull_request', triggerIndent) === null) {
    problems.push(
      'has no `pull_request` trigger: the check would not run where a change is reviewed.',
    )
  }

  const push = blockUnder(on, 'push', triggerIndent)
  if (push === null) {
    return [
      ...problems,
      `has no \`push\` trigger: formatting drift on \`${BASE_BRANCH}\` would be invisible after a merge.`,
    ]
  }

  const branches = branchesOf(push)
  if (branches !== null && !branches.includes(BASE_BRANCH)) {
    problems.push(
      `the \`push\` trigger does not cover \`${BASE_BRANCH}\` (${branches.join(', ') || 'no branch'}),\n` +
        '  so post-merge drift on the base branch goes unreported.',
    )
  }
  return problems
}

/** `push` + `pull_request` fire on the same head after a merge — collapse them. */
function concurrencyProblems(lines: string[]): string[] {
  const concurrency = blockUnder(lines, 'concurrency', 0)
  if (concurrency === null) {
    return [
      'declares no `concurrency` group: `push` and `pull_request` both fire on the same head, so the\n' +
        '  workflow reports twice for one commit.',
    ]
  }
  if (!/cancel-in-progress:\s*true\b/.test(concurrency.join('\n'))) {
    return [
      'the `concurrency` group does not set `cancel-in-progress: true`, so a superseded run keeps\n' +
        '  burning a runner and reporting a stale verdict.',
    ]
  }
  return []
}

/**
 * What the steps actually execute: the right command, in check mode, with no
 * credential and no shell-injection sink. Asserted against the `run:` blocks
 * only, so an expression in `concurrency.group` is not mistaken for one expanded
 * into a shell.
 */
function stepProblems(clean: string, rootScripts: Record<string, string>): string[] {
  const problems: string[] = []
  const runs = extractRunBlocks(clean)
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

  if (/\$\{\{/.test(allRuns)) {
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
    ...stepProblems(clean, rootScripts),
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
