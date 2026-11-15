import { describe, it, expect } from 'vitest'
import { parseRunCommand } from './parser'

/** US-560 AC5 (r0-1): the profile-flag refusal names every accepted entry, not a --card-only caveat. */
describe('profile flags outside the cycle', () => {
  it('--profile applies to a skill', () => {
    expect(parseRunCommand({ skill: 'pair-next', profile: 'x' }).profile).toBe('x')
  })
  it('--workflow-config applies to a prompt', () => {
    expect(parseRunCommand({ prompt: 'go', workflowConfig: 'x.json' }).workflowConfig).toBe(
      'x.json',
    )
  })
  it('control: --profile with --root --parallel does not throw', () => {
    expect(() =>
      parseRunCommand({ root: '66', parallel: '2', autonomous: true, profile: 'x' }),
    ).not.toThrow()
  })
})
