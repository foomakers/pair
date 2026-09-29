import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { resolveWorkflowProfile, type ResolvedWorkflowProfile } from './workflow-profile'

/**
 * US-488 T-5 — the `pair-cli run --card` entry resolves the workflow profile ONCE, prints its table
 * before the first dispatch, and fails closed. The resolver itself is `workflow-profile.mjs`
 * (covered against the real script in `workflow-profile.test.ts`); here it is injected so the
 * ENTRY's obligations — when it asks, with what, what it prints, when it refuses — are the subject.
 */

const cwd = '/project'

const files = (extra: Record<string, string> = {}, configExtra: Record<string, unknown> = {}) =>
  new InMemoryFileSystemService(
    {
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          skills: {
            source: '.skills',
            behavior: 'overwrite',
            description: 'skills',
            prefix: 'pair',
            targets: [{ path: '.claude/skills/', mode: 'canonical' }],
          },
        },
        ...configExtra,
      }),
      [`${cwd}/.claude/skills/pair-loop/SKILL.md`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
      '/bin/claude': '',
      '/bin/pi': '',
      ...extra,
    },
    cwd,
    cwd,
  )

const stage = (engine = 'default') => ({
  engine: { value: engine, source: 'stage' },
  model: { value: 'default', source: 'KB default', resolved: { id: null, line: 'engine default' } },
  effort: { value: 'default', source: 'KB default' },
  context: { value: 'fresh', source: 'KB default' },
})

const profileOf = (engine = 'default'): ResolvedWorkflowProfile => ({
  name: 'cheap-green',
  source: 'argument',
  sourceDetail: '/project/p.json',
  hash: 'f'.repeat(64),
  stages: { implement: stage(engine) },
  table: [
    'Profile: cheap-green (source: argument — /project/p.json) hash ffffffffffff',
    '  implement | TABLE-ROW',
  ],
  contextPolicy: {},
  notes: [],
})

const events: string[] = []
function capture(): () => string {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    const line = args.map(String).join(' ')
    lines.push(line)
    events.push(`print:${line.trim()}`)
  })
  return () => lines.join('\n')
}

const baseDeps = (overrides: Partial<RunHandlerDependencies> = {}): RunHandlerDependencies => ({
  acquireLock: ({ card }) => ({
    kind: 'acquired',
    lock: { path: `/locks/${card}`, release: () => {} },
  }),
  appendAudit: () => {},
  cardReadiness: async () => 'ready',
  driveCycle: async () => {
    events.push('drive')
    return { status: 'ready-for-merge', stagesRun: 1 }
  },
  ...overrides,
})

afterEach(() => {
  events.length = 0
  vi.restoreAllMocks()
})

const run = (
  argv: Parameters<typeof parseRunCommand>[0],
  fs: InMemoryFileSystemService,
  deps: RunHandlerDependencies,
) => handleRunCommand(parseRunCommand(argv), fs, deps)

