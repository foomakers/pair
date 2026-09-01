import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import {
  checkFormatWorkflow,
  checkThisRepoFormatWorkflow,
  extractRunBlocks,
  FORMAT_CHECK_SCRIPT,
  FORMAT_WORKFLOW,
} from './format-workflow-composition'

// #413. `pnpm format:check` was enforced by the husky pre-push hook and NOWHERE
// else: `--no-verify`, or a contributor whose hooks are not installed, landed
// unformatted code with every CI check green. The remedy is a dedicated
// `.github/workflows/format.yml` — and a YAML-only change has nothing asserting
// its shape unless a guard reads the real file.
//
// The failure modes this guard exists for are all one-line edits that keep the
// workflow LOOKING like enforcement:
//   - a `paths-ignore:` key (the reason this is not a job inside ci.yml, whose
//     workflow-level `paths-ignore: ['.changeset/**']` a job would inherit), or
//     its allow-list twin `paths:`, which excludes everything it does not list,
//   - a trigger narrowed off the base branch (`pull_request.branches: [release]`,
//     or its negative spelling `branches-ignore: [main]`) or off the events that
//     matter (`types: [closed]`),
//   - `pull_request_target` instead of `pull_request` (a fork PR would then run
//     with the base repo's credentials),
//   - a write-mode formatter step (`pnpm format`), which would make CI rewrite
//     files instead of reporting — the ADL 2026-07-31 ban is repo-wide, not
//     hook-specific,
//   - dropping the `push: main` trigger, so drift on the base branch goes unseen,
//   - dropping `concurrency`, so a superseded run keeps reporting a stale verdict,
//   - `continue-on-error: true`, ANY `if:` on the job, ANY `if:` on the step that
//     runs `format:check` (a `failure()` guard included — it is false on a normal
//     PR, so the check is skipped and the job ends green), a step `if:` elsewhere
//     that is not a SCOPED `failure()` guard, or a write-scoped token — each keeps
//     the check green (or absent) while the context still reports,
//   - dropping the failure-path remedy, so a red check names the offending file
//     and nothing a contributor can act on (AC1) — or widening ANY failure-path
//     step past the check step's own outcome, so a broken `pnpm install` is
//     annotated "not formatted", or placing a correctly-SPELLED scope where it
//     cannot RESOLVE (a second job, or above the check step), so it is false on
//     every run,
//   - respelling a trigger as a FLOW mapping, which the block reader sees as an
//     empty block and therefore as "no filter at all" — the spelling all four
//     trigger holes above walk through untouched,
//   - a formatting action (`uses:`), invisible to a write scan that reads `run:`
//     blocks, and needing no permission at all when placed before the check,
//   - a checking command that is not THE command (`--filter=`, `-s`, a `cd`), so CI
//     checks a strict subset of the tree the developer checks,
//   - renaming the job, which deletes the `format` status context branch protection
//     is told to require,
//   - a `#` inside quotes read as a comment, which cuts an executing command out of
//     the guard's view.
//
// Structure is asserted, never exact file text: cosmetic YAML edits (comments,
// step names, action versions) must not false-fail this guard.

/**
 * A workflow shaped like the one #413 lands. Each test breaks exactly ONE thing
 * in it by `replace`, so a failure names the property that regressed rather than
 * "the fixture changed".
 */
const WELL_FORMED = `name: Format

on:
  pull_request:
    branches:
      - main
  push:
    branches:
      - main

concurrency:
  group: format-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  format:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: '10.15.0'
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install
      - name: Check formatting
        id: format_check
        run: pnpm format:check
      - name: Explain how to fix it
        if: failure() && steps.format_check.outcome == 'failure'
        run: echo "::error::Not formatted. Run 'pnpm format' locally and commit the result."
`

describe('extractRunBlocks reads what the workflow actually executes (#413)', () => {
  it('collects an inline `run:` command', () => {
    expect(extractRunBlocks('    steps:\n      - run: pnpm format:check\n')).toEqual([
      'pnpm format:check',
    ])
  })

  it('collects a block scalar body, not just its first line', () => {
    const blocks = extractRunBlocks(
      [
        '      - name: Check',
        '        run: |',
        '          set -e',
        '          pnpm format:check',
        '      - name: Next',
        '        uses: actions/checkout@v4',
        '',
      ].join('\n'),
    )
    expect(blocks).toEqual(['set -e\npnpm format:check'])
  })

  it('stops the block at the next key of the same or lower indent', () => {
    const blocks = extractRunBlocks(
      [
        '      - run: |',
        '          pnpm format:check',
        '      - uses: actions/checkout@v4',
        '',
      ].join('\n'),
    )
    expect(blocks).toEqual(['pnpm format:check'])
  })

  it('ignores commented-out steps, so a comment cannot smuggle a command in', () => {
    expect(
      extractRunBlocks('      # - run: pnpm format\n      - run: pnpm format:check\n'),
    ).toEqual(['pnpm format:check'])
  })
})

