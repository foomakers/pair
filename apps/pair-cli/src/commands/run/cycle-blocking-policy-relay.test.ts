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
import { POLICY_PATH } from './blocking-severities'
import { CYCLE_WORKFLOW_VERSION, CYCLE_BASE_BRANCH_DEFAULT } from './cycle-scripts'
import { ENGINES } from './engines'

/**
 * US-514 r1-g1 (finding r0-1) — the console realization hands every STAGE the same policy it
 * resolves with. `publish` derives a review finding's `blocking` by comparing its severity's rank
 * with `policy.blockingFloor` (revised AC1: a floor, default `Minor`, never a list), and the review
 * stage only has the `$policy` its packet rendered: a declaration that reaches `resolve` but not the
 * packet never takes effect on a review finding.
 *
 * Runs the PRODUCTION driver over byte-for-byte copies of the real scripts in a throwaway git
 * repository. Hermetic: `gh` and the engine are stubs on a PATH that starts with them; the engine
 * records its argv (the prompt is the last argument) and publishes no handoff.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')

describe('run --card relays the declared blocking policy into every stage packet (US-514 r0-1)', () => {
  let root: string
  let main: string
  let log: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-us514-relay-')))
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
} else if (a[0] === 'pr' && a[1] === 'view') {
  process.stdout.write('feature/US-7-a-story\\n')
} else process.exit(1)
`,
    )
    chmodSync(gh, 0o755)

    const engine = join(bin, 'fake-engine')
    writeFileSync(
      engine,
      `#!/usr/bin/env node
require('fs').appendFileSync(process.env.FAKE_ENGINE_LOG, JSON.stringify({ argv: process.argv.slice(2) }) + '\\n')
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success' }) + '\\n')
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

  const firstPrompt = (): string => {
    expect(existsSync(log)).toBe(true)
    const [first] = readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as { argv: string[] })
    return first!.argv[first!.argv.length - 1]!
  }

  /** The `$policy=<json>` the packet rendered, parsed by brace depth. */
  const policyOf = (prompt: string): Record<string, unknown> => {
    const i = prompt.indexOf('$policy=')
    expect(i).toBeGreaterThanOrEqual(0)
    const start = i + '$policy='.length
    let depth = 0
    for (let j = start; j < prompt.length; j++) {
      if (prompt[j] === '{') depth++
      else if (prompt[j] === '}' && --depth === 0)
        return JSON.parse(prompt.slice(start, j + 1)) as Record<string, unknown>
    }
    throw new Error('unterminated $policy')
  }

  const driveReview = (files: Record<string, string>) =>
    createDefaultCycleDriver({
      engine: { ...ENGINES.claude, command: join(root, 'bin', 'fake-engine') },
      cwd: main,
      fs: new InMemoryFileSystemService(files, main, main),
      location: { scriptsDir: join(main, '.claude/skills/pair-workflow-cycle/scripts') },
      autonomyArgs: [],
      timeoutSeconds: 60,
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
    })({ runId: 'story-7', card: '7', pr: 42 })

  it('g1-w7: a declared floor `Major` reaches the review-phase packet as $policy.blockingFloor', async () => {
    await driveReview({
      [`${main}/${POLICY_PATH}`]: '# Automation\n\n## Blocking Severities\n\nMajor\n',
    })

    const prompt = firstPrompt()
    expect(prompt.startsWith('/pair-workflow-review-phase ')).toBe(true)
    expect(policyOf(prompt)['blockingFloor']).toBe('Major')
    expect(policyOf(prompt)).not.toHaveProperty('blockingSeverities')
  }, 60_000)

  it('g1-w8: no declaration ⇒ the packet carries the SAME KB default the driver resolves with', async () => {
    await driveReview({})

    const prompt = firstPrompt()
    expect(prompt.startsWith('/pair-workflow-review-phase ')).toBe(true)
    expect(policyOf(prompt)['blockingFloor']).toBe('Minor')
    expect(policyOf(prompt)).not.toHaveProperty('blockingSeverities')
  }, 60_000)
})
