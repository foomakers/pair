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
//     workflow-level `paths-ignore: ['.changeset/**']` a job would inherit),
//   - `pull_request_target` instead of `pull_request` (a fork PR would then run
//     with the base repo's credentials),
//   - a write-mode formatter step (`pnpm format`), which would make CI rewrite
//     files instead of reporting — the ADL 2026-07-31 ban is repo-wide, not
//     hook-specific,
//   - dropping the `push: main` trigger, so drift on the base branch goes unseen,
//   - dropping `concurrency`, so `push` + `pull_request` double-report the same head.
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
        run: pnpm format:check
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
})
