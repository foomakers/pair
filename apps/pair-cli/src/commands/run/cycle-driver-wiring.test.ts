import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  utimesSync,
} from 'fs'
import { hostname, tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createDefaultCycleDriver } from './cycle-wiring'
import { runCycle, type CycleResolveResult, type RunCycleInput } from './cycle'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import type { LockAcquirer } from './card-lock'
import { CYCLE_WORKFLOW_VERSION, CYCLE_BASE_BRANCH_DEFAULT } from './cycle-scripts'
import { ENGINES, type EngineDefinition } from './engines'

vi.mock('./cycle', async importOriginal => {
  const original = await importOriginal<typeof import('./cycle')>()
  return { ...original, runCycle: vi.fn(original.runCycle) }
})

/**
 * US-487 — the PRODUCTION driver, end to end, over the REAL installed scripts.
 *
 * Every other suite injects a fake bridge, which is exactly why the canary found seven driver
 * defects no unit test could see (card T-6). This one runs `createDefaultCycleDriver` against a
 * throwaway git repository carrying byte-for-byte copies of `pair-workflow-cycle`'s scripts and the
 * repository's own agent definitions; only the two EXTERNAL processes are stood in for — the
 * operator's `gh` (a card read) and the engine binary (a process that exits with its terminal event
 * and publishes NO handoff, i.e. a dead dispatch by construction).
 *
 * What the real run then has to get right, with no fake to hide behind:
 * - AC1: resolve → worktree → packet → spawn → resolve, through the real scripts.
 * - AC4: the engine's SUCCESS terminal event is not evidence — the handoff did not advance.
 * - AC5: the dead-dispatch retry budget is the one `cycle-state` reports (`POLICY_DEFAULTS`), not a
 *   `pair-cli` literal and not the `{}` the driver sends: exactly one retry, then `failed-implement` (US-506: a fresh card's first stage is implement).
 * - AC3/AC13: the prompt is the packet's own rendering in the engine's style — `slash` for claude,
 *   the role body first for pi's `instruction`.
 * - the stage starts in the MAIN checkout (where every phase skill anchors the run directory),
 *   never in the story worktree the packet names.
 */

// US-506 AC1: a fresh card's first stage is `implement` — the implementer's role leads the packet.
const ROLE_LINE = 'You are the **implementer** for a single Pair user story'
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')

interface EngineCall {
  readonly argv: readonly string[]
  readonly cwd: string
}

