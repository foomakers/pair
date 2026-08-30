import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parse } from 'yaml'

/**
 * Conformance guard for `github-automation.md` — one file per target KB artifact, per the
 * project's own ADL (2026-07-18): the adapter's normative CONTENT and the shell semantics of the
 * workflow it ships are two halves of one artifact's contract, so they live together here.
 *
 * Story #217 T4 — the reference GitHub trigger adapter, EXECUTED rather than read.
 *
 * The adapter the KB ships is a shell script an adopting project copies verbatim into its repo, so
 * its shell semantics are the deliverable, not decoration. Two of them are invisible to a reader and
 * fatal in production:
 *
 * 1. GitHub's implicit shell is `bash -e {0}`, so a trailing `cmd && other` whose test is false
 *    exits 1 and turns the SILENT case — the untagged issue this feature promises costs nothing —
 *    into a red job and a failure notification on every unmapped label edit on the board;
 * 2. that implicit shell has **no `pipefail`**, so `pair run … | tee log` reports `tee`'s status and
 *    a HALT inside the dispatcher (an uninstalled workflow) lands as a green tick — the adoption-fix
 *    message the design deliberately chose over a silent fallback never reaches a human.
 *
 * Neither is detectable by grepping the markdown, so this guard extracts the workflow the guideline
 * ships, resolves each step's shell the way GitHub documents it, and RUNS the script against stubbed
 * `pair`/`gh` binaries — the same commands the review's evidence used, pinned.
 */

const REPO_ROOT = join(__dirname, '../../../..')
const ADAPTER_REL = 'guidelines/collaboration/automation/github-automation.md'
const sources: Array<[string, string]> = [
  ['dataset', readFileSync(join(__dirname, '../../dataset/.pair/knowledge', ADAPTER_REL), 'utf-8')],
  ['mirror', readFileSync(join(REPO_ROOT, '.pair/knowledge', ADAPTER_REL), 'utf-8')],
]

interface WorkflowStep {
  readonly name?: string
  readonly shell?: string
  readonly run?: string
}

/** The one yaml block under the tag-driven-dispatch heading — the workflow a project copies. */
function adapterWorkflow(content: string): { jobs: Record<string, { steps: WorkflowStep[] }> } {
  const section = content.slice(content.indexOf('## Tag-Driven Dispatch'))
  const block = /```yaml\n([\s\S]*?)```/.exec(section)
  expect(block, 'the adapter section ships no yaml workflow').not.toBeNull()
  return parse(block![1]!)
}

function step(content: string, name: string): WorkflowStep {
  const steps = adapterWorkflow(content).jobs.dispatch!.steps
  const found = steps.find(candidate => candidate.name === name)
  expect(found, `the adapter has no step named ${name}`).toBeDefined()
  return found!
}

/**
 * The flags GitHub actually runs a `run:` script with.
 *
 * Documented behaviour: the implicit shell on Linux/macOS is `bash -e {0}`; declaring `shell: bash`
 * opts into `bash --noprofile --norc -eo pipefail {0}`. The difference between the two IS the second
 * defect above, so the model is the point of the test rather than a convenience.
 */
function shellFlags(declared: string | undefined): string[] {
  return declared === 'bash' ? ['--noprofile', '--norc', '-eo', 'pipefail'] : ['-e']
}

