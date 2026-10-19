import { describe, it, expect } from 'vitest'
import { parseRunCommand } from './parser'

/** US-560 AC5 (r0-1): the profile-flag refusal names every accepted entry, not a --card-only caveat. */
describe('profile flag refusal message', () => {
  it('--profile alone names --parallel', () => {
    expect(() => parseRunCommand({ skill: 'pair-next', profile: 'x' })).toThrow(/--parallel/)
  })
  it('--workflow-config alone names --root and --parallel', () => {
    expect(() => parseRunCommand({ skill: 'pair-next', workflowConfig: 'x.json' })).toThrow(
      /--root.*--parallel|--parallel.*--root/,
    )
  })
  it('control: --profile with --root --parallel does not throw', () => {
    expect(() =>
      parseRunCommand({ root: '66', parallel: '2', autonomous: true, profile: 'x' }),
    ).not.toThrow()
  })
})
