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
//     annotated "not formatted".
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
  it('does not mistake an echoed remedy for a step that writes files', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '        run: pnpm format:check\n',
        '        run: pnpm format:check || { echo "Formatting failed. Run pnpm format and commit."; exit 1; }\n',
      ),
    )
    expect(r.ok, r.message).toBe(true)
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

  it('accepts the runner-flag and `run` spellings of the same invocation', () => {
    for (const spelling of ['pnpm -s format:check', 'pnpm run format:check']) {
      const r = checkFormatWorkflow(WELL_FORMED.replace('pnpm format:check', spelling))
      expect(r.ok, `${spelling}: ${r.message}`).toBe(true)
    }
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
