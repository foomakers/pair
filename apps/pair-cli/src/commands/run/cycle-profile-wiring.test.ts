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

  // US-488 r1-g1 (r0-1): every handoff records the profile the run REALLY used — a binding left by an
  // earlier invocation must not be stamped into a handoff a later, differently-profiled one publishes.
  const publishHandoff = (): { workflowProfile?: { name?: string } } => {
    const dir = join(main, '.pair/working/runs/story-7/7')
    const draft = join(root, 'handoff-draft.json')
    writeFileSync(
      draft,
      JSON.stringify({
        run: 'story-7',
        story: '7',
        pr: 7,
        branch: 'b',
        phase: 'a0',
        skill: 'implement-phase',
        inputHead: 'a'.repeat(40),
        status: 'ok',
        prNumber: 7,
        outputHead: 'c'.repeat(40),
        gatesPassed: true,
      }),
    )
    const out = JSON.parse(
      execFileSync(
        'node',
        [
          join(scriptsDir(), 'cycle-state.mjs'),
          'publish',
          ...['--dir', dir, '--file', draft, '--phase', 'a0', '--skill', 'implement-phase'],
          ...['--workflowVersion', CYCLE_WORKFLOW_VERSION, '--attempt', '1', '--pr', '7'],
        ],
        { encoding: 'utf8', cwd: main },
      ),
    ) as { path: string }
    return JSON.parse(readFileSync(out.path, 'utf8')) as { workflowProfile?: { name?: string } }
  }

  it('r0-1 witness: bound to A, then resumed zero-config — the handoff it publishes does not record A (AC7)', async () => {
    await drive({ profile: profile({ name: 'stale-a', stages: { implement: { model: 'm' } } }) })
    await drive()

    expect(publishHandoff().workflowProfile?.name).not.toBe('stale-a')
  }, 60_000)

  it('r0-1 control: bound to A, then resumed with profile B — the handoff records B (AC7)', async () => {
    await drive({ profile: profile({ name: 'stale-a', stages: { implement: { model: 'm' } } }) })
    const b = profile({ name: 'then-b', stages: { implement: { model: 'n' } } })
    await drive({ profile: b })

    expect(publishHandoff().workflowProfile).toMatchObject({ name: 'then-b', hash: b.hash })
  }, 60_000)

  // PR #517 finding: a mistyped model class is refused when the profile is LOADED — the run never
  // reaches a stage, so nothing is spawned and `--model frontir` is never sent to an engine.
  const loadThenDrive = async (body: Record<string, unknown>) => {
    let error: Error | undefined
    try {
      await drive({ profile: profile(body) })
    } catch (e) {
      error = e as Error
    }
    return error
  }

  it('PR517-W6: a mistyped class (`frontir`) is profile-invalid at load, naming stage, value and classes — no engine is spawned', async () => {
    const error = await loadThenDrive({ name: 'p', stages: { implement: { model: 'frontir' } } })

    expect(calls().map(c => c.argv.slice(0, -1).join(' '))).toEqual([])
    expect(error?.message).toMatch(/^profile-invalid: /)
    expect(error?.message).toContain('stages.implement.model')
    expect(error?.message).toContain("'frontir'")
    for (const c of ['cheap', 'balanced', 'frontier']) expect(error?.message).toContain(c)
  }, 60_000)

  it('PR517-C4: a valid class and a literal model id still load and spawn with the engine model flag', async () => {
    await drive({
      profile: profile({
        name: 'p',
        modelClasses: { frontier: 'm-frontier' },
        stages: { implement: { model: 'frontier' } },
      }),
    })
    const [first] = calls()
    expect(first!.argv[first!.argv.indexOf('--model') + 1]).toBe('m-frontier')

    rmSync(log)
    await drive({ profile: profile({ name: 'p', stages: { implement: { model: 'sonnet' } } }) })
    const [second] = calls()
    expect(second!.argv[second!.argv.indexOf('--model') + 1]).toBe('sonnet')
  }, 60_000)
})
