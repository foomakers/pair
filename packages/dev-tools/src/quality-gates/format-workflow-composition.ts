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
 * - `working-directory:` on the checking step, or `defaults:` on the job or the
 *   workflow — `cd` spelled as a key, invisible to the command equality, so CI runs a
 *   package's own `format:check` (a subset) the moment one declares the script. The
 *   checking step carries only `name`, `id`, `run`, `timeout-minutes`
 *   (`checkStepKeyProblems`, `defaultsProblems`).
 * - `cancel-in-progress` and `concurrency.group` read as SUBSTRINGS. `!(github.event_name
 *   == 'pull_request')` contains the accepted equality and inverts it; `format-${{
 *   github.run_id }}-${{ github.ref }}` contains the ref key and is unique per run.
 *   Both values are anchored allow-lists over the WHOLE value now.
 * - the shell of a step that is neither the check nor its remedy. Every other surface is
 *   an allow-list; this one was a deny-list of formatters, and the `with: ref: main` loss
 *   has a shell spelling no formatter list names: `run: git fetch origin main && git
 *   checkout origin/main -- .` before the check, or `pnpm install && find . -name '*.ts'
 *   -delete` — each `ok=true` on the shipped file, each running `pnpm format:check` on a
 *   tree that is not the PR's (AC2). The toolchain install is the whole allow-list: `pnpm
 *   install` with flags, and the corepack fallback line by line (`setupCommandProblems`).
 * - `prettier -w`, the documented short form of `--write`, missing from the one offender
 *   list the AC6 ban reuses (`WRITE_MODE_FORMATTERS`, next door): `pnpm install && npx
 *   prettier -w .` was green while `--write` was red.
 *
 * And three spellings the reader misreported on CORRECT workflows — each resolved by
 * GitHub identically to the shipped one (probe run 33676806439 on PR #477), each the ADL
 * 2026-09-01-rejects-what-it-cannot-read failure class ("a guard that false-fails gets
 * weakened"): a quoted `run: "pnpm format:check"` (red: "runs `"pnpm format:check"`");
 * CRLF line endings (red with the WRONG cause, "spells `on:` as a list of events"); and
 * `permissions:` at workflow level with none on the job (red: "declares no
 * `permissions:`" — GitHub hands the workflow-level scope to every job without its own,
 * and a job's own block replaces it). `normalizeCommand` and `isSetupCommand` unquote,
 * `stripComments` normalises line breaks, `permissionProblems` reads both levels.
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
 * Per the gate-tooling ADL (2026-07-13) the logic lives here as a tested module, with a
 * thin `main()` CLI behind a `require.main` guard (`format-workflow:check`, run by the
 * root `gate:composition` — AC6). Turbo's cache is handled by the `$TURBO_ROOT$` input
 * entry on `@pair/dev-tools#test` (turbo.json) — the same treatment
 * `@pair/knowledge-hub#test` already uses for repo-wide artifacts — so `pnpm test` is the
 * other enforcement point and is never a stale PASS.
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

/**
 * Comments stripped, line breaks normalised to `\n` first. YAML (§5.4) reads CRLF and CR
 * as line breaks and normalises them inside block scalars — `yaml@2.8.2` parses the CRLF
 * file to the same document, and GitHub ran it (probe run 33676806439 on PR #477, the
 * whole file CRLF: parsed, corepack fallback executed, check passed). A `git autocrlf`
 * checkout on Windows produces exactly this file, and `pnpm format:check` does not touch
 * `.yml`, so nothing here normalises it back. Read raw, every line ended in `\r`, no
 * `key:` regex anchored on `$` matched, and the guard reported a CORRECT workflow as
 * "spells `on:` as a list of events" — the wrong cause on a right file.
 */