describe('the profile at the run --card entry (US-488 T-5)', () => {
  it('AC9/AC2: no flag and no workflowProfiles block ⇒ the resolver is never asked; the KB default is reported in one line', async () => {
    const resolver = vi.fn()
    const output = capture()

    const code = await run(
      { card: '12', cardTags: '' },
      files(),
      baseDeps({ resolveWorkflowProfile: resolver }),
    )

    expect(code).toBe(0)
    expect(resolver).not.toHaveBeenCalled()
    expect(output().match(/Profile: KB default \(source: KB default\)/g)).toHaveLength(1)
  })

  it('AC2/AC6: --profile resolves once — with the card’s risk tier and the project root — and prints its table BEFORE the first dispatch', async () => {
    const resolver = vi.fn(() => profileOf())
    const output = capture()

    await run(
      { card: '12', cardTags: 'foo,risk:yellow', profile: 'cheap-green' },
      files(),
      baseDeps({ resolveWorkflowProfile: resolver }),
    )

    expect(resolver).toHaveBeenCalledTimes(1)
    expect(resolver).toHaveBeenCalledWith(`${cwd}/.claude/skills/pair-workflow-cycle/scripts`, {
      root: cwd,
      profile: 'cheap-green',
      workflowConfig: undefined,
      tier: 'risk:yellow',
    })
    expect(output().match(/TABLE-ROW/g)).toHaveLength(1)
    expect(events.findIndex(e => e.includes('TABLE-ROW'))).toBeLessThan(events.indexOf('drive'))
  })

  it('AC3: --workflow-config is passed through as given (the resolver makes it win)', async () => {
    const resolver = vi.fn(() => profileOf())
    capture()

    await run(
      { card: '12', cardTags: '', workflowConfig: '/tmp/mine.json' },
      files(),
      baseDeps({ resolveWorkflowProfile: resolver }),
    )

    expect(resolver).toHaveBeenCalledWith(expect.any(String), {
      root: cwd,
      profile: undefined,
      workflowConfig: '/tmp/mine.json',
      tier: undefined,
    })
  })

  it('AC2: a workflowProfiles block in the project config asks for a profile with no flag at all', async () => {
    const resolver = vi.fn(() => profileOf())
    capture()

    await run(
      { card: '12', cardTags: '' },
      files({}, { workflowProfiles: { default: 'cheap-green' } }),
      baseDeps({ resolveWorkflowProfile: resolver }),
    )

    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('AC8: a resolver HALT (profile-unresolved) stops the run before anything is printed or dispatched', async () => {
    const resolver = vi.fn(() => {
      throw new Error("profile-unresolved: profile 'nope' (argument) was not found")
    })
    const output = capture()

    await expect(
      run(
        { card: '12', cardTags: '', profile: 'nope' },
        files(),
        baseDeps({ resolveWorkflowProfile: resolver }),
      ),
    ).rejects.toThrow(/profile-unresolved: profile 'nope'/)

    expect(events).not.toContain('drive')
    expect(output()).not.toMatch(/Delivery cycle: runId/)
  })

  it('AC5: a stage engine outside the supported ids is profile-invalid at load, before dispatch', async () => {
    capture()

    await expect(
      run(
        { card: '12', cardTags: '', profile: 'cheap-green' },
        files(),
        baseDeps({ resolveWorkflowProfile: () => profileOf('gpt-99') }),
      ),
    ).rejects.toThrow(/profile-invalid: stages\.implement\.engine: unknown engine 'gpt-99'/)

    expect(events).not.toContain('drive')
  })

  it('a stage engine that is not installed halts before the first dispatch, naming it', async () => {
    capture()

    await expect(
      run(
        { card: '12', cardTags: '', profile: 'cheap-green' },
        files(),
        baseDeps({ resolveWorkflowProfile: () => profileOf('codex') }),
      ),
    ).rejects.toThrow(/Engine 'codex'/)

    expect(events).not.toContain('drive')
  })

  it('a profile flag on a card the mapping routes to a workflow (not the cycle) is refused, never silently ignored', async () => {
    capture()
    const fs = files({
      [`${cwd}/${POLICY_PATH}`]:
        '## Eligibility\n\nrisk:green\n\n## Workflows\n\nauto-dev ⇒ pair-loop\n',
    })

    await expect(
      run(
        { card: '12', cardTags: 'auto-dev,risk:green', profile: 'cheap-green' },
        fs,
        baseDeps({ resolveWorkflowProfile: () => profileOf() }),
      ),
    ).rejects.toThrow(/--profile.*delivery cycle/)
  })

  it('a profile flag on a Draft card (preparation skill route) is refused the same way', async () => {
    capture()

    await expect(
      run(
        { card: '12', cardTags: '', workflowConfig: '/tmp/x.json' },
        files(),
        baseDeps({ cardReadiness: async () => 'draft', resolveWorkflowProfile: () => profileOf() }),
      ),
    ).rejects.toThrow(/--workflow-config.*delivery cycle/)
  })

  // PR #517 finding: the entry wired to the REAL resolver (`workflow-profile.mjs`) refuses a mistyped
  // model class before the first dispatch — the driver is never called.
  const REAL_SCRIPTS = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    '.claude/skills/pair-workflow-cycle/scripts',
  )
  const withRealResolver = (body: Record<string, unknown>) => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-entry-profile-'))
    writeFileSync(join(dir, 'p.json'), JSON.stringify(body))
    const resolver: RunHandlerDependencies['resolveWorkflowProfile'] = (_scripts, request) =>
      resolveWorkflowProfile(REAL_SCRIPTS, { ...request, root: dir, workflowConfig: 'p.json' })
    return { dir, resolver }
  }

  it('PR517-W7: --workflow-config with a mistyped class (`frontir`) halts profile-invalid at the entry, naming stage, value and classes, and never drives', async () => {
    capture()
    const { dir, resolver } = withRealResolver({
      name: 'p',
      stages: { verify: { model: 'frontir' } },
    })
    let error: Error | undefined
    try {
      await run(
        { card: '12', cardTags: '', workflowConfig: '/tmp/p.json' },
        files(),
        baseDeps({ resolveWorkflowProfile: resolver }),
      )
    } catch (e) {
      error = e as Error
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }

    expect(events).not.toContain('drive')
    expect(error?.message).toMatch(/^profile-invalid: .*stages\.verify\.model.*'frontir'/)
    for (const c of ['cheap', 'balanced', 'frontier']) expect(error?.message).toContain(c)
  })

  it('PR517-C5: the same entry with a valid class and a literal id resolves through the real resolver and drives', async () => {
    capture()
    const { dir, resolver } = withRealResolver({
      name: 'p',
      modelClasses: { frontier: 'm-frontier' },
      stages: { verify: { model: 'frontier' }, green: { model: 'claude-sonnet-4-5' } },
    })
    try {
      const code = await run(
        { card: '12', cardTags: '', workflowConfig: '/tmp/p.json' },
        files(),
        baseDeps({ resolveWorkflowProfile: resolver }),
      )
      expect(code).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    expect(events).toContain('drive')
  })
})
