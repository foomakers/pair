import { describe, it, expect } from 'vitest'
import { ENGINES } from './engines'
import { buildEngineArgs } from './spawn'
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
    ['xhigh', 'xhigh'],
    ['max', 'max'],
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

describe('effort argv is platform-independent', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    it(`same argv on platform ${platform}`, () => {
      const original = process.platform
      Object.defineProperty(process, 'platform', { value: platform })
      try {
        expect(argsFor('codex', 'max')).toEqual(
          expect.arrayContaining(['-c', 'model_reasoning_effort=max']),
        )
      } finally {
        Object.defineProperty(process, 'platform', { value: original })
      }
    })
  }
})