describe('the format workflow closes the trigger-shaped holes (#413)', () => {
  it('accepts the well-formed workflow', () => {
    const r = checkFormatWorkflow(WELL_FORMED)
    expect(r.ok, r.message).toBe(true)
  })

  // AC3. A `paths-ignore` is the hole this whole story exists to avoid: shipping a
  // check whose TRIGGER excludes paths reads as enforcement and is not.
  it('fails on a workflow-level `paths-ignore`', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  push:\n    branches:\n      - main',
        '  push:\n    branches:\n      - main\n    paths-ignore:\n      - .changeset/**',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('paths-ignore')
  })

  it('fails on a `paths-ignore` nested under any trigger', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  pull_request:\n    branches:\n      - main',
        '  pull_request:\n    paths-ignore:\n      - docs/**\n    branches:\n      - main',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('paths-ignore')
  })

  // AC3, allow-list twin. `paths:` is the same hole spelled positively: everything
  // NOT listed is excluded. A markdown-only or `.changeset`-only PR would then run
  // no formatting check at all — identical outcome to the `paths-ignore` above.
  it('fails on a `paths:` allow-list under pull_request', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  pull_request:\n    branches:',
        "  pull_request:\n    paths: ['**/*.ts']\n    branches:",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('paths')
  })

  it('fails on a `paths:` allow-list under push', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  push:\n    branches:',
        "  push:\n    paths: ['**/*.ts']\n    branches:",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('paths')
  })

  // AC2, base-branch half. `branchesOf` was applied to `push` only, so retargeting
  // the PR trigger at a branch nobody opens PRs against silenced the check for
  // every real PR while the guard stayed green.
  it('fails when `pull_request` no longer covers the base branch', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  pull_request:\n    branches:\n      - main',
        '  pull_request:\n    branches:\n      - release',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('pull_request')
  })

  // AC2, base-branch NEGATIVE spelling. `branches-ignore` is the same filter written
  // the other way round, and a missing filter correctly means "every branch" — so
  // reading only `branches:` made this one-line edit invisible: no PR targeting main
  // is format-checked and the `format` context simply never reports.
  it('fails on a `branches-ignore` under pull_request', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  pull_request:\n    branches:\n      - main',
        '  pull_request:\n    branches-ignore:\n      - main',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('branches-ignore')
  })

  it('fails on a `branches-ignore` under push', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  push:\n    branches:\n      - main',
        '  push:\n    branches-ignore: [main]',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('branches-ignore')
  })

  // Rejected outright rather than pattern-matched against `main`: the values are
  // globs, so `ma*` excludes the base branch too and no substring test would see it.
  it('fails on a `branches-ignore` that excludes the base branch by glob', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  pull_request:\n    branches:\n      - main',
        '  pull_request:\n    branches-ignore:\n      - ma*',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('branches-ignore')
  })

  // AC2, event half. `types: [closed]` runs the check only AFTER the PR is closed —
  // never while it is reviewable.
  it('fails when a `types:` narrowing drops opened/synchronize', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  pull_request:\n    branches:',
        '  pull_request:\n    types: [closed]\n    branches:',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('types')
  })

  it('accepts a `types:` list that still covers opened and synchronize', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  pull_request:\n    branches:',
        '  pull_request:\n    types: [opened, synchronize, reopened, ready_for_review]\n    branches:',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  // AC2. Without `pull_request` the check does not exist where it matters.
  it('fails when the `pull_request` trigger is gone', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace('  pull_request:\n    branches:\n      - main\n', ''),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('pull_request')
  })

  // AC5. `pull_request_target` runs with the BASE repo's token against the fork's
  // head — the classic fork-PR privilege escalation. One word from the safe form.
  it('fails on `pull_request_target`, whatever else the file says', () => {
    const r = checkFormatWorkflow(WELL_FORMED.replace('  pull_request:', '  pull_request_target:'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('pull_request_target')
  })

  // AC7. Drift on the base branch must be visible, not only on pull requests.
  it('fails when the `push` trigger is gone', () => {
    const r = checkFormatWorkflow(WELL_FORMED.replace('  push:\n    branches:\n      - main\n', ''))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('push')
  })

  it('fails when `push` no longer covers the base branch', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  push:\n    branches:\n      - main',
        '  push:\n    branches:\n      - release/*',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('main')
  })

  it('accepts the flow spelling of the branch filter (`branches: [main]`)', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace('  push:\n    branches:\n      - main', '  push:\n    branches: [main]'),
    )
    expect(r.ok, r.message).toBe(true)
  })

  // Duplicate-run edge case: `push` + `pull_request` queue two runs of the same
  // head, and the mitigation is a one-line block that is equally easy to drop.
  it('fails when the concurrency guard is dropped', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        'concurrency:\n  group: format-${{ github.ref }}\n  cancel-in-progress: true\n\n',
        '',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('concurrency')
  })

  it('fails when concurrency no longer cancels the superseded run', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace('cancel-in-progress: true', 'cancel-in-progress: false'),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('cancel-in-progress')
  })

  // Two merges to `main` a minute apart share `format-refs/heads/main`, so an
  // unconditional cancel throws away the FIRST commit's verdict — AC7 wanted drift
  // on the base branch visible. Cancelling only PR runs keeps both properties.
  it('accepts a cancel-in-progress conditioned on the pull_request event', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        'cancel-in-progress: true',
        "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  it('fails on a cancel-in-progress expression naming no event at all', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        'cancel-in-progress: true',
        "cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('cancel-in-progress')
  })

  // The accepted-expression rule is an ALLOW-list of equality, not a substring test
  // for `pull_request`: the NEGATION contains that substring and inverts the
  // mitigation, producing BOTH failure modes the rule exists for — three pushes to a
  // PR branch keep three runners alive on a stale verdict, and two merges to `main` a
  // minute apart leave the first commit with no formatting verdict at all.
  it('fails on a cancel-in-progress that NEGATES the pull_request event', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        'cancel-in-progress: true',
        "cancel-in-progress: ${{ github.event_name != 'pull_request' }}",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('cancel-in-progress')
  })
})

