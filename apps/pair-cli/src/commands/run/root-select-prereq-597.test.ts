import { describe, expect, it } from 'vitest'
import { ENGINES } from './engines'
import { buildSelectionPrompt } from './root-select'

/** US-597 AC1/AC3 (r1-g2, r0-2): selection prompt never asks the agent to judge prerequisite merge state. */
describe('buildSelectionPrompt prerequisites (US-597)', () => {
  const prompt = buildSelectionPrompt(ENGINES.claude, { root: '66' })

  it('does not ask the selection agent to check a prerequisite MERGED status on the code host', () => {
    expect(prompt).not.toMatch(/MERGED status|checked on the code host/i)
  })

  it('states prerequisites are resolved by the deterministic prereq-state script, agent claims ignored', () => {
    expect(prompt).toContain('prereq-state')
  })

  it('control: still reports the candidate marker and the declared Prerequisite Stories field', () => {
    expect(prompt).toContain('Prerequisite Stories')
    expect(prompt).toContain('PAIR-ROOT-CANDIDATES:')
  })
})
