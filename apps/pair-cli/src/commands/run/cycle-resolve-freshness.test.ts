import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync } from 'child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { hostname, tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createDefaultCycleDriver, readCardTier, readPrLabels } from './cycle-wiring'
import { CYCLE_WORKFLOW_VERSION, CYCLE_BASE_BRANCH_DEFAULT } from './cycle-scripts'
import { ENGINES } from './engines'
import { telemetryFile } from './telemetry'

/**
 * US-487 review r0-3 — every `resolve` the process coordinator runs carries the freshness evidence
 * the in-session coordinator's Step 1 passes: the effective-inputs digest (`cycle-state.mjs inputs
 * --story <card JSON>`), the card's canonical AC hash (`ac-hash`) and the remote head. Without them
 * `cycle-state` cannot see a card edited, an input changed or a head moved after approval, and a
 * converged run directory re-invoked through `pair-cli` reports `done` ⇒ `ready-for-merge`.
 *
 * The PRODUCTION driver over the REAL scripts (byte copies) in a throwaway repository; the run
 * directory is converged by publishing real handoffs through the copied `cycle-state.mjs`. Only
 * `gh` (the card) and the engine binary (a dead dispatch) are stood in for.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const SHA = (c: string) => c.repeat(40)
const BRANCH = 'feature/US-7-a-story'
const TITLE = 'A story'

interface CycleStateModule {
  publish(input: Record<string, unknown>): { published: boolean; reason?: string }
  resolve(input: Record<string, unknown>): { counters?: unknown; next: unknown; status: string }
}

describe('r0-3: resolve carries inputs, acHash and the remote head (production driver, real scripts)', () => {
  let root: string
  let main: string
  let log: string
  let cardBody: string

  const scripts = () => join(main, '.claude/skills/pair-workflow-cycle/scripts')
  const runDir = () => join(main, '.pair/working/runs/story-7/7')
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

  const writeGh = () =>
    writeFileSync(join(root, 'card.json'), JSON.stringify({ title: TITLE, body: cardBody }))

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-resolve-fresh-')))
    main = join(root, 'main')
    const bin = join(root, 'bin')
    log = join(root, 'engine.log')
    mkdirSync(main, { recursive: true })
    mkdirSync(bin, { recursive: true })
    git(main, 'init', '-q', '-b', 'main')
    git(
      main,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'init',
    )
    git(main, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    mkdirSync(scripts(), { recursive: true })
    for (const f of ['cycle-state.mjs', 'cycle-dispatch.mjs', 'host'])
      cpSync(join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts', f), join(scripts(), f), {
        recursive: true,
      })
    cpSync(join(REPO_ROOT, '.claude/agents'), join(main, '.claude/agents'), { recursive: true })
    mkdirSync(join(main, '.pair/adoption/tech'), { recursive: true })
    writeFileSync(
      join(main, '.pair/adoption/tech/way-of-working.md'),
      '## Assignment\n\n- `default-assignee`: `rucka` — the maintainer.\n',
    )

    cardBody = '**Status**: Refined\n\n## Task Breakdown\n\n- [ ] T-1\n'
    writeGh()
    // `gh issue view` answers the CURRENT card (title + body; `-q .body` for the AC hash);
    // `gh pr view` the PR's head branch. Anything else fails.
    writeFileSync(
      join(bin, 'gh'),
      `#!/usr/bin/env node
const a = process.argv.slice(2)
const card = JSON.parse(require('fs').readFileSync(${JSON.stringify(join(root, 'card.json'))}, 'utf8'))
if (a[0] === 'issue' && a[1] === 'view') process.stdout.write(a.includes('-q') ? card.body : JSON.stringify(card))
else if (a[0] === 'pr' && a[1] === 'view') process.stdout.write(${JSON.stringify(BRANCH)} + '\\n')
else process.exit(1)
`,
    )
    chmodSync(join(bin, 'gh'), 0o755)
    writeFileSync(
      join(bin, 'fake-engine'),
      `#!/usr/bin/env node
require('fs').appendFileSync(process.env.FAKE_ENGINE_LOG, JSON.stringify({ argv: process.argv.slice(2) }) + '\\n')
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success' }) + '\\n')
`,
    )
    chmodSync(join(bin, 'fake-engine'), 0o755)
    vi.stubEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`)
    vi.stubEnv('PAIR_GH_BIN', join(bin, 'gh'))
    vi.stubEnv('FAKE_ENGINE_LOG', log)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  const spawnedPrompts = (): string[] =>
    existsSync(log)
      ? readFileSync(log, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(line => {
            const argv = (JSON.parse(line) as { argv: string[] }).argv
            return argv[argv.length - 1]!
          })
      : []

  /** The digest the driver must pass: the script's own, over the card object it dispatches with. */
  const scriptDigest = () =>
    (
      JSON.parse(
        execFileSync(
          'node',
          [
            join(scripts(), 'cycle-state.mjs'),
            'inputs',
            '--story',
            JSON.stringify({
              id: '7',
              branch: BRANCH,
              base: CYCLE_BASE_BRANCH_DEFAULT,
              title: TITLE,
            }),
            '--workflowVersion',
            CYCLE_WORKFLOW_VERSION,
          ],
          { encoding: 'utf8' },
        ),
      ) as { inputsDigest: string }
    ).inputsDigest

  /** A converged run: a0 sealed + implemented, r0 approved and ready on its reviewed head. */
  async function converge(reviewInputs: string): Promise<void> {
    const state = (await import(
      pathToFileURL(join(scripts(), 'cycle-state.mjs')).href
    )) as CycleStateModule
    mkdirSync(runDir(), { recursive: true })
    const publish = (phase: string, skill: string, fields: object, predecessor?: string) => {
      const file = join(runDir(), `tmp-${phase}-${skill}.json`)
      writeFileSync(
        file,
        JSON.stringify({
          run: 'story-7',
          story: '7',
          pr: 7,
          branch: BRANCH,
          phase,
          skill,
          inputHead: SHA('a'),
          ...fields,
        }),
      )
      const out = state.publish({
        dir: runDir(),
        file,
        phase,
        skill,
        workflowVersion: CYCLE_WORKFLOW_VERSION,
        predecessor,
      })
      expect(out.published, JSON.stringify(out)).toBe(true)
    }
    const hash = `sha256:${'1'.repeat(64)}`
    publish('a0', 'red-spec', {
      status: 'red',
      mode: 'initial',
      contractPath: '/abs/a0.json',
      contractHash: hash,
      inputsDigest: reviewInputs,
    })
    publish(
      'a0',
      'red-verify',
      {
        verified: true,
        // US-506 AC10: a validated contract carries its execution evidence
        reproduced: [
          {
            rowId: 'row-1',
            baseline: 'red',
            command: 'node --test x.test.mjs',
            exitCode: 1,
            observed: 'FAIL',
          },
        ],
        findings: [],
        sealed: true,
        snapshot: SHA('b'),
        contractHash: hash,
        inputsDigest: reviewInputs,
      },
      'a0-red-spec',
    )
    publish('a0', 'implement-phase', {
      status: 'ok',
      prNumber: 7,
      outputHead: SHA('c'),
      gatesPassed: true,
      inputsDigest: reviewInputs,
    })
    publish('r0', 'review-phase', {
      reviewedHead: SHA('c'),
      // The reviewer records the card it judged; publish re-stamps it with the script's own hash.
      acHash: 'the card the review judged',
      verdict: 'APPROVED',
      findings: [],
      custody: { verified: true, contractBreach: false },
      readiness: { ready: true, remoteHead: SHA('c') },
      mode: 'first',
      inputsDigest: reviewInputs,
    })
  }

  const drive = (telemetryEnabled = false, engine: 'pi' | 'claude' | 'codex' = 'claude') =>
    createDefaultCycleDriver({
      engine: { ...ENGINES[engine], command: join(root, 'bin', 'fake-engine') },
      cwd: main,
      fs: new InMemoryFileSystemService({}, main, main),
      location: { scriptsDir: scripts() },
      autonomyArgs: [],
      timeoutSeconds: 60,
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
      telemetryEnabled,
    })({ runId: 'story-7', card: '7', pr: 7 })

  it('#601 r0-6: real host recovery preserves all four resolver budgets and counters across resume', async () => {
    await converge(scriptDigest())
    const state = (await import(
      pathToFileURL(join(scripts(), 'cycle-state.mjs')).href
    )) as CycleStateModule
    const policy = {
      redRepairs: 3,
      greenRetries: 2,
      maxFixRounds: 7,
      deadDispatchRetries: 4,
      autoRecoveryRounds: 5,
    }
    const actualPolicy = { ...policy, deadDispatchRetries: 1 }
    const snapshot = () => {
      const { counters, next, status } = state.resolve({
        dir: runDir(),
        workflowVersion: CYCLE_WORKFLOW_VERSION,
        entry: 'pr',
        pr: 7,
        policy,
      })
      return { counters, next, status }
    }
    const baseline = snapshot()
    expect(baseline.counters).toBeDefined()
    const snapshotActual = () => {
      const {
        counters,
        next,
        status,
        policy: resolvedPolicy,
      } = state.resolve({
        dir: runDir(),
        workflowVersion: CYCLE_WORKFLOW_VERSION,
        entry: 'pr',
        pr: 7,
        policy: actualPolicy,
      }) as ReturnType<CycleStateModule['resolve']> & { policy: Record<string, unknown> }
      return {
        counters,
        next,
        status,
        protectedPolicy: Object.fromEntries(
          ['redRepairs', 'greenRetries', 'maxFixRounds', 'deadDispatchRetries'].map(key => [
            key,
            resolvedPolicy[key],
          ]),
        ),
      }
    }
    const baselineActual = snapshotActual()
    expect(baselineActual.protectedPolicy).toEqual({
      redRepairs: 3,
      greenRetries: 2,
      maxFixRounds: 7,
      deadDispatchRetries: 1,
    })
    const policyLog = join(root, 'resolve-policies')
    const statePath = join(scripts(), 'cycle-state.mjs')
    const stateSource = readFileSync(statePath, 'utf8')
    const eol = stateSource.indexOf('\n')
    writeFileSync(
      statePath,
      `${stateSource.slice(0, eol + 1)}import { appendFileSync as auditPolicy601 } from 'node:fs'\nif (process.argv[2] === 'resolve') auditPolicy601(${JSON.stringify(policyLog)}, JSON.stringify(JSON.parse(process.argv[process.argv.indexOf('--policy') + 1])) + '\\n')\n${stateSource.slice(eol + 1)}`,
    )
    const observedPolicy = () => {
      const lines = readFileSync(policyLog, 'utf8').trim().split('\n')
      return JSON.parse(lines[lines.length - 1]!) as Record<string, unknown>
    }
    const mode = join(root, 'host-mode')
    const attempts = join(root, 'host-attempts')
    writeFileSync(
      join(root, 'bin', 'gh'),
      `#!/usr/bin/env node
const fs = require('fs'), a = process.argv.slice(2), card = JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'card.json'))}, 'utf8'))
if (a[0] === 'issue' && a[1] === 'view' && a.includes('-q')) {
  const mode = fs.readFileSync(${JSON.stringify(mode)}, 'utf8'), n = Number(fs.readFileSync(${JSON.stringify(attempts)}, 'utf8')) + 1
  fs.writeFileSync(${JSON.stringify(attempts)}, String(n))
  if (mode === 'exhaust' || (mode === 'recover' && n === 1)) { process.stderr.write('HTTP 503 Retry-After: ' + (mode === 'exhaust' ? '31' : '0')); process.exit(1) }
  process.stdout.write(card.body)
} else if (a[0] === 'issue' && a[1] === 'view') process.stdout.write(JSON.stringify(card))
else if (a[0] === 'pr' && a[1] === 'view') process.stdout.write(${JSON.stringify(BRANCH)} + '\\n')
else process.exit(1)
`,
    )
    const run = () =>
      createDefaultCycleDriver({
        engine: { ...ENGINES.claude, command: join(root, 'bin', 'fake-engine') },
        cwd: main,
        fs: new InMemoryFileSystemService({}, main, main),
        location: { scriptsDir: scripts() },
        autonomyArgs: [],
        timeoutSeconds: 60,
        workflowVersion: CYCLE_WORKFLOW_VERSION,
        baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
      })({
        runId: 'story-7',
        card: '7',
        pr: 7,
        budgets: { maxFixRounds: 7, autoRecoveryRounds: 5 },
      })
    const recoveryFile = join(runDir(), 'recovery.json')
    writeFileSync(mode, 'recover')
    writeFileSync(attempts, '0')
    const recovered = await run()
    expect(recovered.status).toBe('ready-for-merge')
    expect(Number(readFileSync(attempts, 'utf8'))).toBeGreaterThanOrEqual(2)
    expect(existsSync(recoveryFile)).toBe(false)
    expect(snapshot()).toEqual(baseline)
    expect(snapshotActual()).toEqual(baselineActual)
    expect(observedPolicy()).toMatchObject({ redRepairs: 3, greenRetries: 2, maxFixRounds: 7 })
    expect(observedPolicy()['deadDispatchRetries']).toBeUndefined()
    writeFileSync(mode, 'exhaust')
    writeFileSync(attempts, '0')
    const exhausted = await run()
    expect(exhausted.status).toBe('awaiting-human')
    expect(exhausted.resumeToken).toContain('host-transient')
    expect(JSON.parse(readFileSync(recoveryFile, 'utf8')).rounds).toHaveLength(1)
    expect(snapshot()).toEqual(baseline)
    expect(snapshotActual()).toEqual(baselineActual)
    writeFileSync(mode, 'healthy')
    writeFileSync(attempts, '0')
    const resumed = await run()
    expect(resumed.status).toBe('ready-for-merge')
    expect(JSON.parse(readFileSync(recoveryFile, 'utf8')).rounds).toHaveLength(1)
    expect(snapshot()).toEqual(baseline)
    expect(snapshotActual()).toEqual(baselineActual)
    expect(observedPolicy()).toMatchObject({ redRepairs: 3, greenRetries: 2, maxFixRounds: 7 })
    expect(observedPolicy()['deadDispatchRetries']).toBeUndefined()
  }, 60000)

  it.each(['pi', 'claude', 'codex'] as const)(
    'US-601 AC3/AC5: %s parks an exhausted first resolver read without spawning a stage',
    async engine => {
      const attempts = join(root, 'card-attempts')
      writeFileSync(
        join(root, 'bin', 'gh'),
        `#!/usr/bin/env node
const a = process.argv.slice(2)
if (a[0] === 'issue' && a[1] === 'view' && a.includes('-q')) {
  require('fs').appendFileSync(${JSON.stringify(attempts)}, '1')
  process.stderr.write('HTTP 503 Retry-After: 31')
  process.exitCode = 1
} else if (a[0] === 'issue' && a[1] === 'view') {
  process.stdout.write(JSON.stringify({ title: 'A story', body: '**Status**: Refined\\n\\n## Task Breakdown\\n\\n- [ ] T-1\\n' }))
} else if (a[0] === 'pr' && a[1] === 'view') process.stdout.write(${JSON.stringify(BRANCH)} + '\\n')
else process.exitCode = 1
`,
      )

      const outcome = await drive(true, engine)

      expect(outcome.status).toBe('awaiting-human')
      expect(outcome.resumeToken).toContain('host-transient')
      expect(spawnedPrompts()).toHaveLength(0)
      expect(readFileSync(attempts, 'utf8')).toHaveLength(1)
      expect(
        (JSON.parse(readFileSync(join(runDir(), 'recovery.json'), 'utf8')) as { rounds: unknown[] })
          .rounds,
      ).toHaveLength(1)
      expect(
        readFileSync(telemetryFile(main), 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line)),
      ).toContainEqual(expect.objectContaining({ kind: 'card', outcome: 'awaiting-human' }))
    },
    60_000,
  )

  it('US-601 AC1: an exhausted decision comment read cannot become no decision', async () => {
    writeFileSync(
      join(root, 'bin', 'gh'),
      `#!/usr/bin/env node
const a = process.argv.slice(2)
const card = ${JSON.stringify({ title: TITLE, body: '**Status**: Refined\n\n## Task Breakdown\n\n- [ ] T-1\n' })}
if (a[0] === 'issue' && a[1] === 'view') process.stdout.write(a.includes('-q') ? card.body : JSON.stringify(card))
else if (a[0] === 'pr' && a[1] === 'view') process.stdout.write(${JSON.stringify(BRANCH)} + '\\n')
else if (a[0] === 'api' && a.some(x => x.includes('/comments'))) {
  process.stderr.write('HTTP 503 Retry-After: 31')
  process.exitCode = 1
} else process.exitCode = 1
`,
    )

    const outcome = await drive()

    expect(outcome.status).toBe('awaiting-human')
    expect(outcome.resumeToken).toContain('host-transient')
    expect(spawnedPrompts()).toHaveLength(0)
  }, 60_000)

  it.each(['7', BRANCH])('US-601 AC1: live PR policy labels retry for %s', async ref => {
    const attempts = join(root, 'label-attempts')
    writeFileSync(
      join(root, 'bin', 'gh'),
      `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2)
if (args[0] === 'api' && args.some(arg => arg.includes('/issues/7/labels'))) {
  const n = Number(fs.existsSync(${JSON.stringify(attempts)}) ? fs.readFileSync(${JSON.stringify(attempts)}, 'utf8') : 0) + 1
  fs.writeFileSync(${JSON.stringify(attempts)}, String(n))
  if (n === 1) { process.stderr.write('HTTP 503'); process.exit(1) }
  process.stdout.write(JSON.stringify([{ name: 'risk:red' }]))
} else if (args[0] === 'pr' && args[1] === 'view') {
  process.stdout.write(JSON.stringify({ number: 7 }))
} else process.exit(1)
`,
    )

    expect(await readPrLabels(ref, main)).toEqual(['risk:red'])
    expect(readFileSync(attempts, 'utf8')).toBe('2')
  })

  it('US-601 AC1: an exhausted card tier read cannot become missing policy', async () => {
    writeFileSync(
      join(root, 'bin', 'gh'),
      `#!/usr/bin/env node
process.stderr.write('HTTP 503 Retry-After: 31')
process.exit(1)
`,
    )
    await expect(readCardTier('7', main)).rejects.toThrow(/host-transient/)
  })

  it('US-601 AC1: an exhausted PR tier read cannot become missing policy', async () => {
    writeFileSync(
      join(root, 'bin', 'gh'),
      `#!/usr/bin/env node
process.stderr.write('HTTP 503 Retry-After: 31')
process.exit(1)
`,
    )
    await expect(readPrLabels('7', main)).rejects.toThrow(/host-transient/)
  })

  it('US-601 AC3: an exhausted card read before coordinates parks the run', async () => {
    writeFileSync(
      join(root, 'bin', 'gh'),
      `#!/usr/bin/env node
if (process.argv[2] === 'issue') {
  process.stderr.write('HTTP 503 Retry-After: 31')
  process.exitCode = 1
} else process.exitCode = 1
`,
    )

    const outcome = await drive()

    expect(outcome.status).toBe('awaiting-human')
    expect(outcome.resumeToken).toContain('host-transient')
    expect(spawnedPrompts()).toHaveLength(0)
  }, 60_000)

  it('R3-C1: a converged run whose card, inputs and head are unchanged ⇒ ready-for-merge, nothing spawned', async () => {
    await converge(scriptDigest())

    const outcome = await drive()

    expect(outcome.status).toBe('ready-for-merge')
    expect(spawnedPrompts()).toHaveLength(0)
  }, 60_000)

  it('US-601 AC5: a recovered decision read reaches the driver audit without host stderr', async () => {
    await converge(scriptDigest())
    const attempts = join(root, 'comment-attempts')
    writeFileSync(
      join(root, 'bin', 'gh'),
      `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2)
const card = ${JSON.stringify({ title: TITLE, body: cardBody })}
if (args[0] === 'issue' && args[1] === 'view') process.stdout.write(args.includes('-q') ? card.body : JSON.stringify(card))
else if (args[0] === 'pr' && args[1] === 'view') process.stdout.write(${JSON.stringify(BRANCH)} + '\\n')
else if (args[0] === 'api' && args.some(arg => arg.includes('/comments'))) {
  const n = Number(fs.existsSync(${JSON.stringify(attempts)}) ? fs.readFileSync(${JSON.stringify(attempts)}, 'utf8') : 0) + 1
  fs.writeFileSync(${JSON.stringify(attempts)}, String(n))
  if (n === 1) { process.stderr.write('HTTP 503 credential-should-stay-private'); process.exit(1) }
  process.stdout.write('[]')
} else process.exit(1)
`,
    )
    const lines: string[] = []
    vi.mocked(console.log).mockImplementation((...args: unknown[]) =>
      lines.push(args.map(String).join(' ')),
    )

    const outcome = await drive()

    expect(outcome.status).toBe('ready-for-merge')
    expect(lines).toContain('  HOST-RETRY: operation=gh:api:read attempt=1 outcome=retry')
    expect(lines).toContain('  HOST-RETRY: operation=gh:api:read attempt=2 outcome=recovered')
    expect(lines.join('\n')).not.toContain('credential-should-stay-private')
    expect(spawnedPrompts()).toHaveLength(0)
  }, 60_000)

  it('#601 AC3 / #602 AC6: decision host failure does not recover a foreign worktree', async () => {
    await converge(scriptDigest())
    git(
      main,
      'worktree',
      'add',
      '-q',
      '-b',
      'someone-else',
      join(root, 'pair-worktrees', 'main', '7'),
    )
    const marker = join(root, 'decision-host-failed')
    const recovery = join(runDir(), 'recovery.json')
    const before = existsSync(recovery) ? readFileSync(recovery, 'utf8') : undefined
    writeFileSync(
      join(root, 'bin', 'gh'),
      `#!/usr/bin/env node
const fs = require('fs')
const a = process.argv.slice(2)
const card = ${JSON.stringify({ title: TITLE, body: cardBody })}
if (a[0] === 'issue' && a[1] === 'view') process.stdout.write(a.includes('-q') ? card.body : JSON.stringify(card))
else if (a[0] === 'pr' && a[1] === 'view') process.stdout.write(${JSON.stringify(BRANCH)} + '\\n')
else if (a[0] === 'api' && a.some(x => x.includes('/comments'))) { fs.writeFileSync(${JSON.stringify(marker)}, 'seen'); process.stderr.write('HTTP 503 Retry-After: 31'); process.exit(1) }
else process.exit(1)
`,
    )

    const outcome = await drive()

    expect(existsSync(marker)).toBe(true)
    expect(outcome.status).toBe('worktree-conflict')
    expect(existsSync(recovery) ? readFileSync(recovery, 'utf8') : undefined).toBe(before)
    expect(spawnedPrompts()).toHaveLength(0)
  }, 60_000)

  it('#601 AC3 / #602 AC6: decision host failure parks after verifying a usable worktree', async () => {
    await converge(scriptDigest())
    const marker = join(root, 'decision-host-failed')
    writeFileSync(
      join(root, 'bin', 'gh'),
      `#!/usr/bin/env node
const fs = require('fs')
const a = process.argv.slice(2)
const card = ${JSON.stringify({ title: TITLE, body: cardBody })}
if (a[0] === 'issue' && a[1] === 'view') process.stdout.write(a.includes('-q') ? card.body : JSON.stringify(card))
else if (a[0] === 'pr' && a[1] === 'view') process.stdout.write(${JSON.stringify(BRANCH)} + '\\n')
else if (a[0] === 'api' && a.some(x => x.includes('/comments'))) { fs.writeFileSync(${JSON.stringify(marker)}, 'seen'); process.stderr.write('HTTP 503 Retry-After: 31'); process.exit(1) }
else process.exit(1)
`,
    )

    const outcome = await drive()

    expect(existsSync(marker)).toBe(true)
    expect(outcome.status).toBe('awaiting-human')
    expect(outcome.resumeToken).toContain('host-transient')
    expect(existsSync(join(runDir(), 'recovery.json'))).toBe(true)
  }, 60_000)

  it('R3-W1: the card body (its ACs) changed after approval ⇒ a re-review is dispatched, never ready-for-merge', async () => {
    await converge(scriptDigest())
    cardBody = `${cardBody}\n## Acceptance Criteria\n\n1. **Given** a new AC **When** it runs **Then** it holds\n`
    writeGh()

    const outcome = await drive()

    expect(outcome.status).not.toBe('ready-for-merge')
    expect(spawnedPrompts()[0]).toMatch(/^\/pair-workflow-review-phase /)
  }, 60_000)

  it('R3-W4 (#573 run): the card read at driver start is stale by the time resolve runs ⇒ resolve uses the live AC hash, no re-review loop', async () => {
    await converge(scriptDigest())
    // The first `-q` read (driver setup) still sees the pre-edit card; every later read sees the card the review judged.
    const edited = cardBody
    cardBody = `${edited}\n<!-- pre-edit -->\n`
    writeFileSync(
      join(root, 'card.json'),
      JSON.stringify({ title: TITLE, body: edited, stale: cardBody }),
    )
    writeFileSync(
      join(root, 'bin', 'gh'),
      `#!/usr/bin/env node
const fs = require('fs')
const a = process.argv.slice(2)
const card = JSON.parse(fs.readFileSync(${JSON.stringify(join(root, 'card.json'))}, 'utf8'))
const seen = ${JSON.stringify(join(root, 'seen'))}
if (a[0] === 'issue' && a[1] === 'view') {
  if (a.includes('-q')) {
    const first = !fs.existsSync(seen)
    fs.writeFileSync(seen, '1')
    process.stdout.write(first ? card.stale : card.body)
  } else process.stdout.write(JSON.stringify({ title: card.title, body: card.body }))
} else if (a[0] === 'pr' && a[1] === 'view') process.stdout.write(${JSON.stringify(BRANCH)} + '\\n')
else process.exit(1)
`,
    )

    const outcome = await drive()

    expect(outcome.status).toBe('ready-for-merge')
    expect(spawnedPrompts()).toHaveLength(0)
  }, 60_000)

  it('R3-W2: the effective inputs changed after approval ⇒ a re-review is dispatched, never ready-for-merge', async () => {
    await converge('0000000000000000')

    const outcome = await drive()

    expect(outcome.status).not.toBe('ready-for-merge')
    expect(spawnedPrompts()[0]).toMatch(/^\/pair-workflow-review-phase /)
  }, 60_000)

  it('R1-I2 (r0-1 × driver): a card with no `**Status**:` line (its board state read upstream from the project item) is driven, never refused card-status-unreadable', async () => {
    await converge(scriptDigest())
    cardBody = '## Task Breakdown\n\n- [ ] T-1\n'
    writeGh()

    const outcome = await drive().catch((error: unknown) => ({
      status: `threw ${error instanceof Error ? error.message : String(error)}`,
    }))

    expect(outcome.status).not.toMatch(/card-status-unreadable/)
  }, 60_000)

  it('#691 AC5: a live run already holds the card run dir ⇒ run-locked naming its pid and host, no handoff touched, nothing spawned', async () => {
    await converge(scriptDigest())
    const lock = { pid: process.pid, host: hostname(), startedAt: '2026-11-19T00:00:00Z' }
    writeFileSync(join(runDir(), 'run.lock'), JSON.stringify(lock))
    // the host binding (`.host-binding.json`) is resolved before the lock; handoffs are what must not move
    const handoffs = () =>
      readdirSync(runDir())
        .filter(f => !f.startsWith('.'))
        .sort()
    const before = handoffs()

    const outcome = await drive()

    expect(outcome.status).toBe('run-locked')
    expect(outcome.reason).toContain(`pid ${process.pid}`)
    expect(outcome.reason).toContain(hostname())
    expect(handoffs()).toEqual(before)
    expect(JSON.parse(readFileSync(join(runDir(), 'run.lock'), 'utf8'))).toEqual(lock)
    expect(spawnedPrompts()).toHaveLength(0)
  }, 60_000)

  it('#601 AC3 / #691 AC5: an unavailable host cannot change recovery while a live run holds the lock', async () => {
    await converge(scriptDigest())
    const lock = { pid: process.pid, host: hostname(), startedAt: '2026-11-19T00:00:00Z' }
    const lockPath = join(runDir(), 'run.lock')
    const recoveryPath = join(runDir(), 'recovery.json')
    writeFileSync(lockPath, JSON.stringify(lock))
    const before = existsSync(recoveryPath) ? readFileSync(recoveryPath, 'utf8') : undefined
    writeFileSync(
      join(root, 'bin', 'gh'),
      `#!/usr/bin/env node\nprocess.stderr.write('HTTP 503 Retry-After: 31');process.exitCode = 1\n`,
    )

    const outcome = await drive()

    expect(outcome.status).toBe('run-locked')
    expect(existsSync(recoveryPath) ? readFileSync(recoveryPath, 'utf8') : undefined).toBe(before)
    expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toEqual(lock)
    expect(spawnedPrompts()).toHaveLength(0)
  }, 60_000)

  it('R3-W3: the remote head moved past the reviewed head ⇒ a re-review is dispatched, never ready-for-merge', async () => {
    await converge(scriptDigest())
    const origin = join(root, 'origin.git')
    execFileSync('git', ['init', '-q', '--bare', origin])
    git(main, 'remote', 'add', 'origin', origin)
    git(main, 'push', '-q', 'origin', `HEAD:refs/heads/${BRANCH}`)

    const outcome = await drive()

    expect(outcome.status).not.toBe('ready-for-merge')
    expect(spawnedPrompts()[0]).toMatch(/^\/pair-workflow-review-phase /)
  }, 60_000)
})