// Nothing asserted a single JOB-level property, so the check could be made
// advisory, skipped outright, or handed a write-scoped token while every trigger
// and step rule above stayed green — and the `format` context would still report.
describe('the format job cannot be made advisory, skipped or privileged (#413)', () => {
  it('fails on `continue-on-error: true`, which reports SUCCESS on unformatted code', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '      - name: Check formatting\n',
        '      - name: Check formatting\n        continue-on-error: true\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('continue-on-error')
  })

  it('fails on an unconditionally false `if:`', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace('  format:\n    runs-on:', '  format:\n    if: false\n    runs-on:'),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('if:')
  })

  // The rule is an ALLOW-list, and this is why: a deny-list of literal falses waves
  // through every never-true EXPRESSION, which is the spelling anyone would write.
  // The job never runs on a PR, and a skipped required check reports neutral.
  it('fails on a never-true job `if:` EXPRESSION, not just the literal false', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  format:\n    runs-on:',
        "  format:\n    if: github.event_name == 'workflow_dispatch'\n    runs-on:",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('if:')
  })

  // The worse half: the JOB runs on every PR, and only the one step that checks
  // anything is skipped — so the `format` context reports SUCCESS on unformatted
  // code while every other rule in the module stays green.
  it('fails on an `if:` that skips the checking STEP while the job still reports', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '      - name: Check formatting\n',
        "      - name: Check formatting\n        if: github.event_name == 'push'\n",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('if:')
  })

  it('fails on an `if:` added to any other step, e.g. the install', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '      - name: Install dependencies\n',
        '      - name: Install dependencies\n        if: false\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('if:')
  })

  // The hole an allow-list keyed on `failure()` ALONE still leaves open: the guard
  // permitted any condition containing `failure()`, on ANY step — including the one
  // step that checks anything. `if: failure()` there is never true on a normal PR
  // (every earlier step succeeded), so `Check formatting` is SKIPPED, the job ends
  // successful, and the `format` context reports SUCCESS on unformatted code. The
  // check step therefore carries NO condition at all.
  it('fails on `if: failure()` on the CHECK step itself', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '      - name: Check formatting\n',
        '      - name: Check formatting\n        if: failure()\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('if:')
  })

  it('fails when `failure()` is ANDed onto a never-true event test on the check step', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '      - name: Check formatting\n',
        "      - name: Check formatting\n        if: github.event_name == 'push' && failure()\n",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('if:')
  })

  // Worse than the other two: a step referencing its OWN `steps.<id>.outcome` reads
  // an unpopulated context, so `'' == 'failure'` is false on every event and the
  // check never runs at all — while spelling out the exact scoping the guard asks
  // the REMEDY for.
  it('fails when the check step scopes itself on its own outcome', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '      - name: Check formatting\n',
        "      - name: Check formatting\n        if: failure() && steps.format_check.outcome == 'failure'\n",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('if:')
  })

  // One correctly-scoped step must not license every other one: `failure()` on a
  // second annotation step is JOB-scoped, so a `pnpm install` dying on a lockfile
  // drift annotates the Checks tab "not formatted" over the real cause — exactly
  // the diagnosis the scoping rule exists to prevent, one step further out.
  it('fails on a SECOND failure-path step left unscoped beside a scoped remedy', () => {
    const r = checkFormatWorkflow(
      `${WELL_FORMED}      - name: Extra note
        if: failure()
        run: echo "::error title=Formatting check failed::not formatted"
`,
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('not scoped')
  })

  it('fails on `if: failure()` added to the install step beside a scoped remedy', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '      - name: Install dependencies\n',
        '      - name: Install dependencies\n        if: failure()\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('not scoped')
  })

  // AC5 is "safe on fork PRs by construction, not by review". This job runs
  // `pnpm install`, i.e. PR-authored lifecycle scripts; a write-scoped token in
  // reach of that is the whole exposure.
  it('fails on `permissions: write-all`', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '    permissions:\n      contents: read\n',
        '    permissions: write-all\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('permissions')
  })

  it('fails on any write scope inside the permissions block', () => {
    const r = checkFormatWorkflow(WELL_FORMED.replace('contents: read', 'contents: write'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('permissions')
  })

  it('fails when the permissions block is deleted, so the repo default is inherited', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace('    permissions:\n      contents: read\n', ''),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('permissions')
  })

  it('accepts the empty and read-all spellings of "no write scope"', () => {
    for (const spelling of ['permissions: {}', 'permissions: read-all']) {
      const r = checkFormatWorkflow(
        WELL_FORMED.replace('    permissions:\n      contents: read', `    ${spelling}`),
      )
      expect(r.ok, `${spelling}: ${r.message}`).toBe(true)
    }
  })
})

