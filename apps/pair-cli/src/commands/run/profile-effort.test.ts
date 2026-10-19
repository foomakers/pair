import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { ENGINES } from './engines'
import { buildEngineArgs } from './spawn'
import { handleRunCommand, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import { buildCardProcessArgs } from './parallel'
import { markIgnoredEffort, type ResolvedWorkflowProfile } from './workflow-profile'

/** US-560: effort reaches the engine (AC1-3); --profile / --workflow-config reach --parallel children (AC4). */

const argsFor = (id: keyof typeof ENGINES, effort?: string) =>
  buildEngineArgs({
    engine: ENGINES[id],
    promptText: 'p',
    cwd: '/w',
    autonomyArgs: [],
    effort,
  })

describe('AC1/AC2: verified effort flags', () => {
  it('claude carries --effort <level>', () => {
    expect(argsFor('claude', 'xhigh')).toEqual(expect.arrayContaining(['--effort', 'xhigh']))
  })
  it.each([
    ['low', 'low'],
    ['medium', 'medium'],
    ['high', 'high'],
    ['xhigh', 'high'],
    ['max', 'high'],
  ])('codex %s -> -c model_reasoning_effort=%s', (level, mapped) => {
    expect(argsFor('codex', level)).toEqual(
      expect.arrayContaining(['-c', `model_reasoning_effort=${mapped}`]),
    )
  })
  it('no effort -> no flag', () => {
    expect(argsFor('claude')).not.toContain('--effort')
    expect(argsFor('codex').join(' ')).not.toContain('model_reasoning_effort')
  })
})

const stage = (effort: string, engine = 'default') => ({
  engine: { value: engine, source: 's' },
  model: { value: 'default', source: 'k', resolved: { id: null, line: 'x' } },
  effort: { value: effort, source: 's' },
  context: { value: 'fresh', source: 'k' },
})
const profile = (): ResolvedWorkflowProfile => ({
  name: 'p',
  source: 'argument',
  sourceDetail: '',
  hash: 'f'.repeat(64),
  stages: { implement: stage('high'), verify: stage('low', 'claude'), green: stage('default') },
  table: [
    'Profile: p',
    '  implement | engine default (s) | effort high (s) | context fresh (k)',
    '  verify    | engine claude (s) | effort low (s) | context fresh (k)',
    '  green     | engine default (k) | effort default (k) | context fresh (k)',
  ],
  contextPolicy: {},
  notes: [],
})

describe('AC3: unverified engines are named, never silently dropped', () => {
  it('marks only the ignored stages and warns once naming engine and effort', () => {
    const out = markIgnoredEffort(profile(), stageName =>
      stageName === 'verify' ? ENGINES.claude : ENGINES.pi,
    )
    expect(out.table[1]).toContain('effort high (s) ignored')
    expect(out.table[2]).not.toContain('ignored')
    expect(out.table[3]).not.toContain('ignored')
    expect(out.warning).toContain('pi')
    expect(out.warning).toContain('high')
    expect(out.warning).not.toContain('claude')
  })
  it('no warning when every effort is sent', () => {
    expect(markIgnoredEffort(profile(), () => ENGINES.claude).warning).toBeUndefined()
  })
})

describe('AC4: --profile / --workflow-config with --root/--parallel/--watch', () => {
  const cand = { id: '9', title: 't', branch: 'b', tier: 'risk:green', labels: [] }

  it('parser accepts them without --card', () => {
    expect(parseRunCommand({ root: '1', parallel: '2', profile: 'x' }).profile).toBe('x')
    expect(
      parseRunCommand({ root: '1', parallel: '2', watch: '5', workflowConfig: '/c.json' } as never)
        .workflowConfig,
    ).toBe('/c.json')
  })
  it('still refused with neither --card nor --parallel', () => {
    expect(() => parseRunCommand({ skill: 'pair-next', profile: 'x' })).toThrow(/--card/)
  })
  it('every child gets the same flag', () => {
    const config = parseRunCommand({ root: '1', parallel: '2', profile: 'x' })
    expect(buildCardProcessArgs(config, cand as never, '/p')).toEqual(
      expect.arrayContaining(['--profile', 'x']),
    )
    const wc = parseRunCommand({ root: '1', parallel: '2', workflowConfig: '/c.json' })
    expect(buildCardProcessArgs(wc, cand as never, '/p')).toEqual(
      expect.arrayContaining(['--workflow-config', '/c.json']),
    )
  })

  afterEach(() => vi.restoreAllMocks())

  it('unknown profile HALTs profile-unresolved before any child spawns', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const cwd = '/project'
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify({ asset_registries: {} }),
        [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
        '/bin/claude': '',
      },
      cwd,
      cwd,
    )
    const runCardProcess = vi.fn()
    const deps: RunHandlerDependencies = {
      selectCandidates: async () => [],
      runCardProcess,
      resolveWorkflowProfile: () => {
        throw new Error('profile-unresolved: nope')
      },
    }
    const prev = process.env['PATH']
    process.env['PATH'] = '/bin'
    try {
      await expect(
        handleRunCommand(
          parseRunCommand({ root: '1', parallel: '2', autonomous: true, profile: 'nope' }),
          fs,
          deps,
        ),
      ).rejects.toThrow(/profile-unresolved/)
    } finally {
      process.env['PATH'] = prev
    }
    expect(runCardProcess).not.toHaveBeenCalled()
  })
})
