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
 * - a trigger narrowed off the base branch (`pull_request.branches: [release]`, or
 *   its negative spelling `branches-ignore: [main]`) or off the events that matter
 *   (`types: [closed]` runs the check only once the PR is closed). Whatever shapes
 *   the trigger shapes the coverage.
 * - `pull_request_target` instead of `pull_request`, which hands the base repo's
 *   credentials to a fork's head commit.
 * - a trigger key respelled as a FLOW mapping. Every trigger rule above reads a
 *   BLOCK mapping, so `pull_request: { branches: [main], paths-ignore: ['**\/*.md'] }`
 *   — valid YAML GitHub honours — yields an empty block, every filter inside it reads
 *   as "absent, therefore no filter", and the four holes above walk through the one
 *   spelling nobody wrote a rule for. Flow mappings are REJECTED, not parsed
 *   (`flowStyleProblems`).
 * - the same spelling one level down, on a step. A step is a sequence ITEM, not a
 *   mapping key, so `- { name: Fix, run: npx prettier --write . }` slipped past the
 *   key-level sweep AND past both readers that look inside a step: `scalarAt(step,
 *   'uses', …)` and `extractRunBlocks` each want their key at line start, and neither
 *   finds one. Placed before the checking step that item rewrites the checkout while
 *   invisible to `usesProblems` and to the write-mode scan at once. Only a BLOCK
 *   MAPPING item is read; flow, JSON, anchored, aliased and off-line items are
 *   rejected (`relocationProblems`).
 * - a write-mode formatter, or a formatting auto-commit. The ADL 2026-07-31 ban
 *   ("the gate reports, the developer fixes deliberately") is repo-wide, not
 *   hook-specific — CI repairing the branch is the same defect one layer up.
 * - the same write, spelled `uses:` instead of `run:`. The write-mode scan reads
 *   `run:` blocks, so a formatting ACTION was invisible to it — and placed before the
 *   checking step it needs no permission at all, because it never pushes. Hence an
 *   allow-list of the three actions this job needs (`usesProblems`).
 * - a checking command that is not THE command. "Some run block references the
 *   script" was satisfied by `pnpm --filter=<pkg> format:check` and by `cd <dir> &&
 *   pnpm format:check`, each making CI check a strict subset of the tree the developer
 *   and the hook check — AC4's divergence, reinstated green. The command is an
 *   equality (`checkCommandProblems`).
 * - the job that RUNS the check renamed, or displaced by a decoy. The job id IS the
 *   status context: `format` is what way-of-working requires and what AC8 tells branch
 *   protection to list, so `fmt:` deletes the context without touching a rule — and a
 *   `format:` job that only echoes, beside a `worker:` job carrying the real steps,
 *   reports SUCCESS in that context after an echo. Asserted on the HOST job, never on
 *   the set of job names (`jobIdentityProblems`).
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
 *   when the check fails — the same never-firing remedy from a one-token edit.
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
 * The job id, which IS the status context GitHub publishes. way-of-working documents
 * `format` as the required check and AC8 names it as the context branch protection
 * must list, so renaming the job deletes that context without touching a rule.
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
 * The `pull_request` activity types the check must keep covering. GitHub's default
 * is `[opened, synchronize, reopened]`; a narrowing that keeps `reopened` but drops
 * either of these two runs the check where it cannot influence a review.
 */
export const REQUIRED_PR_TYPES = ['opened', 'synchronize'] as const

/**
 * Removes `#` comments so a comment can neither smuggle a banned pattern in nor
 * trip the guard by merely mentioning one — but only a `#` that is OUTSIDE quotes.
 *
 * The unconditional cut this replaces ran the wrong way. `#` inside quotes is not a
 * comment to bash (inside a `run: |` block scalar) nor to YAML (inside a quoted
 * scalar), so `echo "note # here"; prettier --write .` EXECUTES in full while the
 * guard saw only `echo "note` — the write-mode formatter stripped out of view, the
 * AC6 ban silently gone, and `pnpm format:check` passing on a tree CI had already
 * rewritten. The documented rationale only ever covered smuggling a pattern IN;
 * this is the direction that costs a rule.
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