// AC1: the failing check must name the offending file AND the remedy. Prettier's
// `--list-different` prints the file and suppresses its own "run with --write"
// line, so without a failure-path step the contributor this story exists for —
// hooks not installed, pushed with `--no-verify` — gets a bare filename.
describe('a failing format check tells the contributor what to run (#413)', () => {
  it('fails when no failure-path step names the remedy', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        / {6}- name: Explain how to fix it\n {8}if: failure\(\).*\n {8}run: .*\n/,
        '',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('pnpm format')
  })

  it('does not accept `pnpm format:check` as the remedy', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        'echo "::error::Not formatted. Run \'pnpm format\' locally and commit the result."',
        'echo "::error::Not formatted. Run pnpm format:check locally."',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('pnpm format')
  })

  it('does not accept a remedy printed unconditionally on the success path', () => {
    const r = checkFormatWorkflow(WELL_FORMED.replace(/^ {8}if: failure\(\).*\n/m, ''))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('pnpm format')
  })

  // `if: failure()` is JOB-scoped: it fires when ANY earlier step failed. A `pnpm
  // install` broken by a lockfile drift or a registry outage would be annotated
  // "not formatted. Run 'pnpm format'" — the contributor runs it, nothing changes,
  // and the real cause is buried under a confident wrong diagnosis.
  it('fails when the remedy is not scoped to the check step (a bare `if: failure()`)', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        "        if: failure() && steps.format_check.outcome == 'failure'\n",
        '        if: failure()\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('not scoped')
  })

  it('fails when the check step carries no `id:` to scope the remedy against', () => {
    const r = checkFormatWorkflow(WELL_FORMED.replace('        id: format_check\n', ''))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('id:')
  })

  // A quoted id is valid YAML, prettier-stable, and `steps.format_check.outcome`
  // resolves against it exactly the same on GitHub. Reading the scalar raw made the
  // guard red on a CORRECT workflow, with a message describing a file that does
  // declare a usable id — and a false-positive gate is the kind that gets deleted.
  it('accepts a quoted `id:` on the check step', () => {
    const r = checkFormatWorkflow(WELL_FORMED.replace('id: format_check', "id: 'format_check'"))
    expect(r.ok, r.message).toBe(true)
  })

  it('accepts `conclusion` as well as `outcome` for the scoping', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace('steps.format_check.outcome', 'steps.format_check.conclusion'),
    )
    expect(r.ok, r.message).toBe(true)
  })

  // The reason this rule needs its own scanner: the write-mode guard reads the
  // literal `pnpm format`, so the obvious spelling of the remedy was rejected as a
  // write-mode STEP. A quoted message is data, not a command.
  //
  // Asserted on a step OTHER than the checking one: since AC4 became an equality on
  // the checking step's command, `pnpm format:check || { … }` is rejected there for a
  // different reason (it is no longer the one command a developer runs). The rule
  // under test here is the write-mode scan, so it is exercised where that is the only
  // rule in play — and the checking-step spelling is asserted red just below.
  it('does not mistake an echoed remedy for a step that writes files', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '        run: pnpm install\n',
        '        run: pnpm install || { echo "Formatting failed. Run pnpm format and commit."; exit 1; }\n',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  it('rejects the inline `|| { … }` remedy on the checking step, as a command shape', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '        run: pnpm format:check\n',
        '        run: pnpm format:check || { echo "Formatting failed. Run pnpm format and commit."; exit 1; }\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('one command, two places')
  })

  it('still fails when `pnpm format` is actually RUN rather than quoted', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace('        run: pnpm format:check\n', '        run: pnpm format\n'),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier:fix')
  })

  // A quoted string is only inert if it cannot execute: `$( … )` and backticks
  // inside double quotes DO run. Those quotes stay in scope for the write scan.
  it('still fails on a write hidden in a command substitution inside a quoted message', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '        run: pnpm format:check\n',
        '        run: echo "$(prettier --write .)" && pnpm format:check\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier --write')
  })

  it('does not let a quoted message satisfy the "CI runs format:check" rule', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '        run: pnpm format:check\n',
        '        run: echo "pnpm format:check"\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain(FORMAT_CHECK_SCRIPT)
  })
})

describe('the format workflow runs the same command a developer runs (#413)', () => {
  // AC4. Local/CI parity is the point of the story: a CI-only variant (a flag, a
  // path list, a re-implementation) recreates the divergence it closes.
  it('fails when no step invokes `pnpm format:check`', () => {
    const r = checkFormatWorkflow(WELL_FORMED.replace('run: pnpm format:check', 'run: pnpm lint'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain(FORMAT_CHECK_SCRIPT)
  })

  it('does not accept a step that merely NAMES the script', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace('run: pnpm format:check', 'run: echo format:check'),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain(FORMAT_CHECK_SCRIPT)
  })

  it('accepts `pnpm run format:check`, the one other spelling of the same invocation', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace('run: pnpm format:check', 'run: pnpm run format:check'),
    )
    expect(r.ok, r.message).toBe(true)
  })

  // The checking step's command is an ALLOW-list of two spellings, not "references
  // the script". Every row below still satisfies `referencesScript` — the old rule —
  // and every row makes CI check a strict SUBSET of what the developer's and the
  // hook's whole-repo `pnpm format:check` covers, which is the divergence this story
  // exists to close. `-s` belongs here too: it silences the output, i.e. the list of
  // offending filenames AC1 requires the contributor to read.
  it('fails on any narrowed spelling of the checking command', () => {
    // Two rules cover the table. A spelling `referencesScript` still recognises as an
    // invocation of the script is caught by the equality ("one command, two places");
    // one whose flag takes a SPACE-separated value is not recognised as an invocation
    // at all, so the older "no step RUNS" rule catches it. Both are red, both name the
    // local/CI divergence — the fragment column records which fired, so a later change
    // that moves a row between them is visible rather than silent.
    const narrowed: [string, string][] = [
      ['pnpm --filter=@pair/website format:check', 'one command, two places'],
      ['pnpm -F @pair/website format:check', 'no step RUNS'],
      ['pnpm -C apps/website format:check', 'no step RUNS'],
      ['pnpm -s format:check', 'one command, two places'],
      ['cd apps/website && pnpm format:check', 'one command, two places'],
      ['npm run format:check', 'one command, two places'],
      ['pnpm format:check --ignore-path .prettierignore.ci', 'one command, two places'],
    ]
    for (const [spelling, fragment] of narrowed) {
      const r = checkFormatWorkflow(
        WELL_FORMED.replace('run: pnpm format:check', `run: ${spelling}`),
      )
      expect(r.ok, `${spelling}: ${r.message}`).toBe(false)
      expect(r.message, spelling).toContain(fragment)
      expect(r.message, spelling).toContain('divergence')
    }
  })

  it('fails when the checking step wraps the command in a multi-line block scalar', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '        run: pnpm format:check\n',
        '        run: |\n          set -e\n          pnpm format:check\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('one command, two places')
  })

  // AC6. Check-only holds in CI exactly as it does in the hook (ADL 2026-07-31).
  // Reuses the pre-push guard's offender list rather than a second copy of it.
  it('fails when a step writes instead of checking (`pnpm format`)', () => {
    const r = checkFormatWorkflow(WELL_FORMED.replace('pnpm format:check', 'pnpm format'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier:fix')
  })

  it('fails on a raw write-mode formatter appended to the check', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace('pnpm format:check', 'pnpm format:check || prettier --write .'),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier --write')
  })

  it('fails on an auto-commit step, so CI can never repair the branch', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '        run: pnpm format:check\n',
        '        run: |\n          pnpm format\n          git commit -am "chore: format"\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier:fix')
  })
})

