import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync } from 'child_process'
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
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createDefaultCycleDriver } from './cycle-wiring'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import type { LockAcquirer } from './card-lock'
import { CYCLE_WORKFLOW_VERSION, CYCLE_BASE_BRANCH_DEFAULT } from './cycle-scripts'
import { ENGINES, type EngineDefinition } from './engines'

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
      cpSync(join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts', f), join(scripts, f), { recursive: true })
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
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success' }) + '\\n')
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

  const drive = (engine: EngineDefinition, pr?: number) =>
    createDefaultCycleDriver({
      engine: { ...engine, command: join(root, 'bin', 'fake-engine') },
      cwd: main,
      fs: new InMemoryFileSystemService({}, main, main),
      location: { scriptsDir: join(main, '.claude/skills/pair-workflow-cycle/scripts') },
      autonomyArgs: [],
      timeoutSeconds: 60,
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
    })({ runId: 'story-7', card: '7', ...(pr !== undefined && { pr }) })

  it("a success event with a NOT-advanced handoff is a dead dispatch, retried exactly the ONCE cycle-state's own budget allows (AC4, AC5)", async () => {
    const outcome = await drive(ENGINES.claude)

    expect(calls()).toHaveLength(2) // the stage, plus the one retry — never a third
    expect(outcome.status).toBe('failed-implement')
    expect(outcome.stagesRun).toBe(2)
  }, 60_000)

  it('creates the story worktree through the real cycle-dispatch, and starts the stage in the MAIN checkout (AC1)', async () => {
    await drive(ENGINES.claude)

    expect(existsSync(join(root, 'pair-worktrees', '7'))).toBe(true)
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
    expect(outcome.status).toBe('failed-verify')
  }, 60_000)

  it('opencode, which does the file work but publishes no handoff, ends failed-<step> — never claimed complete (AC13 known limitation)', async () => {
    // The canary's opencode leg, as the driver sees it: every stage exits with a success event and
    // no handoff. AC13 does not claim opencode completes; what the driver owes is to SAY so — a
    // bounded dead dispatch and a failed status, never a `ready-for-merge` it did not reach.
    const outcome = await drive(ENGINES.opencode)

    expect(calls()).toHaveLength(2)
    expect(outcome.status).toBe('failed-implement')
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

  it('AC9/AC12 (resolve status other-run): a cycle another realization started under another runId is CONTINUED on that runId, never crashed on and never restarted', async () => {
    // The batch engine published a0-red-spec under its own run id; this invocation asks for
    // story-7. resolve answers `other-run` (no `next`) — the in-session coordinator's rule, the
    // one this realization must share: adopt that run id and resolve again.
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

  it('AC1/AC11 (worktree-conflict): the story worktree path checked out on ANOTHER branch HALTs the run with the halt verbatim, before any spawn', async () => {
    // The card's edge case: "cycle-dispatch reports worktree-conflict; the driver HALTs before any
    // spawn". A real conflicting worktree, so the halt is the real script's own.
    execFileSync(
      'git',
      ['worktree', 'add', '-q', '-b', 'someone-else', join(root, 'pair-worktrees', '7')],
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

  it('AC3/AC2 (verify cwd): the verify stage STARTS in the main checkout like every stage, and its $worktree names the DETACHED review worktree it cds into', async () => {
    // The one cwd rule (maintainer decision, a0 repair): every stage process starts in the MAIN
    // checkout, where the phase skills anchor the run directory; the verify packet's own
    // `$worktree` is the detached review worktree `<worktreeRoot>/<id>-review`, never the story tree.
    await drive(ENGINES.claude, 42)

    const [first] = calls()
    const prompt = first!.argv[first!.argv.length - 1]!
    expect(prompt.startsWith('/pair-workflow-review-phase ')).toBe(true)
    expect(realpathSync(first!.cwd)).toBe(main)
    expect(prompt).toMatch(/\$worktree=\S*pair-worktrees\/7-review(\s|$)/)
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
      cpSync(join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts', f), join(scripts, f), { recursive: true })
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
