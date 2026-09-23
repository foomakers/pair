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
import { pathToFileURL } from 'url'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createDefaultCycleDriver } from './cycle-wiring'
import { CYCLE_WORKFLOW_VERSION, CYCLE_BASE_BRANCH_DEFAULT } from './cycle-scripts'
import { ENGINES } from './engines'

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
    for (const f of ['cycle-state.mjs', 'cycle-dispatch.mjs'])
      cpSync(join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts', f), join(scripts(), f))
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

  const drive = () =>
    createDefaultCycleDriver({
      engine: { ...ENGINES.claude, command: join(root, 'bin', 'fake-engine') },
      cwd: main,
      fs: new InMemoryFileSystemService({}, main, main),
      location: { scriptsDir: scripts() },
      autonomyArgs: [],
      timeoutSeconds: 60,
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
    })({ runId: 'story-7', card: '7', pr: 7 })

  it('R3-C1: a converged run whose card, inputs and head are unchanged ⇒ ready-for-merge, nothing spawned', async () => {
    await converge(scriptDigest())

    const outcome = await drive()

    expect(outcome.status).toBe('ready-for-merge')
    expect(spawnedPrompts()).toHaveLength(0)
  }, 60_000)

  it('R3-W1: the card body (its ACs) changed after approval ⇒ a re-review is dispatched, never ready-for-merge', async () => {
    await converge(scriptDigest())
    cardBody = `${cardBody}\n## Acceptance Criteria\n\n1. **Given** a new AC **When** it runs **Then** it holds\n`
    writeGh()

    const outcome = await drive()

    expect(outcome.status).not.toBe('ready-for-merge')
    expect(spawnedPrompts()[0]).toMatch(/^\/pair-workflow-review-phase /)
  }, 60_000)

  it('R3-W2: the effective inputs changed after approval ⇒ a re-review is dispatched, never ready-for-merge', async () => {
    await converge('0000000000000000')

    const outcome = await drive()

    expect(outcome.status).not.toBe('ready-for-merge')
    expect(spawnedPrompts()[0]).toMatch(/^\/pair-workflow-review-phase /)
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