describe('the format workflow is safe on a fork PR by construction (#413)', () => {
  // AC5. No secret in the job means a fork run is a FULL-STRENGTH run, and there
  // is no credential for PR-authored code to reach.
  it('fails when any step reads a secret', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '      - name: Check formatting',
        '      - name: Check formatting\n        env:\n          TOKEN: ${{ secrets.GITHUB_TOKEN }}',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('secret')
  })

  // The classic script-injection sink: attacker-controlled text (a PR title, a
  // branch name) expanded by the runner INTO the shell before it runs.
  it('fails when an expression is interpolated into a `run:` block', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        'run: pnpm format:check',
        'run: echo "${{ github.event.pull_request.title }}" && pnpm format:check',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('${{')
  })

  it('leaves an expression OUTSIDE a run block alone (the concurrency group)', () => {
    // `group: format-${{ github.ref }}` is not a shell sink — banning it would
    // ban the duplicate-run mitigation this same guard requires.
    expect(checkFormatWorkflow(WELL_FORMED).ok).toBe(true)
  })
})

// YAML has TWO spellings for every mapping, and this guard's block reader only
// understands one of them. `blockUnder` collects the lines indented deeper than a
// key, so a FLOW mapping on the same line yields an EMPTY block — and an empty
// block is read by `listValueOf` as "the key is absent", which for a trigger filter
// means "no filter, therefore every value". Every trigger rule then passes
// vacuously on a workflow whose trigger is exactly as narrow as the rule forbids.
// The complete table below is the decision table for the structural keys this guard
// reads as blocks: each has a flow spelling GitHub honours, and each is rejected
// rather than parsed — a hand-rolled block reader that pretends to understand flow
// style is a second hole, not a fix.
describe('a flow-style mapping is rejected, never parsed (#413)', () => {
  const flowSpellings: [string, string, string][] = [
    // [label, block-style text to replace, its flow spelling]
    [
      'on: itself as a flow mapping',
      'on:\n  pull_request:\n    branches:\n      - main\n  push:\n    branches:\n      - main\n',
      'on: { pull_request: { branches: [main] }, push: { branches: [main] } }\n',
    ],
    [
      'on: as a flow SEQUENCE of event names',
      'on:\n  pull_request:\n    branches:\n      - main\n  push:\n    branches:\n      - main\n',
      'on: [pull_request, push]\n',
    ],
    [
      'pull_request as a flow mapping',
      '  pull_request:\n    branches:\n      - main\n',
      '  pull_request: { branches: [main] }\n',
    ],
    [
      'pull_request as a flow mapping spanning two lines',
      '  pull_request:\n    branches:\n      - main\n',
      '  pull_request: {\n      branches: [main] }\n',
    ],
    [
      'push as a flow mapping',
      '  push:\n    branches:\n      - main\n',
      '  push: { branches: [main] }\n',
    ],
    [
      'concurrency as a flow mapping',
      'concurrency:\n  group: format-${{ github.ref }}\n  cancel-in-progress: true\n',
      'concurrency: { group: "format-${{ github.ref }}", cancel-in-progress: true }\n',
    ],
    ['jobs as a flow mapping', 'jobs:\n  format:\n', 'jobs: { format: }\n  format:\n'],
    [
      'the job body as a flow mapping',
      '  format:\n    runs-on: ubuntu-latest\n',
      '  format: { runs-on: ubuntu-latest }\n    runs-on: ubuntu-latest\n',
    ],
    [
      'steps as a flow sequence',
      '    steps:\n      - name: Checkout code\n',
      '    steps: [{ name: Checkout code, uses: actions/checkout@v4 }]\n      - name: Checkout code\n',
    ],
  ]

  for (const [label, block, flow] of flowSpellings) {
    it(`fails on ${label}`, () => {
      const mutated = WELL_FORMED.replace(block, flow)
      expect(mutated, `${label}: the fixture no longer contains the block spelling`).not.toBe(
        WELL_FORMED,
      )
      const r = checkFormatWorkflow(mutated)
      expect(r.ok, `${label}: ${r.message}`).toBe(false)
      expect(r.message).toContain('flow-style')
    })
  }

  // The four one-line edits the flow hole actually buys. All are valid YAML that
  // GitHub honours, and all left the guard green: a markdown-only PR with no
  // formatting check (AC3's exact hole), a trigger off the base branch so the
  // `format` context never reports on anything that merges, a check that runs only
  // once the PR is closed, and AC7's post-merge visibility gone.
  it('fails on the four trigger holes a flow mapping used to hide', () => {
    const holes = [
      "  pull_request: { branches: [main], paths-ignore: ['**/*.md'] }\n",
      '  pull_request: { branches: [release] }\n',
      '  pull_request: { branches: [main], types: [closed] }\n',
    ]
    for (const hole of holes) {
      const r = checkFormatWorkflow(
        WELL_FORMED.replace('  pull_request:\n    branches:\n      - main\n', hole),
      )
      expect(r.ok, `${hole}: ${r.message}`).toBe(false)
    }
    const push = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  push:\n    branches:\n      - main\n',
        '  push: { branches: [release] }\n',
      ),
    )
    expect(push.ok, push.message).toBe(false)
  })

  // An anchor, an alias and a merge key are the same class as a flow mapping: they
  // move content somewhere a line reader cannot follow. Left unrejected they fail
  // OPEN in the identical way — `pull_request: *filters` reads as "no filter at all",
  // and `- *writer` under `steps:` hides a whole step from the write-mode scan.
  it('fails on an anchor, an alias or a merge key where a block is read', () => {
    const relocations: [string, string, string][] = [
      [
        'an anchor on a trigger key',
        '  pull_request:\n    branches:\n      - main\n',
        '  pull_request: &prfilter\n    branches:\n      - main\n',
      ],
      [
        'an alias as a trigger value',
        '  pull_request:\n    branches:\n      - main\n',
        '  pull_request: *prfilter\n',
      ],
      [
        'a merge key inside a trigger block',
        '  pull_request:\n    branches:\n      - main\n',
        '  pull_request:\n    <<: *prfilter\n',
      ],
      [
        'an alias as a step',
        '      - name: Checkout code\n        uses: actions/checkout@v4\n',
        '      - *checkout_step\n',
      ],
    ]
    for (const [label, block, relocated] of relocations) {
      const mutated = WELL_FORMED.replace(block, relocated)
      expect(mutated, `${label}: the fixture no longer contains the block spelling`).not.toBe(
        WELL_FORMED,
      )
      const r = checkFormatWorkflow(mutated)
      expect(r.ok, `${label}: ${r.message}`).toBe(false)
      expect(r.message, label).toContain('BLOCK')
    }
  })

  // Over-reach guard: the rule is about the keys read as BLOCKS. A flow SEQUENCE of
  // branch names and an inline `permissions:` map are both read correctly today, and
  // rejecting them would fail a correct workflow.
  it('leaves the flow spellings the guard does read correctly alone', () => {
    const flowBranches = WELL_FORMED.replace(
      '  pull_request:\n    branches:\n      - main\n',
      '  pull_request:\n    branches: [main]\n',
    )
    expect(checkFormatWorkflow(flowBranches).ok, checkFormatWorkflow(flowBranches).message).toBe(
      true,
    )

    const inlinePermissions = WELL_FORMED.replace(
      '    permissions:\n      contents: read\n',
      '    permissions: { contents: read }\n',
    )
    expect(
      checkFormatWorkflow(inlinePermissions).ok,
      checkFormatWorkflow(inlinePermissions).message,
    ).toBe(true)
  })
})