describe('github-automation.md — the reference trigger adapter (story #217 T4)', () => {
  const adapterSection = (content: string): string => {
    const start = content.indexOf('## Tag-Driven Dispatch — the reference trigger adapter')
    expect(start).toBeGreaterThan(-1)
    return content.slice(start)
  }

  it.each(sources)('%s: fires on label events, not on every issue event', (_, content) => {
    expect(adapterSection(content)).toMatch(/types: \[labeled\]/)
  })

  it.each(sources)('%s: calls the ONE entry point, with both inputs', (_, content) => {
    const section = adapterSection(content)
    expect(section).toMatch(/pair run --card/)
    expect(section).toMatch(/--card-tags/)
    // The labels are DATA the trigger already holds (ADR-024 option 2, rejected): an adapter that
    // re-reads them from the API is the tracker client the driver exists without.
    expect(section).toMatch(/github\.event\.issue\.labels/)
  })

  it.each(sources)(
    '%s: the adapter posts the DISPATCH-RECORD line — the driver never does',
    (_, content) => {
      const section = adapterSection(content)
      expect(section).toContain('DISPATCH-RECORD')
      expect(section).toMatch(/gh issue comment/)
      expect(section).toMatch(/never (posts|holds)/)
    },
  )

  it.each(sources)(
    '%s: states the credential boundary — the token lives in the adapter',
    (_, content) => {
      const section = adapterSection(content)
      expect(section).toMatch(/permissions:/)
      expect(section).toMatch(/credential/i)
    },
  )

  it.each(sources)(
    '%s: names the guard that actually holds on an ephemeral runner',
    (_, content) => {
      const section = adapterSection(content)
      // On GitHub every job checks out a fresh workspace, so the per-card lock cannot see a holder
      // from another job: there the concurrency group IS the cross-job guard. A reader told
      // otherwise adds a second trigger outside the group and gets two agents on one branch.
      expect(section).toMatch(/concurrency:/)
      expect(section).toMatch(/per-card lock/)
      expect(section).toMatch(/EPHEMERAL runners this group IS the cross-job guard/)
      expect(section).toMatch(/cancel-in-progress: false/)
      expect(section).toMatch(/ADR-024/)
    },
  )

  it.each(sources)('%s: the record step cannot fail the job on the silent case', (_, content) => {
    // The readable half of the contract the execution guard below runs for real.
    const section = adapterSection(content)
    expect(section).toMatch(/if \[ -n "\$record" \]; then/)
    expect(section).toMatch(/shell: bash/)
  })

  it.each(sources)('%s: posts a run START and nothing else', (_, content) => {
    const section = adapterSection(content)
    expect(section).toMatch(/Only a run START is ever posted/)
    expect(section).toMatch(/audit file only/)
  })

  it.each(sources)(
    '%s: the pre-flight covers the stale lock and the board-wide HALT',
    (_, content) => {
      const section = adapterSection(content)
      // Both are silent failures with no alert: a stale lock turns automation off for one card
      // forever, and one bad mapping line stops dispatch for every card on the board.
      expect(section).toMatch(/automation\/locks/)
      expect(section).toMatch(/rm -rf/)
      expect(section).toMatch(/stops \*\*every\*\* card/)
    },
  )

  it.each(sources)('%s: repeats the opt-in boundary at the trigger', (_, content) => {
    const section = adapterSection(content)
    expect(section).toMatch(/untagged/i)
    expect(section).toMatch(/runs nothing|nothing runs|never runs/)
  })

  /**
   * The document a reader is sent to must not end by telling them it is unfinished.
   *
   * This file is a primary operator reference — `commands.mdx`, the unattended-delivery tutorial
   * and ADR-024 all point here for the trigger adapter — and it ended with a duplicated stub tail:
   * a concatenated sentence (`…project management.Automation`), then an orphan `## Overview` and a
   * `## TODO` reading "This document needs to be completed with GitHub automation guidelines". An
   * adopter who scrolls past the reference workflow they are about to put in production reads
   * that as the last word on it.
   */
  it.each(sources)('%s: carries no unfinished-stub tail', (_, content) => {
    expect(content).not.toMatch(/## TODO/)
    expect(content).not.toMatch(/needs to be completed/)
    // The concatenation that produced it: prose running straight into a heading word.
    expect(content).not.toMatch(/[a-z]\.[A-Z][a-z]/)
    // Exactly one `## Overview`-style opener, not a second document glued onto the first.
    expect([...content.matchAll(/^## Overview$/gm)].length).toBeLessThan(2)
  })
})

describe('github-automation.md — the shipped trigger adapter, executed (story #217 T4)', () => {
  let workspace: string
  let bin: string

  const stub = (name: string, script: string): void => {
    const path = join(bin, name)
    writeFileSync(path, `#!/usr/bin/env bash\n${script}\n`)
    chmodSync(path, 0o755)
  }

  /** Runs one step's script exactly as GitHub would, and reports what the job would report. */
  const runStep = (
    declaredStep: WorkflowStep,
    env: Record<string, string>,
  ): { status: number; stdout: string } => {
    const script = join(workspace, 'step.sh')
    writeFileSync(script, declaredStep.run!)
    try {
      const stdout = execFileSync('bash', [...shellFlags(declaredStep.shell), script], {
        cwd: workspace,
        encoding: 'utf-8',
        env: { PATH: `${bin}:${process.env.PATH ?? ''}`, ...env },
        stdio: 'pipe',
      })
      return { status: 0, stdout }
    } catch (error) {
      const failure = error as { status?: number; stdout?: string }
      return { status: failure.status ?? 1, stdout: failure.stdout ?? '' }
    }
  }

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'pair-adapter-'))
    bin = join(workspace, 'bin')
    mkdirSync(bin)
    // Every `gh` invocation, recorded — the adapter must post exactly once, and only when a run
    // actually started. Nothing is posted by writing this file; the stub does that.
    stub('gh', `printf '%s\\n' "$*" >> "${join(workspace, 'gh-calls.log')}"`)
  })
  afterEach(() => rmSync(workspace, { recursive: true, force: true }))

  const ghCalls = (): string =>
    existsSync(join(workspace, 'gh-calls.log'))
      ? readFileSync(join(workspace, 'gh-calls.log'), 'utf-8')
      : ''

  describe.each(sources)('%s', (_, content) => {
    it('the dispatch step FAILS the job when `pair run` HALTs behind the pipe', () => {
      // The concrete case: `## Workflows` maps `auto-dev ⇒ pair-loop`, `pair-loop` is not installed,
      // the dispatcher HALTs and exits 1. Under `bash -e` alone the pipeline reports `tee`'s status
      // and the job is green — the team's cards silently stop being dispatched while every trigger
      // run shows a tick.
      stub('pair', 'echo "HALT: pair-loop is not installed" >&2; exit 1')

      const result = runStep(step(content, 'Dispatch the card'), {
        CARD: '217',
        CARD_TAGS: 'auto-dev',
      })

      expect(result.status).not.toBe(0)
    })

    it('the dispatch step succeeds on a routed run, and leaves the record in the log', () => {
      stub('pair', 'echo "DISPATCH-RECORD: 2026-08-30T00:00:00.000Z event=start card=217"')

      const result = runStep(step(content, 'Dispatch the card'), {
        CARD: '217',
        CARD_TAGS: 'auto-dev',
      })

      expect(result.status).toBe(0)
      expect(readFileSync(join(workspace, 'dispatch.log'), 'utf-8')).toContain('DISPATCH-RECORD:')
    })

    it('the record step stays GREEN and posts nothing when nothing was dispatched', () => {
      // An untagged issue is labelled: `pair run` exits 0 with no `DISPATCH-RECORD:` line. This is
      // the case the guideline promises is silent, and it is AC2's whole point — a failed workflow
      // run here turns the feature's advertised silence into a failure notification per label edit.
      writeFileSync(join(workspace, 'dispatch.log'), 'Dispatch: card 218 · skipped (unmapped)\n')

      const result = runStep(step(content, 'Record the run on the card'), { CARD: '218' })

      expect(result.status).toBe(0)
      expect(ghCalls()).toBe('')
    })

    it('the record step posts the record on the card when a run did start', () => {
      const record = 'DISPATCH-RECORD: 2026-08-30T00:00:00.000Z event=start card=217 tag=auto-dev'
      writeFileSync(join(workspace, 'dispatch.log'), `pair run\n${record}\n`)

      const result = runStep(step(content, 'Record the run on the card'), { CARD: '217' })

      expect(result.status).toBe(0)
      expect(ghCalls()).toContain('issue comment 217 --body')
      expect(ghCalls()).toContain(record)
    })

    it('declares the shell on every step that runs one — the implicit shell has no pipefail', () => {
      for (const declared of adapterWorkflow(content).jobs.dispatch!.steps) {
        if (declared.run === undefined) continue
        expect(declared.shell, `step "${declared.name}" leaves the shell implicit`).toBe('bash')
      }
    })
  })
})
