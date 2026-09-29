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
import {
  createCycleScriptsBridge,
  CYCLE_WORKFLOW_VERSION,
  CYCLE_BASE_BRANCH_DEFAULT,
} from './cycle-scripts'
import { ENGINES, type EngineDefinition } from './engines'
import { buildEngineArgs } from './spawn'
import { resolveWorkflowProfile } from './workflow-profile'

/**
 * US-488 T-5 — the profile reaches the PRODUCTION driver: per-stage model and engine at spawn, the
 * run binding, the context policy at `resolve`. Same harness as `cycle-driver-wiring.test.ts`: real
 * scripts, a real git repository, only `gh` and the engine binary stood in for.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const ROLE_LINE = 'You are the **implementer** for a single Pair user story'

interface EngineCall {
  readonly argv: readonly string[]
}

describe('the workflow profile at the production driver (US-488 T-5)', () => {
  let root: string
  let main: string
  let log: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-cycle-profile-')))
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
    for (const f of ['cycle-state.mjs', 'cycle-dispatch.mjs', 'workflow-profile.mjs', 'host'])
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
    for (const name of ['fake-claude', 'fake-pi']) {
      const engine = join(bin, name)
      writeFileSync(
        engine,
        `#!/usr/bin/env node
require('fs').appendFileSync(process.env.FAKE_ENGINE_LOG, JSON.stringify({ engine: '${name}', argv: process.argv.slice(2) }) + '\\n')
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success' }) + '\\n')
process.stdout.write(JSON.stringify({ type: 'agent_settled' }) + '\\n')
`,
      )
      chmodSync(engine, 0o755)
    }
    vi.stubEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`)
    vi.stubEnv('FAKE_ENGINE_LOG', log)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  const scriptsDir = () => join(main, '.claude/skills/pair-workflow-cycle/scripts')
  const calls = (): (EngineCall & { engine: string })[] =>
    existsSync(log)
      ? readFileSync(log, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(l => JSON.parse(l) as EngineCall & { engine: string })
      : []
  const defOf = (id: 'claude' | 'pi'): EngineDefinition => ({
    ...ENGINES[id],
    command: join(root, 'bin', `fake-${id === 'claude' ? 'claude' : 'pi'}`),
  })
  const profile = (body: Record<string, unknown>) => {
    writeFileSync(join(main, 'p.json'), JSON.stringify(body))
    return resolveWorkflowProfile(scriptsDir(), { root: main, workflowConfig: 'p.json' })
  }
  const drive = (extra: Record<string, unknown> = {}) =>
    createDefaultCycleDriver({
      engine: defOf('claude'),
      cwd: main,
      fs: new InMemoryFileSystemService({}, main, main),
      location: { scriptsDir: scriptsDir() },
      autonomyArgs: [],
      timeoutSeconds: 60,
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
      ...extra,
    })({ runId: 'story-7', card: '7' })

  it('the stage the profile gives a model is spawned with the engine’s model flag; without a profile, no model flag (AC9)', async () => {
    await drive({ profile: profile({ name: 'p', stages: { implement: { model: 'the-model' } } }) })
    const [first] = calls()
    expect(first!.argv).toContain('--model')
    expect(first!.argv[first!.argv.indexOf('--model') + 1]).toBe('the-model')

    rmSync(log)
    await drive()
    expect(calls().length).toBeGreaterThan(0)
    for (const c of calls()) expect(c.argv).not.toContain('--model')
  }, 60_000)

  it('a stage that names another engine runs on THAT engine, with its own style and model, never the run’s', async () => {
    await drive({
      profile: profile({
        name: 'p',
        defaults: { model: 'run-wide-never' },
        stages: { implement: { engine: 'pi', model: 'pi-model' } },
      }),
      stageEngines: { pi: { engine: defOf('pi'), autonomyArgs: ['--pi-autonomy'] } },
    })

    const [first] = calls()
    expect(first!.engine).toBe('fake-pi')
    expect(first!.argv.slice(0, 2)).toEqual(['--mode', 'json'])
    expect(first!.argv).toContain('--pi-autonomy')
    expect(first!.argv[first!.argv.indexOf('--model') + 1]).toBe('pi-model')
    const prompt = first!.argv[first!.argv.length - 1]!
    expect(prompt.startsWith(ROLE_LINE)).toBe(true) // pi's `instruction` rendering, not claude's slash
  }, 60_000)

  it('binds the resolved profile to the run directory once, so every handoff records it (AC7)', async () => {
    const resolved = profile({ name: 'bound-one', stages: { implement: { model: 'm' } } })
    await drive({ profile: resolved })

    const bound = JSON.parse(
      readFileSync(join(main, '.pair/working/runs/story-7/7/.workflow-profile.json'), 'utf8'),
    ) as { name: string; hash: string }
    expect(bound).toMatchObject({ name: 'bound-one', hash: resolved.hash })
  }, 60_000)

  it('no profile: nothing is bound and the run directory is exactly what it was (AC9)', async () => {
    await drive()

    expect(existsSync(join(main, '.pair/working/runs/story-7/7/.workflow-profile.json'))).toBe(
      false,
    )
  }, 60_000)

  it('the profile’s contextPolicy reaches the real `resolve`: an admissible transition is accepted, a forbidden one refused', () => {
    const bridge = createCycleScriptsBridge({ scriptsDir: scriptsDir() }, main)
    const base = {
      dir: join(main, '.pair/working/runs/r/7'),
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      policy: {},
      entry: 'fresh',
      story: '7',
    }
    expect(bridge.resolve({ ...base, contextPolicy: { 'green->green': 'reuse' } }).status).toBe(
      'empty',
    )
    expect(() =>
      bridge.resolve({ ...base, contextPolicy: { 'validate->validate': 'reuse' } }),
    ).toThrow(/context-policy-invalid/)
  })

  it('effort is sent only to an engine that declares an effort flag; none is invented for the others', () => {
    const args = (engine: EngineDefinition, effort: string | undefined) =>
      buildEngineArgs({ engine, promptText: 'p', cwd: '/w', autonomyArgs: [], effort })

    expect(args({ ...ENGINES.claude, effortFlag: '--effort' }, 'high')).toEqual(
      expect.arrayContaining(['--effort', 'high']),
    )
    expect(args({ ...ENGINES.claude, effortFlag: '--effort' }, undefined)).not.toContain('--effort')
    expect(args(ENGINES.claude, 'high')).not.toContain('high')
  })
})