// AC6, the `uses:` half. The write-mode scan reads `run:` blocks only, so a step
// that writes through an ACTION was invisible to it. Placed before the checking
// step, a formatting action rewrites the runner's checkout and `pnpm format:check`
// then passes on unformatted code with the `format` context green — and it needs no
// permission at all to do it, because it never pushes.
describe('a step may only use an allow-listed action (#413)', () => {
  const banned = [
    'creyD/prettier_action@v4',
    'stefanzweifel/git-auto-commit-action@v5',
    'EndBug/add-and-commit@v9',
    './.github/actions/format-fixer',
    'docker://alpine:3',
    'Actions/Checkout-Extra@v1',
  ]

  for (const action of banned) {
    it(`fails on \`uses: ${action}\``, () => {
      const r = checkFormatWorkflow(
        WELL_FORMED.replace(
          '      - name: Check formatting\n',
          `      - name: Fix\n        uses: ${action}\n        with:\n          prettier_options: --write .\n      - name: Check formatting\n`,
        ),
      )
      expect(r.ok, `${action}: ${r.message}`).toBe(false)
      expect(r.message).toContain('uses:')
    })
  }

  it('accepts the three actions the workflow needs, at any version and quoted', () => {
    for (const action of [
      'actions/checkout@v4',
      'actions/checkout@v5',
      "'actions/checkout@v4'",
      'actions/checkout@a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0',
      'ACTIONS/CHECKOUT@v4',
    ]) {
      const r = checkFormatWorkflow(
        WELL_FORMED.replace('uses: actions/checkout@v4', `uses: ${action}`),
      )
      expect(r.ok, `${action}: ${r.message}`).toBe(true)
    }
  })
})

// `stripComments` cut from the first ` #` to end of line unconditionally. Inside a
// `run:` block scalar — and inside a QUOTED YAML scalar — that `#` may sit inside
// quotes, where neither bash nor YAML treats it as a comment. The truncation was
// documented as "a comment cannot smuggle a banned pattern IN"; it also smuggled a
// real, executing command OUT of the guard's view, which is the direction that costs
// the AC6 ban.
describe('a `#` inside quotes is not a comment (#413)', () => {
  it('sees a write-mode formatter hidden behind a quoted `#`', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '        run: pnpm install\n',
        '        run: |\n          pnpm install\n          echo "note # here"; prettier --write .\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier --write')
  })

  it('sees it behind single quotes too', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '        run: pnpm install\n',
        "        run: |\n          pnpm install\n          echo 'note # here'; prettier --write .\n",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier --write')
  })

  it('still strips a real shell comment inside a block scalar', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '        run: pnpm install\n',
        '        run: |\n          pnpm install # prettier --write .\n',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  it('still strips a whole-line YAML comment, so a comment cannot smuggle a command in', () => {
    expect(
      extractRunBlocks('      # - run: pnpm format\n      - run: pnpm format:check\n'),
    ).toEqual(['pnpm format:check'])
  })
})