function stripComments(yamlText: string): string {
  return yamlText.replace(/\r\n?/g, '\n').split('\n').map(stripLineComment).join('\n')
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

/**
 * A `- ` item sitting at its parent key's OWN indent — YAML's indentless block
 * sequence, which the spec permits and `yaml@2.8.2` reads identically to the indented
 * form (measured: `branches:\n- main` and `branches:\n  - main` parse to the same
 * value; GitHub honours it, probe run on PR #477). Nothing in this repo normalizes YAML
 * indentation (`pnpm format:check` covers ts/tsx/js/jsx/json/html), so an editor default
 * produces exactly this shape — and a reader that stopped at the parent's indent read a
 * CORRECT workflow as "no branch" / "no failure-path step", the wrong cause on a right
 * file, which is the kind of guard that gets weakened.
 */
function isIndentlessItem(line: string, indent: number): boolean {
  return indentOf(line) === indent && /^\s*-\s/.test(line)
}

/**
 * The lines under `key:` at the given indent — every following line indented deeper,
 * plus indentless sequence items at the key's own indent, stopping at the first sibling
 * or ancestor key. Blank lines inside the block are kept, so a `concurrency:` block
 * separated by one is not truncated.
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
    if (indentOf(line) <= indent && !isIndentlessItem(line, indent)) break
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
  // An alias or anchor is content this reader cannot follow: `aliasProblems` reports
  // it BY NAME, and reading it here as an empty list would report a second, false cause
  // ("no branch") on top.
  if (/^[*&]/.test(inline)) return null
  if (inline.startsWith('[')) {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(unquote)
      .filter(item => item !== '')
  }
  return blockItems(block.slice(index + 1), indentOf(header))
}

/** The `- item` scalars of a block sequence whose parent key sits at `indent`. */
function blockItems(lines: string[], indent: number): string[] {
  const items: string[] = []
  for (const line of lines) {
    if (line.trim() === '') continue
    if (indentOf(line) <= indent && !isIndentlessItem(line, indent)) break
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

/**
 * A `key: *alias` or `key: &anchor …` on ANY line — not only the structural keys, which
 * `structuralKeys` sweeps for flow mappings. The ADL's "anchors, aliases and merge keys
 * are rejected anywhere in the file" was true at the structural level only: `branches:
 * *shared` fell through to `listValueOf`, which read it as an empty list and reported
 * "does not cover `main` (no branch)" — the wrong cause on a spelling the guard cannot
 * read. Every read key (`branches`, `types`, `tags`, `needs`, `permissions`, `group`,
 * `cancel-in-progress`, `with`, `run`, `if`, …) now goes through the same message, which
 * names the alias. A plain YAML scalar cannot begin with `*` or `&`, so there is no false
 * positive on a value; shell inside a `run: |` body is masked first.
 */
const ALIASED_VALUE = /^\s*(?:-\s+)?(['"]?)([A-Za-z_][\w.-]*)\1:\s+([*&]\S*)/

function aliasProblems(lines: string[]): string[] {
  return withoutBlockScalars(lines).flatMap(line => {
    const match = ALIASED_VALUE.exec(line)
    if (match === null) return []
    return [unreadableSpelling(match[2] ?? '', match[3] ?? '')]
  })
}

function flowStyleProblems(lines: string[]): string[] {
  // `workflow_dispatch:` and every other block key carries an EMPTY remainder. An alias
  // or anchor here is `aliasProblems`' finding — reported once, not twice.
  const inlined = structuralKeys(lines).flatMap(([path, inline]) =>
    inline === undefined || inline === '' || /^[*&]/.test(inline)
      ? []
      : [unreadableSpelling(path, inline)],
  )
  return [...inlined, ...aliasProblems(lines), ...relocationProblems(lines)]
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
 * one of its `push` runs is a tag — none is `main`. So `branchesOf` returning null was
 * read as "no filter, every branch", which is exactly wrong here: the workflow never
 * runs on any push to `${BASE_BRANCH}`, post-merge drift is invisible (AC7), and the
 * guard reported it well-formed. Rejected fail-closed, in the same shape as
 * `branches-ignore`; a tag filter BESIDE a `branches:` that names the base branch stays
 * green, because with both defined the event fires for either ref kind.
 */
function tagFilterProblems(event: string, block: string[]): string[] {
  return ['tags', 'tags-ignore'].flatMap(key => {
    const tags = listValueOf(block, key)
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
 * `on:` spelled as a list of events (`- pull_request`) is valid YAML GitHub honours; a
 * list item carries no `branches:` filter and this guard reads the trigger MAP, so it is
 * reported as the spelling it is — not as "has no `pull_request` trigger".
 */
function eventListProblem(on: string[], indent: number): string | null {
  if (keysAt(on, indent).length > 0 || !on.some(line => /^\s*-\s/.test(line))) return null
  return (
    'spells `on:` as a list of events (`- pull_request`): valid YAML, but a list item carries no\n' +
    '  `branches:` filter and this guard reads the trigger MAP. Spell each event as a key\n' +
    '  (`pull_request:` / `push:`) with its `branches:` block.'
  )
}

/**
 * Trigger-shaped holes: the events the workflow reacts to, the branches and
 * activity types it filters them down to, and the paths it silently excludes. This
 * is the story's whole point — a check whose TRIGGER has a gap reads as enforcement
 * and is not, and EVERY key that shapes the trigger is part of that gap, not just
 * the one this story happened to start from.
 */
/** The two text-level trigger holes: the fork-privileged event, and any path filter. */
function eventAndPathProblems(clean: string): string[] {
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
  return problems
}

function triggerProblems(clean: string, lines: string[]): string[] {
  const problems = eventAndPathProblems(clean)

  const on = blockUnder(lines, 'on', 0)
  if (on === null) return [...problems, 'has no `on:` block, so it never runs.']

  const triggerIndent = keyIndent(on)
  const eventList = eventListProblem(on, triggerIndent)
  if (eventList !== null) return [...problems, eventList]
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
function groupProblems(concurrency: string[]): string[] {
  const group = scalarAt(concurrency, 'group', keyIndent(concurrency))
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
  const problems = groupProblems(concurrency)
  const raw = /cancel-in-progress:\s*(.+)$/m.exec(concurrency.join('\n'))?.[1]?.trim()
  const value = raw === undefined ? undefined : unquote(raw)
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
      `  inverted (nothing cancelled on a PR), and \`|| true\` cancels on \`${BASE_BRANCH}\` too, so two merges\n` +
      "  a minute apart cancel each other's verdict.",
  ]
}

/** The text of a `permissions:` value at `indent` — inline or block — or `undefined` when absent. */
function permissionScope(lines: string[], indent: number): string | undefined {
  const inline = inlineAfter(lines, 'permissions', indent)
  if (inline === undefined) return undefined
  return inline !== '' ? inline : (blockUnder(lines, 'permissions', indent) ?? []).join('\n')
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
 * handed `Contents: read` and nothing else. Reading the job level alone reported the
 * workflow-level spelling, a CORRECT file, as "declares no `permissions:`".
 */
function permissionProblems(name: string, body: string[], workflow: string[]): string[] {
  const own = permissionScope(body, keyIndent(body))
  const inherited = permissionScope(workflow, 0)
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
  body: string[]
  steps: string[][]
}

function levelledJobs(lines: string[]): LevelledJob[] {
  return jobsOf(lines).map(job => ({
    name: job.name,
    body: job.body,
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
function jobIdentityProblems(lines: string[]): string[] {
  const jobs = levelledJobs(lines)
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

/** A job's `name:` — the display name GitHub publishes as its check context, if set. */
function displayNameOf(job: LevelledJob): string | undefined {
  return scalarAt(job.body, 'name', keyIndent(job.body))
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
function displayNameProblems(host: LevelledJob, jobs: LevelledJob[]): string[] {
  const problems: string[] = []
  const hostName = displayNameOf(host)
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
    if (displayNameOf(job) !== FORMAT_JOB) continue
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
function matrixProblems(host: LevelledJob): string[] {
  const strategy = inlineAfter(host.body, 'strategy', keyIndent(host.body))
  if (strategy === undefined) return []
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
function checkoutInputProblems(step: string[]): string[] {
  const indent = keyIndent(step)
  const inline = inlineAfter(step, 'with', indent)
  if (inline === undefined) return []
  // A `with:` this reader cannot look inside is rejected as such, never read as "no
  // inputs"; an alias or anchor there is `aliasProblems`' finding.
  if (inline !== '') return /^[*&]/.test(inline) ? [] : [unreadableSpelling('with', inline)]
  const block = blockUnder(step, 'with', indent) ?? []
  const foreign = keysAt(block, keyIndent(block))
    .map(({ key }) => key)
    .filter(key => !ALLOWED_CHECKOUT_INPUTS.some(allowed => allowed === key))
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

function usesProblems(lines: string[]): string[] {
  const problems: string[] = []
  for (const step of allSteps(lines)) {
    const uses = scalarAt(step, 'uses', keyIndent(step))
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
  // `run: "pnpm format:check"` is a quoted YAML scalar GitHub resolves to the bare
  // command (probe run 33676806439: logged as `Run pnpm format:check`); `scalarAt` unquotes
  // `id:` for the same reason. Matched pairs only — see `unquote`.
  return unquote(run)
    .replace(/\s+/g, ' ')
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

function checkStepKeyProblems(lines: string[]): string[] {
  const host = hostJob(levelledJobs(lines))
  const check = host?.steps.find(runsFormatCheck)
  if (check === undefined) return []
  const foreign = keysAt(check, keyIndent(check))
    .map(({ key }) => key)
    .filter(
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
 * `defaults.run.working-directory` is the same `cd` one level up (the host job) or two
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

function defaultsProblems(lines: string[]): string[] {
  const problems: string[] = []
  if (inlineAfter(lines, 'defaults', 0) !== undefined)
    problems.push(defaultsProblem('the workflow'))
  const host = hostJob(levelledJobs(lines))
  if (
    host !== undefined &&
    keysAt(host.body, keyIndent(host.body)).some(({ key }) => key === 'defaults')
  ) {
    problems.push(defaultsProblem(`job \`${host.name}\``))
  }
  return problems
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
    problems.push(...permissionProblems(job.name, job.body, lines))
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
 * this workflow, and for the reason `with:` became one — the deny-list below (write-mode
 * formatters, `${{`, `secrets.`) names FORMATTERS, and the loss it guards has a shell
 * spelling no formatter list can name. Measured on the shipped file: `- name: Sync / run:
 * git fetch origin main && git checkout origin/main -- .` before `Check formatting` →
 * ok=true; `run: pnpm install && find . -name '*.ts' -not -path './node_modules/*'
 * -delete` → ok=true. Each makes `pnpm format:check` run on a tree that is not the PR's
 * (`git checkout <ref> -- .` overwrites every tracked file with `<ref>`'s version; `find
 * -delete` removes them — both measured in a scratch repo), which is the identical AC2
 * loss `with: ref: main` produced on GitHub (run 33635537234: `format` SUCCESS on an
 * unformatted PR) and that `checkoutInputProblems` closed by allow-list.
 *
 * The workflow has exactly two such commands: `pnpm install` (flags only — a positional
 * argument is `pnpm add`, which edits `package.json`) and the corepack fallback, whose
 * lines are listed one by one. The remedy stays deny-list scanned: it runs AFTER the
 * check, on the failure path, and its message has to be free to say what it needs to.
 */
export const SETUP_COMMAND_LINES: readonly RegExp[] = [
  /^pnpm install(?:\s+--?[A-Za-z][\w-]*(?:=\S+)?)*$/,
  /^if ! command -v pnpm >\/dev\/null 2>&1; then$/,
  /^echo (["'])[^"'$`]*\1$/,
  /^corepack enable(?: \|\| true)?$/,
  /^corepack prepare pnpm@[\w.-]+ --activate(?: \|\| true)?$/,
  /^fi$/,
]

function isSetupCommand(run: string): boolean {
  // `run: "pnpm install"` is the bare command to yaml@2.8.2 and to GitHub (run
  // 33676806439) — the same reason `normalizeCommand` unquotes. Matched pairs only.
  return unquote(run)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '')
    .every(line => SETUP_COMMAND_LINES.some(pattern => pattern.test(line)))
}

/** A step that is neither the checking step nor a `failure()`-guarded remedy. */
function isSetupStep(step: string[]): boolean {
  if (runsFormatCheck(step)) return false
  const condition = scalarAt(step, 'if', keyIndent(step))
  return condition === undefined || !FAILURE_GUARD.test(condition)
}

function setupCommandProblems(lines: string[]): string[] {
  const problems: string[] = []
  for (const job of levelledJobs(lines)) {
    for (const step of job.steps.filter(isSetupStep)) {
      const foreign = extractRunBlocks(step.join('\n')).filter(run => !isSetupCommand(run))
      if (foreign.length === 0) continue
      problems.push(
        `a step in job \`${job.name}\` runs \`${foreign.join(' ⏎ ').replace(/\n/g, ' ⏎ ')}\`: outside the checking\n` +
          '  step and its failure-path remedy, the only shell this workflow runs is the toolchain install —\n' +
          '  `pnpm install` (flags only) and the corepack fallback (`if ! command -v pnpm …; then`, a quoted\n' +
          '  `echo`, `corepack enable`, `corepack prepare pnpm@<v> --activate`, `fi`). Anything else is a way\n' +
          "  to change WHAT `pnpm format:check` runs on: `git checkout origin/main -- .` overwrites the PR's\n" +
          "  files with `main`'s, `find … -delete` removes them — either makes the check pass on a tree that\n" +
          "  is not the PR's, the AC2 loss measured with `with: ref: main`, and neither is a formatter a\n" +
          '  deny-list could name. A new command is a deliberate edit to `SETUP_COMMAND_LINES`.',
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
    ...setupCommandProblems(lines),
    ...checkCommandProblems(lines),
    ...checkStepKeyProblems(lines),
    ...defaultsProblems(lines),
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