describe('createDefaultCycleDriver — production wiring over the real scripts (US-487)', () => {
  let root: string
  let main: string
  let log: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-cycle-driver-')))
    main = join(root, 'main')
    const bin = join(root, 'bin')
    log = join(root, 'engine.log')
    mkdirSync(main, { recursive: true })
    mkdirSync(bin, { recursive: true })

    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: main, stdio: ['ignore', 'pipe', 'pipe'] })
    git('init', '-q', '-b', 'main')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init')
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')

    // The installed layout the scripts locate their agent definitions from.
    const scripts = join(main, '.claude/skills/pair-workflow-cycle/scripts')
    mkdirSync(scripts, { recursive: true })
    for (const f of ['cycle-state.mjs', 'cycle-dispatch.mjs', 'host'])
      cpSync(join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts', f), join(scripts, f), {
        recursive: true,
      })
    cpSync(join(REPO_ROOT, '.claude/agents'), join(main, '.claude/agents'), { recursive: true })

    // The operator's `gh`: one Ready card, and — for the `--pr` entry — its PR's head branch.
    const gh = join(bin, 'gh')
    writeFileSync(
      gh,
      `#!/usr/bin/env node
const a = process.argv.slice(2)
if (a[0] === 'issue' && a[1] === 'view') {
  process.stdout.write(JSON.stringify({ title: 'A story', body: '**Status**: Refined\\n\\n## Task Breakdown\\n\\n- [ ] T-1\\n' }))
} else if (a[0] === 'pr' && a[1] === 'view') {
  process.stdout.write('feature/US-7-a-story\\n')
} else if (a[0] === 'api' && process.env.FAKE_GH_COMMENTS && /issues\\/7\\/comments$/.test(a[a.length - 1])) {
  process.stdout.write(process.env.FAKE_GH_COMMENTS)
} else process.exit(1)
`,
    )
    chmodSync(gh, 0o755)

    // The engine: records how it was started, emits a SUCCESS terminal event for claude, pi and
    // opencode, and publishes nothing — so the stage it ran cannot have advanced.
    const engine = join(bin, 'fake-engine')
    writeFileSync(
      engine,
      `#!/usr/bin/env node
require('fs').appendFileSync(process.env.FAKE_ENGINE_LOG, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }) + '\\n')
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', ...(process.env.FAKE_ENGINE_RESULT ? { result: process.env.FAKE_ENGINE_RESULT } : {}) }) + '\\n')
process.stdout.write(JSON.stringify({ type: 'agent_settled' }) + '\\n')
process.stdout.write(JSON.stringify({ type: 'step_finish', part: { reason: 'stop' } }) + '\\n')
`,
    )
    chmodSync(engine, 0o755)

    vi.stubEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`)
    vi.stubEnv('FAKE_ENGINE_LOG', log)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  const calls = (): EngineCall[] =>
    existsSync(log)
      ? readFileSync(log, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(l => JSON.parse(l) as EngineCall)
      : []

  const expectFindingCounters = async (resolve: () => Promise<unknown>) => {
    const answer = (await resolve()) as { counters?: Record<string, number> }
    expect(answer.counters?.['implementationRetries']).toBe(1)
    expect(answer.counters?.['preparationRepairs']).toBe(0)
    expect(answer.counters?.['spentCycles']).toBe(0)
  }

  const drive = (
    engine: EngineDefinition,
    pr?: number,
    telemetryEnabled?: boolean,
    recoveryBudget = 1,
  ) =>
    createDefaultCycleDriver({
      engine: { ...engine, command: join(root, 'bin', 'fake-engine') },
      cwd: main,
      fs: new InMemoryFileSystemService({}, main, main),
      location: { scriptsDir: join(main, '.claude/skills/pair-workflow-cycle/scripts') },
      autonomyArgs: [],
      timeoutSeconds: 60,
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
      ...(telemetryEnabled !== undefined && { telemetryEnabled }),
      // one process round keeps these spawn-heavy cases light; the KB default (5) only repeats the same window
    })({
      runId: 'story-7',
      card: '7',
      budgets: { autoRecoveryRounds: recoveryBudget },
      ...(pr !== undefined && { pr }),
    })

  // US-647 AC-11: before resolve, the driver has the script read the card's comments through the operator's `gh` and
  // authenticate the author against the adopted maintainer — the driver passes no login; only the maintainer resumes.
  it.each([
    ['rucka', 'User', '2026-11-15T10:00:00Z', 'prepare'],
    ['mallory', 'User', '2026-11-15T10:00:00Z', 'blocked'],
    ['rucka', 'Bot', '2026-11-15T10:00:00Z', 'blocked'],
    // review r0-2: the host names the creator — a comment edited afterwards is not the maintainer's decision
    ['rucka', 'User', '2026-11-15T11:00:00Z', 'blocked'],
  ])(
    'US-647 AC-11: a decision comment by %s (%s, updated %s) on the card → the next resolve answers %s',
    async (login, type, updatedAt, step) => {
      vi.mocked(runCycle).mockClear()
      await drive(ENGINES.claude)
      const input = vi.mocked(runCycle).mock.calls[0]?.[0]
      mkdirSync(join(main, '.pair/adoption/tech'), { recursive: true })
      writeFileSync(
        join(main, '.pair/adoption/tech/way-of-working.md'),
        '- `default-assignee`: `rucka`\n',
      )
      const dir = join(main, '.pair/working/runs/story-7/7')
      rmSync(join(dir, 'recovery.json'), { force: true })
      const put = (name: string, data: object) =>
        writeFileSync(
          join(dir, name),
          JSON.stringify({
            schemaVersion: 3,
            workflowVersion: CYCLE_WORKFLOW_VERSION,
            run: 'story-7',
            story: '7',
            inputHead: 'a'.repeat(40),
            attempt: 1,
            ...data,
          }),
        )
      put('a0-implement-phase.json', {
        phase: 'a0',
        skill: 'implement-phase',
        seq: 1,
        status: 'ok',
        gatesPassed: true,
        prNumber: 9,
        outputHead: 'b'.repeat(40),
      })
      put('r0-review-phase.json', {
        phase: 'r0',
        skill: 'review-phase',
        seq: 2,
        reviewedHead: 'b'.repeat(40),
        verdict: 'changes-requested',
        custody: { contractBreach: false },
        readiness: { ready: false },
        findings: [
          {
            id: 'r0-1',
            severity: 'Major',
            location: 'src/a.ts:1',
            description: 'wrong',
            recommendation: 'fix',
            kind: 'defect',
            transition: 'open',
            blocking: true,
          },
        ],
      })
      put('r1-g1-red-spec.json', {
        phase: 'r1-g1',
        skill: 'red-spec',
        seq: 3,
        status: 'unprovable',
        reason: 'no policy',
      })
      const block = `r1-g1-red-spec.json@${createHash('sha256')
        .update(readFileSync(join(dir, 'r1-g1-red-spec.json')))
        .digest('hex')
        .slice(0, 12)}`
      const body =
        '```json\n' +
        JSON.stringify({
          schemaVersion: 1,
          kind: 'maintainer-decision',
          story: '7',
          block,
          choice: 'decide',
          reason: 'restrictive reading is fine',
        }) +
        '\n```'
      vi.stubEnv(
        'FAKE_GH_COMMENTS',
        JSON.stringify([
          {
            id: 5,
            body,
            html_url: 'https://github.com/o/r/issues/7#issuecomment-5',
            user: { login, type },
            created_at: '2026-11-15T10:00:00Z',
            updated_at: updatedAt,
          },
        ]),
      )

      const answer = (await input?.resolve()) as {
        next?: { step?: string; maintainerDecision?: { by?: string } }
      }

      expect(answer.next?.step).toBe(step)
      if (step === 'prepare') expect(answer.next?.maintainerDecision?.by).toBe('rucka')
      const said = vi.mocked(console.log).mock.calls.map(c => String(c[0]))
      expect(
        said.some(l => l.includes('Decision: https://github.com/o/r/issues/7#issuecomment-5')),
      ).toBe(true)
    },
    60_000,
  )

  it('AC-24: default-off writes no telemetry; enabled writes stage and terminal card records', async () => {
    const path = join(main, '.pair/working/telemetry/records.jsonl')
    await drive(ENGINES.claude)
    expect(existsSync(path)).toBe(false)

    await drive(ENGINES.claude, undefined, true)
    const records = readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    // #646: the first drive already spent this run's one process round, so the second parks after one window
    expect(records.filter(record => record.kind === 'stage')).toHaveLength(2)
    expect(records.filter(record => record.kind === 'card')).toHaveLength(1)
  }, 60_000)

  it("a success event with a NOT-advanced handoff is a dead dispatch: retried the ONCE cycle-state's own budget allows, then per recorded process round, then parked with a resume token (AC4, AC5, #646 AC-10)", async () => {
    const outcome = await drive(ENGINES.claude)

    // (1 + deadDispatchRetries 1) dispatches per window, one window plus one per autoRecoveryRounds (1 here)
    expect(calls()).toHaveLength(4)
    expect(outcome).toMatchObject({
      status: 'awaiting-human',
      resumeToken: 'implement:a0:dead-dispatch',
    })
    expect(outcome.stagesRun).toBe(4)
  }, 60_000)

  it('US-594 AC-6: prior finding spend survives process recovery', async () => {
    vi.mocked(runCycle).mockClear()
    await drive(ENGINES.claude)
    const dir = join(main, '.pair/working/runs/story-7/7')
    rmSync(join(dir, 'recovery.json'), { force: true })
    const first = {
      schemaVersion: 3,
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      run: 'story-7',
      story: '7',
      phase: 'a0',
      skill: 'implement-phase',
      inputHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: main, encoding: 'utf8' }).trim(),
      status: 'failed',
      gatesPassed: false,
      reason: 'gate red',
    }
    for (const attempt of [1, 2]) {
      writeFileSync(
        join(dir, attempt === 1 ? 'a0-implement-phase.json' : 'a0-implement-phase.attempt-2.json'),
        JSON.stringify({
          ...first,
          seq: attempt,
          attempt,
          status: 'failed',
          gatesPassed: false,
          reason: 'gate red',
        }),
      )
    }
    const resolve = vi.mocked(runCycle).mock.calls[0]?.[0]?.resolve
    expect(resolve).toBeDefined()
    await expectFindingCounters(resolve!)

    const outcome = await drive(ENGINES.claude)
    expect(calls()).toHaveLength(8)
    expect(outcome).toMatchObject({
      status: 'awaiting-human',
      resumeToken: 'implement:a0:dead-dispatch',
    })
    const rounds = JSON.parse(readFileSync(join(dir, 'recovery.json'), 'utf8')) as {
      rounds: { kind: string }[]
    }
    expect(rounds.rounds.map(round => round.kind)).toEqual(['stage-retry'])
    await expectFindingCounters(resolve!)
  }, 60_000)

  it('#646 r1-2: a stage stopped for a contract-identity fault is recovered through reset-group and the process budget, then parked with a resume token', async () => {
    vi.stubEnv(
      'FAKE_ENGINE_RESULT',
      JSON.stringify({ status: 'failed', reason: 'contract-hash-mismatch' }),
    )
    const outcome = await drive(ENGINES.claude)

    expect(outcome).toMatchObject({
      status: 'awaiting-human',
      resumeToken: 'implement:a0:contract-hash-mismatch',
    })
    const said = vi.mocked(console.log).mock.calls.map(c => String(c[0]))
    expect(said.filter(l => /contract-hash-mismatch — reset-group a0/.test(l))).toHaveLength(1)
    const rounds = JSON.parse(
      readFileSync(join(main, '.pair/working/runs/story-7/7/recovery.json'), 'utf8'),
    ).rounds as { kind: string }[]
    expect(rounds.map(r => r.kind)).toEqual(['stage-retry'])
  }, 60_000)

  function recoveryGit(cwd: string, ...args: string[]): string {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim()
  }

  function seedReviewedHead(
    dir: string,
    reviewed: string,
    round = 0,
    createdAt = '2000-01-01T00:00:00.000Z',
  ) {
    mkdirSync(dir, { recursive: true })
    const phase = `r${round}`
    const path = join(dir, `${phase}-review-phase.json`)
    const body = JSON.stringify({
      schemaVersion: 3,
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      run: 'story-7',
      story: '7',
      skill: 'review-phase',
      phase,
      attempt: 1,
      seq: round + 1,
      pr: 42,
      inputHead: reviewed,
      reviewedHead: reviewed,
      createdAt,
      verdict: 'changes-requested',
      custody: { contractBreach: false },
      readiness: { ready: false },
      findings: [
        {
          id: 'r0-1',
          severity: 'Major',
          location: 'src/a.ts:1',
          description: 'wrong',
          recommendation: 'fix',
          kind: 'defect',
          transition: 'open',
          blocking: true,
        },
      ],
    })
    writeFileSync(path, body)
    return { path, body }
  }

  function seedStalePrepare(dir: string, reviewed: string) {
    writeFileSync(
      join(dir, 'r1-g1-red-spec.json'),
      JSON.stringify({
        schemaVersion: 3,
        workflowVersion: CYCLE_WORKFLOW_VERSION,
        run: 'story-7',
        story: '7',
        skill: 'red-spec',
        phase: 'r1-g1',
        attempt: 1,
        seq: 2,
        pr: 42,
        inputHead: reviewed,
        status: 'stale',
        mode: 'remediation',
        createdAt: '2000-01-02T00:00:00.000Z',
      }),
    )
  }

  function recoveryFixture(
    tree: string,
    relationship: 'sibling' | 'descendant' | 'matched',
    integrationMoved: boolean,
  ) {
    const git = (...args: string[]) => recoveryGit(tree, ...args)
    git('config', '--local', 'user.name', 'Fixture')
    git('config', '--local', 'user.email', 'fixture@example.invalid')
    const base = git('rev-parse', 'origin/main')
    git('checkout', '-q', '-b', 'fixture-reviewed')
    writeFileSync(join(tree, 'reviewed.txt'), 'reviewed change')
    git('add', 'reviewed.txt')
    git('commit', '-qm', 'reviewed')
    const reviewed = git('rev-parse', 'HEAD')
    git('checkout', '-q', 'feature/US-7-a-story')
    if (relationship !== 'sibling') git('merge', '--ff-only', reviewed)
    if (relationship !== 'matched') git('commit', '-qm', relationship, '--allow-empty')
    const actual = git('rev-parse', 'HEAD')
    if (integrationMoved) {
      const integration = git(
        'commit-tree',
        `${base}^{tree}`,
        '-p',
        base,
        '-m',
        'integration moved',
      )
      git('update-ref', 'refs/remotes/origin/main', integration)
    }
    expect(git('merge-base', base, actual)).toBe(base)
    expect(git('merge-base', reviewed, actual)).toBe(relationship === 'sibling' ? base : reviewed)
    return { reviewed, actual, git }
  }

  const recoveryRead = (dir: string) => {
    const path = join(dir, 'recovery.json')
    return (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}) as {
      baseSynced?: { head: string; at: string }
      rounds?: { kind: string }[]
    }
  }

  function stageLocalPrepare(dir: string, skill: string, cwd: string) {
    const args = [
      'resolve',
      '--dir',
      dir,
      '--workflowVersion',
      CYCLE_WORKFLOW_VERSION,
      '--policy',
      '{"autoRecoveryRounds":1,"blockingFloor":"Minor"}',
      '--story',
      '7',
      '--entry',
      'pr',
      '--pr',
      '42',
    ]
    return (
      JSON.parse(
        execFileSync(process.execPath, [skill, ...args], {
          cwd,
          encoding: 'utf8',
          timeout: 5000,
        }),
      ) as CycleResolveResult
    ).next
  }

  function restartedBases(dir: string) {
    const dataset = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.skills/workflow')
    const paths = [
      join(main, '.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs'),
      join(REPO_ROOT, '.claude/skills/pair-workflow-red-spec/scripts/cycle-state.mjs'),
      join(dataset, 'cycle/scripts/cycle-state.mjs'),
      join(dataset, 'red-spec/scripts/cycle-state.mjs'),
    ]
    return paths.map(script => stageLocalPrepare(dir, script, main)['base'])
  }

  async function runRecovery(input: RunCycleInput) {
    const { runCycle: run } = await vi.importActual<typeof import('./cycle')>('./cycle')
    // The engine is a recorder. End the loop at that boundary and re-read the real resolver separately.
    return run({
      ...input,
      resolve: async () =>
        calls().length ? { status: 'completed', next: { step: 'done' } } : input.resolve(),
    })
  }

  function expectParkedRecovery(
    outcome: Awaited<ReturnType<typeof runRecovery>>,
    reviewed: string,
    actual: string,
    attempt = 1,
  ) {
    expect.soft(outcome).toMatchObject({
      status: 'awaiting-human',
      stagesRun: 0,
      resumeToken: 'prepare:r1-g1:prepare-head-mismatch',
      next: {
        step: 'prepare',
        phase: 'r1-g1',
        mode: 'remediation',
        attempt,
        base: reviewed,
        reason: 'prepare-head-mismatch',
      },
    })
    expect.soft(outcome.reason ?? '').toContain(`expected ${reviewed}, actual ${actual}`)
    expect.soft(calls()).toHaveLength(0)
  }

  it.each([
    ['sibling-up-to-date', false, 1],
    ['sibling-merge', true, 1],
    ['sibling-stale-retry', false, 2],
  ] as const)(
    '#687 r6-driver-red %s',
    async (_name, moved, attempt) => {
      vi.mocked(runCycle).mockImplementationOnce(async input => {
        const { path: tree } = (await input.worktree()) as { path: string }
        const { reviewed, actual, git } = recoveryFixture(tree, 'sibling', moved)
        const dir = join(main, '.pair/working/runs/story-7/7')
        const review = seedReviewedHead(dir, reviewed)
        if (attempt === 2) seedStalePrepare(dir, reviewed)
        const outcome = await runRecovery(input)
        expectParkedRecovery(outcome, reviewed, actual, attempt)
        expect.soft(git('merge-base', reviewed, git('rev-parse', 'HEAD'))).not.toBe(reviewed)
        expect.soft(existsSync(join(tree, 'reviewed.txt'))).toBe(false)
        expect.soft(recoveryRead(dir).baseSynced).toBeUndefined()
        expect.soft(readFileSync(review.path, 'utf8')).toBe(review.body)
        expect.soft((await input.resolve()).next?.['base']).toBe(reviewed)
        expect.soft(restartedBases(dir)).toEqual(Array(4).fill(reviewed))
        return outcome
      })
      await drive(ENGINES.codex, 42)
    },
    15_000,
  )

  it.each([
    ['matched', false, 1],
    ['descendant-up-to-date', false, 1],
    ['descendant-merge', true, 1],
    ['descendant-stale-retry', false, 2],
  ] as const)(
    '#687 r6-driver-control %s',
    async (name, moved, attempt) => {
      const relationship = name === 'matched' ? 'matched' : 'descendant'
      vi.mocked(runCycle).mockImplementationOnce(async input => {
        const { path: tree } = (await input.worktree()) as { path: string }
        const { reviewed, actual, git } = recoveryFixture(tree, relationship, moved)
        const dir = join(main, '.pair/working/runs/story-7/7')
        const review = seedReviewedHead(dir, reviewed)
        if (attempt === 2) seedStalePrepare(dir, reviewed)
        const before = await input.resolve()
        expect(before.next).toMatchObject({
          step: 'prepare',
          phase: 'r1-g1',
          attempt,
          base: reviewed,
        })
        const outcome = await runRecovery(input)
        const finalHead = git('rev-parse', 'HEAD')
        const recovered = recoveryRead(dir)
        if (moved) {
          expect(git('rev-parse', 'HEAD^1')).toBe(actual)
          expect(git('rev-parse', 'HEAD^2')).toBe(git('rev-parse', 'origin/main'))
        } else expect(finalHead).toBe(actual)
        expect(git('merge-base', reviewed, finalHead)).toBe(reviewed)
        expect(readFileSync(join(tree, 'reviewed.txt'), 'utf8')).toBe('reviewed change')
        expect(calls()).toHaveLength(1)
        const attemptArg = attempt === 1 ? '' : ` $attempt=${attempt}`
        expect(calls()[0]?.argv.at(-1)).toContain(`$phase=r1-g1${attemptArg} $head=${finalHead}`)
        expect(calls()[0]?.cwd).toBe(main)
        expect(outcome.stagesRun).toBe(1)
        expect(recovered.baseSynced?.head).toBe(relationship === 'matched' ? undefined : finalHead)
        expect((recovered.rounds ?? []).map(round => round.kind)).toEqual(
          relationship === 'matched' ? [] : ['base-sync'],
        )
        expect((await input.resolve()).next).toMatchObject({ ...before.next, base: finalHead })
        expect(restartedBases(dir)).toEqual(Array(4).fill(finalHead))
        expect(readFileSync(review.path, 'utf8')).toBe(review.body)
        return outcome
      })
      await drive(ENGINES.codex, 42)
    },
    15_000,
  )

  it.each([0, 1])(
    '#687 r6-driver-red real-spent-budget-%s',
    async budget => {
      vi.mocked(runCycle).mockImplementationOnce(async input => {
        const { path: tree } = (await input.worktree()) as { path: string }
        const { reviewed, actual, git } = recoveryFixture(tree, 'descendant', true)
        const dir = join(main, '.pair/working/runs/story-7/7')
        const review = seedReviewedHead(dir, reviewed)
        const rounds =
          budget === 0
            ? []
            : [{ kind: 'base-sync', detail: 'prior attempt', at: '2000-01-03T00:00:00.000Z' }]
        utimesSync(review.path, new Date(0), new Date('2000-01-01'))
        const path = join(dir, 'recovery.json')
        const bytes = JSON.stringify({ rounds })
        writeFileSync(path, bytes)
        const outcome = await runRecovery(input)
        expectParkedRecovery(outcome, reviewed, actual)
        expect.soft(outcome.reason ?? '').toContain(`autoRecoveryRounds (${budget}) spent`)
        expect.soft(git('rev-parse', 'HEAD')).toBe(actual)
        expect.soft(readFileSync(path, 'utf8')).toBe(bytes)
        expect.soft(readFileSync(review.path, 'utf8')).toBe(review.body)
        expect.soft(restartedBases(dir)).toEqual(Array(4).fill(reviewed))
        return outcome
      })
      await drive(ENGINES.codex, 42, undefined, budget)
    },
    15_000,
  )

  it('#687 r6-driver-control no-review', async () => {
    vi.mocked(runCycle).mockImplementationOnce(async input => {
      const dir = join(main, '.pair/working/runs/story-7/7')
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        join(dir, 'recovery.json'),
        JSON.stringify({
          baseSynced: { head: 'a'.repeat(40), at: '2025-01-01T00:00:00.000Z' },
        }),
      )
      expect((await input.resolve()).next).toMatchObject({ step: 'verify', phase: 'r0' })
      expect(calls()).toHaveLength(0)
      return { status: 'awaiting-human', stagesRun: 0 }
    })
    await drive(ENGINES.codex, 42)
  }, 15_000)

  it('#687 r6-driver-red restart-foreign-head', async () => {
    vi.mocked(runCycle).mockImplementationOnce(async input => {
      const { path: tree } = (await input.worktree()) as { path: string }
      const { reviewed, actual } = recoveryFixture(tree, 'sibling', false)
      const dir = join(main, '.pair/working/runs/story-7/7')
      mkdirSync(dir, { recursive: true })
      // Schema-valid prior evidence from a recovery against a different review head.
      writeFileSync(
        join(dir, 'recovery.json'),
        JSON.stringify({
          baseSynced: { head: actual, at: '2025-01-01T00:00:00.000Z' },
          rounds: [],
        }),
      )
      seedReviewedHead(dir, reviewed)
      expect.soft((await input.resolve()).next?.['base']).toBe(reviewed)
      expect.soft(restartedBases(dir)).toEqual(Array(4).fill(reviewed))
      expect(calls()).toHaveLength(0)
      return { status: 'awaiting-human', stagesRun: 0 }
    })
    await drive(ENGINES.codex, 42)
  }, 15_000)

  it('#687 r6-driver-control newer-review', async () => {
    vi.mocked(runCycle).mockImplementationOnce(async input => {
      const { path: tree } = (await input.worktree()) as { path: string }
      const { reviewed, actual, git } = recoveryFixture(tree, 'descendant', false)
      const dir = join(main, '.pair/working/runs/story-7/7')
      seedReviewedHead(dir, reviewed)
      const outcome = await runRecovery(input)
      expect(recoveryRead(dir).baseSynced?.head).toBe(actual)
      git('commit', '-qm', 'new review head', '--allow-empty')
      const newer = git('rev-parse', 'HEAD')
      seedReviewedHead(dir, newer, 1, '2099-01-01T00:00:00.000Z')
      expect((await input.resolve()).next?.['base']).toBe(newer)
      expect(restartedBases(dir)).toEqual(Array(4).fill(newer))
      expect(calls()).toHaveLength(1)
      return outcome
    })
    await drive(ENGINES.codex, 42)
  }, 15_000)

  const resolverStages = [
    'cycle',
    'green-fix',
    'implement-phase',
    'red-spec',
    'red-verify',
    'review-phase',
  ] as const
  const resolverScenarios = [
    'foreign-sibling',
    'legitimate-descendant',
    'superseding-review',
  ] as const
  const resolverCases = (['dataset', 'installed'] as const).flatMap(copy =>
    resolverStages.flatMap(stage =>
      resolverScenarios.map(scenario => {
        const baseline = scenario === 'foreign-sibling' ? 'red' : 'control'
        return [
          `#687 r6-resolver-${baseline} resolver-${copy}-${stage}-${scenario}`,
          copy,
          stage,
          scenario,
        ] as const
      }),
    ),
  )

  it.each(resolverCases)(
    '%s',
    (_name, copy, stage, scenario) => {
      recoveryGit(main, 'branch', 'feature/US-7-a-story')
      const relationship = scenario === 'foreign-sibling' ? 'sibling' : 'descendant'
      const { reviewed, actual, git } = recoveryFixture(main, relationship, false)
      const dir = join(main, '.pair/working/runs/story-7/7')
      seedReviewedHead(dir, reviewed)
      const newerReview = scenario === 'superseding-review'
      if (newerReview) seedReviewedHead(dir, actual, 1, '2000-01-04T00:00:00.000Z')
      // The older memo can still name a descendant of the newer review.
      // These timestamps isolate the precedence rule from the ancestry check.
      const recorded = newerReview
        ? git('commit-tree', 'HEAD^{tree}', '-p', actual, '-m', 'recovered')
        : actual
      const memo = join(dir, 'recovery.json')
      const bytes = JSON.stringify({
        baseSynced: { head: recorded, at: '2000-01-03T00:00:00.000Z' },
        rounds: [],
      })
      writeFileSync(memo, bytes)

      const skill =
        copy === 'dataset'
          ? `packages/knowledge-hub/dataset/.skills/workflow/${stage}`
          : `.claude/skills/pair-workflow-${stage}`
      const next = stageLocalPrepare(dir, join(REPO_ROOT, skill, 'scripts/cycle-state.mjs'), main)
      expect(next).toMatchObject({
        step: 'prepare',
        phase: newerReview ? 'r2-g1' : 'r1-g1',
        attempt: 1,
        base: scenario === 'foreign-sibling' ? reviewed : actual,
      })
      expect(readFileSync(memo, 'utf8')).toBe(bytes)
    },
    15_000,
  )

  it('#605: Codex prepare recovers a divergent Git worktree with base-sync', async () => {
    const { runCycle: run } = await vi.importActual<typeof import('./cycle')>('./cycle')
    vi.mocked(runCycle).mockImplementationOnce(async input => {
      const tree = join(root, 'pair-worktrees', 'main', '7')
      const git = (...args: string[]) =>
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
          cwd: tree,
          encoding: 'utf8',
        }).trim()
      await input.worktree()
      const base = git('rev-parse', 'HEAD')
      git('commit', '-q', '--allow-empty', '-m', 'story HEAD moved')
      const actual = git('rev-parse', 'HEAD')
      const prepare = { step: 'prepare', mode: 'remediation', phase: 'r1-g1', attempt: 1, base }
      const resumed = await run({
        ...input,
        resolve: vi
          .fn(async () => ({ status: 'completed', next: { step: 'done' } }))
          .mockResolvedValueOnce({ status: 'in-progress', next: prepare }),
      })
      expect(resumed.stagesRun).toBe(1)
      expect(calls()).toHaveLength(1)
      expect(git('rev-parse', 'HEAD')).toBe(actual)
      return resumed
    })
    await drive(ENGINES.codex)
  }, 60_000)

  // #646 round 2 — r1-2, the class: each process refusal a preparation retry follows runs ITS recovery before the
  // dispatch, under a recorded round — dirty ⇒ worktree-clean (saved at a recorded ref), stale ⇒ base-sync (a merge).
  it.each([
    ['dirty', 'worktree-clean'],
    ['stale', 'base-sync'],
  ])(
    '#646 r1-2: a prepare retry after a %s refusal runs %s before the dispatch',
    async (refusal, kind) => {
      vi.mocked(runCycle).mockClear()
      await drive(ENGINES.claude)
      const input = vi.mocked(runCycle).mock.calls[0]?.[0]
      const tree = join(root, 'pair-worktrees', 'main', '7')
      const sh = (cwd: string, ...args: string[]) =>
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
          cwd,
          encoding: 'utf8',
        }).trim()
      writeFileSync(join(tree, 'stray.txt'), 'x')
      // the base moved under the branch: a commit only origin/main has
      sh(main, 'commit', '-q', '--allow-empty', '-m', 'base moved')
      const moved = sh(main, 'rev-parse', 'HEAD')
      sh(main, 'update-ref', 'refs/remotes/origin/main', moved)
      const before = sh(tree, 'rev-parse', 'HEAD')
      // the drive above spent the run's one round on its dead dispatch: start this recovery from a fresh record
      rmSync(join(main, '.pair/working/runs/story-7/7/recovery.json'), { force: true })

      const park = await input?.beforePrepare?.({
        step: 'prepare',
        phase: 'a0',
        attempt: 2,
        refusal,
      })

      expect(park?.park).toBeUndefined()
      const recovery = JSON.parse(
        readFileSync(join(main, '.pair/working/runs/story-7/7/recovery.json'), 'utf8'),
      ) as {
        rounds: { kind: string }[]
        stashes?: { ref: string }[]
      }
      expect(recovery.rounds.map(r => r.kind)).toContain(kind)
      expect(existsSync(join(tree, 'stray.txt'))).toBe(false)
      if (refusal === 'dirty')
        expect(recovery.stashes?.[0]?.ref).toMatch(/^refs\/pair\/recovery\/7\//)
      else {
        expect(sh(tree, 'rev-parse', 'HEAD^1')).toBe(before) // merged on top of the branch, never rebased
        expect(sh(tree, 'rev-parse', 'HEAD^2')).toBe(moved)
        // r2-3: the retry runs on the merged HEAD, never the head the stale refusal named
        expect(park?.head).toBe(sh(tree, 'rev-parse', 'HEAD'))
      }
    },
    60_000,
  )

  it('#646 r2-4: after a stale merge on a sealed PR cycle, custody is re-checked with verify-chain on the cycle base and --base-ref the base', async () => {
    vi.mocked(runCycle).mockClear()
    await drive(ENGINES.claude, 42)
    const input = vi.mocked(runCycle).mock.calls[0]?.[0]
    const tree = join(root, 'pair-worktrees', 'main', '7')
    const sh = (cwd: string, ...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        cwd,
        encoding: 'utf8',
      }).trim()
    const seal = sh(tree, 'rev-parse', 'HEAD')
    const cycleBase = sh(main, 'rev-parse', 'refs/remotes/origin/main')
    const dir = join(main, '.pair/working/runs/story-7/7')
    mkdirSync(dir, { recursive: true })
    rmSync(join(dir, 'recovery.json'), { force: true })
    writeFileSync(
      join(dir, 'r1-g1-red-verify.json'),
      JSON.stringify({
        phase: 'r1-g1',
        skill: 'red-verify',
        seq: 1,
        sealed: true,
        verified: true,
        snapshot: seal,
        inputHead: cycleBase,
      }),
    )
    // the custody script, recording how it was called
    const calls = join(root, 'verify-chain.log')
    const scripts = join(main, '.claude/skills/pair-workflow-review-phase/scripts')
    mkdirSync(scripts, { recursive: true })
    writeFileSync(
      join(scripts, 'red-snapshot.mjs'),
      `import { appendFileSync } from 'node:fs'\nappendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + '\\n')\nprocess.stdout.write('{"verified":true}\\n')\n`,
    )
    sh(main, 'commit', '-q', '--allow-empty', '-m', 'base moved')
    sh(main, 'update-ref', 'refs/remotes/origin/main', sh(main, 'rev-parse', 'HEAD'))

    const out = await input?.beforePrepare?.({
      step: 'prepare',
      phase: 'r1-g1',
      attempt: 2,
      refusal: 'stale',
    })

    expect(out?.park).toBeUndefined()
    const argv = JSON.parse(readFileSync(calls, 'utf8').trim()) as string[]
    const flag = (name: string) => argv[argv.indexOf(`--${name}`) + 1]
    expect(argv[0]).toBe('verify-chain')
    expect([flag('pr'), flag('base'), flag('base-ref'), flag('run-dir')]).toEqual([
      '42',
      cycleBase,
      'origin/main',
      dir,
    ])
  }, 60_000)

  it("US-623 AC6/r0-2: the production driver hands runCycle a beforePrepare that stashes the failed attempt's stray files", async () => {
    vi.mocked(runCycle).mockClear()
    await drive(ENGINES.claude)

    const input = vi.mocked(runCycle).mock.calls[0]?.[0]
    expect(input?.beforePrepare).toBeTypeOf('function')

    const tree = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: main,
      encoding: 'utf8',
    })
      .split('\n')
      .find(
        l =>
          l.startsWith('worktree ') && l.includes('story-7') === false && l !== `worktree ${main}`,
      )
      ?.slice('worktree '.length)
    expect(tree).toBeDefined()
    writeFileSync(join(tree as string, 'stray.test.ts'), 'x')

    await input?.beforePrepare?.({ step: 'prepare', phase: 'r1-g1', attempt: 2 })

    expect(existsSync(join(tree as string, 'stray.test.ts'))).toBe(false)
    expect(execFileSync('git', ['stash', 'list'], { cwd: tree, encoding: 'utf8' })).toContain(
      'pair-recovery: story 7 r1-g1 attempt 2',
    )
  }, 60_000)

  it('creates the story worktree through the real cycle-dispatch, and starts the stage in the MAIN checkout (AC1)', async () => {
    await drive(ENGINES.claude)

    expect(existsSync(join(root, 'pair-worktrees', 'main', '7'))).toBe(true)
    for (const call of calls()) expect(realpathSync(call.cwd)).toBe(main)
  }, 60_000)

  it("claude receives the packet's slash rendering, and no bypass it was not given (AC3, AC7)", async () => {
    await drive(ENGINES.claude)

    const [first] = calls()
    const prompt = first!.argv[first!.argv.length - 1]!
    expect(prompt.startsWith('/pair-workflow-implement-phase ')).toBe(true)
    expect(prompt).toContain(ROLE_LINE)
    expect(first!.argv).not.toContain('bypassPermissions')
  }, 60_000)

  it('a --pr entry dispatches verify first — the review stage, never the preparation one (AC2)', async () => {
    const outcome = await drive(ENGINES.claude, 42)

    const [first] = calls()
    const prompt = first!.argv[first!.argv.length - 1]!
    expect(prompt.startsWith('/pair-workflow-review-phase ')).toBe(true)
    expect(calls().some(c => c.argv.some(a => a.includes('pair-workflow-red-spec')))).toBe(false)
    expect(outcome).toMatchObject({
      status: 'awaiting-human',
      resumeToken: 'verify:r0:dead-dispatch',
    })
  }, 60_000)

  it('opencode, which does the file work but publishes no handoff, parks awaiting-human — never claimed complete (AC13 known limitation)', async () => {
    // The canary's opencode leg, as the driver sees it: every stage exits with a success event and
    // no handoff. AC13 does not claim opencode completes; what the driver owes is to SAY so — a
    // bounded dead dispatch and a failed status, never a `ready-for-merge` it did not reach.
    const outcome = await drive(ENGINES.opencode)

    expect(calls()).toHaveLength(4)
    expect(outcome.status).toBe('awaiting-human')
    expect(outcome.status).not.toBe('ready-for-merge')
  }, 60_000)

  it("pi receives the packet's instruction rendering: the role body first (AC3, AC13)", async () => {
    await drive(ENGINES.pi)

    const [first] = calls()
    const prompt = first!.argv[first!.argv.length - 1]!
    expect(prompt.startsWith(ROLE_LINE)).toBe(true)
    expect(prompt).toMatch(/Run the pair-workflow-implement-phase skill with these arguments:/)
    expect(prompt).not.toMatch(/^\//)
  }, 60_000)
  // ── a0 repair (2026-09-22): the classes the validator found no row for ──────────────────────

  const scriptsDir = () => join(main, '.claude/skills/pair-workflow-cycle/scripts')
  const runDirOf = (runId: string) => join(main, '.pair/working/runs', runId, '7')

  /** The REAL resolve, over the same directory the driver reads — the producer's own answer. */
  const realResolve = (runId: string): Record<string, unknown> =>
    JSON.parse(
      execFileSync(
        'node',
        [
          join(scriptsDir(), 'cycle-state.mjs'),
          'resolve',
          '--dir',
          runDirOf(runId),
          '--workflowVersion',
          CYCLE_WORKFLOW_VERSION,
          '--policy',
          '{}',
          '--entry',
          'fresh',
          '--story',
          '7',
          '--runsRoot',
          join(main, '.pair/working/runs'),
        ],
        { encoding: 'utf8' },
      ),
    ) as Record<string, unknown>

  /** The driver's answer, whether it resolves or rejects — a typed stop may take either shape. */
  const settle = async (run: Promise<unknown>): Promise<string> =>
    run.then(
      value => `resolved ${JSON.stringify(value)}`,
      (error: unknown) => `rejected ${error instanceof Error ? error.message : String(error)}`,
    )

  const writeLegacyHandoff = (runId: string) => {
    mkdirSync(runDirOf(runId), { recursive: true })
    writeFileSync(
      join(runDirOf(runId), 'a0-red-spec.json'),
      JSON.stringify({
        skill: 'red-spec',
        story: '7',
        phase: 'a0',
        schemaVersion: 2,
        workflowVersion: CYCLE_WORKFLOW_VERSION,
      }),
    )
  }

  it("AC12/AC4 (resolve status incompatible): a legacy run directory stops the run typed, with resolve's reason and the migrate-acknowledge pointer — zero spawns, never a crash", async () => {
    writeLegacyHandoff('story-7')
    const answer = realResolve('story-7')
    expect(answer).toMatchObject({ status: 'incompatible' })
    expect(answer['next']).toBeUndefined() // the class: resolve answers WITHOUT a `next`

    const outcome = await drive(ENGINES.claude)

    expect(outcome.status).toBe('incompatible')
    expect(outcome.stagesRun).toBe(0)
    expect(JSON.stringify(outcome)).toContain(String(answer['reason']))
    expect(JSON.stringify(outcome)).toMatch(/migrate-acknowledge/)
    expect(calls()).toHaveLength(0)
  }, 60_000)

  it("AC12/AC4 (resolve status invalid): an unreadable handoff stops the run typed, carrying resolve's reason — zero spawns, never a crash", async () => {
    mkdirSync(runDirOf('story-7'), { recursive: true })
    writeFileSync(join(runDirOf('story-7'), 'a0-red-spec.json'), '{ this is not a handoff')
    const answer = realResolve('story-7')
    expect(answer).toMatchObject({ status: 'invalid' })
    expect(answer['next']).toBeUndefined()

    const outcome = await drive(ENGINES.claude)

    expect(outcome.status).toBe('invalid')
    expect(outcome.stagesRun).toBe(0)
    expect(JSON.stringify(outcome)).toContain(String(answer['reason']))
    expect(calls()).toHaveLength(0)
  }, 60_000)

  /** The batch engine published a0-red-spec under ITS run id ⇒ resolve on story-7 answers `other-run`. */
  const publishBatchRunA0 = () => {
    const draft = join(root, 'a0-draft.json')
    writeFileSync(
      draft,
      JSON.stringify({
        run: 'batch-run-7',
        story: '7',
        branch: 'feature/US-7-a-story',
        phase: 'a0',
        skill: 'red-spec',
        inputHead: 'a'.repeat(40),
        inputsDigest: 'x',
        acHash: `sha256:${'0'.repeat(64)}`,
        attempt: 1,
        mode: 'initial',
        status: 'red',
        contractPath: '/x.json',
        contractHash: `sha256:${'1'.repeat(64)}`,
        reconciled: [],
        preserved: [],
        findings: { received: [], covered: [] },
        elapsedMs: 1,
      }),
    )
    const published = JSON.parse(
      execFileSync(
        'node',
        [
          join(scriptsDir(), 'cycle-state.mjs'),
          'publish',
          '--dir',
          runDirOf('batch-run-7'),
          '--file',
          draft,
          '--phase',
          'a0',
          '--skill',
          'red-spec',
          '--workflowVersion',
          CYCLE_WORKFLOW_VERSION,
          '--attempt',
          '1',
        ],
        { encoding: 'utf8' },
      ),
    ) as Record<string, unknown>
    expect(published).toMatchObject({ published: true })
    expect(realResolve('story-7')).toMatchObject({ status: 'other-run', runId: 'batch-run-7' })
  }

  it('AC9/AC12 (resolve status other-run): a cycle another realization started under another runId is CONTINUED on that runId, never crashed on and never restarted', async () => {
    // The batch engine published a0-red-spec under its own run id; this invocation asks for
    // story-7. resolve answers `other-run` (no `next`) — the in-session coordinator's rule, the
    // one this realization must share: adopt that run id and resolve again.
    publishBatchRunA0()

    const outcome = await settle(drive(ENGINES.claude))

    expect(outcome).not.toMatch(/TypeError|Cannot read properties/)
    const [first] = calls()
    expect(first).toBeDefined()
    const prompt = first!.argv[first!.argv.length - 1]!
    // The adopted cycle's NEXT step (validate a0), on the adopted run id — not a fresh prepare.
    expect(prompt.startsWith('/pair-workflow-red-verify ')).toBe(true)
    expect(prompt).toContain('$run=batch-run-7')
    expect(prompt).not.toContain('$run=story-7 ')
    // Nothing was started beside it under the requested id.
    expect(existsSync(join(runDirOf('story-7'), 'a0-red-spec.json'))).toBe(false)
  }, 60_000)

  it('#691 AC5 × other-run (PR #692 r0-2): a live run holding the ADOPTED run dir ⇒ run-locked, nothing spawned', async () => {
    publishBatchRunA0()
    const lock = { pid: process.pid, host: hostname(), startedAt: '2026-11-19T00:00:00Z' }
    writeFileSync(join(runDirOf('batch-run-7'), 'run.lock'), JSON.stringify(lock))

    const outcome = await settle(drive(ENGINES.claude))

    expect(outcome).toContain('run-locked')
    expect(outcome).toContain('batch-run-7')
    expect(calls()).toHaveLength(0)
  }, 60_000)

  it('AC1/AC11 (worktree-conflict): the story worktree path checked out on ANOTHER branch HALTs the run with the halt verbatim, before any spawn', async () => {
    // The card's edge case: "cycle-dispatch reports worktree-conflict; the driver HALTs before any
    // spawn". A real conflicting worktree, so the halt is the real script's own.
    execFileSync(
      'git',
      ['worktree', 'add', '-q', '-b', 'someone-else', join(root, 'pair-worktrees', 'main', '7')],
      {
        cwd: main,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    const outcome = await settle(drive(ENGINES.claude))

    expect(outcome).toMatch(/worktree-conflict/)
    expect(outcome).toContain('someone-else')
    expect(outcome).not.toMatch(/ready-for-merge/)
    expect(calls()).toHaveLength(0)
  }, 60_000)

  it('#601 AC3 / #602 AC6: a card host failure does not recover a foreign worktree', async () => {
    const stage = 'card'
    execFileSync(
      'git',
      ['worktree', 'add', '-q', '-b', 'someone-else', join(root, 'pair-worktrees', 'main', '7')],
      { cwd: main, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const gh = join(root, 'bin', 'gh')
    const marker = join(root, `host-failure-${stage}`)
    const fail = stage === 'card' ? "a[0] === 'issue'" : "a[0] === 'api'"
    const script = readFileSync(gh, 'utf8').replace(
      'const a = process.argv.slice(2)',
      `const a = process.argv.slice(2)\nif (${fail}) { require('fs').writeFileSync(${JSON.stringify(marker)}, 'seen'); process.stderr.write('HTTP 503 Retry-After: 31'); process.exit(1) }`,
    )
    writeFileSync(gh, script)
    const recovery = join(runDirOf('story-7'), 'recovery.json')
    const before = existsSync(recovery) ? readFileSync(recovery, 'utf8') : undefined

    const outcome = await settle(drive(ENGINES.claude, 42))

    expect(existsSync(marker)).toBe(true)
    expect(outcome).toContain('worktree-conflict')
    expect(existsSync(recovery) ? readFileSync(recovery, 'utf8') : undefined).toBe(before)
    expect(calls()).toHaveLength(0)
  }, 60_000)

  it('#601 AC3 / #602 AC6: a card host failure parks when the story worktree is absent', async () => {
    const gh = join(root, 'bin', 'gh')
    writeFileSync(
      gh,
      `#!/usr/bin/env node\nprocess.stderr.write('HTTP 503 Retry-After: 31');process.exit(1)\n`,
    )
    const outcome = await settle(drive(ENGINES.claude, 42))
    expect(outcome).toContain('awaiting-human')
    expect(outcome).toContain('host-transient')
    expect(existsSync(join(runDirOf('story-7'), 'recovery.json'))).toBe(true)
  }, 60_000)

  it('#601 AC3 / #602 AC6: an unverifiable existing worktree resumes after the host returns', async () => {
    const path = join(root, 'pair-worktrees', 'main', '7')
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature/US-7-a-story', path], {
      cwd: main,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const gh = join(root, 'bin', 'gh')
    const healthy = readFileSync(gh, 'utf8')
    writeFileSync(
      gh,
      `#!/usr/bin/env node\nprocess.stderr.write('HTTP 503 Retry-After: 31');process.exit(1)\n`,
    )
    expect(await settle(drive(ENGINES.claude))).toContain('worktree-conflict')
    expect(existsSync(join(runDirOf('story-7'), 'recovery.json'))).toBe(false)
    writeFileSync(gh, healthy)

    const resumed = await settle(drive(ENGINES.claude))

    expect(resumed).not.toContain('worktree-conflict')
    expect(calls().length).toBeGreaterThan(0)
  }, 60_000)

  it('AC3/AC2 (verify cwd): the verify stage STARTS in the main checkout like every stage, and its $worktree names the DETACHED review worktree it cds into', async () => {
    // The one cwd rule (maintainer decision, a0 repair): every stage process starts in the MAIN
    // checkout, where the phase skills anchor the run directory; the verify packet's own
    // `$worktree` is the detached review worktree `<worktreeRoot>/<id>-review`, never the story tree.
    await drive(ENGINES.claude, 42)

    const [first] = calls()
    const prompt = first!.argv[first!.argv.length - 1]!
    expect(prompt.startsWith('/pair-workflow-review-phase ')).toBe(true)
    expect(realpathSync(first!.cwd)).toBe(main)
    expect(prompt).toMatch(/\$worktree=\S*pair-worktrees\/main\/7-review(\s|$)/)
    // (The packet's shared argument prefix also names the story worktree — the batch-identical
    // argument set is cycle-dispatch's, AC3; what this driver owes is to START the process in main.)
  }, 60_000)
})

/**
 * The same legacy-run class, through the COMMAND an operator types: `handleRunCommand` with no
 * `driveCycle` injected, so the production driver runs over the real scripts. A stopped run is a
 * non-zero exit that prints resolve's own reason and the recovery (AC12, card edge case).
 */
describe('handleRunCommand over the production driver — a legacy run directory (US-487 a0 repair)', () => {
  let root: string
  let main: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-cycle-handler-')))
    main = join(root, 'main')
    const bin = join(root, 'bin')
    mkdirSync(main, { recursive: true })
    mkdirSync(bin, { recursive: true })
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: main, stdio: ['ignore', 'pipe', 'pipe'] })
    git('init', '-q', '-b', 'main')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init')
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    const scripts = join(main, '.claude/skills/pair-workflow-cycle/scripts')
    mkdirSync(scripts, { recursive: true })
    for (const f of ['cycle-state.mjs', 'cycle-dispatch.mjs', 'host'])
      cpSync(join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts', f), join(scripts, f), {
        recursive: true,
      })
    cpSync(join(REPO_ROOT, '.claude/agents'), join(main, '.claude/agents'), { recursive: true })
    const gh = join(bin, 'gh')
    writeFileSync(
      gh,
      `#!/usr/bin/env node
const a = process.argv.slice(2)
if (a[0] === 'issue' && a[1] === 'view') {
  process.stdout.write(JSON.stringify({ title: 'A story', body: '**Status**: Refined\\n\\n## Task Breakdown\\n\\n- [ ] T-1\\n' }))
} else process.exit(1)
`,
    )
    chmodSync(gh, 0o755)
    vi.stubEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  it("exits non-zero, printing resolve's incompatible reason and the migrate-acknowledge pointer, spawning nothing", async () => {
    const legacy = join(main, '.pair/working/runs/story-7/7')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(
      join(legacy, 'a0-red-spec.json'),
      JSON.stringify({
        skill: 'red-spec',
        story: '7',
        phase: 'a0',
        schemaVersion: 2,
        workflowVersion: CYCLE_WORKFLOW_VERSION,
      }),
    )
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    })
    const spawned: unknown[] = []
    // A project WITH `## Workflows` whose eligible card carries no mapped tag (`unmapped`) and is
    // Ready: one of the entries the AC14 DoR fallback routes to the delivery cycle.
    const fs = new InMemoryFileSystemService(
      {
        [`${main}/config.json`]: JSON.stringify({
          asset_registries: {
            skills: {
              source: '.skills',
              behavior: 'overwrite',
              description: 'skills',
              prefix: 'pair',
              targets: [{ path: '.claude/skills/', mode: 'canonical' }],
            },
          },
        }),
        [`${main}/${POLICY_PATH}`]:
          '## Eligibility\n\nrisk:green\n\n## Workflows\n\nauto-dev ⇒ pair-loop\n',
        [`${main}/.claude/skills/pair-loop/SKILL.md`]: '',
        [`${main}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
        '/bin/claude': '',
      },
      main,
      main,
    )
    const acquireLock = (({ card }: { card: string }) => ({
      kind: 'acquired' as const,
      lock: { path: `/locks/${card}`, release: () => {} },
    })) as LockAcquirer

    const code = await handleRunCommand(
      parseRunCommand({ card: '7', cardTags: 'risk:green' }),
      fs,
      {
        runIteration: async input => {
          spawned.push(input)
          return { outcome: 'success', detail: 'done' }
        },
        acquireLock,
        appendAudit: () => {},
        cardReadiness: async () => 'ready' as const,
      },
    )

    const output = lines.join('\n')
    expect(code).not.toBe(0)
    expect(output).toContain('incompatible')
    expect(output).toContain('schemaVersion 2 != 3')
    expect(output).toMatch(/migrate-acknowledge/)
    expect(spawned).toHaveLength(0)
  }, 60_000)
})