// The job id IS the status context. Nothing asserted it, so renaming `format:` to
// `fmt:` left the guard green while the context way-of-working documents — and that
// AC8 names for branch protection — silently stopped existing. In advisory mode that
// is no signal at all; once protection lists it, a required context that never
// reports leaves every PR pending with no escape hatch
// (github-implementation.md:857).
describe('the job that reports the `format` context is named (#413)', () => {
  it('fails when the job is renamed', () => {
    const r = checkFormatWorkflow(WELL_FORMED.replace('\n  format:\n', '\n  fmt:\n'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('format')
    expect(r.message).toContain('status context')
  })

  it('fails on a case variant, since the context name is case-sensitive', () => {
    const r = checkFormatWorkflow(WELL_FORMED.replace('\n  format:\n', '\n  Format:\n'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('status context')
  })

  it('accepts the quoted spelling of the same job id', () => {
    const r = checkFormatWorkflow(WELL_FORMED.replace('\n  format:\n', "\n  'format':\n"))
    expect(r.ok, r.message).toBe(true)
  })
})

// `steps.<id>` is JOB-LOCAL and populated only for steps that have already run. A
// failure-path step that names it from another job, or from above the checking step,
// carries a condition that is false on every run — so the remedy never fires, and
// AC1's contributor reads a bare filename with the guard reporting the workflow
// well-formed.
describe('a scoped failure-path step must be able to resolve its scope (#413)', () => {
  const REMEDY =
    "      - name: Explain how to fix it\n        if: failure() && steps.format_check.outcome == 'failure'\n        run: echo \"::error::Not formatted. Run 'pnpm format' locally and commit the result.\"\n"

  it('fails when the remedy lives in a second job', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        REMEDY,
        `  explain:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
${REMEDY}`,
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('job-local')
  })

  it('fails when the remedy sits ABOVE the checking step in the same job', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(REMEDY, '').replace(
        '      - name: Check formatting\n',
        `${REMEDY}      - name: Check formatting\n`,
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('has not run yet')
  })

  it('accepts two correctly-placed scoped remedies', () => {
    const r = checkFormatWorkflow(WELL_FORMED.replace(REMEDY, REMEDY + REMEDY))
    expect(r.ok, r.message).toBe(true)
  })
})

// The guard reads the REAL file, exactly like `checkThisRepoGate` does — a
// hand-maintained fixture would keep passing while the shipped workflow drifts.
describe('checkThisRepoFormatWorkflow reads the shipped workflow (#413)', () => {
  it('points at .github/workflows/format.yml', () => {
    expect(FORMAT_WORKFLOW.endsWith('.github/workflows/format.yml')).toBe(true)
  })

  it('the workflow exists on disk', () => {
    expect(existsSync(FORMAT_WORKFLOW), `${FORMAT_WORKFLOW} is missing`).toBe(true)
  })

  it('this repo’s format workflow satisfies every rule above', () => {
    const r = checkThisRepoFormatWorkflow()
    expect(r.ok, r.message).toBe(true)
  })

  it('reports a missing workflow as a failure, never a vacuous pass', () => {
    // The degenerate case the story is about: no workflow at all must be RED.
    expect(checkFormatWorkflow('').ok).toBe(false)
  })

  // Asserted against the SHIPPED file, not the fixture: the guard is only worth
  // anything if it fires on the workflow this repo actually runs. (The rule is
  // "declares no paths-ignore", not "never says the word" — the header comment
  // explains why the key is banned, and a comment must not fail the check.)
  it('fires on the shipped workflow the moment a paths-ignore is declared in it', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      shipped.replace(
        '  push:\n    branches:',
        '  push:\n    paths-ignore:\n      - .changeset/**\n    branches:',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('paths-ignore')
  })

  // The same "fires on the SHIPPED file" treatment for the three properties whose
  // absence a well-formed fixture cannot demonstrate: they are job-level, and a
  // fixture that drifts from the real job would keep passing while the real job
  // goes advisory / privileged / silent.
  it('fires on the shipped workflow when the job is made advisory or privileged', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const advisory = checkFormatWorkflow(
      shipped.replace(
        '      - name: Check formatting\n',
        '      - name: Check formatting\n        continue-on-error: true\n',
      ),
    )
    expect(advisory.ok).toBe(false)
    expect(advisory.message).toContain('continue-on-error')

    const privileged = checkFormatWorkflow(shipped.replace('contents: read', 'contents: write'))
    expect(privileged.ok).toBe(false)
    expect(privileged.message).toContain('permissions')
  })

  it('fires on the shipped workflow when its failure path stops naming the remedy', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(shipped.replace(/^\s*if: failure\(\).*\n/m, ''))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('pnpm format')
  })

  it('fires on the shipped workflow when the remedy widens to a bare `if: failure()`', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(shipped.replace(/^(\s*)if: failure\(\).*$/m, '$1if: failure()'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('not scoped')
  })

  // The two never-true `if:` EXPRESSIONS, on the file this repo actually runs: the
  // job-level one skips the job, the step-level one leaves the job green with the
  // only checking step skipped. A literal-false deny-list waved both through.
  it('fires on the shipped workflow when a never-true `if:` is added to the job', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      shipped.replace(
        '  format:\n    runs-on:',
        "  format:\n    if: github.event_name == 'workflow_dispatch'\n    runs-on:",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('if:')
  })

  it('fires on the shipped workflow when a never-true `if:` is added to the check step', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      shipped.replace(
        '      - name: Check formatting\n',
        "      - name: Check formatting\n        if: github.event_name == 'push'\n",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('if:')
  })

  // The three spellings an allow-list keyed on `failure()` alone waved through, on
  // the file this repo actually runs. All of them leave `Check formatting` skipped
  // on a normal pull request while the job — and the `format` context — end green.
  it('fires on the shipped workflow when the check step is given a `failure()` guard', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const conditions = [
      'failure()',
      "github.event_name == 'push' && failure()",
      "failure() && steps.format_check.outcome == 'failure'",
    ]
    for (const condition of conditions) {
      const r = checkFormatWorkflow(
        shipped.replace(
          '      - name: Check formatting\n',
          `      - name: Check formatting\n        if: ${condition}\n`,
        ),
      )
      expect(r.ok, `${condition}: ${r.message}`).toBe(false)
      expect(r.message).toContain('if:')
    }
  })

  // One correctly-scoped remedy must not license a second, job-scoped one: the
  // annotation would fire on a broken `pnpm install` and tell the contributor to
  // run `pnpm format` against a cause it cannot fix.
  it('fires on the shipped workflow when a second unscoped `failure()` step is added', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      `${shipped}      - name: Extra note
        if: failure()
        run: echo "::error title=Formatting check failed::not formatted"
`,
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('not scoped')
  })

  it('fires on the shipped workflow when `if: failure()` is added to the install step', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      shipped.replace(
        '      - name: Install dependencies\n',
        '      - name: Install dependencies\n        if: failure()\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('not scoped')
  })

  // Quoting the id is valid YAML and resolves identically on GitHub: the shipped
  // workflow must stay GREEN through it, or the guard fails a correct file.
  it('stays green on the shipped workflow when its `id:` is quoted', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(shipped.replace('id: format_check', "id: 'format_check'"))
    expect(r.ok, r.message).toBe(true)
  })

  // The negative branch filter, on the shipped file: one line under `pull_request`
  // and no PR targeting `main` is ever format-checked.
  it('fires on the shipped workflow when a trigger gains a `branches-ignore`', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    for (const event of ['pull_request', 'push']) {
      const r = checkFormatWorkflow(
        shipped.replace(
          `  ${event}:\n    branches:\n      - main`,
          `  ${event}:\n    branches-ignore:\n      - main`,
        ),
      )
      expect(r.ok, `${event}: ${r.message}`).toBe(false)
      expect(r.message).toContain('branches-ignore')
    }
  })

  // The flow-mapping hole, on the file this repo actually runs. Each of the four is
  // ONE line of valid YAML that GitHub honours, and each left `ok=true` before this
  // round: a markdown-only PR never format-checked, no PR targeting `main` ever
  // checked, the check running only after the PR closes, and post-merge drift on
  // `main` invisible.
  it('fires on the shipped workflow when a trigger is respelled as a flow mapping', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const holes: [string, string][] = [
      [
        '  pull_request:\n    branches:\n      - main\n',
        "  pull_request: { branches: [main], paths-ignore: ['**/*.md'] }\n",
      ],
      [
        '  pull_request:\n    branches:\n      - main\n',
        '  pull_request: { branches: [release] }\n',
      ],
      [
        '  pull_request:\n    branches:\n      - main\n',
        '  pull_request: { branches: [main], types: [closed] }\n',
      ],
      ['  push:\n    branches:\n      - main\n', '  push: { branches: [release] }\n'],
    ]
    for (const [block, flow] of holes) {
      const mutated = shipped.replace(block, flow)
      expect(mutated, `${flow}: the shipped file no longer contains the block spelling`).not.toBe(
        shipped,
      )
      const r = checkFormatWorkflow(mutated)
      expect(r.ok, `${flow}: ${r.message}`).toBe(false)
      expect(r.message).toContain('flow-style')
    }
  })

  // The `uses:` writer, on the shipped file. Before the `Check formatting` step this
  // needs no permission at all: the action rewrites the runner's checkout, the check
  // then passes on unformatted code, and the `format` context goes green.
  it('fires on the shipped workflow when a formatting action is added', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      shipped.replace(
        '      - name: Check formatting\n',
        '      - name: Fix\n        uses: creyD/prettier_action@v4\n        with:\n          prettier_options: --write .\n      - name: Check formatting\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('uses:')
  })

  it('fires on the shipped workflow when a writer hides behind a quoted `#`', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      shipped.replace(
        '      - name: Install dependencies\n        run: pnpm install\n',
        '      - name: Install dependencies\n        run: |\n          pnpm install\n          echo "note # here"; prettier --write .\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier --write')
  })

  it('fires on the shipped workflow when the job that carries the context is renamed', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(shipped.replace('\n  format:\n', '\n  fmt:\n'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('status context')
  })

  it('fires on the shipped workflow when the remedy is moved above the checking step', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const remedy =
      / {6}- name: Explain how to fix a formatting failure\n(?:.*\n)*? {10}echo "::error[^\n]*\n/
    const found = remedy.exec(shipped)
    expect(found, 'the shipped remedy step was not found').not.toBeNull()
    const moved = shipped
      .replace(remedy, '')
      .replace(
        '      - name: Check formatting\n',
        `${found?.[0] ?? ''}      - name: Check formatting\n`,
      )
    const r = checkFormatWorkflow(moved)
    expect(r.ok).toBe(false)
    expect(r.message).toContain('has not run yet')
  })

  it('fires on the shipped workflow when the checking command is narrowed', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      shipped.replace('run: pnpm format:check', 'run: pnpm --filter=@pair/website format:check'),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('one command, two places')
  })

  it('fires on the shipped workflow when cancel-in-progress negates the PR event', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      shipped.replace(
        "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
        "cancel-in-progress: ${{ github.event_name != 'pull_request' }}",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('cancel-in-progress')
  })
})
