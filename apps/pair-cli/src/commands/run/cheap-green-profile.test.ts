import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { ENGINES } from './engines'
import { buildEngineArgs } from './spawn'
import { resolveWorkflowProfile } from './workflow-profile'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const SCRIPTS = join(REPO_ROOT, '.claude', 'skills', 'pair-workflow-cycle', 'scripts')

describe('the cheap-green sample profile (pilot, not activated)', () => {
  const profile = resolveWorkflowProfile(SCRIPTS, {
    root: REPO_ROOT,
    workflowConfig: join(
      REPO_ROOT,
      '.pair',
      'adoption',
      'tech',
      'workflow-profiles',
      'cheap-green.json',
    ),
    tier: 'risk:yellow',
  })

  it('resolves and prints its stage table', () => {
    expect(profile.name).toBe('cheap-green')
    expect(profile.table.join('\n')).toContain('green     | engine claude')
    expect(profile.stages['green']?.model.resolved.id).toBe('claude-haiku-5-5')
    expect(profile.stages['verify']?.model.resolved.id).toBe('claude-opus-5-5')
  })

  it('the claude engine passes --model claude-haiku-5-5 for a cheap stage, and the frontier id for verify', () => {
    const argvFor = (stage: string) =>
      buildEngineArgs({
        engine: ENGINES.claude,
        promptText: 'p',
        cwd: '/project',
        autonomyArgs: [],
        model: profile.stages[stage]?.model.resolved.id ?? undefined,
      })
    const green = argvFor('green')
    expect(green.slice(green.indexOf('--model'), green.indexOf('--model') + 2)).toEqual([
      '--model',
      'claude-haiku-5-5',
    ])
    expect(argvFor('verify')).toContain('claude-opus-5-5')
  })
})