function stripComments(yamlText: string): string {
  return yamlText.split('\n').map(stripLineComment).join('\n')
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

/** The text on a key's OWN line, after the colon — empty when the value is a block. */
function inlineAfter(lines: string[], key: string, indent: number): string | undefined {
  const header = new RegExp(`^ {${indent}}(?:['"]?${key}['"]?):(.*)$`)
  for (const line of lines) {
    const match = header.exec(line)
    if (match !== null) return (match[1] ?? '').trim()
  }
  return undefined
}

/** Every mapping key sitting at exactly `indent`, with the text on its own line. */
function keysAt(block: string[], indent: number): { key: string; inline: string }[] {
  const header = new RegExp(`^ {${indent}}(['"]?)([A-Za-z_][A-Za-z0-9_-]*)\\1:(.*)$`)
  const found: { key: string; inline: string }[] = []
  for (const line of block) {
    const match = header.exec(line)
    if (match?.[2] !== undefined) found.push({ key: match[2], inline: (match[3] ?? '').trim() })
  }
  return found
}

/** The smallest indent among a block's non-empty lines — its own key level. */
function keyIndent(block: string[]): number {
  const indents = block.filter(line => line.trim() !== '').map(indentOf)
  return indents.length === 0 ? 0 : Math.min(...indents)
}

/**
 * A YAML scalar without its surrounding quotes. MATCHED pairs only: an `if:`
 * condition ends in a quote of its own (`… == 'failure'`) and stripping that half
 * would corrupt the value the rules read — and report it back corrupted.
 */
function unquote(value: string): string {
  const trimmed = value.trim()
  return /^(['"])[\s\S]*\1$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed
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

/**
 * A step's lines with the leading `- ` list marker blanked out, so `- name:` and the
 * keys under it sit at ONE indent and a single `^ {n}key:` probe finds either.
 */
function levelledStep(step: string[]): string[] {
  const [first, ...rest] = step
  return [(first ?? '').replace(/^(\s*)-(\s)/, '$1 $2'), ...rest]
}

/**
 * The scalar value of `key:` at exactly `indent` inside `block`, or `undefined`.
 * Unquoted, because `id: 'format_check'` is valid YAML that GitHub resolves
 * identically to the bare spelling: reading it raw made this guard red on a
 * CORRECT workflow, with a message describing a file that does declare a usable
 * id — and a gate that false-fails is the kind that gets weakened or deleted.
 */
function scalarAt(block: string[], key: string, indent: number): string | undefined {
  const header = block.find(line => new RegExp(`^ {${indent}}${key}:`).test(line))
  if (header === undefined) return undefined
  return unquote(header.replace(new RegExp(`^ {${indent}}${key}:\\s*`), ''))
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

/**
 * YAML has two spellings for every mapping, and this reader understands ONE.
 *
 * `blockUnder` collects the lines indented deeper than a key, so a FLOW mapping —
 * which sits entirely on its key's own line — yields an EMPTY block. `listValueOf`
 * then finds no key inside it and returns `null`, which for a trigger filter means
 * "no filter, therefore every value": every trigger rule passes vacuously on the one
 * spelling that carries the hole. Four one-line edits, all valid YAML GitHub honours,
 * used to leave this guard green —
 *
 *   `pull_request: { branches: [main], paths-ignore: ['**\/*.md'] }` — AC3's exact
 *     hole: a markdown-only PR runs no formatting check, asserted by the guard whose
 *     entire reason for existing is that key;
 *   `pull_request: { branches: [release] }` — no PR targeting the base branch is ever
 *     checked and the `format` context never reports;
 *   `pull_request: { branches: [main], types: [closed] }` — the check runs only after
 *     the PR is closed;
 *   `push: { branches: [release] }` — AC7's post-merge visibility gone.
 *
 * (The anchored `^\s*(paths-ignore|paths):` probe misses them for the same reason: an
 * inline key is never at line start.)
 *
 * So an unsupported spelling is REJECTED, not parsed. That is the whole change of
 * direction: the reader's incompleteness now fails CLOSED (a spelling it cannot read
 * is a problem) instead of open (a spelling it cannot read is "no filter"). Teaching
 * the hand-rolled reader to parse flow style would be a second reader to keep in step
 * with the first, and the next spelling it does not know would fail open again —
 * which is the ADL 2026-07-29 argument ("a parser written to the same
 * misunderstanding validates nothing") landing on this module.
 *
 * Hence, on BOTH of YAML's node positions:
 *
 * - every structural KEY must carry a BLOCK value, i.e. nothing on its own line after
 *   the colon. Flow mappings are the spelling that motivated it; an ANCHOR
 *   (`pull_request: &filters`) and an ALIAS (`pull_request: *filters`) are the same
 *   class — they relocate content a line reader cannot follow.
 * - every sequence ITEM must be a BLOCK MAPPING (or a plain scalar, under a trigger
 *   filter). `steps:` is a sequence, and its contents are read by walking into each
 *   item — so a `- { … }`, `- [ … ]`, `- *step`, `- &step …` or bare `-` item is
 *   content relocated out of view exactly as a flow mapping is, and it hides a whole
 *   step from `usesProblems` and the write-mode scan (`relocationProblems`). A merge
 *   key (`<<: *filters`) is the same move in the third position.
 *
 * Bounded on purpose: `branches: [main]` (a flow SEQUENCE, read correctly by
 * `listValueOf`), an inline `permissions: { contents: read }` (read correctly by
 * `permissionProblems`) and shell text inside a `run:` block scalar (not YAML at all —
 * `withoutBlockScalars`) stay accepted, because a guard that fails a CORRECT workflow
 * is the kind that gets weakened.
 */
function spellingKind(spelling: string): string {
  if (spelling === '') return 'an off-line'
  if (/^[{[]/.test(spelling)) return 'flow-style'
  if (spelling.startsWith('*')) return 'an alias'
  if (spelling.startsWith('&')) return 'an anchor'
  return 'inline'
}

function unreadableSpelling(path: string, spelling: string, kind = spelling): string {
  return (
    `\`${path}\` carries ${spellingKind(kind)} value (\`${spelling}\`) where this guard reads a BLOCK. A flow\n` +
    "  mapping lives on its key's own line, and an alias or anchor lives somewhere else entirely,\n" +
    '  so the block under that key is EMPTY and every rule reading a key inside it sees "absent" —\n' +
    '  which for a trigger filter means "no filter, so every value". `pull_request: { branches:\n' +
    "  [main], paths-ignore: ['**/*.md'] }` is valid YAML GitHub honours, and it leaves a\n" +
    '  markdown-only PR with no formatting check at all while every rule here passes. Use block\n' +
    '  style, and no anchors: this guard rejects what it cannot read rather than guessing.'
  )
}

/** Every key this guard reads as a block, with whatever sits on its own line. */
function structuralKeys(lines: string[]): [string, string | undefined][] {
  const on = blockUnder(lines, 'on', 0) ?? []
  const jobs = blockUnder(lines, 'jobs', 0) ?? []
  return [
    ['on', inlineAfter(lines, 'on', 0)],
    ['concurrency', inlineAfter(lines, 'concurrency', 0)],
    ['jobs', inlineAfter(lines, 'jobs', 0)],
    ...keysAt(on, keyIndent(on)).map(({ key, inline }): [string, string] => [`on.${key}`, inline]),
    ...keysAt(jobs, keyIndent(jobs)).map(({ key, inline }): [string, string] => [
      `jobs.${key}`,
      inline,
    ]),
    ...jobsOf(lines).map((job): [string, string | undefined] => [
      `jobs.${job.name}.steps`,
      inlineAfter(job.body, 'steps', keyIndent(job.body)),
    ]),
  ]
}

/** A key whose value is a block scalar (`run: |`, `run: >-`), list item or not. */
const BLOCK_SCALAR_HEADER = /^(\s*)(-\s+)?['"]?[A-Za-z_][\w.-]*['"]?:\s*[|>][-+]?\d*\s*$/

/**
 * The file's STRUCTURAL lines, with every block-scalar body blanked out. A `run: |`
 * body is shell text, not YAML: a line inside it may legitimately begin `- {` (brace
 * expansion) or `- [` (a test), and the line-level rules below would reject a correct
 * workflow on it. What that body EXECUTES is read by `extractRunBlocks`, which is the
 * reader that belongs to it.
 */
function withoutBlockScalars(lines: string[]): string[] {
  const kept: string[] = []
  let masked: number | null = null
  for (const line of lines) {
    if (masked !== null && (line.trim() === '' || indentOf(line) > masked)) {
      kept.push('')
      continue
    }
    masked = null
    kept.push(line)
    const header = BLOCK_SCALAR_HEADER.exec(line)
    if (header !== null) masked = (header[1]?.length ?? 0) + (header[2]?.length ?? 0)
  }
  return kept
}

/**
 * The value of a block-SEQUENCE item, when that value is one this reader cannot follow
 * into — `null` for the two it can (`- name: Fix`, and a plain or quoted scalar such as
 * `- main` under `branches:`).
 *
 * A step is a sequence ITEM, not a mapping key, so `flowStyleProblems`' key-level sweep
 * never looked at one: `- { name: Fix, run: npx prettier --write . }` is a valid step
 * GitHub executes, `stepsOf` accepts it as a step, and then `scalarAt(step, 'uses', …)`
 * and `extractRunBlocks` both want their key at line start and find nothing. The step
 * was invisible to `usesProblems` AND to the write-mode scan at once — placed before the
 * checking step it rewrites the runner's checkout, `pnpm format:check` passes on
 * unformatted code and the `format` context goes green: the exact AC6 loss both of those
 * rules exist to prevent, through the one spelling that had no rule.
 *
 * `- [a, b]`, `- *alias`, `- &anchor` and a bare `-` (the node sits on the NEXT line)
 * are the same class and are rejected with it — the reader follows a `- ` into a block
 * mapping and nothing else.
 */
function unreadableItem(trimmed: string): string | null {
  const match = /^-\s*(.*)$/.exec(trimmed)
  if (match === null) return null
  const value = (match[1] ?? '').trim()
  if (value === '' || /^[{[*&]/.test(value)) return value
  return null
}

/**
 * Content relocated away from where a line reader can follow it: a `<<: *filters` merge
 * key inside a trigger block, or a sequence item that is not a block mapping. Both move
 * content out of the reader's view exactly as a flow mapping does, with the same
 * fail-OPEN result. Read on the structural lines only, so shell text inside a `run:`
 * block scalar cannot false-fail it.
 */
function relocationProblems(lines: string[]): string[] {
  return withoutBlockScalars(lines).flatMap(line => {
    const trimmed = line.trim()
    if (trimmed.startsWith('<<:')) return [unreadableSpelling('a merge key', trimmed)]
    const item = unreadableItem(trimmed)
    if (item !== null) return [unreadableSpelling('a sequence item', trimmed, item)]
    return []
  })
}

function flowStyleProblems(lines: string[]): string[] {
  // `workflow_dispatch:` and every other block key carries an EMPTY remainder.
  const inlined = structuralKeys(lines).flatMap(([path, inline]) =>
    inline === undefined || inline === '' ? [] : [unreadableSpelling(path, inline)],
  )
  return [...inlined, ...relocationProblems(lines)]
}

/**
 * A trigger block that does not cover the base branch reports on nothing that merges.
 *
 * Both spellings, the way `paths`/`paths-ignore` are handled together: a missing
 * filter means "every branch", so `branches-ignore` is invisible to `branchesOf` and
 * a one-line `branches-ignore: [main]` under `pull_request` would leave every PR
 * targeting the base branch unchecked with this guard green. The key is rejected
 * outright rather than pattern-matched against `main` — `branches-ignore` is a glob
 * list (`ma*`, `m[a]in`), and a filter that MIGHT exclude the one branch that must
 * never be excluded buys nothing here.
 */
function baseBranchProblems(event: string, block: string[]): string[] {
  const ignored = listValueOf(block, 'branches-ignore')
  if (ignored !== null) {
    return [
      `the \`${event}\` trigger filters with \`branches-ignore: [${ignored.join(', ')}]\`: that is the\n` +
        `  negative spelling of the same hole — one entry matching \`${BASE_BRANCH}\` and no change landing\n` +
        `  on the base branch is ever checked, while the \`format\` context simply never reports. Use\n` +
        `  \`branches:\` and name \`${BASE_BRANCH}\`.`,
    ]
  }
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

/** The one accepted expression spelling: cancel WHEN the event is a pull request. */
const CANCEL_ON_PULL_REQUEST = /github\.event_name\s*==\s*(['"])pull_request\1/

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
 * are an ALLOW-list of two: a literal `true` (cancel everywhere), or an EQUALITY on
 * the `pull_request` event (cancel on PRs, queue on the base branch — the shipped
 * choice). A substring test for `pull_request` is not enough: `${{ github.event_name
 * != 'pull_request' }}` contains it and inverts it, producing BOTH failure modes at
 * once — nothing cancelled on a PR, and the first of two merges a minute apart
 * cancelled on `main`.
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
  if (value === 'true' || CANCEL_ON_PULL_REQUEST.test(value)) return []
  return [
    `the \`concurrency\` group sets \`cancel-in-progress: ${value}\`, which does not cancel a superseded\n` +
      '  run on a pull request: that run keeps burning a runner and reporting a stale verdict for a ref\n' +
      '  that has moved on. Accepted spellings are the literal `true`, or the EQUALITY `${{\n' +
      "  github.event_name == 'pull_request' }}` — a negated form (`!=`) reads as conditional and is\n" +
      `  the mitigation inverted: nothing cancelled on a PR, and on \`${BASE_BRANCH}\` two merges a minute\n` +
      "  apart cancel each other's verdict.",
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

/** The guard every failure-path step must carry — necessary, never sufficient. */
const FAILURE_GUARD = /\bfailure\(\)/

/** Does this step RUN the formatting check? (Quoted messages are data, not commands.) */
function runsFormatCheck(step: string[]): boolean {
  return extractRunBlocks(step.join('\n'))
    .map(stripQuotedMessages)
    .some(run => referencesScript(run, FORMAT_CHECK_SCRIPT))
}

/** Every step of every job, levelled so one `^ {n}key:` probe finds any of its keys. */
function allSteps(lines: string[]): string[][] {
  return jobsOf(lines)
    .flatMap(job => stepsOf(job.body))
    .map(levelledStep)
}

interface LevelledJob {
  name: string
  steps: string[][]
}

function levelledJobs(lines: string[]): LevelledJob[] {
  return jobsOf(lines).map(job => ({
    name: job.name,
    steps: stepsOf(job.body).map(levelledStep),
  }))
}

/**
 * The job that actually RUNS `pnpm format:check` — the single job whose id becomes the
 * `format` status context, and the anchor both `jobIdentityProblems` and
 * `remedyScopeProblems` reason from. Asserting anything about "the job named `format`"
 * instead lets a decoy carry the name while the real check publishes another context.
 */
function hostJob(jobs: LevelledJob[]): LevelledJob | undefined {
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
 * and every other spelling is rejected rather than reasoned about — the same
 * fail-CLOSED direction the flow-style rules take.
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

/** The jobs a job waits for, in any spelling — `null` when it waits for none. */
function dependenciesOf(body: string[]): string[] | null {
  const indent = keyIndent(body)
  const header = body.find(line => new RegExp(`^ {${indent}}needs:`).test(line))
  if (header === undefined) return null
  const inline = unquote(header.replace(new RegExp(`^ {${indent}}needs:`), ''))
  if (inline !== '' && !inline.startsWith('[')) return [inline]
  return listValueOf(body, 'needs') ?? []
}

function conditionProblems(lines: string[]): string[] {
  const problems: string[] = []
  for (const job of jobsOf(lines)) {
    const dependencies = dependenciesOf(job.body)
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
    const jobCondition = scalarAt(job.body, 'if', keyIndent(job.body))
    if (jobCondition !== undefined) {
      problems.push(
        `job \`${job.name}\` carries \`if: ${jobCondition}\`: a job that can be skipped is a check that\n` +
          '  can be absent, and on GitHub a job skipped via `if:` reports its required check as\n' +
          '  SUCCESSFUL — the merge goes through with the check never having run\n' +
          '  (github-implementation.md § Ordering). This job must run on every event the triggers allow.',
      )
    }
    for (const step of stepsOf(job.body).map(levelledStep)) {
      const condition = scalarAt(step, 'if', keyIndent(step))
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
 * The job id IS the status context. Nothing else in this module asserts it, so
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
function jobIdentityProblems(lines: string[]): string[] {
  const jobs = levelledJobs(lines)
  const host = hostJob(jobs)
  if (host !== undefined) {
    if (host.name === FORMAT_JOB) return []
    return [
      `the job that runs \`pnpm ${FORMAT_CHECK_SCRIPT}\` is \`${host.name}\`, not \`${FORMAT_JOB}\`. The job id IS\n` +
        `  the status context GitHub publishes: way-of-working requires \`${FORMAT_JOB}\` and AC8 names it as\n` +
        '  the context branch protection must list. So the check that runs publishes a context nobody\n' +
        `  requires, and \`${FORMAT_JOB}\` is either absent — every PR left pending once protection lists it,\n` +
        '  with no escape hatch — or present on a job that checks nothing and reports SUCCESS regardless.',
    ]
  }
  const names = jobs.map(job => job.name)
  return names.includes(FORMAT_JOB)
    ? []
    : [
        `no job is named \`${FORMAT_JOB}\` (found: ${names.join(', ') || 'no job at all'}). The job id IS the\n` +
          `  status context GitHub publishes: way-of-working requires \`${FORMAT_JOB}\` and AC8 names it as the\n` +
          '  context branch protection must list. Renaming the job deletes that context without touching a\n' +
          '  rule — silently while review enforcement is advisory, and once protection requires it, a\n' +
          '  required context that never reports leaves every PR pending with no escape hatch.',
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
 * edit here.
 */
function usesProblems(lines: string[]): string[] {
  const problems: string[] = []
  for (const step of allSteps(lines)) {
    const uses = scalarAt(step, 'uses', keyIndent(step))
    if (uses === undefined) continue
    const action = (uses.split('@')[0] ?? '').toLowerCase()
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
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^pnpm run /, 'pnpm ')
}

function checkCommandProblems(lines: string[]): string[] {
  const check = allSteps(lines).find(runsFormatCheck)
  if (check === undefined) return []
  const runs = extractRunBlocks(check.join('\n'))
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
function jobProblems(clean: string, lines: string[]): string[] {
  const problems: string[] = []

  const advisory = /^\s*continue-on-error:\s*(?!false\b)(\S+)/m.exec(clean)
  if (advisory !== null) {
    problems.push(
      `sets \`continue-on-error: ${advisory[1]}\`: the step fails and the job still reports SUCCESS, so\n` +
        '  the `format` context goes green on unformatted code. A check that cannot fail is not a check.',
    )
  }

  problems.push(...conditionProblems(lines))

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
 * workflow well-formed. This module already reasons about the unpopulated-context
 * failure mode for the check step's own `if:` (see `conditionProblems`), so the
 * placement is asserted here rather than left to review.
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
function failurePathSteps(
  jobs: LevelledJob[],
  hostName: string,
  checkIndex: number,
): FailurePathStep[] {
  return jobs.flatMap(job =>
    job.steps.flatMap((step, index) => {
      if (job.name === hostName && index === checkIndex) return []
      const condition = scalarAt(step, 'if', keyIndent(step))
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
function checkStepId(check: string[]): string | null {
  const id = scalarAt(check, 'id', keyIndent(check))
  return id !== undefined && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(id) ? id : null
}

function remedyScopeProblems(lines: string[]): string[] {
  const jobs = levelledJobs(lines)
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
  // Three buckets, not two: a condition that NAMES the checking step but compares it to
  // the wrong outcome is neither unscoped (the author did scope it) nor scoped (it
  // resolves false on the failure path), and reporting it as the first names the wrong
  // cause — the reference the message would ask for is already there.
  const unscoped = failurePath.filter(step => !referencesCheck(step.condition, id))
  const scoped = failurePath.filter(step => scopesTo(step.condition, id))
  const miscompared = failurePath.filter(
    step => referencesCheck(step.condition, id) && !scopesTo(step.condition, id),
  )
  const foreign = scoped.filter(step => step.job !== host.name)
  const early = scoped.filter(step => step.job === host.name && step.index < checkIndex)

  return [
    ...(unscoped.length > 0 ? [unscopedProblem(unscoped)] : []),
    ...(miscompared.length > 0 ? [miscomparedProblem(miscompared, id)] : []),
    ...(foreign.length > 0 ? [foreignJobProblem(foreign, id, host.name)] : []),
    ...(early.length > 0 ? [earlyStepProblem(early, id, checkIndex)] : []),
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
    ...flowStyleProblems(lines),
    ...triggerProblems(clean, lines),
    ...concurrencyProblems(lines),
    ...jobIdentityProblems(lines),
    ...jobProblems(clean, lines),
    ...usesProblems(lines),
    ...stepProblems(clean, rootScripts),
    ...checkCommandProblems(lines),
    ...remedyProblems(lines),
    ...remedyScopeProblems(lines),
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
